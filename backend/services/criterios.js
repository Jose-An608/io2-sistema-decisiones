// =====================================================
// criterios.js - Teoría de decisiones (funciones puras, sin base de datos)
//
// Matriz de pagos: matriz[i][j] = pago de la alternativa i bajo el estado j.
// tipo: 'beneficio' (mayor es mejor) o 'costo' (menor es mejor).
//
// Criterios bajo incertidumbre: Maximax, Maximin, Hurwicz, Laplace, Savage.
// Criterio bajo riesgo: Valor Monetario Esperado (VME) y VEIP.
// =====================================================

const EPS = 1e-9;

// ---------- Validaciones ----------

function validarTipo(tipo) {
  if (tipo !== 'beneficio' && tipo !== 'costo') {
    throw new Error("El tipo debe ser 'beneficio' o 'costo'.");
  }
}

function validarMatriz(matriz) {
  if (!Array.isArray(matriz) || matriz.length === 0) {
    throw new Error('La matriz de pagos debe tener al menos una alternativa.');
  }
  const nEstados = Array.isArray(matriz[0]) ? matriz[0].length : 0;
  if (nEstados === 0) {
    throw new Error('La matriz de pagos debe tener al menos un estado de la naturaleza.');
  }
  matriz.forEach((fila, i) => {
    if (!Array.isArray(fila) || fila.length !== nEstados) {
      throw new Error(`La fila ${i + 1} no tiene ${nEstados} estados.`);
    }
    fila.forEach((v, j) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(`El pago de la alternativa ${i + 1}, estado ${j + 1} no es un número válido.`);
      }
    });
  });
}

function validarProbabilidades(prob, nEstados) {
  if (!Array.isArray(prob) || prob.length !== nEstados) {
    throw new Error(`Se requieren ${nEstados} probabilidades (una por estado).`);
  }
  prob.forEach((p, j) => {
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error(`La probabilidad del estado ${j + 1} debe estar entre 0 y 1.`);
    }
  });
  const suma = prob.reduce((a, b) => a + b, 0);
  if (Math.abs(suma - 1) > 1e-6) {
    throw new Error(`Las probabilidades deben sumar 1 (suman ${suma}).`);
  }
}

// ---------- Auxiliares ----------

const sumar = (arr) => arr.reduce((a, b) => a + b, 0);
const maxDe = (arr) => Math.max(...arr);
const minDe = (arr) => Math.min(...arr);

// Mejor valor de cada columna (estado): máximo si es beneficio, mínimo si es costo
function mejorPorEstado(matriz, tipo) {
  const nEstados = matriz[0].length;
  const res = [];
  for (let j = 0; j < nEstados; j++) {
    const col = matriz.map((fila) => fila[j]);
    res.push(tipo === 'beneficio' ? maxDe(col) : minDe(col));
  }
  return res;
}

// Arma el resultado de un criterio y elige la(s) mejor(es) alternativa(s).
// maximizar = true: gana el mayor valor; false: gana el menor. Soporta empates.
function armarResultado(criterio, valores, maximizar, nombres) {
  const mejor = maximizar ? maxDe(valores) : minDe(valores);
  const indices = [];
  valores.forEach((v, i) => { if (Math.abs(v - mejor) <= EPS) indices.push(i); });
  return {
    criterio,
    valores,
    mejorValor: mejor,
    indices,
    alternativas: indices.map((i) => (nombres ? nombres[i] : `Alternativa ${i + 1}`)),
  };
}

// ---------- Criterios bajo incertidumbre ----------

// Optimista: toma el mejor pago de cada alternativa y elige la mejor de ellas.
// Beneficio: maximax. Costo: minimin.
function maximax(matriz, tipo = 'beneficio', nombres) {
  validarMatriz(matriz); validarTipo(tipo);
  const b = tipo === 'beneficio';
  const valores = matriz.map((f) => (b ? maxDe(f) : minDe(f)));
  return armarResultado(b ? 'Maximax' : 'Minimin', valores, b, nombres);
}

// Pesimista: toma el peor pago de cada alternativa y elige la mejor de ellas.
// Beneficio: maximin. Costo: minimax.
function maximin(matriz, tipo = 'beneficio', nombres) {
  validarMatriz(matriz); validarTipo(tipo);
  const b = tipo === 'beneficio';
  const valores = matriz.map((f) => (b ? minDe(f) : maxDe(f)));
  return armarResultado(b ? 'Maximin' : 'Minimax', valores, b, nombres);
}

// Hurwicz: alfa = coeficiente de optimismo (0 = pesimista, 1 = optimista).
// Beneficio: alfa*mejor + (1-alfa)*peor, se elige el mayor.
// Costo:     alfa*menor + (1-alfa)*mayor, se elige el menor.
function hurwicz(matriz, alfa, tipo = 'beneficio', nombres) {
  validarMatriz(matriz); validarTipo(tipo);
  if (typeof alfa !== 'number' || !Number.isFinite(alfa) || alfa < 0 || alfa > 1) {
    throw new Error('El coeficiente alfa de Hurwicz debe estar entre 0 y 1.');
  }
  const b = tipo === 'beneficio';
  const valores = matriz.map((f) => {
    const mejor = b ? maxDe(f) : minDe(f);
    const peor = b ? minDe(f) : maxDe(f);
    return alfa * mejor + (1 - alfa) * peor;
  });
  return armarResultado(`Hurwicz (α=${alfa})`, valores, b, nombres);
}

// Laplace: todos los estados son igualmente probables; se usa el promedio.
function laplace(matriz, tipo = 'beneficio', nombres) {
  validarMatriz(matriz); validarTipo(tipo);
  const valores = matriz.map((f) => sumar(f) / f.length);
  return armarResultado('Laplace', valores, tipo === 'beneficio', nombres);
}

// Matriz de arrepentimiento (pérdida de oportunidad).
// Beneficio: mejor de la columna - pago. Costo: pago - mejor (menor) de la columna.
function matrizArrepentimiento(matriz, tipo = 'beneficio') {
  validarMatriz(matriz); validarTipo(tipo);
  const mejores = mejorPorEstado(matriz, tipo);
  return matriz.map((fila) =>
    fila.map((v, j) => (tipo === 'beneficio' ? mejores[j] - v : v - mejores[j])));
}

// Savage (minimax del arrepentimiento): se elige la alternativa cuyo
// arrepentimiento máximo sea el menor. Siempre se minimiza.
function savage(matriz, tipo = 'beneficio', nombres) {
  const arrep = matrizArrepentimiento(matriz, tipo);
  const valores = arrep.map((f) => maxDe(f));
  const res = armarResultado('Savage', valores, false, nombres);
  res.matrizArrepentimiento = arrep;
  return res;
}

// ---------- Criterios bajo riesgo ----------

// Valor Monetario Esperado: suma(probabilidad * pago) por alternativa.
function vme(matriz, probabilidades, tipo = 'beneficio', nombres) {
  validarMatriz(matriz); validarTipo(tipo);
  validarProbabilidades(probabilidades, matriz[0].length);
  const valores = matriz.map((f) => sumar(f.map((v, j) => v * probabilidades[j])));
  return armarResultado('VME', valores, tipo === 'beneficio', nombres);
}

// Valor Esperado de la Información Perfecta.
// VEcIP = suma(prob * mejor pago de cada estado). VEIP = |VEcIP - mejor VME|.
function veip(matriz, probabilidades, tipo = 'beneficio') {
  validarMatriz(matriz); validarTipo(tipo);
  validarProbabilidades(probabilidades, matriz[0].length);
  const mejores = mejorPorEstado(matriz, tipo);
  const conInfoPerfecta = sumar(mejores.map((v, j) => v * probabilidades[j]));
  const mejorVME = vme(matriz, probabilidades, tipo).mejorValor;
  return {
    valorConInformacionPerfecta: conInfoPerfecta,
    mejorVME,
    veip: Math.abs(conInfoPerfecta - mejorVME),
  };
}

// ---------- Análisis completo ----------

// Aplica todos los criterios y arma una tabla comparativa.
// datos: { matriz, alternativas?, tipo?, alfa?, probabilidades? }
// Si no hay probabilidades no se calculan VME ni VEIP.
function analizar({ matriz, alternativas, tipo = 'beneficio', alfa = 0.5, probabilidades }) {
  validarMatriz(matriz); validarTipo(tipo);
  const nombres = alternativas && alternativas.length === matriz.length
    ? alternativas
    : matriz.map((_, i) => `Alternativa ${i + 1}`);

  const criterios = [
    maximax(matriz, tipo, nombres),
    maximin(matriz, tipo, nombres),
    hurwicz(matriz, alfa, tipo, nombres),
    laplace(matriz, tipo, nombres),
    savage(matriz, tipo, nombres),
  ];
  let informacionPerfecta = null;
  if (probabilidades) {
    criterios.push(vme(matriz, probabilidades, tipo, nombres));
    informacionPerfecta = veip(matriz, probabilidades, tipo);
  }

  // Cuántos criterios recomiendan cada alternativa (los empates cuentan para todas)
  const votos = nombres.map(() => 0);
  criterios.forEach((c) => c.indices.forEach((i) => { votos[i] += 1; }));

  return {
    tipo,
    alternativas: nombres,
    criterios,
    matrizArrepentimiento: matrizArrepentimiento(matriz, tipo),
    informacionPerfecta,
    votos: nombres.map((n, i) => ({ alternativa: n, criterios: votos[i] })),
  };
}

module.exports = {
  maximax, maximin, hurwicz, laplace, savage, vme, veip,
  matrizArrepentimiento, analizar,
  validarMatriz, validarProbabilidades, validarTipo,
};
