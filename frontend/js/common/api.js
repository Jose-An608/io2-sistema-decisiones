// =====================================================
// api.js - envoltura de fetch para hablar con el backend
// =====================================================
const Api = {
  async request(url, opciones = {}) {
    const resp = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opciones,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    });
    let datos = null;
    try { datos = await resp.json(); } catch (_) { /* respuesta sin JSON */ }
    if (!resp.ok) {
      throw new Error((datos && datos.error) || `Error ${resp.status} en ${url}`);
    }
    return datos;
  },
  get(url) { return this.request(url); },
  post(url, body) { return this.request(url, { method: 'POST', body }); },
  put(url, body) { return this.request(url, { method: 'PUT', body }); },
  delete(url) { return this.request(url, { method: 'DELETE' }); },
};
