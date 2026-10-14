// =====================================================
// Pruebas de arbolDecision.js con ejemplos resueltos a mano
// =====================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const a = require('../services/arbolDecision');

const casi = (real, esperado) =>
  assert.ok(Math.abs(real - esperado) < 1e-6, `se esperaba ${esperado} y se obtuvo ${real}`);

const terminal = (pago, etiqueta) => ({ tipo: 'terminal', etiqueta, pago, ramas: [] });
const rama = (etiqueta, nodo, valorRama = 0, probabilidad = null) => ({ etiqueta, valorRama, probabilidad, nodo });

// ---------------------------------------------------------
// EJEMPLO 1 (beneficios) - Thompson Lumber, resuelto a mano:
//  Con resultado positivo: grande = 0.78*200000 + 0.22*(-180000) = 116 400
//                          pequeña = 0.78*100000 + 0.22*(-20000) =  73 600  -> grande
//  Con resultado negativo: grande = 0.27*200000 + 0.73*(-180000) = -77 400
//                          pequeña = 0.27*100000 + 0.73*(-20000) =  12 400  -> pequeña
//  Con estudio: 0.45*116400 + 0.55*12400 - 10000 = 49 200
//  Sin estudio: grande 10 000, pequeña 40 000 -> pequeña = 40 000
//  Se elige realizar el estudio (49 200 > 40 000)
// ---------------------------------------------------------
test('Thompson Lumber: valor esperado de la raíz = 49 200', () => {
  const r = a.evaluarArbol(a.ejemploThompson(), 'beneficio');
  casi(r.valorEsperado, 49200);
  assert.equal(r.arbol.ramas[0].elegida, true);   // Realizar estudio
  assert.equal(r.arbol.ramas[1].elegida, false);  // No realizar estudio
  casi(r.arbol.ramas[0].valorTotal, 49200);
  casi(r.arbol.ramas[1].valorTotal, 40000);
});

test('Thompson Lumber: valores intermedios', () => {
  const r = a.evaluarArbol(a.ejemploThompson(), 'beneficio');
  const estudio = r.arbol.ramas[0].nodo;                // azar: resultado del estudio
  const positivo = estudio.ramas[0].nodo;               // decisión de tamaño
  const negativo = estudio.ramas[1].nodo;
  casi(positivo.ramas[0].valorTotal, 116400);
  casi(positivo.ramas[1].valorTotal, 73600);
  casi(positivo.ramas[2].valorTotal, 0);
  casi(positivo.valorEsperado, 116400);
  casi(negativo.ramas[0].valorTotal, -77400);
  casi(negativo.ramas[1].valorTotal, 12400);
  casi(negativo.valorEsperado, 12400);
  const sinEstudio = r.arbol.ramas[1].nodo;
  casi(sinEstudio.ramas[0].valorTotal, 10000);
  casi(sinEstudio.ramas[1].valorTotal, 40000);
  casi(estudio.valorEsperado, 59200);                   // antes de restar el costo del estudio
});

test('Thompson Lumber: política óptima', () => {
  const r = a.evaluarArbol(a.ejemploThompson(), 'beneficio');
  assert.equal(r.politica.length, 3);
  assert.deepEqual(r.politica.map((p) => p.eleccion), ['Realizar estudio', 'Planta grande', 'Planta pequeña']);
  assert.deepEqual(r.politica[1].cuando, ['Resultado positivo']);
  assert.deepEqual(r.politica[2].cuando, ['Resultado negativo']);
  assert.equal(r.totalNodos, 26);
  assert.equal(r.profundidad, 4);
});

// ---------------------------------------------------------
// EJEMPLO 2 (costos): se minimiza
//  A = 0.4*10 + 0.6*20 = 16 | B = 18 | C = 3 + 14 = 17  -> gana A (16)
// ---------------------------------------------------------
const arbolCostos = () => ({
  tipo: 'decision', etiqueta: 'Elegir',
  ramas: [
    rama('A', { tipo: 'azar', etiqueta: 'Incertidumbre', ramas: [rama('Bajo', terminal(10), 0, 0.4), rama('Alto', terminal(20), 0, 0.6)] }),
    rama('B', terminal(18)),
    rama('C', terminal(14), 3),
  ],
});

test('Costos: elige el menor valor esperado (A = 16)', () => {
  const r = a.evaluarArbol(arbolCostos(), 'costo');
  casi(r.valorEsperado, 16);
  assert.deepEqual(r.arbol.elegidas, [0]);
  casi(r.arbol.ramas[1].valorTotal, 18);
  casi(r.arbol.ramas[2].valorTotal, 17);
});

test('El mismo árbol como beneficios elige el mayor (B = 18)', () => {
  const r = a.evaluarArbol(arbolCostos(), 'beneficio');
  casi(r.valorEsperado, 18);
  assert.deepEqual(r.arbol.elegidas, [1]);
});

test('Empates: marca todas las ramas empatadas', () => {
  const r = a.evaluarArbol({ tipo: 'decision', etiqueta: 'X', ramas: [rama('P', terminal(5)), rama('Q', terminal(5)), rama('R', terminal(1))] });
  assert.deepEqual(r.arbol.elegidas, [0, 1]);
  assert.equal(r.politica[0].empate, true);
});

test('Árbol con solo azar (sin decisiones): valor esperado y política vacía', () => {
  const r = a.evaluarArbol({ tipo: 'azar', etiqueta: 'Moneda', ramas: [rama('Cara', terminal(100), 0, 0.5), rama('Sello', terminal(0), 0, 0.5)] });
  casi(r.valorEsperado, 50);
  assert.deepEqual(r.politica, []);
});

test('Etiquetas vacías reciben nombres por defecto', () => {
  const n = a.normalizarArbol({ tipo: 'decision', etiqueta: '', ramas: [rama('', terminal(1, '')), rama('  ', terminal(2))] });
  assert.equal(n.etiqueta, 'Decisión');
  assert.equal(n.ramas[0].etiqueta, 'Rama 1');
  assert.equal(n.ramas[1].etiqueta, 'Rama 2');
  assert.equal(n.ramas[0].nodo.etiqueta, 'Resultado');
});

test('Validaciones', () => {
  const dec = (...ramas) => ({ tipo: 'decision', etiqueta: 'D', ramas });
  assert.throws(() => a.evaluarArbol(null), /Falta un nodo/);
  assert.throws(() => a.evaluarArbol({ tipo: 'otro' }), /tipo inválido/);
  assert.throws(() => a.evaluarArbol(terminal('x')), /pago numérico/);
  assert.throws(() => a.evaluarArbol(dec(rama('a', terminal(1)))), /al menos 2 ramas/);
  assert.throws(() => a.evaluarArbol({ ...terminal(1), ramas: [rama('a', terminal(1))] }), /no puede tener ramas/);
  assert.throws(() => a.evaluarArbol(dec(rama('a', terminal(1), 'x'), rama('b', terminal(2)))), /valor de la rama/);
  assert.throws(() => a.evaluarArbol({ tipo: 'azar', etiqueta: 'E', ramas: [rama('a', terminal(1), 0, 0.6), rama('b', terminal(2), 0, 0.3)] }), /deben sumar 1/);
  assert.throws(() => a.evaluarArbol({ tipo: 'azar', etiqueta: 'E', ramas: [rama('a', terminal(1)), rama('b', terminal(2))] }), /probabilidad entre 0 y 1/);
  assert.throws(() => a.evaluarArbol(a.ejemploThompson(), 'otro'), /beneficio.*costo/);
});

test('Límites: profundidad y cantidad de nodos', () => {
  let n = terminal(1);
  for (let i = 0; i < 30; i++) n = { tipo: 'decision', etiqueta: `d${i}`, ramas: [rama('a', n), rama('b', terminal(0))] };
  assert.throws(() => a.evaluarArbol(n), /niveles/);

  const muchas = { tipo: 'decision', etiqueta: 'D', ramas: Array.from({ length: 510 }, (_, i) => rama(`r${i}`, terminal(i))) };
  assert.throws(() => a.evaluarArbol(muchas), /más de 500 nodos/);
});
