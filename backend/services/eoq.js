// =====================================================
// eoq.js - Cantidad económica de pedido, punto de pedido y stock de seguridad
// (funciones puras, sin base de datos)
//
// Supuestos del modelo EOQ clásico:
//   - Demanda anual conocida y constante.
//   - Reposición de todo el pedido de una vez, con tiempo de entrega conocido.
//   - Sin faltantes planeados ni descuentos por cantidad.
// Para el stock de seguridad se supone que la demanda diaria es variable con
// distribución normal (desviación estándar diaria) e independiente entre días.
//
// Fórmulas:
//   H   = i*c + a                (mantenimiento por unidad y año: capital + almacenamiento)
//   Q*  = sqrt(2*D*S / H)
//   N   = D / Q*                 (pedidos por año)
//   T   = diasAnio / N           (días entre pedidos)
//   CT  = D*c + (D/Q)*S + (Q/2)*H
//   d   = D / diasAnio           (demanda diaria)
//   SS  = z * sigma_d * sqrt(L)  (stock de seguridad)
//   ROP = d*L + SS               (punto de pedido)
// =====================================================

// ---------- Validaciones ----------

function exigir(valor, nombre, { positivo = false, minimo = 0, maximo = Infinity } = {}) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new Error(`${nombre} debe ser un número.`);
  }
  if (positivo && valor <= 0) throw new Error(`${nombre} debe ser mayor que 0.`);
  if (valor < minimo) throw new Error(`${nombre} no puede ser menor que ${minimo}.`);
  if (valor > maximo) throw new Error(`${nombre} no puede ser mayor que ${maximo}.`);
  return valor;
}

// ---------- Distribución normal ----------

// Valor z tal que P(Z <= z) = p  (nivel de servicio -> z). Algoritmo de Acklam.
function zDeNivelServicio(p) {
  if (typeof p !== 'number' || !(p > 0 && p < 1)) {
    throw new Error('El nivel de servicio debe estar entre 0 y 1 (sin incluir 0 ni 1).');
  }
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pBajo = 0.02425;

  if (p < pBajo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pBajo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ---------- Parámetros ----------

// Lee y valida los parámetros de un producto (con valores por defecto)
function normalizarParametros(p) {
  const demandaAnual = exigir(p.demandaAnual, 'La demanda anual', { positivo: true });
  const costoPedido = exigir(p.costoPedido, 'El costo de pedido', { positivo: true });
  const costoUnitario = exigir(p.costoUnitario ?? 0, 'El costo unitario', { minimo: 0 });
  const tasaMantenimiento = exigir(p.tasaMantenimiento ?? 0, 'La tasa de mantenimiento', { minimo: 0, maximo: 1 });
  const costoAlmacenamientoUnidad = exigir(p.costoAlmacenamientoUnidad ?? 0, 'El costo de almacenamiento por unidad', { minimo: 0 });
  const tiempoEntregaDias = exigir(p.tiempoEntregaDias ?? 0, 'El tiempo de entrega', { minimo: 0 });
  const desviacionDemandaDiaria = exigir(p.desviacionDemandaDiaria ?? 0, 'La desviación estándar de la demanda diaria', { minimo: 0 });
  const nivelServicio = exigir(p.nivelServicio ?? 0.95, 'El nivel de servicio', { positivo: true, maximo: 0.9999 });
  const diasAnio = exigir(p.diasAnio ?? 365, 'Los días del año', { positivo: true, maximo: 366 });

  // Mantenimiento unitario: se puede dar directo o como capital + almacenamiento
  const directo = p.costoMantenimientoUnidad !== undefined && p.costoMantenimientoUnidad !== null;
  const capital = directo ? 0 : tasaMantenimiento * costoUnitario;
  const H = directo
    ? exigir(p.costoMantenimientoUnidad, 'El costo de mantenimiento por unidad', { positivo: true })
    : capital + costoAlmacenamientoUnidad;
  if (!(H > 0)) {
    throw new Error('El costo de mantenimiento por unidad y año debe ser mayor que 0 (indica la tasa de mantenimiento o el costo de almacenamiento).');
  }
  return {
    demandaAnual, costoPedido, costoUnitario, tasaMantenimiento, costoAlmacenamientoUnidad,
    tiempoEntregaDias, desviacionDemandaDiaria, nivelServicio, diasAnio, H, capital,
  };
}

// ---------- EOQ ----------

// Cantidad económica de pedido para una demanda D, costo de pedido S y mantenimiento H
function cantidadEconomica(D, S, H) {
  exigir(D, 'La demanda anual', { positivo: true });
  exigir(S, 'El costo de pedido', { positivo: true });
  exigir(H, 'El costo de mantenimiento por unidad', { positivo: true });
  return Math.sqrt((2 * D * S) / H);
}

// Costos anuales para un tamaño de lote Q cualquiera
function costosParaLote(prm, Q) {
  const pedidos = prm.demandaAnual / Q;
  const costoPedidoAnual = pedidos * prm.costoPedido;
  const inventarioPromedio = Q / 2;
  const costoMantenimientoAnual = inventarioPromedio * prm.H;
  return { pedidosPorAnio: pedidos, costoPedidoAnual, costoMantenimientoAnual };
}

// Análisis completo de un producto: EOQ, costos, stock de seguridad y punto de pedido
function analizarProducto(parametros) {
  const prm = normalizarParametros(parametros);
  const Q = cantidadEconomica(prm.demandaAnual, prm.costoPedido, prm.H);
  const { pedidosPorAnio, costoPedidoAnual, costoMantenimientoAnual } = costosParaLote(prm, Q);

  const demandaDiaria = prm.demandaAnual / prm.diasAnio;
  const demandaTiempoEntrega = demandaDiaria * prm.tiempoEntregaDias;
  const desviacionTiempoEntrega = prm.desviacionDemandaDiaria * Math.sqrt(prm.tiempoEntregaDias);
  const z = zDeNivelServicio(prm.nivelServicio);
  const stockSeguridad = z * desviacionTiempoEntrega;
  const puntoPedido = demandaTiempoEntrega + stockSeguridad;

  const costoCompraAnual = prm.demandaAnual * prm.costoUnitario;
  const costoTotalAnual = costoCompraAnual + costoPedidoAnual + costoMantenimientoAnual;
  const costoMantenerSeguridad = stockSeguridad * prm.H;

  return {
    // costos unitarios
    costoMantenimientoUnidad: prm.H,
    costoCapitalUnidad: prm.capital,
    costoAlmacenamientoUnidad: prm.H - prm.capital,
    // política EOQ
    cantidadEconomica: Q,
    lotePractico: Math.max(1, Math.round(Q)),
    pedidosPorAnio,
    diasEntrePedidos: prm.diasAnio / pedidosPorAnio,
    inventarioPromedio: Q / 2,
    inventarioMaximo: Q + stockSeguridad,
    // costos anuales (en el óptimo el de pedido y el de mantenimiento son iguales)
    costoPedidoAnual,
    costoMantenimientoAnual,
    costoMantenimientoCapitalAnual: (Q / 2) * prm.capital,
    costoMantenimientoAlmacenAnual: (Q / 2) * (prm.H - prm.capital),
    costoCompraAnual,
    costoTotalAnual,
    // reposición
    demandaDiaria,
    demandaTiempoEntrega,
    desviacionTiempoEntrega,
    nivelServicio: prm.nivelServicio,
    probabilidadFaltante: 1 - prm.nivelServicio,
    z,
    stockSeguridad,
    puntoPedido,
    costoMantenerSeguridadAnual: costoMantenerSeguridad,
    costoTotalAnualConSeguridad: costoTotalAnual + costoMantenerSeguridad,
  };
}

// Puntos de la curva de costos en función del lote Q (para el gráfico costo total vs Q).
// El costo total aquí es el variable: pedido + mantenimiento (la compra no depende de Q).
function curvaCostos(parametros, { puntos = 25, factorMin = 0.25, factorMax = 2.5 } = {}) {
  const prm = normalizarParametros(parametros);
  const Qopt = cantidadEconomica(prm.demandaAnual, prm.costoPedido, prm.H);
  const desde = Math.max(1, Qopt * factorMin);
  const hasta = Qopt * factorMax;
  const filas = [];
  for (let i = 0; i < puntos; i++) {
    const Q = desde + ((hasta - desde) * i) / (puntos - 1);
    const c = costosParaLote(prm, Q);
    filas.push({
      cantidad: Q,
      costoPedido: c.costoPedidoAnual,
      costoMantenimiento: c.costoMantenimientoAnual,
      costoTotal: c.costoPedidoAnual + c.costoMantenimientoAnual,
    });
  }
  const optimo = costosParaLote(prm, Qopt);
  return {
    cantidadEconomica: Qopt,
    costoMinimo: optimo.costoPedidoAnual + optimo.costoMantenimientoAnual,
    puntos: filas,
  };
}

// ---------- Simulación del stock (gráfico de diente de sierra) ----------

// Simula el inventario día a día con demanda constante y política (Q, R):
// cuando la posición de inventario (stock + pedidos en camino) cae a R o menos,
// se pide Q, que llega tras tiempoEntregaDias.
function simularDienteSierra({ cantidadPedido, puntoPedido, demandaDiaria, tiempoEntregaDias, stockInicial, dias }) {
  exigir(cantidadPedido, 'La cantidad de pedido', { positivo: true });
  exigir(puntoPedido, 'El punto de pedido', { minimo: 0 });
  exigir(demandaDiaria, 'La demanda diaria', { positivo: true });
  exigir(tiempoEntregaDias, 'El tiempo de entrega', { minimo: 0 });
  exigir(stockInicial, 'El stock inicial', { minimo: 0 });
  exigir(dias, 'Los días a simular', { positivo: true, maximo: 3650 });

  const L = Math.round(tiempoEntregaDias);
  const llegadas = new Map(); // día -> cantidad
  let stock = stockInicial;
  let enCamino = 0;
  const serie = [{ dia: 0, stock, pedido: false, llegada: false, faltante: 0 }];

  for (let dia = 1; dia <= dias; dia++) {
    let llegada = false;
    if (llegadas.has(dia)) {
      stock += llegadas.get(dia);
      enCamino -= llegadas.get(dia);
      llegada = true;
    }
    stock -= demandaDiaria;
    let faltante = 0;
    if (stock < 0) { faltante = -stock; stock = 0; }
    let pedido = false;
    if (stock + enCamino <= puntoPedido + 1e-9) {
      llegadas.set(dia + Math.max(L, 1), (llegadas.get(dia + Math.max(L, 1)) || 0) + cantidadPedido);
      enCamino += cantidadPedido;
      pedido = true;
    }
    serie.push({ dia, stock, pedido, llegada, faltante });
  }
  return serie;
}

// ---------- Alertas de stock ----------

// Evalúa el estado de un producto según su stock actual.
//   agotado : stock <= 0
//   riesgo  : el stock no alcanza a cubrir la demanda del tiempo de entrega
//             (se agotaría antes de que llegue un pedido nuevo)
//   pedir   : stock en o bajo el punto de pedido -> hay que reponer
//   ok      : stock suficiente
// Si ya hay pedidos en camino, la posición de inventario los incluye.
function evaluarAlerta({ stockActual, puntoPedido, stockSeguridad = 0, demandaDiaria, tiempoEntregaDias = 0, enOrden = 0, cantidadEconomica = null }) {
  exigir(stockActual, 'El stock actual');
  exigir(puntoPedido, 'El punto de pedido', { minimo: 0 });
  exigir(demandaDiaria, 'La demanda diaria', { minimo: 0 });
  exigir(enOrden, 'Las unidades en pedido', { minimo: 0 });

  const posicion = stockActual + enOrden;
  const diasCobertura = demandaDiaria > 0 ? Math.max(0, stockActual) / demandaDiaria : Infinity;
  const demandaEntrega = demandaDiaria * tiempoEntregaDias;
  const bajoSeguridad = stockActual < stockSeguridad;

  let estado = 'ok';
  let mensaje = 'Stock suficiente.';
  if (stockActual <= 0) {
    estado = 'agotado';
    mensaje = 'Producto agotado: hay desabastecimiento.';
  } else if (stockActual < demandaEntrega && enOrden <= 0) {
    estado = 'riesgo';
    mensaje = `Riesgo de desabastecimiento: el stock dura ${diasCobertura.toFixed(1)} días y el pedido tarda ${tiempoEntregaDias} días.`;
  } else if (posicion <= puntoPedido) {
    estado = 'pedir';
    mensaje = 'Hay que pedir: el stock llegó al punto de pedido.';
  } else if (enOrden > 0 && stockActual <= puntoPedido) {
    estado = 'en_camino';
    mensaje = 'Hay un pedido en camino.';
  }

  return {
    estado,
    mensaje,
    stockActual,
    posicionInventario: posicion,
    diasCobertura: Number.isFinite(diasCobertura) ? diasCobertura : null,
    bajoSeguridad,
    cantidadSugerida: estado === 'pedir' || estado === 'riesgo' || estado === 'agotado' ? cantidadEconomica : null,
  };
}

module.exports = {
  zDeNivelServicio, normalizarParametros, cantidadEconomica, analizarProducto,
  curvaCostos, simularDienteSierra, evaluarAlerta,
};
