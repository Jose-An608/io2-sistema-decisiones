// =====================================================
// Pruebas de PERT/CPM (cpm.js). Valores resueltos a mano.
// =====================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../services/cpm');

const casi = (real, esperado, tol = 1e-6) =>
  assert.ok(Math.abs(real - esperado) <= tol, `se esperaba ${esperado} y se obtuvo ${real}`);
const act = (r, id) => r.actividades.find((a) => a.id === id);

// A(3) y B(2) inician; C(4) sigue a A; D(5) sigue a A y B; E(2) sigue a C y D
//  ES/EF: A 0-3, B 0-2, C 3-7, D 3-8, E 8-10   -> duración 10
//  LS/LF: E 8-10, D 3-8, C 4-8, B 1-3, A 0-3
//  Holgura: A 0, B 1, C 1, D 0, E 0     Ruta crítica: A-D-E
const red = [
  { id: 'A', duracion: 3 }, { id: 'B', duracion: 2 },
  { id: 'C', duracion: 4, predecesoras: ['A'] },
  { id: 'D', duracion: 5, predecesoras: ['A', 'B'] },
  { id: 'E', duracion: 2, predecesoras: ['C', 'D'] },
];

test('CPM: tiempos tempranos y tardíos', () => {
  const r = c.analizarRed(red, 'cpm');
  assert.equal(r.duracionProyecto, 10);
  const esperado = { A: [0, 3, 0, 3], B: [0, 2, 1, 3], C: [3, 7, 4, 8], D: [3, 8, 3, 8], E: [8, 10, 8, 10] };
  for (const [id, [es, ef, ls, lf]] of Object.entries(esperado)) {
    const a = act(r, id);
    assert.deepEqual([a.es, a.ef, a.ls, a.lf], [es, ef, ls, lf], `actividad ${id}`);
  }
});

test('CPM: holguras y ruta crítica', () => {
  const r = c.analizarRed(red, 'cpm');
  assert.deepEqual(r.actividades.map((a) => a.holgura), [0, 1, 1, 0, 0]);
  assert.deepEqual(r.actividadesCriticas, ['A', 'D', 'E']);
  assert.equal(r.rutasCriticas.length, 1);
  assert.deepEqual(r.rutasCriticas[0].actividades, ['A', 'D', 'E']);
  assert.equal(r.rutasCriticas[0].duracion, 10);
  // holgura libre: B puede retrasarse 1 sin mover a D; C 1 sin mover a E
  assert.equal(act(r, 'B').holguraLibre, 1);
  assert.equal(act(r, 'C').holguraLibre, 1);
});

test('CPM: niveles para dibujar la red', () => {
  const r = c.analizarRed(red, 'cpm');
  assert.deepEqual(r.actividades.map((a) => a.nivel), [0, 0, 1, 1, 2]);
});

test('CPM: dos rutas críticas', () => {
  // A(2) -> B(3) -> D(1)  y  A(2) -> C(3) -> D(1): ambas duran 6
  const r = c.analizarRed([
    { id: 'A', duracion: 2 }, { id: 'B', duracion: 3, predecesoras: ['A'] },
    { id: 'C', duracion: 3, predecesoras: ['A'] }, { id: 'D', duracion: 1, predecesoras: ['B', 'C'] },
  ]);
  assert.equal(r.duracionProyecto, 6);
  assert.equal(r.rutasCriticas.length, 2);
  assert.deepEqual(r.actividadesCriticas, ['A', 'B', 'C', 'D']);
});

test('CPM: actividad única y duraciones decimales', () => {
  const r = c.analizarRed([{ id: 'X', duracion: 2.5 }]);
  assert.equal(r.duracionProyecto, 2.5);
  assert.equal(r.actividades[0].holgura, 0);
  const d = c.analizarRed([{ id: 'A', duracion: 0.1 }, { id: 'B', duracion: 0.2, predecesoras: 'A' }]);
  casi(d.duracionProyecto, 0.3, 1e-12);
  assert.equal(d.actividades.every((a) => a.critica), true);
});

test('CPM: predecesoras como texto y sin distinguir mayúsculas', () => {
  const r = c.analizarRed([
    { id: 'A', duracion: 1 }, { id: 'B', duracion: 1 }, { id: 'C', duracion: 1, predecesoras: 'a, b' },
  ]);
  assert.deepEqual(act(r, 'C').predecesoras, ['A', 'B']);
  assert.equal(r.duracionProyecto, 2);
});

test('CPM: validaciones', () => {
  assert.throws(() => c.analizarRed([]), /al menos una actividad/);
  assert.throws(() => c.analizarRed([{ id: '', duracion: 1 }]), /identificador/);
  assert.throws(() => c.analizarRed([{ id: 'A', duracion: 1 }, { id: 'a', duracion: 2 }]), /repetido/);
  assert.throws(() => c.analizarRed([{ id: 'A', duracion: -1 }]), /menor que 0/);
  assert.throws(() => c.analizarRed([{ id: 'A', duracion: 'x' }]), /número/);
  assert.throws(() => c.analizarRed([{ id: 'A' }]), /obligatorio/);
  assert.throws(() => c.analizarRed([{ id: 'A', duracion: 1, predecesoras: ['Z'] }]), /no existe/);
  assert.throws(() => c.analizarRed([{ id: 'A', duracion: 1, predecesoras: ['A'] }]), /sí misma/);
  assert.throws(() => c.analizarRed([{ id: 'A', duracion: 1 }], 'otro'), /modo/);
});

test('CPM: detecta dependencias circulares', () => {
  assert.throws(() => c.analizarRed([
    { id: 'A', duracion: 1, predecesoras: ['C'] }, { id: 'B', duracion: 1, predecesoras: ['A'] },
    { id: 'C', duracion: 1, predecesoras: ['B'] }, { id: 'D', duracion: 1 },
  ]), /circular.*A, B, C/);
});

// ---------- PERT ----------
test('PERT: tiempo esperado y varianza de una actividad', () => {
  const r = c.analizarRed([
    { id: 'A', optimista: 1, masProbable: 4, pesimista: 7 },     // te = 4,  var = 1
    { id: 'B', optimista: 2, masProbable: 3, pesimista: 10 },    // te = 4,  var = (8/6)² = 1.7778
  ], 'pert');
  casi(act(r, 'A').duracion, 4); casi(act(r, 'A').varianza, 1);
  casi(act(r, 'B').duracion, 4); casi(act(r, 'B').varianza, 64 / 36);
});

test('PERT: varianza y desviación del proyecto = suma sobre la ruta crítica', () => {
  const r = c.analizarRed([
    { id: 'A', optimista: 1, masProbable: 4, pesimista: 7 },
    { id: 'B', optimista: 2, masProbable: 3, pesimista: 10, predecesoras: ['A'] },
  ], 'pert');
  casi(r.duracionProyecto, 8);
  casi(r.varianzaProyecto, 1 + 64 / 36);          // 2.7778
  casi(r.desviacionProyecto, Math.sqrt(1 + 64 / 36));   // 1.6667
});

test('PERT: las actividades fuera de la ruta crítica no suman varianza', () => {
  const r = c.analizarRed([
    { id: 'A', optimista: 2, masProbable: 4, pesimista: 6 },                       // te 4, var 0.4444
    { id: 'B', optimista: 1, masProbable: 1, pesimista: 1 },                       // te 1, var 0 (holgura 3)
    { id: 'C', optimista: 1, masProbable: 2, pesimista: 3, predecesoras: ['A', 'B'] },   // te 2, var 0.1111
  ], 'pert');
  casi(r.duracionProyecto, 6);
  assert.equal(act(r, 'B').critica, false);
  casi(r.varianzaProyecto, 4 / 9 + 1 / 9);
});

test('PERT: probabilidad de terminar en un plazo (normal estándar)', () => {
  const r = c.analizarRed([
    { id: 'A', optimista: 1, masProbable: 4, pesimista: 7 },
    { id: 'B', optimista: 2, masProbable: 3, pesimista: 10, predecesoras: ['A'] },
  ], 'pert');
  casi(c.probabilidadTerminar(r, 8).probabilidad, 0.5, 1e-7);
  const p10 = c.probabilidadTerminar(r, 10);       // z = 2/1.6667 = 1.2 -> 0.88493
  casi(p10.z, 1.2, 1e-9);
  casi(p10.probabilidad, 0.88493, 1e-4);
  casi(c.probabilidadTerminar(r, 6).probabilidad, 1 - 0.88493, 1e-4);
});

test('PERT: plazo para una probabilidad dada', () => {
  const r = c.analizarRed([
    { id: 'A', optimista: 1, masProbable: 4, pesimista: 7 },
    { id: 'B', optimista: 2, masProbable: 3, pesimista: 10, predecesoras: ['A'] },
  ], 'pert');
  const q = c.plazoParaProbabilidad(r, 0.95);      // 8 + 1.6449 × 1.6667 = 10.7415
  casi(q.plazo, 8 + 1.644854 * Math.sqrt(1 + 64 / 36), 1e-4);
  casi(c.plazoParaProbabilidad(r, 0.5).plazo, 8, 1e-9);
  assert.throws(() => c.plazoParaProbabilidad(r, 1), /entre 0 y 1/);
});

test('PERT: sin variabilidad el plazo es determinista', () => {
  const r = c.analizarRed([{ id: 'A', optimista: 3, masProbable: 3, pesimista: 3 }], 'pert');
  assert.equal(c.probabilidadTerminar(r, 3).probabilidad, 1);
  assert.equal(c.probabilidadTerminar(r, 2.9).probabilidad, 0);
});

test('PERT: validaciones', () => {
  assert.throws(() => c.analizarRed([{ id: 'A', optimista: 5, masProbable: 3, pesimista: 7 }], 'pert'), /optimista ≤ más probable ≤ pesimista/);
  assert.throws(() => c.analizarRed([{ id: 'A', optimista: 1, masProbable: 2 }], 'pert'), /pesimista/);
  const cpm = c.analizarRed(red, 'cpm');
  assert.throws(() => c.probabilidadTerminar(cpm, 10), /PERT/);
});

test('Normal estándar: valores de tabla', () => {
  casi(c.probabilidadNormal(0), 0.5, 1e-7);
  casi(c.probabilidadNormal(1), 0.84134, 1e-4);
  casi(c.probabilidadNormal(1.96), 0.97500, 1e-4);
  casi(c.probabilidadNormal(-1.645), 0.04998, 1e-4);
});

// Ejemplo PERT de database/99_seed_data.sql (resuelto a mano):
// te: A3 B4 C3 D7 E5 F3 G2 H1  ->  18 días, ruta crítica A-B-D-F-H
// varianza = 1/9 + 4/9 + 25/9 + 1/9 + 0 = 31/9 = 3.4444
test('PERT: ejemplo del seed (18 días, ruta A-B-D-F-H, varianza 31/9)', () => {
  const r = c.analizarRed([
    { id: 'A', optimista: 2, masProbable: 3, pesimista: 4 },
    { id: 'B', optimista: 2, masProbable: 4, pesimista: 6, predecesoras: ['A'] },
    { id: 'C', optimista: 1, masProbable: 3, pesimista: 5, predecesoras: ['A'] },
    { id: 'D', optimista: 4, masProbable: 6, pesimista: 14, predecesoras: ['B'] },
    { id: 'E', optimista: 3, masProbable: 5, pesimista: 7, predecesoras: ['C'] },
    { id: 'F', optimista: 2, masProbable: 3, pesimista: 4, predecesoras: ['D', 'E'] },
    { id: 'G', optimista: 1, masProbable: 2, pesimista: 3, predecesoras: ['B', 'C'] },
    { id: 'H', optimista: 1, masProbable: 1, pesimista: 1, predecesoras: ['F', 'G'] },
  ], 'pert');
  casi(r.duracionProyecto, 18);
  assert.deepEqual(r.rutasCriticas[0].actividades, ['A', 'B', 'D', 'F', 'H']);
  casi(r.varianzaProyecto, 31 / 9);
  casi(r.desviacionProyecto, Math.sqrt(31 / 9));
  // holguras: C y E 3 días (rama del frontend), G 8 días, el resto crítico
  assert.deepEqual(r.actividades.map((a) => a.holgura), [0, 0, 3, 0, 3, 0, 8, 0]);
});
