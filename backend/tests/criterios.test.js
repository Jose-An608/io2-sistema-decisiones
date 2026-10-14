// =====================================================
// Pruebas de criterios.js con ejemplos resueltos a mano
// Ejecutar: npm test
// =====================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../services/criterios');

// Compara números con tolerancia (evita errores de punto flotante)
const casi = (real, esperado) =>
  assert.ok(Math.abs(real - esperado) < 1e-9, `se esperaba ${esperado} y se obtuvo ${real}`);

// ---------------------------------------------------------
// EJEMPLO 1 (beneficios) - Fábrica: planta grande / pequeña / nada
// Estados: mercado favorable, mercado desfavorable
// ---------------------------------------------------------
const nombres1 = ['Planta grande', 'Planta pequeña', 'No hacer nada'];
const M1 = [
  [200000, -180000],
  [100000, -20000],
  [0, 0],
];
const P1 = [0.5, 0.5];

test('Beneficios - Maximax elige Planta grande (200000)', () => {
  const r = c.maximax(M1, 'beneficio', nombres1);
  assert.deepEqual(r.valores, [200000, 100000, 0]);
  assert.deepEqual(r.alternativas, ['Planta grande']);
});

test('Beneficios - Maximin elige No hacer nada (0)', () => {
  const r = c.maximin(M1, 'beneficio', nombres1);
  assert.deepEqual(r.valores, [-180000, -20000, 0]);
  assert.deepEqual(r.alternativas, ['No hacer nada']);
});

test('Beneficios - Hurwicz alfa=0.8 elige Planta grande', () => {
  const r = c.hurwicz(M1, 0.8, 'beneficio', nombres1);
  casi(r.valores[0], 124000);
  casi(r.valores[1], 76000);
  casi(r.valores[2], 0);
  assert.deepEqual(r.alternativas, ['Planta grande']);
});

test('Beneficios - Laplace elige Planta pequeña (40000)', () => {
  const r = c.laplace(M1, 'beneficio', nombres1);
  casi(r.valores[0], 10000);
  casi(r.valores[1], 40000);
  casi(r.valores[2], 0);
  assert.deepEqual(r.alternativas, ['Planta pequeña']);
});

test('Beneficios - Savage: arrepentimiento máximo y elección', () => {
  const r = c.savage(M1, 'beneficio', nombres1);
  assert.deepEqual(r.matrizArrepentimiento, [[0, 180000], [100000, 20000], [200000, 0]]);
  assert.deepEqual(r.valores, [180000, 100000, 200000]);
  assert.deepEqual(r.alternativas, ['Planta pequeña']);
});

test('Beneficios - VME con 0.5/0.5 elige Planta pequeña', () => {
  const r = c.vme(M1, P1, 'beneficio', nombres1);
  casi(r.valores[0], 10000);
  casi(r.valores[1], 40000);
  casi(r.valores[2], 0);
  assert.deepEqual(r.alternativas, ['Planta pequeña']);
});

test('Beneficios - VEIP = 100000 - 40000 = 60000', () => {
  const r = c.veip(M1, P1, 'beneficio');
  casi(r.valorConInformacionPerfecta, 100000);
  casi(r.mejorVME, 40000);
  casi(r.veip, 60000);
});

// ---------------------------------------------------------
// EJEMPLO 2 (costos) - menor es mejor
// ---------------------------------------------------------
const M2 = [
  [4, 6, 10],
  [5, 5, 8],
  [7, 3, 9],
];
const P2 = [0.2, 0.5, 0.3];
const nombres2 = ['A', 'B', 'C'];

test('Costos - Minimin (optimista) elige C', () => {
  const r = c.maximax(M2, 'costo', nombres2);
  assert.equal(r.criterio, 'Minimin');
  assert.deepEqual(r.valores, [4, 5, 3]);
  assert.deepEqual(r.alternativas, ['C']);
});

test('Costos - Minimax (pesimista) elige B', () => {
  const r = c.maximin(M2, 'costo', nombres2);
  assert.deepEqual(r.valores, [10, 8, 9]);
  assert.deepEqual(r.alternativas, ['B']);
});

test('Costos - Hurwicz alfa=0.6 elige C', () => {
  const r = c.hurwicz(M2, 0.6, 'costo', nombres2);
  casi(r.valores[0], 6.4);
  casi(r.valores[1], 6.2);
  casi(r.valores[2], 5.4);
  assert.deepEqual(r.alternativas, ['C']);
});

test('Costos - Laplace elige B (promedio 6)', () => {
  const r = c.laplace(M2, 'costo', nombres2);
  casi(r.valores[0], 20 / 3);
  casi(r.valores[1], 6);
  casi(r.valores[2], 19 / 3);
  assert.deepEqual(r.alternativas, ['B']);
});

test('Costos - Savage elige B', () => {
  const r = c.savage(M2, 'costo', nombres2);
  assert.deepEqual(r.matrizArrepentimiento, [[0, 3, 2], [1, 2, 0], [3, 0, 1]]);
  assert.deepEqual(r.valores, [3, 2, 3]);
  assert.deepEqual(r.alternativas, ['B']);
});

test('Costos - VME elige C (5.6) y VEIP = 0.9', () => {
  const r = c.vme(M2, P2, 'costo', nombres2);
  casi(r.valores[0], 6.8);
  casi(r.valores[1], 5.9);
  casi(r.valores[2], 5.6);
  assert.deepEqual(r.alternativas, ['C']);
  const v = c.veip(M2, P2, 'costo');
  casi(v.valorConInformacionPerfecta, 4.7);
  casi(v.veip, 0.9);
});

// ---------------------------------------------------------
// Empates, análisis completo y validaciones
// ---------------------------------------------------------
test('Empates: devuelve todas las alternativas empatadas', () => {
  const r = c.maximax([[5, 1], [5, 2], [3, 3]], 'beneficio', ['X', 'Y', 'Z']);
  assert.deepEqual(r.alternativas, ['X', 'Y']);
});

test('analizar() aplica los 6 criterios y cuenta votos', () => {
  const r = c.analizar({ matriz: M1, alternativas: nombres1, tipo: 'beneficio', alfa: 0.8, probabilidades: P1 });
  assert.equal(r.criterios.length, 6);
  const pequena = r.votos.find((v) => v.alternativa === 'Planta pequeña');
  // Laplace, Savage y VME recomiendan Planta pequeña
  assert.equal(pequena.criterios, 3);
  casi(r.informacionPerfecta.veip, 60000);
});

test('analizar() sin probabilidades omite VME y VEIP', () => {
  const r = c.analizar({ matriz: M1, alternativas: nombres1 });
  assert.equal(r.criterios.length, 5);
  assert.equal(r.informacionPerfecta, null);
});

test('Validaciones: matriz, alfa, tipo y probabilidades', () => {
  assert.throws(() => c.maximax([]), /al menos una alternativa/);
  assert.throws(() => c.maximax([[1, 2], [3]]), /no tiene 2 estados/);
  assert.throws(() => c.maximax([[1, 'x']]), /no es un número válido/);
  assert.throws(() => c.hurwicz(M1, 1.5), /entre 0 y 1/);
  assert.throws(() => c.laplace(M1, 'otro'), /beneficio.*costo/);
  assert.throws(() => c.vme(M1, [0.5, 0.4]), /sumar 1/);
  assert.throws(() => c.vme(M1, [0.5]), /Se requieren 2 probabilidades/);
});
