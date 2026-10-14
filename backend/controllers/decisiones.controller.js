// =====================================================
// Controlador de Teoría de decisiones
// Recibe peticiones, valida, guarda en SQL Server y llama a criterios.js
// =====================================================
const { sql, getPool } = require('../config/db');
const criterios = require('../services/criterios');
const arbolDecision = require('../services/arbolDecision');

class ErrorValidacion extends Error {}
class ErrorNoEncontrado extends Error {}

// ---------- Utilidades ----------

// Envuelve cada handler para responder errores con el código HTTP correcto
const ruta = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const codigo = err instanceof ErrorValidacion ? 400 : err instanceof ErrorNoEncontrado ? 404 : 500;
    if (codigo === 500) console.error(err);
    res.status(codigo).json({ ok: false, error: err.message });
  }
};

function leerId(req) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorValidacion('Id de decisión inválido.');
  return id;
}

// Valida y normaliza el cuerpo de la petición.
// Formato: { nombre, descripcion?, tipo, alfa?, alternativas: [texto],
//            estados: [{ nombre, probabilidad? }], matriz: [[número]] }
function validarPayload(body) {
  try {
    if (!body || typeof body !== 'object') throw new Error('Cuerpo de la petición vacío.');

    const nombre = String(body.nombre ?? '').trim();
    if (!nombre || nombre.length > 150) throw new Error('El nombre es obligatorio (máximo 150 caracteres).');

    const descripcion = body.descripcion ? String(body.descripcion).trim() : null;
    if (descripcion && descripcion.length > 500) throw new Error('La descripción admite máximo 500 caracteres.');

    const tipo = body.tipo ?? 'beneficio';
    criterios.validarTipo(tipo);

    const alfa = body.alfa === undefined || body.alfa === null ? 0.5 : body.alfa;
    if (typeof alfa !== 'number' || !(alfa >= 0 && alfa <= 1)) throw new Error('Alfa debe ser un número entre 0 y 1.');

    // Nombres únicos y no vacíos
    const limpiarNombres = (lista, etiqueta) => {
      if (!Array.isArray(lista) || lista.length === 0) throw new Error(`Debe haber al menos un ${etiqueta}.`);
      const nombres = lista.map((n) => String(n ?? '').trim());
      if (nombres.some((n) => !n || n.length > 100)) throw new Error(`Cada ${etiqueta} necesita un nombre (máximo 100 caracteres).`);
      const unicos = new Set(nombres.map((n) => n.toLowerCase()));
      if (unicos.size !== nombres.length) throw new Error(`Hay ${etiqueta}s con el mismo nombre.`);
      return nombres;
    };

    const alternativas = limpiarNombres(body.alternativas, 'alternativa');
    const nombresEstados = limpiarNombres((body.estados || []).map((e) => e && e.nombre), 'estado');

    // Probabilidades: o todas o ninguna
    const probs = body.estados.map((e) => e.probabilidad);
    const conProb = probs.filter((p) => p !== undefined && p !== null && p !== '').length;
    let probabilidades = null;
    if (conProb > 0) {
      if (conProb !== probs.length) throw new Error('Indica la probabilidad de todos los estados o de ninguno.');
      probabilidades = probs.map(Number);
      criterios.validarProbabilidades(probabilidades, probs.length);
    }

    criterios.validarMatriz(body.matriz);
    if (body.matriz.length !== alternativas.length || body.matriz[0].length !== nombresEstados.length) {
      throw new Error('La matriz debe tener una fila por alternativa y una columna por estado.');
    }

    return {
      nombre, descripcion, tipo, alfa, alternativas,
      estados: nombresEstados.map((n, j) => ({ nombre: n, probabilidad: probabilidades ? probabilidades[j] : null })),
      matriz: body.matriz,
    };
  } catch (err) {
    if (err instanceof ErrorValidacion) throw err;
    throw new ErrorValidacion(err.message);
  }
}

// Ejecuta los criterios con los datos ya validados
function ejecutarAnalisis(datos) {
  const probabilidades = datos.estados.every((e) => e.probabilidad !== null)
    ? datos.estados.map((e) => e.probabilidad)
    : undefined;
  return criterios.analizar({
    matriz: datos.matriz,
    alternativas: datos.alternativas,
    tipo: datos.tipo,
    alfa: datos.alfa,
    probabilidades,
  });
}

// ---------- Acceso a la base de datos ----------

// Inserta alternativas, estados y pagos de una decisión (dentro de una transacción)
async function insertarDetalle(tx, idDecision, d) {
  const idsAlt = [];
  for (let i = 0; i < d.alternativas.length; i++) {
    const r = await new sql.Request(tx)
      .input('id', sql.Int, idDecision)
      .input('nombre', sql.NVarChar(100), d.alternativas[i])
      .input('orden', sql.Int, i)
      .query('INSERT INTO dbo.Alternativa (IdDecision, Nombre, Orden) OUTPUT INSERTED.IdAlternativa VALUES (@id, @nombre, @orden)');
    idsAlt.push(r.recordset[0].IdAlternativa);
  }
  const idsEst = [];
  for (let j = 0; j < d.estados.length; j++) {
    const r = await new sql.Request(tx)
      .input('id', sql.Int, idDecision)
      .input('nombre', sql.NVarChar(100), d.estados[j].nombre)
      .input('prob', sql.Decimal(9, 8), d.estados[j].probabilidad)
      .input('orden', sql.Int, j)
      .query('INSERT INTO dbo.EstadoNaturaleza (IdDecision, Nombre, Probabilidad, Orden) OUTPUT INSERTED.IdEstado VALUES (@id, @nombre, @prob, @orden)');
    idsEst.push(r.recordset[0].IdEstado);
  }
  for (let i = 0; i < idsAlt.length; i++) {
    for (let j = 0; j < idsEst.length; j++) {
      await new sql.Request(tx)
        .input('a', sql.Int, idsAlt[i])
        .input('e', sql.Int, idsEst[j])
        .input('v', sql.Decimal(18, 4), d.matriz[i][j])
        .query('INSERT INTO dbo.Pago (IdAlternativa, IdEstado, Valor) VALUES (@a, @e, @v)');
    }
  }
}

// Borra alternativas, estados y pagos de una decisión
async function borrarDetalle(tx, idDecision) {
  const q = (texto) => new sql.Request(tx).input('id', sql.Int, idDecision).query(texto);
  await q('DELETE p FROM dbo.Pago p JOIN dbo.Alternativa a ON a.IdAlternativa = p.IdAlternativa WHERE a.IdDecision = @id');
  await q('DELETE FROM dbo.Alternativa WHERE IdDecision = @id');
  await q('DELETE FROM dbo.EstadoNaturaleza WHERE IdDecision = @id');
}

// Lee una decisión completa y reconstruye su matriz
async function cargarDecision(id) {
  const pool = await getPool();
  const pedir = (texto) => pool.request().input('id', sql.Int, id).query(texto);

  const cab = await pedir('SELECT IdDecision, Nombre, Descripcion, Tipo, Alfa, FechaCreacion FROM dbo.Decision WHERE IdDecision = @id');
  if (cab.recordset.length === 0) throw new ErrorNoEncontrado('No existe la decisión solicitada.');
  const alt = await pedir('SELECT IdAlternativa, Nombre FROM dbo.Alternativa WHERE IdDecision = @id ORDER BY Orden');
  const est = await pedir('SELECT IdEstado, Nombre, Probabilidad FROM dbo.EstadoNaturaleza WHERE IdDecision = @id ORDER BY Orden');
  const pag = await pedir(
    `SELECT p.IdAlternativa, p.IdEstado, p.Valor FROM dbo.Pago p
     JOIN dbo.Alternativa a ON a.IdAlternativa = p.IdAlternativa WHERE a.IdDecision = @id`);

  const filaDe = new Map(alt.recordset.map((a, i) => [a.IdAlternativa, i]));
  const colDe = new Map(est.recordset.map((e, j) => [e.IdEstado, j]));
  const matriz = alt.recordset.map(() => est.recordset.map(() => 0));
  pag.recordset.forEach((p) => { matriz[filaDe.get(p.IdAlternativa)][colDe.get(p.IdEstado)] = Number(p.Valor); });

  const c = cab.recordset[0];
  return {
    id: c.IdDecision,
    nombre: c.Nombre,
    descripcion: c.Descripcion,
    tipo: c.Tipo,
    alfa: Number(c.Alfa),
    fechaCreacion: c.FechaCreacion,
    alternativas: alt.recordset.map((a) => a.Nombre),
    estados: est.recordset.map((e) => ({ nombre: e.Nombre, probabilidad: e.Probabilidad === null ? null : Number(e.Probabilidad) })),
    matriz,
  };
}

// ---------- Handlers ----------

const listar = ruta(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(
    `SELECT d.IdDecision, d.Nombre, d.Tipo, d.FechaCreacion,
            (SELECT COUNT(*) FROM dbo.Alternativa WHERE IdDecision = d.IdDecision) AS NumAlternativas,
            (SELECT COUNT(*) FROM dbo.EstadoNaturaleza WHERE IdDecision = d.IdDecision) AS NumEstados
     FROM dbo.Decision d ORDER BY d.FechaCreacion DESC, d.IdDecision DESC`);
  res.json(r.recordset.map((x) => ({
    id: x.IdDecision, nombre: x.Nombre, tipo: x.Tipo, fechaCreacion: x.FechaCreacion,
    numAlternativas: x.NumAlternativas, numEstados: x.NumEstados,
  })));
});

const obtener = ruta(async (req, res) => {
  res.json(await cargarDecision(leerId(req)));
});

const crear = ruta(async (req, res) => {
  const d = validarPayload(req.body);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const r = await new sql.Request(tx)
      .input('nombre', sql.NVarChar(150), d.nombre)
      .input('desc', sql.NVarChar(500), d.descripcion)
      .input('tipo', sql.VarChar(10), d.tipo)
      .input('alfa', sql.Decimal(5, 4), d.alfa)
      .query('INSERT INTO dbo.Decision (Nombre, Descripcion, Tipo, Alfa) OUTPUT INSERTED.IdDecision VALUES (@nombre, @desc, @tipo, @alfa)');
    const id = r.recordset[0].IdDecision;
    await insertarDetalle(tx, id, d);
    await tx.commit();
    res.status(201).json({ ok: true, id });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
});

// Reemplaza por completo una decisión existente
const actualizar = ruta(async (req, res) => {
  const id = leerId(req);
  const d = validarPayload(req.body);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const r = await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar(150), d.nombre)
      .input('desc', sql.NVarChar(500), d.descripcion)
      .input('tipo', sql.VarChar(10), d.tipo)
      .input('alfa', sql.Decimal(5, 4), d.alfa)
      .query('UPDATE dbo.Decision SET Nombre = @nombre, Descripcion = @desc, Tipo = @tipo, Alfa = @alfa WHERE IdDecision = @id');
    if (r.rowsAffected[0] === 0) throw new ErrorNoEncontrado('No existe la decisión solicitada.');
    await borrarDetalle(tx, id);
    await insertarDetalle(tx, id, d);
    await tx.commit();
    res.json({ ok: true, id });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
});

const eliminar = ruta(async (req, res) => {
  const id = leerId(req);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await borrarDetalle(tx, id);
    const r = await new sql.Request(tx).input('id', sql.Int, id).query('DELETE FROM dbo.Decision WHERE IdDecision = @id');
    if (r.rowsAffected[0] === 0) throw new ErrorNoEncontrado('No existe la decisión solicitada.');
    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
});

// Analiza una decisión ya guardada
const analizarGuardada = ruta(async (req, res) => {
  const d = await cargarDecision(leerId(req));
  res.json({ decision: d, analisis: ejecutarAnalisis(d) });
});

// Calcula sin guardar (para ver resultados mientras se edita la matriz)
const calcular = ruta(async (req, res) => {
  res.json(ejecutarAnalisis(validarPayload(req.body)));
});

// ---------- Árboles de decisión ----------

// Valida el cuerpo de la petición de un árbol: { nombre, descripcion?, tipo, arbol }
function validarPayloadArbol(body) {
  try {
    if (!body || typeof body !== 'object') throw new Error('Cuerpo de la petición vacío.');
    const nombre = String(body.nombre ?? '').trim();
    if (!nombre || nombre.length > 150) throw new Error('El nombre es obligatorio (máximo 150 caracteres).');
    const descripcion = body.descripcion ? String(body.descripcion).trim() : null;
    if (descripcion && descripcion.length > 500) throw new Error('La descripción admite máximo 500 caracteres.');
    const tipo = body.tipo ?? 'beneficio';
    criterios.validarTipo(tipo);
    return { nombre, descripcion, tipo, arbol: arbolDecision.normalizarArbol(body.arbol) };
  } catch (err) {
    if (err instanceof ErrorValidacion) throw err;
    throw new ErrorValidacion(err.message);
  }
}

// Inserta un nodo y, recursivamente, sus hijos (dentro de una transacción)
async function insertarNodo(tx, idArbol, nodo, idPadre, rama, orden) {
  const r = await new sql.Request(tx)
    .input('arbol', sql.Int, idArbol)
    .input('padre', sql.Int, idPadre)
    .input('tipo', sql.VarChar(10), nodo.tipo)
    .input('etiqueta', sql.NVarChar(100), nodo.etiqueta)
    .input('pago', sql.Decimal(18, 4), nodo.tipo === 'terminal' ? nodo.pago : null)
    .input('etRama', sql.NVarChar(100), rama ? rama.etiqueta : null)
    .input('valRama', sql.Decimal(18, 4), rama ? rama.valorRama : 0)
    .input('prob', sql.Decimal(9, 8), rama && rama.probabilidad !== null ? rama.probabilidad : null)
    .input('orden', sql.Int, orden)
    .query(`INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
            OUTPUT INSERTED.IdNodo
            VALUES (@arbol, @padre, @tipo, @etiqueta, @pago, @etRama, @valRama, @prob, @orden)`);
  const id = r.recordset[0].IdNodo;
  for (let i = 0; i < nodo.ramas.length; i++) {
    await insertarNodo(tx, idArbol, nodo.ramas[i].nodo, id, nodo.ramas[i], i);
  }
  return id;
}

// Lee un árbol y reconstruye su estructura anidada desde las filas planas
async function cargarArbol(id) {
  const pool = await getPool();
  const pedir = (texto) => pool.request().input('id', sql.Int, id).query(texto);
  const cab = await pedir('SELECT IdArbol, Nombre, Descripcion, Tipo, FechaCreacion FROM dbo.ArbolDecision WHERE IdArbol = @id');
  if (cab.recordset.length === 0) throw new ErrorNoEncontrado('No existe el árbol solicitado.');
  const filas = await pedir(
    `SELECT IdNodo, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad
     FROM dbo.NodoArbol WHERE IdArbol = @id ORDER BY Orden, IdNodo`);

  const porId = new Map();
  filas.recordset.forEach((f) => {
    const n = { tipo: f.Tipo, etiqueta: f.Etiqueta, ramas: [] };
    if (f.Tipo === 'terminal') n.pago = Number(f.Pago);
    porId.set(f.IdNodo, n);
  });
  let raiz = null;
  filas.recordset.forEach((f) => {
    const n = porId.get(f.IdNodo);
    if (f.IdPadre === null) { raiz = n; return; }
    porId.get(f.IdPadre).ramas.push({
      etiqueta: f.EtiquetaRama,
      valorRama: Number(f.ValorRama),
      probabilidad: f.Probabilidad === null ? null : Number(f.Probabilidad),
      nodo: n,
    });
  });
  if (!raiz) throw new Error('El árbol guardado no tiene nodo raíz.');

  const c = cab.recordset[0];
  return {
    id: c.IdArbol, nombre: c.Nombre, descripcion: c.Descripcion,
    tipo: c.Tipo, fechaCreacion: c.FechaCreacion, arbol: raiz,
  };
}

const listarArboles = ruta(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(
    `SELECT a.IdArbol, a.Nombre, a.Tipo, a.FechaCreacion,
            (SELECT COUNT(*) FROM dbo.NodoArbol WHERE IdArbol = a.IdArbol) AS NumNodos
     FROM dbo.ArbolDecision a ORDER BY a.FechaCreacion DESC, a.IdArbol DESC`);
  res.json(r.recordset.map((x) => ({
    id: x.IdArbol, nombre: x.Nombre, tipo: x.Tipo, fechaCreacion: x.FechaCreacion, numNodos: x.NumNodos,
  })));
});

const obtenerArbol = ruta(async (req, res) => {
  res.json(await cargarArbol(leerId(req)));
});

// Evalúa un árbol sin guardarlo
const calcularArbol = ruta(async (req, res) => {
  const b = req.body && typeof req.body === 'object' ? { ...req.body, nombre: req.body.nombre || 'Sin título' } : req.body;
  const d = validarPayloadArbol(b);
  res.json(arbolDecision.evaluarArbol(d.arbol, d.tipo));
});

// Árbol de ejemplo resuelto a mano (para cargarlo en el editor)
const ejemploArbol = ruta(async (req, res) => {
  res.json({
    nombre: 'Ejemplo: estudio de mercado (Thompson Lumber)',
    descripcion: '¿Conviene pagar 10 000 por un estudio de mercado antes de elegir el tamaño de la planta?',
    tipo: 'beneficio',
    arbol: arbolDecision.ejemploThompson(),
  });
});

const crearArbol = ruta(async (req, res) => {
  const d = validarPayloadArbol(req.body);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const r = await new sql.Request(tx)
      .input('nombre', sql.NVarChar(150), d.nombre)
      .input('desc', sql.NVarChar(500), d.descripcion)
      .input('tipo', sql.VarChar(10), d.tipo)
      .query('INSERT INTO dbo.ArbolDecision (Nombre, Descripcion, Tipo) OUTPUT INSERTED.IdArbol VALUES (@nombre, @desc, @tipo)');
    const id = r.recordset[0].IdArbol;
    await insertarNodo(tx, id, d.arbol, null, null, 0);
    await tx.commit();
    res.status(201).json({ ok: true, id });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
});

const actualizarArbol = ruta(async (req, res) => {
  const id = leerId(req);
  const d = validarPayloadArbol(req.body);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const r = await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar(150), d.nombre)
      .input('desc', sql.NVarChar(500), d.descripcion)
      .input('tipo', sql.VarChar(10), d.tipo)
      .query('UPDATE dbo.ArbolDecision SET Nombre = @nombre, Descripcion = @desc, Tipo = @tipo WHERE IdArbol = @id');
    if (r.rowsAffected[0] === 0) throw new ErrorNoEncontrado('No existe el árbol solicitado.');
    await new sql.Request(tx).input('id', sql.Int, id).query('DELETE FROM dbo.NodoArbol WHERE IdArbol = @id');
    await insertarNodo(tx, id, d.arbol, null, null, 0);
    await tx.commit();
    res.json({ ok: true, id });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
});

const eliminarArbol = ruta(async (req, res) => {
  const id = leerId(req);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).input('id', sql.Int, id).query('DELETE FROM dbo.NodoArbol WHERE IdArbol = @id');
    const r = await new sql.Request(tx).input('id', sql.Int, id).query('DELETE FROM dbo.ArbolDecision WHERE IdArbol = @id');
    if (r.rowsAffected[0] === 0) throw new ErrorNoEncontrado('No existe el árbol solicitado.');
    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
});

module.exports = {
  listar, obtener, crear, actualizar, eliminar, analizarGuardada, calcular,
  listarArboles, obtenerArbol, calcularArbol, ejemploArbol, crearArbol, actualizarArbol, eliminarArbol,
};
