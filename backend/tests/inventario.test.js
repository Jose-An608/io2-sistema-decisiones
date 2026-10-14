// =====================================================
// Pruebas de inventarios (abc.js, eoq.js, revision.js)
// Todos los valores esperados se resolvieron a mano con las fórmulas del modelo.
// =====================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { clasificarABC } = require('../services/abc');
const eoq = require('../services/eoq');
const rev = require('../services/revision');

const casi = (real, esperado, tol = 1e-3) =>
  assert.ok(Math.abs(real - esperado) <= tol, `se esperaba ${esperado} y se obtuvo ${real}`);

// ---------------------------------------------------------
// ABC - valores anuales 50 000, 20 000, 10 000, 8 000, 7 000, 5 000 (total 100 000)
// Acumulado: 50, 70, 80, 88, 95, 100  ->  A: P1,P2,P3 | B: P4,P5 | C: P6
// ---------------------------------------------------------
const productosABC = [
  { nombre: 'P6', demandaAnual: 250, costoUnitario: 20 },   //  5 000
  { nombre: 'P1', demandaAnual: 1000, costoUnitario: 50 },  // 50 000
  { nombre: 'P3', demandaAnual: 500, costoUnitario: 20 },   // 10 000
  { nombre: 'P2', demandaAnual: 800, costoUnitario: 25 },   // 20 000
  { nombre: 'P5', demandaAnual: 700, costoUnitario: 10 },   //  7 000
  { nombre: 'P4', demandaAnual: 400, costoUnitario: 20 },   //  8 000
];

test('ABC: ordena por valor y asigna clases con cortes 80/95', () => {
  const r = clasificarABC(productosABC);
  assert.deepEqual(r.productos.map((p) => p.nombre), ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  assert.deepEqual(r.productos.map((p) => p.clase), ['A', 'A', 'A', 'B', 'B', 'C']);
  casi(r.valorTotal, 100000, 1e-6);
  casi(r.productos[0].porcentaje, 50, 1e-9);
  casi(r.productos[2].porcentajeAcumulado, 80, 1e-9);
  casi(r.productos[4].porcentajeAcumulado, 95, 1e-9);
});

test('ABC: resumen por clase', () => {
  const r = clasificarABC(productosABC);
  const [A, B, C] = r.resumen;
  assert.equal(A.cantidad, 3); casi(A.porcentajeProductos, 50, 1e-9); casi(A.porcentajeValor, 80, 1e-9);
  assert.equal(B.cantidad, 2); casi(B.porcentajeProductos, 100 / 3, 1e-9); casi(B.porcentajeValor, 15, 1e-9);
  assert.equal(C.cantidad, 1); casi(C.porcentajeProductos, 100 / 6, 1e-9); casi(C.porcentajeValor, 5, 1e-9);
});

test('ABC: cortes configurables (70/90)', () => {
  const r = clasificarABC(productosABC, { corteA: 70, corteB: 90 });
  assert.deepEqual(r.productos.map((p) => p.clase), ['A', 'A', 'B', 'B', 'C', 'C']);
});

test('ABC: el primer producto siempre es A aunque supere el corte', () => {
  const r = clasificarABC([{ nombre: 'X', demandaAnual: 100, costoUnitario: 100 }, { nombre: 'Y', demandaAnual: 1, costoUnitario: 1 }]);
  assert.equal(r.productos[0].clase, 'A');
});

test('ABC: validaciones', () => {
  assert.throws(() => clasificarABC([]), /al menos un producto/);
  assert.throws(() => clasificarABC(productosABC, { corteA: 95, corteB: 80 }), /cortes/);
  assert.throws(() => clasificarABC([{ nombre: 'X', demandaAnual: -1, costoUnitario: 5 }]), /demanda anual/);
  assert.throws(() => clasificarABC([{ nombre: 'X', demandaAnual: 0, costoUnitario: 5 }]), /valor anual total es 0/);
});

// ---------------------------------------------------------
// Distribución normal: valores de tabla
// ---------------------------------------------------------
test('z del nivel de servicio coincide con la tabla normal', () => {
  casi(eoq.zDeNivelServicio(0.90), 1.2816, 1e-4);
  casi(eoq.zDeNivelServicio(0.95), 1.6449, 1e-4);
  casi(eoq.zDeNivelServicio(0.975), 1.9600, 1e-4);
  casi(eoq.zDeNivelServicio(0.99), 2.3263, 1e-4);
  casi(eoq.zDeNivelServicio(0.5), 0, 1e-9);
  assert.throws(() => eoq.zDeNivelServicio(1), /entre 0 y 1/);
});

// ---------------------------------------------------------
// EOQ - D=1000, S=10, c=20, i=10 %, almacenamiento 0.5  ->  H = 2 + 0.5 = 2.5
//  Q = sqrt(2*1000*10/2.5) = sqrt(8000) = 89.4427   N = 11.1803   T = 365/N = 32.6466 días
//  Pedido = 11.1803*10 = 111.803   Mantenimiento = 89.4427/2*2.5 = 111.803
//  Total = 20 000 + 111.803 + 111.803 = 20 223.607
//  d = 1000/365 = 2.7397   dL = 13.6986 (L = 5)   sigma_L = 1.5*sqrt(5) = 3.3541
//  SS = 1.6449*3.3541 = 5.5170   ROP = 13.6986 + 5.5170 = 19.2156
// ---------------------------------------------------------
const prod1 = {
  demandaAnual: 1000, costoPedido: 10, costoUnitario: 20,
  tasaMantenimiento: 0.10, costoAlmacenamientoUnidad: 0.5,
  tiempoEntregaDias: 5, desviacionDemandaDiaria: 1.5, nivelServicio: 0.95,
};

test('EOQ: cantidad económica, pedidos y tiempo entre pedidos', () => {
  const r = eoq.analizarProducto(prod1);
  casi(r.costoMantenimientoUnidad, 2.5, 1e-9);
  casi(r.costoCapitalUnidad, 2, 1e-9);
  casi(r.costoAlmacenamientoUnidad, 0.5, 1e-9);
  casi(r.cantidadEconomica, 89.4427);
  assert.equal(r.lotePractico, 89);
  casi(r.pedidosPorAnio, 11.1803);
  casi(r.diasEntrePedidos, 32.6466);
});

test('EOQ: costos anuales (en el óptimo pedido = mantenimiento)', () => {
  const r = eoq.analizarProducto(prod1);
  casi(r.costoPedidoAnual, 111.803);
  casi(r.costoMantenimientoAnual, 111.803);
  casi(r.costoPedidoAnual, r.costoMantenimientoAnual, 1e-9);
  casi(r.costoMantenimientoCapitalAnual, 89.4427);
  casi(r.costoMantenimientoAlmacenAnual, 22.3607);
  casi(r.costoCompraAnual, 20000, 1e-9);
  casi(r.costoTotalAnual, 20223.607);
});

test('EOQ: stock de seguridad y punto de pedido', () => {
  const r = eoq.analizarProducto(prod1);
  casi(r.demandaDiaria, 2.7397);
  casi(r.demandaTiempoEntrega, 13.6986);
  casi(r.desviacionTiempoEntrega, 3.3541);
  casi(r.z, 1.6449, 1e-4);
  casi(r.stockSeguridad, 5.5170);
  casi(r.puntoPedido, 19.2156);
  casi(r.probabilidadFaltante, 0.05, 1e-9);
});

test('EOQ: sin variabilidad de la demanda el stock de seguridad es 0', () => {
  const r = eoq.analizarProducto({ ...prod1, desviacionDemandaDiaria: 0 });
  casi(r.stockSeguridad, 0, 1e-12);
  casi(r.puntoPedido, r.demandaTiempoEntrega, 1e-9);
});

// D=1800, S=25, H=1 (directo) -> Q = sqrt(90000) = 300 exacto, N = 6, costo variable = 150 + 150
test('EOQ: mantenimiento directo (Q exacto = 300)', () => {
  const r = eoq.analizarProducto({ demandaAnual: 1800, costoPedido: 25, costoMantenimientoUnidad: 1 });
  casi(r.cantidadEconomica, 300, 1e-9);
  casi(r.pedidosPorAnio, 6, 1e-9);
  casi(r.diasEntrePedidos, 365 / 6, 1e-9);
  casi(r.costoPedidoAnual, 150, 1e-9);
  casi(r.costoMantenimientoAnual, 150, 1e-9);
  casi(r.costoMantenimientoCapitalAnual, 0, 1e-9);
});

test('EOQ: curva de costos (en 2Q* el costo es 1.25 veces el mínimo)', () => {
  const c = eoq.curvaCostos({ demandaAnual: 1800, costoPedido: 25, costoMantenimientoUnidad: 1 }, { puntos: 10, factorMin: 1, factorMax: 2 });
  casi(c.costoMinimo, 300, 1e-9);
  casi(c.puntos[0].cantidad, 300, 1e-9);
  casi(c.puntos[0].costoTotal, 300, 1e-9);
  casi(c.puntos[9].cantidad, 600, 1e-9);
  casi(c.puntos[9].costoPedido, 75, 1e-9);
  casi(c.puntos[9].costoMantenimiento, 300, 1e-9);
  casi(c.puntos[9].costoTotal, 375, 1e-9);
});

test('EOQ: validaciones', () => {
  assert.throws(() => eoq.analizarProducto({ ...prod1, demandaAnual: 0 }), /demanda anual debe ser mayor que 0/);
  assert.throws(() => eoq.analizarProducto({ ...prod1, costoPedido: -5 }), /costo de pedido/);
  assert.throws(() => eoq.analizarProducto({ ...prod1, nivelServicio: 1 }), /nivel de servicio/);
  assert.throws(() => eoq.analizarProducto({ ...prod1, tasaMantenimiento: 0, costoAlmacenamientoUnidad: 0 }), /mantenimiento por unidad/);
  assert.throws(() => eoq.analizarProducto({ ...prod1, demandaAnual: 'mil' }), /debe ser un número/);
});

// ---------------------------------------------------------
// Diente de sierra - Q=100, d=10/día, ROP=20, L=2, stock inicial 100
//  Días 1..8: 90,80,...,20 -> en el día 8 se pide (20 <= 20)
//  Día 9: 10    Día 10: llega el pedido: 10 + 100 - 10 = 100
// ---------------------------------------------------------
test('Diente de sierra: simulación determinista', () => {
  const s = eoq.simularDienteSierra({ cantidadPedido: 100, puntoPedido: 20, demandaDiaria: 10, tiempoEntregaDias: 2, stockInicial: 100, dias: 12 });
  assert.equal(s[0].stock, 100);
  assert.equal(s[8].stock, 20);
  assert.equal(s[8].pedido, true);
  assert.equal(s[9].stock, 10);
  assert.equal(s[10].stock, 100);
  assert.equal(s[10].llegada, true);
  assert.ok(s.every((x) => x.faltante === 0), 'no debe haber faltantes');
  assert.equal(s.filter((x) => x.pedido).length >= 1, true);
});

test('Diente de sierra: sin stock de seguridad ni margen aparece faltante', () => {
  // ROP menor que la demanda durante la entrega (10*3 = 30) -> se agota
  const s = eoq.simularDienteSierra({ cantidadPedido: 100, puntoPedido: 10, demandaDiaria: 10, tiempoEntregaDias: 3, stockInicial: 100, dias: 20 });
  assert.ok(s.some((x) => x.faltante > 0));
});

// ---------------------------------------------------------
// Alertas (producto 1: d = 2.7397, L = 5, ROP = 19.2156, SS = 5.517)
// ---------------------------------------------------------
test('Alertas: agotado, riesgo, pedir, ok y en camino', () => {
  const a = eoq.analizarProducto(prod1);
  const base = { puntoPedido: a.puntoPedido, stockSeguridad: a.stockSeguridad, demandaDiaria: a.demandaDiaria, tiempoEntregaDias: 5, cantidadEconomica: a.cantidadEconomica };
  assert.equal(eoq.evaluarAlerta({ ...base, stockActual: 0 }).estado, 'agotado');
  const riesgo = eoq.evaluarAlerta({ ...base, stockActual: 10 });
  assert.equal(riesgo.estado, 'riesgo');                  // 10 < 13.70 = demanda en la entrega
  casi(riesgo.diasCobertura, 10 / 2.7397, 1e-3);
  assert.equal(eoq.evaluarAlerta({ ...base, stockActual: 3 }).bajoSeguridad, true);
  const pedir = eoq.evaluarAlerta({ ...base, stockActual: 15 });
  assert.equal(pedir.estado, 'pedir');                    // 13.70 <= 15 <= 19.22
  casi(pedir.cantidadSugerida, 89.4427);
  const ok = eoq.evaluarAlerta({ ...base, stockActual: 50 });
  assert.equal(ok.estado, 'ok');
  assert.equal(ok.cantidadSugerida, null);
  assert.equal(eoq.evaluarAlerta({ ...base, stockActual: 10, enOrden: 100 }).estado, 'en_camino');
});

// ---------------------------------------------------------
// Revisión continua - D=3650, S=50, c=10, i=20 %  ->  H = 2
//  Q = sqrt(2*3650*50/2) = 427.2002   d = 10   L = 5   sigma_d = 2
//  SS = 1.6449*2*sqrt(5) = 7.3560   R = 50 + 7.3560 = 57.3560
//  Pedido = (3650/427.2002)*50 = 427.200   Mant. = (213.6001 + 7.3560)*2 = 441.912
//  Total = 36 500 + 427.200 + 441.912 = 37 369.112
// ---------------------------------------------------------
const prod2 = {
  demandaAnual: 3650, costoPedido: 50, costoUnitario: 10, tasaMantenimiento: 0.2,
  tiempoEntregaDias: 5, desviacionDemandaDiaria: 2, nivelServicio: 0.95,
};

test('Revisión continua (Q, R)', () => {
  const r = rev.revisionContinua(prod2);
  casi(r.cantidadPedido, 427.2002);
  casi(r.stockSeguridad, 7.3560);
  casi(r.puntoPedido, 57.3560);
  casi(r.inventarioMaximo, 427.2002 + 7.3560);
  casi(r.costoPedidoAnual, 427.200);
  casi(r.costoMantenimientoAnual, 441.912);
  casi(r.costoTotalAnual, 37369.112, 0.01);
});

// ---------------------------------------------------------
// Revisión periódica - mismos datos, T = 30 días
//  M = 10*(30+5) + 1.6449*2*sqrt(35) = 350 + 19.4622 = 369.4622
//  Pedidos/año = 365/30 = 12.1667   Pedido = 608.333
//  Inventario promedio = 10*30/2 + 19.4622 = 169.4622   Mant. = 338.924
//  Total = 36 500 + 608.333 + 338.924 = 37 447.257
//  Con inventario 120 + 30 en pedido: se piden 369.4622 - 150 = 219.4622
// ---------------------------------------------------------
test('Revisión periódica (T, M)', () => {
  const r = rev.revisionPeriodica({ ...prod2, diasRevision: 30, inventarioActual: 120, enOrden: 30 });
  assert.equal(r.diasRevision, 30);
  casi(r.stockSeguridad, 19.4622);
  casi(r.nivelObjetivo, 369.4622);
  casi(r.cantidadPromedioPedido, 300, 1e-9);
  casi(r.pedidosPorAnio, 365 / 30, 1e-9);
  casi(r.costoPedidoAnual, 608.333);
  casi(r.inventarioPromedio, 169.4622);
  casi(r.costoMantenimientoAnual, 338.924);
  casi(r.costoTotalAnual, 37447.257, 0.01);
  casi(r.cantidadAPedirHoy, 219.4622);
});

test('Revisión periódica: intervalo por defecto = tiempo entre pedidos de la EOQ (42.72 -> 43 días)', () => {
  const r = rev.revisionPeriodica(prod2);
  assert.equal(r.diasRevision, 43);
  assert.equal(r.cantidadAPedirHoy, null);
});

test('Revisión periódica: si hay de sobra no se pide nada', () => {
  const r = rev.revisionPeriodica({ ...prod2, diasRevision: 30, inventarioActual: 900 });
  assert.equal(r.cantidadAPedirHoy, 0);
});

test('Comparación: con estos datos la revisión continua es más económica', () => {
  const c = rev.compararPoliticas({ ...prod2, diasRevision: 30 });
  assert.equal(c.masEconomico, 'continua');
  casi(c.diferenciaAnual, 37447.257 - 37369.112, 0.01);
});

test('Revisión: validaciones', () => {
  assert.throws(() => rev.revisionPeriodica({ ...prod2, diasRevision: 0 }), /intervalo de revisión/);
  assert.throws(() => rev.revisionContinua({ ...prod2, demandaAnual: -1 }), /demanda anual/);
});
