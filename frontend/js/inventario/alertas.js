// =====================================================
// alertas.js - pestaña "Alertas": stock frente al punto de pedido
// =====================================================
const Alertas = (() => {
  const $ = (id) => document.getElementById(id);
  let ultimo = [];

  async function cargar() {
    try {
      const r = await Api.get('/api/inventario/alertas');
      ultimo = r.productos;
      mostrar(r);
      document.dispatchEvent(new CustomEvent('inv:alertas'));
    } catch (e) {
      $('resumenAlertas').innerHTML = '';
      $('tablaAlertas').innerHTML = `<div class="alert alert-danger">${UI.esc(e.message)}</div>`;
    }
  }

  function mostrar(r) {
    const orden = ['agotado', 'riesgo', 'pedir', 'en_camino', 'ok'];
    $('resumenAlertas').innerHTML = orden.map((k) =>
      `<div class="tile t-${k}"><div class="etq">${UI.esc(Inv.ESTADOS[k].txt)}</div><div class="valor">${r.resumen[k]}</div></div>`).join('');

    if (!r.productos.length) {
      $('tablaAlertas').innerHTML = '<div class="alert alert-warn">Aún no hay productos. Regístralos en la pestaña “Productos”.</div>';
      return;
    }
    const cols = [
      { campo: 'estado', titulo: 'Estado', formato: (v) => Inv.badge(v) },
      { campo: 'nombre', titulo: 'Producto', formato: (v, f) => `<strong>${UI.esc(f.codigo)}</strong> — ${UI.esc(v)}` },
      { campo: 'stock', titulo: 'Stock', num: true, formato: (v) => UI.num(v, 0) },
      { campo: 'enOrden', titulo: 'En camino', num: true, formato: (v) => UI.num(v, 0) },
      { campo: 'puntoPedido', titulo: 'Punto de pedido', num: true, formato: (v) => UI.num(v, 1) },
      { campo: 'stockSeguridad', titulo: 'Stock seguridad', num: true, formato: (v) => UI.num(v, 1) },
      { campo: 'diasCobertura', titulo: 'Cobertura', num: true, formato: (v) => (v === null ? '—' : UI.num(v, 1) + ' d') },
      { campo: 'mensaje', titulo: 'Situación', formato: (v) => UI.esc(v) },
      { campo: 'cantidadSugerida', titulo: '', formato: (v, f) => (v
        ? `<button type="button" class="btn btn-sm" data-pedir="${f.id}" data-cant="${Math.ceil(v)}">Pedir ${UI.num(Math.ceil(v), 0)}</button>` : '') },
    ];
    $('tablaAlertas').innerHTML = UI.tabla(cols, r.productos);
  }

  function alertaDe(id) { return ultimo.find((x) => x.id === id) || null; }

  function iniciar() {
    $('btnRefrescarAlertas').addEventListener('click', async () => { await Inv.cargar().catch((e) => UI.toast(e.message, 'error')); });
    $('tablaAlertas').addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-pedir]');
      if (!b) return;
      await Inv.accion(
        () => Api.post('/api/inventario/ordenes', { idProducto: b.dataset.pedir, cantidad: b.dataset.cant }),
        'Pedido generado. Cuando llegue, regístralo en “Movimientos y pedidos”.',
      );
    });
    document.addEventListener('inv:datos', cargar);
  }

  iniciar();
  return { cargar, alertaDe };
})();
