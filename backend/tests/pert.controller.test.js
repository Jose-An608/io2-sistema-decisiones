// =====================================================
// Pruebas del controlador PERT/CPM (sin SQL Server)
// La base de datos se simula y se registran las consultas ejecutadas.
// =====================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const tipo = () => 'tipo';
const log = { consultas: [], commit: 0, rollback: 0 };
let proyectoExiste = true;
let dbDisponible = true;
let seq = 0;

// Proyecto guardado de ejemplo: A(3) -> B(2)
const guardado = {
  proyecto: [{ IdProyecto: 7, Nombre: 'Guardado', Descripcion: null, Modo: 'cpm', FechaInicio: new Date('2026-11-02T00:00:00Z') }],
  actividades: [
    { Codigo: 'A', Nombre: 'Uno', Duracion: 3, Optimista: null, MasProbable: null, Pesimista: null, AvanceReal: 50, InicioReal: null, FinReal: null },
    { Codigo: 'B', Nombre: 'Dos', Duracion: 2, Optimista: null, MasProbable: null, Pesimista: null, AvanceReal: 0, InicioReal: null, FinReal: null },
  ],
  precedencias: [{ Actividad: 'B', Predecesora: 'A' }],
};

function nuevoRq() {
  const rq = {
    input() { return rq; },
    async query(q) {
      log.consultas.push(q.replace(/\s+/g, ' ').trim());
      if (!proyectoExiste) return { recordset: [], rowsAffected: [0] };
      if (/INSERT INTO dbo\.Proyecto/.test(q)) return { recordset: [{ IdProyecto: 7 }] };
      if (/INSERT INTO dbo\.Actividad_Pert/.test(q)) return { recordset: [{ IdActividad: ++seq }] };
      if (/SELECT \* FROM dbo\.Proyecto/.test(q)) return { recordset: guardado.proyecto };
      if (/SELECT \* FROM dbo\.Actividad_Pert/.test(q)) return { recordset: guardado.actividades };
      if (/FROM dbo\.Precedencia pr/.test(q) && /SELECT/.test(q)) return { recordset: guardado.precedencias };
      if (/SELECT Codigo, AvanceReal/.test(q)) return { recordset: guardado.actividades };
      return { recordset: [], rowsAffected: [1] };
    },
  };
  return rq;
}
class Transaction {
  async begin() {}
  async commit() { log.commit += 1; }
  async rollback() { log.rollback += 1; }
}
const rutaDb = path.resolve(__dirname, '../config/db.js');
require.cache[rutaDb] = {
  id: rutaDb, filename: rutaDb, loaded: true,
  exports: {
    sql: { Int: tipo, NVarChar: tipo, VarChar: tipo, Decimal: tipo, Date: tipo, Transaction, Request: function Request() { return nuevoRq(); } },
    getPool: async () => {
      if (!dbDisponible) throw new Error('sin conexión a la base de datos');
      return { request: nuevoRq };
    },
  },
};
const c = require('../controllers/pert.controller');

function nuevaRespuesta() {
  return { codigo: 200, cuerpo: null, status(n) { this.codigo = n; return this; }, json(b) { this.cuerpo = b; return this; } };
}
async function llamar(handler, req = {}) {
  const res = nuevaRespuesta();
  await handler({ body: {}, params: {}, query: {}, ...req }, res);
  return res;
}
const reiniciar = () => { log.consultas = []; log.commit = 0; log.rollback = 0; proyectoExiste = true; dbDisponible = true; };

const redCpm = [
  { id: 'A', duracion: 3 }, { id: 'B', duracion: 2 },
  { id: 'C', duracion: 4, predecesoras: ['A'] }, { id: 'D', duracion: 5, predecesoras: ['A', 'B'] },
  { id: 'E', duracion: 2, predecesoras: ['C', 'D'] },
];
const redPert = [
  { id: 'A', optimista: 1, masProbable: 4, pesimista: 7 },
  { id: 'B', optimista: 2, masProbable: 3, pesimista: 10, predecesoras: ['A'] },
];

test('calcular CPM: no necesita base de datos', async () => {
  reiniciar(); dbDisponible = false;
  const r = await llamar(c.calcular, { body: { modo: 'cpm', actividades: redCpm } });
  assert.equal(r.codigo, 200);
  assert.equal(r.cuerpo.duracionProyecto, 10);
  assert.deepEqual(r.cuerpo.rutasCriticas[0].actividades, ['A', 'D', 'E']);
  assert.equal(log.consultas.length, 0);
});

test('calcular PERT: probabilidad de un plazo y plazo de una probabilidad', async () => {
  reiniciar();
  const r = await llamar(c.calcular, { body: { modo: 'pert', actividades: redPert, plazo: 10, probabilidad: 0.95 } });
  assert.ok(Math.abs(r.cuerpo.probabilidadPlazo.probabilidad - 0.88493) < 1e-4);
  assert.ok(Math.abs(r.cuerpo.plazoProbabilidad.plazo - 10.7415) < 1e-3);
  assert.ok(Math.abs(r.cuerpo.desviacionProyecto - 1.6667) < 1e-3);
});

test('calcular: fechas del calendario a partir de la fecha de inicio', async () => {
  reiniciar();
  const r = await llamar(c.calcular, { body: { modo: 'cpm', actividades: redCpm, fechaInicio: '2026-11-02' } });
  assert.equal(r.cuerpo.fechaFin, '2026-11-12');                          // 10 días después
  const e = r.cuerpo.actividades.find((a) => a.id === 'E');
  assert.equal(e.fechaInicioTemprano, '2026-11-10');                      // ES = 8
  assert.equal(e.fechaFinTemprano, '2026-11-12');                         // EF = 10
});

test('calcular: errores de validación -> 400', async () => {
  reiniciar();
  const casos = [
    [{ modo: 'cpm', actividades: [] }, /al menos una actividad/],
    [{ modo: 'otro', actividades: redCpm }, /modo/],
    [{ modo: 'cpm', actividades: [{ id: 'A', duracion: 1, predecesoras: ['A'] }] }, /sí misma/],
    [{ modo: 'cpm', actividades: [{ id: 'A', duracion: 1, predecesoras: ['B'] }, { id: 'B', duracion: 1, predecesoras: ['A'] }] }, /circular/],
    [{ modo: 'pert', actividades: [{ id: 'A', optimista: 5, masProbable: 2, pesimista: 7 }] }, /optimista/],
    [{ modo: 'cpm', actividades: redCpm, fechaInicio: '02/11/2026' }, /AAAA-MM-DD/],
    [{ modo: 'cpm', actividades: redCpm, fechaInicio: '2026-02-30' }, /fecha válida/],
    [{ modo: 'pert', actividades: redPert, probabilidad: 1.2 }, /entre 0 y 1/],
  ];
  for (const [body, patron] of casos) {
    const r = await llamar(c.calcular, { body });
    assert.equal(r.codigo, 400, JSON.stringify(body).slice(0, 60));
    assert.match(r.cuerpo.error, patron);
  }
  assert.equal((await llamar(c.calcular, { body: null })).codigo, 400);
});

test('crear: valida antes de tocar la base de datos', async () => {
  reiniciar();
  const sinNombre = await llamar(c.crear, { body: { modo: 'cpm', actividades: redCpm } });
  assert.equal(sinNombre.codigo, 400);
  const circular = await llamar(c.crear, { body: { nombre: 'X', actividades: [{ id: 'A', duracion: 1, predecesoras: ['B'] }, { id: 'B', duracion: 1, predecesoras: ['A'] }] } });
  assert.equal(circular.codigo, 400);
  assert.equal(log.consultas.length, 0, 'no debe haber consultas');
});

test('crear: guarda proyecto, actividades y precedencias en una transacción', async () => {
  reiniciar(); seq = 0;
  const r = await llamar(c.crear, { body: { nombre: 'Mi proyecto', modo: 'cpm', actividades: redCpm } });
  assert.equal(r.codigo, 201);
  assert.equal(r.cuerpo.id, 7);
  assert.equal(log.consultas.filter((q) => /INSERT INTO dbo\.Proyecto/.test(q)).length, 1);
  assert.equal(log.consultas.filter((q) => /INSERT INTO dbo\.Actividad_Pert/.test(q)).length, 5);
  assert.equal(log.consultas.filter((q) => /INSERT INTO dbo\.Precedencia/.test(q)).length, 5);   // C-A, D-A, D-B, E-C, E-D
  assert.equal(log.commit, 1);
  assert.equal(log.rollback, 0);
});

test('obtener y analizar un proyecto guardado', async () => {
  reiniciar();
  const o = await llamar(c.obtener, { params: { id: '7' } });
  assert.equal(o.cuerpo.nombre, 'Guardado');
  assert.equal(o.cuerpo.fechaInicio, '2026-11-02');
  assert.deepEqual(o.cuerpo.actividades[1].predecesoras, ['A']);
  const a = await llamar(c.analizarGuardado, { params: { id: '7' } });
  assert.equal(a.cuerpo.duracionProyecto, 5);
  assert.equal(a.cuerpo.fechaFin, '2026-11-07');
  assert.equal(a.cuerpo.avances.A.avanceReal, 50);
  assert.equal(a.cuerpo.proyecto.nombre, 'Guardado');
});

test('actualizar: conserva el avance real y confirma la transacción', async () => {
  reiniciar();
  const r = await llamar(c.actualizar, { params: { id: '7' }, body: { nombre: 'Editado', modo: 'cpm', actividades: [{ id: 'A', duracion: 4 }, { id: 'B', duracion: 2, predecesoras: ['A'] }] } });
  assert.equal(r.codigo, 200);
  assert.equal(log.commit, 1);
  assert.ok(log.consultas.some((q) => /DELETE FROM dbo\.Actividad_Pert/.test(q)));
});

test('proyecto inexistente -> 404 (y la transacción se revierte al actualizar)', async () => {
  reiniciar(); proyectoExiste = false;
  assert.equal((await llamar(c.obtener, { params: { id: '99' } })).codigo, 404);
  assert.equal((await llamar(c.eliminar, { params: { id: '99' } })).codigo, 404);
  const act = await llamar(c.actualizar, { params: { id: '99' }, body: { nombre: 'X', actividades: redCpm } });
  assert.equal(act.codigo, 404);
  assert.equal(log.rollback, 1);
  assert.equal(log.commit, 0);
});

test('ids inválidos -> 400', async () => {
  reiniciar();
  for (const id of ['abc', '0', '-3', '1.5']) {
    assert.equal((await llamar(c.obtener, { params: { id } })).codigo, 400, id);
  }
});

test('error de base de datos -> 500', async () => {
  reiniciar(); dbDisponible = false;
  const r = await llamar(c.listar);
  assert.equal(r.codigo, 500);
  assert.equal(r.cuerpo.ok, false);
  dbDisponible = true;
});

// ---------- Seguimiento ----------
test('analizar guardado: incluye el seguimiento con el día de corte indicado', async () => {
  reiniciar();
  // A(3) al 50 %, B(2) al 0 %; día 3 -> plan 60 %, real 30 %
  const r = await llamar(c.analizarGuardado, { params: { id: '7' }, query: { dia: '3' } });
  assert.equal(r.cuerpo.seguimiento.diaCorte, 3);
  assert.ok(Math.abs(r.cuerpo.seguimiento.avancePlanificado - 60) < 1e-9);
  assert.ok(Math.abs(r.cuerpo.seguimiento.avanceReal - 30) < 1e-9);
  assert.equal(r.cuerpo.seguimiento.estado, 'atrasada');
  const mala = await llamar(c.analizarGuardado, { params: { id: '7' }, query: { dia: '-4' } });
  assert.equal(mala.codigo, 400);
});

test('seguimiento: valida antes de tocar la base de datos', async () => {
  reiniciar();
  const caso = (avances) => llamar(c.actualizarSeguimiento, { params: { id: '7' }, body: { avances } });
  assert.equal((await caso(undefined)).codigo, 400);
  assert.equal((await caso({})).codigo, 400);
  assert.match((await caso({ A: { avanceReal: 120 } })).cuerpo.error, /entre 0 y 100/);
  assert.match((await caso({ A: { avanceReal: '' } })).cuerpo.error, /entre 0 y 100/);
  assert.match((await caso({ A: { avanceReal: 10, inicioReal: '2026/11/02' } })).cuerpo.error, /AAAA-MM-DD/);
  assert.match((await caso({ A: { avanceReal: 10, inicioReal: '2026-11-05', finReal: '2026-11-02' } })).cuerpo.error, /anterior/);
  assert.equal(log.consultas.length, 0);
});

test('seguimiento: actividad inexistente -> 400 y se revierte', async () => {
  reiniciar();
  const r = await llamar(c.actualizarSeguimiento, { params: { id: '7' }, body: { avances: { Z: { avanceReal: 10 } } } });
  assert.equal(r.codigo, 400);
  assert.match(r.cuerpo.error, /no existe/);
  assert.equal(log.rollback, 1);
  assert.equal(log.commit, 0);
});

test('seguimiento: guarda el avance en una transacción', async () => {
  reiniciar();
  const r = await llamar(c.actualizarSeguimiento, { params: { id: '7' }, body: { avances: { A: { avanceReal: 80, inicioReal: '2026-11-02' }, B: { avanceReal: 0 } } } });
  assert.equal(r.codigo, 200);
  assert.equal(r.cuerpo.actualizadas, 2);
  assert.equal(log.consultas.filter((q) => /UPDATE dbo\.Actividad_Pert/.test(q)).length, 2);
  assert.equal(log.commit, 1);
});

test('seguimiento: proyecto inexistente -> 404', async () => {
  reiniciar(); proyectoExiste = false;
  const r = await llamar(c.actualizarSeguimiento, { params: { id: '99' }, body: { avances: { A: { avanceReal: 10 } } } });
  assert.equal(r.codigo, 404);
  assert.equal(log.rollback, 1);
});
