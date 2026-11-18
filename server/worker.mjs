// Servidor del Truco Uruguayo en Cloudflare: sirve la página (index.html), las mesas compartidas y las cuentas.
// Cada mesa es un Durable Object (una instancia por código, siempre la misma para todos los que entran
// con ese código) y cada jugador se conecta por WebSocket a /api/mesa/<CÓDIGO>.
// Las cuentas (ranking, estadísticas, historial, amigos) viven en otro Durable Object, uno solo para todos.
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
    if (/^\/api\/(cuenta|ranking|amigos|admin)(\/|$)/.test(url.pathname)) {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      const r = await cuentas(env).fetch(req);
      if (r.status === 101) return r;
      const h = new Headers(r.headers); for (const k in CORS) h.set(k, CORS[k]); h.set('cache-control', 'no-store');
      return new Response(r.body, { status: r.status, headers: h });
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
    this.c = new Cuentas({
      sql: (q, ...a) => ctx.storage.sql.exec(q, ...a).toArray(),
      google: verificarGoogle, googleId: env.GOOGLE_CLIENT_ID || '', prueba: env.DEV_LOGIN === '1',
      admins: String(env.ADMINS || '').split(/[\s,]+/).filter(Boolean),
      avisar: (uid, msg) => this.avisar(uid, msg), enLinea: () => this.enLinea(),
    });
    this.c.init();
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch (e) {}
  }
  async fetch(req) {
    if ((req.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
      const pair = new WebSocketPair(), [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ uid: null });
      return new Response(null, { status: 101, webSocket: client });
    }
    const r = await this.c.http(req);
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
  // lo que piden las mesas (por RPC)
  async quien(token) { return this.c.quien(token); }
  async registrar(r) { return this.c.registrar(r); }
}

// ---------- mesas ----------
const IDLE_MS = 2 * 3600e3;   // una mesa sin nadie conectado se borra a las dos horas

export class MesaDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.socks = new Map();
    const io = {
      send: (cid, msg) => { const ws = this.socks.get(cid); if (ws) try { ws.send(JSON.stringify(msg)); } catch (e) {} },
      close: cid => { const ws = this.socks.get(cid); this.socks.delete(cid); if (ws) try { ws.close(1000, 'chau'); } catch (e) {} },
      now: () => Date.now(),
      setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: h => { if (h) clearTimeout(h); },
      setInterval: (f, ms) => setInterval(f, ms), clearInterval: h => { if (h) clearInterval(h); },
      save: data => { this.ctx.storage.put('mesa', data).catch(() => {}); },
      end: () => { this.ctx.storage.deleteAll().catch(() => {}); this.ctx.storage.deleteAlarm().catch(() => {}); },
      idle: () => { this.ctx.storage.setAlarm(Date.now() + IDLE_MS).catch(() => {}); },
      cuenta: env.CUENTAS ? token => cuentas(env).quien(token) : null,
      registrar: env.CUENTAS ? r => cuentas(env).registrar(r) : null,
    };
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('mesa');
      this.mesa = new Mesa(io, saved || null);
    });
  }
  async fetch(req) {
    const code = /\/api\/mesa\/([A-Z]{4})$/.exec(new URL(req.url).pathname)[1];
    if (!this.mesa.code) this.mesa.code = code;
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    server.accept();
    const cid = 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    this.socks.set(cid, server);
    this.ctx.storage.deleteAlarm().catch(() => {});
    server.addEventListener('message', e => {
      if (typeof e.data !== 'string' || e.data.length > 20000) return;
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m && m.t === 'hello') m.code = code;
      try { this.mesa.onMessage(cid, m); } catch (x) { console.error('mesa', code, x && x.stack); }
    });
    const gone = () => { this.socks.delete(cid); try { this.mesa.onClose(cid); } catch (x) { console.error(x); } };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    this.mesa.onOpen(cid);
    return new Response(null, { status: 101, webSocket: client });
  }
  async alarm() {
    if (this.socks.size) return;
    await this.ctx.storage.deleteAll();
    this.mesa = new Mesa(this.mesa.io, null);
  }
}
