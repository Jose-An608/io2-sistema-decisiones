// =====================================================
// Pruebas del controlador de decisiones (sin SQL Server)
// Se simula la conexión a la base para probar validaciones,
// cálculo y códigos de error HTTP.
// =====================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Simula config/db.js: la "base de datos" siempre falla
const rutaDb = path.resolve(__dirname, '../config/db.js');
const tipo = () => 'tipo';
require.cache[rutaDb] = {
  id: rutaDb, filename: rutaDb, loaded: true,
  exports: {
    sql: { Int: tipo, NVarChar: tipo, VarChar: tipo, Decimal: tipo, Transaction: class {}, Request: class {} },
    getPool: async () => { throw new Error('sin conexión a la base de datos'); },
  },
};
const c = require('../controllers/decisiones.controller');

// Respuesta falsa de Express
function nuevaRespuesta() {
  return {
    codigo: 200, cuerpo: null,
    status(n) { this.codigo = n; return this; },
    json(b) { this.cuerpo = b; return this; },
  };
}
async function llamar(handler, req) {
  const res = nuevaRespuesta();
  await handler(req, res);
  return res;
}

const valido = () => ({
  nombre: 'Fábrica', tipo: 'beneficio', alfa: 0.8,
  alternativas: ['Planta grande', 'Planta pequeña', 'No hacer nada'],
  estados: [{ nombre: 'Favorable', probabilidad: 0.5 }, { nombre: 'Desfavorable', probabilidad: 0.5 }],
  matriz: [[200000, -180000], [100000, -20000], [0, 0]],
});

test('calcular: aplica los 6 criterios al ejemplo de la fábrica', async () => {
  const r = await llamar(c.calcular, { body: valido() });
  assert.equal(r.codigo, 200);
  assert.equal(r.cuerpo.criterios.length, 6);
  assert.deepEqual(r.cuerpo.criterios[0].alternativas, ['Planta grande']);   // Maximax
  assert.deepEqual(r.cuerpo.criterios[4].alternativas, ['Planta pequeña']);  // Savage
  assert.equal(r.cuerpo.informacionPerfecta.veip, 60000);
});

test('calcular: sin probabilidades solo hay 5 criterios', async () => {
  const b = valido();
  b.estados = b.estados.map((e) => ({ nombre: e.nombre }));
  const r = await llamar(c.calcular, { body: b });
  assert.equal(r.codigo, 200);
  assert.equal(r.cuerpo.criterios.length, 5);
  assert.equal(r.cuerpo.informacionPerfecta, null);
});

test('calcular: costos usa Minimin / Minimax', async () => {
  const r = await llamar(c.calcular, { body: {
    nombre: 'Costos', tipo: 'costo', alternativas: ['A', 'B', 'C'],
    estados: [{ nombre: 'e1' }, { nombre: 'e2' }, { nombre: 'e3' }],
    matriz: [[4, 6, 10], [5, 5, 8], [7, 3, 9]],
  } });
  assert.equal(r.cuerpo.criterios[0].criterio, 'Minimin');
  assert.deepEqual(r.cuerpo.criterios[0].alternativas, ['C']);
  assert.deepEqual(r.cuerpo.criterios[1].alternativas, ['B']);
});

test('validaciones devuelven HTTP 400 con mensaje', async () => {
  const casos = [
    [(b) => { b.nombre = ''; }, /nombre es obligatorio/],
    [(b) => { b.tipo = 'otro'; }, /beneficio.*costo/],
    [(b) => { b.alfa = 2; }, /Alfa/],
    [(b) => { b.alternativas[1] = 'Planta grande'; }, /mismo nombre/],
    [(b) => { b.estados[1].probabilidad = 0.4; }, /sumar 1/],
    [(b) => { delete b.estados[1].probabilidad; }, /todos los estados o de ninguno/],
    [(b) => { b.matriz.pop(); }, /una fila por alternativa/],
    [(b) => { b.matriz[0][0] = 'x'; }, /no es un número válido/],
  ];
  for (const [rompe, patron] of casos) {
    const b = valido();
    rompe(b);
    const r = await llamar(c.calcular, { body: b });
    assert.equal(r.codigo, 400, `debía ser 400 para ${patron}`);
    assert.match(r.cuerpo.error, patron);
    assert.equal(r.cuerpo.ok, false);
  }
});

test('cuerpo vacío devuelve 400', async () => {
  const r = await llamar(c.calcular, { body: undefined });
  assert.equal(r.codigo, 400);
});

test('id inválido devuelve 400 sin tocar la base', async () => {
  for (const id of ['abc', '0', '-3']) {
    const r = await llamar(c.obtener, { params: { id } });
    assert.equal(r.codigo, 400);
  }
});

test('error de base de datos devuelve 500 con JSON (el servidor no se cae)', async () => {
  const antes = console.error;
  console.error = () => {};            // evita ruido en la salida del test
  try {
    const r = await llamar(c.listar, {});
    assert.equal(r.codigo, 500);
    assert.match(r.cuerpo.error, /sin conexión/);
  } finally {
    console.error = antes;
  }
});

test('crear valida antes de abrir la base de datos', async () => {
  const b = valido();
  b.nombre = '';
  const r = await llamar(c.crear, { body: b });
  assert.equal(r.codigo, 400);
});
