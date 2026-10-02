// =====================================================================
// Cliente de la API REST.
// La sesión vive en una cookie httpOnly (no se usa localStorage).
// El token JWT solo permanece en memoria para respaldar llamadas
// cross-origin dentro de la misma sesión.
// =====================================================================
const API = {
  baseUrl: '/api',

  _token: null,           // respaldo en memoria (la cookie mantiene la sesión entre recargas)
  _usuarioCache: null,    // usuario actual, recargado con /auth/me en cada página

  token() { return this._token; },
  usuario() { return this._usuarioCache; },

  _base() { return location.pathname.includes('/pages/') ? '../' : './'; },

  async request(path, opciones = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
    if (this._token) headers.Authorization = 'Bearer ' + this._token;

    const res = await fetch(this.baseUrl + path, {
      ...opciones,
      credentials: 'include', // permite la cookie httpOnly de sesión
      headers,
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401 && path !== '/auth/login') {
      this._token = null;
      this._usuarioCache = null;
      location.href = this._base() + 'pages/login.html';
      throw new Error('Sesión expirada');
    }
    if (!res.ok) throw new Error(data.error || 'Error en la petición');
    return data;
  },

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this._token = data.token || null;
    this._usuarioCache = data.usuario || null;
    return data;
  },

  async logout() {
    try {
      await fetch(this.baseUrl + '/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) { /* sin red */ }
    this._token = null;
    this._usuarioCache = null;
    location.href = this._base() + 'pages/login.html';
  },

  // Verifica la sesión vigente (cookie) y recarga el usuario en memoria.
  async proteger() {
    this._usuarioCache = await this.get('/auth/me');
  },

  esAdmin() { return this._usuarioCache?.rol === 'admin'; },

  get: (p) => API.request(p),
  post: (p, body) => API.request(p, { method: 'POST', body: JSON.stringify(body) }),
  put: (p, body) => API.request(p, { method: 'PUT', body: JSON.stringify(body) }),
  del: (p, body) => API.request(p, { method: 'DELETE', body: JSON.stringify(body) }),
};

function cerrarSesion() { API.logout(); }
