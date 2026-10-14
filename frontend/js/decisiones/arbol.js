// =====================================================
// arbol.js (frontend) - editor visual del árbol de decisión,
// evaluación (hacia atrás, en el servidor) y diagrama SVG.
// =====================================================
const Arbol = (() => {
  const $ = (id) => document.getElementById(id);
  const fmt = (v) => UI.num(v, Number.isInteger(v) ? 0 : 2);

  let estado = nuevoEstado();
  let temporizador = null;
  let secuencia = 0;
  let listaCargada = false;

  // ---------- Modelo en pantalla ----------
  // Los números se guardan como texto mientras se escribe (permite campos vacíos)

  // (function declarations: se necesitan antes de crear el estado inicial)
  function nodoTerminal() { return { tipo: 'terminal', etiqueta: '', pago: '', ramas: [] }; }
  function ramaVacia(etiqueta = '') { return { etiqueta, valorRama: '', probabilidad: '', nodo: nodoTerminal() }; }

  function nuevoEstado() {
    return {
      id: null, nombre: '', descripcion: '', tipo: 'beneficio',
      raiz: { tipo: 'decision', etiqueta: 'Decisión', pago: '', ramas: [ramaVacia('Alternativa 1'), ramaVacia('Alternativa 2')] },
    };
  }

  // Convierte el árbol del servidor (números) al modelo de pantalla (texto)
  function desdeServidor(n) {
    return {
      tipo: n.tipo,
      etiqueta: n.etiqueta || '',
      pago: n.tipo === 'terminal' ? String(n.pago) : '',
      ramas: (n.ramas || []).map((r) => ({
        etiqueta: r.etiqueta || '',
        valorRama: r.valorRama ? String(r.valorRama) : '',
        probabilidad: r.probabilidad === null || r.probabilidad === undefined ? '' : String(r.probabilidad),
        nodo: desdeServidor(r.nodo),
      })),
    };
  }

  // Nodo que está en la ruta "0.2.1" (índices de rama desde la raíz; '' = raíz)
  const nodoEn = (ruta) => (ruta === '' ? estado.raiz : ruta.split('.').reduce((n, i) => n.ramas[Number(i)].nodo, estado.raiz));

  const aNumero = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

  // Convierte el modelo de pantalla al formato de la API
  function convertir(n) {
    if (n.tipo === 'terminal') {
      const pago = aNumero(n.pago);
      if (Number.isNaN(pago)) throw new Error('Completa el pago de todos los nodos terminales (▶).');
      return { tipo: 'terminal', etiqueta: n.etiqueta, pago, ramas: [] };
    }
    return {
      tipo: n.tipo,
      etiqueta: n.etiqueta,
      ramas: n.ramas.map((r) => {
        let probabilidad = null;
        if (n.tipo === 'azar') {
          probabilidad = aNumero(r.probabilidad);
          if (Number.isNaN(probabilidad)) throw new Error('Completa la probabilidad de todas las ramas de los nodos de azar (●).');
        }
        const valorRama = r.valorRama === '' ? 0 : Number(r.valorRama);
        return { etiqueta: r.etiqueta, valorRama, probabilidad, nodo: convertir(r.nodo) };
      }),
    };
  }

  function aPayload(paraCalculo) {
    return {
      nombre: estado.nombre.trim() || (paraCalculo ? 'Sin título' : ''),
      descripcion: estado.descripcion.trim() || null,
      tipo: estado.tipo,
      arbol: convertir(estado.raiz),
    };
  }

  // ---------- Editor anidado ----------

  const ICONO = { decision: '■', azar: '●', terminal: '▶' };
  const NOMBRE_TIPO = { decision: 'Decisión', azar: 'Azar', terminal: 'Terminal' };

  function htmlNodo(n, ruta) {
    const np = ruta.join('.');
    const opciones = ['decision', 'azar', 'terminal']
      .map((t) => `<option value="${t}" ${t === n.tipo ? 'selected' : ''}>${ICONO[t]} ${NOMBRE_TIPO[t]}</option>`).join('');
    let h = `<div class="nodo nodo-${n.tipo}">
      <div class="nodo-cab">
        <select data-ak="tipo" data-np="${np}" aria-label="Tipo de nodo">${opciones}</select>
        <input type="text" maxlength="100" data-ak="etiqueta" data-np="${np}" value="${UI.esc(n.etiqueta)}" placeholder="${n.tipo === 'terminal' ? 'Resultado (opcional)' : 'Nombre del nodo'}" aria-label="Nombre del nodo">`;
    if (n.tipo === 'terminal') {
      h += `<label class="mini">Pago <input type="number" step="any" data-ak="pago" data-np="${np}" value="${UI.esc(n.pago)}" placeholder="0"></label>`;
    } else {
      h += `<button type="button" class="btn btn-ghost btn-sm no-print" data-aa="add-rama" data-np="${np}">+ Rama</button>`;
    }
    h += '</div>';

    if (n.tipo !== 'terminal') {
      h += '<div class="ramas">';
      n.ramas.forEach((r, i) => {
        h += `<div class="rama"><div class="rama-cab">
          <input type="text" maxlength="100" data-ak="r-etiqueta" data-np="${np}" data-bi="${i}" value="${UI.esc(r.etiqueta)}" placeholder="Etiqueta de la rama" aria-label="Etiqueta de la rama">
          <label class="mini">Valor <input type="number" step="any" data-ak="r-valor" data-np="${np}" data-bi="${i}" value="${UI.esc(r.valorRama)}" placeholder="0"></label>`;
        if (n.tipo === 'azar') {
          h += `<label class="mini">Prob. <input type="number" step="any" min="0" max="1" data-ak="r-prob" data-np="${np}" data-bi="${i}" value="${UI.esc(r.probabilidad)}" placeholder="0.5"></label>`;
        }
        h += `<button type="button" class="btn-x no-print" data-aa="del-rama" data-np="${np}" data-bi="${i}" title="Quitar rama" ${n.ramas.length <= 2 ? 'disabled' : ''}>×</button>
          </div>${htmlNodo(r.nodo, ruta.concat(i))}</div>`;
      });
      if (n.tipo === 'azar') h += `<div class="suma-azar" data-suma="${np}"></div>`;
      h += '</div>';
    }
    return h + '</div>';
  }

  function dibujarEditor() {
    $('editorArbol').innerHTML = htmlNodo(estado.raiz, []);
    actualizarSumas();
  }

  // Muestra si las probabilidades de cada nodo de azar suman 1
  function actualizarSumas() {
    document.querySelectorAll('#editorArbol [data-suma]').forEach((el) => {
      const n = nodoEn(el.dataset.suma);
      const suma = n.ramas.reduce((a, r) => a + (Number(r.probabilidad) || 0), 0);
      const ok = n.ramas.every((r) => r.probabilidad !== '') && Math.abs(suma - 1) < 1e-6;
      el.innerHTML = `<span class="badge ${ok ? 'badge-ok' : 'badge-danger'}">Suma de probabilidades: ${UI.num(suma, 2)}</span>`;
    });
  }

  function cambiarTipo(n, tipo) {
    if (tipo === n.tipo) return;
    if (tipo === 'terminal') {
      n.ramas = [];
      n.pago = '';
    } else if (n.tipo === 'terminal') {
      n.ramas = [ramaVacia('Rama 1'), ramaVacia('Rama 2')];
    }
    n.tipo = tipo;
  }

  // Escribir actualiza el modelo sin redibujar (así no se pierde el cursor)
  function alEscribir(ev) {
    const t = ev.target;
    const k = t.dataset && t.dataset.ak;
    if (!k || k === 'tipo') return;
    const n = nodoEn(t.dataset.np);
    const bi = Number(t.dataset.bi);
    if (k === 'etiqueta') n.etiqueta = t.value;
    else if (k === 'pago') n.pago = t.value;
    else if (k === 'r-etiqueta') n.ramas[bi].etiqueta = t.value;
    else if (k === 'r-valor') n.ramas[bi].valorRama = t.value;
    else if (k === 'r-prob') { n.ramas[bi].probabilidad = t.value; actualizarSumas(); }
    programarCalculo();
  }

  function alCambiar(ev) {
    const t = ev.target;
    if (!t.dataset || t.dataset.ak !== 'tipo') return;
    cambiarTipo(nodoEn(t.dataset.np), t.value);
    dibujarEditor();
    programarCalculo();
  }

  function alPulsar(ev) {
    const b = ev.target.closest('[data-aa]');
    if (!b) return;
    const n = nodoEn(b.dataset.np);
    if (b.dataset.aa === 'add-rama') {
      n.ramas.push(ramaVacia(`Rama ${n.ramas.length + 1}`));
    } else if (b.dataset.aa === 'del-rama' && n.ramas.length > 2) {
      n.ramas.splice(Number(b.dataset.bi), 1);
    } else {
      return;
    }
    dibujarEditor();
    programarCalculo();
  }

  // ---------- Evaluación ----------

  function programarCalculo() {
    clearTimeout(temporizador);
    temporizador = setTimeout(calcular, 350);
  }

  function limpiar(mensaje) {
    $('resultadoArbol').hidden = true;
    $('mensajeArbol').innerHTML = `<div class="alert alert-warn">${UI.esc(mensaje)}</div>`;
  }

  async function calcular() {
    const mia = ++secuencia;
    let payload;
    try {
      payload = aPayload(true);
    } catch (err) {
      limpiar(err.message);
      return;
    }
    try {
      const res = await Api.post('/api/decisiones/arboles/calcular', payload);
      if (mia !== secuencia) return;
      pintarResultado(res);
    } catch (err) {
      if (mia !== secuencia) return;
      limpiar(err.message);
    }
  }

  function pintarResultado(res) {
    $('mensajeArbol').innerHTML = '';
    $('resultadoArbol').hidden = false;

    const primera = res.politica[0];
    $('resumenArbol').innerHTML =
      `<div class="titulo">Valor esperado del árbol</div>
       <div class="principal">${fmt(res.valorEsperado)}</div>
       <p>${primera
         ? `Decisión recomendada en "${UI.esc(primera.nodo)}": <strong>${UI.esc(primera.eleccion)}</strong>.`
         : 'Este árbol no tiene nodos de decisión: solo se calcula el valor esperado.'}
       ${res.totalNodos} nodos · ${res.profundidad} niveles · ${res.tipo === 'costo' ? 'se minimizan costos' : 'se maximizan beneficios'}.</p>`;

    $('politicaArbol').innerHTML = res.politica.length
      ? '<ol class="politica">' + res.politica.map((p) => {
        const cuando = p.cuando.length ? ` <span class="cuando">(si ${p.cuando.map(UI.esc).join(' → ')})</span>` : '';
        const otras = p.alternativas.filter((a) => !a.elegida)
          .map((a) => `${UI.esc(a.etiqueta)}: ${fmt(a.valorTotal)}`).join(' · ');
        return `<li><strong>${UI.esc(p.nodo)}</strong>${cuando}: elegir <strong>${UI.esc(p.eleccion)}</strong> → ${fmt(p.valor)}${p.empate ? ' (empate)' : ''}
          ${otras ? `<span class="otras">Alternativas descartadas: ${otras}</span>` : ''}</li>`;
      }).join('') + '</ol>'
      : '<p class="ayuda">No hay decisiones que tomar en este árbol.</p>';

    $('diagramaArbol').innerHTML = diagrama(res.arbol);
  }

  // ---------- Diagrama SVG ----------

  const DX = 250;   // separación horizontal entre niveles
  const DY = 62;    // separación vertical entre hojas
  const MX = 90;    // margen izquierdo
  const MY = 50;    // margen superior
  const R = 11;     // tamaño de los símbolos

  const recorta = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  function diagrama(raiz) {
    // 1) Posiciones: las hojas se apilan; cada nodo queda centrado entre sus hijos
    let fila = 0;
    let maxProf = 0;
    const disponer = (n, prof) => {
      maxProf = Math.max(maxProf, prof);
      n._x = MX + prof * DX;
      if (n.ramas.length === 0) { n._y = MY + fila * DY; fila += 1; return; }
      n.ramas.forEach((r) => disponer(r.nodo, prof + 1));
      n._y = (n.ramas[0].nodo._y + n.ramas[n.ramas.length - 1].nodo._y) / 2;
    };
    disponer(raiz, 0);
    const ancho = MX + maxProf * DX + 150;
    const alto = MY + Math.max(fila, 1) * DY;

    // 2) Dibujo
    let lineas = '';
    let nodos = '';

    const conector = (n, r, activo) => {
      const hijo = r.nodo;
      const x1 = n._x + R;
      const x2 = hijo._x - (hijo.tipo === 'terminal' ? 4 : R);
      const xm = x1 + (x2 - x1) * 0.4;
      const optima = activo && r.elegida;
      const descartada = !activo || !r.elegida;
      const clase = optima ? 'elegida' : descartada ? 'descartada' : '';
      let s = `<path class="linea ${clase}" d="M${x1} ${n._y} H${xm} V${hijo._y} H${x2}"/>`;
      // Corte "//" sobre las alternativas descartadas de un nodo de decisión activo
      if (activo && n.tipo === 'decision' && !r.elegida) {
        const cx = xm + 18;
        s += `<line class="corte" x1="${cx - 4}" y1="${hijo._y + 7}" x2="${cx + 2}" y2="${hijo._y - 7}"/>`
          + `<line class="corte" x1="${cx + 3}" y1="${hijo._y + 7}" x2="${cx + 9}" y2="${hijo._y - 7}"/>`;
      }
      const completa = r.etiqueta + (r.probabilidad !== null && r.probabilidad !== undefined ? ` (p=${r.probabilidad})` : '')
        + (r.valorRama ? ` [valor ${fmt(r.valorRama)}]` : '');
      s += `<text class="t-rama" x="${xm + 8}" y="${hijo._y - 7}"><title>${UI.esc(completa)}</title>${UI.esc(recorta(r.etiqueta, 24))}</text>`;
      const extra = [];
      if (r.probabilidad !== null && r.probabilidad !== undefined) extra.push(`p = ${r.probabilidad}`);
      if (r.valorRama) extra.push(`valor ${fmt(r.valorRama)}`);
      if (extra.length) s += `<text class="t-extra" x="${xm + 8}" y="${hijo._y + 15}">${UI.esc(extra.join(' · '))}</text>`;
      return s;
    };

    const simbolo = (n, activo) => {
      const inact = activo ? '' : ' inactivo';
      if (n.tipo === 'terminal') {
        return `<g class="${inact}"><circle class="sim sim-terminal" cx="${n._x}" cy="${n._y}" r="4"/>`
          + `<text class="t-pago" x="${n._x + 10}" y="${n._y + 4}">${fmt(n.pago)}</text>`
          + (n.etiqueta ? `<text class="t-etq" x="${n._x + 10}" y="${n._y + 18}">${UI.esc(recorta(n.etiqueta, 22))}</text>` : '')
          + '</g>';
      }
      const forma = n.tipo === 'decision'
        ? `<rect class="sim sim-decision" x="${n._x - R}" y="${n._y - R}" width="${R * 2}" height="${R * 2}" rx="3"/>`
        : `<circle class="sim sim-azar" cx="${n._x}" cy="${n._y}" r="${R}"/>`;
      return `<g class="${inact}">${forma}`
        + `<text class="t-etq" x="${n._x}" y="${n._y - R - 6}" text-anchor="middle">${UI.esc(recorta(n.etiqueta, 24))}</text>`
        + `<text class="t-ve" x="${n._x}" y="${n._y + R + 15}" text-anchor="middle">${fmt(n.valorEsperado)}</text></g>`;
    };

    const pintar = (n, activo) => {
      nodos += simbolo(n, activo);
      n.ramas.forEach((r) => {
        lineas += conector(n, r, activo);
        pintar(r.nodo, activo && r.elegida);
      });
    };
    pintar(raiz, true);

    return `<svg class="arbol-svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Diagrama del árbol de decisión">${lineas}${nodos}</svg>`;
  }

  // ---------- Árboles guardados ----------

  function pintarFormulario() {
    $('arbolNombre').value = estado.nombre;
    $('arbolDescripcion').value = estado.descripcion || '';
    $('arbolTipo').value = estado.tipo;
  }

  function mostrar() {
    pintarFormulario();
    dibujarEditor();
    calcular();
  }

  async function cargarLista(seleccionarId) {
    const lista = await Api.get('/api/decisiones/arboles');
    const sel = $('selArboles');
    sel.innerHTML = '<option value="">— Nuevo árbol (sin guardar) —</option>'
      + lista.map((a) => `<option value="${a.id}">${UI.esc(a.nombre)} (${a.numNodos} nodos)</option>`).join('');
    sel.value = seleccionarId ? String(seleccionarId) : '';
    return lista;
  }

  async function cargar(id) {
    const a = await Api.get(`/api/decisiones/arboles/${id}`);
    estado = { id: a.id, nombre: a.nombre, descripcion: a.descripcion || '', tipo: a.tipo, raiz: desdeServidor(a.arbol) };
    mostrar();
  }

  function nuevo() {
    estado = nuevoEstado();
    $('selArboles').value = '';
    pintarFormulario();
    dibujarEditor();
    limpiar('Completa el árbol (pagos y probabilidades) para ver la evaluación.');
  }

  async function cargarEjemplo() {
    try {
      const e = await Api.get('/api/decisiones/arboles/ejemplo');
      estado = { id: null, nombre: e.nombre, descripcion: e.descripcion, tipo: e.tipo, raiz: desdeServidor(e.arbol) };
      $('selArboles').value = '';
      mostrar();
      UI.toast('Ejemplo cargado. Pulsa Guardar si quieres conservarlo.', 'ok');
    } catch (err) {
      UI.toast(err.message, 'error', 6000);
    }
  }

  async function guardar() {
    if (!estado.nombre.trim()) {
      UI.toast('Escribe un nombre para el árbol.', 'error');
      $('arbolNombre').focus();
      return;
    }
    try {
      const payload = aPayload(false);
      if (estado.id) {
        await Api.put(`/api/decisiones/arboles/${estado.id}`, payload);
        UI.toast('Árbol actualizado.', 'ok');
      } else {
        const r = await Api.post('/api/decisiones/arboles', payload);
        estado.id = r.id;
        UI.toast('Árbol guardado.', 'ok');
      }
      await cargarLista(estado.id);
    } catch (err) {
      UI.toast(err.message, 'error', 6000);
    }
  }

  async function eliminar() {
    if (!estado.id) {
      UI.toast('Este árbol todavía no está guardado.', 'error');
      return;
    }
    if (!window.confirm(`¿Eliminar el árbol "${estado.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await Api.delete(`/api/decisiones/arboles/${estado.id}`);
      UI.toast('Árbol eliminado.', 'ok');
      const lista = await cargarLista();
      if (lista.length) { $('selArboles').value = String(lista[0].id); await cargar(lista[0].id); } else nuevo();
    } catch (err) {
      UI.toast(err.message, 'error', 6000);
    }
  }

  function imprimir() {
    $('infoImpresionArbol').textContent =
      `Informe: ${estado.nombre || 'Sin título'} · ${estado.tipo === 'costo' ? 'costos' : 'beneficios'} · ${new Date().toLocaleDateString('es-PE')}`;
    window.print();
  }

  // ---------- Generar el árbol desde la matriz de pagos ----------

  // Arma el árbol con lo que hay en la pestaña Matriz:
  //   decisión (una rama por alternativa) -> azar (una rama por estado, con su probabilidad)
  //   -> terminal (el pago de esa celda)
  // Es una copia: si luego cambias la matriz, vuelve a generar el árbol.
  function generarDesdeMatriz() {
    const m = Matriz.obtenerEstado();
    const hayPagos = m.matriz.some((fila) => fila.some((v) => v !== ''));
    if (!hayPagos) {
      UI.toast('Primero completa la matriz de pagos en la pestaña "Matriz de pagos".', 'error', 5000);
      return;
    }
    if (estado.id === null && !window.confirm('Se reemplazará el árbol que estás editando por uno generado desde la matriz. ¿Continuar?')) return;

    const ramas = m.alternativas.map((alt, i) => {
      // Con un solo estado no hay azar: el pago va directo
      const nodo = m.estados.length === 1
        ? { tipo: 'terminal', etiqueta: '', pago: String(m.matriz[i][0]), ramas: [] }
        : {
          tipo: 'azar',
          etiqueta: 'Estado de la naturaleza',
          pago: '',
          ramas: m.estados.map((est, j) => ({
            etiqueta: est.nombre,
            valorRama: '',
            probabilidad: est.probabilidad === null ? '' : String(est.probabilidad),
            nodo: { tipo: 'terminal', etiqueta: '', pago: String(m.matriz[i][j]), ramas: [] },
          })),
        };
      return { etiqueta: alt, valorRama: '', probabilidad: '', nodo };
    });

    estado = {
      id: null,
      nombre: m.nombre ? `Árbol de: ${m.nombre}` : 'Árbol generado desde la matriz',
      descripcion: m.descripcion || '',
      tipo: m.tipo,
      raiz: { tipo: 'decision', etiqueta: m.nombre || 'Decisión', pago: '', ramas },
    };
    $('selArboles').value = '';
    mostrar();

    const faltanProbs = m.estados.length > 1 && m.estados.some((e) => e.probabilidad === '' || e.probabilidad === null);
    UI.toast(faltanProbs
      ? 'Árbol generado. Completa las probabilidades de cada nodo de azar para ver la evaluación.'
      : 'Árbol generado desde la matriz de pagos.', faltanProbs ? '' : 'ok', 5000);
  }

  // ---------- Pestañas y arranque ----------

  async function abrirPestana(cual) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('activa', b.dataset.tab === cual));
    $('vistaMatriz').hidden = cual !== 'matriz';
    $('vistaArbol').hidden = cual !== 'arbol';
    if (cual === 'arbol' && !listaCargada) {
      listaCargada = true;
      try {
        const lista = await cargarLista();
        if (lista.length) { $('selArboles').value = String(lista[0].id); await cargar(lista[0].id); return; }
      } catch (err) {
        UI.toast(`No se pudo leer la base de datos: ${err.message}`, 'error', 6000);
      }
      nuevo();
    }
  }

  function iniciar() {
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => abrirPestana(b.dataset.tab)));

    const ed = $('editorArbol');
    ed.addEventListener('input', alEscribir);
    ed.addEventListener('change', alCambiar);
    ed.addEventListener('click', alPulsar);

    $('arbolNombre').addEventListener('input', (e) => { estado.nombre = e.target.value; });
    $('arbolDescripcion').addEventListener('input', (e) => { estado.descripcion = e.target.value; });
    $('arbolTipo').addEventListener('change', (e) => { estado.tipo = e.target.value; programarCalculo(); });

    $('btnArbolNuevo').addEventListener('click', nuevo);
    $('btnArbolEjemplo').addEventListener('click', cargarEjemplo);
    $('btnArbolDesdeMatriz').addEventListener('click', generarDesdeMatriz);
    $('btnArbolGuardar').addEventListener('click', guardar);
    $('btnArbolEliminar').addEventListener('click', eliminar);
    $('btnArbolImprimir').addEventListener('click', imprimir);
    $('selArboles').addEventListener('change', async (e) => {
      if (!e.target.value) { nuevo(); return; }
      try { await cargar(e.target.value); } catch (err) { UI.toast(err.message, 'error', 6000); }
    });
  }

  return { iniciar };
})();
