// =====================================================
// eoq.js - pestaña "Análisis EOQ": cálculo en vivo, fórmulas y gráficos
// =====================================================
const Analisis = (() => {
  const $ = (id) => document.getElementById(id);
  let secuencia = 0;
  let temporizador = null;
  const n = (v, d = 2) => UI.num(v, d);

  function leer() {
    const cuerpo = Inv.leerCampos('a_');
    const stock = $('a_stock').value.trim();
    if (stock !== '') cuerpo.stockActual = Number(stock);
    cuerpo.enOrden = Number($('a_enOrden').value) || 0;
    return cuerpo;
  }

  function programar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(calcular, 350);
  }

  async function calcular() {
    if (Tabs.actual !== 'analisis') return;
    const mia = ++secuencia;
    const q = new URLSearchParams();
    const dias = $('a_dias').value.trim();
    const rev = $('a_diasRevision').value.trim();
    if (dias) q.set('dias', dias);
    if (rev) q.set('diasRevision', rev);
    try {
      const r = await Api.post('/api/inventario/calcular?' + q.toString(), leer());
      if (mia !== secuencia) return;
      $('errorAnalisis').hidden = true;
      $('resultadosAnalisis').hidden = false;
      mostrar(r);
    } catch (e) {
      if (mia !== secuencia) return;
      $('errorAnalisis').textContent = e.message;
      $('errorAnalisis').hidden = false;
      $('resultadosAnalisis').hidden = true;
    }
  }

  function tile(etq, valor, formula, extra = '') {
    return `<div class="tile ${extra}"><div class="etq">${UI.esc(etq)}</div><div class="valor">${valor}</div>` +
      (formula ? `<div class="formula">${UI.esc(formula)}</div>` : '') + '</div>';
  }

  function mostrar(r) {
    const e = r.eoq;
    const p = r.parametros;
    const rc = r.revisionContinua;
    const rp = r.revisionPeriodica;

    // Recomendación
    $('recomendacionEoq').textContent =
      `Pedir ${n(e.cantidadEconomica, 0)} unidades cuando el stock llegue a ${n(e.puntoPedido, 0)}`;
    $('detalleRecomendacion').textContent =
      `Se hacen ${n(e.pedidosPorAnio, 1)} pedidos al año (uno cada ${n(e.diasEntrePedidos, 1)} días) con un stock de seguridad de ` +
      `${n(e.stockSeguridad, 1)} unidades para un nivel de servicio de ${n(p.nivelServicio * 100, 1)} %. Costo total anual: ${Inv.soles(e.costoTotalAnual)}.`;
    $('encabezadoImpresion').textContent = `Informe de inventario — generado el ${new Date().toLocaleString('es-PE')}`;

    // Alerta (solo si se indicó el stock actual)
    $('alertaAnalisis').innerHTML = r.alerta
      ? `<div class="alert ${r.alerta.estado === 'ok' || r.alerta.estado === 'en_camino' ? 'alert-ok' : r.alerta.estado === 'pedir' ? 'alert-warn' : 'alert-danger'}">` +
        `${Inv.badge(r.alerta.estado)} ${UI.esc(r.alerta.mensaje)}` +
        (r.alerta.diasCobertura !== null ? ` Cobertura: ${n(r.alerta.diasCobertura, 1)} días.` : '') +
        (r.alerta.cantidadSugerida ? ` Cantidad sugerida: ${n(Math.ceil(r.alerta.cantidadSugerida), 0)} unidades.` : '') + '</div>'
      : '';

    // KPIs
    $('kpisEoq').innerHTML = [
      tile('Lote económico Q*', n(e.cantidadEconomica, 2), 'Q* = √(2DS/H)', 'destacado'),
      tile('Pedidos por año N', n(e.pedidosPorAnio, 2), 'N = D/Q*'),
      tile('Tiempo entre pedidos T', n(e.diasEntrePedidos, 1) + ' d', 'T = días/N'),
      tile('Stock de seguridad', n(e.stockSeguridad, 2), 'SS = z·σd·√L'),
      tile('Punto de pedido ROP', n(e.puntoPedido, 2), 'ROP = d·L + SS', 'destacado'),
      tile('Costo total anual', Inv.soles(e.costoTotalAnual), 'CT = Dc + (D/Q)S + (Q/2)H'),
    ].join('');

    // Desarrollo de fórmulas
    const paso = (titulo, texto) => `<div class="paso"><b>${UI.esc(titulo)}</b><code>${UI.esc(texto)}</code></div>`;
    const dias = p.diasAnio;
    $('formulasEoq').innerHTML = [
      paso('Costo de mantener una unidad', `H = i·c + a = ${n(p.tasaMantenimiento, 4)} × ${n(p.costoUnitario)} + ${n(p.costoAlmacenamientoUnidad)} = ${n(e.costoMantenimientoUnidad, 4)}`),
      paso('Lote económico', `Q* = √(2·D·S/H) = √(2 × ${n(p.demandaAnual, 0)} × ${n(p.costoPedido)} / ${n(e.costoMantenimientoUnidad, 4)}) = ${n(e.cantidadEconomica, 4)}`),
      paso('Pedidos y tiempo entre pedidos', `N = D/Q* = ${n(e.pedidosPorAnio, 4)}   ·   T = ${dias}/N = ${n(e.diasEntrePedidos, 2)} días`),
      paso('Demanda diaria y en la entrega', `d = D/${dias} = ${n(e.demandaDiaria, 4)}   ·   d·L = ${n(e.demandaTiempoEntrega, 4)}`),
      paso('Stock de seguridad', `z(${n(p.nivelServicio * 100, 1)} %) = ${n(e.z, 4)}   ·   σL = σd·√L = ${n(e.desviacionTiempoEntrega, 4)}   ·   SS = z·σL = ${n(e.stockSeguridad, 4)}`),
      paso('Punto de pedido', `ROP = d·L + SS = ${n(e.demandaTiempoEntrega, 4)} + ${n(e.stockSeguridad, 4)} = ${n(e.puntoPedido, 4)}`),
    ].join('');

    // Costos
    const fila2 = (c, v, cls = '') => `<tr class="${cls}"><td>${UI.esc(c)}</td><td class="num">${Inv.soles(v)}</td></tr>`;
    $('tablaCostos').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Concepto</th><th class="num">Anual</th></tr></thead><tbody>` +
      fila2('Costo de pedido (D/Q × S)', e.costoPedidoAnual) +
      fila2('Costo de mantenimiento (Q/2 × H)', e.costoMantenimientoAnual) +
      fila2('Costo de compra (D × c)', e.costoCompraAnual) +
      fila2('Costo total anual del modelo EOQ', e.costoTotalAnual, 'total') +
      fila2('+ Mantener el stock de seguridad (SS × H)', e.costoMantenerSeguridadAnual) +
      fila2('Costo total con stock de seguridad', e.costoTotalAnualConSeguridad, 'total') +
      '</tbody></table></div>';

    // Comparación de políticas
    const mejorC = r.comparacion.masEconomico === 'continua';
    const mejorP = r.comparacion.masEconomico === 'periodica';
    const fila = (t, a, b) => `<tr><td>${UI.esc(t)}</td><td class="num">${a}</td><td class="num">${b}</td></tr>`;
    $('tablaPoliticas').innerHTML = `<div class="table-wrap"><table><thead><tr><th></th>` +
      `<th class="num">Continua (Q, R)</th><th class="num">Periódica (T, M)</th></tr></thead><tbody>` +
      fila('Cuándo se pide', `al llegar a ${n(rc.puntoPedido, 1)} unid.`, `cada ${n(rp.diasRevision, 0)} días`) +
      fila('Cuánto se pide', `${n(rc.cantidadPedido, 1)} (fija)`, `hasta el nivel M = ${n(rp.nivelObjetivo, 1)}`) +
      fila('Stock de seguridad', n(rc.stockSeguridad, 2), n(rp.stockSeguridad, 2)) +
      fila('Pedidos por año', n(rc.pedidosPorAnio, 2), n(rp.pedidosPorAnio, 2)) +
      fila('Inventario promedio', n(rc.inventarioPromedio, 2), n(rp.inventarioPromedio, 2)) +
      fila('Costo de pedido', Inv.soles(rc.costoPedidoAnual), Inv.soles(rp.costoPedidoAnual)) +
      fila('Costo de mantenimiento', Inv.soles(rc.costoMantenimientoAnual), Inv.soles(rp.costoMantenimientoAnual)) +
      `<tr class="total"><td>Costo total anual</td><td class="num ${mejorC ? 'mejor' : ''}">${Inv.soles(rc.costoTotalAnual)}</td>` +
      `<td class="num ${mejorP ? 'mejor' : ''}">${Inv.soles(rp.costoTotalAnual)}</td></tr></tbody></table></div>`;
    const dif = Inv.soles(r.comparacion.diferenciaAnual);
    $('notaPoliticas').textContent = r.comparacion.masEconomico === 'igual'
      ? 'Ambas políticas tienen el mismo costo anual.'
      : `Con estos datos la revisión ${mejorC ? 'continua' : 'periódica'} es más económica por ${dif} al año. ` +
        'La revisión periódica exige más stock de seguridad (cubre T + L días) pero evita vigilar el inventario todos los días.' +
        (rp.cantidadAPedirHoy !== null && rp.cantidadAPedirHoy !== undefined ? ` Hoy habría que pedir ${n(rp.cantidadAPedirHoy, 1)} unidades.` : '');

    graficar(r);
  }

  function graficar(r) {
    $('avisoGraficos').hidden = Graficos.disponible();
    if (!Graficos.disponible()) return;
    const e = r.eoq;
    const c = r.curvaCostos;
    const linea = (label, clave, color, extra = {}) => Object.assign({
      label, data: c.puntos.map((x) => ({ x: x.cantidad, y: x[clave] })),
      borderColor: color, backgroundColor: color, pointRadius: 0, borderWidth: 2, tension: 0.2,
    }, extra);
    Graficos.dibujar('grafCostos', {
      type: 'line',
      data: {
        datasets: [
          linea('Costo de pedido', 'costoPedido', '#d97706'),
          linea('Costo de mantenimiento', 'costoMantenimiento', '#6d3fc7'),
          linea('Costo total', 'costoTotal', '#0b7a5a', { borderWidth: 3 }),
          { label: `Q* = ${n(e.cantidadEconomica, 1)}`, data: [{ x: c.cantidadEconomica, y: c.costoMinimo }],
            borderColor: '#c0392b', backgroundColor: '#c0392b', pointRadius: 7, showLine: false },
        ],
      },
      options: {
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Tamaño del pedido Q (unidades)' } },
          y: { title: { display: true, text: 'Costo anual (S/)' }, beginAtZero: true },
        },
        plugins: { legend: { position: 'bottom' } },
      },
    });

    const s = r.dienteSierra;
    const ultimo = s.length ? s[s.length - 1].dia : 0;
    Graficos.dibujar('grafSierra', {
      type: 'line',
      data: {
        datasets: [
          { label: 'Inventario', data: s.map((x) => ({ x: x.dia, y: x.stock })), borderColor: '#0b7a5a', backgroundColor: '#0b7a5a', pointRadius: 0, borderWidth: 2 },
          { label: `Punto de pedido (${n(e.puntoPedido, 1)})`, data: [{ x: 0, y: e.puntoPedido }, { x: ultimo, y: e.puntoPedido }], borderColor: '#d97706', borderDash: [6, 4], pointRadius: 0, borderWidth: 2 },
          { label: `Stock de seguridad (${n(e.stockSeguridad, 1)})`, data: [{ x: 0, y: e.stockSeguridad }, { x: ultimo, y: e.stockSeguridad }], borderColor: '#c0392b', borderDash: [2, 4], pointRadius: 0, borderWidth: 2 },
        ],
      },
      options: {
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Días' } },
          y: { title: { display: true, text: 'Unidades en inventario' }, beginAtZero: true },
        },
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  // ----- Carga de datos desde otras pestañas -----
  function cargarDatos(parametros, stock, enOrden) {
    Inv.escribirCampos('a_', Object.assign({}, parametros));
    $('a_stock').value = stock === undefined || stock === null ? '' : stock;
    $('a_enOrden').value = enOrden || 0;
    $('a_producto').value = '';
    if (Tabs.actual === 'analisis') calcular();
  }

  function cargarProducto(id) {
    const p = Inv.productos.find((x) => x.id === id);
    if (!p) return;
    Inv.escribirCampos('a_', p);
    $('a_stock').value = p.stock;
    $('a_enOrden').value = p.enOrden;
    $('a_producto').value = String(p.id);
  }

  function iniciar() {
    $('camposAnalisis').innerHTML = Inv.camposHTML('a_');
    ['camposAnalisis', 'a_stock', 'a_enOrden', 'a_diasRevision', 'a_dias'].forEach((id) =>
      $(id).addEventListener('input', programar));
    $('a_producto').addEventListener('change', () => {
      if ($('a_producto').value) cargarProducto(Number($('a_producto').value));
      calcular();
    });
    $('btnImprimirAnalisis').addEventListener('click', () => window.print());
    document.addEventListener('inv:datos', () => Inv.llenarProductos($('a_producto'), '— Datos manuales —'));
    document.addEventListener('inv:tab', (ev) => { if (ev.detail === 'analisis') calcular(); });
  }

  iniciar();
  return { calcular, cargarDatos, cargarProducto };
})();
