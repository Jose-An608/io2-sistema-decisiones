// =====================================================
// productos.js - pestañas "Productos" y "Proveedores"
// =====================================================
const Productos = (() => {
  const $ = (id) => document.getElementById(id);
  let editando = null;

  function limpiar() {
    editando = null;
    $('p_codigo').value = '';
    $('p_nombre').value = '';
    $('p_proveedor').value = '';
    Inv.CAMPOS.forEach((c) => { $('p_' + c.k).value = c.def; });
    $('tituloFormProducto').textContent = 'Nuevo producto';
    $('btnCancelarProducto').hidden = true;
  }

  function leer() {
    return Object.assign(
      { codigo: $('p_codigo').value, nombre: $('p_nombre').value, idProveedor: $('p_proveedor').value || null },
      Inv.leerCampos('p_'),
    );
  }

  function pintarProveedores() {
    const previo = $('p_proveedor').value;
    $('p_proveedor').innerHTML = '<option value="">— Sin proveedor —</option>' +
      Inv.proveedores.map((v) => `<option value="${v.id}">${UI.esc(v.nombre)}</option>`).join('');
    $('p_proveedor').value = previo;
  }

  function pintarTabla() {
    $('tablaProductos').innerHTML = UI.tabla([
      { campo: 'codigo', titulo: 'Código' },
      { campo: 'nombre', titulo: 'Producto' },
      { campo: 'proveedor', titulo: 'Proveedor', formato: (v) => UI.esc(v || '—') },
      { campo: 'demandaAnual', titulo: 'Demanda anual', num: true, formato: (v) => UI.num(v, 0) },
      { campo: 'costoUnitario', titulo: 'Costo unit.', num: true, formato: (v) => Inv.soles(v) },
      { campo: 'tiempoEntregaDias', titulo: 'L (días)', num: true, formato: (v) => UI.num(v, 0) },
      { campo: 'stock', titulo: 'Stock', num: true, formato: (v) => UI.num(v, 0) },
      { campo: 'estado', titulo: 'Estado', formato: (v) => Inv.badge(v) },
      { campo: 'id', titulo: '', formato: (id) =>
        `<button type="button" class="btn btn-ghost btn-sm" data-acc="analizar" data-id="${id}">Analizar</button>` +
        `<button type="button" class="btn btn-ghost btn-sm" data-acc="editar" data-id="${id}">Editar</button>` +
        `<button type="button" class="btn btn-danger btn-sm" data-acc="eliminar" data-id="${id}">Eliminar</button>` },
    ], Inv.productos);
  }

  async function guardar(ev) {
    ev.preventDefault();
    const cuerpo = leer();
    const r = await Inv.accion(
      () => (editando ? Api.put(`/api/inventario/productos/${editando}`, cuerpo) : Api.post('/api/inventario/productos', cuerpo)),
      editando ? 'Producto actualizado.' : 'Producto guardado.',
    );
    if (r) limpiar();
  }

  function editar(id) {
    const p = Inv.productos.find((x) => x.id === id);
    if (!p) return;
    editando = id;
    $('p_codigo').value = p.codigo;
    $('p_nombre').value = p.nombre;
    $('p_proveedor').value = p.idProveedor || '';
    Inv.escribirCampos('p_', p);
    $('tituloFormProducto').textContent = `Editando ${p.codigo}`;
    $('btnCancelarProducto').hidden = false;
    $('formProducto').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function iniciar() {
    $('camposProducto').innerHTML = Inv.camposHTML('p_');
    $('formProducto').addEventListener('submit', guardar);
    $('btnCancelarProducto').addEventListener('click', limpiar);
    $('btnAnalizarForm').addEventListener('click', () => {
      Analisis.cargarDatos(Inv.leerCampos('p_'));
      Tabs.ir('analisis');
    });
    $('tablaProductos').addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-acc]');
      if (!b) return;
      const id = Number(b.dataset.id);
      if (b.dataset.acc === 'editar') editar(id);
      if (b.dataset.acc === 'analizar') { Analisis.cargarProducto(id); Tabs.ir('analisis'); }
      if (b.dataset.acc === 'eliminar') {
        const p = Inv.productos.find((x) => x.id === id);
        if (confirm(`¿Eliminar "${p ? p.nombre : 'el producto'}" con sus movimientos y pedidos?`)) {
          await Inv.accion(() => Api.delete(`/api/inventario/productos/${id}`), 'Producto eliminado.');
          if (editando === id) limpiar();
        }
      }
    });
    document.addEventListener('inv:datos', () => { pintarProveedores(); pintarTabla(); });
  }

  iniciar();
  return { limpiar };
})();

const Proveedores = (() => {
  const $ = (id) => document.getElementById(id);
  let editando = null;
  const campos = ['nombre', 'contacto', 'telefono', 'email'];

  function limpiar() {
    editando = null;
    campos.forEach((c) => { $('v_' + c).value = ''; });
    $('tituloFormProveedor').textContent = 'Nuevo proveedor';
    $('btnCancelarProveedor').hidden = true;
  }

  function pintarTabla() {
    $('tablaProveedores').innerHTML = UI.tabla([
      { campo: 'nombre', titulo: 'Proveedor' },
      { campo: 'contacto', titulo: 'Contacto', formato: (v) => UI.esc(v || '—') },
      { campo: 'telefono', titulo: 'Teléfono', formato: (v) => UI.esc(v || '—') },
      { campo: 'email', titulo: 'Email', formato: (v) => UI.esc(v || '—') },
      { campo: 'productos', titulo: 'Productos', num: true },
      { campo: 'id', titulo: '', formato: (id) =>
        `<button type="button" class="btn btn-ghost btn-sm" data-acc="editar" data-id="${id}">Editar</button>` +
        `<button type="button" class="btn btn-danger btn-sm" data-acc="eliminar" data-id="${id}">Eliminar</button>` },
    ], Inv.proveedores);
  }

  function iniciar() {
    $('formProveedor').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const cuerpo = {};
      campos.forEach((c) => { cuerpo[c] = $('v_' + c).value; });
      const r = await Inv.accion(
        () => (editando ? Api.put(`/api/inventario/proveedores/${editando}`, cuerpo) : Api.post('/api/inventario/proveedores', cuerpo)),
        editando ? 'Proveedor actualizado.' : 'Proveedor guardado.',
      );
      if (r) limpiar();
    });
    $('btnCancelarProveedor').addEventListener('click', limpiar);
    $('tablaProveedores').addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-acc]');
      if (!b) return;
      const id = Number(b.dataset.id);
      const v = Inv.proveedores.find((x) => x.id === id);
      if (!v) return;
      if (b.dataset.acc === 'editar') {
        editando = id;
        campos.forEach((c) => { $('v_' + c).value = v[c] || ''; });
        $('tituloFormProveedor').textContent = `Editando ${v.nombre}`;
        $('btnCancelarProveedor').hidden = false;
        $('formProveedor').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (confirm(`¿Eliminar al proveedor "${v.nombre}"? Sus productos quedarán sin proveedor.`)) {
        await Inv.accion(() => Api.delete(`/api/inventario/proveedores/${id}`), 'Proveedor eliminado.');
        if (editando === id) limpiar();
      }
    });
    document.addEventListener('inv:datos', pintarTabla);
  }

  iniciar();
  return { limpiar };
})();
