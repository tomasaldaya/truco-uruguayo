// Prueba del servidor ya publicado: dos jugadores de verdad (por WebSocket) arman una mesa,
// charlan, empiezan el partido, juegan unas jugadas y la cierran.
// Uso: node server/prueba-vivo.mjs https://truco-uruguayo.<subdominio>.workers.dev
import assert from 'assert';

const BASE = (process.argv[2] || process.env.SERVIDOR || '').replace(/\/$/, '');
if (!BASE) { console.error('Falta la dirección del servidor'); process.exit(2); }
const WS = BASE.replace(/^http/, 'ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
const key = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

// un jugador: guarda todo lo que llega y contesta los pings
function jugador(nombre, extra) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/api/mesa/${code}`);
    const inbox = [], who = { ws, inbox, nombre, cid: null };
    const timer = setTimeout(() => reject(new Error(nombre + ': no conectó')), 15000);
    ws.addEventListener('error', e => reject(new Error(nombre + ': error de WebSocket ' + (e.message || ''))));
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      inbox.push(m);
      if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', s: m.s, seated: true }));
      if (m.t === 'hola') {
        who.cid = m.cid;
        ws.send(JSON.stringify({ t: 'hello', v: 1, code, from: m.cid, name: nombre, pid: 'prueba-' + nombre + '-' + key.slice(0, 6), ...extra }));
        clearTimeout(timer); resolve(who);
      }
    });
  });
}
const send = (j, m) => j.ws.send(JSON.stringify(m));
async function espera(j, f, que, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const m = j.inbox.filter(f).pop();
    if (m) return m;
    if (Date.now() - t0 > ms) throw new Error(`${j.nombre}: no llegó ${que}`);
    await sleep(100);
  }
}

let fails = 0;
async function t(name, f) {
  try { await f(); console.log('ok  ', name); }
  catch (e) { fails++; console.log('FAIL', name, '\n    ', e.message); }
}

let A, B;
await t('la página y /api/salud contestan', async () => {
  const s = await fetch(BASE + '/api/salud'); assert.equal(await s.text(), 'ok');
  const p = await fetch(BASE + '/'); const html = await p.text();
  assert.equal(p.status, 200); assert.ok(/Truco/i.test(html) && html.length > 100000, 'la página no parece el juego');
});
await t('entrar a una mesa que no existe avisa "nomesa"', async () => {
  const X = await jugador('Nadie', {});
  await espera(X, m => m.t === 'nomesa', 'nomesa');
  X.ws.close();
});
await t('el dueño crea la mesa ' + code, async () => {
  A = await jugador('Prueba A', { key, crear: { n: 2, key } });
  const l = await espera(A, m => m.t === 'lobby', 'la sala');
  assert.equal(l.n, 2); assert.equal(l.seats[0].name, 'Prueba A');
});
await t('otro jugador entra y se sienta', async () => {
  B = await jugador('Prueba B', {});
  const l = await espera(B, m => m.t === 'lobby' && m.seats[1] && m.seats[1].kind === 'guest', 'la sala con B sentado');
  assert.equal(l.seats[1].name, 'Prueba B');
  await espera(A, m => m.t === 'lobby' && m.seats[1] && m.seats[1].name === 'Prueba B', 'que A vea a B');
});
await t('el chat llega a los dos', async () => {
  send(A, { t: 'chat', text: 'buenas' });
  await espera(B, m => m.t === 'chat' && m.text === 'buenas' && m.name === 'Prueba A', 'el mensaje de A');
});
await t('solo el dueño puede empezar; empieza y cada uno ve su mano', async () => {
  send(B, { t: 'start', rules: {} });
  await sleep(1500);
  assert.ok(!B.inbox.some(m => m.t === 'state'), 'B no debería poder empezar');
  send(A, { t: 'start', rules: {}, speed: 'rapida', level: 'normal' });
  const sa = await espera(A, m => m.t === 'state', 'el estado de A');
  const sb = await espera(B, m => m.t === 'state', 'el estado de B');
  assert.equal(sa.seat, 0); assert.equal(sb.seat, 1);
  // B no ve las cartas de A
  const manoA = JSON.stringify(sa.view).match(/"id":"\d+-[a-z]+"/g) || [];
  assert.ok(manoA.length > 0, 'A no tiene cartas a la vista');
});
await t('se juegan jugadas por el servidor', async () => {
  let jugadas = 0;
  const t0 = Date.now(), hecho = new Map();
  while (jugadas < 6 && Date.now() - t0 < 40000) {
    for (const j of [A, B]) {
      const i = j.inbox.map(m => m.t).lastIndexOf('state'), st = j.inbox[i];
      if (!st || hecho.get(j) === i) continue;
      hecho.set(j, i);
      if (st.actor === st.seat && st.legal.length) {
        const a = st.legal.find(x => x.type === 'play') || st.legal.find(x => x.type === 'noquiero') || st.legal[0];
        send(j, { t: 'act', a }); jugadas++;
      } else if (st.endLeft) send(j, { t: 'ready', key: st.key });
    }
    await sleep(200);
  }
  assert.ok(jugadas >= 2, 'casi no se pudo jugar: ' + jugadas + ' jugadas');
  const errs = [A, B].flatMap(j => j.inbox.filter(m => m.t === 'err'));
  assert.equal(errs.length, 0, 'el servidor rechazó jugadas: ' + JSON.stringify(errs.slice(0, 2)));
});
await t('el dueño cierra la mesa y les avisa a todos', async () => {
  send(A, { t: 'close' });
  await espera(B, m => m.t === 'closed', 'el aviso de mesa cerrada');
});
for (const j of [A, B]) try { j && j.ws.close(); } catch (e) {}
console.log(fails ? `${fails} pruebas fallaron` : 'Servidor en línea OK');
process.exit(fails ? 1 : 0);
