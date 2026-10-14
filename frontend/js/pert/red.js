// =====================================================
// red.js - diagrama de red (actividad en el nodo) en SVG
// Cada caja muestra:  ES | EF   /  código   /  LS | LF  (y la holgura)
// =====================================================
const Red = (() => {
  const ANCHO = 128;
  const ALTO = 66;
  const SEP_X = 86;
  const SEP_Y = 26;
  const MARGEN = 14;
  const NS = 'http://www.w3.org/2000/svg';

  const f = (v) => String(+Number(v).toFixed(2));

  // Reparte las actividades por columnas (nivel) y ordena cada columna para reducir cruces de líneas
  function posiciones(actividades) {
    const niveles = [];
    actividades.forEach((a) => { (niveles[a.nivel] = niveles[a.nivel] || []).push(a); });
    const fila = new Map();
    niveles.forEach((col, n) => {
      if (n > 0) {
        const clave = (a) => {
          const filas = a.predecesoras.map((p) => fila.get(p)).filter((x) => x !== undefined);
          return filas.length ? filas.reduce((s, x) => s + x, 0) / filas.length : 0;
        };
        col.sort((a, b) => clave(a) - clave(b));
      }
      col.forEach((a, i) => fila.set(a.id, i));
    });
    const maxFilas = Math.max(...niveles.map((c) => c.length));
    const pos = new Map();
    niveles.forEach((col, n) => {
      // se centra cada columna respecto a la más alta
      const desplazamiento = ((maxFilas - col.length) * (ALTO + SEP_Y)) / 2;
      col.forEach((a, i) => {
        pos.set(a.id, { x: MARGEN + n * (ANCHO + SEP_X), y: MARGEN + desplazamiento + i * (ALTO + SEP_Y) });
      });
    });
    return { pos, columnas: niveles.length, maxFilas };
  }

  function el(nombre, atributos = {}, texto) {
    const e = document.createElementNS(NS, nombre);
    Object.entries(atributos).forEach(([k, v]) => e.setAttribute(k, v));
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function recortar(texto, max) {
    const t = String(texto || '');
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  }

  function dibujar(contenedor, analisis) {
    const acts = analisis.actividades;
    const por = new Map(acts.map((a) => [a.id, a]));
    const { pos, columnas, maxFilas } = posiciones(acts);
    const w = MARGEN * 2 + columnas * ANCHO + (columnas - 1) * SEP_X;
    const h = MARGEN * 2 + maxFilas * ALTO + (maxFilas - 1) * SEP_Y;

    const svg = el('svg', { class: 'red-svg', width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'Diagrama de red del proyecto' });
    const defs = el('defs');
    [['normal', 'punta'], ['critico', 'punta critico']].forEach(([id, clase]) => {
      const m = el('marker', { id: `flecha-${id}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto' });
      m.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', class: clase }));
      defs.appendChild(m);
    });
    svg.appendChild(defs);

    // Arcos: primero los normales y al final los críticos para que queden encima
    const arcos = [];
    acts.forEach((a) => a.predecesoras.forEach((p) => {
      const pa = por.get(p);
      const critico = pa.critica && a.critica && Math.abs(pa.ef - a.es) < 1e-9;
      arcos.push({ de: p, a: a.id, critico });
    }));
    arcos.sort((x, y) => Number(x.critico) - Number(y.critico)).forEach((arco) => {
      const o = pos.get(arco.de);
      const d = pos.get(arco.a);
      const x1 = o.x + ANCHO;
      const y1 = o.y + ALTO / 2;
      const x2 = d.x;
      const y2 = d.y + ALTO / 2;
      const dx = Math.max(30, (x2 - x1) / 2);
      svg.appendChild(el('path', {
        d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`,
        class: `arco ${arco.critico ? 'critico' : ''}`,
        'marker-end': `url(#flecha-${arco.critico ? 'critico' : 'normal'})`,
      }));
    });

    // Cajas
    acts.forEach((a) => {
      const { x, y } = pos.get(a.id);
      const g = el('g');
      g.appendChild(el('title', {}, `${a.id}${a.nombre ? ' — ' + a.nombre : ''}\nDuración ${f(a.duracion)} · Holgura ${f(a.holgura)}`));
      g.appendChild(el('rect', { x, y, width: ANCHO, height: ALTO, rx: 8, class: `caja ${a.critica ? 'critica' : ''}` }));
      g.appendChild(el('line', { x1: x, y1: y + 19, x2: x + ANCHO, y2: y + 19, class: 'sep' }));
      g.appendChild(el('line', { x1: x, y1: y + ALTO - 19, x2: x + ANCHO, y2: y + ALTO - 19, class: 'sep' }));
      g.appendChild(el('text', { x: x + 8, y: y + 14, class: 't-num' }, f(a.es)));
      g.appendChild(el('text', { x: x + ANCHO - 8, y: y + 14, class: 't-num', 'text-anchor': 'end' }, f(a.ef)));
      g.appendChild(el('text', { x: x + ANCHO / 2, y: y + 35, class: 't-id' }, a.id));
      if (a.nombre) g.appendChild(el('text', { x: x + ANCHO / 2, y: y + 46, class: 't-nom' }, recortar(a.nombre, 20)));
      g.appendChild(el('text', { x: x + 8, y: y + ALTO - 6, class: 't-num' }, f(a.ls)));
      g.appendChild(el('text', { x: x + ANCHO / 2, y: y + ALTO - 6, class: 't-hol' }, `H=${f(a.holgura)}`));
      g.appendChild(el('text', { x: x + ANCHO - 8, y: y + ALTO - 6, class: 't-num', 'text-anchor': 'end' }, f(a.lf)));
      svg.appendChild(g);
    });

    contenedor.replaceChildren(svg);
  }

  return { dibujar };
})();
