// Una mesa compartida en el servidor (una por código). Hace lo que hacía el navegador del anfitrión
// en las mesas por internet (red.part.js), pero acá: nadie tiene que dejar una pestaña abierta y nadie
// tiene en su navegador las cartas ajenas. Habla el mismo idioma de mensajes que el juego:
//   del jugador: hello, sit, bye, act, senas, ready, pref, chat, talk, pong; y el dueño: mode, name, start, close
//   al jugador:  hola, lobby, state, err, full, closed, nomesa, ocupada, chat, chatlog, talk, ping
// No toca la red ni el reloj directamente: todo pasa por "io" (así se prueba en Node sin Cloudflare).
// Con cuentas: quien manda su token en "hello" queda anotado con su cuenta, y al terminar el partido
// se manda el resumen (para el ranking, las estadísticas y el historial) por io.registrar.
import T from '../engine.js';
import AI from '../ai.js';
import TV from '../vista.js';

const NETV = 1;
const AI_NAMES = { 2: ['Vos', 'Computadora'], 4: ['Vos', 'Tito', 'Pocho', 'Nacho'], 6: ['Vos', 'Tito', 'Pocho', 'Nacho', 'Lalo', 'Beto'] };
const SPEEDS = { lenta: 1.6, normal: 1, 'rápida': 0.55 };
const LEVELS = ['facil', 'normal', 'dificil'];
const END_WAIT = 17000, CLOCK_GRACE = 2000, PING_MS = 4000;
const team = p => p % 2;
const joinY = l => l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1];
const cleanName = v => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Invitado';
// busca entre las jugadas permitidas la que mandó el jugador (las cartas se comparan por su id;
// el canto de los puntos en modo realista lleva el número que eligió la persona)
function matchLegal(legal, a) {
  const flat = x => JSON.stringify(Object.keys(x).sort().filter(k => k !== 'card' && k !== 'pts').map(k => [k, x[k]]));
  for (const x of legal) {
    if (x.type !== a.type) continue;
    if (x.type === 'play') { if (a.card && x.card && a.card.id === x.card.id) return x; continue; }
    if (x.type === 'sing') { if (x.pts === null || x.pts === undefined) { const n = Number(a.pts); if (Number.isInteger(n) && n >= 0 && n <= 99) return { ...x, pts: n }; continue; } if (x.pts === a.pts) return x; continue; }
    if (flat(x) === flat(a)) return x;
  }
  return null;
}
const roundKey = S => S.roundNo + ':' + (S.round && S.round.duel ? S.round.duel.idx : 0) + ':' + S.phase;

export class Mesa {
  // io: { send(cid, msg), close(cid), now(), setTimeout, clearTimeout, setInterval, clearInterval, save(data), end(), idle(),
  //       cuenta(token) -> Promise<{id, apodo}|null>, registrar(resumen) -> Promise }   (los dos últimos pueden faltar)
  constructor(io, saved) {
    this.io = io;
    this.conns = new Map();            // cid -> { pid, alive, chatAt, msgs }
    this.timer = null; this.clockT = null; this.endT = null; this.beat = null; this.saveT = null;
    this.clock = null; this.endAt = null; this.endKey = null;
    this.lastRoundKey = null; this.lastTricks = 0; this.pingSeq = 0;
    this.ready = new Set();
    const s = saved || {};
    this.code = s.code || null; this.key = s.key || null;
    this.n = s.n || 4; this.started = !!s.started; this.prefs = s.prefs || {};
    this.speed = s.speed || 'normal'; this.level = s.level || 'normal';
    this.chat = s.chat || []; this.GM = s.GM || null;
    // al despertar, nadie está conectado: los lugares de personas pasan a la computadora hasta que vuelvan
    this.seats = (s.seats || []).map((x, p) => x.kind === 'ai' ? x : p === 0 && !this.started ? { ...x, cid: null } : { kind: 'ai', name: x.name, left: true, pid: x.pid, host: p === 0, uid: x.uid || null });
    if (this.GM) this.GM.humans = [];
    // cuentas que juegan este partido: uid -> { equipo, abandono, stats }; hasta que vuelvan, figuran como que se fueron
    this.cuentas = new Map((s.cuentas || []).map(([uid, c]) => [uid, { ...c, abandono: true }]));
    this.anotada = s.anotada ?? null; this.registrado = !!s.registrado;
  }

  // ---------- conexión ----------
  onOpen(cid) {
    this.conns.set(cid, { pid: null, alive: this.pingSeq, chatAt: 0, msgs: [] });
    this.send(cid, { t: 'hola', cid });
    if (!this.beat) this.beat = this.io.setInterval(() => this.heartbeat(), PING_MS);
  }
  onClose(cid) {
    if (!this.conns.has(cid)) return;
    this.conns.delete(cid);
    const s = this.seatOf(cid);
    if (s >= 0) {
      if (s === 0 && !this.started) this.seats[0].cid = null;   // el dueño se fue antes de empezar: el lugar lo espera
      else this.freeSeat(s);
      this.lobbyChanged();
      if (this.started) this.publish();
    }
    if (!this.conns.size) { this.io.clearInterval(this.beat); this.beat = null; this.stopTimers(); this.saveNow(); this.io.idle(); }
  }
  onMessage(cid, m) {
    const c = this.conns.get(cid);
    if (!c || !m || typeof m !== 'object' || typeof m.t !== 'string') return;
    // de a poco: más de 40 mensajes en 2 segundos es un error o un abuso
    const now = this.io.now(); c.msgs = c.msgs.filter(t => now - t < 2000); c.msgs.push(now);
    if (c.msgs.length > 40) return;
    const s = this.seatOf(cid);
    switch (m.t) {
      case 'hello': return this.hello(cid, m);
      case 'pong': if (typeof m.s === 'number') c.alive = Math.max(c.alive, m.s); if (s < 0 && m.seated && this.key) this.send(cid, this.lobbyMsg()); return;
      case 'sit': return this.sit(cid, m);
      case 'bye': if (s >= 0) { if (s === 0 && !this.started) this.seats[0].cid = null; else this.freeSeat(s); this.lobbyChanged(); if (this.started) this.publish(); } return;
      case 'act': return this.act(cid, s, m.a);
      case 'senas':
        if (s >= 0 && this.started && this.GM && this.GM.phase === 'play' && Array.isArray(m.list)) { T.setSenas(this.GM, s, m.list.filter(k => T.SENAS[k]).slice(0, 4)); this.publish(); }
        return;
      case 'ready': if (s >= 0 && this.started && this.GM && m.key === roundKey(this.GM)) { this.ready.add(s); this.checkReady(); } return;
      case 'pref': if (s >= 0) this.prefs[s] = !!m.realista; return;
      case 'chat': return this.chatIn(cid, s, m);
      case 'talk': if (s >= 0) this.broadcast({ t: 'talk', p: s, on: !!m.on }); return;
      // lo que puede hacer el dueño de la mesa
      case 'mode': if (this.isOwner(cid) && !this.started && [2, 4, 6].includes(m.n)) this.setMode(m.n); return;
      case 'name': if (this.isOwner(cid) && !this.started) { this.seats[0].name = cleanName(m.name); this.lobbyChanged(); } return;
      case 'start': if (this.isOwner(cid) && (!this.started || (this.GM && this.GM.phase === 'matchEnd'))) this.startMatch(m); return;
      case 'close': if (this.isOwner(cid)) this.closeTable(); return;
    }
  }

  // ---------- llegar, sentarse, irse ----------
  hello(cid, m) {
    const c = this.conns.get(cid), name = cleanName(m.name), pid = String(m.pid || '').slice(0, 40) || null;
    c.pid = pid;
    if (typeof m.token === 'string' && m.token && this.io.cuenta && !c.uid) {
      Promise.resolve(this.io.cuenta(m.token.slice(0, 200))).then(u => this.conCuenta(cid, u)).catch(() => {});
    }
    const key = m.crear && typeof m.crear.key === 'string' ? m.crear.key : typeof m.key === 'string' ? m.key : null;
    if (!this.key) {
      if (!m.crear || !key) { this.send(cid, { t: 'nomesa' }); return; }
      // mesa nueva
      this.key = key; this.code = String(m.code || '').slice(0, 8);
      this.n = [2, 4, 6].includes(m.crear.n) ? m.crear.n : 4;
      this.started = false; this.GM = null; this.chat = []; this.prefs = {};
      this.seats = this.seatsFor(this.n, { kind: 'host', name, cid, pid });
      this.prefs[0] = !!m.realista;
      this.lobbyChanged(); this.saveNow();
      return;
    }
    if (m.crear && key !== this.key) { this.send(cid, { t: 'ocupada' }); return; }
    // el dueño vuelve (recargó la página, se le cortó)
    if (key && key === this.key) {
      const prev = this.seats[0];
      if (prev.cid && prev.cid !== cid && this.conns.has(prev.cid)) this.io.close(prev.cid);
      this.takeSeat(0, { kind: 'host', name: this.started ? prev.name : name, cid, pid }, m.realista);
      return;
    }
    // ya estaba sentado con otra conexión (la vieja todavía no se dio por cortada)
    const same = pid ? this.seats.findIndex(x => x.kind === 'guest' && x.pid === pid) : -1;
    if (same >= 0) {
      const old = this.seats[same].cid;
      if (old !== cid && this.conns.has(old)) { this.seats[same].cid = null; this.io.close(old); }
      this.takeSeat(same, { kind: 'guest', name: this.seats[same].name, cid, pid }, m.realista);
      return;
    }
    const who = { kind: 'guest', name, cid, pid };
    if (this.started) {
      // si vuelve alguien que se había ido, recupera su lugar (por su identificador o por su nombre)
      let back = pid ? this.seats.findIndex(x => x.kind === 'ai' && x.left && !x.host && x.pid === pid) : -1;
      if (back < 0) back = this.seats.findIndex(x => x.kind === 'ai' && x.left && !x.host && x.name === name);
      if (back >= 0) this.takeSeat(back, { ...who, name: this.seats[back].name }, m.realista);
      else { this.send(cid, this.lobbyMsg()); this.sendChatlog(cid); }
      return;
    }
    const p = this.freeSeatFor();
    if (p < 0) { this.send(cid, { t: 'full' }); return; }
    this.takeSeat(p, who, m.realista);
  }
  sit(cid, m) {
    const s = this.seatOf(cid), p = m.seat;
    if (s === 0 || p === s || !this.seats[p] || this.seats[p].kind !== 'ai' || this.seats[p].host) return;
    const c = this.conns.get(cid);
    const who = s >= 0 ? this.seats[s] : { kind: 'guest', name: cleanName(m.name), cid, pid: c.pid };
    if (s >= 0) this.freeSeat(s);
    this.takeSeat(p, { ...who, cid }, m.realista);
  }
  // llegó la respuesta del servidor de cuentas: el lugar de esa conexión queda con su cuenta y su apodo
  conCuenta(cid, u) {
    const c = this.conns.get(cid);
    if (!c || !u || typeof u.id !== 'number') return;
    c.uid = u.id; c.apodo = cleanName(u.apodo);
    const p = this.seatOf(cid);
    if (p < 0) return;
    this.seats[p].uid = u.id;
    if (!this.started) this.seats[p].name = c.apodo;
    this.notarCuenta(p);
    this.lobbyChanged();
  }
  notarCuenta(p) {
    const s = this.seats[p];
    if (!this.started || !s || !s.uid || s.kind === 'ai') return;
    const c = this.cuentas.get(s.uid);
    if (c) { c.equipo = team(p); c.abandono = false; }
    else this.cuentas.set(s.uid, { equipo: team(p), abandono: false, stats: { manos: 0, manosGanadas: 0, envidos: 0, flores: 0, trucos: 0 } });
  }
  takeSeat(p, who, realista) {
    const cc = this.conns.get(who.cid);
    this.seats[p] = { kind: who.kind, name: who.name, cid: who.cid, pid: who.pid, uid: (cc && cc.uid) || null };
    if (realista !== undefined) this.prefs[p] = !!realista;
    const c = this.conns.get(who.cid); if (c) c.alive = this.pingSeq;
    if (this.started && this.GM) {
      if (!this.GM.humans.includes(p)) this.GM.humans.push(p);
      this.GM.names[p] = who.name;
      this.GM.teamNames = this.GM.n > 2 ? [0, 1].map(t => joinY(this.GM.names.filter((_, q) => team(q) === t))) : this.GM.names.slice();
    }
    this.notarCuenta(p);
    this.lobbyChanged();
    this.sendChatlog(who.cid);
    if (this.started) { this.publish(); if (this.GM && this.GM.phase === 'play') this.step(); else this.endWait(); }
  }
  freeSeat(p) {
    const prev = this.seats[p];
    this.seats[p] = this.started ? { kind: 'ai', name: prev.name, left: true, pid: prev.pid, host: p === 0, uid: prev.uid || null } : { kind: 'ai', name: AI_NAMES[this.n][p] };
    if (this.started && prev.uid && this.cuentas.has(prev.uid)) this.cuentas.get(prev.uid).abandono = true;
    this.ready.delete(p);
    if (this.started && this.GM) {
      this.GM.humans = this.GM.humans.filter(q => q !== p);
      if (this.GM.phase === 'play' && T.actor(this.GM) === p) this.step(); else this.checkReady();
    }
  }
  seatsFor(n, owner) { return Array.from({ length: n }, (_, p) => p === 0 ? owner : { kind: 'ai', name: AI_NAMES[n][p] }); }
  freeSeatFor() {
    const free = this.seats.map((s, p) => s.kind === 'ai' && !s.host ? p : -1).filter(p => p >= 0);
    const f = free.find(p => team(p) === 0);
    return f !== undefined ? f : free.length ? free[0] : -1;
  }
  setMode(n) {
    const guests = this.seats.filter(s => s.kind === 'guest');
    this.n = n; this.seats = this.seatsFor(n, this.seats[0]);
    guests.forEach(g => { const p = this.freeSeatFor(); if (p >= 0) this.seats[p] = g; else this.send(g.cid, { t: 'full' }); });
    this.lobbyChanged();
  }
  seatOf(cid) { return this.seats ? this.seats.findIndex(s => s.kind !== 'ai' && s.cid === cid) : -1; }
  isOwner(cid) { return this.seats && this.seats[0] && this.seats[0].kind === 'host' && this.seats[0].cid === cid; }
  lobbyMsg() { return { t: 'lobby', n: this.n, started: this.started, owner: 0, seats: this.seats.map((s, p) => ({ kind: s.kind, name: s.name, cid: s.cid || null, host: p === 0 || undefined, cuenta: s.kind !== 'ai' && !!s.uid || undefined })) }; }
  lobbyChanged() { if (this.seats) this.broadcast(this.lobbyMsg()); this.save(); }

  // ---------- el partido ----------
  startMatch(m) {
    const n = this.n, names = this.seats.map(s => s.name);
    const humans = this.seats.map((s, p) => s.kind === 'ai' ? -1 : p).filter(p => p >= 0);
    const teamNames = n === 2 ? names.slice() : [0, 1].map(t => joinY(names.filter((_, q) => team(q) === t)));
    const rules = {};
    const want = m.rules && typeof m.rules === 'object' ? m.rules : {};
    for (const k in T.DEFAULT_RULES) if (k in want && typeof want[k] === typeof T.DEFAULT_RULES[k]) rules[k] = want[k];
    this.speed = SPEEDS[m.speed] ? m.speed : 'normal';
    this.level = LEVELS.includes(m.level) ? m.level : 'normal';
    this.stopTimers();
    this.GM = T.newMatch({ players: n, names, humans, rules, manual: this.seats.map((s, p) => s.kind !== 'ai' && !!this.prefs[p]), teamNames });
    this.GM.id = this.io.now().toString(36) + Math.random().toString(36).slice(2, 7);
    T.startRound(this.GM);
    this.started = true; this.ready = new Set(); this.lastRoundKey = null; this.clock = null;
    this.cuentas = new Map(); this.anotada = null; this.registrado = false;
    this.seats.forEach((_, p) => this.notarCuenta(p));
    this.lobbyChanged();
    this.step();
  }
  act(cid, s, a) {
    const G = this.GM;
    if (s < 0 || !this.started || !G || G.phase !== 'play' || T.actor(G) !== s || !a || typeof a !== 'object') { if (s >= 0 && this.started) this.publish(); return; }
    // la jugada tiene que ser una de las que el motor permite en ese momento
    const pick = matchLegal(T.legal(G, s), a);
    if (!pick) { this.send(cid, { t: 'err', msg: 'Esa jugada no se puede hacer ahora.' }); this.publish(); return; }
    try { T.apply(G, s, pick); }
    catch (e) { this.send(cid, { t: 'err', msg: e.message }); this.publish(); return; }
    this.step();
  }
  scale() { return SPEEDS[this.speed] || 1; }
  // pausas para mirar: al empezar la mano y al cerrarse cada baza
  notePauses() {
    const G = this.GM, R = G.round;
    let extra = 0;
    const k = G.roundNo + ':' + (R && R.duel ? R.duel.idx : 0);
    if (k !== this.lastRoundKey) { this.lastRoundKey = k; this.lastTricks = 0; extra += G.n >= 4 ? 2600 : 1200; }
    if (R && R.tricks.length > this.lastTricks) { this.lastTricks = R.tricks.length; extra += G.n >= 4 ? 2000 : 1200; }
    return extra;
  }
  connectedHumans() { return this.seats.some(s => s.kind !== 'ai' && s.cid && this.conns.has(s.cid)); }
  step() {
    this.io.clearTimeout(this.timer); this.timer = null;
    const G = this.GM; if (!G) return;
    const extra = this.notePauses();
    this.anotar();
    this.clockSync();
    this.publish();
    this.save();
    if (!this.connectedHumans()) return;                 // sin nadie mirando, el partido espera
    if (G.phase === 'play') {
      const p = T.actor(G);
      if (G.humans.includes(p)) return;
      const R = G.round, top = R.pending[R.pending.length - 1];
      const delay = ((top ? 1400 : G.n === 6 ? 1100 : G.n === 4 ? 1300 : 1000) + extra) * this.scale();
      this.timer = this.io.setTimeout(() => {
        this.timer = null;
        if (this.GM !== G || G.phase !== 'play' || T.actor(G) !== p || G.humans.includes(p)) { this.step(); return; }
        T.apply(G, p, AI.choose(G, p, { samples: G.n === 6 ? 40 : G.n === 4 ? 60 : 160, level: this.level }));
        this.step();
      }, delay);
    } else this.endWait();
  }
  // al terminar cada mano, lo de cada cuenta que está sentada; al terminar el partido, el resumen
  anotar() {
    const G = this.GM, R = G && G.round;
    if (!G || !R || !['roundEnd', 'chicoEnd', 'matchEnd'].includes(G.phase)) return;
    if (this.anotada !== G.roundNo) {
      this.anotada = G.roundNo;
      const pts = (t, cat) => (R.gained[t] || []).filter(g => g.cat === cat).reduce((a, g) => a + g.pts, 0);
      this.seats.forEach((s, p) => {
        if (s.kind === 'ai' || !s.uid || !this.cuentas.has(s.uid)) return;
        const st = this.cuentas.get(s.uid).stats, t = team(p);
        st.manos++;
        if (pts(t, 'truco') > 0) st.manosGanadas++;
        if (pts(t, 'envido') > 0) st.envidos++;
        if (pts(t, 'truco') >= 2) st.trucos++;
        if (R.flor && R.flor.sung[p] && R.flor.has[p]) st.flores++;
      });
    }
    if (G.phase === 'matchEnd' && !this.registrado) {
      this.registrado = true;
      if (!this.io.registrar || ![0, 1].every(t => [...this.cuentas.values()].some(c => c.equipo === t))) return;
      const equipos = [0, 1].map(t => this.seats.map((s, p) => team(p) === t ? { nombre: s.name, cuenta: s.kind !== 'ai' && s.uid || null, compu: s.kind === 'ai' } : null).filter(Boolean));
      const tanteador = G.chicosToWin > 1 ? `${G.chicos[0]} a ${G.chicos[1]} en chicos` : `${G.scores[0]} a ${G.scores[1]}`;
      const resumen = { id: G.id, n: G.n, ganador: G.matchWinner, tanteador, equipos,
        cuentas: [...this.cuentas].map(([uid, c]) => ({ uid, equipo: c.equipo, abandono: c.abandono, stats: c.stats })) };
      Promise.resolve(this.io.registrar(resumen)).then(r => {
        if (!r || !r.anotado) return;
        // a cada uno, cómo le fue en el ranking
        for (const j of r.jugadores || []) {
          const p = this.seats.findIndex(s => s.kind !== 'ai' && s.uid === j.uid);
          if (p >= 0 && this.seats[p].cid) this.send(this.seats[p].cid, { t: 'ranking', ...j });
        }
      }).catch(() => {});
    }
  }
  // tiempo por decisión de cada persona: si se le acaba, decide la computadora por ella
  clockSync() {
    const G = this.GM, lim = this.limit();
    const p = G && G.phase === 'play' ? T.actor(G) : null;
    if (!lim || p === null || p === undefined || !G.humans.includes(p)) { this.clock = null; this.io.clearTimeout(this.clockT); return; }
    const R = G.round, key = [G.roundNo, R.duel ? R.duel.idx : 0, G.log.length, R.played.join(''), p].join(':');
    if (this.clock && this.clock.key === key) return;
    this.clock = { key, p, end: this.io.now() + lim + CLOCK_GRACE };
    this.io.clearTimeout(this.clockT);
    this.clockT = this.io.setTimeout(() => this.timeUp(key), lim + CLOCK_GRACE);
  }
  limit() { const v = this.GM && this.GM.rules ? this.GM.rules.tiempo : undefined; return (v === undefined ? 30 : +v || 0) * 1000; }
  timeUp(key) {
    const G = this.GM, c = this.clock;
    if (!G || !c || c.key !== key || G.phase !== 'play' || T.actor(G) !== c.p) return;
    this.clock = null;
    const a = AI.choose(G, c.p, { samples: G.n === 6 ? 40 : G.n === 4 ? 60 : 160, level: 'normal' });
    G.log.push({ who: null, text: `A ${G.names[c.p]} se le acabó el tiempo: decidió la computadora.`, kind: 'info', round: G.roundNo });
    try { T.apply(G, c.p, a); } catch (e) { return; }
    this.step();
  }
  // fin de mano: se sigue cuando todos tocan "Siguiente mano", o solo a los 15 segundos
  endWait() {
    const G = this.GM;
    if (!G || G.phase === 'play' || G.phase === 'matchEnd') return;
    const k = roundKey(G);
    if (this.endKey === k) return;
    this.endKey = k; this.endAt = this.io.now();
    this.io.clearTimeout(this.endT);
    if (this.limit()) this.endT = this.io.setTimeout(() => {
      if (!this.GM || roundKey(this.GM) !== k) return;
      this.seats.forEach((s, p) => { if (s.kind !== 'ai') this.ready.add(p); });
      this.checkReady();
    }, END_WAIT);
    this.publish();
  }
  checkReady() {
    const G = this.GM;
    if (!G || !this.started || G.phase === 'play' || G.phase === 'matchEnd') return;
    const humans = this.seats.map((s, p) => s.kind === 'ai' ? -1 : p).filter(p => p >= 0);
    if (humans.every(p => this.ready.has(p))) {
      this.ready = new Set(); this.io.clearTimeout(this.endT); this.endKey = null;
      G.humans.forEach(p => { G.manual[p] = !!this.prefs[p]; });
      T.nextRound(G);
      this.step();
    } else this.publish();
  }
  waitingNames() { return this.seats.map((s, p) => s.kind !== 'ai' && !this.ready.has(p) ? s.name : null).filter(Boolean); }
  // a cada persona, su vista del partido (sin las cartas ajenas), de quién es el turno y qué puede hacer
  publish() {
    const G = this.GM;
    if (!this.started || !G) return;
    const act = T.actor(G), key = roundKey(G), now = this.io.now();
    const clock = this.clock ? { p: this.clock.p, left: this.clock.end - now, run: true } : null;
    const endLeft = G.phase !== 'play' && this.endKey === key && this.limit() ? END_WAIT - (now - this.endAt) : null;
    const waiting = this.waitingNames(), host = this.seats[0] ? this.seats[0].name : '';
    this.seats.forEach((s, p) => {
      if (s.kind === 'ai' || !s.cid) return;
      this.send(s.cid, { t: 'state', seat: p, view: TV.viewFor(G, p), actor: act, legal: act === p ? T.legal(G, p) : [], key, waiting, paused: false, host, clock, endLeft });
    });
  }

  // ---------- chat ----------
  chatIn(cid, s, m) {
    const c = this.conns.get(cid), now = this.io.now();
    if (now - c.chatAt < 600) return;
    c.chatAt = now;
    const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!text || !this.seats) return;
    const msg = { p: s, name: s >= 0 ? this.seats[s].name : cleanName(m.name), text };
    this.chat.push(msg); if (this.chat.length > 80) this.chat.shift();
    this.broadcast({ t: 'chat', ...msg });
    this.save();
  }
  sendChatlog(cid) { if (cid && this.chat.length) this.send(cid, { t: 'chatlog', list: this.chat.slice(-40) }); }

  // ---------- latidos: quien no contesta tres seguidas se fue ----------
  heartbeat() {
    const seq = ++this.pingSeq;
    for (const [cid, c] of this.conns) {
      if (seq - c.alive > 3) { this.io.close(cid); this.onClose(cid); continue; }
      this.send(cid, { t: 'ping', s: seq });
    }
  }

  // ---------- cerrar ----------
  closeTable() {
    this.broadcast({ t: 'closed' });
    this.stopTimers();
    this.key = null; this.GM = null; this.started = false; this.seats = null; this.chat = [];
    for (const cid of [...this.conns.keys()]) this.io.close(cid);
    this.conns.clear();
    this.io.clearInterval(this.beat); this.beat = null;
    this.io.end();
  }
  stopTimers() { this.io.clearTimeout(this.timer); this.io.clearTimeout(this.clockT); this.io.clearTimeout(this.endT); this.io.clearTimeout(this.saveT); this.timer = this.clockT = this.endT = this.saveT = null; this.clock = null; }

  // ---------- guardar (por si Cloudflare reinicia la mesa) ----------
  data() {
    if (!this.key) return null;
    return { code: this.code, key: this.key, n: this.n, started: this.started, prefs: this.prefs, speed: this.speed, level: this.level, chat: this.chat, GM: this.GM,
      seats: (this.seats || []).map(s => ({ kind: s.kind, name: s.name, pid: s.pid || null, left: !!s.left, host: !!s.host, uid: s.uid || null })),
      cuentas: [...this.cuentas], anotada: this.anotada, registrado: this.registrado };
  }
  save() { if (this.saveT) return; this.saveT = this.io.setTimeout(() => { this.saveT = null; this.saveNow(); }, 800); }
  saveNow() { const d = this.data(); if (d) this.io.save(d); }

  send(cid, msg) { if (cid) this.io.send(cid, { v: NETV, code: this.code, from: 'host', ...msg }); }
  broadcast(msg) { for (const cid of this.conns.keys()) this.send(cid, msg); }
}
