// Pruebas de la mesa del servidor, sin Cloudflare: un reloj de mentira y conexiones de mentira.
// Uso: node server/prueba-mesa.mjs
import assert from 'assert';
import { Mesa } from './mesa.mjs';
import T from '../engine.js';

let fails = 0;
function t(name, f) { try { f(); console.log('ok  ', name); } catch (e) { fails++; console.log('FAIL', name, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); } }

// reloj y red de mentira
function mundo() {
  let now = 1e6, seq = 0;
  const tasks = new Map(), gone = new Set(), inbox = {}, saved = { data: null, ended: false };
  const io = {
    send: (cid, msg) => (inbox[cid] = inbox[cid] || []).push(JSON.parse(JSON.stringify(msg))),
    close: cid => { (inbox[cid] = inbox[cid] || []).push({ t: '__cerrado' }); },
    now: () => now,
    setTimeout: (f, ms) => { const id = ++seq; tasks.set(id, { at: now + ms, f }); return id; },
    clearTimeout: id => tasks.delete(id),
    setInterval: (f, ms) => { const id = ++seq; const run = () => { f(); if (!gone.has(id)) tasks.set(id, { at: now + ms, f: run }); }; tasks.set(id, { at: now + ms, f: run }); return id; },
    clearInterval: id => { gone.add(id); tasks.delete(id); },
    save: d => { saved.data = JSON.parse(JSON.stringify(d)); },
    end: () => { saved.ended = true; }, idle: () => {},
  };
  // avanza el reloj hasta "ms" más tarde, corriendo lo que toque
  const run = ms => {
    const until = now + ms;
    for (;;) {
      let next = null;
      for (const [id, x] of tasks) if (x.at <= until && (!next || x.at < next[1].at)) next = [id, x];
      if (!next) break;
      tasks.delete(next[0]); now = next[1].at; next[1].f();
    }
    now = until;
  };
  return { io, inbox, run, saved, get now() { return now; } };
}
const T_actor = m => m.GM.phase === 'play' ? T.actor(m.GM) : null;
const last = (inbox, cid, type) => (inbox[cid] || []).filter(m => m.t === type).pop();
// un jugador "humano" que contesta lo que le piden
function vivo(mesa, W, cid) { const p = last(W.inbox, cid, 'ping'); if (p) mesa.onMessage(cid, { t: 'pong', s: p.s }); }
function juega(mesa, W, cid, sinListo) {
  vivo(mesa, W, cid);
  const st = last(W.inbox, cid, 'state');
  if (!st) return false;
  if (st.view.phase !== 'play' && st.view.phase !== 'matchEnd') { if (sinListo) return false; if (!st.waiting.length || st.waiting.includes(st.view.names[st.seat])) mesa.onMessage(cid, { t: 'ready', key: st.key }); return false; }
  if (st.actor !== st.seat || !st.legal.length) return false;
  let a = st.legal.find(x => x.type === 'play') || st.legal.find(x => x.type === 'quiero') || st.legal[0];
  if (a.type === 'sing' && a.pts === null) a = { ...a, pts: st.view.round.envPts[st.seat] };
  W.inbox[cid] = [];
  mesa.onMessage(cid, { t: 'act', a });
  return true;
}

t('se crea la mesa, entra un invitado y lo sienta de compañero', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); assert.equal(last(W.inbox, 'a', 'hola').cid, 'a');
  m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', code: 'ABCD', crear: { n: 4, key: 'llave' } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb' });
  const L = last(W.inbox, 'b', 'lobby');
  assert.deepEqual(L.seats.map(s => s.kind), ['host', 'ai', 'guest', 'ai']);
  assert.equal(L.seats[2].cid, 'b');
  // con un código que no existe
  const W2 = mundo(), m2 = new Mesa(W2.io, null);
  m2.onOpen('x'); m2.onMessage('x', { t: 'hello', name: 'Pepe', pid: 'px' });
  assert(last(W2.inbox, 'x', 'nomesa'));
  // crear con un código ocupado
  m.onOpen('c'); m.onMessage('c', { t: 'hello', name: 'Otro', pid: 'pc', crear: { n: 2, key: 'otra' } });
  assert(last(W.inbox, 'c', 'ocupada'));
});

t('solo el dueño cambia el modo y empieza; cada uno recibe solo sus cartas', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 4, key: 'k' } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb' });
  m.onMessage('b', { t: 'mode', n: 2 }); assert.equal(m.n, 4);
  m.onMessage('b', { t: 'start' }); assert(!m.started);
  m.onMessage('a', { t: 'start', rules: { target: 30, tiempo: 30, hackeo: true }, speed: 'rápida' });
  assert(m.started); assert.equal(m.GM.rules.target, 30); assert(!('hackeo' in m.GM.rules));
  const sb = last(W.inbox, 'b', 'state');
  assert.equal(sb.seat, 2);
  sb.view.round.hands.forEach((h, p) => { if (p !== 2) assert(h.every(c => c.hidden), 'Juan ve cartas de ' + p); });
  assert(sb.view.round.hands[2].every(c => !c.hidden));
});

t('partido entre dos personas y la computadora: avanza, valida jugadas y sigue solo al fin de mano', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 4, key: 'k' } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb' });
  m.onMessage('a', { t: 'start', speed: 'rápida' });
  // una jugada que no corresponde
  const sa = last(W.inbox, 'a', 'state');
  if (sa.actor !== 0) { m.onMessage('a', { t: 'act', a: { type: 'play', card: sa.view.round.hands[0][0] } }); }
  else m.onMessage('a', { t: 'act', a: { type: 'truco', level: 4 } });
  for (let i = 0; i < 4000 && m.GM.roundNo < 4 && m.GM.phase !== 'matchEnd'; i++) { juega(m, W, 'a'); juega(m, W, 'b'); W.run(500); }
  assert(m.GM.roundNo >= 4, 'mano ' + m.GM.roundNo);
  // Juan no toca "Siguiente mano": a los 15 segundos se sigue igual
  for (let i = 0; i < 4000 && m.GM.phase === 'play'; i++) { juega(m, W, 'a', true); juega(m, W, 'b', true); W.run(500); }
  const r = m.GM.roundNo;
  const sa2 = last(W.inbox, 'a', 'state'); m.onMessage('a', { t: 'ready', key: sa2.key });
  assert.equal(m.GM.roundNo, r);
  assert(typeof last(W.inbox, 'b', 'state').endLeft === 'number');
  for (let i = 0; i < 18; i++) { W.run(1000); vivo(m, W, 'a'); vivo(m, W, 'b'); }
  assert(m.GM.roundNo > r || m.GM.phase === 'matchEnd', 'no siguió solo');
});

t('si alguien no juega, a los 30 segundos decide la computadora por él', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 2, key: 'k' } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb' });
  m.onMessage('a', { t: 'start' });
  for (let i = 0; i < 200 && T_actor(m) !== 1; i++) { juega(m, W, 'a'); W.run(500); }
  assert.equal(T_actor(m), 1);
  const n0 = m.GM.log.length;
  assert.equal(last(W.inbox, 'b', 'state').clock.p, 1);
  for (let i = 0; i < 32; i++) { W.run(1000); vivo(m, W, 'a'); vivo(m, W, 'b'); }
  assert(m.GM.log.slice(n0).some(l => /Juan se le acabó el tiempo/.test(l.text)));
});

t('quien se va lo reemplaza la computadora y al volver (aunque recargue) recupera su lugar', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 4, key: 'k' } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb' });
  m.onMessage('a', { t: 'start' });
  m.onClose('b');
  assert.equal(m.seats[2].kind, 'ai'); assert(!m.GM.humans.includes(2));
  m.onOpen('b2'); m.onMessage('b2', { t: 'hello', name: 'Juan Pablo', pid: 'pb' });   // mismo identificador, otro nombre
  assert.equal(m.seats[2].cid, 'b2'); assert(m.GM.humans.includes(2));
  assert.equal(last(W.inbox, 'b2', 'state').seat, 2);
  // el dueño recarga: vuelve con su llave
  m.onClose('a'); assert.equal(m.seats[0].kind, 'ai');
  m.onOpen('a2'); m.onMessage('a2', { t: 'hello', name: 'Ana', pid: 'otro', key: 'k' });
  assert.equal(m.seats[0].kind, 'host'); assert.equal(m.seats[0].cid, 'a2');
  // alguien nuevo con el partido empezado ve la mesa y elige lugar
  m.onOpen('c'); m.onMessage('c', { t: 'hello', name: 'Pedro', pid: 'pc' });
  assert.equal(m.seatOf('c'), -1); assert(last(W.inbox, 'c', 'lobby').started);
  m.onMessage('c', { t: 'sit', seat: 1, name: 'Pedro' });
  assert.equal(m.seatOf('c'), 1); assert.equal(m.GM.names[1], 'Pedro');
});

t('latidos: el que no contesta queda afuera y al despertarse vuelve a entrar', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 4, key: 'k' } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb' });
  m.onMessage('a', { t: 'start' });
  for (let i = 0; i < 6; i++) { W.run(4000); const p = last(W.inbox, 'a', 'ping'); if (p) m.onMessage('a', { t: 'pong', s: p.s }); }
  assert.equal(m.seatOf('b'), -1, 'Juan sigue sentado');
  assert.equal(m.seatOf('a'), 0);
});

t('chat: lo reparte a todos, con el nombre del lugar, y el que llega recibe lo último', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 4, key: 'k' } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb' });
  m.onMessage('b', { t: 'chat', text: '  hola   <b>che</b> ' });
  const c = last(W.inbox, 'a', 'chat'); assert.equal(c.name, 'Juan'); assert.equal(c.text, 'hola <b>che</b>'); assert.equal(c.p, 2);
  m.onMessage('b', { t: 'chat', text: 'otra' }); assert.equal(m.chat.length, 1);   // de a uno por vez
  m.onOpen('c'); m.onMessage('c', { t: 'hello', name: 'Pedro', pid: 'pc' });
  assert.equal(last(W.inbox, 'c', 'chatlog').list.length, 1);
});

t('lo guardado alcanza para seguir el partido después de un reinicio', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 2, key: 'k' } });
  m.onMessage('a', { t: 'start' }); W.run(2000);
  const W2 = mundo(), m2 = new Mesa(W2.io, W.saved.data);
  assert(m2.started); assert.equal(m2.GM.roundNo, m.GM.roundNo);
  m2.onOpen('a'); m2.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', key: 'k' });
  assert.equal(last(W2.inbox, 'a', 'state').seat, 0);
});

t('el dueño cierra la mesa: les avisa a todos', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 4, key: 'k' } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb' });
  m.onMessage('b', { t: 'close' }); assert(!last(W.inbox, 'a', 'closed'));
  m.onMessage('a', { t: 'close' });
  assert(last(W.inbox, 'b', 'closed')); assert(W.saved.ended);
});

console.log(fails ? `\n${fails} FALLAS` : '\nTodo OK');
process.exitCode = fails ? 1 : 0;
