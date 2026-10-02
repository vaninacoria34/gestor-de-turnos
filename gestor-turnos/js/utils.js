// ===== Utilidades =====
const Utils = {
  fechaHoy() { return new Date().toISOString().slice(0, 10); },

  formatoFecha(fechaISO) {
    const [a, m, d] = fechaISO.split('-');
    return `${d}/${m}/${a}`;
  },

  iniciales(nombre) {
    return nombre.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  },

  confirmar(msg) { return confirm(msg); },

  notificar(msg) {
    let el = document.getElementById('notificacion');
    if (!el) {
      el = document.createElement('div');
      el.id = 'notificacion';
      el.style.cssText = 'position:fixed;top:16px;right:16px;background:#2e7d32;color:#fff;padding:12px 20px;border-radius:8px;z-index:999;transition:opacity .3s';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(() => (el.style.opacity = '0'), 2500);
  },
};
