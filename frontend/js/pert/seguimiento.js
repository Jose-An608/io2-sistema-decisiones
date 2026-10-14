// =====================================================
// seguimiento.js - pestaña "Gantt y seguimiento": avance real frente al plan
// =====================================================
const Seguimiento = (() => {
  const $ = (id) => document.getElementById(id);
  const f = (v) => String(+Number(v).toFixed(1));
  let actual = null;      // última respuesta del análisis guardado
  let pestana = 'plan';

  const ESTADOS = {
    completada: ['Completada', 'badge-ok'], en_plazo: ['En plazo', 'badge-ok'], adelantada: ['Adelantada', 'badge-info'],
    atrasada: ['Atrasada', 'badge-danger'], sin_iniciar: ['Sin iniciar', 'badge-gris'], en_curso: ['En curso', 'badge-info'],
  };
  const badge = (e) => { const [t, c] = ESTADOS[e] || [e, '']; return `<span class="badge ${c}">${UI.esc(t)}</span>`; };

  // ---------- Pestañas ----------
  function ir(nombre) {
    pestana = nombre;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('activa', t.dataset.tab === nombre));
    document.querySelectorAll('[data-vista]').forEach((v) => { v.hidden = v.dataset.vista !== nombre; });
    if (nombre === 'gantt') cargar();
  }

  // ---------- Carga ----------
  async function cargar() {
    const { id, analisis } = Proyectos.estado();
    if (!id) {
      actual = null;
      $('avisoSeguimiento').textContent = 'Este proyecto aún no está guardado: se muestra el Gantt del plan. Guárdalo para registrar el avance real.';
      $('avisoSeguimiento').hidden = false;
      $('panelResumenSeg').hidden = true;
      $('panelTablaSeg').hidden = true;
      if (analisis) Gantt.dibujar($('ganttContenedor'), analisis);
      return;
    }
    $('avisoSeguimiento').hidden = true;
    $('panelResumenSeg').hidden = false;
    $('panelTablaSeg').hidden = false;
    try {
      const dia = $('diaCorte').value.trim();
      const r = await Api.get(`/api/pert/${id}/analisis` + (dia !== '' ? `?dia=${encodeURIComponent(dia)}` : ''));
      actual = r;
      mostrar(r);
    } catch (e) {
      UI.toast(e.message, 'error', 6000);
    }
  }

  function mostrar(r) {
    const s = r.seguimiento;
    $('diaCorte').placeholder = s.diaCorte !== null ? `hoy: día ${s.diaCorte}` : 'día del proyecto';

    const tile = (etq, valor, clase = '', extra = '') => `<div class="tile ${clase}"><div class="etq">${UI.esc(etq)}</div><div class="valor">${valor}</div>${extra}</div>`;
    const barra = (v) => `<div class="barra"><span style="width:${Math.min(100, Math.max(0, v))}%"></span></div>`;
    const claseEstado = s.estado === 'atrasada' ? 't-mal' : s.estado === 'adelantada' || s.estado === 'en_curso' ? 't-info' : 't-ok';
    $('resumenSeg').innerHTML = [
      tile('Avance real', `${f(s.avanceReal)} %`, 't-info', barra(s.avanceReal)),
      s.avancePlanificado === null ? '' : tile(`Avance planificado (día ${f(s.diaCorte)})`, `${f(s.avancePlanificado)} %`, '', barra(s.avancePlanificado)),
      s.desviacion === null ? '' : tile('Desviación', `${s.desviacion > 0 ? '+' : ''}${f(s.desviacion)} pts`, claseEstado),
      tile('Estado', ESTADOS[s.estado] ? ESTADOS[s.estado][0] : s.estado, claseEstado),
      tile('Actividades completadas', `${s.completadas} de ${s.actividades.length}`),
      tile('Críticas atrasadas', String(s.criticasAtrasadas.length), s.criticasAtrasadas.length ? 't-mal' : 't-ok'),
    ].join('');
    $('notaResumenSeg').textContent = s.criticasAtrasadas.length
      ? `Atención: ${s.criticasAtrasadas.join(', ')} ${s.criticasAtrasadas.length > 1 ? 'son actividades críticas atrasadas' : 'es una actividad crítica atrasada'}; retrasarán todo el proyecto si no se recupera el tiempo.`
      : 'El avance del proyecto es el promedio del avance de las actividades, ponderado por su duración. Se considera atraso cuando el real queda más de 5 puntos debajo del planificado.';

    Gantt.dibujar($('ganttContenedor'), r, s);

    const porId = new Map(s.actividades.map((a) => [a.id, a]));
    const fecha = (v) => (v ? v : '');
    $('tablaSeguimiento').innerHTML = `<table class="tabla-seg"><thead><tr>
      <th>Act.</th><th>Nombre</th><th class="num">Plan (día)</th><th class="num">Planificado</th>
      <th class="num">Avance real (%)</th><th>Inicio real</th><th>Fin real</th><th class="num">Desviación</th><th>Estado</th></tr></thead><tbody>` +
      r.actividades.map((a) => {
        const sg = porId.get(a.id);
        const av = r.avances[a.id] || { avanceReal: 0 };
        return `<tr>
          <td><strong>${UI.esc(a.id)}</strong>${a.critica ? ' <span class="crit">C</span>' : ''}</td>
          <td>${UI.esc(a.nombre || '')}</td>
          <td class="num">${+a.es.toFixed(2)} – ${+a.ef.toFixed(2)}</td>
          <td class="num">${sg.avancePlanificado === null ? '—' : f(sg.avancePlanificado) + ' %'}</td>
          <td class="num"><input type="number" class="av" min="0" max="100" step="any" data-id="${UI.esc(a.id)}" data-c="avanceReal" value="${av.avanceReal}"></td>
          <td><input type="date" class="fec" data-id="${UI.esc(a.id)}" data-c="inicioReal" value="${fecha(av.inicioReal)}"></td>
          <td><input type="date" class="fec" data-id="${UI.esc(a.id)}" data-c="finReal" value="${fecha(av.finReal)}"></td>
          <td class="num">${sg.desviacion === null ? '—' : (sg.desviacion > 0 ? '+' : '') + f(sg.desviacion)}</td>
          <td>${badge(sg.estado)}</td></tr>`;
      }).join('') + '</tbody></table>';
  }

  async function guardar() {
    const { id } = Proyectos.estado();
    if (!id || !actual) return;
    const avances = {};
    actual.actividades.forEach((a) => {
      const campo = (c) => document.querySelector(`#tablaSeguimiento input[data-id="${CSS.escape(a.id)}"][data-c="${c}"]`);
      avances[a.id] = {
        avanceReal: campo('avanceReal').value === '' ? 0 : Number(campo('avanceReal').value),
        inicioReal: campo('inicioReal').value || null,
        finReal: campo('finReal').value || null,
      };
    });
    try {
      await Api.put(`/api/pert/${id}/seguimiento`, { avances });
      UI.toast('Avance guardado.', 'ok');
      await cargar();
    } catch (e) {
      UI.toast(e.message, 'error', 6000);
    }
  }

  function iniciar() {
    document.querySelector('.tabs').addEventListener('click', (ev) => {
      const t = ev.target.closest('.tab');
      if (t) ir(t.dataset.tab);
    });
    $('btnActualizarSeg').addEventListener('click', cargar);
    $('diaCorte').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') cargar(); });
    $('btnGuardarAvance').addEventListener('click', guardar);
    document.addEventListener('pert:proyecto', () => { if (pestana === 'gantt') cargar(); });
  }

  iniciar();
  return { cargar, ir };
})();
