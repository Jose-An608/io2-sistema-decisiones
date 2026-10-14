// =====================================================
// criterios.js (frontend) - muestra los resultados del análisis
// Recibe lo que devuelve /api/decisiones/calcular y lo dibuja
// =====================================================
const Criterios = (() => {
  const $ = (id) => document.getElementById(id);
  const graficos = {};

  // Enteros sin decimales; el resto con 2
  const fmt = (v) => UI.num(v, Number.isInteger(v) ? 0 : 2);

  function destruirGraficos() {
    Object.keys(graficos).forEach((k) => { graficos[k].destroy(); delete graficos[k]; });
  }

  // Oculta los resultados y muestra un mensaje (por ejemplo, datos incompletos)
  function limpiar(mensaje) {
    $('resultados').hidden = true;
    $('mensajeResultados').innerHTML = `<div class="alert alert-warn">${UI.esc(mensaje)}</div>`;
    destruirGraficos();
  }

  function graficar(idCanvas, titulo, etiquetas, datos, enteros) {
    const tarjeta = $(idCanvas).closest('.card');
    // Sin la librería Chart.js (sin internet) se oculta el recuadro del gráfico
    if (typeof Chart === 'undefined') { tarjeta.hidden = true; return; }
    tarjeta.hidden = false;
    if (graficos[idCanvas]) graficos[idCanvas].destroy();
    const color = getComputedStyle(document.documentElement).getPropertyValue('--dec').trim() || '#6d3fc7';
    graficos[idCanvas] = new Chart($(idCanvas), {
      type: 'bar',
      data: { labels: etiquetas, datasets: [{ label: titulo, data: datos, backgroundColor: color, borderRadius: 6 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: titulo } },
        scales: { y: { beginAtZero: true, ticks: enteros ? { precision: 0 } : {} } },
      },
    });
  }

  function render(a, nombresEstados) {
    $('mensajeResultados').innerHTML = '';
    $('resultados').hidden = false;

    // ---- Recomendación general: alternativa(s) con más criterios a favor ----
    const maxVotos = Math.max(...a.votos.map((v) => v.criterios));
    const ganadoras = a.votos.filter((v) => v.criterios === maxVotos).map((v) => v.alternativa);
    $('recomendacion').innerHTML =
      `<div class="titulo">Mayor respaldo entre los criterios</div>
       <div class="principal">${ganadoras.map(UI.esc).join(' · ')}</div>
       <p>Recomendada por ${maxVotos} de ${a.criterios.length} criterios${ganadoras.length > 1 ? ' (empate)' : ''}.
       Revisa abajo qué criterio apoya a cada alternativa antes de decidir.</p>`;

    // ---- Tabla comparativa ----
    const cab = '<th>Criterio</th>'
      + a.alternativas.map((n) => `<th class="num">${UI.esc(n)}</th>`).join('')
      + '<th>Recomienda</th>';
    const filas = a.criterios.map((c) => {
      const celdas = c.valores.map((v, i) =>
        `<td class="num ${c.indices.includes(i) ? 'mejor' : ''}">${fmt(v)}</td>`).join('');
      return `<tr><td><strong>${UI.esc(c.criterio)}</strong></td>${celdas}<td>${c.alternativas.map(UI.esc).join(', ')}</td></tr>`;
    }).join('');
    $('tablaCriterios').innerHTML =
      `<div class="table-wrap"><table><thead><tr>${cab}</tr></thead><tbody>${filas}</tbody></table></div>`;
    $('notaCriterios').textContent =
      (a.tipo === 'costo' ? 'Pagos en costos: se prefiere el menor valor. ' : 'Pagos en beneficios: se prefiere el mayor valor. ')
      + 'En Savage el valor mostrado es el arrepentimiento máximo (menor es mejor). Las celdas resaltadas son las elegidas por cada criterio.';

    // ---- Matriz de arrepentimiento ----
    const colsArr = [{ campo: 'alt', titulo: 'Alternativa' }]
      .concat(nombresEstados.map((n, j) => ({ campo: `e${j}`, titulo: n, num: true, formato: (v) => fmt(v) })))
      .concat([{ campo: 'max', titulo: 'Máximo', num: true, formato: (v) => `<strong>${fmt(v)}</strong>` }]);
    const filasArr = a.matrizArrepentimiento.map((fila, i) => {
      const o = { alt: a.alternativas[i], max: Math.max(...fila) };
      fila.forEach((v, j) => { o[`e${j}`] = v; });
      return o;
    });
    $('tablaArrepentimiento').innerHTML = UI.tabla(colsArr, filasArr);

    // ---- Información perfecta ----
    const ip = a.informacionPerfecta;
    $('bloqueVeip').innerHTML = ip
      ? `<div class="stats">
           <div class="stat"><span>Valor esperado con información perfecta</span><strong>${fmt(ip.valorConInformacionPerfecta)}</strong></div>
           <div class="stat"><span>Mejor valor monetario esperado (VME)</span><strong>${fmt(ip.mejorVME)}</strong></div>
           <div class="stat destacado"><span>VEIP (máximo que conviene pagar por la información)</span><strong>${fmt(ip.veip)}</strong></div>
         </div>`
      : '<div class="alert alert-warn" style="margin:0">Ingresa las probabilidades de todos los estados (deben sumar 1) para calcular el VME y el VEIP.</div>';

    // ---- Gráficos ----
    graficar('grafVotos', 'Criterios que recomiendan cada alternativa',
      a.votos.map((v) => v.alternativa), a.votos.map((v) => v.criterios), true);
    const base = a.criterios.find((c) => c.criterio === 'VME') || a.criterios.find((c) => c.criterio === 'Laplace');
    graficar('grafValor', base.criterio === 'VME' ? 'Valor monetario esperado' : 'Promedio por alternativa (Laplace)',
      a.alternativas, base.valores, false);
  }

  return { render, limpiar };
})();
