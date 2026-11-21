// ---------- Pantalla de inicio ----------
// Aparece al abrir el juego y con el botón Menú. Mientras se ve, el partido queda en pausa
// (toolOpen() la cuenta como un menú abierto). El partido se guarda en este navegador en cada
// jugada, así que "Continuar partido" sigue donde quedó aunque se cierre la página.
let homeView = 'portada', confirmNew = null, needStep = false, fanDealt = false;
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

// ---------- Instalar el juego como app (compu, celular o tablet) ----------
// Chrome y Edge avisan cuando se puede instalar (beforeinstallprompt) y el botón abre su ventanita. En el
// iPhone, el iPad y el Safari de la Mac no hay aviso: el botón explica cómo agregarlo. Ya instalado, no aparece.
let avisoInstalar = null;
const yaInstalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const esSafariMac = () => /Macintosh/.test(navigator.userAgent) && /Version\/[\d.]+ Safari\//.test(navigator.userAgent) && navigator.maxTouchPoints <= 1;
function comoInstalar(){
  if (yaInstalado()) return null;
  if (avisoInstalar) return 'aviso';
  if (esIOS()) return 'ios';
  if (esSafariMac()) return 'mac';
  return null;
}
function pintarInstalar(){ const b = $('hInstalar'); if (b) b.hidden = !comoInstalar(); }
addEventListener('beforeinstallprompt', e => { e.preventDefault(); avisoInstalar = e; pintarInstalar(); });
addEventListener('appinstalled', () => { avisoInstalar = null; pintarInstalar(); });
async function instalarJuego(){
  const k = comoInstalar();
  if (k === 'aviso') {
    const e = avisoInstalar; avisoInstalar = null;
    e.prompt(); try { await e.userChoice; } catch (_) {}
    pintarInstalar(); return;
  }
  toolModal(`<h3>Instalar el juego</h3>${k === 'ios'
    ? '<p>En Safari, tocá el botón de compartir (el cuadrado con la flecha para arriba) y elegí <b>Agregar a inicio</b>. Queda con su ícono, como una app.</p>'
    : '<p>En Safari, abrí el menú <b>Archivo</b> y elegí <b>Agregar al Dock</b>. Queda con su ícono, como una app.</p>'}
    <div class="row"><button class="act" id="iOk">Listo</button></div>`);
  $('iOk').onclick = closeTool;
}
// lo que hace falta para instalarlo y abrirlo sin internet (sw.js); no funciona abriendo el archivo suelto
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname)))
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

function showHome(view){
  // un partido online que ya terminó: al ir al menú, la mesa se cierra (no queda nada pendiente)
  if (NET && G && G.phase === 'matchEnd' && view !== 'lobby') { closeModal(); leaveNet(); }
  homeView = view || 'main'; confirmNew = null;
  if (!view) uruTab = NET ? 'online' : GM ? 'compu' : uruTab;   // al volver del partido, a la pestaña de donde venías
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
  // el logo: tres piezas de oro en abanico, el 2, el 4 y el 5
  [[2, 'oro'], [4, 'oro'], [5, 'oro']].forEach(([n, s], i) => { const c = cardEl({ n, s, id: n + '-' + s }); c.classList.add('f' + i); fan.appendChild(c); });
  fan.classList.toggle('deal', !!deal);
}
function hideHome(){ $('home').hidden = true; document.querySelector('.app').hidden = false; window.scrollTo(0, 0); if (NET) renderVoz(); }
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
  const guardar = ['lcIn', 'aBuscar'].map(id => { const e = $(id); return e ? { id, v: e.value, f: document.activeElement === e, s: e.selectionStart } : null; }).filter(Boolean);
  pintarInicio();
  for (const k of guardar) {
    const e = $(k.id); if (!e) continue;
    if (!e.value && k.v) e.value = k.v;
    if (k.f) { e.focus({ preventScroll: true }); try { e.setSelectionRange(k.s, k.s); } catch (x) {} }
  }
}
function pintarInicio(){
  const box = $('hmain');
  $('home').classList.toggle('portada', homeView === 'portada');   // el logo y el nombre, solo en la pantalla principal
  if (homeView === 'config') return renderConfig(box);
  if (homeView === 'lobby') return renderLobby(box);
  if (homeView === 'join') return renderJoin(box);
  if (homeView === 'crear') return renderCrear(box);
  if (homeView === 'perfil') return renderPerfil(box);
  if (homeView === 'ranking') return renderRanking(box);
  if (homeView === 'gremios') return renderGremios(box);
  if (homeView === 'gremio') return renderGremio(box);
  if (homeView === 'amigos') return renderAmigos(box);
  if (homeView === 'charla') return renderCharla(box);
  if (homeView === 'admin') return renderAdmin(box);
  if (homeView === 'publicas') return renderPublicas(box);
  if (homeView === 'editar') return renderEditar(box);
  if (homeView === 'portada') return renderPortada(box);
  return renderUruguayo(box);
}

// ---------- La pantalla principal ----------
// "Falta envido y truco": el logo, el nombre y qué truco jugar. El argentino todavía no está (Próximamente).
// Si hay un partido sin terminar o una mesa online, aparece arriba para seguir.
function seguirHTML(){
  const inGame = !!NET || (GM && GM.phase !== 'matchEnd');
  if (NET) {
    const started = NET.role === 'host' ? NET.started : !!G;
    return `<button class="cont" id="hCont"><b>${started ? 'Volver a la mesa' : 'Ver la mesa'}</b><span>Mesa ${esc(NET.code)}${NET.role === 'host' || NET.owner ? ', sos el anfitrión' : ''}${started ? '' : '. Todavía no empezó el partido'}.</span></button>
      <div class="hlinks"><button class="tool" id="hLobby">Lugares de la mesa</button><button class="tool" id="hLeave">${NET.role === 'host' ? 'Cerrar la mesa' : 'Salir de la mesa'}</button></div>`;
  }
  if (inGame) {
    const ch = G.chicos[0] + G.chicos[1];
    return `<button class="cont" id="hCont"><b>Continuar partido</b><span>${modeName(G.n)}: ${esc(G.teamNames[0])} ${G.scores[0]}, ${esc(G.teamNames[1])} ${G.scores[1]}${ch ? `. Chicos: ${G.chicos[0]} a ${G.chicos[1]}` : ''}.</span></button>`;
  }
  return '';
}
function bindSeguir(){
  if ($('hCont')) $('hCont').onclick = () => {
    if (NET && !(NET.role === 'host' ? NET.started : G)) { homeView = 'lobby'; renderHome(); } else continueGame();
  };
  if ($('hLobby')) $('hLobby').onclick = () => { homeView = 'lobby'; renderHome(); };
  if ($('hLeave')) $('hLeave').onclick = () => confirmarSalida($('hLeave'), () => { leaveNet(); renderHome(); });
}
const PIE_CREDITOS = `<p class="hcred">Cartas: baraja española libre de <a href="https://commons.wikimedia.org/wiki/Category:Spanish_playing_cards" target="_blank" rel="noopener">Basquetteur</a> (Wikimedia Commons), con licencia <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.es" target="_blank" rel="noopener">CC BY-SA 3.0</a>.</p>
    <p class="hcred">© 2026 Tomás Aldaya. Todos los derechos reservados. · <a href="terminos.html" target="_blank" rel="noopener">Términos de uso</a> · <a href="privacidad.html" target="_blank" rel="noopener">Privacidad</a></p>`;
function renderPortada(box){
  let h = netNote ? `<p class="hnote" role="alert">${esc(netNote)}</p>` : '';
  netNote = '';
  h += seguirHTML();
  h += `<div class="pjuegos">
    <button class="pjuego" id="pUru"><b>Truco uruguayo</b><span>Con muestra y flor. Online o contra la computadora.</span></button>
    <div class="pjuego prox" aria-disabled="true"><b>Truco argentino</b><span>Próximamente</span></div>
  </div>` + PIE_CREDITOS;
  box.innerHTML = h;
  bindSeguir();
  $('pUru').onclick = () => { homeView = 'main'; renderHome(); window.scrollTo(0, 0); };
}

// ---------- Truco uruguayo: las pestañas ----------
// Online (pide la cuenta para entrar), Contra la computadora, Perfil y Más (configuración, personaje, mazo,
// cómo se juega, reglamento, estadísticas). La pestaña elegida se recuerda.
const PESTANAS = [['online', 'Online'], ['compu', 'Contra la computadora'], ['perfil', 'Perfil'], ['mas', 'Más']];
let uruTab = PESTANAS.some(p => p[0] === store.get('truco.pestana')) ? store.get('truco.pestana') : 'online';
function irPestana(k){ uruTab = k; store.set('truco.pestana', k); confirmNew = null; renderHome(); }
function loginHTML(para){
  let h = `<div class="hpcta"><div id="hGsi" class="gsi"></div><span>${para}</span></div>`;
  if (CUENTA.cfg && CUENTA.cfg.prueba) h += `<form id="cPrueba" class="hlinks"><input id="cPruebaN" placeholder="Nombre de prueba" maxlength="20" aria-label="Nombre de prueba"><button class="tool" type="submit">Entrar de prueba</button></form>`;
  return h;
}
function renderUruguayo(box){
  const inGame = !!NET || (GM && GM.phase !== 'matchEnd');
  const cuentas = cuentaOK() && (!!CUENTA.cfg || !CUENTA.cfgFallo);
  let h = netNote ? `<p class="hnote" role="alert">${esc(netNote)}</p>` : '';
  netNote = '';
  const A = conCuenta() && CUENTA.amigos, pend = A ? A.recibidas.length + A.amigos.reduce((n, a) => n + (a.sinLeer || 0), 0) : 0;
  h += `<div class="hbar"><button class="tool" id="hInicio">Inicio</button><h2>Truco uruguayo</h2></div>`;
  h += `<div class="htabs" role="tablist" aria-label="Truco uruguayo">${PESTANAS.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${uruTab === k}">${t}${k === 'perfil' && pend ? ` <b class="cbadge">${pend}</b>` : ''}</button>`).join('')}</div>`;
  h += avisoHTML() + seguirHTML();
  if (uruTab === 'online') {
    if (NET) h += '<p class="hkey">Estás en una mesa. Para entrar a otra, primero salí de esta.</p>';
    // se pide la cuenta para jugar online (si se puede entrar: con Google configurado, o de prueba)
    else if (cuentas && !conCuenta() && CUENTA.cfg && (CUENTA.cfg.google || CUENTA.cfg.prueba)) h += `<section class="hpub"><h2>Jugar online</h2>${loginHTML('Para jugar online entrá con tu cuenta de Google: así tenés tu nombre, aparecés en el ranking y sumás amigos.')}</section>`;
    else {
      if (cuentas) h += publicasHomeHTML();
      h += `<section><h2>${cuentas ? 'Con amigos' : 'Jugar con otros'}</h2><div class="hlinks"><button class="tool" id="hHost">${cuentas ? 'Crear una mesa privada' : 'Crear una mesa'}</button><button class="tool" id="hJoin">${cuentas ? 'Unirme con un código' : 'Unirme a una mesa'}</button></div>
        <p class="hkey">${netMode() === 'internet' ? 'Creá una mesa y pasale el link a quien quieras, o unite con el código que te pasaron.' : 'Sin internet: entre pestañas de este navegador, para probar cómo se ve el partido desde cada lugar.'}</p></section>`;
    }
  } else if (uruTab === 'compu') {
    h += `<section><h2>${NET ? 'Jugar solo' : inGame ? 'Partido nuevo' : 'Elegí cómo jugar'}</h2><div class="hmodes">`
      + MODES.map(([n, nm, d]) => `<button class="hmode" data-n="${n}">${tableSVG(n)}<div><b>${nm}</b><span>${d}</span></div></button>`).join('')
      + `</div><p class="hkey">Para practicar: la computadora juega los otros lugares. En celeste tu equipo y en bordó los rivales; el lugar con borde dorado es el tuyo. Un chico, y no cuenta para el ranking.</p>`;
    if (confirmNew) h += `<div class="hconfirm" role="alert"><p>${NET ? `Vas a salir de la mesa ${esc(NET.code)} para jugar solo, de ${modeName(confirmNew).toLowerCase()}.` : `Tenés un partido sin terminar. Si empezás uno nuevo de ${modeName(confirmNew).toLowerCase()}, ese se pierde.`}</p>
      <div class="row"><button class="act flor" id="hYes">Empezar partido nuevo</button><button class="act mazo" id="hNo">Cancelar</button></div></div>`;
    h += '</section>';
  } else if (uruTab === 'perfil') {
    if (conCuenta()) h += fichaHTML();
    else if (cuentas) h += `<section><h2>Tu perfil</h2>${loginHTML('Entrá con tu cuenta de Google para tener tu perfil, tus estadísticas en el ranking, gremio y amigos.')}</section>`;
    else h += '<p class="hkey">Las cuentas no están disponibles en este momento.</p>';
    h += `<nav class="hlinks" aria-label="Tu juego"><button class="tool" id="hPj">Tu personaje y cómo tanteás</button><button class="tool" id="hDeck">Tu mazo</button><button class="tool" id="hStats">Estadísticas en este navegador</button></nav>`;
  } else {
    h += `<nav class="hmas" aria-label="Más opciones">
      <button class="tool" id="hCfg">Configuración</button><button class="tool" id="hHow">Cómo se juega</button><button class="tool" id="hRegl">Reglamento</button>
      <button class="tool" id="hInstalar"${comoInstalar() ? '' : ' hidden'}>Instalar el juego</button></nav>` + PIE_CREDITOS;
  }
  box.innerHTML = h;
  $('hInicio').onclick = () => { homeView = 'portada'; renderHome(); };
  box.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => irPestana(b.dataset.tab));
  bindSeguir();
  if ($('hHost')) $('hHost').onclick = () => abrirCrear(false, GM && !NET ? GM.n : players);
  if ($('hJoin')) $('hJoin').onclick = () => { homeView = 'join'; renderHome(); };
  box.querySelectorAll('.hmode[data-n]').forEach(b => b.onclick = () => {
    const n = +b.dataset.n;
    if (inGame) { confirmNew = n; renderHome(); $('hYes').focus(); } else startGame(n);
  });
  if (confirmNew && $('hYes')) { $('hYes').onclick = () => startGame(confirmNew); $('hNo').onclick = () => { confirmNew = null; renderHome(); }; }
  if ($('hCfg')) $('hCfg').onclick = () => { homeView = 'config'; renderHome(); $('hBack').focus(); };
  if ($('hDeck')) $('hDeck').onclick = deckModal;
  if ($('hPj')) $('hPj').onclick = pjModal;
  if ($('hInstalar')) $('hInstalar').onclick = instalarJuego;
  if ($('hHow')) $('hHow').onclick = howToModal;
  if ($('hRegl')) $('hRegl').onclick = reglamentoModal;
  if ($('hStats')) $('hStats').onclick = statsModal;
  bindCuenta();
  if (uruTab === 'online' && cuentas && !NET && conCuenta()) bindPublicasHome();
}

// ---------- Configuración ----------
// Todo se guarda al cambiarlo. La dificultad y lo de pantalla rigen enseguida y el modo realista desde la próxima
// mano. Las reglas de la mesa son fijas (tableRules en ui.html).
function renderConfig(box){
  const seg = (k, lbl, opts, val, dis) => `<div class="seg" role="group" aria-label="${esc(lbl)}" data-k="${k}">`
    + opts.map(([v, l]) => `<button type="button" data-v="${String(v)}" aria-pressed="${String(v) === String(val)}"${dis ? ' disabled' : ''}>${esc(l)}</button>`).join('') + '</div>';
  const row = (k, lbl, opts, val, desc, dis) => {
    const short = opts.every(o => String(o[1]).length <= 22);
    const ctl = short ? seg(k, lbl, opts, val, dis)
      : `<select id="c_${k}" data-k="${k}">${opts.map(([v, l]) => `<option value="${String(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `${short ? `<span class="lbl">${esc(lbl)}</span>` : `<label for="c_${k}">${esc(lbl)}</label>`}${ctl}${desc ? `<div class="desc">${desc}</div>` : ''}`;
  };
  const can3d = V3.available();
  box.innerHTML = `<div class="hbar"><button class="tool" id="hBack">Volver</button><h2>Configuración</h2></div>
    <section class="cfgsec"><h3>Pantalla</h3><div class="cfg">
      ${row('view', 'Mesa', [['3d', '3D'], ['2d', '2D']], can3d && view3d ? '3d' : '2d', can3d ? 'La 3D tiene cámara que gira y caras que hacen las señas; la 2D es más simple.' : 'Este navegador no puede mostrar la mesa 3D.', !can3d)}
      ${row('help', 'Ayudas', [['1', 'Sí'], ['0', 'No']], showHelp ? '1' : '0', 'Marca qué cartas son pieza, mata o fío, qué significa cada seña y cuánto tenés de envido. Solo contra la computadora: en las partidas online van apagadas para todos.')}
      ${row('lugar', 'Lugar', ESCENARIOS_UI, escenarioSolo(), 'Dónde está la mesa 3D cuando jugás contra la computadora. En una mesa online lo elige quien la crea.', !can3d)}
      ${row('speed', 'Velocidad', Object.keys(SPEEDS).map(k => [k, k.charAt(0).toUpperCase() + k.slice(1)]), speed, 'Cuánto tarda la computadora en jugar.')}
    </div></section>
    <section class="cfgsec"><h3>Sonido</h3><div class="cfg">
      ${row('snd', 'Sonidos', [['1', 'Sí'], ['0', 'No']], SND.on ? '1' : '0', 'Barajar, repartir, cartas a la mesa, el golpe al gritar truco, tu turno y los últimos segundos. Suaves y cortos.')}
      ${row('vol', 'Volumen', [['bajo', 'Bajo'], ['medio', 'Medio'], ['alto', 'Alto']], SND.vol)}
    </div></section>
    <section class="cfgsec"><h3>Partido</h3><div class="cfg">
      ${row('level', 'Dificultad', [['facil', 'Fácil'], ['normal', 'Normal'], ['dificil', 'Difícil']], level, 'En difícil la computadora se acuerda de tus mentiras y tus faroles.')}
      ${row('real', 'Modo realista', [['0', 'No'], ['1', 'Sí']], realista ? '1' : '0', 'Cantás tus puntos a mano y podés equivocarte o negar la flor, con las penas del reglamento. Rige desde la próxima mano. Es para jugar contra la computadora: en las mesas online se juega siempre en modo realista.')}
    </div></section>`;
  $('hBack').onclick = () => { homeView = 'main'; renderHome(); if ($('hCfg')) $('hCfg').focus(); };
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
  else if (k === 'lugar') store.set('truco.lugar', v);
}
