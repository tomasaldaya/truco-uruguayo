// ---------- Mesa compartida ----------
// Por internet: los navegadores se encuentran con Trystero (relays públicos de Nostr, sin cuentas ni
// servidor propio) y después hablan directo por WebRTC. El código de la mesa es también la clave
// del encuentro, así que sin el código nadie entra. Sin internet (o con truco.red = 'local') se usa
// BroadcastChannel entre pestañas de este navegador, que es como se prueba acá.
// El anfitrión tiene el partido completo (GM): corre el motor y a la computadora, valida cada jugada
// con el motor y le manda a cada invitado su vista recortada (TV.viewFor), así nadie recibe cartas
// ajenas. El invitado solo dibuja lo que le llega y manda sus jugadas, sus señas y "listo".
// Mensajes: hello, sit, bye, act, senas, ready, pref, pong (invitado → anfitrión);
//           lobby, state, err, full, closed, away, ping (anfitrión → invitados; con "to" si es para uno solo).
// Chat y voz: chat, talk (invitado → anfitrión, que los reparte a todos), chatlog (al que llega).
const NETV = 1, AI_NAMES = { 2: ['Vos', 'Computadora'], 4: ['Vos', 'Tito', 'Pocho', 'Nacho'], 6: ['Vos', 'Tito', 'Pocho', 'Nacho', 'Lalo', 'Beto'] };
const APP_ID = 'tomasaldaya/truco-uruguayo/1';
// Relevo para redes que no dejan conectarse directo (datos del celular, redes de empresa). Ejemplo:
// [{ urls: 'turn:global.relay.metered.ca:80', username: '...', credential: '...' }]
const NET_TURN = [];
let netNote = '';   // aviso para mostrar en la pantalla de inicio (mesa cerrada, código inexistente...)
let joinCode = '';  // código ya escrito en "Unirme a una mesa" (por ejemplo, el del link de invitación)
const netOK = () => typeof BroadcastChannel !== 'undefined' || typeof Trystero !== 'undefined';
const netMode = () => store.get('truco.red') === 'local' || typeof Trystero === 'undefined' || typeof RTCPeerConnection === 'undefined' ? 'local' : 'internet';
const online = () => !!(NET && NET.tr && (NET.tr.kind === 'internet' || NET.tr.kind === 'server'));
// Servidor de mesas (Cloudflare): cada mesa vive ahí y nadie tiene que dejar una pestaña abierta. Si
// la página se abre desde el mismo servidor, es la misma dirección; desde GitHub Pages, SERVIDOR.
// Si el servidor no contesta, se vuelve a la conexión directa entre navegadores.
const SERVIDOR = 'https://truco-uruguayo.tomasaldaya.workers.dev';
function serverURL(){
  const o = store.get('truco.servidor');                // para pruebas: una dirección, o 'no'
  if (o) return o === 'no' ? '' : o;
  if (/^https?:$/.test(location.protocol) && (/\.workers\.dev$/.test(location.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) return location.origin;
  return SERVIDOR;
}
const serverOK = () => !!serverURL() && typeof WebSocket !== 'undefined';
// identificador de esta pestaña para el servidor (para recuperar el lugar al volver)
function myPid(){ let p = null; try { p = sessionStorage.getItem('truco.pid'); if (!p) { p = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('truco.pid', p); } } catch (e) { p = p || 'p' + Math.random().toString(36).slice(2); } return p; }
function openServerTransport(code, onMsg, onLink){
  const url = serverURL().replace(/^http/, 'ws') + '/api/mesa/' + code;
  let ws = null, closed = false, tries = 0;
  const tr = {
    kind: 'server',
    post: m => { if (ws && ws.readyState === 1) try { ws.send(JSON.stringify(m)); } catch (e) {} },
    close: () => { closed = true; try { if (ws) ws.close(); } catch (e) {} },
  };
  const connect = () => {
    if (closed) return;
    try { ws = new WebSocket(url); } catch (e) { onLink('fail'); return; }
    ws.onopen = () => { tries = 0; onLink('open'); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMsg(m); };
    ws.onclose = () => { ws = null; if (closed) return; onLink('down'); setTimeout(connect, Math.min(10000, 800 * Math.pow(2, tries++))); };
  };
  connect();
  return tr;
}
// la voz sigue yendo directo entre navegadores: con el servidor, se abre una sala aparte solo para eso
function voiceRoom(code){
  if (typeof Trystero === 'undefined' || typeof RTCPeerConnection === 'undefined' || store.get('truco.red') === 'local') return null;
  const relays = (store.get('truco.relays') || '').split(',').filter(Boolean);
  try {
    const room = Trystero.joinRoom({ appId: APP_ID, identity: 'none', password: 'voz-' + code, ...(relays.length ? { relayConfig: { urls: relays } } : {}), ...(NET_TURN.length ? { turnConfig: NET_TURN } : {}) }, 'voz-' + code);
    room.onPeerStream((stream, c) => vozAttach(c.peerId, stream));
    room.onPeerJoin(c => { if (VOZ.stream) try { room.addStream(VOZ.stream, { target: c.peerId }); } catch (e) {} });
    room.onPeerLeave(c => vozDetach(c.peerId));
    room.onError(() => {});
    return room;
  } catch (e) { return null; }
}
const vozRoom = () => NET && (NET.vr || (NET.tr && NET.tr.room)) || null;
// el nombre se recuerda, y cada pestaña tiene el suyo (para probar con varias pestañas a la vez)
// la cuenta de quien juega (cuentas.part.js): con cuenta, el nombre en las mesas es su apodo
const guardado = k => { try { return JSON.parse(store.get(k) || 'null'); } catch (e) { return null; } };
const CUENTA = { token: store.get('truco.sesion') || null, yo: guardado('truco.yo'), cfg: guardado('truco.cfg'), ws: null, amigos: null };
function myName(){ if (CUENTA.token && CUENTA.yo) return CUENTA.yo.apodo; let s = null; try { s = sessionStorage.getItem('truco.nombre'); } catch (e) {} return (s !== null ? s : store.get('truco.nombre') || '').trim(); }
function setMyName(v){ v = (v || '').trim().slice(0, 20); try { sessionStorage.setItem('truco.nombre', v); } catch (e) {} store.set('truco.nombre', v); }
function newCode(){ const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)]; return s; }
function netPost(msg){
  if (!NET || !NET.tr || NET.mute) return;
  msg.v = NETV; msg.code = NET.code; msg.from = NET.role === 'host' ? 'host' : NET.cid;
  // el invitado le habla solo al anfitrión; el anfitrión, a uno ("to") o a todos
  const to = NET.role === 'host' ? msg.to : NET.hostPeer;
  try { NET.tr.post(msg, to); } catch (e) {}
}
function netSend(msg){ netPost(msg); }
// cómo viajan los mensajes: por internet (Trystero) o entre pestañas (BroadcastChannel)
function openTransport(code, onMsg, onPeer){
  if (netMode() === 'local') {
    const ch = new BroadcastChannel('truco-mesa-' + code);
    ch.onmessage = e => onMsg(e.data, e.data && e.data.from);
    return { kind: 'local', post: m => ch.postMessage(m), close: () => ch.close() };
  }
  const relays = (store.get('truco.relays') || '').split(',').filter(Boolean);   // para pruebas
  const room = Trystero.joinRoom({
    appId: APP_ID, identity: 'none', password: 'truco-' + code,
    ...(relays.length ? { relayConfig: { urls: relays } } : {}),
    ...(NET_TURN.length ? { turnConfig: NET_TURN } : {}),
  }, 'mesa-' + code);
  const act = room.makeAction('m');
  act.onMessage((m, c) => onMsg(m, c.peerId));
  room.onPeerJoin(c => onPeer('join', c.peerId));
  room.onPeerLeave(c => onPeer('leave', c.peerId));
  room.onError(e => onPeer('error', e.peerId, e));
  room.onPeerStream((stream, c) => onPeer('stream', c.peerId, stream));   // voz
  return {
    kind: 'internet', room,
    self: room.getSelf().then(x => x.peerId),
    post: (m, to) => { act.send(m, to ? { target: to } : undefined).catch(() => {}); },
    close: () => { room.leave().catch(() => {}); },
  };
}
function openNet(role, code, kind){
  const me = NET = { role, code, cid: role === 'host' ? 'host' : 'g' + Math.random().toString(36).slice(2, 10), prefs: {}, ready: new Set(), readyKey: null, hostPeer: null, lastHost: Date.now(), alive: {}, pingSeq: 0, chat: [], chatAt: {}, talking: {} };
  if (kind === 'server') {
    me.tr = openServerTransport(code, m => { if (NET === me && !me.mute && m && m.v === NETV && m.code === code) onGuestMsg(m); }, ev => { if (NET === me) onServerLink(ev); });
    me.vr = voiceRoom(code);
    setTimeout(renderChat, 0);
    me.beat = setInterval(() => { if (NET === me && !me.mute) heartbeat(); }, 4000);
    return;
  }
  me.tr = openTransport(code, (m, peer) => {
    if (NET !== me || me.mute || !m || m.v !== NETV || m.code !== code) return;
    if (me.tr.kind === 'internet') {
      if (role === 'host') m.from = peer;          // quién manda lo dice la conexión, no el mensaje
      else {
        if (m.from !== 'host' || (me.hostPeer && me.hostPeer !== peer)) return;
        if (me.hostPeer !== peer) { me.hostPeer = peer; }
      }
    }
    role === 'host' ? onHostMsg(m) : onGuestMsg(m);
  }, (ev, peer, err) => { if (NET === me) onPeerEvent(ev, peer, err); });
  setTimeout(renderChat, 0);
  if (me.tr.self) me.tr.self.then(id => { if (role === 'guest') me.cid = id; me.ready0 = true; if (me.onSelf) me.onSelf(); });
  me.beat = setInterval(() => { if (NET === me && !me.mute) heartbeat(); }, 4000);
}
// llegó o se fue alguien de la sala (solo por internet)
const NET_ERR = {
  relay: 'No me pude conectar al servicio que usa el juego para encontrar la mesa. Revisá tu conexión a internet.',
  p2p: 'Encontré la mesa pero no pude conectarme. Pasa con algunas redes, sobre todo con datos del celular: probá desde un wifi.',
};
function onPeerEvent(ev, peer, err){
  if (ev === 'stream') { vozAttach(peer, err); return; }
  if (ev === 'join' && VOZ.stream && vozRoom()) try { vozRoom().addStream(VOZ.stream, { target: peer }); } catch (e) {}
  if (ev === 'leave') vozDetach(peer);
  if (ev === 'error') {
    const k = err && err.code === 'relay-failed' ? 'relay' : err && err.code === 'peer-connect-failed' && NET.role === 'guest' && !NET.lobby ? 'p2p' : null;
    if (k) { NET.netErr = k; if (!$('home').hidden && homeView === 'lobby') renderHome(); }
    return;
  }
  if (NET.role === 'host') {
    if (ev === 'leave') { const s = seatOfCid(peer); if (s >= 0) { freeSeat(s); lobbyChanged(); } }
    return;
  }
  if (ev === 'join' && (!NET.hostPeer || NET.hostPeer === peer)) sayHello(peer);
  if (ev === 'leave' && peer === NET.hostPeer) { NET.hostPeer = null; NET.hostLost = true; netStatus(); }
}
function serverHello(){
  if (!NET || NET.tr.kind !== 'server') return;
  NET.tr.post({ t: 'hello', v: NETV, code: NET.code, from: NET.cid, name: NET.name, pid: myPid(), realista, key: NET.ownerKey || undefined, crear: NET.crear || undefined, token: CUENTA.token || undefined });
}
// el servidor se cortó o volvió (se reconecta solo)
function onServerLink(ev){
  if (ev === 'down') { NET.hostLost = true; netStatus(); }
}
function sayHello(peer){
  if (NET && NET.tr.kind === 'server') return serverHello();
  const go = () => { if (!NET || NET.role !== 'guest') return; try { NET.tr.post({ t: 'hello', name: NET.name, realista, v: NETV, code: NET.code, from: NET.cid }, peer || NET.hostPeer); } catch (e) {} };
  if (!NET.tr.self || NET.ready0) go(); else NET.onSelf = go;
}
// el anfitrión pregunta "¿seguís ahí?" cada 4 segundos; quien no contesta tres seguidas se fue
// (cuenta por preguntas y no por tiempo: si la pestaña del anfitrión queda en segundo plano y el
// navegador frena sus relojes, nadie queda afuera por eso)
function heartbeat(){
  if (NET.role === 'host') {
    const seq = ++NET.pingSeq;
    NET.seats.forEach((s, p) => {
      if (s.kind !== 'guest') return;
      if (NET.alive[s.cid] === undefined) NET.alive[s.cid] = seq - 1;
      if (seq - NET.alive[s.cid] > 3) { delete NET.alive[s.cid]; freeSeat(p); lobbyChanged(); }
    });
    netPost({ t: 'ping', s: seq });
    return;
  }
  const lost = Date.now() - NET.lastHost > 15000;
  if (lost !== !!NET.hostLost && (NET.lobby || G)) { NET.hostLost = lost; netStatus(); }
}
// aviso de conexión para el invitado
function netStatus(){
  if (!$('home').hidden) { if (homeView === 'lobby') renderHome(); }
  else render();
}
function leaveNet(soft){
  if (!NET) return;
  if (!soft) { if (NET.role === 'host') netPost({ t: 'closed' }); else netPost({ t: 'bye' }); }
  else if (NET.role === 'host') netPost({ t: 'away' }); else netPost({ t: 'bye' });
  clearTimeout(NET.helloT); clearInterval(NET.beat);
  vozStop();
  const tr = NET.tr, vr = NET.vr;
  setTimeout(() => { try { tr.close(); } catch (e) {} try { if (vr) vr.leave().catch(() => {}); } catch (e) {} }, soft ? 0 : 300);   // que llegue el último aviso
  if (!soft) { netForget(); if (invitedCode()) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  NET = null; ME = 0;
  // vuelve el partido que tenías guardado jugando solo (si había)
  clearTimeout(timer); busy = false; deferred = null; closeModal();
  GM = loadSavedGame(); G = null; refreshView();
  needStep = !!GM;
  renderChat();
}
// al recargar o cerrar la página: se avisa, pero la mesa queda anotada en esta pestaña para volver
window.addEventListener('pagehide', () => { if (NET) { netRemember(); leaveNet(true); } });

// ---------- Volver a la mesa al recargar la página ----------
// La pestaña anota en qué mesa está (sessionStorage: dura mientras la pestaña exista, aunque se
// recargue o el celular la duerma). El anfitrión guarda además el partido, y los invitados
// recuperan su lugar al volver a entrar con su nombre.
function netRemember(){
  if (!NET) return;
  try {
    const d = NET.role === 'host'
      ? { role: 'host', code: NET.code, n: NET.n, started: NET.started, seats: NET.seats.map(s => s.kind === 'guest' ? { kind: 'ai', name: s.name, left: true } : s), prefs: NET.prefs, G: NET.started ? GM : null, at: Date.now() }
      : { role: 'guest', code: NET.code, name: NET.name, key: NET.ownerKey || null, server: NET.tr.kind === 'server', publica: !!NET.publica, at: Date.now() };
    sessionStorage.setItem('truco.mesa', JSON.stringify(d));
  } catch (e) {}
}
function netForget(){ try { sessionStorage.removeItem('truco.mesa'); } catch (e) {} }
function netRestore(){
  let d = null;
  try { d = JSON.parse(sessionStorage.getItem('truco.mesa') || 'null'); } catch (e) {}
  if (!d || Date.now() - d.at > 6 * 3600e3) { netForget(); return false; }
  if (d.role === 'guest') { joinTable(d.code, d.name, true, d.publica ? { publica: true } : d.server ? (d.key ? { key: d.key } : {}) : { p2p: true }); return true; }
  openNet('host', d.code);
  NET.n = d.n; NET.seats = d.seats; NET.prefs = d.prefs || {}; NET.started = !!(d.started && d.G);
  if (NET.started) {
    GM = d.G; if (GM.phase === 'play') T.legal(GM, T.actor(GM));
    GM.humans = [0]; needStep = true;
  }
  return true;
}

// ---------- Link para invitar ----------
const inviteURL = code => /^https?:$/.test(location.protocol) ? location.origin + location.pathname + '#mesa=' + code : '';
function invitedCode(){ const m = /mesa=([A-Za-z]{4})/.exec(location.hash || ''); return m ? m[1].toUpperCase() : ''; }

// ---------- Anfitrión ----------
function hostTable(n, p2p, publica){
  leaveNet();
  if (publica) {            // mesa pública: solo en el servidor y con cuenta
    const key = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    joinTable(newCode(), myName(), false, { key, crear: { n, key, publica: true }, publica: true });
    return;
  }
  if (serverOK() && !p2p) {
    const key = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    joinTable(newCode(), myName() || 'Anfitrión', false, { key, crear: { n, key } });
    return;
  }
  openNet('host', newCode());
  NET.n = n; NET.started = false;
  NET.seats = seatsFor(n);
  homeView = 'lobby'; renderHome();
}
function seatsFor(n){ return Array.from({ length: n }, (_, p) => p === 0 ? { kind: 'host', name: myName() || 'Anfitrión' } : { kind: 'ai', name: AI_NAMES[n][p] }); }
function setTableMode(n){
  if (!NET || NET.role !== 'host' || NET.started || NET.n === n) return;
  const guests = NET.seats.filter(s => s.kind === 'guest');
  NET.n = n; NET.seats = seatsFor(n);
  guests.forEach(g => { const p = freeSeatFor(); if (p >= 0) NET.seats[p] = g; else netPost({ t: 'full', to: g.cid }); });
  lobbyChanged();
}
// para alguien que llega: primero de compañero del anfitrión, si no, donde haya lugar
function freeSeatFor(){
  const free = NET.seats.map((s, p) => s.kind === 'ai' ? p : -1).filter(p => p >= 0);
  return free.find(p => team(p) === 0) ?? (free.length ? free[0] : -1);
}
const seatOfCid = cid => NET.seats.findIndex(s => s.kind === 'guest' && s.cid === cid);
function lobbyMsg(){ return { t: 'lobby', n: NET.n, started: NET.started, seats: NET.seats.map(s => ({ kind: s.kind, name: s.name, cid: s.cid || null })) }; }
function lobbyChanged(){ netPost(lobbyMsg()); netRemember(); if (!$('home').hidden && homeView === 'lobby') renderHome(); }

function onHostMsg(m){
  if (m.from === 'host') return;
  const g = m.from, s = seatOfCid(g);
  switch (m.t) {
    case 'hello': {
      if (s >= 0) { netPost(lobbyMsg()); if (NET.started) publish(); return; }
      const who = { kind: 'guest', cid: g, name: cleanName(m.name) };
      if (NET.started) {
        // partido empezado: si vuelve alguien que se había ido, recupera su lugar; si no, elige uno libre
        const back = NET.seats.findIndex(x => x.kind === 'ai' && x.left && x.name === who.name);
        if (back >= 0) takeSeat(back, who, m.realista); else netPost(lobbyMsg());
        return;
      }
      const p = freeSeatFor();
      if (p < 0) { netPost({ t: 'full', to: g }); return; }
      takeSeat(p, who, m.realista);
      return;
    }
    case 'sit': {
      const p = m.seat;
      if (p === s || !NET.seats[p] || NET.seats[p].kind !== 'ai') return;
      const who = s >= 0 ? NET.seats[s] : { kind: 'guest', cid: g, name: cleanName(m.name) };
      if (s >= 0) freeSeat(s);
      takeSeat(p, who, m.realista);
      return;
    }
    case 'bye': if (s >= 0) { freeSeat(s); lobbyChanged(); } return;
    case 'act': {
      if (s < 0 || !NET.started || !GM || GM.phase !== 'play' || T.actor(GM) !== s) { if (s >= 0 && NET.started) publish(); return; }
      try { T.apply(GM, s, m.a); }
      catch (e) { netPost({ t: 'err', to: g, msg: e.message }); publish(); return; }
      step();
      return;
    }
    case 'senas': if (s >= 0 && NET.started && GM && GM.phase === 'play') { T.setSenas(GM, s, Array.isArray(m.list) ? m.list.filter(k => T.SENAS[k]) : []); render(); } return;
    case 'pedido': if (s >= 0 && NET.started && GM && GM.phase === 'play' && T.PEDIDOS[m.k] && T.pedir(GM, s, m.k)) render(); return;
    case 'ready': if (s >= 0 && NET.started && m.key === roundKey(GM)) { NET.ready.add(s); checkReady(); } return;
    case 'pref': if (s >= 0) NET.prefs[s] = !!m.realista; return;
    case 'chat': {
      const now = Date.now(), name = s >= 0 ? NET.seats[s].name : cleanName(m.name);
      if (now - (NET.chatAt[g] || 0) < 600) return;      // de a un mensaje por vez
      NET.chatAt[g] = now;
      chatAdd({ p: s, name, text: m.text }, true);
      return;
    }
    case 'talk': if (s >= 0) { setTalking(s, !!m.on); netPost({ t: 'talk', p: s, on: !!m.on }); } return;
    case 'pong':
      if (s >= 0) NET.alive[g] = Math.max(NET.alive[g] || 0, m.s);
      else if (m.seated) netPost({ ...lobbyMsg(), to: g });   // se durmió y lo dejé afuera: que se entere y vuelva a entrar
      return;
  }
}
const cleanName = v => (v || '').trim().slice(0, 20) || 'Invitado';
function takeSeat(p, who, realista){
  NET.seats[p] = who;
  if (who.cid && NET.chat.length) netPost({ t: 'chatlog', to: who.cid, list: NET.chat.slice(-40) });
  if (who.cid) NET.alive[who.cid] = NET.pingSeq;
  if (realista !== undefined) NET.prefs[p] = !!realista;
  if (NET.started && GM) {
    if (!GM.humans.includes(p)) GM.humans.push(p);
    GM.names[p] = who.name;
    if (GM.n > 2) GM.teamNames = [0, 1].map(t => joinY(GM.names.filter((_, q) => team(q) === t)));
    else GM.teamNames = GM.names.slice();
  }
  lobbyChanged();
  if (NET.started) { publish(); if (GM && GM.phase === 'play') step(); }
}
// el lugar vuelve a la computadora (si ya empezó, sigue jugando con el nombre de quien estaba)
function freeSeat(p){
  const prev = NET.seats[p];
  NET.seats[p] = NET.started ? { kind: 'ai', name: prev.name, left: prev.kind === 'guest' } : { kind: 'ai', name: AI_NAMES[NET.n][p] };
  NET.ready.delete(p);
  if (NET.started && GM) {
    GM.humans = GM.humans.filter(q => q !== p);
    if (GM.phase === 'play' && T.actor(GM) === p) step(); else checkReady();
  }
}
function startTable(){
  if (!NET || NET.role !== 'host') return;
  const n = NET.n, names = NET.seats.map(s => s.name);
  const humans = NET.seats.map((s, p) => s.kind === 'ai' ? -1 : p).filter(p => p >= 0);
  const teamNames = n === 2 ? names.slice() : [0, 1].map(t => joinY(names.filter((_, q) => team(q) === t)));
  clearTimeout(timer); busy = false; deferred = null;
  ME = 0;
  GM = T.newMatch({ players: n, names, humans, rules: tableRules, manual: NET.seats.map((s, p) => p === 0 ? realista : s.kind === 'guest' && !!NET.prefs[p]), teamNames });
  GM.id = newMatchId();
  T.startRound(GM); startRoundHook(); lastRoundNo = null;
  NET.started = true; NET.ready = new Set();
  lobbyChanged();
  hideHome(); step();
}
// a cada invitado, su vista del partido, de quién es el turno y qué puede hacer
function publish(){
  if (!NET || NET.role !== 'host' || !NET.started || !GM) return;
  const act = T.actor(GM), key = roundKey(GM);
  NET.seats.forEach((s, p) => {
    if (s.kind !== 'guest') return;
    netPost({ t: 'state', to: s.cid, seat: p, view: TV.viewFor(GM, p), actor: act, legal: act === p ? T.legal(GM, p) : [], key, waiting: waitingNames(), paused: toolOpen(), host: NET.seats[0].name, clock: clockForGuests(), endLeft: endLeft() });
  });
  netRemember();
}
// Fin de mano: si alguien no toca "Siguiente mano", a los 15 segundos de aparecer el resumen se sigue
// igual, así nadie deja la mesa esperando (con "sin límite" de tiempo, se espera a todos)
const END_WAIT = 17000;   // 15 s con el cartel a la vista, más los 2 s que tarda en aparecer
function netEndWait(){
  if (!GM || !NET.started || GM.phase === 'play' || GM.phase === 'matchEnd') { NET.endKey = null; return; }
  const lim = clockLimit(GM), k = roundKey(GM);
  if (!lim) return;
  if (NET.endKey !== k) { NET.endKey = k; NET.endAt = Date.now(); publish(); return; }   // los invitados ven la cuenta
  if (toolOpen()) { NET.endAt = Date.now(); return; }
  if (Date.now() - NET.endAt > END_WAIT) { NET.seats.forEach((s, p) => { if (s.kind !== 'ai') NET.ready.add(p); }); checkReady(); }
}
// personas que todavía no tocaron "Siguiente mano"
function waitingNames(){ return NET.seats.map((s, p) => s.kind !== 'ai' && !NET.ready.has(p) ? s.name : null).filter(Boolean); }
function showWaiting(list){ const b = $('mNext'); if (b && b.disabled) b.textContent = list.length ? `Esperando a ${joinY(list)}…` : 'Siguiendo…'; }
const roundKey = S => S.roundNo + ':' + (S.round && S.round.duel ? S.round.duel.idx : 0) + ':' + S.phase;
// "Siguiente mano": se sigue cuando todas las personas de la mesa tocaron el botón
function netReady(){
  if (!NET) return;
  if (NET.role === 'guest') { netPost({ t: 'ready', key: NET.key }); return; }
  NET.ready.add(ME); checkReady();
}
function checkReady(){
  if (!NET || NET.role !== 'host' || !GM || GM.phase === 'play' || GM.phase === 'matchEnd') return;
  const humans = NET.seats.map((s, p) => s.kind === 'ai' ? -1 : p).filter(p => p >= 0);
  if (humans.every(p => NET.ready.has(p))) { NET.ready = new Set(); closeModal(); advanceRound(); }
  else { showWaiting(waitingNames()); publish(); }
}

// ---------- Invitado ----------
function joinTable(code, name, back, opts){
  opts = opts || {};
  leaveNet();
  code = (code || '').trim().toUpperCase();
  if (name !== undefined) setMyName(name);
  const viaServer = serverOK() && !opts.p2p;
  openNet('guest', code, viaServer ? 'server' : undefined);
  NET.name = myName() || 'Invitado';
  NET.lobby = null; NET.actor = null; NET.legal = []; NET.shownEnd = null; NET.hadSeat = false;
  NET.ownerKey = opts.publica ? null : opts.key || null; NET.owner = !!opts.key && !opts.publica; NET.crear = opts.crear || null; NET.back = !!back;
  NET.publica = !!opts.publica;
  GM = null; G = null;
  const net = online();
  if (!net) sayHello();   // por internet se saluda al conectarse con cada uno (onPeerEvent); con el servidor, al recibir "hola"
  NET.helloT = setTimeout(() => {
    if (!NET || NET.role !== 'guest' || NET.lobby) return;
    if (viaServer && opts.publica) {   // las públicas existen solo en el servidor
      leaveNet();
      netNote = 'No pude conectarme con el servidor de mesas. Probá de nuevo en un rato.';
      homeView = 'publicas'; renderHome();
      return;
    }
    if (viaServer) {      // el servidor no contestó: como antes, de navegador a navegador
      leaveNet();
      if (opts.crear) hostTable(opts.crear.n, true); else joinTable(code, name, back, { p2p: true });
      return;
    }
    const err = NET.netErr;
    leaveNet();
    netNote = err ? NET_ERR[err] : back ? `No pude volver a la mesa ${code}: puede que se haya cerrado.`
      : net ? `No encontré la mesa ${code}. Revisá el código y que quien la creó la tenga abierta.`
      : `No encontré la mesa ${code}. Revisá el código y que la mesa esté abierta en otra pestaña de este navegador.`;
    joinCode = code; homeView = 'join'; renderHome();
  }, viaServer ? 7000 : net ? 25000 : 1500);
  netRemember();
  homeView = 'lobby'; renderHome();
}
function onGuestMsg(m){
  if (m.from !== 'host' || (m.to && m.to !== NET.cid)) return;
  NET.lastHost = Date.now();
  if (NET.hostLost && m.t !== 'away') { NET.hostLost = false; netStatus(); }
  switch (m.t) {
    case 'ping': netPost({ t: 'pong', s: m.s, seated: NET.seat >= 0 }); return;
    case 'hola': NET.cid = m.cid; serverHello(); return;
    case 'nocuenta': clearTimeout(NET.helloT); leaveNet(); netNote = 'Para las mesas públicas tenés que entrar con tu cuenta.'; homeView = 'publicas'; renderHome(); return;
    case 'nomesa': {         // el servidor no tiene esa mesa: puede ser una mesa de navegador a navegador
      const c = NET.code, nm = NET.name, back = NET.back, owner = NET.owner;
      if (NET.publica) { clearTimeout(NET.helloT); leaveNet(); netNote = `La mesa pública ${c} ya no está.`; homeView = 'publicas'; renderHome(); return; }
      clearTimeout(NET.helloT); leaveNet();
      if (netMode() === 'internet' && !owner) joinTable(c, nm, back, { p2p: true });
      else { netNote = back || owner ? `La mesa ${c} ya no existe.` : `No encontré la mesa ${c}. Revisá el código.`; joinCode = owner ? '' : c; homeView = owner ? 'main' : 'join'; renderHome(); }
      return;
    }
    case 'ocupada': { const cr = NET.crear; leaveNet(); joinTable(newCode(), myName() || 'Anfitrión', false, { key: cr.key, crear: cr, publica: !!cr.publica }); return; }
    case 'lobby': {
      clearTimeout(NET.helloT);
      NET.lobby = m; NET.lobbyAt = Date.now();
      NET.seat = m.seats.findIndex(s => s.cid === NET.cid);
      // si quedé sin lugar con el partido empezado (se cortó un rato), vuelvo a saludar y lo recupero
      if (NET.seat >= 0) NET.hadSeat = true;
      else if (NET.hadSeat && m.started) { NET.hadSeat = false; sayHello(); }
      if (!$('home').hidden && (homeView === 'lobby' || homeView === 'main')) renderHome();
      return;
    }
    case 'state': onState(m); return;
    case 'err': errMsg = m.msg; NET.legal = []; render(); return;
    case 'away': NET.hostLost = true; NET.hostPeer = null; netStatus(); return;   // el anfitrión recarga la página
    case 'chat': chatAdd({ p: m.p, name: m.name, text: m.text }, false); return;
    case 'ranking': cuentaRanking(m); return;
    case 'chatlog': NET.chat = (m.list || []).slice(-80); renderChat(); return;
    case 'talk': setTalking(m.p, !!m.on); return;
    case 'full': leaveNet(); netNote = 'La mesa está completa.'; homeView = 'join'; showHome('join'); return;
    case 'closed': leaveNet(); netNote = 'El anfitrión cerró la mesa.'; showHome(); return;
  }
}
function onState(m){
  const first = !G || !!(m.view && G.id !== m.view.id);     // el primer estado de este partido (o de otro nuevo en la misma mesa)
  ME = m.seat; G = m.view; NET.actor = m.actor; NET.legal = m.legal || []; NET.key = m.key;
  NET.paused = !!m.paused; NET.host = m.host;
  NET.clock = m.clock ? { ...m.clock, at: Date.now() } : null;
  NET.endClock = typeof m.endLeft === 'number' ? { left: m.endLeft, at: Date.now() } : null;
  showWaiting((m.waiting || []).filter(x => x !== G.names[ME]));
  if (m.actor !== ME) errMsg = '';
  notePauses(G);
  if (first && !$('home').hidden && homeView === 'lobby') hideHome();
  render();
  if (!$('home').hidden) return;
  if (G.phase !== 'play') {
    if (NET.shownEnd !== m.key && !$('mNext')) { NET.shownEnd = m.key; const k = m.key; setTimeout(() => { if (NET && NET.key === k && $('home').hidden && !$('mNext')) showRoundEnd(); }, (G.n >= 4 ? 2200 : 1600) * delayScale()); }
  } else if ($('mNext')) closeModal();
}

// ---------- Pantallas: crear, unirse y la mesa antes de empezar ----------
function seatsHTML(seats, opts){
  const mine = p => NET && NET.role === 'guest' ? p === NET.seat : p === 0;
  const row = (s, p) => {
    const who = s.kind === 'ai' ? `${esc(s.name)} <small>(computadora)</small>` : `${esc(s.name)}${s.cuenta ? ' <span class="ccta" title="Tiene cuenta">★</span>' : ''}${s.kind === 'host' ? ' <small>(anfitrión)</small>' : ''}`;
    const sit = opts.canSit && s.kind === 'ai' && !s.host && !mine(p) ? `<button class="tool" data-sit="${p}">Sentarme acá</button>` : '';
    return `<li class="${mine(p) ? 'me' : ''}"><span>${who}${mine(p) ? ' <b>· vos</b>' : ''}</span>${sit}</li>`;
  };
  return '<div class="seats">' + [0, 1].map(t => `<div class="team t${t}"><h3>Equipo ${t === 0 ? 'celeste' : 'bordó'}</h3><ul>${seats.map((s, p) => team(p) === t ? row(s, p) : '').join('')}</ul></div>`).join('') + '</div>';
}
// si el partido va a contar para el ranking (solo en mesas del servidor, con cuentas en los dos equipos)
// irse de una mesa del servidor con el partido en juego lo pierde: se pide confirmar (el botón cambia de texto)
function enJuegoOnline(){ return !!(NET && NET.tr && NET.tr.kind === 'server' && G && G.phase !== 'matchEnd' && NET.seat >= 0); }
function confirmarSalida(btn, salir){
  if (!enJuegoOnline() || btn.dataset.seguro === '1') { salir(); return; }
  btn.dataset.seguro = '1';
  btn.textContent = 'Sí, irme y perder el partido';
  const n = document.createElement('p'); n.className = 'hnote'; n.setAttribute('role', 'alert');
  n.textContent = 'Si te vas ahora, perdés el partido: si tu equipo se queda sin personas, gana el otro, y en el ranking cuenta como abandono.';
  btn.closest('.row, .hlinks').after(n);
}
function rankNote(L){
  if (!NET || !NET.tr || NET.tr.kind !== 'server' || !L || !L.seats || L.started) return '';
  const eq = [0, 1].map(t => L.seats.some((s, p) => team(p) === t && s.cuenta));
  if (eq[0] && eq[1]) return '<p class="hkey rk-si">★ Este partido cuenta para el ranking: hay gente con cuenta en los dos equipos.</p>';
  if (eq[0] || eq[1]) return '<p class="hkey">★ Para que cuente en el ranking tiene que haber alguien con cuenta en cada equipo.</p>';
  return '';
}
function renderPublicLobby(box, L){
  const inv = CUENTA.token && CUENTA.yo ? '<button class="tool" id="hInvAm">Invitar amigos</button>' : '';
  let h = `<div class="hbar"><button class="tool" id="hBack">Volver</button><h2>Mesa pública</h2></div>`;
  if (NET.hostLost) h += '<p class="hnote" role="status">Se cortó la conexión con el servidor. Reconectando…</p>';
  if (!L) {
    h += '<p class="lob">Buscando lugar…</p>';
  } else {
    const g = L.seats.filter(s => s.kind !== 'ai' && s.cid).length, enJuego = L.started && !L.fin;
    const votos = L.votos || [], yoVote = votos.includes(NET.seat);
    const falta = typeof L.empiezaEn === 'number' ? Math.max(1, Math.ceil((L.empiezaEn - (Date.now() - NET.lobbyAt)) / 1000)) : null;
    const estado = enJuego ? 'El partido ya empezó.' : falta ? `<b class="cuenta-atras">¡Arranca en ${falta}…!</b>`
      : L.fin ? 'Terminó el partido. Si todos quieren, juegan otro.' : g < L.n ? `Esperando gente: <b>${g} de ${L.n}</b>. Empieza sola cuando se llena.` : '';
    h += `<p class="lob"><b>${esc(modeName(L.n))}</b>, a 30 puntos y un solo chico. ${estado}</p>
      ${seatsHTML(L.seats, { canSit: !enJuego })}${rankNote(L)}`;
    const btns = [];
    if (!enJuego && g >= 2) btns.push(`<button class="act ${yoVote ? 'sec' : 'flor'}" id="hVote">${yoVote ? 'Ya no' : L.fin ? 'Jugar otro partido' : 'Empezar ya'}</button>`);
    if (enJuego && G) btns.push('<button class="act flor" id="hGo">Volver a la mesa</button>');
    btns.push('<button class="act mazo" id="hClose">Salir de la mesa</button>');
    h += `<div class="row">${btns.join('')}</div>`;
    if (!enJuego && g >= 2) h += `<p class="hkey">${L.fin ? 'Otro partido' : 'Empezar ya, con la computadora en los lugares libres'}: ${votos.length} de ${g} ${g === 1 ? 'quiere' : 'quieren'}. Empieza cuando quieran todos los que están.</p>`;
    else if (!enJuego) h += '<p class="hkey">Cuando llegue alguien más, si todos quieren pueden empezar antes de que se llene: la computadora completa los lugares libres.</p>';
    h += `<div class="hlinks">${inv}</div><p class="hkey">Código de la mesa: <b>${esc(NET.code)}</b>, por si querés pasárselo a alguien.</p>`;
    clearInterval(renderPublicLobby.t);
    if (falta && !enJuego) renderPublicLobby.t = setInterval(() => {
      const el = document.querySelector('.cuenta-atras'), Lb = NET && NET.lobby;
      if (!el || !Lb || typeof Lb.empiezaEn !== 'number') { clearInterval(renderPublicLobby.t); return; }
      el.textContent = `¡Arranca en ${Math.max(1, Math.ceil((Lb.empiezaEn - (Date.now() - NET.lobbyAt)) / 1000))}…!`;
    }, 250);
  }
  h += `<section class="lchat"><h3>Chat de la mesa</h3>${chatUI('lc')}</section>`;
  box.innerHTML = h;
  bindChat('lc'); renderChat();
  $('hBack').onclick = () => { homeView = 'main'; renderHome(); };
  if ($('hInvAm')) $('hInvAm').onclick = () => cuentaIr('amigos', { volver: 'lobby' });
  if ($('hVote')) $('hVote').onclick = () => netPost({ t: 'empezar', si: !(L.votos || []).includes(NET.seat) });
  if ($('hGo')) $('hGo').onclick = () => continueGame();
  if ($('hClose')) $('hClose').onclick = () => confirmarSalida($('hClose'), () => { leaveNet(); homeView = 'main'; renderHome(); });
  box.querySelectorAll('[data-sit]').forEach(b => b.onclick = () => netPost({ t: 'sit', seat: +b.dataset.sit, name: NET.name, realista }));
}
function renderLobby(box){
  if (!NET) { homeView = 'main'; return renderHome(); }
  if (NET.publica) return renderPublicLobby(box, NET.lobby);
  const viaServer = NET.tr && NET.tr.kind === 'server';
  // el dueño de la mesa: el anfitrión de siempre o, con el servidor, el que la creó
  const owner = NET.role === 'host' || NET.owner;
  const L = NET.role === 'host' ? { n: NET.n, started: NET.started, seats: NET.seats } : NET.lobby;
  let h = `<div class="hbar"><button class="tool" id="hBack">Volver</button><h2>Mesa ${esc(NET.code)}</h2></div>`;
  if (NET.netErr) h += `<p class="hnote" role="alert">${NET_ERR[NET.netErr]}</p>`;
  if (NET.hostLost && L) h += `<p class="hnote" role="status">${viaServer ? 'Se cortó la conexión con el servidor. Reconectando…' : `Se cortó la conexión con ${esc((L.seats.find(s => s.kind === 'host') || {}).name || 'el anfitrión')}. Esperando que vuelva…`}</p>`;
  if (owner) {
    const url = online() ? inviteURL(NET.code) : '';
    h += online()
      ? `<p class="lob">Pasale ${url ? 'el link o ' : ''}el código <b class="code">${esc(NET.code)}</b> a quien quiera jugar. Entra desde su navegador, en la compu o en el celular, con "Unirme a una mesa".</p>
        ${url ? `<div class="invite"><input id="hUrl" readonly value="${esc(url)}" aria-label="Link de la mesa"><button class="tool" id="hCopy">Copiar link</button>${navigator.share ? '<button class="tool" id="hShare">Compartir</button>' : ''}</div>` : ''}
        <p class="hkey">${viaServer ? 'La mesa queda en el servidor: podés cerrar esta pestaña o recargar y el partido sigue.' : 'Dejá esta pestaña abierta mientras dure el partido: el partido corre en tu navegador.'}</p>${viaServer && CUENTA.token && CUENTA.yo ? '<div class="hlinks"><button class="tool" id="hInvAm">Invitar amigos</button></div>' : ''}`
      : `<p class="lob">Pasale el código <b class="code">${esc(NET.code)}</b> a quien quiera jugar. Sin internet funciona entre pestañas de este navegador: abrí el juego en otra pestaña, tocá "Unirme a una mesa" y escribí el código.</p>`;
    if (!L) h += '<p class="lob">Abriendo la mesa…</p>';
    else h += `
      <div class="cfg"><label for="hName">Tu nombre</label><input id="hName" maxlength="20" value="${esc(myName())}" placeholder="Anfitrión" ${L.started || CUENTA.yo && CUENTA.token ? 'disabled' : ''}>
      <span class="lbl">Modo</span><div class="seg" role="group" aria-label="Modo">${MODES.map(([n, nm]) => `<button type="button" data-mode="${n}" aria-pressed="${L.n === n}" ${L.started ? 'disabled' : ''}>${nm}</button>`).join('')}</div></div>
      ${seatsHTML(L.seats, { canSit: false })}
      ${rankNote(L)}
      <p class="hkey">Los lugares sin persona los juega la computadora. Si alguien se va en medio del partido, la computadora sigue por él.</p>`;
    h += `<div class="row">${L ? (L.started ? '<button class="act flor" id="hGo">Volver a la mesa</button>' : '<button class="act flor" id="hGo">Empezar partido</button>') : ''}<button class="act mazo" id="hClose">Cerrar la mesa</button></div>`;
  } else {
    if (!L) h += `<p class="lob">Buscando la mesa ${esc(NET.code)}…${online() ? ' Puede tardar unos segundos.' : ''}</p>`;
    else {
      const host = (L.seats.find(s => s.kind === 'host' || s.host) || {}).name || 'el anfitrión';
      const sentado = NET.seat >= 0;
      h += `<p class="lob">${MODES.find(m => m[0] === L.n)[1]}, mesa de ${esc(host)}. ${L.started ? (sentado ? 'El partido ya empezó.' : 'El partido ya empezó: elegí un lugar libre para entrar.') : `Esperando a que ${esc(host)} empiece el partido.`}</p>
        ${seatsHTML(L.seats, { canSit: true })}${rankNote(L)}${viaServer && CUENTA.token && CUENTA.yo ? '<div class="hlinks"><button class="tool" id="hInvAm">Invitar amigos</button></div>' : ''}`;
    }
    h += `<div class="row">${G ? '<button class="act flor" id="hGo">Volver a la mesa</button>' : ''}<button class="act mazo" id="hClose">Salir de la mesa</button></div>`;
  }
  h += `<section class="lchat"><h3>Chat de la mesa</h3>${chatUI('lc')}</section>`;
  box.innerHTML = h;
  if ($('hInvAm')) $('hInvAm').onclick = () => cuentaIr('amigos', { volver: 'lobby' });
  bindChat('lc'); renderChat();
  $('hBack').onclick = () => { homeView = 'main'; renderHome(); };
  if ($('hName')) $('hName').oninput = e => {
    setMyName(e.target.value);
    if (NET && NET.role === 'host' && !NET.started) { NET.seats[0].name = myName() || 'Anfitrión'; netPost(lobbyMsg()); }
    else if (NET && NET.owner) { NET.name = myName() || 'Anfitrión'; netPost({ t: 'name', name: NET.name }); }
  };
  box.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => NET.role === 'host' ? setTableMode(+b.dataset.mode) : netPost({ t: 'mode', n: +b.dataset.mode }));
  box.querySelectorAll('[data-sit]').forEach(b => b.onclick = () => netPost({ t: 'sit', seat: +b.dataset.sit, name: NET.name, realista }));
  if ($('hGo')) $('hGo').onclick = () => {
    if (NET.role === 'host' && !NET.started) startTable();
    else if (NET.owner && L && !L.started) netPost({ t: 'start', rules: tableRules, speed, level });
    else continueGame();
  };
  if ($('hCopy')) $('hCopy').onclick = () => {
    const done = () => { $('hCopy').textContent = 'Copiado'; setTimeout(() => { if ($('hCopy')) $('hCopy').textContent = 'Copiar link'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText($('hUrl').value).then(done, () => { $('hUrl').select(); });
    else { $('hUrl').select(); try { document.execCommand('copy'); done(); } catch (e) {} }
  };
  if ($('hShare')) $('hShare').onclick = () => navigator.share({ title: 'Truco uruguayo', text: `Vení a jugar al truco: mesa ${NET.code}`, url: $('hUrl').value }).catch(() => {});
  if ($('hUrl')) $('hUrl').onfocus = e => e.target.select();
  $('hClose').onclick = () => confirmarSalida($('hClose'), () => { if (NET && NET.owner && !(G && G.phase !== 'matchEnd')) netPost({ t: 'close' }); leaveNet(); homeView = 'main'; renderHome(); });
}
function renderJoin(box){
  box.innerHTML = `<div class="hbar"><button class="tool" id="hBack">Volver</button><h2>Unirme a una mesa</h2></div>
    ${netNote ? `<p class="hnote" role="alert">${esc(netNote)}</p>` : ''}
    <form class="cfg" id="hJoinForm">
      <label for="hName">Tu nombre</label><input id="hName" maxlength="20" value="${esc(myName())}" placeholder="Invitado" autocomplete="nickname" ${CUENTA.yo && CUENTA.token ? 'disabled title="Con cuenta se usa tu apodo; se cambia en tu perfil"' : ''}>
      <label for="hCode">Código de la mesa</label><input id="hCode" maxlength="4" placeholder="ABCD" autocomplete="off" value="${esc(joinCode)}" style="text-transform:uppercase;width:7em">
      <span></span><button class="act flor" type="submit">Unirme</button>
    </form>
    <p class="hkey">${netMode() === 'internet' ? 'Pedile el código (o el link) a quien creó la mesa. Tiene que tenerla abierta mientras jueguen.' : 'Sin internet funciona entre pestañas de este navegador: la mesa tiene que estar abierta en otra pestaña.'}</p>`;
  netNote = '';
  $('hBack').onclick = () => { homeView = 'main'; renderHome(); };
  $('hName').oninput = e => setMyName(e.target.value);
  $('hJoinForm').onsubmit = e => { e.preventDefault(); const c = $('hCode').value.trim(); if (c.length !== 4) { netNote = 'El código tiene cuatro letras.'; renderHome(); return; } joinTable(c, $('hName').value); };
  setTimeout(() => $(myName() && !joinCode ? 'hCode' : 'hName').focus(), 0);
}

window.__trucoMute = v => { if (NET) NET.mute = !!v; };   // para las pruebas: la pestaña queda sorda y muda, como dormida

// ---------- Chat de la mesa ----------
// Cada mensaje va al anfitrión, que lo reparte a todos (así el orden es el mismo para todos).
function chatSend(text){
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text || !NET) return;
  if (NET.role === 'host') chatAdd({ p: 0, name: NET.seats[0].name, text }, true);
  else netPost({ t: 'chat', text, name: NET.name });
}
function chatAdd(m, broadcast){
  const msg = { p: typeof m.p === 'number' ? m.p : -1, name: String(m.name || '').slice(0, 20), text: String(m.text || '').slice(0, 200), at: Date.now() };
  NET.chat.push(msg); if (NET.chat.length > 80) NET.chat.shift();
  if (broadcast) netPost({ t: 'chat', p: msg.p, name: msg.name, text: msg.text });
  const mine = msg.p === chatSeat();
  if (!mine) { SND.play('chat'); chatToast(msg); }
  renderChat();
}
const chatSeat = () => !NET ? 0 : NET.role === 'host' ? 0 : NET.seat;
function chatLine(m){
  const mine = m.p === chatSeat(), seat = chatSeat();
  const cls = m.p < 0 || seat < 0 || seat === undefined ? '' : mine ? 'yo' : team(m.p) === team(seat) ? 'nos' : 'ellos';
  return `<div class="cm ${cls}"><b>${esc(mine ? 'Vos' : m.name)}</b> ${esc(m.text)}</div>`;
}
function chatUI(k){
  return `<div class="chatlog" id="${k}Log" aria-live="polite"></div>
    <form class="chatf" id="${k}Form"><input id="${k}In" maxlength="200" autocomplete="off" placeholder="Escribí algo y apretá Enter" aria-label="Mensaje para la mesa"><button class="tool" type="submit">Enviar</button></form>
    <div class="voz" data-voz></div>`;
}
function bindChat(k){
  const f = $(k + 'Form'); if (!f) return;
  f.onsubmit = e => { e.preventDefault(); const i = $(k + 'In'); chatSend(i.value); i.value = ''; };
}
function renderChat(){
  document.querySelectorAll('.chatlog').forEach(box => {
    const list = NET ? NET.chat : [];
    box.innerHTML = list.length ? list.map(chatLine).join('') : '<div class="cm vacio">Todavía no hay mensajes.</div>';
    box.scrollTop = box.scrollHeight;
  });
  const p = $('chatPanel'); if (p) p.hidden = !NET;
  renderVoz();
}
// si el chat no está a la vista (en el celular queda abajo), el mensaje aparece un momento arriba
function chatToast(m){
  const shown = [...document.querySelectorAll('.chatlog')].some(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.top < innerHeight && r.bottom > 0; });
  if (shown) return;
  const t = $('chatToast'); if (!t) return;
  t.innerHTML = `<b>${esc(m.name)}:</b> ${esc(m.text)}`; t.hidden = false; t.classList.remove('go'); void t.offsetWidth; t.classList.add('go');
  clearTimeout(chatToast.tm); chatToast.tm = setTimeout(() => { t.hidden = true; }, 4200);
}

// ---------- Voz: pulsar para hablar ----------
// Por la misma conexión directa entre navegadores (WebRTC). El micrófono se pide la primera vez que
// se pulsa, y solo manda sonido mientras se mantiene apretado el botón (o la tecla V).
const VOZ = { stream: null, on: false, audios: {}, mute: store.get('truco.voces') === '0', err: '' };
const vozOK = () => online() && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !!(vozRoom() && vozRoom().addStream);
async function vozMic(){
  if (VOZ.stream) return true;
  try {
    VOZ.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    VOZ.err = e && e.name === 'NotAllowedError' ? 'No diste permiso para usar el micrófono. Se cambia en el candado de la barra de direcciones.' : 'No encontré un micrófono para usar.';
    renderVoz(); return false;
  }
  VOZ.err = '';
  VOZ.stream.getAudioTracks().forEach(t => { t.enabled = false; });
  if (vozRoom()) try { vozRoom().addStream(VOZ.stream); } catch (e) {}
  return true;
}
async function talk(on){
  if (!NET || !vozOK()) return;
  if (on === VOZ.on) return;
  VOZ.on = on;
  if (on && !(await vozMic())) { VOZ.on = false; return; }
  if (!VOZ.stream || VOZ.on !== on) return;
  VOZ.stream.getAudioTracks().forEach(t => { t.enabled = on; });
  clearTimeout(VOZ.cut); if (on) VOZ.cut = setTimeout(() => talk(false), 60000);   // nadie queda hablando sin querer
  if (NET.role === 'host') { setTalking(0, on); netPost({ t: 'talk', p: 0, on }); } else netPost({ t: 'talk', on });
  renderVoz();
}
function vozStop(){
  if (VOZ.stream) VOZ.stream.getTracks().forEach(t => t.stop());
  VOZ.stream = null; VOZ.on = false;
  for (const k in VOZ.audios) vozDetach(k);
}
function vozAttach(peer, stream){
  vozDetach(peer);
  const a = document.createElement('audio'); a.autoplay = true; a.srcObject = stream; a.muted = VOZ.mute; a.dataset.peer = peer;
  document.body.appendChild(a); a.play().catch(() => {});
  VOZ.audios[peer] = a;
}
function vozDetach(peer){ const a = VOZ.audios[peer]; if (a) { a.srcObject = null; a.remove(); delete VOZ.audios[peer]; } }
function setVocesMute(m){ VOZ.mute = m; store.set('truco.voces', m ? '0' : '1'); for (const k in VOZ.audios) VOZ.audios[k].muted = m; renderVoz(); }
function setTalking(p, on){
  if (!NET || typeof p !== 'number') return;
  NET.talking[p] = on;
  if ($('home').hidden && G) render();
  renderVoz();
}
function talkingNames(){ return NET ? Object.keys(NET.talking).filter(p => NET.talking[p] && +p !== chatSeat()).map(p => (G && G.names[p]) || ((NET.seats || (NET.lobby && NET.lobby.seats) || [])[p] || {}).name).filter(Boolean) : []; }
function renderVoz(){
  const ok = !!(NET && vozOK());
  document.querySelectorAll('[data-voz]').forEach(box => {
    if (!ok) { box.dataset.built = ''; box.innerHTML = NET && NET.tr && !online() ? '<p class="vozn">La voz funciona en las mesas por internet.</p>' : ''; return; }
    // se arma una vez y después solo se actualiza (si se rehiciera, se perdería el botón apretado)
    if (!box.dataset.built) {
      box.dataset.built = '1';
      box.innerHTML = '<button type="button" class="ptt"></button><button type="button" class="tool vmute"></button><p class="vozn"></p>';
      bindPtt(box.querySelector('.ptt'));
      box.querySelector('.vmute').onclick = () => setVocesMute(!VOZ.mute);
    }
    const b = box.querySelector('.ptt'), who = talkingNames();
    b.classList.toggle('on', VOZ.on); b.setAttribute('aria-pressed', String(VOZ.on));
    b.textContent = '🎙 ' + (VOZ.on ? 'Hablando…' : VOZ.prep ? 'Prendiendo el micrófono…' : VOZ.stream ? 'Mantené apretado para hablar' : 'Prender el micrófono');
    const m = box.querySelector('.vmute'); m.setAttribute('aria-pressed', String(VOZ.mute)); m.textContent = VOZ.mute ? '🔇 Voces apagadas' : '🔈 Escuchando voces';
    box.querySelector('.vozn').innerHTML = (who.length ? `🎙 Habla ${esc(joinY(who))}` : VOZ.stream ? 'También con la tecla V.' : 'Se prende una vez y después hablás manteniendo apretado el botón o la tecla V.') + (VOZ.err ? ` <span class="err">${esc(VOZ.err)}</span>` : '');
  });
  const fab = $('pttFab');
  if (fab) { fab.hidden = !(ok && $('home').hidden); fab.classList.toggle('on', VOZ.on); fab.classList.toggle('off', !VOZ.stream); fab.setAttribute('aria-label', VOZ.stream ? 'Mantené apretado para hablar' : 'Prender el micrófono'); }
}
function bindPtt(b){
  if (!b) return;
  b.onpointerdown = e => {
    e.preventDefault();
    // la primera vez solo se prende el micrófono (pide permiso y conecta); después, apretar es hablar
    if (!VOZ.stream) { VOZ.prep = true; renderVoz(); vozMic().then(() => { VOZ.prep = false; renderVoz(); }); return; }
    try { b.setPointerCapture(e.pointerId); } catch (x) {} talk(true);
  };
  b.onpointerup = b.onpointercancel = b.onlostpointercapture = () => talk(false);
  b.oncontextmenu = e => e.preventDefault();
}
document.addEventListener('keydown', e => { if ((e.key === 'v' || e.key === 'V') && !e.repeat && NET && !/INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) talk(true); });
document.addEventListener('keyup', e => { if (e.key === 'v' || e.key === 'V') talk(false); });
addEventListener('blur', () => talk(false));
document.addEventListener('visibilitychange', () => { if (document.hidden) talk(false); });

// al abrir: si esta pestaña estaba en una mesa (se recargó la página), vuelve a ella
const netBack = netOK() && netRestore();
