// =====================================================
// abc.js - Clasificación ABC de inventarios (funciones puras)
//
// Valor anual = demanda anual x costo unitario.
// Se ordena de mayor a menor y se acumula el porcentaje del valor total:
//   A: hasta el corte A (por defecto 80 %)
//   B: hasta el corte B (por defecto 95 %)
//   C: el resto
// Un producto entra en la clase cuyo corte alcanza su porcentaje acumulado
// (el primer producto siempre es A, aunque él solo supere el corte).
// =====================================================

const EPS = 1e-9;

function clasificarABC(productos, opciones = {}) {
  const corteA = opciones.corteA ?? 80;
  const corteB = opciones.corteB ?? 95;

  if (!Array.isArray(productos) || productos.length === 0) {
    throw new Error('Se necesita al menos un producto para el análisis ABC.');
  }
  if (!(corteA > 0 && corteA < corteB && corteB <= 100)) {
    throw new Error('Los cortes deben cumplir 0 < corte A < corte B <= 100.');
  }

  const items = productos.map((p, i) => {
    const nombre = p.nombre ?? `Producto ${i + 1}`;
    const demanda = p.demandaAnual;
    const costo = p.costoUnitario;
    if (typeof demanda !== 'number' || !Number.isFinite(demanda) || demanda < 0) {
      throw new Error(`La demanda anual de "${nombre}" debe ser un número mayor o igual a 0.`);
    }
    if (typeof costo !== 'number' || !Number.isFinite(costo) || costo < 0) {
      throw new Error(`El costo unitario de "${nombre}" debe ser un número mayor o igual a 0.`);
    }
    return { id: p.id ?? null, nombre, demandaAnual: demanda, costoUnitario: costo, valorAnual: demanda * costo };
  });

  const total = items.reduce((a, x) => a + x.valorAnual, 0);
  if (total <= 0) throw new Error('El valor anual total es 0: no se puede clasificar.');

  // Mayor valor primero (a igual valor, orden alfabético para que sea estable)
  items.sort((x, y) => y.valorAnual - x.valorAnual || String(x.nombre).localeCompare(String(y.nombre)));

  let acumulado = 0;
  items.forEach((x, i) => {
    acumulado += x.valorAnual;
    x.porcentaje = (x.valorAnual / total) * 100;
    x.porcentajeAcumulado = (acumulado / total) * 100;
    x.porcentajeProductosAcumulado = ((i + 1) / items.length) * 100;
    if (i === 0 || x.porcentajeAcumulado <= corteA + EPS) x.clase = 'A';
    else if (x.porcentajeAcumulado <= corteB + EPS) x.clase = 'B';
    else x.clase = 'C';
  });

  const resumen = ['A', 'B', 'C'].map((clase) => {
    const grupo = items.filter((x) => x.clase === clase);
    const valor = grupo.reduce((a, x) => a + x.valorAnual, 0);
    return {
      clase,
      cantidad: grupo.length,
      porcentajeProductos: (grupo.length / items.length) * 100,
      valorAnual: valor,
      porcentajeValor: (valor / total) * 100,
    };
  });

  return { corteA, corteB, valorTotal: total, productos: items, resumen };
}

module.exports = { clasificarABC };
