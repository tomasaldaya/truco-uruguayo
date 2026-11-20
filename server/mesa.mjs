// Una mesa compartida en el servidor (una por código). Hace lo que hacía el navegador del anfitrión
// en las mesas por internet (red.part.js), pero acá: nadie tiene que dejar una pestaña abierta y nadie
// tiene en su navegador las cartas ajenas. Habla el mismo idioma de mensajes que el juego:
//   del jugador: hello, sit, bye, act, senas, pedido, ready, chat, talk, pong, empezar (mesa pública), mirar, echar, vozid, mirada, gesto;
//                y el dueño: mode, name, cfg, start, close
//   al jugador:  hola, lobby, state, err, full, closed, nomesa, ocupada, nocuenta, chat, chatlog, talk, ping, ranking,
//                mirando, expulsado, vetado, echado, mirada, gesto
// Gesto: un gesto (dedito para arriba…) o un sonido, de los que trae el juego. Viaja solo
// el código (g:…, s:…), nunca texto libre; cada pantalla lo traduce y lo muestra o lo hace sonar.
// Mirada: hacia dónde mira cada uno en la mesa 3D (girar la cabeza, inclinarse, mirar la muestra de cerca);
// se reparte tal cual a los demás para que lo vean en su personaje. No dice nada de las cartas.
// Mirar: quien no tiene lugar puede mirar el partido. Ve lo que vería alguien parado al lado de la mesa (las
// cartas jugadas, lo que se muestra, el tanteador), nunca las cartas sin jugar ni las señas, y puede usar el
// chat y la voz. Si la mayoría de las personas sentadas vota echarlo, se va y no vuelve a entrar a esa mesa
// (se lo reconoce por su identificador y, si tiene, por su cuenta).
// No toca la red ni el reloj directamente: todo pasa por "io" (así se prueba en Node sin Cloudflare).
// Con cuentas: quien manda su token en "hello" queda anotado con su cuenta, y al terminar el partido
// se manda el resumen (para el ranking, las estadísticas y el historial) por io.registrar.
import T from '../engine.js';
import AI from '../ai.js';
import TV from '../vista.js';
import { validarDelJugador } from './protocolo.mjs';
const PJ_RE = /^[a-z][a-z0-9-]{0,23}$/;   // código de personaje 3D (como en cuentas.mjs)

const NETV = 1;
const AI_NAMES = { 2: ['Vos', 'Computadora'], 4: ['Vos', 'Tito', 'Pocho', 'Nacho'], 6: ['Vos', 'Tito', 'Pocho', 'Nacho', 'Lalo', 'Beto'] };
const SPEEDS = { lenta: 1.6, normal: 1, 'rápida': 0.55 };
const LEVELS = ['facil', 'normal', 'dificil'];
const END_WAIT = 17000, CLOCK_GRACE = 2000, PING_MS = 4000;
const MAX_MIRAN = 20, MAX_VETADOS = 100;
const VOZ_RE = /^[A-Za-z0-9_-]{8,40}$/;
const GESTO_RE = /^[gs]:[a-z0-9-]{1,24}$/, GESTO_MS = 1500;   // el identificador de cada uno en la sala de voz
// mesas públicas: cualquiera con cuenta entra; sin dueño; empieza sola al llenarse (o cuando todos los
// que están quieren empezar, con la computadora completando)
const CUENTA_ATRAS = 3000;
// Las reglas de la mesa, que elige quien la crea (en la privada, el dueño las puede cambiar hasta empezar):
// a cuántos puntos es cada chico, cuántos chicos, si se cobra el achique y si hay chat de texto y de voz.
// En todas las mesas se juega en modo realista: cada persona canta sus puntos y su flor.
export const ESCENARIOS = ['bar', 'clasico'];   // dónde está la mesa en la 3D (lo eligen al crearla; lo ven todos)
export const CFG0 = { target: 30, chicos: 1, achique: false, chat: true, voz: true, escenario: 'bar' };
export function limpiarCfg(x, base) {
  const b = base || CFG0, o = x && typeof x === 'object' ? x : {};
  const bool = k => typeof o[k] === 'boolean' ? o[k] : b[k];
  return { target: [10, 20, 30, 40].includes(o.target) ? o.target : b.target, chicos: [1, 2].includes(o.chicos) ? o.chicos : b.chicos,
    achique: bool('achique'), chat: bool('chat'), voz: bool('voz'), escenario: ESCENARIOS.includes(o.escenario) ? o.escenario : b.escenario || 'bar' };
}
// irse en medio del partido lo pierde: si se va a propósito, enseguida; si se le corta, tiene este rato para volver
export const GRACIA_MS = 60000;
// al cortarse (recargar, dormirse el celular) el lugar lo espera este rato antes de que juegue la computadora por él:
// si vuelve antes, sigue como si nada (su reloj siguió corriendo)
export const RESERVA_MS = 10000;
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
  //       cuenta(token) -> Promise<{id, apodo}|null>, registrar(resumen) -> Promise, salon(info), despertar(ms), log(obj) }
  //       (los cinco últimos pueden faltar)
  constructor(io, saved) {
    this.io = io;
    this.conns = new Map();            // cid -> { pid, alive, chatAt, msgs, name, mira: { id, name, echar } | null, vozId }
    this.timer = null; this.clockT = null; this.endT = null; this.beat = null; this.saveT = null;
    this.clock = null; this.endAt = null; this.endKey = null;
    this.lastRoundKey = null; this.lastTricks = 0; this.pingSeq = 0;
    this.ready = new Set();
    const s = saved || {};
    this.code = s.code || null; this.key = s.key || null;
    this.n = s.n || 4; this.started = !!s.started; this.cfg = limpiarCfg(s.cfg);
    this.publica = !!s.publica; this.votos = new Set(); this.empiezaEn = null; this.cuentaT = null; this.salonT = null;
    this.ausentes = new Map();             // lugar -> temporizador de los que se cortaron en medio del partido
    this.reservas = new Map();             // lugar -> temporizador del lugar reservado al que se acaba de cortar
    this.speed = s.speed || 'normal'; this.level = s.level || 'normal';
    this.chat = s.chat || []; this.GM = s.GM || null;
    this.vetados = Array.isArray(s.vetados) ? s.vetados.slice(-MAX_VETADOS) : [];   // echados de esta mesa: { pid, uid }
    // al despertar, nadie está conectado: los lugares de personas pasan a la computadora hasta que vuelvan
    this.seats = (s.seats || []).map((x, p) => x.kind === 'ai' ? x
      : this.publica && !this.started ? { kind: 'ai', name: AI_NAMES[this.n][p] }
      : p === 0 && !this.started ? { ...x, cid: null }
      : { kind: 'ai', name: x.name, left: true, pid: x.pid, host: p === 0 && !this.publica, uid: x.uid || null, racha: x.racha || 0 });
    if (this.GM) this.GM.humans = [];
    // cuentas que juegan este partido: uid -> { equipo, abandono, stats }; hasta que vuelvan, figuran como que se fueron
    this.cuentas = new Map((s.cuentas || []).map(([uid, c]) => [uid, { ...c, abandono: true }]));
    this.anotada = s.anotada ?? null; this.registrado = !!s.registrado;
    // el resultado del partido que todavía no confirmaron las cuentas (se reintenta al despertar)
    this.pendiente = s.pendiente || null; this.intentos = 0; this.resT = null; this.enviando = false;
    if (this.pendiente) this.resT = io.setTimeout(() => { this.resT = null; this.enviarResultado(); }, 1000);
  }

  // ---------- conexión ----------
  onOpen(cid) {
    this.conns.set(cid, { pid: null, alive: this.pingSeq, chatAt: 0, msgs: [] });
    this.send(cid, { t: 'hola', cid });
    if (!this.beat) this.beat = this.io.setInterval(() => this.heartbeat(), PING_MS);
  }
  onClose(cid) {
    const c0 = this.conns.get(cid);
    if (!c0) return;
    this.conns.delete(cid);
    if ((c0.mira || c0.vozId) && this.seats && this.seatOf(cid) < 0) this.broadcast(this.lobbyMsg());   // uno menos mirando (o en la voz)
    const s = this.seatOf(cid);
    if (s >= 0) {
      if (s === 0 && !this.started && !this.publica) this.seats[0].cid = null;   // el dueño se fue antes de empezar: el lugar lo espera
      else this.reservar(s);
      this.lobbyChanged();
      if (this.started) this.publish();
    }
    if (!this.conns.size) { this.io.clearInterval(this.beat); this.beat = null; this.stopTimers(); this.saveNow(); this.avisarSalon(true); this.io.idle(); }
  }
  onMessage(cid, m) {
    const c = this.conns.get(cid);
    if (!c || !m || typeof m !== 'object' || typeof m.t !== 'string') return;
    // de a poco: más de 40 mensajes en 2 segundos es un error o un abuso
    const now = this.io.now(); c.msgs = c.msgs.filter(t => now - t < 2000); c.msgs.push(now);
    if (c.msgs.length > 40) return;
    m = validarDelJugador(m);   // solo tipos conocidos y cada campo con su clase (server/protocolo.mjs)
    if (!m) return;
    const s = this.seatOf(cid);
    switch (m.t) {
      case 'hello': return this.hello(cid, m);
      case 'pong': if (typeof m.s === 'number') c.alive = Math.max(c.alive, m.s); if (s < 0 && m.seated && this.key) this.send(cid, this.lobbyMsg()); return;
      case 'sit': return this.sit(cid, m);
      // bye con pausa: recargó o cerró la pestaña (tiene el rato de gracia para volver); sin pausa: se fue a propósito
      case 'bye': if (s >= 0) { if (s === 0 && !this.started && !this.publica) this.seats[0].cid = null; else if (m.pausa) this.reservar(s); else { this.freeSeat(s); this.seFue(s, true); } this.lobbyChanged(); if (this.started) this.publish(); } return;
      case 'empezar': return this.votar(s, m);
      case 'act': return this.act(cid, s, m.a);
      case 'senas':
        if (s >= 0 && this.started && this.GM && this.GM.phase === 'play' && Array.isArray(m.list)) { T.setSenas(this.GM, s, m.list.filter(k => T.SENAS[k]).slice(0, 4)); this.publish(); }
        return;
      case 'pedido':        // "¡Vení!", "¡Gritá!"…: lo oye toda la mesa y la computadora compañera hace caso
        if (s >= 0 && this.started && this.GM && this.GM.phase === 'play' && now - (c.pedidoAt || 0) > 1200 && T.pedir(this.GM, s, String(m.k))) { c.pedidoAt = now; this.publish(); }
        return;
      case 'ready': if (s >= 0 && this.started && this.GM && m.key === roundKey(this.GM)) { this.ready.add(s); this.checkReady(); } return;
      case 'chat': if (this.cfg.chat) this.chatIn(cid, s, m); return;
      case 'talk':
        if (!this.cfg.voz) return;
        if (s >= 0) this.broadcast({ t: 'talk', p: s, on: !!m.on });
        else if (c.mira) this.broadcast({ t: 'talk', m: c.mira.id, on: !!m.on });
        return;
      case 'vozid': if (typeof m.id === 'string' && VOZ_RE.test(m.id) && c.vozId !== m.id) { c.vozId = m.id; if (this.seats) this.broadcast(this.lobbyMsg()); } return;
      case 'mirar': return this.mirar(cid);
      case 'mirada': {
        if (s < 0 || !this.started) return;
        const num = (v, a, b, d) => typeof v === 'number' && Number.isFinite(v) ? Math.max(a, Math.min(b, Math.round(v * 100) / 100)) : d;
        this.broadcast({ t: 'mirada', p: s, y: num(m.y, -3.15, 3.15, 0), pi: num(m.pi, -.4, 1.4, .3), z: num(m.z, .8, 1.2, 1), mu: !!m.mu });
        return;
      }
      case 'echar': return this.echar(s, m);
      case 'gesto':
        if (s < 0 || !this.started || typeof m.k !== 'string' || !GESTO_RE.test(m.k) || now - (c.gestoAt || 0) < GESTO_MS) return;
        c.gestoAt = now; this.broadcast({ t: 'gesto', p: s, k: m.k });
        return;
      // lo que puede hacer el dueño de la mesa
      case 'mode': if (this.isOwner(cid) && !this.started && [2, 4, 6].includes(m.n)) this.setMode(m.n); return;
      case 'name': if (this.isOwner(cid) && !this.started) { this.seats[0].name = cleanName(m.name); this.lobbyChanged(); } return;
      case 'cfg': if (this.isOwner(cid) && (!this.started || (this.GM && this.GM.phase === 'matchEnd'))) { this.cfg = limpiarCfg(m.cfg, this.cfg); if (!this.cfg.chat) this.chat = []; this.lobbyChanged(); } return;
      case 'start': if (this.isOwner(cid) && (!this.started || (this.GM && this.GM.phase === 'matchEnd'))) this.startMatch(m); return;
      case 'close': if (this.isOwner(cid)) this.closeTable(); return;
    }
  }

  // ---------- llegar, sentarse, irse ----------
  hello(cid, m) {
    const c = this.conns.get(cid);
    // mesa pública (o crearla): primero hay que saber de quién es la cuenta
    if ((this.key ? this.publica : m.crear && m.crear.publica) && !c.uid) {
      if (!this.io.cuenta || typeof m.token !== 'string' || !m.token) { this.send(cid, { t: 'nocuenta' }); return; }
      if (c.esperando) return;
      c.esperando = true;
      Promise.resolve(this.io.cuenta(m.token.slice(0, 200))).then(u => {
        c.esperando = false;
        if (!this.conns.has(cid)) return;
        if (!u || typeof u.id !== 'number') { this.send(cid, { t: 'nocuenta' }); return; }
        c.uid = u.id; c.apodo = cleanName(u.apodo); c.racha = u.racha | 0;
        this.hello(cid, { ...m, name: c.apodo });
      }).catch(() => { c.esperando = false; this.send(cid, { t: 'nocuenta' }); });
      return;
    }
    const name = cleanName(m.name), pid = String(m.pid || '').slice(0, 40) || null;
    c.pid = pid; c.name = c.apodo || name;
    if (typeof m.vozId === 'string' && VOZ_RE.test(m.vozId)) c.vozId = m.vozId;
    c.pj = typeof m.pj === 'string' && PJ_RE.test(m.pj) ? m.pj : null;   // el personaje 3D que eligió
    if (typeof m.token === 'string' && m.token && this.io.cuenta && !c.uid) {
      Promise.resolve(this.io.cuenta(m.token.slice(0, 200))).then(u => this.conCuenta(cid, u)).catch(() => {});
    }
    const key = m.crear && typeof m.crear.key === 'string' ? m.crear.key : typeof m.key === 'string' ? m.key : null;
    if (!this.key) {
      if (!m.crear || !key) { this.send(cid, { t: 'nomesa' }); return; }
      // mesa nueva
      this.key = key; this.code = String(m.code || '').slice(0, 8);
      this.n = [2, 4, 6].includes(m.crear.n) ? m.crear.n : 4;
      this.publica = !!m.crear.publica; this.votos = new Set(); this.cfg = limpiarCfg(m.crear.cfg);
      this.started = false; this.GM = null; this.chat = [];
      this.seats = this.seatsFor(this.n, { kind: this.publica ? 'guest' : 'host', name, cid, pid, uid: c.uid || null, pj: c.pj });
      this.lobbyChanged(); this.saveNow();
      return;
    }
    if (m.crear && key !== this.key) { this.send(cid, { t: 'ocupada' }); return; }
    // a quien la mesa echó no se le abre más (aunque recargue o vuelva con el link)
    if (this.vetado(c)) { this.send(cid, { t: 'vetado' }); this.conns.delete(cid); this.io.close(cid); return; }
    // en una mesa pública, una misma cuenta tiene un solo lugar (si entra desde otro lado, se pasa ahí)
    if (this.publica) {
      const mio = this.seats.findIndex(x => x.kind !== 'ai' && x.uid === c.uid);
      if (mio >= 0) {
        const old = this.seats[mio].cid;
        if (old !== cid && this.conns.has(old)) { this.seats[mio].cid = null; this.io.close(old); this.conns.delete(old); }
        this.takeSeat(mio, { kind: 'guest', name: this.seats[mio].name, cid, pid });
        return;
      }
    }
    // el dueño vuelve (recargó la página, se le cortó)
    if (!this.publica && key && key === this.key) {
      const prev = this.seats[0];
      if (prev.cid && prev.cid !== cid && this.conns.has(prev.cid)) this.io.close(prev.cid);
      this.takeSeat(0, { kind: 'host', name: this.started ? prev.name : name, cid, pid });
      return;
    }
    // ya estaba sentado con otra conexión (la vieja todavía no se dio por cortada)
    const same = pid ? this.seats.findIndex(x => x.kind === 'guest' && x.pid === pid) : -1;
    if (same >= 0) {
      const old = this.seats[same].cid;
      if (old !== cid && this.conns.has(old)) { this.seats[same].cid = null; this.io.close(old); }
      this.takeSeat(same, { kind: 'guest', name: this.seats[same].name, cid, pid });
      return;
    }
    const who = { kind: 'guest', name, cid, pid };
    if (this.started) {
      // si vuelve alguien que se había ido, recupera su lugar (por su identificador o por su nombre)
      let back = pid ? this.seats.findIndex(x => x.kind === 'ai' && x.left && !x.host && x.pid === pid) : -1;
      if (back < 0 && c.uid) back = this.seats.findIndex(x => x.kind === 'ai' && x.left && !x.host && x.uid === c.uid);
      if (back < 0) back = this.seats.findIndex(x => x.kind === 'ai' && x.left && !x.host && x.name === name);
      if (back >= 0) { this.log({ ev: 'vuelve' }); this.takeSeat(back, { ...who, name: this.seats[back].name }); }
      else if (m.mirar) this.mirar(cid);
      else { this.send(cid, this.lobbyMsg()); this.sendChatlog(cid); }
      return;
    }
    const p = this.freeSeatFor();
    if (p < 0) { this.send(cid, { t: 'full' }); return; }
    this.takeSeat(p, who);
  }
  sit(cid, m) {
    const s = this.seatOf(cid), p = m.seat;
    if (s === 0 || p === s || !this.seats[p] || this.seats[p].kind !== 'ai' || this.seats[p].host) return;
    const c = this.conns.get(cid);
    const who = s >= 0 ? this.seats[s] : { kind: 'guest', name: cleanName(m.name), cid, pid: c.pid };
    if (s >= 0) this.freeSeat(s);
    c.mira = null;   // si estaba mirando, ahora juega
    this.takeSeat(p, { ...who, cid });
  }
  // llegó la respuesta del servidor de cuentas: el lugar de esa conexión queda con su cuenta y su apodo
  conCuenta(cid, u) {
    const c = this.conns.get(cid);
    if (!c || !u || typeof u.id !== 'number') return;
    c.uid = u.id; c.apodo = cleanName(u.apodo); c.racha = u.racha | 0;
    if (this.key && this.vetado(c)) { this.send(cid, { t: 'vetado' }); this.io.close(cid); this.onClose(cid); return; }
    const p = this.seatOf(cid);
    if (p < 0) { if (c.mira) { c.mira.name = c.apodo; this.broadcast(this.lobbyMsg()); } return; }
    this.seats[p].uid = u.id; this.seats[p].racha = c.racha;
    if (this.started && this.GM) { if (!this.GM.rachas) this.GM.rachas = Array(this.GM.n).fill(0); this.GM.rachas[p] = c.racha; this.publish(); }
    if (!this.started) this.seats[p].name = c.apodo;
    this.notarCuenta(p);
    this.lobbyChanged();
  }
  notarCuenta(p) {
    const s = this.seats[p];
    if (!this.started || !s || !s.uid || s.kind === 'ai') return;
    const c = this.cuentas.get(s.uid);
    if (c) { c.equipo = team(p); c.abandono = false; }
    else this.cuentas.set(s.uid, { equipo: team(p), abandono: false, stats: { manos: 0, manosGanadas: 0, envidos: 0, flores: 0, trucos: 0, faltas: 0, falta37: 0 } });
  }
  // se cortó: con el partido empezado, el lugar queda a su nombre RESERVA_MS (sin conexión; si le toca, su reloj sigue y
  // al vencer decide la computadora como siempre); después lo toma la computadora y corre el rato de gracia (GRACIA_MS)
  reservar(s) {
    if (!this.started || !this.GM || this.GM.phase === 'matchEnd') { this.freeSeat(s); this.seFue(s, false); return; }
    this.seats[s].cid = null;
    this.io.clearTimeout(this.reservas.get(s));
    this.reservas.set(s, this.io.setTimeout(() => {
      this.reservas.delete(s);
      const x = this.seats[s];
      if (!x || x.kind === 'ai' || x.cid) return;
      this.freeSeat(s); this.seFue(s, false); this.lobbyChanged(); if (this.started) this.publish();
    }, RESERVA_MS));
  }
  takeSeat(p, who) {
    if (this.reservas.has(p)) { this.io.clearTimeout(this.reservas.get(p)); this.reservas.delete(p); }
    const cc = this.conns.get(who.cid);
    if (this.ausentes.has(p)) { this.io.clearTimeout(this.ausentes.get(p)); this.ausentes.delete(p); }
    this.seats[p] = { kind: who.kind, name: who.name, cid: who.cid, pid: who.pid, uid: (cc && cc.uid) || null, pj: (cc && cc.pj) || null, racha: (cc && cc.racha) || 0 };
    const c = this.conns.get(who.cid); if (c) c.alive = this.pingSeq;
    if (this.started && this.GM) {
      if (!this.GM.humans.includes(p)) this.GM.humans.push(p);
      this.GM.names[p] = who.name;
      if (!this.GM.pjs) this.GM.pjs = Array(this.GM.n).fill(null);
      this.GM.pjs[p] = this.seats[p].pj;
      if (!this.GM.rachas) this.GM.rachas = Array(this.GM.n).fill(0);
      this.GM.rachas[p] = this.seats[p].racha;   // partidos ganados seguidos (se ve 🔥 desde dos)
      this.GM.teamNames = this.GM.n > 2 ? [0, 1].map(t => joinY(this.GM.names.filter((_, q) => team(q) === t))) : this.GM.names.slice();
    }
    this.notarCuenta(p);
    this.lobbyChanged();
    this.sendChatlog(who.cid);
    if (this.started) { this.publish(); if (this.GM && this.GM.phase === 'play') this.step(); else this.endWait(); }
  }
  freeSeat(p) {
    const prev = this.seats[p];
    this.seats[p] = this.started ? { kind: 'ai', name: prev.name, left: true, pid: prev.pid, host: p === 0 && !this.publica, uid: prev.uid || null, pj: prev.pj || null, racha: 0 } : { kind: 'ai', name: AI_NAMES[this.n][p] };
    this.votos.delete(p);
    for (const x of this.conns.values()) if (x.mira) x.mira.echar.delete(p);
    if (this.started && prev.uid && this.cuentas.has(prev.uid)) this.cuentas.get(prev.uid).abandono = true;
    this.ready.delete(p);
    if (this.started && this.GM) {
      if (this.GM.rachas) this.GM.rachas[p] = 0;
      this.GM.humans = this.GM.humans.filter(q => q !== p);
      this.GM.manual[p] = false;   // la computadora juega su lugar sin el modo realista (canta lo que tiene)
      if (this.GM.phase === 'play' && T.actor(this.GM) === p) this.step(); else this.checkReady();
    }
  }
  seatsFor(n, owner) { return Array.from({ length: n }, (_, p) => p === 0 ? owner : { kind: 'ai', name: AI_NAMES[n][p] }); }
  freeSeatFor() {
    const free = this.seats.map((s, p) => s.kind === 'ai' && !s.host ? p : -1).filter(p => p >= 0);
    // en las públicas, al equipo con menos gente (así el que llega juega en contra y el partido cuenta)
    if (this.publica) {
      const gente = t => this.seats.filter((s, q) => team(q) === t && s.kind !== 'ai').length;
      free.sort((a, b) => gente(team(a)) - gente(team(b)) || a - b);
      return free.length ? free[0] : -1;
    }
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
  isOwner(cid) { return !this.publica && this.seats && this.seats[0] && this.seats[0].kind === 'host' && this.seats[0].cid === cid; }
  lobbyMsg() {
    const L = { t: 'lobby', n: this.n, started: this.started, owner: 0, cfg: this.cfg, ...this.miranInfo(), seats: this.seats.map((s, p) => ({ kind: s.kind, name: s.name, cid: s.cid || null, host: p === 0 && !this.publica || undefined, cuenta: s.kind !== 'ai' && !!s.uid || undefined })) };
    if (this.publica) Object.assign(L, { publica: true, votos: [...this.votos], empiezaEn: this.empiezaEn ? Math.max(0, this.empiezaEn - this.io.now()) : null, fin: !!(this.GM && this.GM.phase === 'matchEnd') });
    return L;
  }
  lobbyChanged() { if (!this.seats) return; this.revisarInicio(); this.revisarEchar(); this.broadcast(this.lobbyMsg()); this.save(); this.avisarSalon(); }

  // ---------- mirar el partido ----------
  mirones() { return [...this.conns].filter(([, c]) => c.mira); }
  // quiénes miran (con los lugares que votaron echarlos), cuántos votos hacen falta y quiénes pueden estar en la voz
  miranInfo() {
    return { mirando: this.mirones().map(([, c]) => ({ id: c.mira.id, name: c.mira.name, echar: [...c.mira.echar] })),
      echarCon: Math.floor(this.gente().length / 2) + 1, voces: [...this.conns.values()].map(c => c.vozId).filter(Boolean) };
  }
  mirar(cid) {
    const c = this.conns.get(cid);
    if (!c || !this.seats || c.mira || this.seatOf(cid) >= 0) return;
    if (this.mirones().length >= MAX_MIRAN) { this.send(cid, { t: 'err', msg: 'Ya hay mucha gente mirando esta mesa.' }); return; }
    c.mira = { id: 'm' + Math.random().toString(36).slice(2, 9), name: c.apodo || c.name || 'Alguien', echar: new Set() };
    this.send(cid, { t: 'mirando', id: c.mira.id });
    this.broadcast(this.lobbyMsg());
    this.sendChatlog(cid);
    if (this.started) this.publish();
  }
  // votar (o sacar el voto) para echar a alguien que mira; con la mayoría de las personas sentadas, se va
  echar(s, m) {
    if (s < 0 || !this.seats || this.seats[s].kind === 'ai') return;
    const e = this.mirones().find(([, c]) => c.mira.id === m.id);
    if (!e) return;
    const v = e[1].mira.echar;
    if (m.no) v.delete(s); else v.add(s);
    this.revisarEchar();
    this.broadcast(this.lobbyMsg());
  }
  revisarEchar() {
    const gente = this.gente(), hacen = Math.floor(gente.length / 2) + 1;
    for (const [cid, c] of this.mirones()) {
      for (const p of [...c.mira.echar]) if (!gente.includes(p)) c.mira.echar.delete(p);
      if (gente.length && c.mira.echar.size >= hacen) this.expulsar(cid, c);
    }
  }
  expulsar(cid, c) {
    this.vetados.push({ pid: c.pid || null, uid: c.uid || null });
    if (this.vetados.length > MAX_VETADOS) this.vetados.shift();
    this.send(cid, { t: 'expulsado' });
    this.conns.delete(cid); this.io.close(cid);
    this.broadcast({ t: 'echado', name: c.mira.name });
    this.save();
  }
  vetado(c) { return this.vetados.some(v => (c.pid && v.pid === c.pid) || (c.uid && v.uid === c.uid)); }

  // ---------- irse en medio del partido ----------
  // Quien se va (o se le corta y no vuelve en GRACIA_MS) deja su lugar a la computadora y queda como que
  // abandonó. Si su equipo se queda sin personas y en el otro queda alguien, el partido termina ahí: gana
  // el que se queda (y en el ranking, el que se fue lo pierde).
  seFue(p, aPropósito) {
    const G = this.GM;
    if (!this.started || !G || G.phase === 'matchEnd') return;
    if (this.ausentes.has(p)) { this.io.clearTimeout(this.ausentes.get(p)); this.ausentes.delete(p); }
    if (aPropósito) { this.revisarAbandono(team(p), this.seats[p].name); return; }
    this.ausentes.set(p, this.io.setTimeout(() => {
      this.ausentes.delete(p);
      const s = this.seats[p];
      if (s && s.kind === 'ai' && s.left) this.revisarAbandono(team(p), s.name);
    }, GRACIA_MS));
  }
  revisarAbandono(t, nombre) {
    const G = this.GM;
    if (!this.started || !G || G.phase === 'matchEnd') return;
    const gente = q => this.seats.some((s, p) => team(p) === q && s.kind !== 'ai' && s.cid && this.conns.has(s.cid));
    if (gente(t) || !gente(1 - t)) return;     // le queda gente al equipo, o no queda nadie para ganar
    this.terminarPorAbandono(1 - t, nombre);
  }
  terminarPorAbandono(ganador, nombre) {
    const G = this.GM, R = G.round;
    this.stopTimers();
    for (const tm of this.ausentes.values()) this.io.clearTimeout(tm);
    this.ausentes.clear();
    const quien = G.n === 2 ? nombre : `${G.teamNames[1 - ganador]}`;
    const texto = `${quien} ${G.n === 2 ? 'abandonó' : 'abandonaron'} el partido: gana ${G.teamNames[ganador]}.`;
    G.log.push({ who: null, text: texto, kind: 'info', round: G.roundNo });
    if (R) { R.result = { reason: 'abandono', texto, winnerTeam: ganador }; R.pending = []; R.canto = null; }
    G.matchWinner = ganador; G.chicoWinner = ganador; G.phase = 'matchEnd';
    this.step();
  }

  // ---------- mesas públicas ----------
  gente() { return this.seats ? this.seats.map((s, p) => s.kind !== 'ai' && s.cid && this.conns.has(s.cid) ? p : -1).filter(p => p >= 0) : []; }
  votar(s, m) {
    if (!this.publica || s < 0 || (this.started && this.GM && this.GM.phase !== 'matchEnd')) return;
    if (m.si === false) this.votos.delete(s); else this.votos.add(s);
    this.lobbyChanged();
  }
  // empieza sola cuando se llena, o cuando todos los que están (dos o más) quieren empezar
  revisarInicio() {
    if (!this.publica) return;
    const libre = !this.started || (this.GM && this.GM.phase === 'matchEnd');
    const g = this.gente(), lleno = g.length === this.n, todos = g.length >= 2 && g.every(p => this.votos.has(p));
    if (libre && (lleno || todos)) {
      if (this.cuentaT) return;
      this.empiezaEn = this.io.now() + CUENTA_ATRAS;
      this.cuentaT = this.io.setTimeout(() => {
        this.cuentaT = null; this.empiezaEn = null;
        const g2 = this.gente(), sigue = (!this.started || (this.GM && this.GM.phase === 'matchEnd')) && (g2.length === this.n || (g2.length >= 2 && g2.every(p => this.votos.has(p))));
        if (sigue) { this.votos = new Set(); this.startMatch({ speed: 'normal', level: 'normal' }); }
        else this.lobbyChanged();
      }, CUENTA_ATRAS);
    } else if (this.cuentaT) { this.io.clearTimeout(this.cuentaT); this.cuentaT = null; this.empiezaEn = null; }
  }
  // le cuenta al salón de mesas públicas cómo está esta mesa (para la lista de "esperando gente")
  avisarSalon(ya) {
    if (!this.publica || !this.io.salon || !this.code) return;
    const mandar = () => {
      this.salonT = null;
      const g = this.gente();
      const G = this.GM, fin = !!(this.started && G && G.phase === 'matchEnd');
      const info = { codigo: this.code, n: this.n, personas: g.length, nombres: g.map(p => this.seats[p].name), empezada: this.started, cfg: this.cfg,
        fin, tanto: this.started && G ? G.scores.slice() : null, mirando: this.mirones().length };
      try { Promise.resolve(this.io.salon(info)).catch(() => {}); } catch (e) {}
    };
    if (ya) { this.io.clearTimeout(this.salonT); mandar(); return; }
    if (!this.salonT) this.salonT = this.io.setTimeout(mandar, 400);
  }

  // ---------- el partido ----------
  startMatch(m) {
    const n = this.n, names = this.seats.map(s => s.name);
    const humans = this.seats.map((s, p) => s.kind === 'ai' ? -1 : p).filter(p => p >= 0);
    const teamNames = n === 2 ? names.slice() : [0, 1].map(t => joinY(names.filter((_, q) => team(q) === t)));
    // el resto de las reglas, las del dueño (en la pública, las de siempre); las de la mesa mandan
    const rules = {};
    const want = !this.publica && m.rules && typeof m.rules === 'object' ? m.rules : {};
    for (const k in T.DEFAULT_RULES) if (k in want && typeof want[k] === typeof T.DEFAULT_RULES[k]) rules[k] = want[k];
    Object.assign(rules, { target: this.cfg.target, chicosToWin: this.cfg.chicos, achique: this.cfg.achique });
    this.speed = SPEEDS[m.speed] ? m.speed : 'normal';
    this.level = LEVELS.includes(m.level) ? m.level : 'normal';
    this.stopTimers();
    this.GM = T.newMatch({ players: n, names, humans, rules, manual: this.seats.map(s => s.kind !== 'ai'), teamNames });
    this.GM.pjs = this.seats.map(s => s.pj || null);
    this.GM.rachas = this.seats.map(s => s.kind !== 'ai' && s.uid ? s.racha || 0 : 0);   // los personajes 3D de cada uno (los de la computadora, por su nombre)
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
        const E = R.envido && R.envido.result;   // falta envido querida y ganada (y si la ganó él con 37)
        if (E && E.accepted && E.falta && E.team === t && !E.vencido) { st.faltas = (st.faltas || 0) + 1; if (E.winner === p && R.envPts && R.envPts[p] === 37) st.falta37 = (st.falta37 || 0) + 1; }
      });
    }
    if (G.phase === 'matchEnd' && !this.registrado) {
      this.registrado = true;
      if (this.publica) this.lobbyChanged();       // que todos vean que terminó (y puedan pedir otro partido)
      if (!this.io.registrar || ![0, 1].every(t => [...this.cuentas.values()].some(c => c.equipo === t))) return;
      const equipos = [0, 1].map(t => this.seats.map((s, p) => team(p) === t ? { nombre: s.name, cuenta: s.kind !== 'ai' && s.uid || null, compu: s.kind === 'ai' } : null).filter(Boolean));
      const tanteador = G.chicosToWin > 1 ? `${G.chicos[0]} a ${G.chicos[1]} en chicos` : `${G.scores[0]} a ${G.scores[1]}`;
      const resumen = { id: G.id, n: G.n, ganador: G.matchWinner, tanteador, equipos,
        cuentas: [...this.cuentas].map(([uid, c]) => ({ uid, equipo: c.equipo, abandono: c.abandono, stats: c.stats })) };
      this.anotarResultado(resumen);
    }
  }
  // ---------- el resultado del partido, para el ranking ----------
  // Queda guardado como pendiente (con la mesa) y se reintenta hasta que las cuentas contesten; las cuentas lo aplican
  // una sola vez por id de partido y en una transacción, así que reintentar nunca lo anota dos veces. Si la mesa se
  // duerme o se reinicia en el medio, lo vuelve a mandar al despertar (constructor y alarma del Durable Object).
  anotarResultado(resumen) { this.pendiente = resumen; this.intentos = 0; this.saveNow(); this.enviarResultado(); }
  enviarResultado() {
    const r0 = this.pendiente;
    if (!r0 || this.enviando || !this.io.registrar) return;
    this.enviando = true; this.intentos++;
    Promise.resolve().then(() => this.io.registrar(r0)).then(r => {
      this.enviando = false;
      if (!r || typeof r !== 'object') throw new Error('sin respuesta');
      // contestó (anotado, repetido o que no corresponde): ya no está pendiente
      if (this.pendiente === r0) { this.pendiente = null; this.saveNow(); if (!this.conns.size) this.io.idle(); }
      this.log({ ev: 'resultado', estado: r.anotado ? 'anotado' : 'no anotado', por: r.por || undefined, intentos: this.intentos });
      if (!r.anotado) return;
      // a cada uno, cómo le fue en el ranking
      for (const j of r.jugadores || []) {
        const p = this.seats ? this.seats.findIndex(s => s.kind !== 'ai' && s.uid === j.uid) : -1;
        if (p >= 0) { this.seats[p].racha = j.racha | 0; const cc = this.conns.get(this.seats[p].cid); if (cc) cc.racha = j.racha | 0; }
        if (p >= 0 && this.seats[p].cid) this.send(this.seats[p].cid, { t: 'ranking', ...j });
      }
    }).catch(() => {
      this.enviando = false;
      const ms = Math.min(5 * 60e3, 5000 * 2 ** Math.min(6, this.intentos - 1));   // 5 s, 10 s, 20 s… hasta 5 min
      this.log({ ev: 'resultado', estado: 'reintento', intentos: this.intentos, enSegundos: Math.round(ms / 1000) });
      this.io.clearTimeout(this.resT);
      this.resT = this.io.setTimeout(() => { this.resT = null; this.enviarResultado(); }, ms);
      if (this.io.despertar) this.io.despertar(ms + 1000);   // por si el Durable Object se duerme antes
    });
  }
  // para los registros de Cloudflare: solo totales y estados, nunca nombres ni códigos
  log(o) { if (this.io.log) try { this.io.log(o); } catch (e) {} }
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
    const a = AI.porTiempo(G, c.p, { samples: G.n === 6 ? 40 : G.n === 4 ? 60 : 160, level: 'normal' });
    if (a.type !== 'vencido') G.log.push({ who: null, text: `A ${G.names[c.p]} se le acabó el tiempo: decidió la computadora.`, kind: 'info', round: G.roundNo });
    try { T.apply(G, c.p, a); } catch (e) { return; }
    this.step();
  }
  // fin de mano: se sigue cuando todos tocan "Siguiente mano", o solo a los 15 segundos
  endWait() {
    const G = this.GM;
    if (G && G.phase === 'matchEnd') this.avisarSalon();   // terminó: sale de la lista de partidos para mirar
    if (!G || G.phase === 'play' || G.phase === 'matchEnd') return;
    const k = roundKey(G);
    if (this.endKey === k) return;
    this.endKey = k; this.endAt = this.io.now();
    this.avisarSalon();   // el tanteador de la lista
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
      G.humans.forEach(p => { G.manual[p] = true; });   // quien volvió a su lugar, otra vez en modo realista
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
    // los que miran: una sola vista, la de alguien sin lugar (ninguna carta sin jugar, ninguna seña)
    const miran = this.mirones();
    if (miran.length) {
      const view = TV.viewFor(G, -1);
      for (const [cid] of miran) this.send(cid, { t: 'state', seat: -1, mira: true, view, actor: act, legal: [], key, waiting, paused: false, host, clock, endLeft });
    }
  }

  // ---------- chat ----------
  chatIn(cid, s, m) {
    const c = this.conns.get(cid), now = this.io.now();
    if (now - c.chatAt < 600) return;
    c.chatAt = now;
    const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!text || !this.seats) return;
    const msg = { p: s, name: s >= 0 ? this.seats[s].name : c.mira ? c.mira.name : cleanName(m.name), text };
    if (s < 0 && c.mira) msg.m = c.mira.id;   // lo dijo alguien que mira
    this.chat.push(msg); if (this.chat.length > 80) this.chat.shift();
    this.broadcast({ t: 'chat', ...msg });
    this.save();
  }
  sendChatlog(cid) { if (cid && this.chat.length) this.send(cid, { t: 'chatlog', list: this.chat.slice(-40) }); }

  // ---------- latidos: quien no contesta tres seguidas se fue ----------
  heartbeat() {
    const seq = ++this.pingSeq;
    if (this.publica && seq % 15 === 0) this.avisarSalon();   // sigue esperando gente (o jugando): que no la den por perdida
    for (const [cid, c] of this.conns) {
      if (seq - c.alive > 3) { this.io.close(cid); this.onClose(cid); continue; }
      this.send(cid, { t: 'ping', s: seq });
    }
  }

  // ---------- cerrar ----------
  closeTable() {
    this.broadcast({ t: 'closed' });
    if (this.publica && this.io.salon) try { Promise.resolve(this.io.salon({ codigo: this.code, personas: 0 })).catch(() => {}); } catch (e) {}
    this.stopTimers();
    this.key = null; this.GM = null; this.started = false; this.seats = null; this.chat = []; this.vetados = [];
    for (const cid of [...this.conns.keys()]) this.io.close(cid);
    this.conns.clear();
    this.io.clearInterval(this.beat); this.beat = null;
    this.io.end();
  }
  stopTimers() { for (const tm of (this.ausentes || new Map()).values()) this.io.clearTimeout(tm); if (this.ausentes) this.ausentes.clear();
    for (const tm of this.reservas.values()) this.io.clearTimeout(tm); this.reservas.clear();
    this.stopTimers0(); }
  stopTimers0() { this.io.clearTimeout(this.timer); this.io.clearTimeout(this.clockT); this.io.clearTimeout(this.endT); this.io.clearTimeout(this.saveT); this.io.clearTimeout(this.cuentaT); this.timer = this.clockT = this.endT = this.saveT = this.cuentaT = null; this.clock = null; this.empiezaEn = null; }

  // ---------- guardar (por si Cloudflare reinicia la mesa) ----------
  data() {
    if (!this.key) return null;
    return { code: this.code, key: this.key, n: this.n, started: this.started, publica: this.publica, cfg: this.cfg, speed: this.speed, level: this.level, chat: this.chat, GM: this.GM,
      seats: (this.seats || []).map(s => ({ kind: s.kind, name: s.name, pid: s.pid || null, left: !!s.left, host: !!s.host, uid: s.uid || null, racha: s.racha || 0 })),
      cuentas: [...this.cuentas], anotada: this.anotada, registrado: this.registrado, vetados: this.vetados, pendiente: this.pendiente || null };
  }
  save() { if (this.saveT) return; this.saveT = this.io.setTimeout(() => { this.saveT = null; this.saveNow(); }, 800); }
  saveNow() { const d = this.data(); if (d) this.io.save(d); }

  send(cid, msg) { if (cid) this.io.send(cid, { v: NETV, code: this.code, from: 'host', ...msg }); }
  broadcast(msg) { for (const cid of this.conns.keys()) this.send(cid, msg); }
}
