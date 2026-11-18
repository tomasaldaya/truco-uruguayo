// Servidor del Truco Uruguayo en Cloudflare: sirve la página (index.html) y las mesas compartidas.
// Cada mesa es un Durable Object (una instancia por código, siempre la misma para todos los que entran
// con ese código) y cada jugador se conecta por WebSocket a /api/mesa/<CÓDIGO>.
import { Mesa } from './mesa.mjs';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = /^\/api\/mesa\/([A-Z]{4})$/.exec(url.pathname);
    if (m) {
      if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('Acá se entra por WebSocket.', { status: 426 });
      return env.MESAS.get(env.MESAS.idFromName(m[1])).fetch(req);
    }
    if (url.pathname === '/api/salud') return new Response('ok', { headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('No encontrado', { status: 404 });
  },
};

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
