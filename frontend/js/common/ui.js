// =====================================================
// ui.js - utilidades de interfaz: toasts, tablas, escape de HTML
// =====================================================
const UI = {
  // Evita inyección de HTML al pintar datos del usuario
  esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  // Mensaje temporal. tipo: '', 'ok' o 'error'
  toast(mensaje, tipo = '', ms = 3500) {
    let cont = document.getElementById('toasts');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'toasts';
      document.body.appendChild(cont);
    }
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.textContent = mensaje;
    cont.appendChild(t);
    setTimeout(() => t.remove(), ms);
  },

  // Construye una tabla HTML.
  // columnas: [{ campo, titulo, num?: true, formato?: fn(valor, fila) }]
  tabla(columnas, filas) {
    const cab = columnas
      .map((c) => `<th class="${c.num ? 'num' : ''}">${this.esc(c.titulo)}</th>`).join('');
    const cuerpo = filas.length
      ? filas.map((f) => '<tr>' + columnas.map((c) => {
          const v = c.formato ? c.formato(f[c.campo], f) : this.esc(f[c.campo]);
          return `<td class="${c.num ? 'num' : ''}">${v}</td>`;
        }).join('') + '</tr>').join('')
      : `<tr><td colspan="${columnas.length}">Sin registros.</td></tr>`;
    return `<div class="table-wrap"><table><thead><tr>${cab}</tr></thead><tbody>${cuerpo}</tbody></table></div>`;
  },

  // Formatea números con decimales fijos
  num(valor, dec = 2) {
    return Number(valor).toLocaleString('es-PE', {
      minimumFractionDigits: dec, maximumFractionDigits: dec,
    });
  },
};
