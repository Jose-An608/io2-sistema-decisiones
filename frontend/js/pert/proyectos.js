// =====================================================
// proyectos.js - pantalla PERT/CPM: editor de actividades, guardado y resultados
// =====================================================
const Proyectos = (() => {
  const $ = (id) => document.getElementById(id);
  const f = (v) => String(+Number(v).toFixed(2));          // sin ceros sobrantes
  const f4 = (v) => UI.num(v, 4);

  let actividades = [];        // filas del editor
  let idActual = null;         // proyecto guardado que se está editando
  let secuencia = 0;
  let temporizador = null;
  let ultimo = null;           // último análisis calculado
  const avisar = () => document.dispatchEvent(new CustomEvent('pert:proyecto'));

  const ejemplo = () => [
    { id: 'A', nombre: 'Inicio', duracion: '3', optimista: '2', masProbable: '3', pesimista: '4', predecesoras: '' },
    { id: 'B', nombre: '', duracion: '2', optimista: '1', masProbable: '2', pesimista: '3', predecesoras: 'A' },
    { id: 'C', nombre: '', duracion: '4', optimista: '3', masProbable: '4', pesimista: '6', predecesoras: 'A' },
  ];

  const esPert = () => $('modo').value === 'pert';

  function siguienteCodigo() {
    const usados = new Set(actividades.map((a) => a.id.trim().toUpperCase()));
    for (let i = 0; i < 26; i++) {
      const c = String.fromCharCode(65 + i);
      if (!usados.has(c)) return c;
    }
    let n = 1;
    while (usados.has('A' + n)) n += 1;
    return 'A' + n;
  }

  // ---------- Editor ----------
  function pintarEditor() {
    const pert = esPert();
    const cab = '<th>Código</th><th>Nombre</th>' +
      (pert ? '<th class="num">Optimista (a)</th><th class="num">Más probable (m)</th><th class="num">Pesimista (b)</th>' : '<th class="num">Duración</th>') +
      '<th>Predecesoras</th><th class="no-print"></th>';
    const filas = actividades.map((a, i) => {
      const t = (campo) => `<td><input type="number" min="0" step="any" class="tiempo" data-i="${i}" data-c="${campo}" value="${UI.esc(a[campo])}"></td>`;
      return `<tr>
        <td><input type="text" class="cod" maxlength="20" data-i="${i}" data-c="id" value="${UI.esc(a.id)}"></td>
        <td><input type="text" class="nom" maxlength="100" data-i="${i}" data-c="nombre" value="${UI.esc(a.nombre)}"></td>
        ${pert ? t('optimista') + t('masProbable') + t('pesimista') : t('duracion')}
        <td><input type="text" class="pred" data-i="${i}" data-c="predecesoras" value="${UI.esc(a.predecesoras)}" placeholder="—"></td>
        <td class="no-print"><button type="button" class="btn-x" data-quitar="${i}" title="Quitar actividad" aria-label="Quitar actividad">×</button></td>
      </tr>`;
    }).join('');
    $('editorActividades').innerHTML =
      `<table class="editor"><thead><tr>${cab}</tr></thead><tbody>${filas || '<tr><td colspan="7">Agrega una actividad para empezar.</td></tr>'}</tbody></table>`;
  }

  function cuerpoActividades() {
    const pert = esPert();
    return actividades.map((a) => (pert
      ? { id: a.id, nombre: a.nombre, optimista: a.optimista, masProbable: a.masProbable, pesimista: a.pesimista, predecesoras: a.predecesoras }
      : { id: a.id, nombre: a.nombre, duracion: a.duracion, predecesoras: a.predecesoras }));
  }

  // ---------- Cálculo en vivo ----------
  function programar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(calcular, 350);
  }

  async function calcular() {
    const mia = ++secuencia;
    const cuerpo = { modo: $('modo').value, actividades: cuerpoActividades() };
    if ($('fechaInicio').value) cuerpo.fechaInicio = $('fechaInicio').value;
    if (esPert()) {
      if ($('plazo').value.trim() !== '') cuerpo.plazo = Number($('plazo').value);
      if ($('probabilidad').value.trim() !== '') cuerpo.probabilidad = Number($('probabilidad').value) / 100;
    }
    try {
      const r = await Api.post('/api/pert/calcular', cuerpo);
      if (mia !== secuencia) return;
      $('errorCalculo').hidden = true;
      $('resultados').hidden = false;
      mostrar(r);
    } catch (e) {
      if (mia !== secuencia) return;
      $('errorCalculo').textContent = e.message;
      $('errorCalculo').hidden = false;
      $('resultados').hidden = true;
    }
  }

  function mostrar(r) {
    ultimo = r;
    const pert = r.modo === 'pert';
    const rutas = r.rutasCriticas.map((x) => x.actividades.join(' → '));
    $('rcPrincipal').textContent = `Duración del proyecto: ${f(r.duracionProyecto)} días`;
    $('rcDetalle').textContent =
      `${rutas.length > 1 ? 'Rutas críticas' : 'Ruta crítica'}: ${rutas.join('  ·  ')}.` +
      (r.fechaFin ? ` Fecha de término estimada: ${new Date(r.fechaFin + 'T00:00:00').toLocaleDateString('es-PE')}.` : '');
    $('encabezadoImpresion').textContent = `Informe PERT/CPM — generado el ${new Date().toLocaleString('es-PE')}`;

    // Panel de probabilidad (solo PERT)
    $('panelPert').hidden = !pert;
    if (pert) {
      $('statsPert').innerHTML =
        `<div class="stat"><span>Duración esperada del proyecto (Te)</span><strong>${f(r.duracionProyecto)} días</strong></div>` +
        `<div class="stat"><span>Varianza de la ruta crítica (σ²)</span><strong>${f4(r.varianzaProyecto)}</strong></div>` +
        `<div class="stat"><span>Desviación estándar (σ)</span><strong>${f4(r.desviacionProyecto)}</strong></div>`;
      let html = '';
      if (r.probabilidadPlazo) {
        const p = r.probabilidadPlazo;
        html += `<div class="respuesta">Probabilidad de terminar en ${f(p.plazo)} días o menos: <strong>${UI.num(p.probabilidad * 100, 1)} %</strong>` +
          (p.z !== null ? ` <span class="ayuda">(z = ${UI.num(p.z, 3)})</span>` : '') + '</div>';
      }
      if (r.plazoProbabilidad) {
        const q = r.plazoProbabilidad;
        html += `<div class="respuesta">Para terminar con ${UI.num(q.probabilidad * 100, 1)} % de probabilidad se necesitan: <strong>${UI.num(q.plazo, 2)} días</strong>` +
          ` <span class="ayuda">(z = ${UI.num(q.z, 3)})</span></div>`;
      }
      $('resultadoPlazo').innerHTML = html || '<p class="ayuda">Escribe un plazo o una probabilidad para consultarlos.</p>';
    }

    // Tabla
    const cols = [{ campo: 'id', titulo: 'Act.' }, { campo: 'nombre', titulo: 'Nombre', formato: (v) => UI.esc(v || '') }];
    if (pert) {
      cols.push(
        { campo: 'optimista', titulo: 'a', num: true, formato: f },
        { campo: 'masProbable', titulo: 'm', num: true, formato: f },
        { campo: 'pesimista', titulo: 'b', num: true, formato: f },
        { campo: 'duracion', titulo: 'Te', num: true, formato: f },
        { campo: 'varianza', titulo: 'σ²', num: true, formato: (v) => UI.num(v, 4) },
      );
    } else {
      cols.push({ campo: 'duracion', titulo: 'Duración', num: true, formato: f });
    }
    cols.push(
      { campo: 'predecesoras', titulo: 'Pred.', formato: (v) => UI.esc(v.join(', ') || '—') },
      { campo: 'es', titulo: 'ES', num: true, formato: f },
      { campo: 'ef', titulo: 'EF', num: true, formato: f },
      { campo: 'ls', titulo: 'LS', num: true, formato: f },
      { campo: 'lf', titulo: 'LF', num: true, formato: f },
      { campo: 'holgura', titulo: 'Holgura', num: true, formato: f },
      { campo: 'critica', titulo: 'Crítica', formato: (v) => (v ? '<span class="crit">Sí</span>' : '<span class="hol">No</span>') },
    );
    if (r.fechaInicio) {
      const fecha = (v) => new Date(v + 'T00:00:00').toLocaleDateString('es-PE');
      cols.push(
        { campo: 'fechaInicioTemprano', titulo: 'Inicio', formato: fecha },
        { campo: 'fechaFinTemprano', titulo: 'Fin', formato: fecha },
      );
    }
    const tabla = UI.tabla(cols, r.actividades);
    // se marcan las filas críticas
    let i = 0;
    $('tablaResultados').innerHTML = tabla.replace(/<tr>(?=<td)/g, () => {
      const a = r.actividades[i++];
      return a && a.critica ? '<tr class="fila-critica">' : '<tr>';
    });
    $('notaTabla').textContent =
      'ES/EF: inicio y fin más tempranos. LS/LF: inicio y fin más tardíos. Holgura = LS − ES (cuánto puede retrasarse sin demorar el proyecto); las actividades con holgura 0 forman la ruta crítica.' +
      (pert ? ' Te = (a + 4m + b)/6 y σ² = ((b − a)/6)².' : '');

    // Diagrama
    Red.dibujar($('redContenedor'), r);
    $('notaRed').textContent = 'Cada caja muestra arriba ES y EF, al centro la actividad y abajo LS, la holgura (H) y LF. En naranja: ruta crítica.';
  }

  // ---------- Guardado ----------
  function cuerpoGuardar() {
    return {
      nombre: $('nombre').value, descripcion: $('descripcion').value, modo: $('modo').value,
      fechaInicio: $('fechaInicio').value || null, actividades: cuerpoActividades(),
    };
  }

  async function cargarLista(seleccionar) {
    try {
      const lista = await Api.get('/api/pert');
      $('selProyectos').innerHTML = '<option value="">— Proyecto sin guardar —</option>' +
        lista.map((p) => `<option value="${p.id}">${UI.esc(p.nombre)} (${p.modo.toUpperCase()}, ${p.actividades} act.)</option>`).join('');
      $('selProyectos').value = seleccionar ? String(seleccionar) : '';
    } catch (e) {
      UI.toast(e.message, 'error', 6000);
    }
  }

  async function guardar() {
    try {
      const cuerpo = cuerpoGuardar();
      const r = idActual ? await Api.put(`/api/pert/${idActual}`, cuerpo) : await Api.post('/api/pert', cuerpo);
      idActual = r.id;
      await cargarLista(idActual);
      UI.toast('Proyecto guardado.', 'ok');
      avisar();
    } catch (e) {
      UI.toast(e.message, 'error', 6000);
    }
  }

  async function abrir(id) {
    try {
      const p = await Api.get(`/api/pert/${id}`);
      idActual = p.id;
      $('nombre').value = p.nombre;
      $('descripcion').value = p.descripcion || '';
      $('modo').value = p.modo;
      $('fechaInicio').value = p.fechaInicio || '';
      actividades = p.actividades.map((a) => ({
        id: a.id, nombre: a.nombre || '',
        duracion: a.duracion ?? '', optimista: a.optimista ?? '', masProbable: a.masProbable ?? '', pesimista: a.pesimista ?? '',
        predecesoras: a.predecesoras.join(', '),
      }));
      pintarEditor();
      calcular();
      avisar();
    } catch (e) {
      UI.toast(e.message, 'error', 6000);
    }
  }

  function nuevo() {
    idActual = null;
    $('selProyectos').value = '';
    $('nombre').value = '';
    $('descripcion').value = '';
    $('modo').value = 'cpm';
    $('fechaInicio').value = '';
    $('plazo').value = '';
    $('probabilidad').value = '';
    actividades = ejemplo();
    pintarEditor();
    calcular();
    avisar();
  }

  async function eliminar() {
    if (!idActual) { UI.toast('Este proyecto aún no está guardado.', 'error'); return; }
    if (!confirm('¿Eliminar este proyecto guardado y todas sus actividades?')) return;
    try {
      await Api.delete(`/api/pert/${idActual}`);
      UI.toast('Proyecto eliminado.', 'ok');
      await cargarLista();
      nuevo();
    } catch (e) {
      UI.toast(e.message, 'error', 6000);
    }
  }

  // ---------- Eventos ----------
  function iniciar() {
    $('editorActividades').addEventListener('input', (ev) => {
      const campo = ev.target.dataset.c;
      if (!campo) return;
      actividades[Number(ev.target.dataset.i)][campo] = ev.target.value;
      programar();
    });
    $('editorActividades').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-quitar]');
      if (!b) return;
      actividades.splice(Number(b.dataset.quitar), 1);
      pintarEditor();
      programar();
    });
    $('btnAgregar').addEventListener('click', () => {
      actividades.push({ id: siguienteCodigo(), nombre: '', duracion: '', optimista: '', masProbable: '', pesimista: '', predecesoras: '' });
      pintarEditor();
      const ult = $('editorActividades').querySelectorAll('input.tiempo');
      if (ult.length) ult[ult.length - (esPert() ? 3 : 1)].focus();
      programar();
    });
    $('modo').addEventListener('change', () => { pintarEditor(); calcular(); });
    ['fechaInicio', 'plazo', 'probabilidad'].forEach((id) => $(id).addEventListener('input', programar));
    $('selProyectos').addEventListener('change', () => ($('selProyectos').value ? abrir($('selProyectos').value) : nuevo()));
    $('btnNuevo').addEventListener('click', nuevo);
    $('btnGuardar').addEventListener('click', guardar);
    $('btnEliminar').addEventListener('click', eliminar);
    $('btnImprimir').addEventListener('click', () => window.print());

    actividades = ejemplo();
    pintarEditor();
    cargarLista();
    calcular();
  }

  iniciar();
  return { calcular, estado: () => ({ id: idActual, analisis: ultimo }) };
})();
