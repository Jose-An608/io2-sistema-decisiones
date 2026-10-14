// =====================================================
// gantt.js - diagrama de Gantt en SVG (plan temprano, holgura, avance real y día de corte)
// =====================================================
const Gantt = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const ETIQUETAS = 210;
  const ANCHO_GRAFICO = 760;
  const ALTO_FILA = 30;
  const ARRIBA = 42;
  const DERECHA = 90;

  const f = (v) => String(+Number(v).toFixed(2));

  function el(nombre, atributos = {}, texto) {
    const e = document.createElementNS(NS, nombre);
    Object.entries(atributos).forEach(([k, v]) => e.setAttribute(k, v));
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  // Paso "redondo" para el eje (1, 2, 5, 10, 20, 50...) con como máximo ~14 marcas
  function pasoEje(total) {
    for (let m = 1; m <= 1e6; m *= 10) {
      for (const base of [1, 2, 5]) {
        if (total / (base * m) <= 14) return base * m;
      }
    }
    return 1;
  }

  const recortar = (t, max) => (String(t).length > max ? String(t).slice(0, max - 1) + '…' : String(t));

  // analisis: respuesta de /api/pert/calcular o /:id/analisis. seguimiento: opcional (de /:id/analisis)
  function dibujar(contenedor, analisis, seguimiento) {
    const total = Math.max(analisis.duracionProyecto, 1);
    const diaCorte = seguimiento && seguimiento.diaCorte !== null ? seguimiento.diaCorte : null;
    const maxX = Math.max(total, diaCorte === null ? 0 : Math.min(diaCorte, total * 1.5));
    const escala = ANCHO_GRAFICO / maxX;
    const filas = analisis.actividades
      .map((a, i) => ({ a, i }))
      .sort((x, y) => x.a.es - y.a.es || x.i - y.i)
      .map((x) => x.a);
    const real = new Map(((seguimiento && seguimiento.actividades) || []).map((s) => [s.id, s.avanceReal]));
    const w = ETIQUETAS + ANCHO_GRAFICO + DERECHA;
    const h = ARRIBA + filas.length * ALTO_FILA + 14;

    const svg = el('svg', { class: 'gantt-svg', width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'Diagrama de Gantt' });

    // Filas alternadas
    filas.forEach((a, i) => {
      if (i % 2 === 0) svg.appendChild(el('rect', { x: 0, y: ARRIBA + i * ALTO_FILA, width: w, height: ALTO_FILA, class: 'fila-par' }));
    });

    // Eje de tiempo
    const paso = pasoEje(maxX);
    for (let d = 0; d <= maxX + 1e-9; d += paso) {
      const x = ETIQUETAS + d * escala;
      svg.appendChild(el('line', { x1: x, y1: ARRIBA - 6, x2: x, y2: h - 10, class: 'rejilla' }));
      svg.appendChild(el('text', { x, y: 16, class: 't-eje' }, String(d)));
      if (analisis.fechaInicio) {
        const fecha = new Date(`${analisis.fechaInicio}T00:00:00Z`);
        fecha.setUTCDate(fecha.getUTCDate() + d);
        svg.appendChild(el('text', { x, y: 29, class: 't-fecha' }, `${String(fecha.getUTCDate()).padStart(2, '0')}/${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`));
      }
    }
    svg.appendChild(el('line', { x1: ETIQUETAS, y1: ARRIBA - 6, x2: ETIQUETAS + ANCHO_GRAFICO, y2: ARRIBA - 6, class: 'eje' }));

    // Barras
    filas.forEach((a, i) => {
      const y = ARRIBA + i * ALTO_FILA;
      const g = el('g');
      g.appendChild(el('title', {}, `${a.id}${a.nombre ? ' — ' + a.nombre : ''}\nInicio temprano: día ${f(a.es)} · Fin: día ${f(a.ef)}\nHolgura: ${f(a.holgura)}`));
      const t = el('text', { x: 10, y: y + 19, class: 't-act' });
      const negrita = el('tspan', { 'font-weight': '700' }, a.id);
      t.appendChild(negrita);
      t.appendChild(document.createTextNode(a.nombre ? `  ${recortar(a.nombre, 24)}` : ''));
      g.appendChild(t);

      const x = ETIQUETAS + a.es * escala;
      const ancho = Math.max(a.duracion * escala, 4);
      const sufijo = a.critica ? 'crit' : 'norm';
      if (a.holgura > 0) {
        g.appendChild(el('rect', { x: x + ancho, y: y + 10, width: a.holgura * escala, height: 10, rx: 3, class: 'holgura' }));
      }
      g.appendChild(el('rect', { x, y: y + 6, width: ancho, height: 18, rx: 4, class: `barra-${sufijo}` }));
      const pct = real.get(a.id);
      if (pct) g.appendChild(el('rect', { x, y: y + 6, width: ancho * (pct / 100), height: 18, rx: 4, class: `prog-${sufijo}` }));
      if (seguimiento) {
        const fin = x + ancho + (a.holgura > 0 ? a.holgura * escala : 0);
        g.appendChild(el('text', { x: fin + 8, y: y + 19, class: 't-pct' }, `${f(pct || 0)} %`));
      }
      svg.appendChild(g);
    });

    // Día de corte
    if (diaCorte !== null) {
      const x = ETIQUETAS + Math.min(diaCorte, maxX) * escala;
      svg.appendChild(el('line', { x1: x, y1: ARRIBA - 6, x2: x, y2: h - 10, class: 'hoy' }));
      svg.appendChild(el('text', { x, y: h - 1, class: 't-hoy' }, `Día ${f(diaCorte)}`));
    }
    contenedor.replaceChildren(svg);
  }

  return { dibujar };
})();
