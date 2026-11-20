// Cuentas de jugador, ranking, estadísticas, historial y amigos. Todo vive en una base SQLite
// (la del Durable Object de cuentas, en Cloudflare; en las pruebas, node:sqlite).
// No toca la red directamente: recibe "sql", el reloj, cómo verificar el token de Google y cómo
// avisarle algo a quien está conectado (amigos, invitaciones).
//
//   sql(consulta, ...valores) -> filas (objetos)
//   google(credential, clientId) -> { sub, nombre, dado }
//   avisar(uid, mensaje)   enLinea() -> Set de uids conectados
export const ELO0 = 1000, K = 32;
const SESION_MS = 120 * 864e5;           // una sesión dura cuatro meses (se renueva al usarla)
const MAX_AMIGOS = 200;
export const mesDe = t => new Date(t - 3 * 3600e3).toISOString().slice(0, 7);   // el mes en hora de Uruguay
// de dónde sos (los 19 departamentos, o fuera de Uruguay)
export const LUGARES = ['Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores', 'Florida', 'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú',
  'Río Negro', 'Rivera', 'Rocha', 'Salto', 'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres', 'Fuera de Uruguay'];
export const N_COLORES = 7;
export const PJ_RE = /^[a-z][a-z0-9-]{0,23}$/;   // código de personaje 3D
const FOTO_MAX = 90 * 1024;               // la foto ya llega recortada y achicada (256×256): con esto sobra
const texto = (v, max) => String(v ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const limpiarApodo = v => String(v || '').normalize('NFC').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
// gremios: nombre de 3 a 24 letras o números, sigla de 2 a 4 (en mayúsculas), hasta 30 integrantes
const limpiarGremio = v => String(v || '').normalize('NFC').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const limpiarSigla = v => String(v || '').normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase().slice(0, 4);
const MAX_GREMIO = 30;
const int = v => { const n = Number(v); return Number.isInteger(n) ? n : null; };
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hash = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const esperado = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
const ok = j => ({ s: 200, j });
const mal = (s, error) => ({ s, j: { error } });

export class Cuentas {
  constructor(o) {
    this.sql = o.sql; this.now = o.now || Date.now;
    this.google = o.google || null; this.googleId = o.googleId || '';
    this.prueba = !!o.prueba;
    this.admins = new Set((o.admins || []).map(Number).filter(Number.isInteger));   // cuentas que ven la lista de cuentas creadas
    this.avisar = o.avisar || (() => {}); this.enLinea = o.enLinea || (() => new Set());
    this.transaccion = o.transaccion || (f => f());
    this.avisarTodos = o.avisarTodos || (() => {});
    this.invitado = new Map();             // "de>para" -> cuándo invitó (para no llenar de invitaciones)
  }
  q(s, ...a) { return this.sql(s, ...a); }
  q1(s, ...a) { return this.sql(s, ...a)[0] || null; }

  init() {
    this.q(`CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY, google TEXT UNIQUE, apodo TEXT NOT NULL, apodo_min TEXT UNIQUE, creado INTEGER, visto INTEGER,
      elo REAL DEFAULT ${ELO0}, partidos INTEGER DEFAULT 0, ganados INTEGER DEFAULT 0, abandonos INTEGER DEFAULT 0,
      racha INTEGER DEFAULT 0, mejor_racha INTEGER DEFAULT 0,
      manos INTEGER DEFAULT 0, manos_ganadas INTEGER DEFAULT 0, envidos INTEGER DEFAULT 0, flores INTEGER DEFAULT 0, trucos INTEGER DEFAULT 0,
      mes TEXT, elo_mes REAL DEFAULT ${ELO0}, partidos_mes INTEGER DEFAULT 0, ganados_mes INTEGER DEFAULT 0)`);
    this.q(`CREATE TABLE IF NOT EXISTS sesiones (token TEXT PRIMARY KEY, usuario INTEGER, vence INTEGER)`);
    this.q(`CREATE TABLE IF NOT EXISTS partidos (id TEXT PRIMARY KEY, fecha INTEGER, n INTEGER, ganador INTEGER, tanteador TEXT, equipos TEXT)`);
    this.q(`CREATE TABLE IF NOT EXISTS jugadas (partido TEXT, usuario INTEGER, equipo INTEGER, gano INTEGER, abandono INTEGER, delta REAL, elo REAL, fecha INTEGER, PRIMARY KEY (partido, usuario))`);
    this.q(`CREATE TABLE IF NOT EXISTS amigos (de INTEGER, para INTEGER, estado TEXT, desde INTEGER, PRIMARY KEY (de, para))`);
    this.q(`CREATE INDEX IF NOT EXISTS jugadas_usuario ON jugadas (usuario, fecha)`);
    this.q(`CREATE INDEX IF NOT EXISTS usuarios_elo ON usuarios (elo)`);
    this.q(`CREATE INDEX IF NOT EXISTS amigos_para ON amigos (para)`);
    this.q(`CREATE TABLE IF NOT EXISTS cambios (nombre TEXT PRIMARY KEY, fecha INTEGER, hecho INTEGER)`);
    this.q(`CREATE TABLE IF NOT EXISTS publicas (codigo TEXT PRIMARY KEY, n INTEGER, personas INTEGER, nombres TEXT, creada INTEGER, actualizada INTEGER)`);
    try { this.q(`ALTER TABLE publicas ADD COLUMN cfg TEXT`); } catch (e) {}   // las reglas de cada mesa (se agregó después)
    // las que ya empezaron siguen en la lista para mirarlas: con el tanteador y cuántos miran
    try { this.q(`ALTER TABLE publicas ADD COLUMN empezada INTEGER DEFAULT 0`); } catch (e) {}
    try { this.q(`ALTER TABLE publicas ADD COLUMN tanto TEXT`); } catch (e) {}
    try { this.q(`ALTER TABLE publicas ADD COLUMN mirando INTEGER DEFAULT 0`); } catch (e) {}
    // lo del perfil (columnas que se agregaron después: si ya están, no pasa nada)
    for (const col of ['nombre TEXT', 'bio TEXT', 'lugar TEXT', 'cuadro TEXT', 'color INTEGER', 'foto_v INTEGER DEFAULT 0', 'pj TEXT', 'faltas INTEGER DEFAULT 0', 'falta37 INTEGER DEFAULT 0', 'gremio INTEGER', 'gremio_desde INTEGER']) {
      try { this.q(`ALTER TABLE usuarios ADD COLUMN ${col}`); } catch (e) {}
    }
    this.q(`CREATE TABLE IF NOT EXISTS fotos (usuario INTEGER PRIMARY KEY, tipo TEXT, datos TEXT)`);
    // gremios: cada cuenta está en uno como mucho (usuarios.gremio). Suman los partidos que juegan sus integrantes
    // mientras están en el gremio (en total y en el mes), y por eso compiten en su propio ranking
    this.q(`CREATE TABLE IF NOT EXISTS gremios (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, nombre_min TEXT UNIQUE, sigla TEXT, lema TEXT,
      creado INTEGER, dueno INTEGER, partidos INTEGER DEFAULT 0, ganados INTEGER DEFAULT 0, mes TEXT, partidos_mes INTEGER DEFAULT 0, ganados_mes INTEGER DEFAULT 0)`);
    this.q(`CREATE INDEX IF NOT EXISTS usuarios_gremio ON usuarios (gremio)`);
  }
  // un arreglo que se hace una sola vez en la base (queda anotado aunque no haya habido nada que cambiar)
  unaVez(nombre, f) {
    if (this.q1(`SELECT nombre FROM cambios WHERE nombre = ?`, nombre)) return false;
    let hecho = false;
    this.transaccion(() => { hecho = !!f(); this.q(`INSERT INTO cambios (nombre, fecha, hecho) VALUES (?, ?, ?)`, nombre, this.now(), hecho ? 1 : 0); });
    return hecho;
  }
  // intercambia los números de dos cuentas: cada una se queda con todo lo suyo (apodo, puntos, sesiones,
  // historial, amigos); solo cambia el número
  intercambiar(a, b) {
    if (a === b || !this.q1(`SELECT id FROM usuarios WHERE id = ?`, a) || !this.q1(`SELECT id FROM usuarios WHERE id = ?`, b)) return false;
    const T = -987654;
    const cambiar = (tabla, col) => {
      this.q(`UPDATE ${tabla} SET ${col} = ? WHERE ${col} = ?`, T, a);
      this.q(`UPDATE ${tabla} SET ${col} = ? WHERE ${col} = ?`, a, b);
      this.q(`UPDATE ${tabla} SET ${col} = ? WHERE ${col} = ?`, b, T);
    };
    cambiar('usuarios', 'id'); cambiar('sesiones', 'usuario'); cambiar('jugadas', 'usuario'); cambiar('amigos', 'de'); cambiar('amigos', 'para');
    for (const p of this.q(`SELECT id, equipos FROM partidos`)) {
      let eq; try { eq = JSON.parse(p.equipos || '[]'); } catch (e) { continue; }
      let cambio = false;
      eq.forEach(l => (l || []).forEach(x => { if (x && x.cuenta === a) { x.cuenta = b; cambio = true; } else if (x && x.cuenta === b) { x.cuenta = a; cambio = true; } }));
      if (cambio) this.q(`UPDATE partidos SET equipos = ? WHERE id = ?`, JSON.stringify(eq), p.id);
    }
    return true;
  }

  // ---------- sesiones ----------
  async nuevaSesion(uid) {
    const bytes = crypto.getRandomValues(new Uint8Array(32)), token = b64u(bytes);
    this.q(`DELETE FROM sesiones WHERE vence < ?`, this.now());
    this.q(`INSERT INTO sesiones (token, usuario, vence) VALUES (?, ?, ?)`, await hash(token), uid, this.now() + SESION_MS);
    return token;
  }
  async sesionDe(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const h = await hash(token), s = this.q1(`SELECT usuario, vence FROM sesiones WHERE token = ?`, h);
    if (!s || s.vence < this.now()) return null;
    const u = this.q1(`SELECT * FROM usuarios WHERE id = ?`, s.usuario);
    if (!u) return null;
    if (s.vence - this.now() < SESION_MS - 864e5) this.q(`UPDATE sesiones SET vence = ? WHERE token = ?`, this.now() + SESION_MS, h);
    if (this.now() - (u.visto || 0) > 60e3) this.q(`UPDATE usuarios SET visto = ? WHERE id = ?`, this.now(), u.id);
    return u;
  }
  apodoLibre(base, menos) {
    base = limpiarApodo(base);
    if (base.length < 2) base = 'Jugador';
    for (let i = 1; i < 1000; i++) {
      const cand = i === 1 ? base : base.slice(0, 20 - String(i).length - 1) + ' ' + i;
      const r = this.q1(`SELECT id FROM usuarios WHERE apodo_min = ?`, cand.toLowerCase());
      if (!r || r.id === menos) return cand;
    }
    return base.slice(0, 12) + ' ' + Math.floor(Math.random() * 1e6);
  }
  async entrar(google, nombre) {
    let u = this.q1(`SELECT * FROM usuarios WHERE google = ?`, google);
    if (!u) {
      const apodo = this.apodoLibre(nombre);
      this.q(`INSERT INTO usuarios (google, apodo, apodo_min, creado, visto, mes) VALUES (?, ?, ?, ?, ?, ?)`, google, apodo, apodo.toLowerCase(), this.now(), this.now(), mesDe(this.now()));
      u = this.q1(`SELECT * FROM usuarios WHERE google = ?`, google);
    }
    return { token: await this.nuevaSesion(u.id), yo: this.perfil(u, true) };
  }

  // ---------- lo que se muestra de cada uno ----------
  posicion(u) {
    if (!u.partidos) return null;
    return this.q1(`SELECT COUNT(*) AS n FROM usuarios WHERE partidos > 0 AND (elo > ? OR (elo = ? AND id < ?))`, u.elo, u.elo, u.id).n + 1;
  }
  // lo que hace falta para dibujar a alguien en una lista: foto (su versión, para que el navegador la guarde) o color
  gremioCorto(id) { const g = id && this.q1(`SELECT id, nombre, sigla FROM gremios WHERE id = ?`, id); return g ? { id: g.id, nombre: g.nombre, sigla: g.sigla } : null; }
  // sale del gremio; si era el dueño, queda el que hace más que está; si no queda nadie, el gremio se borra
  salirDeGremio(u) {
    if (!u.gremio) return;
    this.q(`UPDATE usuarios SET gremio = NULL, gremio_desde = NULL WHERE id = ?`, u.id);
    const g = this.q1(`SELECT dueno FROM gremios WHERE id = ?`, u.gremio);
    if (!g) return;
    const otro = this.q1(`SELECT id FROM usuarios WHERE gremio = ? ORDER BY gremio_desde, id LIMIT 1`, u.gremio);
    if (!otro) this.q(`DELETE FROM gremios WHERE id = ?`, u.gremio);
    else if (g.dueno === u.id) this.q(`UPDATE gremios SET dueno = ? WHERE id = ?`, otro.id, u.gremio);
  }
  gremioFicha(g, mes) {
    const m = g.mes === mes;
    return { id: g.id, nombre: g.nombre, sigla: g.sigla, lema: g.lema || '', creado: g.creado, dueno: g.dueno,
      miembros: this.q1(`SELECT COUNT(*) AS n FROM usuarios WHERE gremio = ?`, g.id).n,
      partidos: g.partidos, ganados: g.ganados, mes: { partidos: m ? g.partidos_mes : 0, ganados: m ? g.ganados_mes : 0 } };
  }
  cara(r) { return { foto: r.foto_v || null, color: Number.isInteger(r.color) ? r.color : null }; }
  perfil(u, propio) {
    const mesActual = mesDe(this.now()), mes = u.mes === mesActual;
    return {
      id: u.id, apodo: u.apodo, desde: u.creado, ...this.cara(u),
      nombre: u.nombre || '', bio: u.bio || '', lugar: u.lugar || '', cuadro: u.cuadro || '', pj: u.pj || null,
      puntos: Math.round(u.elo), posicion: this.posicion(u),
      partidos: u.partidos, ganados: u.ganados, abandonos: u.abandonos, racha: u.racha, mejorRacha: u.mejor_racha,
      manos: u.manos, manosGanadas: u.manos_ganadas, envidos: u.envidos, flores: u.flores, trucos: u.trucos, faltas: u.faltas || 0, falta37: u.falta37 || 0,
      mes: { mes: mesActual, puntos: Math.round(mes ? u.elo_mes : ELO0), partidos: mes ? u.partidos_mes : 0, ganados: mes ? u.ganados_mes : 0 },
      gremio: this.gremioCorto(u.gremio),
      enLinea: !propio && this.enLinea().has(u.id) || undefined,
      admin: propio && this.admins.has(u.id) || undefined,
    };
  }
  historial(uid, n) {
    return this.q(`SELECT j.partido, j.equipo, j.gano, j.abandono, j.delta, p.fecha, p.n, p.ganador, p.tanteador, p.equipos
      FROM jugadas j JOIN partidos p ON p.id = j.partido WHERE j.usuario = ? ORDER BY j.fecha DESC LIMIT ?`, uid, n)
      .map(r => ({ fecha: r.fecha, n: r.n, equipo: r.equipo, gano: !!r.gano, abandono: !!r.abandono, delta: Math.round(r.delta), tanteador: r.tanteador, equipos: JSON.parse(r.equipos || '[[],[]]') }));
  }
  relacion(yo, otro) {
    const r = this.q1(`SELECT de, estado FROM amigos WHERE (de = ? AND para = ?) OR (de = ? AND para = ?)`, yo, otro, otro, yo);
    if (!r) return 'no';
    if (r.estado === 'si') return 'amigos';
    return r.de === yo ? 'enviada' : 'recibida';
  }
  amigosDe(uid) {
    return this.q(`SELECT para AS id FROM amigos WHERE de = ? AND estado = 'si' UNION SELECT de AS id FROM amigos WHERE para = ? AND estado = 'si'`, uid, uid).map(r => r.id);
  }

  // ---------- pedidos de las páginas ----------
  // req: Request. Devuelve { s: estado HTTP, j: respuesta en JSON }
  async http(req) {
    const url = new URL(req.url), ruta = url.pathname.replace(/^\/api\//, ''), metodo = req.method;
    let cuerpo = {};
    if (metodo === 'POST') { try { cuerpo = await req.json(); } catch (e) { cuerpo = {}; } if (!cuerpo || typeof cuerpo !== 'object') cuerpo = {}; }
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const yo = token ? await this.sesionDe(token) : null;
    const conSesion = () => yo ? null : mal(401, 'Tenés que entrar con tu cuenta.');
    try {
      const mf = /^foto\/(\d+)$/.exec(ruta);
      if (mf && metodo === 'GET') {
        const f = this.q1(`SELECT tipo, datos FROM fotos WHERE usuario = ?`, +mf[1]);
        if (!f) return mal(404, 'Sin foto.');
        return { s: 200, raw: Uint8Array.from(atob(f.datos), c => c.charCodeAt(0)), tipo: f.tipo };
      }
      switch (metodo + ' ' + ruta) {
        case 'GET cuenta/config': return ok({ google: this.googleId || null, prueba: this.prueba });
        case 'POST cuenta/google': {
          if (!this.google || !this.googleId) return mal(503, 'El acceso con Google todavía no está configurado.');
          let g; try { g = await this.google(String(cuerpo.credential || ''), this.googleId); } catch (e) { return mal(401, 'Google no confirmó tu cuenta: ' + e.message); }
          return ok(await this.entrar('g:' + g.sub, g.dado || g.nombre));
        }
        case 'POST cuenta/prueba': {
          if (!this.prueba) return mal(404, 'No existe.');
          const nombre = limpiarApodo(cuerpo.nombre);
          if (nombre.length < 2) return mal(400, 'Poné un nombre.');
          return ok(await this.entrar('prueba:' + nombre.toLowerCase(), nombre));
        }
        case 'GET cuenta/yo': return conSesion() || ok({ yo: this.perfil(yo, true), historial: this.historial(yo.id, 20) });
        case 'POST cuenta/apodo': {
          if (!yo) return conSesion();
          const a = limpiarApodo(cuerpo.apodo);
          if (a.length < 2) return mal(400, 'El apodo tiene que tener entre 2 y 20 letras o números.');
          const r = this.q1(`SELECT id FROM usuarios WHERE apodo_min = ?`, a.toLowerCase());
          if (r && r.id !== yo.id) return mal(409, `"${a}" ya lo usa otra persona.`);
          this.q(`UPDATE usuarios SET apodo = ?, apodo_min = ? WHERE id = ?`, a, a.toLowerCase(), yo.id);
          return ok({ yo: this.perfil(this.q1(`SELECT * FROM usuarios WHERE id = ?`, yo.id), true) });
        }
        case 'POST cuenta/editar': {
          if (!yo) return conSesion();
          const c = cuerpo, set = {};
          if (c.apodo !== undefined) {
            const a = limpiarApodo(c.apodo);
            if (a.length < 2) return mal(400, 'El apodo tiene que tener entre 2 y 20 letras o números.');
            const r = this.q1(`SELECT id FROM usuarios WHERE apodo_min = ?`, a.toLowerCase());
            if (r && r.id !== yo.id) return mal(409, `"${a}" ya lo usa otra persona.`);
            set.apodo = a; set.apodo_min = a.toLowerCase();
          }
          if (c.nombre !== undefined) set.nombre = texto(c.nombre, 40);
          if (c.bio !== undefined) set.bio = texto(c.bio, 200);
          if (c.cuadro !== undefined) set.cuadro = texto(c.cuadro, 30);
          if (c.lugar !== undefined) { const l = String(c.lugar || ''); if (l && !LUGARES.includes(l)) return mal(400, 'Elegí de la lista de dónde sos.'); set.lugar = l; }
          // el personaje de la mesa 3D: el código de uno de los que vienen hechos (la lista está en la página)
          if (c.pj !== undefined) { const k = c.pj === null || c.pj === '' ? null : String(c.pj); if (k !== null && !PJ_RE.test(k)) return mal(400, 'Personaje inválido.'); set.pj = k; }
          if (c.color !== undefined) { const k = c.color === null ? null : int(c.color); if (k !== null && (k < 0 || k >= N_COLORES)) return mal(400, 'Color inválido.'); set.color = k; }
          if (c.foto === null) { this.q(`DELETE FROM fotos WHERE usuario = ?`, yo.id); set.foto_v = 0; }
          else if (c.foto !== undefined) {
            const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(c.foto));
            if (!m) return mal(400, 'La foto tiene que ser una imagen JPG, PNG o WebP.');
            let bytes; try { bytes = Uint8Array.from(atob(m[2]), x => x.charCodeAt(0)); } catch (e) { return mal(400, 'La foto no se pudo leer.'); }
            if (bytes.length > FOTO_MAX) return mal(413, 'La foto es muy pesada.');
            const tipo = m[1], es = (a, i = 0) => a.every((b, k) => bytes[i + k] === b);
            const ok = tipo === 'jpeg' ? es([0xff, 0xd8, 0xff]) : tipo === 'png' ? es([0x89, 0x50, 0x4e, 0x47]) : es([0x52, 0x49, 0x46, 0x46]) && es([0x57, 0x45, 0x42, 0x50], 8);
            if (!ok) return mal(400, 'La foto no es una imagen válida.');
            this.q(`INSERT INTO fotos (usuario, tipo, datos) VALUES (?, ?, ?) ON CONFLICT(usuario) DO UPDATE SET tipo = excluded.tipo, datos = excluded.datos`, yo.id, 'image/' + tipo, m[2]);
            set.foto_v = Math.max(this.now(), (yo.foto_v || 0) + 1);
          }
          const cols = Object.keys(set);
          if (cols.length) this.q(`UPDATE usuarios SET ${cols.map(k => k + ' = ?').join(', ')} WHERE id = ?`, ...cols.map(k => set[k]), yo.id);
          return ok({ yo: this.perfil(this.q1(`SELECT * FROM usuarios WHERE id = ?`, yo.id), true) });
        }
        case 'POST admin/limpiar': {
          if (!yo) return conSesion();
          if (!this.admins.has(yo.id)) return mal(403, 'Solo quien administra el juego.');
          const id = int(cuerpo.id);
          if (!this.q1(`SELECT id FROM usuarios WHERE id = ?`, id)) return mal(404, 'No existe esa cuenta.');
          this.q(`DELETE FROM fotos WHERE usuario = ?`, id);
          this.q(`UPDATE usuarios SET foto_v = 0, bio = '', nombre = '', cuadro = '' WHERE id = ?`, id);
          return ok({ ok: true });
        }
        case 'POST cuenta/salir': if (token) this.q(`DELETE FROM sesiones WHERE token = ?`, await hash(token)); return ok({ ok: true });
        case 'POST cuenta/borrar': {
          if (!yo) return conSesion();
          const amigos = this.amigosDe(yo.id);
          this.q(`DELETE FROM sesiones WHERE usuario = ?`, yo.id);
          this.q(`DELETE FROM amigos WHERE de = ? OR para = ?`, yo.id, yo.id);
          this.q(`DELETE FROM jugadas WHERE usuario = ?`, yo.id);
          this.q(`DELETE FROM fotos WHERE usuario = ?`, yo.id);
          this.salirDeGremio(yo);
          this.q(`DELETE FROM usuarios WHERE id = ?`, yo.id);
          amigos.forEach(a => this.avisar(a, { t: 'amigos' }));
          return ok({ ok: true });
        }
        case 'GET cuenta/perfil': {
          const id = int(url.searchParams.get('id')), u = id !== null && this.q1(`SELECT * FROM usuarios WHERE id = ?`, id);
          if (!u) return mal(404, 'No encontré a esa persona.');
          return ok({ perfil: this.perfil(u, yo && yo.id === u.id), historial: this.historial(u.id, 20), relacion: yo && yo.id !== u.id ? this.relacion(yo.id, u.id) : null });
        }
        case 'GET ranking': {
          const mes = url.searchParams.get('tipo') === 'mes', m = mesDe(this.now());
          const filas = mes
            ? this.q(`SELECT id, apodo, foto_v, color, elo_mes AS elo, partidos_mes AS partidos, ganados_mes AS ganados FROM usuarios WHERE mes = ? AND partidos_mes > 0 ORDER BY elo_mes DESC, id LIMIT 100`, m)
            : this.q(`SELECT id, apodo, foto_v, color, elo, partidos, ganados FROM usuarios WHERE partidos > 0 ORDER BY elo DESC, id LIMIT 100`);
          const lista = filas.map((r, i) => ({ pos: i + 1, id: r.id, apodo: r.apodo, ...this.cara(r), puntos: Math.round(r.elo), partidos: r.partidos, ganados: r.ganados }));
          let mio = null;
          if (yo && !lista.some(r => r.id === yo.id)) {
            const elo = mes ? (yo.mes === m ? yo.elo_mes : ELO0) : yo.elo, jug = mes ? (yo.mes === m ? yo.partidos_mes : 0) : yo.partidos;
            if (jug > 0) {
              const pos = mes ? this.q1(`SELECT COUNT(*) AS n FROM usuarios WHERE mes = ? AND partidos_mes > 0 AND (elo_mes > ? OR (elo_mes = ? AND id < ?))`, m, elo, elo, yo.id).n + 1 : this.posicion(yo);
              mio = { pos, id: yo.id, apodo: yo.apodo, ...this.cara(yo), puntos: Math.round(elo), partidos: jug, ganados: mes ? yo.ganados_mes : yo.ganados };
            }
          }
          const sinPartidos = mes ? null : this.q1(`SELECT COUNT(*) AS n FROM usuarios WHERE partidos = 0`).n;
          return ok({ tipo: mes ? 'mes' : 'general', mes: m, lista, mio, sinPartidos });
        }
        // ---------- gremios ----------
        case 'GET gremios': {
          const mes = url.searchParams.get('tipo') === 'mes', m = mesDe(this.now());
          const filas = mes
            ? this.q(`SELECT * FROM gremios WHERE mes = ? AND partidos_mes > 0 ORDER BY ganados_mes DESC, partidos_mes, id LIMIT 100`, m)
            : this.q(`SELECT * FROM gremios ORDER BY ganados DESC, partidos, id LIMIT 100`);
          const lista = filas.map((g, i) => ({ pos: i + 1, ...this.gremioFicha(g, m) }));
          return ok({ tipo: mes ? 'mes' : 'general', mes: m, lista, mio: yo && yo.gremio ? this.gremioCorto(yo.gremio) : null });
        }
        case 'GET gremio': {
          const g = this.q1(`SELECT * FROM gremios WHERE id = ?`, int(url.searchParams.get('id')));
          if (!g) return mal(404, 'Ese gremio ya no existe.');
          const mes = mesDe(this.now()), en = this.enLinea();
          const miembros = this.q(`SELECT id, apodo, foto_v, color, elo, partidos, ganados, gremio_desde FROM usuarios WHERE gremio = ? ORDER BY elo DESC, id`, g.id)
            .map(r => ({ id: r.id, apodo: r.apodo, ...this.cara(r), puntos: Math.round(r.elo), partidos: r.partidos, ganados: r.ganados, desde: r.gremio_desde, enLinea: en.has(r.id) }));
          const pos = this.q1(`SELECT COUNT(*) AS n FROM gremios WHERE ganados > ? OR (ganados = ? AND (partidos < ? OR (partidos = ? AND id < ?)))`, g.ganados, g.ganados, g.partidos, g.partidos, g.id).n + 1;
          return ok({ gremio: { ...this.gremioFicha(g, mes), posicion: pos }, miembros, mio: !!yo && yo.gremio === g.id, enOtro: !!yo && !!yo.gremio && yo.gremio !== g.id, max: MAX_GREMIO });
        }
        case 'POST gremio/crear': {
          if (!yo) return conSesion();
          if (yo.gremio) return mal(409, 'Ya estás en un gremio: primero salí de ese.');
          const nombre = limpiarGremio(cuerpo.nombre), sigla = limpiarSigla(cuerpo.sigla);
          if (nombre.length < 3) return mal(400, 'El nombre tiene que tener entre 3 y 24 letras o números.');
          if (sigla.length < 2) return mal(400, 'La sigla tiene que tener entre 2 y 4 letras o números.');
          if (this.q1(`SELECT id FROM gremios WHERE nombre_min = ?`, nombre.toLowerCase())) return mal(409, `Ya hay un gremio que se llama "${nombre}".`);
          const ahora = this.now();
          this.q(`INSERT INTO gremios (nombre, nombre_min, sigla, lema, creado, dueno, mes) VALUES (?, ?, ?, ?, ?, ?, ?)`, nombre, nombre.toLowerCase(), sigla, texto(cuerpo.lema, 80), ahora, yo.id, mesDe(ahora));
          const g = this.q1(`SELECT id FROM gremios WHERE nombre_min = ?`, nombre.toLowerCase());
          this.q(`UPDATE usuarios SET gremio = ?, gremio_desde = ? WHERE id = ?`, g.id, ahora, yo.id);
          return ok({ id: g.id });
        }
        case 'POST gremio/unirme': {
          if (!yo) return conSesion();
          const g = this.q1(`SELECT id FROM gremios WHERE id = ?`, int(cuerpo.id));
          if (!g) return mal(404, 'Ese gremio ya no existe.');
          if (yo.gremio === g.id) return ok({ id: g.id });
          if (yo.gremio) return mal(409, 'Ya estás en un gremio: primero salí de ese.');
          if (this.q1(`SELECT COUNT(*) AS n FROM usuarios WHERE gremio = ?`, g.id).n >= MAX_GREMIO) return mal(409, `Ese gremio está completo (${MAX_GREMIO}).`);
          this.q(`UPDATE usuarios SET gremio = ?, gremio_desde = ? WHERE id = ?`, g.id, this.now(), yo.id);
          return ok({ id: g.id });
        }
        case 'POST gremio/salir': if (!yo) return conSesion(); this.salirDeGremio(yo); return ok({ ok: true });
        case 'POST gremio/echar': {
          if (!yo) return conSesion();
          const g = yo.gremio && this.q1(`SELECT dueno FROM gremios WHERE id = ?`, yo.gremio);
          if (!g || g.dueno !== yo.id) return mal(403, 'Solo quien está a cargo del gremio puede sacar a alguien.');
          const u = this.q1(`SELECT * FROM usuarios WHERE id = ?`, int(cuerpo.id));
          if (!u || u.gremio !== yo.gremio || u.id === yo.id) return mal(400, 'Esa persona no está en tu gremio.');
          this.salirDeGremio(u);
          return ok({ ok: true });
        }
        case 'POST gremio/editar': {
          if (!yo) return conSesion();
          const g = yo.gremio && this.q1(`SELECT dueno FROM gremios WHERE id = ?`, yo.gremio);
          if (!g || g.dueno !== yo.id) return mal(403, 'Solo quien está a cargo del gremio puede cambiarlo.');
          this.q(`UPDATE gremios SET lema = ? WHERE id = ?`, texto(cuerpo.lema, 80), yo.gremio);
          return ok({ ok: true });
        }
        case 'GET admin/cuentas': {
          if (!yo) return conSesion();
          if (!this.admins.has(yo.id)) return mal(403, 'Esta lista la ve solo quien administra el juego.');
          const ahora = this.now(), hoy0 = Date.parse(new Date(ahora - 3 * 3600e3).toISOString().slice(0, 10) + 'T03:00:00Z');
          const cuenta = desde => this.q1(`SELECT COUNT(*) AS n FROM usuarios WHERE creado >= ?`, desde).n;
          const lista = this.q(`SELECT id, apodo, creado, visto, partidos, ganados, elo, foto_v, color, bio, nombre FROM usuarios ORDER BY creado DESC LIMIT 500`)
            .map(r => ({ id: r.id, apodo: r.apodo, ...this.cara(r), creado: r.creado, visto: r.visto, partidos: r.partidos, ganados: r.ganados, puntos: Math.round(r.elo), textos: !!(r.bio || r.nombre) }));
          const en = this.enLinea();
          lista.forEach(r => { r.enLinea = en.has(r.id); });
          return ok({ total: this.q1(`SELECT COUNT(*) AS n FROM usuarios`).n, hoy: cuenta(hoy0), semana: cuenta(ahora - 7 * 864e5),
            conPartidos: this.q1(`SELECT COUNT(*) AS n FROM usuarios WHERE partidos > 0`).n, enLinea: en.size, lista });
        }
        case 'GET publicas': return ok({ lista: this.publicas(), conectados: this.enLinea().size });
        case 'GET amigos': {
          if (!yo) return conSesion();
          const en = this.enLinea();
          const fila = r => ({ id: r.id, apodo: r.apodo, ...this.cara(r), puntos: Math.round(r.elo), enLinea: en.has(r.id) });
          const amigos = this.q(`SELECT u.id, u.apodo, u.elo, u.foto_v, u.color FROM usuarios u WHERE u.id IN (SELECT para FROM amigos WHERE de = ? AND estado = 'si' UNION SELECT de FROM amigos WHERE para = ? AND estado = 'si') ORDER BY u.apodo_min`, yo.id, yo.id).map(fila);
          const recibidas = this.q(`SELECT u.id, u.apodo, u.elo, u.foto_v, u.color FROM amigos a JOIN usuarios u ON u.id = a.de WHERE a.para = ? AND a.estado = 'pendiente' ORDER BY a.desde DESC`, yo.id).map(fila);
          const enviadas = this.q(`SELECT u.id, u.apodo, u.elo, u.foto_v, u.color FROM amigos a JOIN usuarios u ON u.id = a.para WHERE a.de = ? AND a.estado = 'pendiente' ORDER BY a.desde DESC`, yo.id).map(fila);
          amigos.sort((a, b) => (b.enLinea - a.enLinea) || 0);
          return ok({ amigos, recibidas, enviadas });
        }
        case 'GET amigos/buscar': {
          if (!yo) return conSesion();
          const t = limpiarApodo(url.searchParams.get('q')).toLowerCase();
          if (t.length < 2) return ok({ lista: [] });
          const like = t.replace(/[%_\\]/g, c => '\\' + c);
          const lista = this.q(`SELECT id, apodo, elo, foto_v, color FROM usuarios WHERE id != ? AND (apodo_min LIKE ? ESCAPE '\\' OR apodo_min LIKE ? ESCAPE '\\') ORDER BY (apodo_min = ?) DESC, (apodo_min LIKE ? ESCAPE '\\') DESC, apodo_min LIMIT 12`,
            yo.id, like + '%', '% ' + like + '%', t, like + '%')
            .map(r => ({ id: r.id, apodo: r.apodo, ...this.cara(r), puntos: Math.round(r.elo), relacion: this.relacion(yo.id, r.id) }));
          return ok({ lista });
        }
        case 'POST amigos/pedir': {
          if (!yo) return conSesion();
          const id = int(cuerpo.id), otro = id !== null && id !== yo.id && this.q1(`SELECT id FROM usuarios WHERE id = ?`, id);
          if (!otro) return mal(404, 'No encontré a esa persona.');
          const rel = this.relacion(yo.id, id);
          if (rel === 'recibida') { this.q(`UPDATE amigos SET estado = 'si', desde = ? WHERE de = ? AND para = ?`, this.now(), id, yo.id); this.avisar(id, { t: 'amigos' }); return ok({ relacion: 'amigos' }); }
          if (rel !== 'no') return ok({ relacion: rel });
          if (this.amigosDe(yo.id).length >= MAX_AMIGOS) return mal(400, `Ya tenés ${MAX_AMIGOS} amigos.`);
          const pend = this.q1(`SELECT COUNT(*) AS n FROM amigos WHERE de = ? AND estado = 'pendiente'`, yo.id).n;
          if (pend >= 50) return mal(400, 'Tenés muchas solicitudes sin contestar. Esperá a que te acepten.');
          this.q(`INSERT INTO amigos (de, para, estado, desde) VALUES (?, ?, 'pendiente', ?)`, yo.id, id, this.now());
          this.avisar(id, { t: 'amigos', solicitud: yo.apodo });
          return ok({ relacion: 'enviada' });
        }
        case 'POST amigos/aceptar': {
          if (!yo) return conSesion();
          const id = int(cuerpo.id);
          if (this.relacion(yo.id, id) !== 'recibida') return mal(404, 'Esa solicitud ya no está.');
          this.q(`UPDATE amigos SET estado = 'si', desde = ? WHERE de = ? AND para = ?`, this.now(), id, yo.id);
          this.avisar(id, { t: 'amigos' });
          return ok({ relacion: 'amigos' });
        }
        case 'POST amigos/borrar': {
          if (!yo) return conSesion();
          const id = int(cuerpo.id);
          this.q(`DELETE FROM amigos WHERE (de = ? AND para = ?) OR (de = ? AND para = ?)`, yo.id, id, id, yo.id);
          this.avisar(id, { t: 'amigos' });
          return ok({ relacion: 'no' });
        }
        case 'POST amigos/invitar': {
          if (!yo) return conSesion();
          const id = int(cuerpo.id), codigo = String(cuerpo.codigo || '');
          if (!/^[A-Z]{4}$/.test(codigo)) return mal(400, 'Código de mesa inválido.');
          if (this.relacion(yo.id, id) !== 'amigos') return mal(403, 'Solo podés invitar a tus amigos.');
          if (!this.enLinea().has(id)) return ok({ enviada: false, enLinea: false });
          const k = yo.id + '>' + id, antes = this.invitado.get(k) || 0;
          if (this.now() - antes < 8000) return ok({ enviada: true, enLinea: true });
          this.invitado.set(k, this.now());
          if (this.invitado.size > 5000) this.invitado.clear();
          this.avisar(id, { t: 'invita', de: { id: yo.id, apodo: yo.apodo }, codigo });
          return ok({ enviada: true, enLinea: true });
        }
      }
      return mal(404, 'No existe.');
    } catch (e) {
      return mal(500, 'Algo falló en el servidor de cuentas.');
    }
  }

  // ---------- salón de mesas públicas: las que esperan gente ----------
  // lo manda cada mesa pública cuando cambia (y cada minuto mientras espera); sin gente o empezada, se va
  salon(info) {
    if (!info || !/^[A-Z]{4}$/.test(String(info.codigo || ''))) return false;
    const n = [2, 4, 6].includes(info.n) ? info.n : null, personas = int(info.personas) || 0;
    const antes = this.q1(`SELECT personas, nombres, cfg, empezada, tanto, mirando FROM publicas WHERE codigo = ?`, info.codigo);
    const empezada = info.empezada ? 1 : 0;
    if (!n || personas <= 0 || (!empezada && personas >= n) || info.fin) {
      this.q(`DELETE FROM publicas WHERE codigo = ?`, info.codigo);
      if (antes) this.avisarTodos({ t: 'publicas' });
      return true;
    }
    const nombres = JSON.stringify((Array.isArray(info.nombres) ? info.nombres : []).slice(0, 6).map(x => String(x).slice(0, 20)));
    // las reglas de la mesa, para mostrarlas en la lista (solo lo que se puede elegir)
    const c = info.cfg && typeof info.cfg === 'object' ? info.cfg : {};
    const cfg = JSON.stringify({ target: [10, 20, 30, 40].includes(c.target) ? c.target : 30, chicos: c.chicos === 2 ? 2 : 1, achique: c.achique === true, chat: c.chat !== false, voz: c.voz !== false, escenario: c.escenario === 'clasico' ? 'clasico' : 'bar' });
    const tanto = empezada && Array.isArray(info.tanto) ? JSON.stringify(info.tanto.slice(0, 2).map(x => int(x) || 0)) : null;
    const mirando = Math.min(99, int(info.mirando) || 0);
    if (antes) this.q(`UPDATE publicas SET n = ?, personas = ?, nombres = ?, cfg = ?, empezada = ?, tanto = ?, mirando = ?, actualizada = ? WHERE codigo = ?`, n, personas, nombres, cfg, empezada, tanto, mirando, this.now(), info.codigo);
    else this.q(`INSERT INTO publicas (codigo, n, personas, nombres, cfg, empezada, tanto, mirando, creada, actualizada) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, info.codigo, n, personas, nombres, cfg, empezada, tanto, mirando, this.now(), this.now());
    if (!antes || antes.personas !== personas || antes.nombres !== nombres || antes.cfg !== cfg || antes.empezada !== empezada || antes.tanto !== tanto || antes.mirando !== mirando) this.avisarTodos({ t: 'publicas' });
    return true;
  }
  publicas() {
    this.q(`DELETE FROM publicas WHERE actualizada < ?`, this.now() - 3 * 60e3);   // una mesa que no avisa hace tres minutos ya no está
    return this.q(`SELECT codigo, n, personas, nombres, cfg, empezada, tanto, mirando, creada FROM publicas ORDER BY empezada ASC, personas DESC, creada ASC LIMIT 50`)
      .map(r => ({ codigo: r.codigo, n: r.n, personas: r.personas, nombres: JSON.parse(r.nombres || '[]'), cfg: r.cfg ? JSON.parse(r.cfg) : null,
        empezada: !!r.empezada, tanto: r.tanto ? JSON.parse(r.tanto) : null, mirando: r.mirando || 0, creada: r.creada }));
  }

  // ---------- presencia: avisa a los amigos cuando alguien se conecta o se va ----------
  presencia(uid, en) { for (const a of this.amigosDe(uid)) this.avisar(a, { t: 'presencia', id: uid, enLinea: !!en }); }

  // ---------- desde las mesas ----------
  async quien(token) { const u = await this.sesionDe(token); return u ? { id: u.id, apodo: u.apodo, racha: u.racha || 0 } : null; }

  // Anota un partido terminado. r = { id, fecha, n, ganador, tanteador, equipos: [[{nombre, cuenta, compu}], [...]],
  //   cuentas: [{ uid, equipo, abandono, stats: { manos, manosGanadas, envidos, flores, trucos } }] }
  // Cuenta para el ranking solo si hay alguien con cuenta en cada equipo.
  // todo el partido se aplica junto (partido, jugadas, ELO, estadísticas, gremios) o nada: si algo falla en el medio,
  // no queda a medias y la mesa lo vuelve a mandar
  registrar(r) { return this.transaccion(() => this.registrar0(r)); }
  registrar0(r) {
    if (!r || typeof r.id !== 'string' || ![0, 1].includes(r.ganador) || !Array.isArray(r.cuentas)) return { anotado: false, por: 'datos' };
    if (this.q1(`SELECT id FROM partidos WHERE id = ?`, r.id)) return { anotado: false, por: 'repetido' };
    const vistos = new Set(), jug = [];
    for (const c of r.cuentas) {
      const uid = int(c.uid);
      if (uid === null || vistos.has(uid) || ![0, 1].includes(c.equipo)) continue;
      const u = this.q1(`SELECT * FROM usuarios WHERE id = ?`, uid);
      if (!u) continue;
      vistos.add(uid); jug.push({ u, equipo: c.equipo, abandono: !!c.abandono, st: c.stats || {} });
    }
    if (![0, 1].every(t => jug.some(j => j.equipo === t))) return { anotado: false, por: 'faltan cuentas en un equipo' };
    const fecha = this.now(), mes = mesDe(fecha);
    const eloMes = u => u.mes === mes ? u.elo_mes : ELO0;
    const prom = (t, f) => { const l = jug.filter(j => j.equipo === t); return l.reduce((s, j) => s + f(j.u), 0) / l.length; };
    const gen = [prom(0, u => u.elo), prom(1, u => u.elo)], men = [prom(0, eloMes), prom(1, eloMes)];
    const n0 = x => Math.max(0, Math.min(1000, int(x) || 0));
    this.q(`INSERT INTO partidos (id, fecha, n, ganador, tanteador, equipos) VALUES (?, ?, ?, ?, ?, ?)`,
      r.id, fecha, [2, 4, 6].includes(r.n) ? r.n : 2, r.ganador, String(r.tanteador || '').slice(0, 40), JSON.stringify(r.equipos || [[], []]).slice(0, 4000));
    const res = [];
    for (const j of jug) {
      const t = j.equipo, gano = t === r.ganador && !j.abandono ? 1 : 0, u = j.u;
      const d = K * (gano - esperado(gen[t], gen[1 - t])), dm = K * (gano - esperado(men[t], men[1 - t]));
      const racha = gano ? u.racha + 1 : 0, st = j.st;
      this.q(`UPDATE usuarios SET elo = ?, partidos = partidos + 1, ganados = ganados + ?, abandonos = abandonos + ?, racha = ?, mejor_racha = ?,
          manos = manos + ?, manos_ganadas = manos_ganadas + ?, envidos = envidos + ?, flores = flores + ?, trucos = trucos + ?, faltas = faltas + ?, falta37 = falta37 + ?,
          mes = ?, elo_mes = ?, partidos_mes = ?, ganados_mes = ? WHERE id = ?`,
        u.elo + d, gano, j.abandono ? 1 : 0, racha, Math.max(u.mejor_racha, racha),
        n0(st.manos), n0(st.manosGanadas), n0(st.envidos), n0(st.flores), n0(st.trucos), n0(st.faltas), n0(st.falta37),
        mes, eloMes(u) + dm, (u.mes === mes ? u.partidos_mes : 0) + 1, (u.mes === mes ? u.ganados_mes : 0) + gano, u.id);
      this.q(`INSERT INTO jugadas (partido, usuario, equipo, gano, abandono, delta, elo, fecha) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, r.id, u.id, t, gano, j.abandono ? 1 : 0, d, u.elo + d, fecha);
      if (u.gremio) this.q(`UPDATE gremios SET partidos = partidos + 1, ganados = ganados + ?,
          partidos_mes = CASE WHEN mes = ? THEN partidos_mes + 1 ELSE 1 END, ganados_mes = CASE WHEN mes = ? THEN ganados_mes + ? ELSE ? END, mes = ? WHERE id = ?`,
        gano, mes, mes, gano, gano, mes, u.gremio);
      // lo que cuentan los logros, antes y después (la pantalla avisa si se consiguió uno nuevo)
      const lg = x => ({ partidos: x.partidos, ganados: x.ganados, mejorRacha: x.mejor_racha, flores: x.flores, trucos: x.trucos, envidos: x.envidos, faltas: x.faltas || 0, falta37: x.falta37 || 0 });
      res.push({ uid: u.id, gano: !!gano, delta: Math.round(d), puntos: Math.round(u.elo + d), racha, antes: lg(u), despues: lg(this.q1(`SELECT * FROM usuarios WHERE id = ?`, u.id)) });
    }
    return { anotado: true, jugadores: res };
  }
}
