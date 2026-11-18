// ---------- Pantalla de inicio ----------
// Aparece al abrir el juego y con el botón Menú. Mientras se ve, el partido queda en pausa
// (toolOpen() la cuenta como un menú abierto). El partido se guarda en este navegador en cada
// jugada, así que "Continuar partido" sigue donde quedó aunque se cierre la página.
let homeView = 'main', confirmNew = null, needStep = false, fanDealt = false;
const MODES = [
  [2, 'Mano a mano', 'Vos contra la computadora.'],
  [4, 'Parejas', 'Vos y Pocho contra Tito y Nacho, con señas entre compañeros.'],
  [6, 'Tercetos', 'Vos, Pocho y Lalo contra Tito, Nacho y Beto.'],
];
const modeName = n => MODES.find(m => m[0] === n)[1];

// se guarda el partido que jugás solo; el de una mesa compartida no (lo tiene el anfitrión)
function saveGame(){
  if (!GM || NET) return;
  if (GM.phase === 'matchEnd') { store.del('truco.partida'); return; }
  try { localStorage.setItem('truco.partida', JSON.stringify({ v: 1, G: GM })); } catch (e) { /* sin lugar: no se guarda */ }
}
function loadSavedGame(){
  try {
    const s = JSON.parse(store.get('truco.partida') || 'null');
    const g = s && s.v === 1 && s.G;
    if (!g || !g.round || ![2, 4, 6].includes(g.n) || g.phase === 'matchEnd') return null;
    // señas guardadas con nombres viejos (antes el dos y el as eran una sola seña): se descartan
    const R = g.round, ok = k => !!T.SENAS[k];
    if (R.senasShown) R.senasShown = R.senasShown.map(l => l && l.filter(ok));
    if (R.senas) R.senas = R.senas.map(l => l && l.filter(ok));
    if (R.seen) R.seen = R.seen.map(l => (l || []).filter(v => ok(v.s)));
    if (g.phase === 'play') T.legal(g, T.actor(g)); // que el motor lo entienda
    if (!g.id) g.id = newMatchId();
    needStep = true;
    return g;
  } catch (e) { store.del('truco.partida'); return null; }
}

function showHome(view){
  homeView = view || 'main'; confirmNew = null;
  $('home').hidden = false; document.querySelector('.app').hidden = true;
  V3.pause();
  if (NET) renderVoz();
  if (NET && NET.role === 'host') publish();   // los invitados ven que el anfitrión está en el menú
  paintFan(!fanDealt); fanDealt = true;
  renderHome();
  window.scrollTo(0, 0);
}
// las tres cartas del abanico (con tu mazo, si cargaste uno); se reparten solo la primera vez
function paintFan(deal){
  const fan = $('hfan'); fan.innerHTML = '';
  [[1, 'espada'], [1, 'basto'], [7, 'espada']].forEach(([n, s], i) => { const c = cardEl({ n, s, id: n + '-' + s }); c.classList.add('f' + i); fan.appendChild(c); });
  fan.classList.toggle('deal', !!deal);
}
function hideHome(){ $('home').hidden = true; document.querySelector('.app').hidden = false; if (NET) renderVoz(); }
function continueGame(){
  hideHome();
  if (isGuest()) { render(); if (G && G.phase !== 'play' && G.phase !== 'idle' && !$('mNext')) showRoundEnd(); return; }
  if (needStep) { needStep = false; busy = false; lastRoundNo = null; step(); }
  else { resumeDeferred(); render(); }
}
function startGame(n){ if (NET) leaveNet(); hideHome(); needStep = false; newGame(n); }

// mesa vista desde arriba: tu equipo en celeste, los rivales en bordó, tu lugar con borde dorado
function tableSVG(n){
  let s = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="31" fill="#5a3620"/><circle cx="50" cy="50" r="27" fill="#1f5a3c"/>';
  for (let p = 0; p < n; p++) {
    const a = -Math.PI/2 + p*2*Math.PI/n, x = 50 + Math.cos(a)*41, y = 50 - Math.sin(a)*41;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8.5" fill="${team(p) === 0 ? '#86b9e6' : '#8b2335'}" ${p === 0 ? 'stroke="#e8b13a" stroke-width="3.5"' : 'stroke="rgba(0,0,0,.35)" stroke-width="1.5"'}/>`;
  }
  return s + '</svg>';
}

function renderHome(){
  const box = $('hmain');
  if (homeView === 'config') return renderConfig(box);
  if (homeView === 'lobby') return renderLobby(box);
  if (homeView === 'join') return renderJoin(box);
  if (homeView === 'perfil') return renderPerfil(box);
  if (homeView === 'ranking') return renderRanking(box);
  if (homeView === 'amigos') return renderAmigos(box);
  if (homeView === 'admin') return renderAdmin(box);
  const inGame = !!NET || (GM && GM.phase !== 'matchEnd');
  let h = netNote ? `<p class="hnote" role="alert">${esc(netNote)}</p>` : '';
  netNote = '';
  if (NET) {
    const started = NET.role === 'host' ? NET.started : !!G;
    h += `<button class="cont" id="hCont"><b>${started ? 'Volver a la mesa' : 'Ver la mesa'}</b><span>Mesa ${esc(NET.code)}${NET.role === 'host' || NET.owner ? ', sos el anfitrión' : ''}${started ? '' : '. Todavía no empezó el partido'}.</span></button>
      <div class="hlinks"><button class="tool" id="hLobby">Lugares de la mesa</button><button class="tool" id="hLeave">${NET.role === 'host' ? 'Cerrar la mesa' : 'Salir de la mesa'}</button></div>`;
  } else if (inGame) {
    const ch = G.chicos[0] + G.chicos[1];
    h += `<button class="cont" id="hCont"><b>Continuar partido</b><span>${modeName(G.n)}: ${esc(G.teamNames[0])} ${G.scores[0]}, ${esc(G.teamNames[1])} ${G.scores[1]}${ch ? `. Chicos: ${G.chicos[0]} a ${G.chicos[1]}` : ''}.</span></button>`;
  }
  h += `<section><h2>${NET ? 'Jugar solo' : inGame ? 'Partido nuevo' : 'Elegí cómo jugar'}</h2><div class="hmodes">`
    + MODES.map(([n, nm, d]) => `<button class="hmode" data-n="${n}">${tableSVG(n)}<div><b>${nm}</b><span>${d}</span></div></button>`).join('')
    + '</div><p class="hkey">En celeste tu equipo y en bordó los rivales; el lugar con borde dorado es el tuyo.</p>';
  if (confirmNew) h += `<div class="hconfirm" role="alert"><p>${NET ? `Vas a salir de la mesa ${esc(NET.code)} para jugar solo, de ${modeName(confirmNew).toLowerCase()}.` : `Tenés un partido sin terminar. Si empezás uno nuevo de ${modeName(confirmNew).toLowerCase()}, ese se pierde.`}</p>
    <div class="row"><button class="act flor" id="hYes">Empezar partido nuevo</button><button class="act mazo" id="hNo">Cancelar</button></div></div>`;
  h += '</section>';
  if (!NET) h += `<section><h2>Jugar con otros</h2><div class="hlinks"><button class="tool" id="hHost">Crear una mesa</button><button class="tool" id="hJoin">Unirme a una mesa</button></div>
    <p class="hkey">${netMode() === 'internet' ? 'Por internet: creá una mesa y pasale el link a quien quieras, o unite con el código que te pasaron.' : 'Sin internet: entre pestañas de este navegador, para probar cómo se ve el partido desde cada lugar.'}</p></section>`;
  h += cuentaHTML();
  h += `<nav class="hlinks" aria-label="Más opciones">
    <button class="tool" id="hCfg">Configuración</button><button class="tool" id="hDeck">Tu mazo</button>
    <button class="tool" id="hHow">Cómo se juega</button><button class="tool" id="hStats">Estadísticas</button></nav>
    <p class="hcred">Cartas: baraja española libre de <a href="https://commons.wikimedia.org/wiki/Category:Spanish_playing_cards" target="_blank" rel="noopener">Basquetteur</a> (Wikimedia Commons), con licencia <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.es" target="_blank" rel="noopener">CC BY-SA 3.0</a>.</p>`;
  box.innerHTML = h;
  if ($('hCont')) $('hCont').onclick = () => {
    if (NET && !(NET.role === 'host' ? NET.started : G)) { homeView = 'lobby'; renderHome(); } else continueGame();
  };
  if ($('hLobby')) $('hLobby').onclick = () => { homeView = 'lobby'; renderHome(); };
  if ($('hLeave')) $('hLeave').onclick = () => { leaveNet(); renderHome(); };
  if ($('hHost')) $('hHost').onclick = () => hostTable(GM && !NET ? GM.n : players);
  if ($('hJoin')) $('hJoin').onclick = () => { homeView = 'join'; renderHome(); };
  box.querySelectorAll('.hmode').forEach(b => b.onclick = () => {
    const n = +b.dataset.n;
    if (inGame) { confirmNew = n; renderHome(); $('hYes').focus(); } else startGame(n);
  });
  if (confirmNew) { $('hYes').onclick = () => startGame(confirmNew); $('hNo').onclick = () => { confirmNew = null; renderHome(); }; }
  $('hCfg').onclick = () => { homeView = 'config'; renderHome(); $('hBack').focus(); };
  $('hDeck').onclick = deckModal;
  $('hHow').onclick = howToModal;
  $('hStats').onclick = statsModal;
  bindCuenta();
}

// ---------- Configuración ----------
// Todo se guarda al cambiarlo. La dificultad y lo de pantalla rigen enseguida, el modo realista
// desde la próxima mano y las reglas de la mesa desde el próximo partido.
function renderConfig(box){
  const R0 = Object.assign({}, T.DEFAULT_RULES, tableRules);
  const seg = (k, lbl, opts, val, dis) => `<div class="seg" role="group" aria-label="${esc(lbl)}" data-k="${k}">`
    + opts.map(([v, l]) => `<button type="button" data-v="${String(v)}" aria-pressed="${String(v) === String(val)}"${dis ? ' disabled' : ''}>${esc(l)}</button>`).join('') + '</div>';
  const row = (k, lbl, opts, val, desc, dis) => {
    const short = opts.every(o => String(o[1]).length <= 22);
    const ctl = short ? seg(k, lbl, opts, val, dis)
      : `<select id="c_${k}" data-k="${k}">${opts.map(([v, l]) => `<option value="${String(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `${short ? `<span class="lbl">${esc(lbl)}</span>` : `<label for="c_${k}">${esc(lbl)}</label>`}${ctl}${desc ? `<div class="desc">${desc}</div>` : ''}`;
  };
  const can3d = V3.available();
  const rules = RULE_OPTS.filter(o => o[0] !== 'h').map(o => row(o[0], o[1], o[2], R0[o[0]])).join('');
  box.innerHTML = `<div class="hbar"><button class="tool" id="hBack">Volver</button><h2>Configuración</h2></div>
    <section class="cfgsec"><h3>Pantalla</h3><div class="cfg">
      ${row('view', 'Mesa', [['3d', '3D'], ['2d', '2D']], can3d && view3d ? '3d' : '2d', can3d ? 'La 3D tiene cámara que gira y caras que hacen las señas; la 2D es más simple.' : 'Este navegador no puede mostrar la mesa 3D.', !can3d)}
      ${row('help', 'Ayudas', [['1', 'Sí'], ['0', 'No']], showHelp ? '1' : '0', 'Marca qué cartas son pieza, mata o fío, qué significa cada seña y cuánto tenés de envido.')}
      ${row('speed', 'Velocidad', Object.keys(SPEEDS).map(k => [k, k.charAt(0).toUpperCase() + k.slice(1)]), speed, 'Cuánto tarda la computadora en jugar.')}
    </div></section>
    <section class="cfgsec"><h3>Sonido</h3><div class="cfg">
      ${row('snd', 'Sonidos', [['1', 'Sí'], ['0', 'No']], SND.on ? '1' : '0', 'Barajar, repartir, cartas a la mesa, el golpe al gritar truco, tu turno y los últimos segundos. Suaves y cortos.')}
      ${row('vol', 'Volumen', [['bajo', 'Bajo'], ['medio', 'Medio'], ['alto', 'Alto']], SND.vol)}
    </div></section>
    <section class="cfgsec"><h3>Partido</h3><div class="cfg">
      ${row('level', 'Dificultad', [['facil', 'Fácil'], ['normal', 'Normal'], ['dificil', 'Difícil']], level, 'En difícil la computadora se acuerda de tus mentiras y tus faroles.')}
      ${row('real', 'Modo realista', [['0', 'No'], ['1', 'Sí']], realista ? '1' : '0', 'Cantás tus puntos a mano y podés equivocarte o negar la flor, con las penas del reglamento. Rige desde la próxima mano.')}
    </div></section>
    <section class="cfgsec"><h3>Reglas de la mesa</h3><div class="cfg">${rules}</div>
      <p class="cfgnote">En cada lugar se juega un poco distinto. Estas reglas se aplican desde el próximo partido.</p></section>`;
  $('hBack').onclick = () => { homeView = 'main'; renderHome(); $('hCfg').focus(); };
  box.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
    setCfg(b.parentNode.dataset.k, b.dataset.v);
    b.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
  box.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => setCfg(s.dataset.k, s.value));
}
function setCfg(k, v){
  if (k === 'view') setView3d(v === '3d');
  else if (k === 'help') setHelp(v === '1');
  else if (k === 'speed') setSpeed(v);
  else if (k === 'snd') SND.setOn(v === '1');
  else if (k === 'vol') SND.setVol(v);
  else if (k === 'level') { level = v; store.set('truco.level', v); }
  else if (k === 'real') setRealista(v === '1');
  else {
    tableRules = Object.assign({}, tableRules, { [k]: v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? +v : v });
    store.set('truco.rules', JSON.stringify(tableRules));
  }
}
