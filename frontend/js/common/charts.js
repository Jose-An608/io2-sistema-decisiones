// =====================================================
// charts.js - envoltura de Chart.js (si no hay Internet, los gráficos se omiten)
// =====================================================
const Graficos = {
  _instancias: {},

  disponible() { return typeof Chart !== 'undefined'; },

  // Dibuja (o redibuja) un gráfico en el canvas indicado
  dibujar(idCanvas, config) {
    if (!this.disponible()) return null;
    this.limpiar(idCanvas);
    const canvas = document.getElementById(idCanvas);
    if (!canvas) return null;
    config.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, config.options || {});
    this._instancias[idCanvas] = new Chart(canvas, config);
    return this._instancias[idCanvas];
  },

  limpiar(idCanvas) {
    if (this._instancias[idCanvas]) {
      this._instancias[idCanvas].destroy();
      delete this._instancias[idCanvas];
    }
  },
};
