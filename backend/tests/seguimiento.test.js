// =====================================================
// Pruebas del seguimiento de proyectos (seguimiento.js). Valores resueltos a mano.
// =====================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { analizarRed } = require('../services/cpm');
const { evaluarSeguimiento } = require('../services/seguimiento');

const casi = (real, esperado, tol = 1e-9) =>
  assert.ok(Math.abs(real - esperado) <= tol, `se esperaba ${esperado} y se obtuvo ${real}`);

// A (3 días) -> B (2 días): duración 5, ambas críticas
const red = analizarRed([{ id: 'A', duracion: 3 }, { id: 'B', duracion: 2, predecesoras: ['A'] }]);
const act = (s, id) => s.actividades.find((a) => a.id === id);

test('Avance planificado por actividad y del proyecto (día 3)', () => {
  const s = evaluarSeguimiento(red, { A: 100, B: 0 }, 3);
  casi(act(s, 'A').avancePlanificado, 100);
  casi(act(s, 'B').avancePlanificado, 0);
  casi(s.avancePlanificado, 60);               // (3×100 + 2×0)/5
  casi(s.avanceReal, 60);
  assert.equal(s.estado, 'en_plazo');
  assert.equal(act(s, 'A').estado, 'completada');
});

test('Día 4: B va por la mitad según el plan', () => {
  const s = evaluarSeguimiento(red, { A: 100, B: 0 }, 4);
  casi(act(s, 'B').avancePlanificado, 50);     // (4-3)/2
  casi(s.avancePlanificado, 80);               // (300 + 2×50)/5
  casi(s.avanceReal, 60);
  casi(s.desviacion, -20);
  assert.equal(s.estado, 'atrasada');
  assert.deepEqual(s.criticasAtrasadas, ['B']);
});

test('Proyecto atrasado: avance real menor al planificado', () => {
  const s = evaluarSeguimiento(red, { A: 50, B: 0 }, 3);
  casi(act(s, 'A').desviacion, -50);
  assert.equal(act(s, 'A').estado, 'atrasada');
  casi(s.avanceReal, 30);                      // 3×50/5
  assert.deepEqual(s.actividadesAtrasadas, ['A']);
  assert.equal(s.completadas, 0);
});

test('Proyecto adelantado y tolerancia de 5 puntos', () => {
  assert.equal(evaluarSeguimiento(red, { A: 100, B: 100 }, 2).estado, 'completada');
  assert.equal(evaluarSeguimiento(red, { A: 100, B: 40 }, 3).estado, 'adelantada');   // real 76 vs plan 60
  assert.equal(evaluarSeguimiento(red, { A: 98, B: 0 }, 3).estado, 'en_plazo');         // real 58.8 vs 60
});

test('Más allá del final del plan todo debería estar al 100 %', () => {
  const s = evaluarSeguimiento(red, { A: 100, B: 80 }, 9);
  casi(s.avancePlanificado, 100);
  assert.equal(act(s, 'B').estado, 'atrasada');
});

test('Sin día de corte solo se informa el avance real', () => {
  const s = evaluarSeguimiento(red, { A: 100 }, null);
  assert.equal(s.avancePlanificado, null);
  assert.equal(s.desviacion, null);
  assert.equal(act(s, 'A').estado, 'completada');
  assert.equal(act(s, 'B').estado, 'sin_iniciar');
  casi(s.avanceReal, 60);
});

test('Hitos de duración 0 pesan 0 y se completan al llegar su día', () => {
  const r = analizarRed([{ id: 'A', duracion: 4 }, { id: 'H', duracion: 0, predecesoras: ['A'] }]);
  const s = evaluarSeguimiento(r, { A: 50 }, 4);
  casi(act(s, 'H').avancePlanificado, 100);
  casi(s.avancePlanificado, 100);              // H no pesa
  casi(s.avanceReal, 50);
});

test('Validaciones', () => {
  assert.throws(() => evaluarSeguimiento(red, { A: 120 }, 1), /entre 0 y 100/);
  assert.throws(() => evaluarSeguimiento(red, { A: -1 }, 1), /entre 0 y 100/);
  assert.throws(() => evaluarSeguimiento(red, {}, -2), /día de corte/);
  assert.throws(() => evaluarSeguimiento(red, {}, NaN), /día de corte/);
});
