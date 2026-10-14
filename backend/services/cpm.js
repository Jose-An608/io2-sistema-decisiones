// =====================================================
// Algoritmos PERT / CPM (método de la ruta crítica)
//  - Pasada hacia adelante:  ES = máx EF(predecesoras),  EF = ES + duración
//  - Pasada hacia atrás:     LF = mín LS(sucesoras),     LS = LF - duración
//  - Holgura total = LS - ES;  holgura libre = mín ES(sucesoras) - EF
//  - PERT: te = (o + 4m + p)/6,  varianza = ((p - o)/6)²
// =====================================================
const { zDeNivelServicio } = require('./eoq');

const EPS = 1e-9;
const MAX_ACTIVIDADES = 200;
const MAX_RUTAS = 100;

// ---------- Normal estándar ----------
// Φ(z) con la aproximación de Abramowitz-Stegun 26.2.17 (error < 7.5e-8)
function probabilidadNormal(z) {
  if (!Number.isFinite(z)) throw new Error('El valor z no es válido.');
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

// ---------- Validación y normalización ----------
function numero(valor, etiqueta, { minimo = 0 } = {}) {
  if (valor === '' || valor === null || valor === undefined || typeof valor === 'boolean') {
    throw new Error(`${etiqueta} es obligatorio.`);
  }
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new Error(`${etiqueta} debe ser un número.`);
  if (n < minimo) throw new Error(`${etiqueta} no puede ser menor que ${minimo}.`);
  return n;
}

// modo: 'cpm' (una duración) o 'pert' (optimista, más probable, pesimista)
function normalizarActividades(actividades, modo) {
  if (modo !== 'cpm' && modo !== 'pert') throw new Error("El modo debe ser 'cpm' o 'pert'.");
  if (!Array.isArray(actividades) || actividades.length === 0) throw new Error('Ingresa al menos una actividad.');
  if (actividades.length > MAX_ACTIVIDADES) throw new Error(`Se admiten como máximo ${MAX_ACTIVIDADES} actividades.`);

  const ids = new Set();
  const lista = actividades.map((a, i) => {
    if (!a || typeof a !== 'object') throw new Error(`La actividad ${i + 1} no es válida.`);
    const id = String(a.id ?? '').trim();
    if (!id) throw new Error(`La actividad ${i + 1} necesita un identificador (por ejemplo A).`);
    if (id.length > 20) throw new Error(`El identificador "${id}" es muy largo (máximo 20 caracteres).`);
    const clave = id.toLowerCase();
    if (ids.has(clave)) throw new Error(`El identificador "${id}" está repetido.`);
    ids.add(clave);

    const nombre = String(a.nombre ?? '').trim().slice(0, 100);
    let predecesoras = a.predecesoras ?? [];
    if (typeof predecesoras === 'string') predecesoras = predecesoras.split(/[,;\s]+/);
    if (!Array.isArray(predecesoras)) throw new Error(`Las predecesoras de "${id}" no son válidas.`);
    predecesoras = [...new Set(predecesoras.map((p) => String(p).trim()).filter(Boolean))];

    let duracion; let o = null; let m = null; let p = null; let varianza = 0;
    if (modo === 'pert') {
      o = numero(a.optimista, `El tiempo optimista de "${id}"`);
      m = numero(a.masProbable, `El tiempo más probable de "${id}"`);
      p = numero(a.pesimista, `El tiempo pesimista de "${id}"`);
      if (!(o <= m && m <= p)) throw new Error(`En "${id}" se debe cumplir optimista ≤ más probable ≤ pesimista.`);
      duracion = (o + 4 * m + p) / 6;
      varianza = ((p - o) / 6) ** 2;
    } else {
      duracion = numero(a.duracion, `La duración de "${id}"`);
    }
    return { id, nombre, predecesoras, duracion, optimista: o, masProbable: m, pesimista: p, varianza };
  });

  // Las predecesoras deben existir (sin distinguir mayúsculas) y no ser la misma actividad
  const porClave = new Map(lista.map((a) => [a.id.toLowerCase(), a.id]));
  for (const a of lista) {
    a.predecesoras = a.predecesoras.map((p) => {
      const real = porClave.get(p.toLowerCase());
      if (!real) throw new Error(`La actividad "${a.id}" depende de "${p}", que no existe.`);
      if (real === a.id) throw new Error(`La actividad "${a.id}" no puede depender de sí misma.`);
      return real;
    });
  }
  return lista;
}

// Orden topológico (Kahn). Si queda alguna actividad sin ordenar hay un ciclo.
function ordenTopologico(lista) {
  const pendientes = new Map(lista.map((a) => [a.id, a.predecesoras.length]));
  const sucesoras = new Map(lista.map((a) => [a.id, []]));
  lista.forEach((a) => a.predecesoras.forEach((p) => sucesoras.get(p).push(a.id)));
  const cola = lista.filter((a) => a.predecesoras.length === 0).map((a) => a.id);
  const orden = [];
  while (cola.length) {
    const id = cola.shift();
    orden.push(id);
    for (const s of sucesoras.get(id)) {
      pendientes.set(s, pendientes.get(s) - 1);
      if (pendientes.get(s) === 0) cola.push(s);
    }
  }
  if (orden.length !== lista.length) {
    const atrapadas = lista.filter((a) => !orden.includes(a.id)).map((a) => a.id);
    throw new Error(`Hay una dependencia circular entre las actividades: ${atrapadas.join(', ')}.`);
  }
  return { orden, sucesoras };
}

// ---------- Cálculo principal ----------
function analizarRed(actividades, modo = 'cpm') {
  const lista = normalizarActividades(actividades, modo);
  const { orden, sucesoras } = ordenTopologico(lista);
  const por = new Map(lista.map((a) => [a.id, a]));

  // Hacia adelante
  for (const id of orden) {
    const a = por.get(id);
    a.es = a.predecesoras.length ? Math.max(...a.predecesoras.map((p) => por.get(p).ef)) : 0;
    a.ef = a.es + a.duracion;
  }
  const duracionProyecto = Math.max(...lista.map((a) => a.ef));

  // Hacia atrás
  for (const id of [...orden].reverse()) {
    const a = por.get(id);
    const sig = sucesoras.get(id);
    a.lf = sig.length ? Math.min(...sig.map((s) => por.get(s).ls)) : duracionProyecto;
    a.ls = a.lf - a.duracion;
  }

  // Holguras y nivel (columna) para dibujar la red
  const nivel = new Map();
  for (const id of orden) {
    const a = por.get(id);
    nivel.set(id, a.predecesoras.length ? Math.max(...a.predecesoras.map((p) => nivel.get(p))) + 1 : 0);
  }
  for (const a of lista) {
    a.holgura = a.ls - a.es;
    if (Math.abs(a.holgura) < EPS) a.holgura = 0;
    const sig = sucesoras.get(a.id);
    a.holguraLibre = (sig.length ? Math.min(...sig.map((s) => por.get(s).es)) : duracionProyecto) - a.ef;
    if (Math.abs(a.holguraLibre) < EPS) a.holguraLibre = 0;
    a.critica = a.holgura === 0;
    a.nivel = nivel.get(a.id);
    a.sucesoras = sucesoras.get(a.id);
  }

  // Todas las rutas críticas (siguiendo solo arcos críticos "ajustados")
  const rutasCriticas = [];
  const dfs = (id, camino) => {
    if (rutasCriticas.length >= MAX_RUTAS) return;
    const a = por.get(id);
    const camino2 = [...camino, id];
    const siguientes = a.sucesoras.filter((s) => por.get(s).critica && Math.abs(por.get(s).es - a.ef) < EPS);
    if (!siguientes.length) {
      if (Math.abs(a.ef - duracionProyecto) < EPS) rutasCriticas.push(camino2);
      return;
    }
    siguientes.forEach((s) => dfs(s, camino2));
  };
  lista.filter((a) => a.critica && a.predecesoras.length === 0 && a.es === 0).forEach((a) => dfs(a.id, []));

  const resultado = {
    modo,
    duracionProyecto,
    actividades: lista.map((a) => ({
      id: a.id, nombre: a.nombre, predecesoras: a.predecesoras, sucesoras: a.sucesoras,
      optimista: a.optimista, masProbable: a.masProbable, pesimista: a.pesimista,
      duracion: a.duracion, varianza: a.varianza,
      es: a.es, ef: a.ef, ls: a.ls, lf: a.lf,
      holgura: a.holgura, holguraLibre: a.holguraLibre, critica: a.critica, nivel: a.nivel,
    })),
    rutasCriticas: rutasCriticas.map((ids) => ({
      actividades: ids,
      duracion: ids.reduce((s, id) => s + por.get(id).duracion, 0),
      varianza: ids.reduce((s, id) => s + por.get(id).varianza, 0),
    })),
    actividadesCriticas: lista.filter((a) => a.critica).map((a) => a.id),
  };

  if (modo === 'pert') {
    // Con varias rutas críticas se toma la de mayor varianza (criterio conservador)
    const peor = resultado.rutasCriticas.reduce((m, r) => (r.varianza > m.varianza ? r : m), resultado.rutasCriticas[0]);
    resultado.varianzaProyecto = peor.varianza;
    resultado.desviacionProyecto = Math.sqrt(peor.varianza);
  }
  return resultado;
}

// ---------- Probabilidades PERT ----------
// P(terminar en a lo más T días)
function probabilidadTerminar(analisis, T) {
  if (analisis.modo !== 'pert') throw new Error('La probabilidad de terminar a tiempo solo aplica al modo PERT.');
  const t = numero(T, 'El plazo');
  const sigma = analisis.desviacionProyecto;
  if (sigma < EPS) {
    return { plazo: t, z: null, probabilidad: t >= analisis.duracionProyecto - EPS ? 1 : 0 };
  }
  const z = (t - analisis.duracionProyecto) / sigma;
  return { plazo: t, z, probabilidad: probabilidadNormal(z) };
}

// Plazo necesario para terminar con una probabilidad dada (0 < p < 1)
function plazoParaProbabilidad(analisis, probabilidad) {
  if (analisis.modo !== 'pert') throw new Error('El plazo por probabilidad solo aplica al modo PERT.');
  const p = numero(probabilidad, 'La probabilidad');
  if (!(p > 0 && p < 1)) throw new Error('La probabilidad debe estar entre 0 y 1 (sin incluirlos).');
  const z = zDeNivelServicio(p);
  return { probabilidad: p, z, plazo: analisis.duracionProyecto + z * analisis.desviacionProyecto };
}

module.exports = {
  analizarRed, probabilidadTerminar, plazoParaProbabilidad, probabilidadNormal,
  normalizarActividades, MAX_ACTIVIDADES,
};
