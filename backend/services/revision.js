// =====================================================
// revision.js - Modelos de revisión del inventario (funciones puras)
//
// Revisión continua (Q, R): se vigila el stock todo el tiempo; al llegar al
//   punto de pedido R se pide siempre la misma cantidad Q (la EOQ).
//
// Revisión periódica (T, M): cada T días se revisa el inventario y se pide lo
//   necesario para volver al nivel objetivo M:
//     M  = d*(T + L) + z*sigma_d*sqrt(T + L)
//     Q_pedido = M - posición de inventario
//   Protege durante el intervalo de revisión más el tiempo de entrega (T + L).
// =====================================================
const { normalizarParametros, cantidadEconomica, analizarProducto, zDeNivelServicio } = require('./eoq');

// ---------- Revisión continua (Q, R) ----------

function revisionContinua(parametros) {
  const a = analizarProducto(parametros);
  const prm = normalizarParametros(parametros);
  const inventarioPromedio = a.cantidadEconomica / 2 + a.stockSeguridad;
  const costoMantenimiento = inventarioPromedio * prm.H;
  const costoCompra = a.costoCompraAnual;
  return {
    modelo: 'continua',
    cantidadPedido: a.cantidadEconomica,
    puntoPedido: a.puntoPedido,
    stockSeguridad: a.stockSeguridad,
    diasEntrePedidos: a.diasEntrePedidos,
    pedidosPorAnio: a.pedidosPorAnio,
    inventarioMaximo: a.cantidadEconomica + a.stockSeguridad,
    inventarioPromedio,
    costoPedidoAnual: a.costoPedidoAnual,
    costoMantenimientoAnual: costoMantenimiento,
    costoCompraAnual: costoCompra,
    costoTotalAnual: costoCompra + a.costoPedidoAnual + costoMantenimiento,
  };
}

// ---------- Revisión periódica (T, M) ----------

// parametros: los de analizarProducto + diasRevision (opcional; por defecto el
// tiempo entre pedidos de la EOQ, redondeado a días enteros) + inventarioActual
// y enOrden (opcionales, para calcular cuánto pedir hoy).
function revisionPeriodica(parametros) {
  const prm = normalizarParametros(parametros);
  const Qeoq = cantidadEconomica(prm.demandaAnual, prm.costoPedido, prm.H);
  const diasEoq = (prm.diasAnio * Qeoq) / prm.demandaAnual;

  let T = parametros.diasRevision;
  if (T === undefined || T === null) {
    T = Math.max(1, Math.round(diasEoq));
  } else if (typeof T !== 'number' || !Number.isFinite(T) || T <= 0) {
    throw new Error('El intervalo de revisión debe ser un número de días mayor que 0.');
  }

  const d = prm.demandaAnual / prm.diasAnio;
  const horizonte = T + prm.tiempoEntregaDias;                 // período a proteger
  const z = zDeNivelServicio(prm.nivelServicio);
  const stockSeguridad = z * prm.desviacionDemandaDiaria * Math.sqrt(horizonte);
  const nivelObjetivo = d * horizonte + stockSeguridad;

  // Con este modelo se pide en promedio d*T unidades cada T días
  const cantidadPromedioPedido = d * T;
  const pedidosPorAnio = prm.diasAnio / T;
  const inventarioPromedio = cantidadPromedioPedido / 2 + stockSeguridad;
  const costoPedidoAnual = pedidosPorAnio * prm.costoPedido;
  const costoMantenimientoAnual = inventarioPromedio * prm.H;
  const costoCompraAnual = prm.demandaAnual * prm.costoUnitario;

  let cantidadAPedirHoy = null;
  if (parametros.inventarioActual !== undefined && parametros.inventarioActual !== null) {
    const posicion = parametros.inventarioActual + (parametros.enOrden || 0);
    if (typeof posicion !== 'number' || !Number.isFinite(posicion)) {
      throw new Error('El inventario actual debe ser un número.');
    }
    cantidadAPedirHoy = Math.max(0, nivelObjetivo - posicion);
  }

  return {
    modelo: 'periodica',
    diasRevision: T,
    nivelObjetivo,
    stockSeguridad,
    cantidadPromedioPedido,
    cantidadAPedirHoy,
    pedidosPorAnio,
    inventarioMaximo: nivelObjetivo,
    inventarioPromedio,
    costoPedidoAnual,
    costoMantenimientoAnual,
    costoCompraAnual,
    costoTotalAnual: costoCompraAnual + costoPedidoAnual + costoMantenimientoAnual,
  };
}

// Compara ambos modelos con los mismos datos
function compararPoliticas(parametros) {
  const continua = revisionContinua(parametros);
  const periodica = revisionPeriodica(parametros);
  const ahorro = periodica.costoTotalAnual - continua.costoTotalAnual;
  return {
    continua,
    periodica,
    masEconomico: ahorro > 1e-9 ? 'continua' : ahorro < -1e-9 ? 'periodica' : 'igual',
    diferenciaAnual: Math.abs(ahorro),
  };
}

module.exports = { revisionContinua, revisionPeriodica, compararPoliticas };
