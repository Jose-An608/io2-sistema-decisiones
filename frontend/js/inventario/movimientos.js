// =====================================================
// movimientos.js - entradas/salidas/ajustes y pedidos a proveedores
// =====================================================
const Movimientos = (() => {
  const $ = (id) => document.getElementById(id);

  function textoStock() {
    const p = Inv.productos.find((x) => x.id === Number($('m_producto').value));
    $('stockMovimiento').textContent = p
      ? `Stock actual de ${p.codigo}: ${UI.num(p.stock, 0)} unidades` + (p.enOrden ? ` (+ ${UI.num(p.enOrden, 0)} en camino).` : '.')
      : 'Registra primero un producto.';
  }

  function textoSugerencia() {
    const p = Inv.productos.find((x) => x.id === Number($('o_producto').value));
    if (!p) { $('sugerenciaOrden').textContent = ''; return; }
    const a = Alertas.alertaDe(p.id);
    $('sugerenciaOrden').textContent = a && a.cantidadSugerida
      ? `Cantidad sugerida (lote económico): ${UI.num(Math.ceil(a.cantidadSugerida), 0)} unidades.` : 'No hay una cantidad sugerida: el stock está sobre el punto de pedido.';
  }

  async function pintarListas() {
    try {
      const filtro = $('filtroMovimientos').value;
      const [ordenes, movs] = await Promise.all([
        Api.get('/api/inventario/ordenes'),
        Api.get('/api/inventario/movimientos' + (filtro ? `?idProducto=${filtro}` : '')),
      ]);
      $('tablaOrdenes').innerHTML = UI.tabla([
        { campo: 'id', titulo: 'N.º', formato: (v) => `#${v}` },
        { campo: 'producto', titulo: 'Producto', formato: (v, f) => `${UI.esc(f.codigo)} — ${UI.esc(v)}` },
        { campo: 'cantidad', titulo: 'Cantidad', num: true, formato: (v) => UI.num(v, 0) },
        { campo: 'fechaPedido', titulo: 'Fecha del pedido', formato: (v) => new Date(v).toLocaleString('es-PE') },
        { campo: 'estado', titulo: 'Estado', formato: (v) => (v === 'pendiente' ? '<span class="badge badge-info">Pendiente</span>' : '<span class="badge badge-ok">Recibida</span>') },
        { campo: 'id', titulo: '', formato: (id, f) => (f.estado === 'pendiente'
          ? `<button type="button" class="btn btn-sm" data-ord="recibir" data-id="${id}">Registrar recepción</button>` +
            `<button type="button" class="btn btn-danger btn-sm" data-ord="eliminar" data-id="${id}">Anular</button>` : '') },
      ], ordenes);
      $('tablaMovimientos').innerHTML = UI.tabla([
        { campo: 'fecha', titulo: 'Fecha', formato: (v) => new Date(v).toLocaleString('es-PE') },
        { campo: 'producto', titulo: 'Producto', formato: (v, f) => `${UI.esc(f.codigo)} — ${UI.esc(v)}` },
        { campo: 'tipo', titulo: 'Tipo', formato: (v) => UI.esc(v.charAt(0).toUpperCase() + v.slice(1)) },
        { campo: 'cantidad', titulo: 'Cantidad', num: true, formato: (v) => UI.num(v, 0) },
        { campo: 'nota', titulo: 'Nota', formato: (v) => UI.esc(v || '') },
        { campo: 'id', titulo: '', formato: (id) => `<button type="button" class="btn btn-danger btn-sm" data-mov="eliminar" data-id="${id}">Eliminar</button>` },
      ], movs);
    } catch (e) {
      UI.toast(e.message, 'error', 6000);
    }
  }

  function llenarSelects() {
    Inv.llenarProductos($('m_producto'));
    Inv.llenarProductos($('o_producto'));
    Inv.llenarProductos($('filtroMovimientos'), 'Todos los productos');
    textoStock();
    textoSugerencia();
  }

  function iniciar() {
    $('formMovimiento').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const cuerpo = {
        idProducto: $('m_producto').value, tipo: $('m_tipo').value,
        cantidad: $('m_cantidad').value, nota: $('m_nota').value,
      };
      const r = await Inv.accion(() => Api.post('/api/inventario/movimientos', cuerpo), 'Movimiento registrado.');
      if (r) { $('m_cantidad').value = ''; $('m_nota').value = ''; }
    });
    $('formOrden').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const cuerpo = { idProducto: $('o_producto').value, cantidad: $('o_cantidad').value };
      const r = await Inv.accion(() => Api.post('/api/inventario/ordenes', cuerpo), 'Pedido generado.');
      if (r) $('o_cantidad').value = '';
    });
    $('m_producto').addEventListener('change', textoStock);
    $('o_producto').addEventListener('change', textoSugerencia);
    $('filtroMovimientos').addEventListener('change', pintarListas);
    $('tablaOrdenes').addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-ord]');
      if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.ord === 'recibir') await Inv.accion(() => Api.post(`/api/inventario/ordenes/${id}/recibir`, {}), 'Recepción registrada: el stock aumentó.');
      else if (confirm('¿Anular este pedido pendiente?')) await Inv.accion(() => Api.delete(`/api/inventario/ordenes/${id}`), 'Pedido anulado.');
    });
    $('tablaMovimientos').addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-mov]');
      if (b && confirm('¿Eliminar este movimiento? El stock se recalculará.')) {
        await Inv.accion(() => Api.delete(`/api/inventario/movimientos/${b.dataset.id}`), 'Movimiento eliminado.');
      }
    });
    document.addEventListener('inv:datos', () => { llenarSelects(); pintarListas(); });
    document.addEventListener('inv:alertas', textoSugerencia);
  }

  iniciar();
  return { pintarListas };
})();
