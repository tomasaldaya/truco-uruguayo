// ---------- Mesa compartida ----------
// Por ahora entre pestañas de este navegador (BroadcastChannel). Por internet se cambia solo cómo
// viajan los mensajes; lo demás queda igual.
// El anfitrión tiene el partido completo (GM): corre el motor y a la computadora, valida cada jugada
// con el motor y le manda a cada invitado su vista recortada (TV.viewFor), así nadie recibe cartas
// ajenas. El invitado solo dibuja lo que le llega y manda sus jugadas, sus señas y "listo".
// Mensajes: hello, sit, bye, act, senas, ready, pref (invitado → anfitrión);
//           lobby, state, err, full, closed (anfitrión → invitados; con "to" si es para uno solo).
const NETV = 1, AI_NAMES = { 2: ['Vos', 'Computadora'], 4: ['Vos', 'Tito', 'Pocho', 'Nacho'], 6: ['Vos', 'Tito', 'Pocho', 'Nacho', 'Lalo', 'Beto'] };
let netNote = '';   // aviso para mostrar en la pantalla de inicio (mesa cerrada, código inexistente...)
const netOK = () => typeof BroadcastChannel !== 'undefined';
// el nombre se recuerda, y cada pestaña tiene el suyo (para probar con varias pestañas a la vez)
function myName(){ let s = null; try { s = sessionStorage.getItem('truco.nombre'); } catch (e) {} return (s !== null ? s : store.get('truco.nombre') || '').trim(); }
function setMyName(v){ v = (v || '').trim().slice(0, 20); try { sessionStorage.setItem('truco.nombre', v); } catch (e) {} store.set('truco.nombre', v); }
function newCode(){ const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)]; return s; }
function netPost(msg){ if (!NET || !NET.ch) return; msg.v = NETV; msg.code = NET.code; msg.from = NET.role === 'host' ? 'host' : NET.cid; try { NET.ch.postMessage(msg); } catch (e) {} }
function netSend(msg){ netPost(msg); }
function openNet(role, code){
  const ch = new BroadcastChannel('truco-mesa-' + code);
  NET = { role, code, ch, cid: role === 'host' ? 'host' : 'g' + Math.random().toString(36).slice(2, 10), prefs: {}, ready: new Set(), readyKey: null };
  ch.onmessage = e => { const m = e.data; if (!m || m.v !== NETV || m.code !== code || !NET || NET.ch !== ch) return; role === 'host' ? onHostMsg(m) : onGuestMsg(m); };
}
function leaveNet(){
  if (!NET) return;
  if (NET.role === 'host') netPost({ t: 'closed' }); else netPost({ t: 'bye' });
  clearTimeout(NET.helloT);
  try { NET.ch.close(); } catch (e) {}
  NET = null; ME = 0;
  // vuelve el partido que tenías guardado jugando solo (si había)
  clearTimeout(timer); busy = false; deferred = null; closeModal();
  GM = loadSavedGame(); G = null; refreshView();
  needStep = !!GM;
}
window.addEventListener('pagehide', () => { if (NET) leaveNet(); });

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
function lobbyChanged(){ netPost(lobbyMsg()); if (!$('home').hidden && homeView === 'lobby') renderHome(); }

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
  }
}
const cleanName = v => (v || '').trim().slice(0, 20) || 'Invitado';
function takeSeat(p, who, realista){
  NET.seats[p] = who;
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
function joinTable(code, name){
  leaveNet();
  code = (code || '').trim().toUpperCase();
  if (name !== undefined) setMyName(name);
  openNet('guest', code);
  NET.name = myName() || 'Invitado';
  NET.lobby = null; NET.actor = null; NET.legal = []; NET.shownEnd = null;
  GM = null; G = null;
  netPost({ t: 'hello', name: NET.name, realista });
  NET.helloT = setTimeout(() => {
    if (NET && NET.role === 'guest' && !NET.lobby) { leaveNet(); netNote = `No encontré la mesa ${code}. Revisá el código y que la mesa esté abierta en otra pestaña de este navegador.`; homeView = 'join'; renderHome(); }
  }, 1500);
  homeView = 'lobby'; renderHome();
}
function onGuestMsg(m){
  if (m.from !== 'host' || (m.to && m.to !== NET.cid)) return;
  switch (m.t) {
    case 'lobby': {
      clearTimeout(NET.helloT);
      const was = NET.lobby;
      NET.lobby = m;
      NET.seat = m.seats.findIndex(s => s.cid === NET.cid);
      if (!$('home').hidden && (homeView === 'lobby' || homeView === 'main')) renderHome();
      if (was && !was.started && m.started) { /* el partido empieza: llega el primer estado */ }
      return;
    }
    case 'state': onState(m); return;
    case 'err': errMsg = m.msg; NET.legal = []; render(); return;
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
  if (NET.role === 'host') {
    h += `<p class="lob">Pasale el código <b class="code">${esc(NET.code)}</b> a quien quiera jugar. Por ahora, para probar: abrí el juego en otra pestaña de este navegador, tocá "Unirme a una mesa" y escribí el código.</p>
      <div class="cfg"><label for="hName">Tu nombre</label><input id="hName" maxlength="20" value="${esc(myName())}" placeholder="Anfitrión">
      <span class="lbl">Modo</span><div class="seg" role="group" aria-label="Modo">${MODES.map(([n, nm]) => `<button type="button" data-mode="${n}" aria-pressed="${NET.n === n}" ${NET.started ? 'disabled' : ''}>${nm}</button>`).join('')}</div></div>
      ${seatsHTML(NET.seats, { canSit: false })}
      <p class="hkey">Los lugares sin persona los juega la computadora. Si alguien se va en medio del partido, la computadora sigue por él.</p>
      <div class="row">${NET.started ? '<button class="act flor" id="hGo">Volver a la mesa</button>' : '<button class="act flor" id="hGo">Empezar partido</button>'}<button class="act mazo" id="hClose">Cerrar la mesa</button></div>`;
  } else {
    const L = NET.lobby;
    if (!L) h += '<p class="lob">Buscando la mesa…</p>';
    else {
      const host = (L.seats.find(s => s.kind === 'host') || {}).name || 'el anfitrión';
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
  $('hClose').onclick = () => { leaveNet(); homeView = 'main'; renderHome(); };
}
function renderJoin(box){
  box.innerHTML = `<div class="hbar"><button class="tool" id="hBack">Volver</button><h2>Unirme a una mesa</h2></div>
    ${netNote ? `<p class="hnote" role="alert">${esc(netNote)}</p>` : ''}
    <form class="cfg" id="hJoinForm">
      <label for="hName">Tu nombre</label><input id="hName" maxlength="20" value="${esc(myName())}" placeholder="Invitado" autocomplete="nickname">
      <label for="hCode">Código de la mesa</label><input id="hCode" maxlength="4" placeholder="ABCD" autocomplete="off" style="text-transform:uppercase;width:7em">
      <span></span><button class="act flor" type="submit">Unirme</button>
    </form>
    <p class="hkey">Por ahora funciona entre pestañas de este mismo navegador: la mesa tiene que estar abierta en otra pestaña.</p>`;
  netNote = '';
  $('hBack').onclick = () => { homeView = 'main'; renderHome(); };
  $('hName').oninput = e => setMyName(e.target.value);
  $('hJoinForm').onsubmit = e => { e.preventDefault(); const c = $('hCode').value.trim(); if (c.length !== 4) { netNote = 'El código tiene cuatro letras.'; renderHome(); return; } joinTable(c, $('hName').value); };
  setTimeout(() => $(myName() ? 'hCode' : 'hName').focus(), 0);
}
