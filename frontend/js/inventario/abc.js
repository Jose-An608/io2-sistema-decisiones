// =====================================================
// abc.js - pestaña "Clasificación ABC" (tabla, resumen y diagrama de Pareto)
// =====================================================
const ABC = (() => {
  const $ = (id) => document.getElementById(id);
  let secuencia = 0;
  const COLORES = { A: '#0b7a5a', B: '#d9a21b', C: '#9aa5b8' };
  const etiquetaClase = (c) => `<span class="clase clase-${c}">${c}</span>`;

  async function calcular() {
    if (Tabs.actual !== 'abc') return;
    const mia = ++secuencia;
    const q = new URLSearchParams({ corteA: $('corteA').value, corteB: $('corteB').value });
    try {
      const r = await Api.get('/api/inventario/abc?' + q.toString());
      if (mia !== secuencia) return;
      $('errorAbc').hidden = true;
      $('contenidoAbc').hidden = false;
      mostrar(r);
    } catch (e) {
      if (mia !== secuencia) return;
      $('errorAbc').textContent = e.message;
      $('errorAbc').hidden = false;
      $('contenidoAbc').hidden = true;
    }
  }

  function mostrar(r) {
    $('tablaResumenAbc').innerHTML = UI.tabla([
      { campo: 'clase', titulo: 'Clase', formato: (v) => etiquetaClase(v) },
      { campo: 'cantidad', titulo: 'Productos', num: true },
      { campo: 'porcentajeProductos', titulo: '% de productos', num: true, formato: (v) => UI.num(v, 1) + ' %' },
      { campo: 'valorAnual', titulo: 'Valor anual', num: true, formato: (v) => Inv.soles(v) },
      { campo: 'porcentajeValor', titulo: '% del valor', num: true, formato: (v) => UI.num(v, 1) + ' %' },
    ], r.resumen);

    $('tablaDetalleAbc').innerHTML = UI.tabla([
      { campo: 'nombre', titulo: 'Producto' },
      { campo: 'demandaAnual', titulo: 'Demanda', num: true, formato: (v) => UI.num(v, 0) },
      { campo: 'costoUnitario', titulo: 'Costo unit.', num: true, formato: (v) => Inv.soles(v) },
      { campo: 'valorAnual', titulo: 'Valor anual', num: true, formato: (v) => Inv.soles(v) },
      { campo: 'porcentaje', titulo: '% valor', num: true, formato: (v) => UI.num(v, 2) + ' %' },
      { campo: 'porcentajeAcumulado', titulo: '% acumulado', num: true, formato: (v) => UI.num(v, 2) + ' %' },
      { campo: 'clase', titulo: 'Clase', formato: (v) => etiquetaClase(v) },
    ], r.productos);

    if (!Graficos.disponible()) return;
    Graficos.dibujar('grafPareto', {
      type: 'bar',
      data: {
        labels: r.productos.map((p) => p.nombre),
        datasets: [
          { type: 'bar', label: 'Valor anual (S/)', data: r.productos.map((p) => p.valorAnual),
            backgroundColor: r.productos.map((p) => COLORES[p.clase]), yAxisID: 'y' },
          { type: 'line', label: '% acumulado', data: r.productos.map((p) => p.porcentajeAcumulado),
            borderColor: '#c0392b', backgroundColor: '#c0392b', pointRadius: 4, borderWidth: 2, yAxisID: 'y1' },
        ],
      },
      options: {
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Valor anual (S/)' } },
          y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: '% acumulado' } },
        },
        plugins: { legend: { position: 'bottom' }, title: { display: true, text: `Diagrama de Pareto (A ≤ ${r.corteA} %, B ≤ ${r.corteB} %)` } },
      },
    });
  }

  function iniciar() {
    ['corteA', 'corteB'].forEach((id) => $(id).addEventListener('input', () => {
      clearTimeout(iniciar.t);
      iniciar.t = setTimeout(calcular, 350);
    }));
    $('btnImprimirAbc').addEventListener('click', () => window.print());
    document.addEventListener('inv:tab', (ev) => { if (ev.detail === 'abc') calcular(); });
    document.addEventListener('inv:datos', calcular);
  }

  iniciar();
  return { calcular };
})();
