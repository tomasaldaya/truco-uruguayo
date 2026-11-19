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

t('el personaje 3D que elige cada uno llega a todos (y uno inválido no)', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', pj: 'boina', crear: { n: 4, key: 'k' } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb', pj: '<script>' });
  m.onOpen('c'); m.onMessage('c', { t: 'hello', name: 'Pedro', pid: 'pc', pj: 'callejero' });
  m.onMessage('a', { t: 'start', speed: 'rápida' });
  const v = last(W.inbox, 'b', 'state').view;
  assert.equal(v.pjs[0], 'boina'); assert.equal(v.pjs[2], null);
  assert.equal(v.pjs.filter(x => x === 'callejero').length, 1);
});

t('partido entre dos personas y la computadora: avanza, valida jugadas y sigue solo al fin de mano', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  // al mejor de tres chicos a 40, para que una falta envido no termine el partido antes de tiempo
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 4, key: 'k', cfg: { target: 40, chicos: 2 } } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb' });
  m.onMessage('a', { t: 'start', speed: 'rápida' });
  // una jugada que no corresponde
  const sa = last(W.inbox, 'a', 'state');
  if (sa.actor !== 0) { m.onMessage('a', { t: 'act', a: { type: 'play', card: sa.view.round.hands[0][0] } }); }
  else m.onMessage('a', { t: 'act', a: { type: 'truco', level: 4 } });
  for (let i = 0; i < 4000 && m.GM.roundNo < 4 && m.GM.phase !== 'matchEnd'; i++) { juega(m, W, 'a'); juega(m, W, 'b'); W.run(500); }
  { const G = m.GM, p = T.actor(G); assert(m.GM.roundNo >= 4 || G.phase === 'matchEnd', `mano ${G.roundNo}, fase ${G.phase}, le toca a ${p}, manual ${G.manual}, puede ${G.phase === 'play' ? T.legal(G, p).map(x => x.type).join(',') : '-'}, canto ${JSON.stringify(G.round.canto)}, listos ${[...m.ready]}, tanteador ${G.scores}`); }
  // Juan no toca "Siguiente mano": a los 15 segundos se sigue igual
  for (let i = 0; i < 4000 && m.GM.phase === 'play'; i++) { juega(m, W, 'a', true); juega(m, W, 'b', true); W.run(500); }
  const r = m.GM.roundNo;
  if (m.GM.phase === 'matchEnd') return;              // (rara vez el partido termina antes; no hay fin de mano que esperar)
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

// ---------- con cuentas ----------
const pausa = () => new Promise(r => setTimeout(r, 0));
async function ta(name, f) { try { await f(); console.log('ok  ', name); } catch (e) { fails++; console.log('FAIL', name, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); } }
function conCuentas(W) {
  const reg = [], quien = { tA: { id: 1, apodo: 'Ana' }, tB: { id: 2, apodo: 'Beto' }, tC: { id: 3, apodo: 'Ceci' } };
  W.io.cuenta = tok => Promise.resolve(quien[tok] || null);
  W.io.registrar = r => { reg.push(JSON.parse(JSON.stringify(r))); return Promise.resolve({ anotado: true, jugadores: r.cuentas.map(c => ({ uid: c.uid, gano: c.equipo === r.ganador && !c.abandono, delta: 16, puntos: 1016 })) }); };
  return reg;
}
async function hastaElFinal(m, W, cids) {
  for (let i = 0; i < 40000 && m.GM.phase !== 'matchEnd'; i++) { for (const c of cids) juega(m, W, c); W.run(500); if (i % 50 === 0) await pausa(); }
  await pausa(); await pausa();
}

await ta('con cuentas: la mesa usa el apodo, lo marca y al final anota el partido con lo de cada uno', async () => {
  const W = mundo(), reg = conCuentas(W), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Anita', pid: 'pa', crear: { n: 2, key: 'k' }, token: 'tA' });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'B', pid: 'pb', token: 'tB' });
  await pausa();
  const L = last(W.inbox, 'b', 'lobby');
  assert.deepEqual(L.seats.map(s => [s.name, !!s.cuenta]), [['Ana', true], ['Beto', true]]);
  m.onMessage('a', { t: 'start', rules: { target: 30, chicosToWin: 1 }, speed: 'rápida' });
  await hastaElFinal(m, W, ['a', 'b']);
  assert.equal(m.GM.phase, 'matchEnd');
  assert.equal(reg.length, 1);
  const r = reg[0];
  assert.equal(r.n, 2); assert.equal(r.ganador, m.GM.matchWinner); assert.match(r.tanteador, /^\d+ a \d+$/);
  assert.deepEqual(r.cuentas.map(c => [c.uid, c.equipo, c.abandono]), [[1, 0, false], [2, 1, false]]);
  const [sa, sb] = r.cuentas.map(c => c.stats);
  assert(sa.manos > 0 && sa.manos === sb.manos, 'manos ' + sa.manos + ' ' + sb.manos);
  const g = sa.manosGanadas + sb.manosGanadas;      // cada mano la gana uno (salvo la última, si el chico se cerró antes con el envido)
  assert(g <= sa.manos && g >= sa.manos - 1, 'manos ganadas ' + g + ' de ' + sa.manos);
  assert.deepEqual(r.equipos.map(e => e.map(x => x.nombre)), [['Ana'], ['Beto']]);
  assert(last(W.inbox, 'a', 'ranking') && last(W.inbox, 'b', 'ranking'));
  // un solo aviso aunque se siga publicando
  W.run(5000); await pausa(); assert.equal(reg.length, 1);
});

await ta('con cuentas: si en un equipo no hay nadie con cuenta, no se anota', async () => {
  const W = mundo(), reg = conCuentas(W), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 2, key: 'k' }, token: 'tA' });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Invitado', pid: 'pb' });
  await pausa();
  m.onMessage('a', { t: 'start', rules: { target: 30, chicosToWin: 1 }, speed: 'rápida' });
  await hastaElFinal(m, W, ['a', 'b']);
  assert.equal(m.GM.phase, 'matchEnd'); assert.equal(reg.length, 0);
});

await ta('con cuentas: el que se va y no vuelve queda con abandono; el que vuelve, no', async () => {
  const W = mundo(), reg = conCuentas(W), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 4, key: 'k', cfg: { target: 40 } }, token: 'tA' });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Beto', pid: 'pb', token: 'tB' });
  await pausa();
  m.onOpen('c'); m.onMessage('c', { t: 'hello', name: 'Ceci', pid: 'pc', token: 'tC' });
  await pausa();
  m.onMessage('c', { t: 'sit', seat: 1 });                     // Ceci de rival
  assert.deepEqual(m.seats.map(s => s.uid || null), [1, 3, 2, null]);
  m.onMessage('a', { t: 'start', rules: { target: 30, chicosToWin: 1 }, speed: 'rápida' });
  for (let i = 0; i < 12; i++) { juega(m, W, 'a'); juega(m, W, 'b'); juega(m, W, 'c'); W.run(500); }
  assert.notEqual(m.GM.phase, 'matchEnd');
  m.onClose('b');                                               // Beto se va y no vuelve
  m.onClose('c'); m.onOpen('c2'); m.onMessage('c2', { t: 'hello', name: 'Ceci', pid: 'pc', token: 'tC' });   // Ceci recarga
  await pausa();
  assert.equal(m.seats[1].uid, 3);
  await hastaElFinal(m, W, ['a', 'c2']);
  assert.equal(reg.length, 1);
  const by = Object.fromEntries(reg[0].cuentas.map(c => [c.uid, c]));
  assert.equal(by[2].abandono, true); assert.equal(by[3].abandono, false); assert.equal(by[1].abandono, false);
  assert.equal(by[2].equipo, 0); assert.equal(by[3].equipo, 1);
});

await ta('con cuentas: se guarda y se recupera tras un reinicio', async () => {
  const W = mundo(); conCuentas(W); const m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 2, key: 'k' }, token: 'tA' });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Beto', pid: 'pb', token: 'tB' });
  await pausa();
  m.onMessage('a', { t: 'start', rules: { target: 30, chicosToWin: 1 } });
  for (let i = 0; i < 60; i++) { juega(m, W, 'a'); juega(m, W, 'b'); W.run(500); }
  m.saveNow();
  const W2 = mundo(), reg2 = conCuentas(W2), m2 = new Mesa(W2.io, W.saved.data);
  assert.deepEqual([...m2.cuentas.keys()], [1, 2]);
  m2.onOpen('a'); m2.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', key: 'k', token: 'tA' });
  m2.onOpen('b'); m2.onMessage('b', { t: 'hello', name: 'Beto', pid: 'pb', token: 'tB' });
  await pausa();
  await hastaElFinal(m2, W2, ['a', 'b']);
  assert.equal(reg2.length, 1);
  assert(reg2[0].cuentas.every(c => !c.abandono));
  assert(reg2[0].cuentas[0].stats.manos > 1);
});

// ---------- abandonar ----------
t('si un jugador realista se va y la computadora sigue en su lugar, ese lugar deja de ser realista', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 4, key: 'k' } });
  for (const [c, n] of [['b', 'Beto'], ['c', 'Ceci'], ['d', 'Dani']]) { m.onOpen(c); m.onMessage(c, { t: 'hello', name: n, pid: 'p' + c, realista: c === 'b' }); }
  m.onMessage('a', { t: 'start', speed: 'rápida' });
  const sb = m.seats.findIndex(x => x.cid === 'b');
  assert.equal(m.GM.manual[sb], true);
  m.onMessage('b', { t: 'bye' });
  assert.equal(m.seats[sb].kind, 'ai');
  assert.equal(m.GM.manual[sb], false);
});

// mesa de parejas empezada con Ana y Juan sentados (y la computadora en los otros dos lugares)
function mesaEmpezada(cfg) {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', code: 'MIRA', crear: { n: 4, key: 'k', cfg } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb' });
  m.onMessage('a', { t: 'start', rules: {} });
  return { W, m };
}
t('mirar: quien entra con el partido empezado puede mirar, sin ver ninguna carta sin jugar', () => {
  const { W, m } = mesaEmpezada();
  m.onOpen('x'); m.onMessage('x', { t: 'hello', name: 'Mirón', pid: 'px' });
  assert(!last(W.inbox, 'x', 'state'), 'sin pedir mirar, solo ve la mesa de espera');
  m.onMessage('x', { t: 'mirar' });
  const id = last(W.inbox, 'x', 'mirando').id;
  const st = last(W.inbox, 'x', 'state');
  assert.equal(st.seat, -1); assert(st.mira); assert.deepEqual(st.legal, []);
  assert(st.view.round.hands.every(h => h.every(c => c.hidden)), 'ninguna mano a la vista');
  assert(st.view.round.senas.every(x => x === null));
  // los demás lo ven en la lista
  const L = last(W.inbox, 'a', 'lobby');
  assert.deepEqual(L.mirando.map(x => [x.id, x.name]), [[id, 'Mirón']]); assert.equal(L.echarCon, 2);
  // sigue el partido: le llega cada estado; no puede jugar ni votar nada
  W.inbox.x = [];
  for (let i = 0; i < 4; i++) { juega(m, W, 'a'); juega(m, W, 'b'); W.run(2500); }
  assert(last(W.inbox, 'x', 'state'));
  const G0 = JSON.stringify(m.GM.round && m.GM.round.played);
  m.onMessage('x', { t: 'act', a: { type: 'mazo' } }); m.onMessage('x', { t: 'echar', id });
  assert.equal(JSON.stringify(m.GM.round && m.GM.round.played), G0);
  assert.deepEqual(m.miranInfo().mirando[0].echar, []);
  // chat y voz: con su nombre (no el que mande) y marcado como que mira
  W.run(700); m.onMessage('x', { t: 'chat', text: 'buena jugada', name: 'Ana' });
  const ch = last(W.inbox, 'a', 'chat'); assert.equal(ch.name, 'Mirón'); assert.equal(ch.m, id); assert.equal(ch.p, -1);
  m.onMessage('x', { t: 'talk', on: true }); assert.deepEqual([last(W.inbox, 'a', 'talk').m, last(W.inbox, 'a', 'talk').on], [id, true]);
  // si se sienta en un lugar libre, deja de mirar y juega
  m.onMessage('b', { t: 'bye' });
  const libre = m.seats.findIndex(x => x.kind === 'ai' && x.left);
  m.onMessage('x', { t: 'sit', seat: libre });
  assert.equal(m.seatOf('x'), libre); assert.deepEqual(last(W.inbox, 'a', 'lobby').mirando, []);
});

t('mirar: si la mayoría de los sentados vota echarlo, se va y no puede volver a esa mesa', () => {
  const { W, m } = mesaEmpezada();
  m.onOpen('x'); m.onMessage('x', { t: 'hello', name: 'Molesto', pid: 'px', mirar: true });
  const id = last(W.inbox, 'x', 'mirando').id;
  m.onOpen('y'); m.onMessage('y', { t: 'hello', name: 'Tranqui', pid: 'py', mirar: true });
  m.onMessage('a', { t: 'echar', id });
  let L = last(W.inbox, 'b', 'lobby');
  assert.deepEqual(L.mirando.find(x => x.id === id).echar, [0]);   // un voto de dos
  assert(!last(W.inbox, 'x', 'expulsado'));
  m.onMessage('a', { t: 'echar', id, no: true });                    // se arrepiente
  assert.deepEqual(last(W.inbox, 'b', 'lobby').mirando.find(x => x.id === id).echar, []);
  m.onMessage('a', { t: 'echar', id }); m.onMessage('b', { t: 'echar', id });
  assert(last(W.inbox, 'x', 'expulsado')); assert(last(W.inbox, 'x', '__cerrado'));
  assert.equal(last(W.inbox, 'a', 'echado').name, 'Molesto');
  assert.deepEqual(last(W.inbox, 'a', 'lobby').mirando.map(x => x.name), ['Tranqui']);
  // vuelve con otra conexión (recargó): no entra, ni a mirar ni a sentarse
  m.onOpen('x2'); m.onMessage('x2', { t: 'hello', name: 'Otro nombre', pid: 'px', mirar: true });
  assert(last(W.inbox, 'x2', 'vetado')); assert(!last(W.inbox, 'x2', 'state')); assert(!m.conns.has('x2'));
  // y queda anotado aunque la mesa se guarde y se despierte
  const m2 = new Mesa(mundo().io, JSON.parse(JSON.stringify(m.data())));
  assert(m2.vetado({ pid: 'px' })); assert(!m2.vetado({ pid: 'py' }));
});

t('mirar: con una cuenta echada no se vuelve a entrar aunque cambie de navegador', () => {
  const W = mundo(); conCuentas(W);
  const m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', code: 'MIRB', crear: { n: 2, key: 'k' } });
  m.onMessage('a', { t: 'start', rules: {} });
  m.onOpen('x'); m.onMessage('x', { t: 'hello', name: 'X', pid: 'px', mirar: true });
  m.conCuenta('x', { id: 77, apodo: 'Pesado' });
  assert.equal(last(W.inbox, 'a', 'lobby').mirando[0].name, 'Pesado');   // con cuenta, figura con su apodo
  m.onMessage('a', { t: 'echar', id: last(W.inbox, 'x', 'mirando').id });   // de una persona sentada, alcanza con ella
  assert(last(W.inbox, 'x', 'expulsado'));
  m.onOpen('x3'); m.onMessage('x3', { t: 'hello', name: 'X', pid: 'otro-navegador', mirar: true });
  assert(last(W.inbox, 'x3', 'mirando'), 'todavía no se sabe de quién es');
  m.conCuenta('x3', { id: 77, apodo: 'Pesado' });
  assert(last(W.inbox, 'x3', 'vetado')); assert(!m.conns.has('x3'));
});

t('mirar: los votos de quien se va no cuentan, y con menos gente sentada puede alcanzar', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', code: 'MIRC', crear: { n: 4, key: 'k' } });
  for (const [c, nm] of [['b', 'Juan'], ['c', 'Ceci']]) { m.onOpen(c); m.onMessage(c, { t: 'hello', name: nm, pid: 'p' + c }); }
  m.onMessage('a', { t: 'start', rules: {} });
  m.onOpen('x'); m.onMessage('x', { t: 'hello', name: 'Mirón', pid: 'px', mirar: true });
  const id = last(W.inbox, 'x', 'mirando').id;
  assert.equal(last(W.inbox, 'a', 'lobby').echarCon, 2);   // de tres sentados, dos
  m.onMessage('c', { t: 'echar', id });
  m.onMessage('c', { t: 'bye' });                            // Ceci se va: su voto no cuenta
  assert.deepEqual(last(W.inbox, 'a', 'lobby').mirando[0].echar, []);
  assert.equal(last(W.inbox, 'a', 'lobby').echarCon, 2);   // de dos, dos
  m.onMessage('a', { t: 'echar', id });
  assert(!last(W.inbox, 'x', 'expulsado'));
  m.onMessage('b', { t: 'echar', id });
  assert(last(W.inbox, 'x', 'expulsado'));
});

t('voz: la mesa dice quiénes pueden estar en la sala de voz (los de la mesa, no los echados)', () => {
  const { W, m } = mesaEmpezada();
  m.onMessage('a', { t: 'vozid', id: 'vozDeAna0001' });
  m.onMessage('b', { t: 'vozid', id: 'no vale!' });
  assert.deepEqual(last(W.inbox, 'b', 'lobby').voces, ['vozDeAna0001']);
  m.onOpen('x'); m.onMessage('x', { t: 'hello', name: 'Mirón', pid: 'px', mirar: true, vozId: 'vozDelMiron1' });
  assert.deepEqual(last(W.inbox, 'a', 'lobby').voces.sort(), ['vozDeAna0001', 'vozDelMiron1']);
  m.onMessage('a', { t: 'echar', id: last(W.inbox, 'x', 'mirando').id }); m.onMessage('b', { t: 'echar', id: last(W.inbox, 'x', 'mirando').id });
  assert.deepEqual(last(W.inbox, 'a', 'lobby').voces, ['vozDeAna0001']);
});

t('reglas de la mesa: las elige quien la crea, las ven todos y solo el dueño las cambia hasta empezar', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 4, key: 'k', cfg: { target: 20, chicos: 2, achique: true, chat: true, voz: false } } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb' });
  assert.deepEqual(last(W.inbox, 'b', 'lobby').cfg, { target: 20, chicos: 2, achique: true, chat: true, voz: false });
  m.onMessage('b', { t: 'cfg', cfg: { target: 40 } });                      // el invitado no puede
  assert.equal(m.cfg.target, 20);
  m.onMessage('a', { t: 'cfg', cfg: { target: 10, chicos: 7, voz: 'sí', hackeo: true } });   // lo que no vale queda como estaba
  assert.deepEqual(last(W.inbox, 'b', 'lobby').cfg, { target: 10, chicos: 2, achique: true, chat: true, voz: false });
  // empieza con esas reglas, aunque el dueño mande otras, y con todas las personas en modo realista
  m.onMessage('a', { t: 'start', rules: { target: 40, chicosToWin: 1, achique: false, tiempo: 60 } });
  assert.equal(m.GM.rules.target, 10); assert.equal(m.GM.target, 10); assert.equal(m.GM.chicosToWin, 2);
  assert.equal(m.GM.rules.achique, true); assert.equal(m.GM.rules.tiempo, 60);
  const sb = m.seats.findIndex(x => x.cid === 'b');
  assert.deepEqual(m.GM.manual.map(Boolean), m.seats.map((x, p) => p === 0 || p === sb));
  // con el partido empezado ya no se cambian
  m.onMessage('a', { t: 'cfg', cfg: { target: 40 } });
  assert.equal(m.cfg.target, 10);
  // se guardan con la mesa
  const m2 = new Mesa(mundo().io, JSON.parse(JSON.stringify(m.data())));
  assert.deepEqual(m2.cfg, m.cfg);
  // sin reglas (un navegador viejo): las de siempre
  const W3 = mundo(), m3 = new Mesa(W3.io, null);
  m3.onOpen('a'); m3.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 2, key: 'k' } });
  assert.deepEqual(last(W3.inbox, 'a', 'lobby').cfg, { target: 30, chicos: 1, achique: false, chat: true, voz: true });
});

t('reglas de la mesa: sin chat de texto o sin voz, el servidor no los reparte', () => {
  const W = mundo(), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 2, key: 'k', cfg: { chat: false, voz: false } } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Juan', pid: 'pb' });
  m.onMessage('b', { t: 'chat', text: 'hola' }); m.onMessage('b', { t: 'talk', on: true });
  assert(!last(W.inbox, 'a', 'chat')); assert(!last(W.inbox, 'a', 'talk')); assert.equal(m.chat.length, 0);
  // el dueño prende el chat antes de empezar: ahí sí
  m.onMessage('a', { t: 'cfg', cfg: { chat: true } });
  W.run(700); m.onMessage('b', { t: 'chat', text: 'hola' });
  assert.equal(last(W.inbox, 'a', 'chat').text, 'hola');
  assert(!last(W.inbox, 'a', 'talk'), 'la voz sigue apagada');
  // y si lo vuelve a apagar, lo que se habló no le llega al que entra
  m.onMessage('a', { t: 'cfg', cfg: { chat: false } });
  m.onOpen('c'); m.onMessage('c', { t: 'hello', name: 'Ceci', pid: 'pc' });
  assert(!last(W.inbox, 'c', 'chatlog'));
});

await ta('abandono: el que se va a propósito pierde enseguida (y en el ranking)', async () => {
  const W = mundo(), reg = conCuentas(W), m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 2, key: 'k' }, token: 'tA' });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Beto', pid: 'pb', token: 'tB' });
  await pausa();
  m.onMessage('a', { t: 'start', rules: { target: 30, chicosToWin: 1 } });
  for (let i = 0; i < 6; i++) { juega(m, W, 'a'); juega(m, W, 'b'); W.run(500); }
  assert.equal(m.GM.phase === 'matchEnd', false);
  m.onMessage('b', { t: 'bye' });
  assert.equal(m.GM.phase, 'matchEnd'); assert.equal(m.GM.matchWinner, 0);
  assert.match(m.GM.round.result.texto, /Beto abandonó el partido: gana Ana/);
  await pausa(); await pausa();
  assert.equal(reg.length, 1);
  const by = Object.fromEntries(reg[0].cuentas.map(c => [c.uid, c]));
  assert.equal(reg[0].ganador, 0); assert.equal(by[2].abandono, true); assert.equal(by[1].abandono, false);
  assert.equal(last(W.inbox, 'a', 'state').view.phase, 'matchEnd');
});

await ta('abandono: si se le corta, tiene un minuto para volver; si no vuelve, pierde', async () => {
  const W = mundo(); conCuentas(W); const m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 2, key: 'k', cfg: { target: 40, chicos: 2 } } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Beto', pid: 'pb' });
  m.onMessage('a', { t: 'start' });
  m.onClose('b');
  for (let i = 0; i < 30; i++) { W.run(1000); vivo(m, W, 'a'); }
  assert.notEqual(m.GM.phase, 'matchEnd', 'todavía tiene tiempo');
  m.onOpen('b2'); m.onMessage('b2', { t: 'hello', name: 'Beto', pid: 'pb' });   // vuelve a tiempo
  for (let i = 0; i < 70; i++) { W.run(1000); vivo(m, W, 'a'); vivo(m, W, 'b2'); }
  assert.notEqual(m.GM.phase, 'matchEnd', 'volvió: sigue el partido');
  m.onClose('b2');
  for (let i = 0; i < 62; i++) { W.run(1000); vivo(m, W, 'a'); }
  assert.equal(m.GM.phase, 'matchEnd'); assert.equal(m.GM.matchWinner, 0);
});

await ta('abandono en parejas: mientras al equipo le quede alguien, sigue; si se van todos, gana el otro', async () => {
  const W = mundo(); conCuentas(W); const m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'Ana', pid: 'pa', crear: { n: 4, key: 'k' } });
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'Beto', pid: 'pb' });
  m.onOpen('c'); m.onMessage('c', { t: 'hello', name: 'Ceci', pid: 'pc' });
  m.onMessage('b', { t: 'sit', seat: 3 });
  assert.deepEqual([m.seatOf('a') % 2, m.seatOf('b') % 2, m.seatOf('c') % 2], [0, 1, 1], 'Beto y Ceci juntos en contra');
  m.onMessage('a', { t: 'start' });
  m.onMessage('b', { t: 'bye' });
  assert.notEqual(m.GM.phase, 'matchEnd', 'Ceci sigue en el equipo');
  m.onMessage('c', { t: 'bye' });
  assert.equal(m.GM.phase, 'matchEnd'); assert.equal(m.GM.matchWinner, 0);
  assert.match(m.GM.round.result.texto, /abandonaron el partido/);
});

// ---------- mesas públicas ----------
function conSalon(W) { const avisos = []; W.io.salon = info => { avisos.push(info); return Promise.resolve(true); }; return avisos; }
const quienes = { tA: { id: 1, apodo: 'Ana' }, tB: { id: 2, apodo: 'Beto' }, tC: { id: 3, apodo: 'Ceci' } };

await ta('pública: hace falta cuenta; sin dueño; el que llega juega en contra; el salón se entera', async () => {
  const W = mundo(); conCuentas(W); const sal = conSalon(W), m = new Mesa(W.io, null);
  m.onOpen('x'); m.onMessage('x', { t: 'hello', name: 'Sin', pid: 'px', code: 'PUBL', crear: { n: 4, key: 'k', publica: true } });
  assert(last(W.inbox, 'x', 'nocuenta')); assert(!m.key);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'A', pid: 'pa', code: 'PUBL', crear: { n: 4, key: 'k', publica: true }, token: 'tA' });
  await pausa();
  assert(m.publica); assert.equal(m.seats[0].kind, 'guest'); assert.equal(m.seats[0].uid, 1); assert.equal(m.seats[0].name, 'Ana');
  m.onOpen('y'); m.onMessage('y', { t: 'hello', name: 'Otro', pid: 'py' }); await pausa();
  assert(last(W.inbox, 'y', 'nocuenta')); assert.equal(m.seatOf('y'), -1);
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'B', pid: 'pb', token: 'tB' }); await pausa();
  assert.equal(m.seatOf('b'), 1, 'Beto va al otro equipo');
  const L = last(W.inbox, 'b', 'lobby');
  assert.equal(L.publica, true); assert(L.seats.every(x => !x.host));
  // nadie manda: no se cambia el modo, no se empieza a mano, no se cierra
  m.onMessage('a', { t: 'mode', n: 2 }); m.onMessage('a', { t: 'start' }); m.onMessage('a', { t: 'close' });
  assert.equal(m.n, 4); assert(!m.started); assert(!W.saved.ended);
  W.run(1000);
  const ult = sal[sal.length - 1];
  assert.deepEqual([ult.codigo, ult.n, ult.personas, ult.nombres, ult.empezada], ['PUBL', 4, 2, ['Ana', 'Beto'], false]);
  // la misma cuenta desde otro lado se pasa a su lugar (no ocupa dos)
  m.onOpen('b2'); m.onMessage('b2', { t: 'hello', name: 'B', pid: 'otro', token: 'tB' }); await pausa();
  assert.equal(m.seatOf('b2'), 1); assert.equal(m.gente().length, 2);
  // el que creó se va antes de empezar: el lugar queda libre para otro
  m.onClose('a');
  assert.equal(m.seats[0].kind, 'ai'); assert(!m.seats[0].host);
  m.onOpen('c'); m.onMessage('c', { t: 'hello', name: 'C', pid: 'pc', token: 'tC' }); await pausa();
  assert.equal(m.seatOf('c'), 0);
  m.onClose('b2'); m.onClose('c'); W.run(1000);
  assert.equal(sal[sal.length - 1].personas, 0);
});

await ta('pública: empieza sola al llenarse (a 30, un chico); si alguien se va en la cuenta atrás, no', async () => {
  const W = mundo(); conCuentas(W); conSalon(W); const m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'A', pid: 'pa', code: 'MANO', crear: { n: 2, key: 'k', publica: true }, token: 'tA' }); await pausa();
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'B', pid: 'pb', token: 'tB' }); await pausa();
  assert(typeof last(W.inbox, 'a', 'lobby').empiezaEn === 'number');
  m.onClose('b'); W.run(4000);
  assert(!m.started, 'no tenía que empezar');
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'B', pid: 'pb', token: 'tB' }); await pausa();
  W.run(3500); vivo(m, W, 'a'); vivo(m, W, 'b');
  assert(m.started); assert.equal(m.GM.rules.target, 30); assert.equal(m.GM.rules.chicosToWin, 1);
  assert(last(W.inbox, 'b', 'state'));
});

await ta('pública: quien la arma elige las reglas; se juegan con ellas y el salón las muestra', async () => {
  const W = mundo(); conCuentas(W); const salon = conSalon(W); const m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'A', pid: 'pa', code: 'REGL', crear: { n: 2, key: 'k', publica: true, cfg: { target: 40, chicos: 2, achique: true, chat: false, voz: true } }, token: 'tA' }); await pausa();
  W.run(500);
  assert.deepEqual(salon[salon.length - 1].cfg, { target: 40, chicos: 2, achique: true, chat: false, voz: true });
  m.onMessage('a', { t: 'cfg', cfg: { target: 10 } });                 // en la pública no hay dueño: no se cambian
  assert.equal(m.cfg.target, 40);
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'B', pid: 'pb', token: 'tB' }); await pausa();
  assert.equal(last(W.inbox, 'b', 'lobby').cfg.target, 40);
  W.run(3500); vivo(m, W, 'a'); vivo(m, W, 'b');
  assert(m.started); assert.equal(m.GM.rules.target, 40); assert.equal(m.GM.rules.chicosToWin, 2); assert.equal(m.GM.rules.achique, true);
  assert.deepEqual(m.GM.manual, [true, true]);
  m.onMessage('b', { t: 'chat', text: 'buenas' });
  assert(!last(W.inbox, 'a', 'chat'));
});

await ta('pública: con dos o más, si todos quieren empezar ya, la computadora completa; y al final, otro partido', async () => {
  const W = mundo(), reg = conCuentas(W); conSalon(W); const m = new Mesa(W.io, null);
  m.onOpen('a'); m.onMessage('a', { t: 'hello', name: 'A', pid: 'pa', code: 'PARE', crear: { n: 4, key: 'k', publica: true }, token: 'tA' }); await pausa();
  m.onMessage('a', { t: 'empezar' }); W.run(4000);
  assert(!m.started, 'solo no empieza');
  m.onOpen('b'); m.onMessage('b', { t: 'hello', name: 'B', pid: 'pb', token: 'tB' }); await pausa();
  W.run(4000); assert(!m.started, 'Beto todavía no quiso');
  m.onMessage('b', { t: 'empezar' });
  assert.deepEqual(last(W.inbox, 'a', 'lobby').votos.sort(), [0, 1]);
  W.run(3500); vivo(m, W, 'a'); vivo(m, W, 'b');
  assert(m.started); assert.deepEqual(m.GM.humans.sort(), [0, 1]);
  await hastaElFinal(m, W, ['a', 'b']);
  assert.equal(reg.length, 1, 'cuenta para el ranking');
  assert.equal(last(W.inbox, 'a', 'lobby').fin, true);
  const id1 = m.GM.id;
  m.onMessage('a', { t: 'empezar' }); m.onMessage('b', { t: 'empezar' }); W.run(3500);
  assert.notEqual(m.GM.id, id1); assert.equal(m.GM.phase, 'play');
});

console.log(fails ? `\n${fails} FALLAS` : '\nTodo OK');
process.exitCode = fails ? 1 : 0;
