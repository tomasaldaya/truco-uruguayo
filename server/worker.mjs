// Servidor del Truco Uruguayo en Cloudflare: sirve la página (index.html), las mesas compartidas y las cuentas.
// Cada mesa es un Durable Object (una instancia por código, siempre la misma para todos los que entran
// con ese código) y cada jugador se conecta por WebSocket a /api/mesa/<CÓDIGO>.
// Las cuentas (ranking, estadísticas, historial, amigos, gremios) viven en otro Durable Object, uno solo para todos.
import { DurableObject } from 'cloudflare:workers';
import { Mesa } from './mesa.mjs';
import { Cuentas } from './cuentas.mjs';
import { verificarGoogle } from './google.mjs';

// la página puede estar en GitHub Pages: las cuentas se piden desde otro origen (con el token en un
// encabezado, sin cookies, así que se puede abrir a cualquier origen)
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400' };
const cuentas = env => env.CUENTAS.get(env.CUENTAS.idFromName('cuentas'));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = /^\/api\/mesa\/([A-Z]{4})$/.exec(url.pathname);
    if (m) {
      if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('Acá se entra por WebSocket.', { status: 426 });
      return env.MESAS.get(env.MESAS.idFromName(m[1])).fetch(req);
    }
    if (/^\/api\/(cuenta|ranking|amigos|admin|publicas|foto|gremios?)(\/|$)/.test(url.pathname)) {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      const r = await cuentas(env).fetch(req);
      if (r.status === 101) return r;
      const h = new Headers(r.headers); for (const k in CORS) h.set(k, CORS[k]); if (!h.has('cache-control')) h.set('cache-control', 'no-store');
      return new Response(r.body, { status: r.status, headers: h });
    }
    // TURN para la voz (Cloudflare Realtime): con los secretos TURN_KEY_ID y TURN_KEY_TOKEN, credenciales por un día; sin
    // ellos, una lista vacía (la voz sigue directa entre navegadores)
    if (url.pathname === '/api/turn') {
      const h = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
      if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return Response.json({ iceServers: [] }, { headers: h });
      try {
        const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
          method: 'POST', headers: { authorization: 'Bearer ' + env.TURN_KEY_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: 86400 }) });
        const j = await r.json();
        const lista = [].concat(j.iceServers || []).filter(x => x && x.urls);
        return Response.json({ iceServers: lista }, { headers: h });
      } catch (e) { return Response.json({ iceServers: [] }, { headers: h }); }
    }
    if (url.pathname === '/api/salud') return new Response('ok', { headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('No encontrado', { status: 404 });
  },
};

// ---------- cuentas ----------
// Los que tienen el juego abierto con su cuenta quedan conectados por WebSocket (para saber quién está
// en línea y recibir invitaciones). Son sockets "hibernables": mientras nadie manda nada, el objeto
// duerme y no se cobra. El "ping" de cada página lo contesta Cloudflare solo, sin despertarlo.
export class CuentasDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.c = new Cuentas({
      sql: (q, ...a) => ctx.storage.sql.exec(q, ...a).toArray(),
      google: verificarGoogle, googleId: env.GOOGLE_CLIENT_ID || '', prueba: env.DEV_LOGIN === '1',
      admins: String(env.ADMINS || '').split(/[\s,]+/).filter(Boolean),
      avisar: (uid, msg) => this.avisar(uid, msg), enLinea: () => this.enLinea(),
      transaccion: f => ctx.storage.transactionSync(f),
      avisarTodos: msg => this.avisarTodos(msg),
    });
    this.c.init();
    // pedido del dueño del juego (18/11/2026): que su cuenta (la 2) pase a ser la 1 y la 1 pase a ser la 2
    this.c.unaVez('intercambiar-1-2', () => this.c.intercambiar(1, 2));
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch (e) {}
  }
  async fetch(req) {
    if ((req.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
      const pair = new WebSocketPair(), [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ uid: null });
      return new Response(null, { status: 101, webSocket: client });
    }
    // Ensayo de restauración (solo en el entorno de pruebas, con PERMITIR_RESTAURAR=1, y solo quien administra): vuelve
    // la base de cuentas a como estaba hace N minutos, con la recuperación a un momento dado de SQLite en Cloudflare
    // (hasta 30 días). POST /api/admin/restaurar { minutos }. El objeto se reinicia y arranca con esa copia.
    if (new URL(req.url).pathname === '/api/admin/restaurar' && req.method === 'POST') {
      if (this.env.PERMITIR_RESTAURAR !== '1') return Response.json({ error: 'Solo en el entorno de pruebas.' }, { status: 403 });
      const u = await this.c.sesionDe((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
      if (!u || !this.c.admins.has(u.id)) return Response.json({ error: 'Solo quien administra el juego.' }, { status: 403 });
      let min = 0; try { min = Number((await req.json()).minutos); } catch (e) {}
      if (!(min > 0 && min <= 30 * 24 * 60)) return Response.json({ error: 'minutos: entre 1 y 43200' }, { status: 400 });
      const marca = await this.ctx.storage.getBookmarkForTime(Date.now() - min * 60e3);
      await this.ctx.storage.onNextSessionRestoreBookmark(marca);
      setTimeout(() => this.ctx.abort('restaurar'), 50);
      return Response.json({ ok: true, marca });
    }
    const r = await this.c.http(req);
    // las fotos llevan su versión en la dirección: el navegador las guarda para siempre
    if (r.raw) return new Response(r.raw, { status: r.s, headers: { 'content-type': r.tipo, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
    return Response.json(r.j, { status: r.s });
  }
  async webSocketMessage(ws, data) {
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || m.t !== 'hola') return;
    const u = await this.c.sesionDe(m.token);
    if (!u) { try { ws.send(JSON.stringify({ t: 'nosesion' })); ws.close(4001, 'sin sesión'); } catch (e) {} return; }
    const ya = this.enLinea(ws).has(u.id);
    ws.serializeAttachment({ uid: u.id });
    try { ws.send(JSON.stringify({ t: 'listo', id: u.id })); } catch (e) {}
    if (!ya) this.c.presencia(u.id, true);
  }
  async webSocketClose(ws, code) { this.chau(ws); try { ws.close(code === 1005 ? 1000 : code, 'chau'); } catch (e) {} }
  async webSocketError(ws) { this.chau(ws); }
  chau(ws) {
    let a = null; try { a = ws.deserializeAttachment(); ws.serializeAttachment({ uid: null }); } catch (e) {}
    if (a && a.uid && !this.enLinea(ws).has(a.uid)) this.c.presencia(a.uid, false);
  }
  enLinea(menos) {
    const s = new Set();
    for (const w of this.ctx.getWebSockets()) {
      if (w === menos) continue;
      try { const a = w.deserializeAttachment(); if (a && a.uid) s.add(a.uid); } catch (e) {}
    }
    return s;
  }
  avisar(uid, msg) {
    const txt = JSON.stringify(msg);
    for (const w of this.ctx.getWebSockets()) {
      try { const a = w.deserializeAttachment(); if (a && a.uid === uid) w.send(txt); } catch (e) {}
    }
  }
  avisarTodos(msg) {
    const txt = JSON.stringify(msg);
    for (const w of this.ctx.getWebSockets()) { try { const a = w.deserializeAttachment(); if (a && a.uid) w.send(txt); } catch (e) {} }
  }
  // lo que piden las mesas (por RPC)
  async quien(token) { return this.c.quien(token); }
  async registrar(r) { return this.c.registrar(r); }
  async salon(info) { return this.c.salon(info); }
}

// ---------- mesas ----------

export class MesaDO {
  // Mesas con WebSockets "hibernables" (como las cuentas): mientras nadie manda nada y no hay nada programado (un turno
  // con reloj, la computadora pensando), el objeto duerme y no se cobra. El "ping" de cada navegador (cada 4 s) lo
  // contesta Cloudflare solo, sin despertarlo; al despertar, la mesa vuelve de lo guardado y de lo que se recordó en
  // cada conexión (serializeAttachment). La alarma hace lo que no puede esperar a un mensaje: reintentar un resultado,
  // avisar al salón que la pública sigue esperando gente, o borrar la mesa vacía a las dos horas.
  constructor(ctx, env) {
    this.ctx = ctx;
    const ws = cid => ctx.getWebSockets(cid)[0] || null;
    const io = {
      send: (cid, msg) => { const w = ws(cid); if (w) try { w.send(JSON.stringify(msg)); } catch (e) {} },
      close: cid => { const w = ws(cid); if (w) try { w.close(1000, 'chau'); } catch (e) {} },
      now: () => Date.now(),
      setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: h => { if (h) clearTimeout(h); },
      setInterval: (f, ms) => setInterval(f, ms), clearInterval: h => { if (h) clearInterval(h); },
      save: data => { this.ctx.storage.put('mesa', data).catch(() => {}); },
      end: () => { this.ctx.storage.deleteAll().catch(() => {}); this.ctx.storage.deleteAlarm().catch(() => {}); },
      idle: () => this.programar(),
      despertar: ms => { this.ctx.storage.setAlarm(Date.now() + ms).catch(() => {}); },
      // cuándo mandó el último "ping" (lo contestó Cloudflare sin despertar la mesa): para saber quién se fue
      vivo: cid => { const w = ws(cid); if (!w) return null; const t = ctx.getWebSocketAutoResponseTimestamp(w); return t ? t.getTime() : null; },
      log: o => console.log(JSON.stringify({ mesa: 1, ...o })),   // registros de Cloudflare (solo totales y estados)
      cuenta: env.CUENTAS ? token => cuentas(env).quien(token) : null,
      registrar: env.CUENTAS ? r => cuentas(env).registrar(r) : null,
      salon: env.CUENTAS ? info => cuentas(env).salon(info) : null,
    };
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch (e) {}
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('mesa');
      const vivos = ctx.getWebSockets().map(w => { try { return w.deserializeAttachment(); } catch (e) { return null; } }).filter(Boolean);
      this.mesa = new Mesa(io, saved || null, vivos);
      if (vivos.length) io.log({ ev: 'despierta', conexiones: vivos.length });
    });
  }
  // la alarma: la próxima vez que la mesa tiene que despertar sola (o ninguna)
  programar() {
    const ms = this.mesa && this.mesa.proximaAlarma();
    if (ms == null) this.ctx.storage.deleteAlarm().catch(() => {});
    else this.ctx.storage.setAlarm(Date.now() + ms).catch(() => {});
  }
  recordar(w, cid) { try { const r = this.mesa.recuerdo(cid); if (r) w.serializeAttachment(r); } catch (e) {} }
  async fetch(req) {
    const code = /\/api\/mesa\/([A-Z]{4})$/.exec(new URL(req.url).pathname)[1];
    if (!this.mesa.code) this.mesa.code = code;
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    const cid = 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    this.ctx.acceptWebSocket(server, [cid]);
    server.serializeAttachment({ cid, code });
    this.mesa.onOpen(cid);
    this.programar();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(w, data) {
    if (typeof data !== 'string' || data.length > 20000) return;
    const at = w.deserializeAttachment() || {}, cid = at.cid;
    if (!cid) return;
    let m; try { m = JSON.parse(data); } catch (x) { return; }
    if (m && m.t === 'hello') { const code = at.code || this.mesa.code; m.code = code; }
    try { this.mesa.onMessage(cid, m); } catch (x) { console.error('mesa', x && x.stack); }
    this.recordar(w, cid);
    if (m && (m.t === 'hello' || m.t === 'start' || m.t === 'empezar' || m.t === 'close')) this.programar();
  }
  async webSocketClose(w) { this.cerrada(w); }
  async webSocketError(w) { this.cerrada(w); }
  cerrada(w) {
    const at = (() => { try { return w.deserializeAttachment(); } catch (e) { return null; } })();
    if (!at || !at.cid) return;
    try { this.mesa.onClose(at.cid); } catch (x) { console.error(x); }
    this.programar();
  }
  async alarm() {
    const M = this.mesa;
    if (M.pendiente) M.enviarResultado();                                        // un resultado sin confirmar
    if (M.publica && M.key && !M.started && M.conns.size) M.avisarSalon();         // la pública sigue esperando gente
    if (!M.conns.size && !M.pendiente && !this.ctx.getWebSockets().length) {      // vacía hace dos horas: se borra
      await this.ctx.storage.deleteAll();
      this.mesa = new Mesa(M.io, null);
      return;
    }
    this.programar();
  }
}
