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
const NETV = 1, AI_NAMES = { 2: ['Vos', 'Computadora'], 4: ['Vos', 'Tito', 'Pocho', 'Nacho'], 6: ['Vos', 'Tito', 'Pocho', 'Nacho', 'Lalo', 'Beto'] };
const APP_ID = 'tomasaldaya/truco-uruguayo/1';
// Relevo para redes que no dejan conectarse directo (datos del celular, redes de empresa). Ejemplo:
// [{ urls: 'turn:global.relay.metered.ca:80', username: '...', credential: '...' }]
const NET_TURN = [];
let netNote = '';   // aviso para mostrar en la pantalla de inicio (mesa cerrada, código inexistente...)
let joinCode = '';  // código ya escrito en "Unirme a una mesa" (por ejemplo, el del link de invitación)
const netOK = () => typeof BroadcastChannel !== 'undefined' || typeof Trystero !== 'undefined';
const netMode = () => store.get('truco.red') === 'local' || typeof Trystero === 'undefined' || typeof RTCPeerConnection === 'undefined' ? 'local' : 'internet';
const online = () => !!(NET && NET.tr && NET.tr.kind === 'internet');
// el nombre se recuerda, y cada pestaña tiene el suyo (para probar con varias pestañas a la vez)
function myName(){ let s = null; try { s = sessionStorage.getItem('truco.nombre'); } catch (e) {} return (s !== null ? s : store.get('truco.nombre') || '').trim(); }
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
  return {
    kind: 'internet', room,
    self: room.getSelf().then(x => x.peerId),
    post: (m, to) => { act.send(m, to ? { target: to } : undefined).catch(() => {}); },
    close: () => { room.leave().catch(() => {}); },
  };
}
function openNet(role, code){
  const me = NET = { role, code, cid: role === 'host' ? 'host' : 'g' + Math.random().toString(36).slice(2, 10), prefs: {}, ready: new Set(), readyKey: null, hostPeer: null, lastHost: Date.now(), alive: {}, pingSeq: 0 };
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
  if (me.tr.self) me.tr.self.then(id => { if (role === 'guest') me.cid = id; me.ready0 = true; if (me.onSelf) me.onSelf(); });
  me.beat = setInterval(() => { if (NET === me && !me.mute) heartbeat(); }, 4000);
}
// llegó o se fue alguien de la sala (solo por internet)
const NET_ERR = {
  relay: 'No me pude conectar al servicio que usa el juego para encontrar la mesa. Revisá tu conexión a internet.',
  p2p: 'Encontré la mesa pero no pude conectarme. Pasa con algunas redes, sobre todo con datos del celular: probá desde un wifi.',
};
function onPeerEvent(ev, peer, err){
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
function sayHello(peer){
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
  const tr = NET.tr;
  setTimeout(() => { try { tr.close(); } catch (e) {} }, soft ? 0 : 300);   // que llegue el último aviso
  if (!soft) { netForget(); if (invitedCode()) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  NET = null; ME = 0;
  // vuelve el partido que tenías guardado jugando solo (si había)
  clearTimeout(timer); busy = false; deferred = null; closeModal();
  GM = loadSavedGame(); G = null; refreshView();
  needStep = !!GM;
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
      : { role: 'guest', code: NET.code, name: NET.name, at: Date.now() };
    sessionStorage.setItem('truco.mesa', JSON.stringify(d));
  } catch (e) {}
}
function netForget(){ try { sessionStorage.removeItem('truco.mesa'); } catch (e) {} }
function netRestore(){
  let d = null;
  try { d = JSON.parse(sessionStorage.getItem('truco.mesa') || 'null'); } catch (e) {}
  if (!d || Date.now() - d.at > 6 * 3600e3) { netForget(); return false; }
  if (d.role === 'guest') { joinTable(d.code, d.name, true); return true; }
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
function hostTable(n){
  leaveNet();
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
    case 'ready': if (s >= 0 && NET.started && m.key === roundKey(GM)) { NET.ready.add(s); checkReady(); } return;
    case 'pref': if (s >= 0) NET.prefs[s] = !!m.realista; return;
    case 'pong':
      if (s >= 0) NET.alive[g] = Math.max(NET.alive[g] || 0, m.s);
      else if (m.seated) netPost({ ...lobbyMsg(), to: g });   // se durmió y lo dejé afuera: que se entere y vuelva a entrar
      return;
  }
}
const cleanName = v => (v || '').trim().slice(0, 20) || 'Invitado';
function takeSeat(p, who, realista){
  NET.seats[p] = who;
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
    netPost({ t: 'state', to: s.cid, seat: p, view: TV.viewFor(GM, p), actor: act, legal: act === p ? T.legal(GM, p) : [], key, waiting: waitingNames(), paused: toolOpen(), host: NET.seats[0].name });
  });
  netRemember();
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
function joinTable(code, name, back){
  leaveNet();
  code = (code || '').trim().toUpperCase();
  if (name !== undefined) setMyName(name);
  openNet('guest', code);
  NET.name = myName() || 'Invitado';
  NET.lobby = null; NET.actor = null; NET.legal = []; NET.shownEnd = null; NET.hadSeat = false;
  GM = null; G = null;
  const net = online();
  if (!net) sayHello();   // por internet se saluda al conectarse con cada uno (onPeerEvent)
  NET.helloT = setTimeout(() => {
    if (!NET || NET.role !== 'guest' || NET.lobby) return;
    const err = NET.netErr;
    leaveNet();
    netNote = err ? NET_ERR[err] : back ? `No pude volver a la mesa ${code}: puede que se haya cerrado.`
      : net ? `No encontré la mesa ${code}. Revisá el código y que quien la creó la tenga abierta.`
      : `No encontré la mesa ${code}. Revisá el código y que la mesa esté abierta en otra pestaña de este navegador.`;
    joinCode = code; homeView = 'join'; renderHome();
  }, net ? 25000 : 1500);
  netRemember();
  homeView = 'lobby'; renderHome();
}
function onGuestMsg(m){
  if (m.from !== 'host' || (m.to && m.to !== NET.cid)) return;
  NET.lastHost = Date.now();
  if (NET.hostLost && m.t !== 'away') { NET.hostLost = false; netStatus(); }
  switch (m.t) {
    case 'ping': netPost({ t: 'pong', s: m.s, seated: NET.seat >= 0 }); return;
    case 'lobby': {
      clearTimeout(NET.helloT);
      NET.lobby = m;
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
    case 'full': leaveNet(); netNote = 'La mesa está completa.'; homeView = 'join'; showHome('join'); return;
    case 'closed': leaveNet(); netNote = 'El anfitrión cerró la mesa.'; showHome(); return;
  }
}
function onState(m){
  const first = !G;
  ME = m.seat; G = m.view; NET.actor = m.actor; NET.legal = m.legal || []; NET.key = m.key;
  NET.paused = !!m.paused; NET.host = m.host;
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
    const who = s.kind === 'ai' ? `${esc(s.name)} <small>(computadora)</small>` : `${esc(s.name)}${s.kind === 'host' ? ' <small>(anfitrión)</small>' : ''}`;
    const sit = opts.canSit && s.kind === 'ai' && !mine(p) ? `<button class="tool" data-sit="${p}">Sentarme acá</button>` : '';
    return `<li class="${mine(p) ? 'me' : ''}"><span>${who}${mine(p) ? ' <b>· vos</b>' : ''}</span>${sit}</li>`;
  };
  return '<div class="seats">' + [0, 1].map(t => `<div class="team t${t}"><h3>Equipo ${t === 0 ? 'celeste' : 'bordó'}</h3><ul>${seats.map((s, p) => team(p) === t ? row(s, p) : '').join('')}</ul></div>`).join('') + '</div>';
}
function renderLobby(box){
  if (!NET) { homeView = 'main'; return renderHome(); }
  let h = `<div class="hbar"><button class="tool" id="hBack">Volver</button><h2>Mesa ${esc(NET.code)}</h2></div>`;
  if (NET.netErr) h += `<p class="hnote" role="alert">${NET_ERR[NET.netErr]}</p>`;
  if (NET.role === 'host') {
    const url = online() ? inviteURL(NET.code) : '';
    h += online()
      ? `<p class="lob">Pasale ${url ? 'el link o ' : ''}el código <b class="code">${esc(NET.code)}</b> a quien quiera jugar. Entra desde su navegador, en la compu o en el celular, con "Unirme a una mesa".</p>
        ${url ? `<div class="invite"><input id="hUrl" readonly value="${esc(url)}" aria-label="Link de la mesa"><button class="tool" id="hCopy">Copiar link</button>${navigator.share ? '<button class="tool" id="hShare">Compartir</button>' : ''}</div>` : ''}
        <p class="hkey">Dejá esta pestaña abierta mientras dure el partido: el partido corre en tu navegador.</p>`
      : `<p class="lob">Pasale el código <b class="code">${esc(NET.code)}</b> a quien quiera jugar. Sin internet funciona entre pestañas de este navegador: abrí el juego en otra pestaña, tocá "Unirme a una mesa" y escribí el código.</p>`;
    h += `
      <div class="cfg"><label for="hName">Tu nombre</label><input id="hName" maxlength="20" value="${esc(myName())}" placeholder="Anfitrión">
      <span class="lbl">Modo</span><div class="seg" role="group" aria-label="Modo">${MODES.map(([n, nm]) => `<button type="button" data-mode="${n}" aria-pressed="${NET.n === n}" ${NET.started ? 'disabled' : ''}>${nm}</button>`).join('')}</div></div>
      ${seatsHTML(NET.seats, { canSit: false })}
      <p class="hkey">Los lugares sin persona los juega la computadora. Si alguien se va en medio del partido, la computadora sigue por él.</p>
      <div class="row">${NET.started ? '<button class="act flor" id="hGo">Volver a la mesa</button>' : '<button class="act flor" id="hGo">Empezar partido</button>'}<button class="act mazo" id="hClose">Cerrar la mesa</button></div>`;
  } else {
    const L = NET.lobby;
    if (!L) h += `<p class="lob">Buscando la mesa ${esc(NET.code)}…${online() ? ' Puede tardar unos segundos.' : ''}</p>`;
    else {
      const host = (L.seats.find(s => s.kind === 'host') || {}).name || 'el anfitrión';
      if (NET.hostLost) h += `<p class="hnote" role="status">Se cortó la conexión con ${esc(host)}. Esperando que vuelva…</p>`;
      const sentado = NET.seat >= 0;
      h += `<p class="lob">${MODES.find(m => m[0] === L.n)[1]}, mesa de ${esc(host)}. ${L.started ? (sentado ? 'El partido ya empezó.' : 'El partido ya empezó: elegí un lugar libre para entrar.') : `Esperando a que ${esc(host)} empiece el partido.`}</p>
        ${seatsHTML(L.seats, { canSit: true })}`;
    }
    h += `<div class="row">${G ? '<button class="act flor" id="hGo">Volver a la mesa</button>' : ''}<button class="act mazo" id="hClose">Salir de la mesa</button></div>`;
  }
  box.innerHTML = h;
  $('hBack').onclick = () => { homeView = 'main'; renderHome(); };
  if ($('hName')) $('hName').oninput = e => { setMyName(e.target.value); if (NET && NET.role === 'host' && !NET.started) { NET.seats[0].name = myName() || 'Anfitrión'; netPost(lobbyMsg()); } };
  box.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setTableMode(+b.dataset.mode));
  box.querySelectorAll('[data-sit]').forEach(b => b.onclick = () => netPost({ t: 'sit', seat: +b.dataset.sit, name: NET.name, realista }));
  if ($('hGo')) $('hGo').onclick = () => { if (NET.role === 'host' && !NET.started) startTable(); else continueGame(); };
  if ($('hCopy')) $('hCopy').onclick = () => {
    const done = () => { $('hCopy').textContent = 'Copiado'; setTimeout(() => { if ($('hCopy')) $('hCopy').textContent = 'Copiar link'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText($('hUrl').value).then(done, () => { $('hUrl').select(); });
    else { $('hUrl').select(); try { document.execCommand('copy'); done(); } catch (e) {} }
  };
  if ($('hShare')) $('hShare').onclick = () => navigator.share({ title: 'Truco uruguayo', text: `Vení a jugar al truco: mesa ${NET.code}`, url: $('hUrl').value }).catch(() => {});
  if ($('hUrl')) $('hUrl').onfocus = e => e.target.select();
  $('hClose').onclick = () => { leaveNet(); homeView = 'main'; renderHome(); };
}
function renderJoin(box){
  box.innerHTML = `<div class="hbar"><button class="tool" id="hBack">Volver</button><h2>Unirme a una mesa</h2></div>
    ${netNote ? `<p class="hnote" role="alert">${esc(netNote)}</p>` : ''}
    <form class="cfg" id="hJoinForm">
      <label for="hName">Tu nombre</label><input id="hName" maxlength="20" value="${esc(myName())}" placeholder="Invitado" autocomplete="nickname">
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

// al abrir: si esta pestaña estaba en una mesa (se recargó la página), vuelve a ella
const netBack = netOK() && netRestore();
window.__trucoMute = v => { if (NET) NET.mute = !!v; };   // para las pruebas: la pestaña queda sorda y muda, como dormida
