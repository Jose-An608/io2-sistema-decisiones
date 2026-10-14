// =====================================================
// Controlador de Inventarios
// Productos, proveedores, movimientos, órdenes, ABC, EOQ, revisión y alertas
// =====================================================
const { sql, getPool } = require('../config/db');
const { clasificarABC } = require('../services/abc');
const eoq = require('../services/eoq');
const revision = require('../services/revision');

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

function leerId(req, etiqueta = 'registro') {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorValidacion(`Id de ${etiqueta} inválido.`);
  return id;
}

// Convierte un error del servicio (Error normal) en error de validación
function validando(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ErrorValidacion) throw err;
    throw new ErrorValidacion(err.message);
  }
}

const texto = (v) => (v === undefined || v === null ? '' : String(v).trim());
const textoOpc = (v, max, etiqueta) => {
  const t = texto(v);
  if (t.length > max) throw new ErrorValidacion(`${etiqueta} admite máximo ${max} caracteres.`);
  return t || null;
};

// Fila de la tabla Producto -> parámetros del modelo
function aParametros(f) {
  return {
    demandaAnual: Number(f.DemandaAnual),
    costoPedido: Number(f.CostoPedido),
    costoUnitario: Number(f.CostoUnitario),
    tasaMantenimiento: Number(f.TasaMantenimiento),
    costoAlmacenamientoUnidad: Number(f.CostoAlmacenamiento),
    tiempoEntregaDias: Number(f.TiempoEntregaDias),
    desviacionDemandaDiaria: Number(f.DesviacionDemandaDiaria),
    nivelServicio: Number(f.NivelServicio),
    diasAnio: Number(f.DiasAnio),
  };
}

// Cuerpo de la petición (camelCase) -> parámetros del modelo, validados por el servicio
function parametrosDeCuerpo(b) {
  if (!b || typeof b !== 'object') throw new ErrorValidacion('Cuerpo de la petición vacío.');
  const num = (v, def) => (v === undefined || v === null || v === '' ? def : Number(v));
  const p = {
    demandaAnual: Number(b.demandaAnual),
    costoPedido: num(b.costoPedido, 0),
    costoUnitario: num(b.costoUnitario, 0),
    tasaMantenimiento: num(b.tasaMantenimiento, 0),
    costoAlmacenamientoUnidad: num(b.costoAlmacenamientoUnidad, 0),
    tiempoEntregaDias: num(b.tiempoEntregaDias, 0),
    desviacionDemandaDiaria: num(b.desviacionDemandaDiaria, 0),
    nivelServicio: num(b.nivelServicio, 0.95),
    diasAnio: num(b.diasAnio, 365),
  };
  if (b.costoMantenimientoUnidad !== undefined && b.costoMantenimientoUnidad !== null && b.costoMantenimientoUnidad !== '') {
    p.costoMantenimientoUnidad = Number(b.costoMantenimientoUnidad);
  }
  validando(() => eoq.analizarProducto(p));
  return p;
}

// ---------- Consultas compartidas ----------
const SQL_PRODUCTOS = `
  SELECT p.*, pr.Nombre AS Proveedor,
         ISNULL(m.Stock, 0) AS Stock, ISNULL(o.EnOrden, 0) AS EnOrden
  FROM dbo.Producto p
  LEFT JOIN dbo.Proveedor pr ON pr.IdProveedor = p.IdProveedor
  LEFT JOIN (SELECT IdProducto, SUM(CASE Tipo WHEN 'salida' THEN -Cantidad ELSE Cantidad END) AS Stock
             FROM dbo.MovimientoStock GROUP BY IdProducto) m ON m.IdProducto = p.IdProducto
  LEFT JOIN (SELECT IdProducto, SUM(Cantidad) AS EnOrden
             FROM dbo.OrdenPedido WHERE Estado = 'pendiente' GROUP BY IdProducto) o ON o.IdProducto = p.IdProducto`;

function formatoProducto(f) {
  return {
    id: f.IdProducto, codigo: f.Codigo, nombre: f.Nombre,
    idProveedor: f.IdProveedor, proveedor: f.Proveedor || null,
    ...aParametros(f),
    stock: Number(f.Stock), enOrden: Number(f.EnOrden),
  };
}

async function cargarProductos(pool, id = null) {
  const rq = pool.request();
  let consulta = SQL_PRODUCTOS;
  if (id !== null) { rq.input('id', sql.Int, id); consulta += ' WHERE p.IdProducto = @id'; }
  consulta += ' ORDER BY p.Codigo';
  return (await rq.query(consulta)).recordset.map(formatoProducto);
}

async function obtenerProducto(pool, id) {
  const [p] = await cargarProductos(pool, id);
  if (!p) throw new ErrorNoEncontrado('Producto no encontrado.');
  return p;
}

// Alerta de un producto ya cargado (con stock y en camino)
function alertaDe(p) {
  const a = eoq.analizarProducto(p);
  const alerta = eoq.evaluarAlerta({
    stockActual: p.stock, puntoPedido: a.puntoPedido, stockSeguridad: a.stockSeguridad,
    demandaDiaria: a.demandaDiaria, tiempoEntregaDias: p.tiempoEntregaDias,
    enOrden: p.enOrden, cantidadEconomica: a.cantidadEconomica,
  });
  return { analisis: a, alerta };
}

// Análisis completo a partir de parámetros (sirve para guardados y para "calcular")
function analisisCompleto(p, query = {}) {
  const analisis = eoq.analizarProducto(p);
  const dias = Math.min(Math.max(Number.parseInt(query.dias, 10) || 120, 10), 730);
  const diasRevision = query.diasRevision !== undefined && query.diasRevision !== '' ? Number(query.diasRevision) : undefined;
  const base = diasRevision ? { ...p, diasRevision } : p;
  return {
    parametros: p,
    eoq: analisis,
    curvaCostos: eoq.curvaCostos(p),
    dienteSierra: eoq.simularDienteSierra({
      cantidadPedido: analisis.cantidadEconomica, puntoPedido: analisis.puntoPedido,
      demandaDiaria: analisis.demandaDiaria, tiempoEntregaDias: p.tiempoEntregaDias,
      stockInicial: analisis.inventarioMaximo, dias,
    }),
    revisionContinua: revision.revisionContinua(p),
    revisionPeriodica: revision.revisionPeriodica(base),
    comparacion: revision.compararPoliticas(base),
  };
}

// ================= PROVEEDORES =================
function validarProveedor(b) {
  if (!b || typeof b !== 'object') throw new ErrorValidacion('Cuerpo de la petición vacío.');
  const nombre = texto(b.nombre);
  if (!nombre || nombre.length > 120) throw new ErrorValidacion('El nombre del proveedor es obligatorio (máximo 120 caracteres).');
  const email = textoOpc(b.email, 120, 'El email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorValidacion('El email no es válido.');
  return { nombre, contacto: textoOpc(b.contacto, 120, 'El contacto'), telefono: textoOpc(b.telefono, 30, 'El teléfono'), email };
}

const fmtProveedor = (f) => ({
  id: f.IdProveedor, nombre: f.Nombre, contacto: f.Contacto, telefono: f.Telefono, email: f.Email,
  productos: f.Productos === undefined ? undefined : Number(f.Productos),
});

const esDuplicado = (err) => err && (err.number === 2627 || err.number === 2601);

exports.listarProveedores = ruta(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT v.*, (SELECT COUNT(*) FROM dbo.Producto p WHERE p.IdProveedor = v.IdProveedor) AS Productos
    FROM dbo.Proveedor v ORDER BY v.Nombre`);
  res.json(r.recordset.map(fmtProveedor));
});

exports.crearProveedor = ruta(async (req, res) => {
  const d = validarProveedor(req.body);
  const pool = await getPool();
  try {
    const r = await pool.request()
      .input('n', sql.NVarChar(120), d.nombre).input('c', sql.NVarChar(120), d.contacto)
      .input('t', sql.NVarChar(30), d.telefono).input('e', sql.NVarChar(120), d.email)
      .query('INSERT INTO dbo.Proveedor (Nombre, Contacto, Telefono, Email) OUTPUT INSERTED.IdProveedor VALUES (@n, @c, @t, @e)');
    res.status(201).json({ ok: true, id: r.recordset[0].IdProveedor });
  } catch (err) {
    if (esDuplicado(err)) throw new ErrorValidacion('Ya existe un proveedor con ese nombre.');
    throw err;
  }
});

exports.actualizarProveedor = ruta(async (req, res) => {
  const id = leerId(req, 'proveedor');
  const d = validarProveedor(req.body);
  const pool = await getPool();
  try {
    const r = await pool.request().input('id', sql.Int, id)
      .input('n', sql.NVarChar(120), d.nombre).input('c', sql.NVarChar(120), d.contacto)
      .input('t', sql.NVarChar(30), d.telefono).input('e', sql.NVarChar(120), d.email)
      .query('UPDATE dbo.Proveedor SET Nombre=@n, Contacto=@c, Telefono=@t, Email=@e WHERE IdProveedor=@id');
    if (!r.rowsAffected[0]) throw new ErrorNoEncontrado('Proveedor no encontrado.');
    res.json({ ok: true, id });
  } catch (err) {
    if (esDuplicado(err)) throw new ErrorValidacion('Ya existe un proveedor con ese nombre.');
    throw err;
  }
});

exports.eliminarProveedor = ruta(async (req, res) => {
  const id = leerId(req, 'proveedor');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.Proveedor WHERE IdProveedor=@id');
  if (!r.rowsAffected[0]) throw new ErrorNoEncontrado('Proveedor no encontrado.');
  res.json({ ok: true });
});

// ================= PRODUCTOS =================
function validarProducto(b) {
  const parametros = parametrosDeCuerpo(b);
  const codigo = texto(b.codigo);
  const nombre = texto(b.nombre);
  if (!codigo || codigo.length > 30) throw new ErrorValidacion('El código es obligatorio (máximo 30 caracteres).');
  if (!nombre || nombre.length > 150) throw new ErrorValidacion('El nombre es obligatorio (máximo 150 caracteres).');
  let idProveedor = null;
  if (b.idProveedor !== undefined && b.idProveedor !== null && b.idProveedor !== '') {
    idProveedor = Number(b.idProveedor);
    if (!Number.isInteger(idProveedor) || idProveedor <= 0) throw new ErrorValidacion('Proveedor inválido.');
  }
  return { codigo, nombre, idProveedor, parametros };
}

function entradasProducto(rq, d) {
  const p = d.parametros;
  return rq
    .input('cod', sql.NVarChar(30), d.codigo).input('nom', sql.NVarChar(150), d.nombre)
    .input('prov', sql.Int, d.idProveedor)
    .input('D', sql.Decimal(14, 2), p.demandaAnual).input('S', sql.Decimal(12, 2), p.costoPedido)
    .input('c', sql.Decimal(12, 2), p.costoUnitario).input('i', sql.Decimal(6, 4), p.tasaMantenimiento)
    .input('a', sql.Decimal(12, 4), p.costoAlmacenamientoUnidad).input('L', sql.Decimal(8, 2), p.tiempoEntregaDias)
    .input('sd', sql.Decimal(12, 4), p.desviacionDemandaDiaria).input('ns', sql.Decimal(6, 4), p.nivelServicio)
    .input('dias', sql.Int, p.diasAnio);
}

function errorProducto(err) {
  if (esDuplicado(err)) return new ErrorValidacion('Ya existe un producto con ese código.');
  if (err && err.number === 547) return new ErrorValidacion('El proveedor indicado no existe.');
  return err;
}

exports.listarProductos = ruta(async (req, res) => {
  const pool = await getPool();
  const productos = await cargarProductos(pool);
  res.json(productos.map((p) => ({ ...p, estado: alertaDe(p).alerta.estado })));
});

exports.obtenerProducto = ruta(async (req, res) => {
  const pool = await getPool();
  res.json(await obtenerProducto(pool, leerId(req, 'producto')));
});

exports.crearProducto = ruta(async (req, res) => {
  const d = validarProducto(req.body);
  const pool = await getPool();
  try {
    const r = await entradasProducto(pool.request(), d).query(`
      INSERT INTO dbo.Producto (Codigo, Nombre, IdProveedor, DemandaAnual, CostoPedido, CostoUnitario, TasaMantenimiento,
        CostoAlmacenamiento, TiempoEntregaDias, DesviacionDemandaDiaria, NivelServicio, DiasAnio)
      OUTPUT INSERTED.IdProducto
      VALUES (@cod, @nom, @prov, @D, @S, @c, @i, @a, @L, @sd, @ns, @dias)`);
    res.status(201).json({ ok: true, id: r.recordset[0].IdProducto });
  } catch (err) { throw errorProducto(err); }
});

exports.actualizarProducto = ruta(async (req, res) => {
  const id = leerId(req, 'producto');
  const d = validarProducto(req.body);
  const pool = await getPool();
  try {
    const r = await entradasProducto(pool.request().input('id', sql.Int, id), d).query(`
      UPDATE dbo.Producto SET Codigo=@cod, Nombre=@nom, IdProveedor=@prov, DemandaAnual=@D, CostoPedido=@S,
        CostoUnitario=@c, TasaMantenimiento=@i, CostoAlmacenamiento=@a, TiempoEntregaDias=@L,
        DesviacionDemandaDiaria=@sd, NivelServicio=@ns, DiasAnio=@dias
      WHERE IdProducto=@id`);
    if (!r.rowsAffected[0]) throw new ErrorNoEncontrado('Producto no encontrado.');
    res.json({ ok: true, id });
  } catch (err) { throw errorProducto(err); }
});

exports.eliminarProducto = ruta(async (req, res) => {
  const id = leerId(req, 'producto');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.Producto WHERE IdProducto=@id');
  if (!r.rowsAffected[0]) throw new ErrorNoEncontrado('Producto no encontrado.');
  res.json({ ok: true });
});

// ================= ANÁLISIS =================
// Calcula sin guardar (la pantalla lo usa mientras el usuario escribe)
exports.calcular = ruta(async (req, res) => {
  const p = parametrosDeCuerpo(req.body);
  const out = analisisCompleto(p, req.query);
  const b = req.body || {};
  if (b.stockActual !== undefined && b.stockActual !== null && b.stockActual !== '') {
    const stock = Number(b.stockActual);
    if (!Number.isFinite(stock) || stock < 0) throw new ErrorValidacion('El stock actual debe ser un número mayor o igual que 0.');
    out.alerta = eoq.evaluarAlerta({
      stockActual: stock, puntoPedido: out.eoq.puntoPedido, stockSeguridad: out.eoq.stockSeguridad,
      demandaDiaria: out.eoq.demandaDiaria, tiempoEntregaDias: p.tiempoEntregaDias,
      enOrden: Number(b.enOrden) || 0, cantidadEconomica: out.eoq.cantidadEconomica,
    });
  }
  res.json(out);
});

exports.analizarGuardado = ruta(async (req, res) => {
  const pool = await getPool();
  const producto = await obtenerProducto(pool, leerId(req, 'producto'));
  const { parametros } = { parametros: aParametros({
    DemandaAnual: producto.demandaAnual, CostoPedido: producto.costoPedido, CostoUnitario: producto.costoUnitario,
    TasaMantenimiento: producto.tasaMantenimiento, CostoAlmacenamiento: producto.costoAlmacenamientoUnidad,
    TiempoEntregaDias: producto.tiempoEntregaDias, DesviacionDemandaDiaria: producto.desviacionDemandaDiaria,
    NivelServicio: producto.nivelServicio, DiasAnio: producto.diasAnio }) };
  const out = analisisCompleto(parametros, req.query);
  out.producto = { id: producto.id, codigo: producto.codigo, nombre: producto.nombre, proveedor: producto.proveedor, stock: producto.stock, enOrden: producto.enOrden };
  out.alerta = alertaDe(producto).alerta;
  res.json(out);
});

exports.abc = ruta(async (req, res) => {
  const corteA = req.query.corteA !== undefined ? Number(req.query.corteA) : 80;
  const corteB = req.query.corteB !== undefined ? Number(req.query.corteB) : 95;
  const pool = await getPool();
  const productos = await cargarProductos(pool);
  if (productos.length === 0) throw new ErrorValidacion('No hay productos registrados para clasificar.');
  res.json(validando(() => clasificarABC(
    productos.map((p) => ({ id: p.id, nombre: `${p.codigo} - ${p.nombre}`, demandaAnual: p.demandaAnual, costoUnitario: p.costoUnitario })),
    { corteA, corteB },
  )));
});

// Alertas de stock y desabastecimiento de todos los productos
exports.alertas = ruta(async (req, res) => {
  const pool = await getPool();
  const productos = await cargarProductos(pool);
  const orden = { agotado: 0, riesgo: 1, pedir: 2, en_camino: 3, ok: 4 };
  const filas = productos.map((p) => {
    const { analisis, alerta } = alertaDe(p);
    return {
      id: p.id, codigo: p.codigo, nombre: p.nombre, proveedor: p.proveedor,
      stock: p.stock, enOrden: p.enOrden, puntoPedido: analisis.puntoPedido,
      stockSeguridad: analisis.stockSeguridad, ...alerta,
    };
  }).sort((a, b) => orden[a.estado] - orden[b.estado] || a.nombre.localeCompare(b.nombre));
  const resumen = { agotado: 0, riesgo: 0, pedir: 0, en_camino: 0, ok: 0 };
  filas.forEach((f) => { resumen[f.estado] += 1; });
  res.json({ resumen, productos: filas });
});

// ================= MOVIMIENTOS =================
const TIPOS_MOV = ['entrada', 'salida', 'ajuste'];

exports.listarMovimientos = ruta(async (req, res) => {
  const pool = await getPool();
  const rq = pool.request();
  let filtro = '';
  if (req.query.idProducto !== undefined) {
    const idp = Number.parseInt(req.query.idProducto, 10);
    if (!Number.isInteger(idp) || idp <= 0) throw new ErrorValidacion('Id de producto inválido.');
    rq.input('idp', sql.Int, idp);
    filtro = 'WHERE m.IdProducto = @idp';
  }
  const r = await rq.query(`
    SELECT TOP 200 m.*, p.Codigo, p.Nombre FROM dbo.MovimientoStock m
    JOIN dbo.Producto p ON p.IdProducto = m.IdProducto ${filtro}
    ORDER BY m.Fecha DESC, m.IdMovimiento DESC`);
  res.json(r.recordset.map((f) => ({
    id: f.IdMovimiento, idProducto: f.IdProducto, codigo: f.Codigo, producto: f.Nombre,
    tipo: f.Tipo, cantidad: Number(f.Cantidad), fecha: f.Fecha, nota: f.Nota,
  })));
});

exports.crearMovimiento = ruta(async (req, res) => {
  const b = req.body;
  if (!b || typeof b !== 'object') throw new ErrorValidacion('Cuerpo de la petición vacío.');
  const idProducto = Number.parseInt(b.idProducto, 10);
  if (!Number.isInteger(idProducto) || idProducto <= 0) throw new ErrorValidacion('Selecciona un producto.');
  if (!TIPOS_MOV.includes(b.tipo)) throw new ErrorValidacion('El tipo debe ser entrada, salida o ajuste.');
  const cantidad = Number(b.cantidad);
  if (!Number.isFinite(cantidad) || cantidad === 0) throw new ErrorValidacion('La cantidad debe ser un número distinto de 0.');
  if (b.tipo !== 'ajuste' && cantidad < 0) throw new ErrorValidacion('En entradas y salidas la cantidad debe ser positiva.');
  const nota = textoOpc(b.nota, 200, 'La nota');

  const pool = await getPool();
  const producto = await obtenerProducto(pool, idProducto);
  const delta = b.tipo === 'salida' ? -cantidad : cantidad;
  if (producto.stock + delta < 0) {
    throw new ErrorValidacion(`Stock insuficiente: hay ${producto.stock} unidades y el movimiento dejaría el inventario en negativo.`);
  }
  const r = await pool.request().input('p', sql.Int, idProducto).input('t', sql.VarChar(10), b.tipo)
    .input('c', sql.Decimal(14, 2), cantidad).input('n', sql.NVarChar(200), nota)
    .query('INSERT INTO dbo.MovimientoStock (IdProducto, Tipo, Cantidad, Nota) OUTPUT INSERTED.IdMovimiento VALUES (@p, @t, @c, @n)');
  res.status(201).json({ ok: true, id: r.recordset[0].IdMovimiento, stock: producto.stock + delta });
});

exports.eliminarMovimiento = ruta(async (req, res) => {
  const id = leerId(req, 'movimiento');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.MovimientoStock WHERE IdMovimiento=@id');
  if (!r.rowsAffected[0]) throw new ErrorNoEncontrado('Movimiento no encontrado.');
  res.json({ ok: true });
});

// ================= ÓRDENES DE PEDIDO =================
exports.listarOrdenes = ruta(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT TOP 200 o.*, p.Codigo, p.Nombre FROM dbo.OrdenPedido o
    JOIN dbo.Producto p ON p.IdProducto = o.IdProducto
    ORDER BY CASE o.Estado WHEN 'pendiente' THEN 0 ELSE 1 END, o.FechaPedido DESC`);
  res.json(r.recordset.map((f) => ({
    id: f.IdOrden, idProducto: f.IdProducto, codigo: f.Codigo, producto: f.Nombre,
    cantidad: Number(f.Cantidad), estado: f.Estado, fechaPedido: f.FechaPedido, fechaRecepcion: f.FechaRecepcion,
  })));
});

exports.crearOrden = ruta(async (req, res) => {
  const b = req.body;
  if (!b || typeof b !== 'object') throw new ErrorValidacion('Cuerpo de la petición vacío.');
  const idProducto = Number.parseInt(b.idProducto, 10);
  if (!Number.isInteger(idProducto) || idProducto <= 0) throw new ErrorValidacion('Selecciona un producto.');
  const cantidad = Number(b.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new ErrorValidacion('La cantidad del pedido debe ser mayor que 0.');
  const pool = await getPool();
  await obtenerProducto(pool, idProducto);
  const r = await pool.request().input('p', sql.Int, idProducto).input('c', sql.Decimal(14, 2), cantidad)
    .query('INSERT INTO dbo.OrdenPedido (IdProducto, Cantidad) OUTPUT INSERTED.IdOrden VALUES (@p, @c)');
  res.status(201).json({ ok: true, id: r.recordset[0].IdOrden });
});

// Recibir una orden = marcarla recibida y registrar la entrada de stock (en una transacción)
exports.recibirOrden = ruta(async (req, res) => {
  const id = leerId(req, 'orden');
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const o = await new sql.Request(tx).input('id', sql.Int, id)
      .query('SELECT IdProducto, Cantidad, Estado FROM dbo.OrdenPedido WITH (UPDLOCK) WHERE IdOrden=@id');
    if (!o.recordset.length) throw new ErrorNoEncontrado('Orden no encontrada.');
    const orden = o.recordset[0];
    if (orden.Estado !== 'pendiente') throw new ErrorValidacion('Esa orden ya fue recibida.');
    await new sql.Request(tx).input('id', sql.Int, id)
      .query('UPDATE dbo.OrdenPedido SET Estado=\'recibida\', FechaRecepcion=SYSDATETIME() WHERE IdOrden=@id');
    await new sql.Request(tx).input('p', sql.Int, orden.IdProducto).input('c', sql.Decimal(14, 2), orden.Cantidad)
      .input('n', sql.NVarChar(200), `Recepción de la orden #${id}`)
      .query('INSERT INTO dbo.MovimientoStock (IdProducto, Tipo, Cantidad, Nota) VALUES (@p, \'entrada\', @c, @n)');
    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    try { await tx.rollback(); } catch (_) { /* ya cerrada */ }
    throw err;
  }
});

exports.eliminarOrden = ruta(async (req, res) => {
  const id = leerId(req, 'orden');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id)
    .query('DELETE FROM dbo.OrdenPedido WHERE IdOrden=@id AND Estado=\'pendiente\'');
  if (!r.rowsAffected[0]) throw new ErrorNoEncontrado('Orden pendiente no encontrada.');
  res.json({ ok: true });
});
