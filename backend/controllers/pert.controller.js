// =====================================================
// Controlador de PERT / CPM
// Guarda proyectos y actividades en SQL Server y calcula con services/cpm.js
// =====================================================
const { sql, getPool } = require('../config/db');
const cpm = require('../services/cpm');

class ErrorValidacion extends Error {}
class ErrorNoEncontrado extends Error {}

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
  const id = /^\d+$/.test(String(req.params.id)) ? Number(req.params.id) : 0;
  if (!Number.isSafeInteger(id) || id <= 0) throw new ErrorValidacion('Id de proyecto inválido.');
  return id;
}

// Ejecuta un servicio y convierte sus errores en errores de validación (400)
function validando(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ErrorValidacion) throw err;
    throw new ErrorValidacion(err.message);
  }
}

// ---------- Fechas (días corridos) ----------
function leerFecha(valor, etiqueta) {
  if (valor === undefined || valor === null || valor === '') return null;
  const t = String(valor).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(t))) {
    throw new ErrorValidacion(`${etiqueta} debe tener el formato AAAA-MM-DD.`);
  }
  const d = new Date(`${t}T00:00:00Z`);
  if (d.toISOString().slice(0, 10) !== t) throw new ErrorValidacion(`${etiqueta} no es una fecha válida.`);
  return t;
}

function sumarDias(fechaIso, dias) {
  const d = new Date(`${fechaIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const aIso = (f) => (f ? new Date(f).toISOString().slice(0, 10) : null);

// ---------- Validación del cuerpo ----------
// { nombre, descripcion?, modo, fechaInicio?, actividades: [{ id, nombre?, duracion | optimista/masProbable/pesimista, predecesoras }] }
// La validación de la red (ciclos, predecesoras, tiempos) la hace analizarRed.
function validarProyecto(body) {
  if (!body || typeof body !== 'object') throw new ErrorValidacion('Cuerpo de la petición vacío.');
  const nombre = String(body.nombre ?? '').trim();
  if (!nombre || nombre.length > 150) throw new ErrorValidacion('El nombre es obligatorio (máximo 150 caracteres).');
  const descripcion = body.descripcion ? String(body.descripcion).trim() : null;
  if (descripcion && descripcion.length > 500) throw new ErrorValidacion('La descripción admite máximo 500 caracteres.');
  const modo = body.modo ?? 'cpm';
  const fechaInicio = leerFecha(body.fechaInicio, 'La fecha de inicio');
  const analisis = validando(() => cpm.analizarRed(body.actividades, modo));
  const actividades = validando(() => cpm.normalizarActividades(body.actividades, modo));
  return { nombre, descripcion, modo, fechaInicio, actividades, analisis };
}

// Agrega al análisis: fechas del calendario, probabilidad de un plazo y plazo de una probabilidad
function enriquecer(analisis, { fechaInicio, plazo, probabilidad } = {}) {
  const salida = { ...analisis };
  if (fechaInicio) {
    salida.fechaInicio = fechaInicio;
    salida.fechaFin = sumarDias(fechaInicio, Math.ceil(analisis.duracionProyecto));
    salida.actividades = analisis.actividades.map((a) => ({
      ...a,
      fechaInicioTemprano: sumarDias(fechaInicio, Math.floor(a.es)),
      fechaFinTemprano: sumarDias(fechaInicio, Math.ceil(a.ef)),
    }));
  }
  if (analisis.modo === 'pert') {
    if (plazo !== undefined && plazo !== null && plazo !== '') {
      salida.probabilidadPlazo = validando(() => cpm.probabilidadTerminar(analisis, plazo));
    }
    if (probabilidad !== undefined && probabilidad !== null && probabilidad !== '') {
      salida.plazoProbabilidad = validando(() => cpm.plazoParaProbabilidad(analisis, probabilidad));
    }
  }
  return salida;
}

// ---------- Acceso a datos ----------
async function guardarActividades(tx, idProyecto, actividades, avances = new Map()) {
  const ids = new Map();
  for (let i = 0; i < actividades.length; i++) {
    const a = actividades[i];
    const av = avances.get(a.id.toLowerCase()) || { avance: 0, inicio: null, fin: null };
    const r = await new sql.Request(tx)
      .input('p', sql.Int, idProyecto).input('c', sql.NVarChar(20), a.id)
      .input('n', sql.NVarChar(100), a.nombre || null)
      .input('d', sql.Decimal(10, 2), a.optimista === null ? a.duracion : null)
      .input('o', sql.Decimal(10, 2), a.optimista).input('m', sql.Decimal(10, 2), a.masProbable)
      .input('pe', sql.Decimal(10, 2), a.pesimista).input('ord', sql.Int, i)
      .input('av', sql.Decimal(5, 2), av.avance).input('ini', sql.Date, av.inicio).input('fin', sql.Date, av.fin)
      .query(`INSERT INTO dbo.Actividad_Pert (IdProyecto, Codigo, Nombre, Duracion, Optimista, MasProbable, Pesimista, Orden, AvanceReal, InicioReal, FinReal)
              OUTPUT INSERTED.IdActividad VALUES (@p, @c, @n, @d, @o, @m, @pe, @ord, @av, @ini, @fin)`);
    ids.set(a.id, r.recordset[0].IdActividad);
  }
  for (const a of actividades) {
    for (const pred of a.predecesoras) {
      await new sql.Request(tx).input('a', sql.Int, ids.get(a.id)).input('p', sql.Int, ids.get(pred))
        .query('INSERT INTO dbo.Precedencia (IdActividad, IdPredecesora) VALUES (@a, @p)');
    }
  }
}

async function cargarProyecto(pool, id) {
  const p = await pool.request().input('id', sql.Int, id).query('SELECT * FROM dbo.Proyecto WHERE IdProyecto = @id');
  if (!p.recordset.length) throw new ErrorNoEncontrado('Proyecto no encontrado.');
  const acts = await pool.request().input('id', sql.Int, id)
    .query('SELECT * FROM dbo.Actividad_Pert WHERE IdProyecto = @id ORDER BY Orden');
  const prec = await pool.request().input('id', sql.Int, id).query(`
    SELECT a.Codigo AS Actividad, p.Codigo AS Predecesora
    FROM dbo.Precedencia pr
    JOIN dbo.Actividad_Pert a ON a.IdActividad = pr.IdActividad
    JOIN dbo.Actividad_Pert p ON p.IdActividad = pr.IdPredecesora
    WHERE a.IdProyecto = @id`);
  const f = p.recordset[0];
  return {
    id: f.IdProyecto, nombre: f.Nombre, descripcion: f.Descripcion, modo: f.Modo, fechaInicio: aIso(f.FechaInicio),
    actividades: acts.recordset.map((a) => ({
      id: a.Codigo, nombre: a.Nombre || '',
      duracion: a.Duracion === null ? null : Number(a.Duracion),
      optimista: a.Optimista === null ? null : Number(a.Optimista),
      masProbable: a.MasProbable === null ? null : Number(a.MasProbable),
      pesimista: a.Pesimista === null ? null : Number(a.Pesimista),
      predecesoras: prec.recordset.filter((x) => x.Actividad === a.Codigo).map((x) => x.Predecesora),
      avanceReal: Number(a.AvanceReal), inicioReal: aIso(a.InicioReal), finReal: aIso(a.FinReal),
    })),
  };
}

// ================= ENDPOINTS =================
exports.listar = ruta(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT p.IdProyecto, p.Nombre, p.Descripcion, p.Modo, p.FechaInicio, p.FechaCreacion,
           (SELECT COUNT(*) FROM dbo.Actividad_Pert a WHERE a.IdProyecto = p.IdProyecto) AS Actividades
    FROM dbo.Proyecto p ORDER BY p.IdProyecto DESC`);
  res.json(r.recordset.map((f) => ({
    id: f.IdProyecto, nombre: f.Nombre, descripcion: f.Descripcion, modo: f.Modo,
    fechaInicio: aIso(f.FechaInicio), fechaCreacion: f.FechaCreacion, actividades: Number(f.Actividades),
  })));
});

// Calcula sin guardar (la pantalla lo usa mientras el usuario edita)
exports.calcular = ruta(async (req, res) => {
  const b = req.body;
  if (!b || typeof b !== 'object') throw new ErrorValidacion('Cuerpo de la petición vacío.');
  const modo = b.modo ?? 'cpm';
  const fechaInicio = leerFecha(b.fechaInicio, 'La fecha de inicio');
  const analisis = validando(() => cpm.analizarRed(b.actividades, modo));
  res.json(enriquecer(analisis, { fechaInicio, plazo: b.plazo, probabilidad: b.probabilidad }));
});

exports.crear = ruta(async (req, res) => {
  const d = validarProyecto(req.body);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const r = await new sql.Request(tx)
      .input('n', sql.NVarChar(150), d.nombre).input('d', sql.NVarChar(500), d.descripcion)
      .input('m', sql.VarChar(4), d.modo).input('f', sql.Date, d.fechaInicio)
      .query('INSERT INTO dbo.Proyecto (Nombre, Descripcion, Modo, FechaInicio) OUTPUT INSERTED.IdProyecto VALUES (@n, @d, @m, @f)');
    const id = r.recordset[0].IdProyecto;
    await guardarActividades(tx, id, d.actividades);
    await tx.commit();
    res.status(201).json({ ok: true, id });
  } catch (err) {
    try { await tx.rollback(); } catch (_) { /* ya cerrada */ }
    throw err;
  }
});

exports.obtener = ruta(async (req, res) => {
  const pool = await getPool();
  res.json(await cargarProyecto(pool, leerId(req)));
});

exports.analizarGuardado = ruta(async (req, res) => {
  const pool = await getPool();
  const proyecto = await cargarProyecto(pool, leerId(req));
  const analisis = validando(() => cpm.analizarRed(proyecto.actividades, proyecto.modo));
  const salida = enriquecer(analisis, { fechaInicio: proyecto.fechaInicio, plazo: req.query.plazo, probabilidad: req.query.probabilidad });
  salida.proyecto = { id: proyecto.id, nombre: proyecto.nombre, descripcion: proyecto.descripcion };
  salida.avances = Object.fromEntries(proyecto.actividades.map((a) => [a.id, { avanceReal: a.avanceReal, inicioReal: a.inicioReal, finReal: a.finReal }]));
  res.json(salida);
});

// Reemplaza el proyecto completo conservando el avance real de las actividades que siguen existiendo
exports.actualizar = ruta(async (req, res) => {
  const id = leerId(req);
  const d = validarProyecto(req.body);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const u = await new sql.Request(tx).input('id', sql.Int, id)
      .input('n', sql.NVarChar(150), d.nombre).input('d', sql.NVarChar(500), d.descripcion)
      .input('m', sql.VarChar(4), d.modo).input('f', sql.Date, d.fechaInicio)
      .query('UPDATE dbo.Proyecto SET Nombre=@n, Descripcion=@d, Modo=@m, FechaInicio=@f WHERE IdProyecto=@id');
    if (!u.rowsAffected[0]) throw new ErrorNoEncontrado('Proyecto no encontrado.');

    const previos = await new sql.Request(tx).input('id', sql.Int, id)
      .query('SELECT Codigo, AvanceReal, InicioReal, FinReal FROM dbo.Actividad_Pert WHERE IdProyecto = @id');
    const avances = new Map(previos.recordset.map((a) => [a.Codigo.toLowerCase(),
      { avance: Number(a.AvanceReal), inicio: a.InicioReal, fin: a.FinReal }]));

    await new sql.Request(tx).input('id', sql.Int, id).query(`
      DELETE pr FROM dbo.Precedencia pr JOIN dbo.Actividad_Pert a ON a.IdActividad = pr.IdActividad WHERE a.IdProyecto = @id;
      DELETE FROM dbo.Actividad_Pert WHERE IdProyecto = @id;`);
    await guardarActividades(tx, id, d.actividades, avances);
    await tx.commit();
    res.json({ ok: true, id });
  } catch (err) {
    try { await tx.rollback(); } catch (_) { /* ya cerrada */ }
    throw err;
  }
});

exports.eliminar = ruta(async (req, res) => {
  const id = leerId(req);
  const pool = await getPool();
  await pool.request().input('id', sql.Int, id).query(`
    DELETE pr FROM dbo.Precedencia pr JOIN dbo.Actividad_Pert a ON a.IdActividad = pr.IdActividad WHERE a.IdProyecto = @id`);
  const r = await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.Proyecto WHERE IdProyecto = @id');
  if (!r.rowsAffected[0]) throw new ErrorNoEncontrado('Proyecto no encontrado.');
  res.json({ ok: true });
});
