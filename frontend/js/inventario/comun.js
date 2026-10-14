// =====================================================
// comun.js - datos y utilidades compartidas del módulo Inventarios
// =====================================================
const Inv = {
  productos: [],
  proveedores: [],

  // Campos numéricos del modelo (pct: se escribe en % y se envía como fracción)
  CAMPOS: [
    { k: 'demandaAnual', et: 'Demanda anual D (unid./año)', def: 1000 },
    { k: 'costoPedido', et: 'Costo de pedido S (S/ por pedido)', def: 10 },
    { k: 'costoUnitario', et: 'Costo unitario c (S/)', def: 20 },
    { k: 'tasaMantenimiento', et: 'Tasa de mantenimiento i (% anual)', def: 10, pct: true },
    { k: 'costoAlmacenamientoUnidad', et: 'Almacenamiento a (S/ por unid. al año)', def: 0.5 },
    { k: 'tiempoEntregaDias', et: 'Tiempo de entrega L (días)', def: 5 },
    { k: 'desviacionDemandaDiaria', et: 'Desviación de la demanda diaria σd', def: 1.5 },
    { k: 'nivelServicio', et: 'Nivel de servicio (%)', def: 95, pct: true },
    { k: 'diasAnio', et: 'Días por año', def: 365 },
  ],

  ESTADOS: {
    agotado: { txt: 'Agotado', clase: 'badge-danger' },
    riesgo: { txt: 'En riesgo', clase: 'badge-danger' },
    pedir: { txt: 'Pedir ahora', clase: 'badge-warn' },
    en_camino: { txt: 'En camino', clase: 'badge-info' },
    ok: { txt: 'Normal', clase: 'badge-ok' },
  },

  badge(estado) {
    const e = this.ESTADOS[estado] || { txt: estado, clase: '' };
    return `<span class="badge ${e.clase}">${UI.esc(e.txt)}</span>`;
  },

  soles(v) { return 'S/ ' + UI.num(v, 2); },

  // HTML de los campos numéricos con un prefijo para los id
  camposHTML(prefijo) {
    return this.CAMPOS.map((c) =>
      `<div><label for="${prefijo}${c.k}">${UI.esc(c.et)}</label>` +
      `<input type="number" inputmode="decimal" step="any" min="0" id="${prefijo}${c.k}" value="${c.def}"></div>`).join('');
  },

  // Lee los campos y devuelve el cuerpo para la API (vacío = se omite)
  leerCampos(prefijo) {
    const o = {};
    for (const c of this.CAMPOS) {
      const crudo = document.getElementById(prefijo + c.k).value.trim();
      if (crudo === '') continue;
      const n = Number(crudo);
      o[c.k] = c.pct ? +(n / 100).toFixed(8) : n;
    }
    return o;
  },

  escribirCampos(prefijo, p) {
    for (const c of this.CAMPOS) {
      const v = p[c.k];
      document.getElementById(prefijo + c.k).value = v === undefined || v === null ? '' : (c.pct ? +(v * 100).toFixed(4) : v);
    }
  },

  // Rellena un <select> con los productos
  llenarProductos(select, vacio) {
    const previo = select.value;
    const opciones = this.productos.map((p) => `<option value="${p.id}">${UI.esc(p.codigo)} — ${UI.esc(p.nombre)}</option>`);
    if (vacio) opciones.unshift(`<option value="">${UI.esc(vacio)}</option>`);
    select.innerHTML = opciones.join('');
    if ([...select.options].some((o) => o.value === previo)) select.value = previo;
  },

  async cargar() {
    const [productos, proveedores] = await Promise.all([
      Api.get('/api/inventario/productos'),
      Api.get('/api/inventario/proveedores'),
    ]);
    this.productos = productos;
    this.proveedores = proveedores;
    document.dispatchEvent(new CustomEvent('inv:datos'));
  },

  // Ejecuta una acción y refresca datos; muestra el error si falla
  async accion(fn, mensajeOk) {
    try {
      const r = await fn();
      await this.cargar();
      if (mensajeOk) UI.toast(mensajeOk, 'ok');
      return r;
    } catch (e) {
      UI.toast(e.message, 'error', 6000);
      return null;
    }
  },
};

// ----- Pestañas -----
const Tabs = {
  actual: null,

  ir(nombre) {
    const existe = document.querySelector(`.tab[data-tab="${nombre}"]`);
    if (!existe) nombre = 'alertas';
    this.actual = nombre;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('activa', t.dataset.tab === nombre));
    document.querySelectorAll('[data-vista]').forEach((v) => { v.hidden = v.dataset.vista !== nombre; });
    try { history.replaceState(null, '', '#' + nombre); } catch (_) { /* sin historial */ }
    document.dispatchEvent(new CustomEvent('inv:tab', { detail: nombre }));
  },

  iniciar() {
    document.querySelector('.tabs').addEventListener('click', (ev) => {
      const t = ev.target.closest('.tab');
      if (t) this.ir(t.dataset.tab);
    });
    this.ir(location.hash.replace('#', '') || 'alertas');
  },
};
