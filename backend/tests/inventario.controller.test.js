// =====================================================
// Pruebas del controlador de inventarios (sin SQL Server)
// La "base de datos" es un simulador que responde según el texto de la consulta.
// =====================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const tipo = () => 'tipo';
const filas = {
  productos: [{
    IdProducto: 1, Codigo: 'P-1', Nombre: 'Producto uno', IdProveedor: null, Proveedor: null,
    DemandaAnual: 1000, CostoPedido: 10, CostoUnitario: 20, TasaMantenimiento: 0.1, CostoAlmacenamiento: 0.5,
    TiempoEntregaDias: 5, DesviacionDemandaDiaria: 1.5, NivelServicio: 0.95, DiasAnio: 365, Stock: 15, EnOrden: 0,
  }],
};
let dbDisponible = true;
const rutaDb = path.resolve(__dirname, '../config/db.js');
function request() {
  const entradas = {};
  const rq = {
    input(nombre, t, v) { entradas[nombre] = v; return rq; },
    async query(q) {
      if (/FROM dbo\.Producto p/.test(q)) {
        return { recordset: filas.productos.filter((p) => entradas.id === undefined || p.IdProducto === entradas.id) };
      }
      return { recordset: [], rowsAffected: [0] };
    },
  };
  return rq;
}
require.cache[rutaDb] = {
  id: rutaDb, filename: rutaDb, loaded: true,
  exports: {
    sql: { Int: tipo, NVarChar: tipo, VarChar: tipo, Decimal: tipo, Transaction: class {}, Request: class {} },
    getPool: async () => {
      if (!dbDisponible) throw new Error('sin conexión a la base de datos');
      return { request };
    },
  },
};
const c = require('../controllers/inventario.controller');

function nuevaRespuesta() {
  return { codigo: 200, cuerpo: null, status(n) { this.codigo = n; return this; }, json(b) { this.cuerpo = b; return this; } };
}
async function llamar(handler, req = {}) {
  const res = nuevaRespuesta();
  await handler({ body: {}, params: {}, query: {}, ...req }, res);
  return res;
}
const datos = {
  demandaAnual: 1000, costoPedido: 10, costoUnitario: 20, tasaMantenimiento: 0.1,
  costoAlmacenamientoUnidad: 0.5, tiempoEntregaDias: 5, desviacionDemandaDiaria: 1.5, nivelServicio: 0.95,
};

test('calcular: análisis completo sin base de datos', async () => {
  dbDisponible = false;   // calcular no debe necesitar la base de datos
  const r = await llamar(c.calcular, { body: datos });
  dbDisponible = true;
  assert.equal(r.codigo, 200);
  assert.ok(Math.abs(r.cuerpo.eoq.cantidadEconomica - 89.4427) < 1e-3);
  assert.ok(Math.abs(r.cuerpo.eoq.puntoPedido - 19.2156) < 1e-3);
  assert.ok(r.cuerpo.curvaCostos.puntos.length > 5);
  assert.ok(r.cuerpo.dienteSierra.length > 10);
  assert.ok(r.cuerpo.revisionContinua && r.cuerpo.revisionPeriodica && r.cuerpo.comparacion);
});

test('calcular: con stock actual devuelve la alerta', async () => {
  const r = await llamar(c.calcular, { body: { ...datos, stockActual: 15 } });
  assert.equal(r.cuerpo.alerta.estado, 'pedir');
  const r2 = await llamar(c.calcular, { body: { ...datos, stockActual: 0 } });
  assert.equal(r2.cuerpo.alerta.estado, 'agotado');
  const r3 = await llamar(c.calcular, { body: { ...datos, stockActual: -3 } });
  assert.equal(r3.codigo, 400);
});

test('calcular: parámetros inválidos -> 400', async () => {
  for (const mala of [{ ...datos, demandaAnual: 0 }, { ...datos, nivelServicio: 1.5 }, { ...datos, costoPedido: -1 }, null]) {
    const r = await llamar(c.calcular, { body: mala });
    assert.equal(r.codigo, 400, JSON.stringify(mala));
    assert.equal(r.cuerpo.ok, false);
  }
});

test('crear producto: valida antes de tocar la base de datos', async () => {
  const sinCodigo = await llamar(c.crearProducto, { body: { ...datos, nombre: 'X' } });
  assert.equal(sinCodigo.codigo, 400);
  assert.match(sinCodigo.cuerpo.error, /código/);
  const sinNombre = await llamar(c.crearProducto, { body: { ...datos, codigo: 'X' } });
  assert.match(sinNombre.cuerpo.error, /nombre/);
  const malProv = await llamar(c.crearProducto, { body: { ...datos, codigo: 'X', nombre: 'X', idProveedor: -2 } });
  assert.match(malProv.cuerpo.error, /Proveedor/);
});

test('movimientos: validaciones', async () => {
  const mov = (b) => llamar(c.crearMovimiento, { body: b });
  assert.equal((await mov({ tipo: 'entrada', cantidad: 5 })).codigo, 400);                       // sin producto
  assert.equal((await mov({ idProducto: 1, tipo: 'robo', cantidad: 5 })).codigo, 400);           // tipo malo
  assert.equal((await mov({ idProducto: 1, tipo: 'entrada', cantidad: 0 })).codigo, 400);        // cero
  assert.equal((await mov({ idProducto: 1, tipo: 'salida', cantidad: -2 })).codigo, 400);        // negativa
});

test('movimientos: una salida no puede dejar el stock negativo', async () => {
  const r = await llamar(c.crearMovimiento, { body: { idProducto: 1, tipo: 'salida', cantidad: 16 } });
  assert.equal(r.codigo, 400);
  assert.match(r.cuerpo.error, /Stock insuficiente/);
});

test('productos: lista con estado de alerta y stock calculado', async () => {
  const r = await llamar(c.listarProductos);
  assert.equal(r.cuerpo[0].estado, 'pedir');
  assert.equal(r.cuerpo[0].stock, 15);
});

test('alertas: resumen por estado', async () => {
  const r = await llamar(c.alertas);
  assert.equal(r.cuerpo.resumen.pedir, 1);
  assert.equal(r.cuerpo.productos[0].codigo, 'P-1');
});

test('abc: con un solo producto es clase A; cortes inválidos -> 400', async () => {
  const ok = await llamar(c.abc);
  assert.equal(ok.cuerpo.productos[0].clase, 'A');
  const mal = await llamar(c.abc, { query: { corteA: '95', corteB: '80' } });
  assert.equal(mal.codigo, 400);
});

test('ids inválidos -> 400 y no encontrado -> 404', async () => {
  assert.equal((await llamar(c.obtenerProducto, { params: { id: 'abc' } })).codigo, 400);
  assert.equal((await llamar(c.eliminarProducto, { params: { id: '0' } })).codigo, 400);
  assert.equal((await llamar(c.eliminarProducto, { params: { id: '99' } })).codigo, 404);
  assert.equal((await llamar(c.eliminarMovimiento, { params: { id: '99' } })).codigo, 404);
});

test('proveedores: validaciones', async () => {
  assert.equal((await llamar(c.crearProveedor, { body: { nombre: '' } })).codigo, 400);
  const mail = await llamar(c.crearProveedor, { body: { nombre: 'A', email: 'no-es-correo' } });
  assert.match(mail.cuerpo.error, /email/);
});

test('error de base de datos -> 500', async () => {
  dbDisponible = false;
  const r = await llamar(c.listarProductos);
  assert.equal(r.codigo, 500);
  assert.equal(r.cuerpo.ok, false);
  dbDisponible = true;
});
