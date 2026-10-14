// =====================================================
// arbolDecision.js - Árboles de decisión (funciones puras, sin base de datos)
//
// Estructura de un nodo:
//   { tipo: 'decision' | 'azar' | 'terminal', etiqueta, pago?, ramas: [rama] }
// Estructura de una rama (arista hacia un nodo hijo):
//   { etiqueta, valorRama, probabilidad, nodo }
//   - valorRama: costo o beneficio de tomar esa rama (con el mismo signo que los
//     pagos: en un árbol de beneficios, un costo se escribe negativo).
//   - probabilidad: solo en ramas que salen de un nodo de azar (deben sumar 1).
// El pago solo existe en nodos terminales.
//
// Evaluación hacia atrás (roll-back):
//   terminal -> su pago
//   azar     -> suma(probabilidad * (valorRama + valor del hijo))
//   decisión -> mejor (valorRama + valor del hijo): mayor si son beneficios,
//               menor si son costos
// =====================================================
const { validarTipo } = require('./criterios');

const EPS = 1e-9;
const MAX_NODOS = 500;
const MAX_PROFUNDIDAD = 25;
const TIPOS_NODO = ['decision', 'azar', 'terminal'];
const ETIQUETA_POR_DEFECTO = { decision: 'Decisión', azar: 'Evento', terminal: 'Resultado' };

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------- Validación y normalización ----------

// Valida el árbol completo y devuelve una copia limpia (con valores por defecto).
// Lanza Error con un mensaje claro en español si algo está mal.
function normalizarArbol(raiz) {
  let contador = 0;

  const recorrer = (n, profundidad, ruta) => {
    if (!n || typeof n !== 'object') throw new Error(`Falta un nodo en "${ruta}".`);
    contador += 1;
    if (contador > MAX_NODOS) throw new Error(`El árbol no puede tener más de ${MAX_NODOS} nodos.`);
    if (profundidad > MAX_PROFUNDIDAD) throw new Error(`El árbol no puede tener más de ${MAX_PROFUNDIDAD} niveles.`);
    if (!TIPOS_NODO.includes(n.tipo)) throw new Error(`El nodo "${ruta}" tiene un tipo inválido (usa decision, azar o terminal).`);

    const etiqueta = String(n.etiqueta ?? '').trim() || ETIQUETA_POR_DEFECTO[n.tipo];
    if (etiqueta.length > 100) throw new Error(`La etiqueta "${etiqueta.slice(0, 20)}…" supera 100 caracteres.`);
    const nombre = ruta ? `${ruta} > ${etiqueta}` : etiqueta;

    if (n.tipo === 'terminal') {
      if (n.ramas && n.ramas.length > 0) throw new Error(`El nodo terminal "${nombre}" no puede tener ramas.`);
      if (!esNumero(n.pago)) throw new Error(`El nodo terminal "${nombre}" necesita un pago numérico.`);
      return { tipo: 'terminal', etiqueta, pago: n.pago, ramas: [] };
    }

    if (!Array.isArray(n.ramas) || n.ramas.length < 2) {
      throw new Error(`El nodo de ${n.tipo === 'azar' ? 'azar' : 'decisión'} "${nombre}" necesita al menos 2 ramas.`);
    }

    const ramas = n.ramas.map((r, i) => {
      if (!r || typeof r !== 'object') throw new Error(`Rama ${i + 1} inválida en "${nombre}".`);
      const etiquetaRama = String(r.etiqueta ?? '').trim() || `Rama ${i + 1}`;
      if (etiquetaRama.length > 100) throw new Error(`La etiqueta de la rama "${etiquetaRama.slice(0, 20)}…" supera 100 caracteres.`);
      const valorRama = r.valorRama === undefined || r.valorRama === null ? 0 : r.valorRama;
      if (!esNumero(valorRama)) throw new Error(`El valor de la rama "${etiquetaRama}" en "${nombre}" no es un número válido.`);

      let probabilidad = null;
      if (n.tipo === 'azar') {
        probabilidad = r.probabilidad;
        if (!esNumero(probabilidad) || probabilidad < 0 || probabilidad > 1) {
          throw new Error(`La rama "${etiquetaRama}" de "${nombre}" necesita una probabilidad entre 0 y 1.`);
        }
      }
      return {
        etiqueta: etiquetaRama,
        valorRama,
        probabilidad,
        nodo: recorrer(r.nodo, profundidad + 1, `${nombre} > ${etiquetaRama}`),
      };
    });

    if (n.tipo === 'azar') {
      const suma = ramas.reduce((a, r) => a + r.probabilidad, 0);
      if (Math.abs(suma - 1) > 1e-6) {
        throw new Error(`Las probabilidades del nodo de azar "${nombre}" deben sumar 1 (suman ${Number(suma.toFixed(6))}).`);
      }
    }
    return { tipo: n.tipo, etiqueta, ramas };
  };

  return recorrer(raiz, 0, '');
}

// ---------- Evaluación ----------

// Recorre solo las decisiones óptimas: en cada nodo de decisión sigue la rama
// elegida; en los nodos de azar sigue todas las ramas.
// "cuando" indica el evento (ramas de azar) que debe haber ocurrido para llegar ahí.
function recolectarPolitica(nodo, lista, cuando) {
  if (nodo.tipo === 'terminal') return;
  if (nodo.tipo === 'decision') {
    const elegida = nodo.ramas[nodo.elegidas[0]];
    lista.push({
      nodo: nodo.etiqueta,
      cuando: cuando.slice(),
      eleccion: elegida.etiqueta,
      valor: elegida.valorTotal,
      empate: nodo.elegidas.length > 1,
      alternativas: nodo.ramas.map((r, i) => ({
        etiqueta: r.etiqueta, valorTotal: r.valorTotal, elegida: nodo.elegidas.includes(i),
      })),
    });
    recolectarPolitica(elegida.nodo, lista, cuando);
  } else {
    nodo.ramas.forEach((r) => recolectarPolitica(r.nodo, lista, cuando.concat(r.etiqueta)));
  }
}

function profundidadDe(n) {
  return n.ramas.length === 0 ? 0 : 1 + Math.max(...n.ramas.map((r) => profundidadDe(r.nodo)));
}

function contarNodos(n) {
  return 1 + n.ramas.reduce((a, r) => a + contarNodos(r.nodo), 0);
}

// Evalúa el árbol hacia atrás.
// tipo: 'beneficio' (se maximiza en las decisiones) o 'costo' (se minimiza).
// Devuelve el árbol anotado: cada nodo con valorEsperado; cada rama con
// valorHijo, valorTotal y elegida; los nodos de decisión con las ramas elegidas.
function evaluarArbol(raiz, tipo = 'beneficio') {
  validarTipo(tipo);
  const arbol = normalizarArbol(raiz);
  const maximizar = tipo === 'beneficio';

  const evaluar = (n) => {
    if (n.tipo === 'terminal') {
      n.valorEsperado = n.pago;
      return n.valorEsperado;
    }
    n.ramas.forEach((r) => {
      r.valorHijo = evaluar(r.nodo);
      r.valorTotal = r.valorRama + r.valorHijo;
    });
    if (n.tipo === 'azar') {
      n.valorEsperado = n.ramas.reduce((a, r) => a + r.probabilidad * r.valorTotal, 0);
      n.ramas.forEach((r) => { r.elegida = true; });
    } else {
      const valores = n.ramas.map((r) => r.valorTotal);
      const mejor = maximizar ? Math.max(...valores) : Math.min(...valores);
      n.elegidas = [];
      valores.forEach((v, i) => { if (Math.abs(v - mejor) <= EPS) n.elegidas.push(i); });
      n.ramas.forEach((r, i) => { r.elegida = n.elegidas.includes(i); });
      n.valorEsperado = mejor;
    }
    return n.valorEsperado;
  };
  evaluar(arbol);

  const politica = [];
  recolectarPolitica(arbol, politica, []);
  return {
    tipo,
    arbol,
    valorEsperado: arbol.valorEsperado,
    politica,
    totalNodos: contarNodos(arbol),
    profundidad: profundidadDe(arbol),
  };
}

// ---------- Ejemplo resuelto (Thompson Lumber) ----------
// ¿Conviene pagar 10 000 por un estudio de mercado antes de elegir el tamaño de la planta?
// Resultado esperado: con estudio 49 200 > sin estudio 40 000.
function ejemploThompson() {
  const terminal = (pago, etiqueta = 'Resultado') => ({ tipo: 'terminal', etiqueta, pago, ramas: [] });
  const rama = (etiqueta, nodo, valorRama = 0, probabilidad = null) => ({ etiqueta, valorRama, probabilidad, nodo });
  const mercado = (pf, pd, pagoF, pagoD) => ({
    tipo: 'azar', etiqueta: 'Mercado',
    ramas: [rama('Favorable', terminal(pagoF), 0, pf), rama('Desfavorable', terminal(pagoD), 0, pd)],
  });
  const tamano = (pf, pd) => ({
    tipo: 'decision', etiqueta: 'Tamaño de planta',
    ramas: [
      rama('Planta grande', mercado(pf, pd, 200000, -180000)),
      rama('Planta pequeña', mercado(pf, pd, 100000, -20000)),
      rama('No hacer nada', terminal(0, 'Sin inversión')),
    ],
  });
  return {
    tipo: 'decision', etiqueta: 'Estudio de mercado',
    ramas: [
      rama('Realizar estudio', {
        tipo: 'azar', etiqueta: 'Resultado del estudio',
        ramas: [
          rama('Resultado positivo', tamano(0.78, 0.22), 0, 0.45),
          rama('Resultado negativo', tamano(0.27, 0.73), 0, 0.55),
        ],
      }, -10000),
      rama('No realizar estudio', tamano(0.5, 0.5)),
    ],
  };
}

module.exports = { normalizarArbol, evaluarArbol, ejemploThompson, MAX_NODOS, MAX_PROFUNDIDAD };
