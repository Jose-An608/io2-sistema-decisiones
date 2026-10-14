// =====================================================
// matriz.js (frontend) - editor de la matriz de pagos y
// guardado de decisiones. Orquesta la pantalla.
// =====================================================
const Matriz = (() => {
  const $ = (id) => document.getElementById(id);
  let estado = nuevoEstado();
  let temporizador = null;
  let secuencia = 0; // descarta respuestas viejas si el usuario sigue escribiendo

  function nuevoEstado() {
    return {
      id: null,
      nombre: '',
      descripcion: '',
      tipo: 'beneficio',
      alfa: 0.5,
      alternativas: ['Alternativa 1', 'Alternativa 2'],
      estados: [{ nombre: 'Estado 1', probabilidad: '' }, { nombre: 'Estado 2', probabilidad: '' }],
      matriz: [['', ''], ['', '']],
    };
  }

  // ---------- Editor de la matriz ----------

  function dibujar() {
    const e = estado;
    let h = '<div class="table-wrap"><table class="editor"><thead><tr><th>Alternativa \\ Estado</th>';
    e.estados.forEach((est, j) => {
      h += `<th><div class="celda-cab">
              <input type="text" maxlength="100" data-k="est-nombre" data-j="${j}" value="${UI.esc(est.nombre)}" aria-label="Nombre del estado ${j + 1}">
              <button type="button" class="btn-x no-print" data-accion="del-est" data-j="${j}" title="Quitar estado" ${e.estados.length <= 1 ? 'disabled' : ''}>×</button>
            </div></th>`;
    });
    h += '<th class="sin-borde no-print"><button type="button" class="btn btn-ghost btn-sm" data-accion="add-est">+ Estado</button></th></tr>';

    h += '<tr class="fila-prob"><th>Probabilidad (opcional)</th>';
    e.estados.forEach((est, j) => {
      h += `<th><input type="number" step="any" min="0" max="1" placeholder="—" data-k="est-prob" data-j="${j}" value="${UI.esc(est.probabilidad)}" aria-label="Probabilidad del estado ${j + 1}"></th>`;
    });
    h += '<th class="sin-borde"><span id="sumaProb"></span></th></tr></thead><tbody>';

    e.alternativas.forEach((alt, i) => {
      h += `<tr><th><div class="celda-cab">
              <input type="text" maxlength="100" data-k="alt-nombre" data-i="${i}" value="${UI.esc(alt)}" aria-label="Nombre de la alternativa ${i + 1}">
              <button type="button" class="btn-x no-print" data-accion="del-alt" data-i="${i}" title="Quitar alternativa" ${e.alternativas.length <= 1 ? 'disabled' : ''}>×</button>
            </div></th>`;
      e.estados.forEach((_, j) => {
        h += `<td><input type="number" step="any" data-k="pago" data-i="${i}" data-j="${j}" value="${UI.esc(e.matriz[i][j])}" aria-label="Pago de ${UI.esc(alt)} en ${UI.esc(e.estados[j].nombre)}"></td>`;
      });
      h += '<td class="sin-borde"></td></tr>';
    });
    h += '</tbody></table></div>';

    $('editorMatriz').innerHTML = h;
    actualizarSuma();
  }

  // Muestra si las probabilidades suman 1
  function actualizarSuma() {
    const el = $('sumaProb');
    if (!el) return;
    const valores = estado.estados.map((s) => s.probabilidad);
    const llenos = valores.filter((v) => v !== '' && v !== null);
    if (llenos.length === 0) {
      el.innerHTML = '<span class="badge badge-warn">Sin VME</span>';
      return;
    }
    const suma = valores.reduce((acc, v) => acc + (Number(v) || 0), 0);
    const ok = llenos.length === valores.length && Math.abs(suma - 1) < 1e-6;
    el.innerHTML = `<span class="badge ${ok ? 'badge-ok' : 'badge-danger'}">Suma: ${UI.num(suma, 2)}</span>`;
  }

  // Cada tecla actualiza el estado sin redibujar (así no se pierde el cursor)
  function alEscribir(ev) {
    const t = ev.target;
    const k = t.dataset && t.dataset.k;
    if (!k) return;
    const i = Number(t.dataset.i);
    const j = Number(t.dataset.j);
    if (k === 'alt-nombre') estado.alternativas[i] = t.value;
    else if (k === 'est-nombre') estado.estados[j].nombre = t.value;
    else if (k === 'est-prob') { estado.estados[j].probabilidad = t.value; actualizarSuma(); }
    else if (k === 'pago') estado.matriz[i][j] = t.value;
    programarCalculo();
  }

  // Botones de agregar / quitar filas y columnas
  function alPulsar(ev) {
    const b = ev.target.closest('[data-accion]');
    if (!b) return;
    const i = Number(b.dataset.i);
    const j = Number(b.dataset.j);
    switch (b.dataset.accion) {
      case 'add-alt':
        estado.alternativas.push(`Alternativa ${estado.alternativas.length + 1}`);
        estado.matriz.push(estado.estados.map(() => ''));
        break;
      case 'add-est':
        estado.estados.push({ nombre: `Estado ${estado.estados.length + 1}`, probabilidad: '' });
        estado.matriz.forEach((f) => f.push(''));
        break;
      case 'del-alt':
        if (estado.alternativas.length > 1) { estado.alternativas.splice(i, 1); estado.matriz.splice(i, 1); }
        break;
      case 'del-est':
        if (estado.estados.length > 1) { estado.estados.splice(j, 1); estado.matriz.forEach((f) => f.splice(j, 1)); }
        break;
      default:
        return;
    }
    dibujar();
    programarCalculo();
  }

  // ---------- Datos enviados al servidor ----------

  // Convierte el estado de la pantalla al formato de la API
  function aPayload(paraCalculo) {
    const matriz = estado.matriz.map((f) => f.map((v) => (v === '' || v === null ? NaN : Number(v))));
    if (matriz.some((f) => f.some((v) => Number.isNaN(v)))) {
      throw new Error('Completa todos los pagos de la matriz con números.');
    }
    return {
      nombre: estado.nombre.trim() || (paraCalculo ? 'Sin título' : ''),
      descripcion: estado.descripcion.trim() || null,
      tipo: estado.tipo,
      alfa: estado.alfa,
      alternativas: estado.alternativas,
      estados: estado.estados.map((s) => ({
        nombre: s.nombre,
        probabilidad: s.probabilidad === '' || s.probabilidad === null ? null : Number(s.probabilidad),
      })),
      matriz,
    };
  }

  function programarCalculo() {
    clearTimeout(temporizador);
    temporizador = setTimeout(calcular, 350);
  }

  async function calcular() {
    const mia = ++secuencia;
    let payload;
    try {
      payload = aPayload(true);
    } catch (err) {
      Criterios.limpiar(err.message);
      return;
    }
    try {
      const analisis = await Api.post('/api/decisiones/calcular', payload);
      if (mia !== secuencia) return;
      Criterios.render(analisis, payload.estados.map((s) => s.nombre));
    } catch (err) {
      if (mia !== secuencia) return;
      Criterios.limpiar(err.message);
    }
  }

  // ---------- Decisiones guardadas ----------

  function pintarFormulario() {
    $('nombre').value = estado.nombre;
    $('descripcion').value = estado.descripcion || '';
    $('tipo').value = estado.tipo;
    $('alfa').value = estado.alfa;
    $('alfaTexto').textContent = Number(estado.alfa).toFixed(2);
  }

  async function cargarLista(seleccionarId) {
    const lista = await Api.get('/api/decisiones');
    const sel = $('selDecisiones');
    sel.innerHTML = '<option value="">— Nueva decisión (sin guardar) —</option>'
      + lista.map((d) => `<option value="${d.id}">${UI.esc(d.nombre)} (${d.numAlternativas}×${d.numEstados})</option>`).join('');
    sel.value = seleccionarId ? String(seleccionarId) : '';
    return lista;
  }

  async function cargar(id) {
    const d = await Api.get(`/api/decisiones/${id}`);
    estado = {
      id: d.id,
      nombre: d.nombre,
      descripcion: d.descripcion || '',
      tipo: d.tipo,
      alfa: d.alfa,
      alternativas: d.alternativas,
      estados: d.estados.map((s) => ({ nombre: s.nombre, probabilidad: s.probabilidad === null ? '' : s.probabilidad })),
      matriz: d.matriz.map((f) => f.map((v) => String(v))),
    };
    pintarFormulario();
    dibujar();
    calcular();
  }

  function nueva() {
    estado = nuevoEstado();
    $('selDecisiones').value = '';
    pintarFormulario();
    dibujar();
    Criterios.limpiar('Completa la matriz de pagos para ver los resultados.');
  }

  async function guardar() {
    if (!estado.nombre.trim()) {
      UI.toast('Escribe un nombre para la decisión.', 'error');
      $('nombre').focus();
      return;
    }
    try {
      const payload = aPayload(false);
      if (estado.id) {
        await Api.put(`/api/decisiones/${estado.id}`, payload);
        UI.toast('Decisión actualizada.', 'ok');
      } else {
        const r = await Api.post('/api/decisiones', payload);
        estado.id = r.id;
        UI.toast('Decisión guardada.', 'ok');
      }
      await cargarLista(estado.id);
    } catch (err) {
      UI.toast(err.message, 'error', 6000);
    }
  }

  async function eliminar() {
    if (!estado.id) {
      UI.toast('Esta decisión todavía no está guardada.', 'error');
      return;
    }
    if (!window.confirm(`¿Eliminar la decisión "${estado.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await Api.delete(`/api/decisiones/${estado.id}`);
      UI.toast('Decisión eliminada.', 'ok');
      const lista = await cargarLista();
      if (lista.length) { $('selDecisiones').value = String(lista[0].id); await cargar(lista[0].id); } else nueva();
    } catch (err) {
      UI.toast(err.message, 'error', 6000);
    }
  }

  function imprimir() {
    $('infoImpresion').textContent =
      `Informe: ${estado.nombre || 'Sin título'} · ${estado.tipo === 'costo' ? 'costos' : 'beneficios'} · ${new Date().toLocaleDateString('es-PE')}`;
    window.print();
  }

  // ---------- Arranque ----------

  async function iniciar() {
    $('editorMatriz').addEventListener('input', alEscribir);
    document.addEventListener('click', alPulsar);

    $('nombre').addEventListener('input', (e) => { estado.nombre = e.target.value; });
    $('descripcion').addEventListener('input', (e) => { estado.descripcion = e.target.value; });
    $('tipo').addEventListener('change', (e) => { estado.tipo = e.target.value; programarCalculo(); });
    $('alfa').addEventListener('input', (e) => {
      estado.alfa = Number(e.target.value);
      $('alfaTexto').textContent = estado.alfa.toFixed(2);
      programarCalculo();
    });

    $('btnNueva').addEventListener('click', nueva);
    $('btnGuardar').addEventListener('click', guardar);
    $('btnEliminar').addEventListener('click', eliminar);
    $('btnImprimir').addEventListener('click', imprimir);
    $('selDecisiones').addEventListener('change', async (e) => {
      if (!e.target.value) { nueva(); return; }
      try { await cargar(e.target.value); } catch (err) { UI.toast(err.message, 'error', 6000); }
    });

    try {
      const lista = await cargarLista();
      if (lista.length) { $('selDecisiones').value = String(lista[0].id); await cargar(lista[0].id); return; }
    } catch (err) {
      UI.toast(`No se pudo leer la base de datos: ${err.message}`, 'error', 6000);
    }
    nueva();
  }

  return { iniciar };
})();
