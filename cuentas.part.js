// ---------- Cuentas: entrar con Google, perfil, ranking, historial y amigos ----------
// Las cuentas viven en el servidor (server/cuentas.mjs). El token de la sesión queda en este navegador
// (localStorage 'truco.sesion') y va en cada pedido; con las mesas del servidor va en el "hello".
let cuentaVista = { perfil: null, tipo: 'general', volver: 'main', datos: null, cargando: false, error: '', buscar: '', resultados: null, quitar: null, borrar: false, aviso: '' };
const cuentaOK = () => serverOK();
const conCuenta = () => !!(CUENTA.token && CUENTA.yo);

async function api(ruta, cuerpo){
  const h = {};
  if (CUENTA.token) h.authorization = 'Bearer ' + CUENTA.token;
  if (cuerpo) h['content-type'] = 'application/json';
  let r;
  try { r = await fetch(serverURL() + '/api/' + ruta, { method: cuerpo ? 'POST' : 'GET', headers: h, body: cuerpo ? JSON.stringify(cuerpo) : undefined }); }
  catch (e) { throw new Error('No hay conexión con el servidor.'); }
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (r.status === 401 && CUENTA.token && !/^cuenta\/google/.test(ruta)) cuentaOlvidar();
  if (!r.ok) throw new Error(j.error || 'Algo falló (' + r.status + ').');
  return j;
}
function cuentaGuardar(token, yo){
  if (token !== undefined) { CUENTA.token = token; if (token) store.set('truco.sesion', token); else store.del('truco.sesion'); }
  CUENTA.yo = yo || null;
  if (yo) store.set('truco.yo', JSON.stringify(yo)); else store.del('truco.yo');
}
function cuentaOlvidar(){
  cuentaGuardar(null, null);
  CUENTA.amigos = null;
  if (CUENTA.ws) { const w = CUENTA.ws; CUENTA.ws = null; try { w.close(); } catch (e) {} }
  try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) {}
  cuentaRepintar();
}
function cuentaRepintar(){ if (!$('home').hidden && ['main', 'perfil', 'ranking', 'amigos', 'admin', 'publicas', 'lobby', 'join', 'gremios', 'gremio'].includes(homeView)) renderHome(); }
// avisos de fondo (quién espera, quién se conectó): en el inicio se cambia solo lo que cambió, sin rehacer
// la pantalla (así no se mueve nada ni se recarga el botón de Google)
function cuentaRefrescar(){
  if ($('home').hidden) return;
  if (homeView !== 'main') { if (homeView === 'amigos' || homeView === 'publicas') renderHome(); return; }
  const box = $('hmain'), modos = box.querySelector('.hpub .hmodes'), clave = $('hpKey'), ficha = box.querySelector('.cficha.barra');
  if (!modos && !ficha) return;
  if (modos) modos.outerHTML = modosPublicosHTML();
  if (clave) clave.innerHTML = clavePublicasHTML();
  if (ficha && conCuenta()) ficha.outerHTML = fichaHTML();
  bindCuentaBotones(); bindPublicasHome();
}

async function cuentaInit(){
  if (!cuentaOK()) return;
  const antes = JSON.stringify(CUENTA.cfg);
  try { CUENTA.cfg = await api('cuenta/config'); store.set('truco.cfg', JSON.stringify(CUENTA.cfg)); }
  catch (e) { CUENTA.cfg = null; CUENTA.cfgFallo = true; cuentaRepintar(); return; }
  cuentaPublicas();
  if (CUENTA.token) {
    try { const r = await api('cuenta/yo'); const viejo = JSON.stringify(CUENTA.yo); cuentaGuardar(undefined, r.yo); cuentaConectar(); cuentaAmigos(); if (viejo !== JSON.stringify(r.yo)) cuentaRefrescar(); }
    catch (e) { /* sin red: queda lo guardado; sin sesión: api() ya la olvidó */ }
  }
  if (antes !== JSON.stringify(CUENTA.cfg)) cuentaRepintar();
}
async function cuentaEntro(r){
  cuentaGuardar(r.token, r.yo);
  cuentaConectar(); cuentaAmigos();
  // si ya estaba en una mesa del servidor, que la mesa sepa de la cuenta
  if (NET && NET.tr && NET.tr.kind === 'server') { NET.name = myName(); serverHello(); }
  cuentaVista.aviso = `Entraste como ${r.yo.apodo}.`;
  cuentaRepintar();
}
async function cuentaGoogle(credential){
  try { cuentaEntro(await api('cuenta/google', { credential })); }
  catch (e) { cuentaVista.aviso = e.message; cuentaRepintar(); }
}
async function cuentaSalir(){
  try { await api('cuenta/salir', {}); } catch (e) {}
  cuentaOlvidar();
}

// ---------- el botón de Google ----------
let gsiListo = null;
function gsiCargar(){
  if (gsiListo) return gsiListo;
  gsiListo = new Promise((res, rej) => {
    if (window.google && google.accounts && google.accounts.id) return res();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = () => res(); s.onerror = () => { gsiListo = null; rej(new Error('No se pudo cargar Google')); };
    document.head.appendChild(s);
  }).then(() => {
    google.accounts.id.initialize({ client_id: CUENTA.cfg.google, callback: r => cuentaGoogle(r.credential), ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true, context: 'signin' });
  });
  return gsiListo;
}
function gsiBoton(el){
  if (!el || !CUENTA.cfg || !CUENTA.cfg.google) return;
  gsiCargar().then(() => {
    if (!el.isConnected) return;
    el.innerHTML = '';
    google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'es', width: 250 });
  }).catch(() => { el.innerHTML = '<p class="hkey">No se pudo cargar el botón de Google. Revisá la conexión.</p>'; });
}

// ---------- conectado: quién está en línea e invitaciones ----------
let cuentaReintento = 0;
function cuentaConectar(){
  if (!CUENTA.token || CUENTA.ws || typeof WebSocket === 'undefined' || !cuentaOK()) return;
  let ws;
  try { ws = new WebSocket(serverURL().replace(/^http/, 'ws') + '/api/cuenta/ws'); } catch (e) { return; }
  CUENTA.ws = ws;
  let ping = null;
  ws.onopen = () => { cuentaReintento = 0; ws.send(JSON.stringify({ t: 'hola', token: CUENTA.token })); ping = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 30000); };
  ws.onmessage = e => {
    if (e.data === 'pong') return;
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.t === 'nosesion') { cuentaOlvidar(); return; }
    if (m.t === 'invita') invitacion(m);
    if (m.t === 'publicas') cuentaPublicas();
    if (m.t === 'amigos') { if (m.solicitud) avisoCuenta(`${m.solicitud} quiere ser tu amigo.`, 'amigos'); cuentaAmigos(); }
    if (m.t === 'mensaje') mensajeLlega(m);
    if (m.t === 'leidos') { const a = CUENTA.amigos && CUENTA.amigos.amigos.find(x => x.id === m.con); if (a && a.sinLeer) { a.sinLeer = 0; cuentaRefrescar(); } }
    if (m.t === 'presencia') {
      const a = CUENTA.amigos && CUENTA.amigos.amigos.find(x => x.id === m.id);
      if (a) { a.enLinea = !!m.enLinea; cuentaRefrescar(); }
    }
  };
  ws.onclose = () => {
    clearInterval(ping);
    if (CUENTA.ws === ws) CUENTA.ws = null;
    if (CUENTA.token) setTimeout(cuentaConectar, Math.min(30000, 1500 * Math.pow(2, cuentaReintento++)));
  };
}
async function cuentaAmigos(){
  if (!conCuenta()) return;
  try { CUENTA.amigos = await api('amigos'); } catch (e) { return; }
  cuentaRefrescar();
}
// al terminar un partido que contó para el ranking
function cuentaRanking(m){
  if (!conCuenta()) return;
  const d = m.delta > 0 ? `+${m.delta}` : String(m.delta);
  // ¿se consiguió algún logro con este partido? (el servidor manda lo de antes y lo de después)
  const nuevos = m.antes && m.despues ? LOGROS.filter(([, meta, f]) => (f(m.antes) | 0) < meta && (f(m.despues) | 0) >= meta) : [];
  if (nuevos.length) SND.play('win');
  avisoCuenta(`Ranking: ${d} puntos. Ahora tenés ${m.puntos}.` + (nuevos.length ? ` ¡${nuevos.length > 1 ? 'Logros nuevos' : 'Logro nuevo'}: ${nuevos.map(x => x[3] + ' ' + x[0]).join(', ')}!` : ''), nuevos.length ? 'perfil' : undefined);
  api('cuenta/yo').then(r => { cuentaGuardar(undefined, r.yo); }).catch(() => {});
}

// avisos flotantes (invitaciones, solicitudes, ranking), en cualquier pantalla
function avisoCuenta(texto, ir){
  let el = $('ctaToast');
  if (!el) { el = document.createElement('div'); el.id = 'ctaToast'; el.className = 'ctatoast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(texto)}</span>${ir ? '<button class="tool" id="ctaVer">Ver</button>' : ''}<button class="tool" id="ctaX" aria-label="Cerrar">✕</button>`;
  el.hidden = false;
  SND.play('chat');
  if (ir) $('ctaVer').onclick = () => { el.hidden = true; if ($('home').hidden) showHome(); if (typeof ir === 'function') ir(); else cuentaIr(ir); };
  $('ctaX').onclick = () => { el.hidden = true; };
  clearTimeout(avisoCuenta.t); avisoCuenta.t = setTimeout(() => { el.hidden = true; }, 9000);
}
function invitacion(m){
  let el = $('invToast');
  if (!el) { el = document.createElement('div'); el.id = 'invToast'; el.className = 'ctatoast inv'; el.setAttribute('role', 'alert'); document.body.appendChild(el); }
  const enEsa = NET && NET.code === m.codigo;
  el.innerHTML = `<span><b>${esc(m.de.apodo)}</b> te invita a jugar en su mesa <b>${esc(m.codigo)}</b>${NET && !enEsa ? ' (vas a salir de la mesa en la que estás)' : ''}.</span>
    <button class="act flor" id="invSi">${enEsa ? 'Ya estás ahí' : 'Entrar'}</button><button class="tool" id="invNo">Ahora no</button>`;
  el.hidden = false;
  SND.play('call', .2);
  $('invSi').onclick = () => {
    el.hidden = true;
    if (!enEsa) { if ($('home').hidden) showHome('lobby'); joinTable(m.codigo, myName()); }
  };
  $('invNo').onclick = () => { el.hidden = true; };
  clearTimeout(invitacion.t); invitacion.t = setTimeout(() => { el.hidden = true; }, 60000);
}
async function invitar(id){
  if (!NET || !NET.code) return;
  try {
    const r = await api('amigos/invitar', { id, codigo: NET.code });
    cuentaVista.aviso = r.enviada ? 'Invitación enviada.' : 'No está conectado ahora: pasale el código ' + NET.code + '.';
  } catch (e) { cuentaVista.aviso = e.message; }
  renderHome();
}

// ---------- pantallas ----------
function cuentaIr(vista, o){
  o = o || {};
  if (o.volver) cuentaVista.volver = o.volver;
  else if (homeView === 'main' || homeView === 'lobby') cuentaVista.volver = homeView;
  if (vista === 'perfil') cuentaVista.perfil = o.id || null;
  if (vista === 'gremio') cuentaVista.gremio = o.id || null;
  cuentaVista.datos = null; cuentaVista.error = ''; cuentaVista.quitar = null; cuentaVista.borrar = false;
  homeView = vista; renderHome();
  window.scrollTo(0, 0);
}
async function cuentaCargar(vista, ruta){
  if (cuentaVista.cargando) return;
  cuentaVista.cargando = true; cuentaVista.error = '';
  try { const d = await api(ruta); if (homeView === vista) cuentaVista.datos = d; }
  catch (e) { cuentaVista.error = e.message; }
  cuentaVista.cargando = false;
  if (homeView === vista) renderHome();
}
const iniciales = a => String(a || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const COLORES = ['#86b9e6', '#e8b13a', '#c9705c', '#7fbf8e', '#b48ad6', '#d98fb2', '#8fc7c4'];
const fotoURL = (id, v) => `${serverURL()}/api/foto/${id}?v=${v}`;
const colorDe = u => COLORES[Number.isInteger(u.color) ? u.color : (u.id || 0) % COLORES.length];
const avatar = (u, cls) => u.foto
  ? `<img class="avt ${cls || ''}" src="${esc(fotoURL(u.id, u.foto))}" alt="" loading="lazy" decoding="async">`
  : `<span class="avt ${cls || ''}" style="background:${colorDe(u)}" aria-hidden="true">${esc(iniciales(u.apodo))}</span>`;
const LUGARES = ['Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores', 'Florida', 'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú',
  'Río Negro', 'Rivera', 'Rocha', 'Salto', 'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres', 'Fuera de Uruguay'];
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
const fechaCorta = t => new Date(t).toLocaleDateString('es-UY', { day: 'numeric', month: 'short' }) + ' ' + new Date(t).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
const barra = titulo => `<div class="hbar"><button class="tool" id="hBack">Volver</button><h2>${titulo}</h2></div>`;
function volverDeCuenta(){ homeView = cuentaVista.volver === 'lobby' && NET ? 'lobby' : 'main'; renderHome(); }
function avisoHTML(){ const a = cuentaVista.aviso; cuentaVista.aviso = ''; return a ? `<p class="hnote ok" role="status">${esc(a)}</p>` : ''; }

// en el inicio, arriba: la ficha de la cuenta (con cuenta)
function fichaHTML(){
  const y = CUENTA.yo, A = CUENTA.amigos;
  const en = A ? A.amigos.filter(a => a.enLinea).length : 0, sol = A ? A.recibidas.length : 0, msj = A ? A.amigos.reduce((n, a) => n + (a.sinLeer || 0), 0) : 0;
  return `<section class="cficha barra">${avatar(y)}<div><b>${esc(y.apodo)}</b><span>${y.partidos ? `${y.puntos} puntos${y.posicion ? ` · puesto ${y.posicion}` : ''}` : 'Todavía sin partidos en el ranking'}</span></div>
    <nav class="hlinks" aria-label="Tu cuenta"><button class="tool" id="cPerfil">Mi perfil</button><button class="tool" id="cRank">Ranking</button><button class="tool" id="cGremios">${y.gremio ? 'Gremio ' + esc(y.gremio.sigla) : 'Gremios'}</button>
    <button class="tool" id="cAmigos">Amigos${en ? ` · ${en} en línea` : ''}${sol ? ` · <b class="cbadge">${sol} ${sol === 1 ? 'solicitud' : 'solicitudes'}</b>` : ''}${msj ? ` · <b class="cbadge">💬 ${msj}</b>` : ''}</button>${y.admin ? '<button class="tool" id="cAdmin">Administrar</button>' : ''}</nav></section>`;
}
function cuentaFichaHTML(){ return avisoHTML() + (conCuenta() ? fichaHTML() : ''); }
// la tarjeta principal: jugar con gente en las mesas públicas. Los modos dicen cuánta gente espera en cada
// uno (la lista completa está en "Ver las mesas"): así la tarjeta no cambia de alto cuando llega o se va alguien
function modosPublicosHTML(){
  return '<div class="hmodes">' + MODES.map(([n, nm]) => {
    const e = esperandoEn(n), p = e.reduce((a, m) => a + m.personas, 0);
    return `<button class="hmode pub${p ? ' hay' : ''}" data-pn="${n}">${tableSVG(n)}<div><b>${nm}</b><span>${p ? `<i class="dot on"></i> ${p} esperando` : 'Armá la mesa'}</span></div></button>`;
  }).join('') + '</div>';
}
function clavePublicasHTML(){
  const lista = CUENTA.publicas || [], gente = CUENTA.conectados || 0;
  return `<span class="hpg"><i class="dot${gente ? ' on' : ''}"></i> ${gente ? `${gente} ${gente === 1 ? 'persona conectada' : 'personas conectadas'} ahora` : 'Todavía no hay nadie más conectado'}</span>
    <span>Cada mesa tiene sus reglas: las elige quien la arma. Cuentan para el ranking. <button class="lnk" id="hPubVer">Ver las mesas${lista.length ? ` (${lista.length})` : ''}</button>${enJuegoPub().length ? ` · ${enJuegoPub().length} ${enJuegoPub().length === 1 ? 'partido' : 'partidos'} para mirar` : ''} · <button class="lnk" id="hRankVer">Ranking</button></span>`;
}
function publicasHomeHTML(){
  let h = `<section class="hpub"><h2>Jugar con gente</h2>
    <p class="hpsub">Elegí el modo y te sentás con quien esté esperando. Si no hay nadie, armás la mesa y aparece para los demás.</p>`;
  if (!conCuenta()) {
    h += `<div class="hpcta"><div id="hGsi" class="gsi"></div><span>Entrá con tu cuenta de Google para jugar con otras personas, aparecer en el ranking y sumar amigos.</span></div>`;
    if (CUENTA.cfg && CUENTA.cfg.prueba) h += `<form id="cPrueba" class="hlinks"><input id="cPruebaN" placeholder="Nombre de prueba" maxlength="20" aria-label="Nombre de prueba"><button class="tool" type="submit">Entrar de prueba</button></form>`;
  }
  return h + modosPublicosHTML() + `<p class="hkey" id="hpKey">${clavePublicasHTML()}</p></section>`;
}
function bindPublicasHome(){
  const box = $('hmain');
  box.querySelectorAll('[data-pn]').forEach(b => b.onclick = () => {
    if (!conCuenta()) { cuentaVista.aviso = 'Primero entrá con tu cuenta: es con el botón de Google, acá arriba.'; renderHome(); const g = $('hGsi'); if (g) g.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    buscarPublica(+b.dataset.pn);
  });
  if ($('hPubVer')) $('hPubVer').onclick = () => cuentaIr('publicas');
  if ($('hRankVer')) $('hRankVer').onclick = () => cuentaIr('ranking');
}
function bindCuentaBotones(){
  if ($('cPerfil')) $('cPerfil').onclick = () => cuentaIr('perfil');
  if ($('cRank')) $('cRank').onclick = () => cuentaIr('ranking');
  if ($('cGremios')) $('cGremios').onclick = () => cuentaIr('gremios');
  if ($('cAmigos')) $('cAmigos').onclick = () => cuentaIr('amigos');
  if ($('cAdmin')) $('cAdmin').onclick = () => cuentaIr('admin');
}
function bindCuenta(){
  bindCuentaBotones();
  if ($('hGsi')) gsiBoton($('hGsi'));
  if ($('cPrueba')) $('cPrueba').onsubmit = async e => {
    e.preventDefault();
    try { cuentaEntro(await api('cuenta/prueba', { nombre: $('cPruebaN').value })); } catch (x) { cuentaVista.aviso = x.message; renderHome(); }
  };
}

function historialHTML(lista, uid){
  if (!lista || !lista.length) return '<p class="hkey">Todavía no hay partidos en el ranking.</p>';
  const nom = x => esc(x.nombre) + (x.compu ? ' <small>(compu)</small>' : '');
  return '<ul class="hist">' + lista.map(r => {
    const mio = r.equipos[r.equipo] || [], otros = r.equipos[1 - r.equipo] || [];
    const con = mio.filter(x => x.cuenta !== uid);
    const res = r.abandono ? 'Abandonó' : r.gano ? 'Ganó' : 'Perdió';
    const d = r.delta > 0 ? '+' + r.delta : String(r.delta);
    const tm = /^(\d+) a (\d+)(.*)$/.exec(r.tanteador || ''), tant = tm && r.equipo === 1 ? `${tm[2]} a ${tm[1]}${tm[3]}` : r.tanteador || '';   // primero lo de su equipo
    return `<li class="${r.gano ? 'w' : 'l'}"><div><b>${res}</b> ${esc(tant)} <small>· ${esc(modeName(r.n))} · ${fechaCorta(r.fecha)}</small></div>
      <div class="hcon">${con.length ? 'con ' + con.map(nom).join(', ') + ' ' : ''}contra ${otros.map(nom).join(', ')}</div><span class="hd">${d}</span></li>`;
  }).join('') + '</ul>';
}
function statsHTML(p){
  const tile = (n, l) => `<div class="stile"><b>${n}</b><span>${l}</span></div>`;
  return `<div class="stiles">
    ${tile(p.partidos ? p.puntos : '—', p.posicion ? `puntos · puesto ${p.posicion}` : 'puntos')}
    ${tile(p.partidos ? `${p.ganados}/${p.partidos}` : '0', `partidos ganados (${pct(p.ganados, p.partidos)})`)}
    ${tile(p.racha, `racha (mejor: ${p.mejorRacha})`)}
    ${tile(p.mes.partidos ? p.mes.puntos : '—', `este mes · ${p.mes.partidos} ${p.mes.partidos === 1 ? 'partido' : 'partidos'}`)}
    ${tile(pct(p.manosGanadas, p.manos), `manos ganadas (${p.manos})`)}
    ${tile(p.envidos, 'envidos ganados')}
    ${tile(p.flores, 'flores cantadas')}
    ${tile(p.trucos, 'trucos ganados')}
    ${p.abandonos ? tile(p.abandonos, p.abandonos === 1 ? 'abandono' : 'abandonos') : ''}
  </div>`;
}

function renderPerfil(box){
  const propio = !cuentaVista.perfil || (CUENTA.yo && cuentaVista.perfil === CUENTA.yo.id);
  if (propio && !conCuenta()) { homeView = 'main'; return renderHome(); }
  const D = cuentaVista.datos;
  if (!D) {
    box.innerHTML = barra('Perfil') + (cuentaVista.error ? `<p class="hnote">${esc(cuentaVista.error)}</p>` : '<p class="lob">Cargando…</p>');
    $('hBack').onclick = volverDeCuenta;
    if (!cuentaVista.error) cuentaCargar('perfil', propio ? 'cuenta/yo' : 'cuenta/perfil?id=' + cuentaVista.perfil);
    return;
  }
  const p = propio ? D.yo : D.perfil;
  if (propio) cuentaGuardar(undefined, p);
  let h = barra(propio ? 'Mi perfil' : 'Perfil') + avisoHTML();
  const datos = [p.lugar ? (p.lugar === 'Fuera de Uruguay' ? 'Juega desde fuera de Uruguay' : 'De ' + esc(p.lugar)) : '', p.cuadro ? 'Hincha de ' + esc(p.cuadro) : ''].filter(Boolean).join(' · ');
  h += `<div class="cficha grande">${avatar(p, 'g')}<div><b>${esc(p.apodo)}</b>${p.nombre ? `<span class="cnom">${esc(p.nombre)}</span>` : ''}<span>${p.enLinea ? '<i class="dot on"></i> En línea · ' : ''}Juega desde ${new Date(p.desde).toLocaleDateString('es-UY', { month: 'long', year: 'numeric' })}${propio ? ` · cuenta n.º ${p.id}` : ''}</span>${datos ? `<span>${datos}</span>` : ''}</div></div>`;
  if (p.gremio) h += `<p class="cbio">Gremio: <button class="lnk" id="pGremio">[${esc(p.gremio.sigla)}] ${esc(p.gremio.nombre)}</button></p>`;
  if (p.bio) h += `<p class="cbio">${esc(p.bio)}</p>`;
  if (propio) h += `<div class="hlinks"><button class="act flor" id="pEditar">Editar perfil</button><button class="act sec" id="pPj">Tu personaje</button></div>`;
  h += statsHTML(p) + logrosHTML(p);
  if (!propio && D.relacion) {
    const r = D.relacion;
    h += '<div class="hlinks">' + (r === 'no' ? '<button class="tool" id="pAm" data-a="pedir">Agregar a amigos</button>'
      : r === 'enviada' ? '<span class="hkey">Solicitud enviada.</span><button class="tool" id="pAm" data-a="borrar">Cancelar solicitud</button>'
      : r === 'recibida' ? '<button class="act flor" id="pAm" data-a="aceptar">Aceptar solicitud de amistad</button>'
      : `<span class="hkey">Son amigos.</span>${NET && NET.code && p.enLinea ? '<button class="tool" id="pInv">Invitar a mi mesa</button>' : ''}`) + '</div>';
  }
  h += `<section><h2 class="h3">Últimos partidos</h2>${historialHTML(D.historial, p.id)}</section>`;
  if (propio) {
    h += `<div class="hlinks"><button class="tool" id="pSalir">Salir de la cuenta</button>${cuentaVista.borrar
        ? '<span class="hkey">Se borran tu cuenta, tus puntos, estadísticas, historial y amigos. No se puede deshacer.</span><button class="act mazo" id="pBorrarSi">Sí, borrar mi cuenta</button><button class="tool" id="pBorrarNo">Cancelar</button>'
        : '<button class="tool" id="pBorrar">Borrar mi cuenta</button>'}</div>
      <p class="hkey"><a href="https://tomasaldaya.github.io/truco-uruguayo/privacidad.html" target="_blank" rel="noopener">Qué se guarda de tu cuenta</a></p>`;
  }
  box.innerHTML = h;
  $('hBack').onclick = volverDeCuenta;
  if ($('pAm')) $('pAm').onclick = async () => {
    try { const r = await api('amigos/' + $('pAm').dataset.a, { id: p.id }); D.relacion = r.relacion; cuentaAmigos(); } catch (e) { cuentaVista.aviso = e.message; }
    renderHome();
  };
  if ($('pInv')) $('pInv').onclick = () => invitar(p.id);
  if ($('pGremio')) $('pGremio').onclick = () => cuentaIr('gremio', { id: p.gremio.id, volver: cuentaVista.volver });
  if ($('pEditar')) $('pEditar').onclick = () => { cuentaVista.edit = null; homeView = 'editar'; renderHome(); window.scrollTo(0, 0); };
  if ($('pPj')) $('pPj').onclick = pjModal;
  if ($('pSalir')) $('pSalir').onclick = async () => { await cuentaSalir(); homeView = 'main'; renderHome(); };
  if ($('pBorrar')) $('pBorrar').onclick = () => { cuentaVista.borrar = true; renderHome(); $('pBorrarNo').focus(); };
  if ($('pBorrarNo')) $('pBorrarNo').onclick = () => { cuentaVista.borrar = false; renderHome(); };
  if ($('pBorrarSi')) $('pBorrarSi').onclick = async () => {
    try { await api('cuenta/borrar', {}); cuentaOlvidar(); cuentaVista.aviso = 'Tu cuenta se borró.'; homeView = 'main'; }
    catch (e) { cuentaVista.aviso = e.message; }
    renderHome();
  };
}

function renderRanking(box){
  const D = cuentaVista.datos, tipo = cuentaVista.tipo;
  let h = barra('Ranking') + `<div class="seg" role="group" aria-label="Qué ranking"><button type="button" data-t="general" aria-pressed="${tipo === 'general'}">General</button><button type="button" data-t="mes" aria-pressed="${tipo === 'mes'}">Este mes</button></div>`;
  if (!D || D.tipo !== tipo) {
    h += cuentaVista.error ? `<p class="hnote">${esc(cuentaVista.error)}</p>` : '<p class="lob">Cargando…</p>';
    if (!cuentaVista.error) setTimeout(() => cuentaCargar('ranking', 'ranking' + (tipo === 'mes' ? '?tipo=mes' : '')), 0);
  } else {
    const yo = CUENTA.yo && CUENTA.yo.id;
    const fila = r => `<tr class="${r.id === yo ? 'me' : ''}" data-id="${r.id}" tabindex="0"><td>${r.pos}</td><td>${avatar(r, 'c')} ${esc(r.apodo)}</td><td>${r.puntos}</td><td>${r.partidos}</td><td>${pct(r.ganados, r.partidos)}</td></tr>`;
    h += D.lista.length
      ? `<table class="rk"><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Partidos</th><th>Ganados</th></tr></thead><tbody>${D.lista.map(fila).join('')}${D.mio ? '<tr class="sep"><td colspan="5">…</td></tr>' + fila(D.mio) : ''}</tbody></table>`
      : `<p class="lob">${tipo === 'mes' ? 'Este mes todavía no se jugó ningún partido para el ranking.' : 'Todavía no hay partidos en el ranking.'}</p>`;
    const mes = new Date(D.mes + '-15').toLocaleDateString('es-UY', { month: 'long' });
    if (D.sinPartidos) h += `<p class="hkey">Además hay ${D.sinPartidos} ${D.sinPartidos === 1 ? 'persona con cuenta que todavía no jugó' : 'personas con cuenta que todavía no jugaron'} un partido para el ranking: aparecen después del primero.</p>`;
    h += `<p class="hkey">Cuentan los partidos terminados en mesas por internet donde hay alguien con cuenta en cada equipo (la computadora puede completar lugares). Todos arrancan con 1000 puntos: ganarle a alguien con más puntos da más.${tipo === 'mes' ? ` El ranking de ${mes} arranca de cero el primer día del mes.` : ''}${conCuenta() ? '' : ' Entrá con tu cuenta para aparecer.'}</p>`;
  }
  box.innerHTML = h;
  $('hBack').onclick = volverDeCuenta;
  box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { cuentaVista.tipo = b.dataset.t; cuentaVista.datos = null; cuentaVista.error = ''; renderHome(); });
  box.querySelectorAll('tr[data-id]').forEach(tr => { const ir = () => cuentaIr('perfil', { id: +tr.dataset.id, volver: cuentaVista.volver }); tr.onclick = ir; tr.onkeydown = e => { if (e.key === 'Enter') ir(); }; });
}

function renderAmigos(box){
  if (!conCuenta()) { homeView = 'main'; return renderHome(); }
  const A = CUENTA.amigos, enMesa = NET && NET.code && NET.tr && NET.tr.kind === 'server';
  let h = barra('Amigos') + avisoHTML();
  h += `<form class="hlinks" id="aBuscarF" role="search"><input id="aBuscar" maxlength="20" placeholder="Buscar por apodo" value="${esc(cuentaVista.buscar)}" aria-label="Buscar por apodo"><button class="tool" type="submit">Buscar</button></form>`;
  const R = cuentaVista.resultados;
  if (R) h += R.length ? '<ul class="amg">' + R.map(r => `<li>${avatar(r, 'c')}<button class="lnk" data-p="${r.id}">${esc(r.apodo)}</button><small>${r.puntos} pts</small>${
      r.relacion === 'no' ? `<button class="tool" data-ac="pedir" data-id="${r.id}">Agregar</button>`
      : r.relacion === 'recibida' ? `<button class="tool" data-ac="aceptar" data-id="${r.id}">Aceptar</button>`
      : `<span class="hkey">${r.relacion === 'amigos' ? 'Ya son amigos' : 'Solicitud enviada'}</span>`}</li>`).join('') + '</ul>'
    : '<p class="hkey">No encontré a nadie con ese apodo.</p>';
  if (!A) { h += '<p class="lob">Cargando…</p>'; setTimeout(cuentaAmigos, 0); }
  else {
    if (A.recibidas.length) h += '<section><h2 class="h3">Te quieren agregar</h2><ul class="amg">' + A.recibidas.map(r => `<li>${avatar(r, 'c')}<button class="lnk" data-p="${r.id}">${esc(r.apodo)}</button><small>${r.puntos} pts</small><button class="act flor" data-ac="aceptar" data-id="${r.id}">Aceptar</button><button class="tool" data-ac="borrar" data-id="${r.id}">Rechazar</button></li>`).join('') + '</ul></section>';
    h += '<section><h2 class="h3">Tus amigos</h2>';
    h += A.amigos.length ? '<ul class="amg">' + A.amigos.map(r => `<li><i class="dot ${r.enLinea ? 'on' : ''}" title="${r.enLinea ? 'En línea' : 'Desconectado'}"></i>${avatar(r, 'c')}<button class="lnk" data-p="${r.id}">${esc(r.apodo)}</button><small>${r.enLinea ? 'en línea' : r.puntos + ' pts'}</small><button class="tool" data-msj="${r.id}" aria-label="Mensajes con ${esc(r.apodo)}">💬${r.sinLeer ? ` <b class="cbadge">${r.sinLeer}</b>` : ''}</button>${
        enMesa && r.enLinea ? `<button class="tool" data-inv="${r.id}">Invitar a la mesa ${esc(NET.code)}</button>` : ''}${
        cuentaVista.quitar === r.id ? `<button class="act mazo" data-ac="borrar" data-id="${r.id}">Sí, quitar</button><button class="tool" data-q="">No</button>` : `<button class="tool sec" data-q="${r.id}" aria-label="Quitar a ${esc(r.apodo)} de tus amigos">Quitar</button>`}</li>`).join('') + '</ul>'
      : '<p class="hkey">Todavía no tenés amigos agregados. Buscalos por su apodo, o entrá al perfil de alguien desde el ranking o tu historial.</p>';
    h += '</section>';
    if (A.enviadas.length) h += '<section><h2 class="h3">Solicitudes que mandaste</h2><ul class="amg">' + A.enviadas.map(r => `<li>${avatar(r, 'c')}<button class="lnk" data-p="${r.id}">${esc(r.apodo)}</button><button class="tool" data-ac="borrar" data-id="${r.id}">Cancelar</button></li>`).join('') + '</ul></section>';
    h += `<p class="hkey">${enMesa ? 'Los amigos en línea reciben la invitación al instante y entran a tu mesa con un toque.' : 'Para invitar a un amigo, primero creá una mesa o entrá a una.'}</p>`;
  }
  box.innerHTML = h;
  $('hBack').onclick = volverDeCuenta;
  $('aBuscarF').onsubmit = async e => {
    e.preventDefault();
    cuentaVista.buscar = $('aBuscar').value.trim();
    if (cuentaVista.buscar.length < 2) { cuentaVista.resultados = null; cuentaVista.aviso = 'Escribí al menos dos letras.'; renderHome(); return; }
    try { cuentaVista.resultados = (await api('amigos/buscar?q=' + encodeURIComponent(cuentaVista.buscar))).lista; } catch (x) { cuentaVista.aviso = x.message; }
    renderHome(); $('aBuscar').focus();
  };
  box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => cuentaIr('perfil', { id: +b.dataset.p, volver: cuentaVista.volver }));
  box.querySelectorAll('[data-inv]').forEach(b => b.onclick = () => invitar(+b.dataset.inv));
  box.querySelectorAll('[data-msj]').forEach(b => b.onclick = () => abrirCharla(+b.dataset.msj));
  box.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { cuentaVista.quitar = b.dataset.q ? +b.dataset.q : null; renderHome(); });
  box.querySelectorAll('[data-ac]').forEach(b => b.onclick = async () => {
    const id = +b.dataset.id;
    try {
      const r = await api('amigos/' + b.dataset.ac, { id });
      if (cuentaVista.resultados) cuentaVista.resultados.forEach(x => { if (x.id === id) x.relacion = r.relacion; });
      cuentaVista.quitar = null;
      await cuentaAmigos();
    } catch (x) { cuentaVista.aviso = x.message; }
    renderHome();
  });
}

// ---------- Mensajes privados ----------
// Solo entre amigos (el servidor lo controla). Llegan al instante por la conexión de la cuenta; se guardan los
// últimos 200 de cada conversación. Mientras está abierta la charla, lo que llega se agrega sin rehacer la pantalla.
function abrirCharla(id){
  cuentaVista.charla = { id, datos: null, error: '' };
  cuentaIr('charla');
}
const horaMsj = t => new Date(t).toDateString() === new Date().toDateString() ? new Date(t).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }) : fechaCorta(t);
const msjHTML = m => `<div class="dmm${m.de === CUENTA.yo.id ? ' yo' : ''}" data-mid="${m.id}"><span>${esc(m.texto)}</span><small>${horaMsj(m.creado)}</small></div>`;
async function charlaCargar(antes){
  const C = cuentaVista.charla; if (!C || C.cargando) return;
  C.cargando = true;
  try {
    const r = await api('mensajes?con=' + C.id + (antes ? '&antes=' + antes : ''));
    if (!cuentaVista.charla || cuentaVista.charla.id !== C.id) return;
    if (antes && C.datos) { C.datos.lista = r.lista.concat(C.datos.lista); C.datos.mas = r.mas; }
    else C.datos = r;
    const a = CUENTA.amigos && CUENTA.amigos.amigos.find(x => x.id === C.id); if (a) a.sinLeer = 0;
  } catch (e) { C.error = e.message; }
  C.cargando = false;
  if (homeView === 'charla') renderHome();
}
function renderCharla(box){
  const C = cuentaVista.charla;
  if (!conCuenta() || !C) { homeView = 'amigos'; return renderHome(); }
  const D = C.datos;
  let h = `<div class="hbar"><button class="tool" id="hBack">Volver</button><h2>${D ? avatar(D.con, 'c') + ' ' + esc(D.con.apodo) : 'Mensajes'}</h2></div>` + avisoHTML();
  if (!D) {
    h += C.error ? `<p class="hnote">${esc(C.error)}</p>` : '<p class="lob">Cargando…</p>';
    box.innerHTML = h; $('hBack').onclick = () => { cuentaVista.charla = null; homeView = 'amigos'; renderHome(); };
    if (!C.error) setTimeout(() => charlaCargar(), 0);
    return;
  }
  h += `<div class="dm" id="dmLista" aria-live="polite">${D.mas ? '<button class="tool" id="dmMas">Ver los anteriores</button>' : ''}${D.lista.length ? D.lista.map(msjHTML).join('') : `<p class="hkey" id="dmVacio">Todavía no se escribieron. ${D.amigos ? '¡Mandale el primero!' : ''}</p>`}</div>`;
  h += D.amigos
    ? `<form class="dmf" id="dmF"><input id="dmT" maxlength="400" autocomplete="off" placeholder="Escribile a ${esc(D.con.apodo)}" aria-label="Mensaje"><button class="act flor" type="submit">Mandar</button></form>`
    : '<p class="hkey">Ya no son amigos: se pueden leer los mensajes, pero no mandar nuevos.</p>';
  h += '<p class="hkey">Solo los ven ustedes dos. Se guardan los últimos 200 de cada charla.</p>';
  box.innerHTML = h;
  $('hBack').onclick = () => { cuentaVista.charla = null; homeView = 'amigos'; renderHome(); };
  const L = $('dmLista'); L.scrollTop = L.scrollHeight;
  if ($('dmMas')) $('dmMas').onclick = () => charlaCargar(D.lista[0] && D.lista[0].id);
  if ($('dmF')) {
    const t = $('dmT'); if (C.borrador) t.value = C.borrador;
    t.oninput = () => { C.borrador = t.value; };
    $('dmF').onsubmit = async e => {
      e.preventDefault();
      const texto = t.value.trim(); if (!texto) return;
      t.value = ''; C.borrador = ''; t.focus();
      try { const r = await api('mensajes', { para: C.id, texto }); charlaAgregar(r.m); }
      catch (x) { t.value = texto; C.borrador = texto; cuentaVista.aviso = x.message; renderHome(); }
    };
    if (matchMedia('(pointer:fine)').matches) t.focus();
  }
}
// agrega un mensaje a la charla abierta (si no estaba), sin rehacer la pantalla
function charlaAgregar(m){
  const C = cuentaVista.charla; if (!C || !C.datos || C.datos.lista.some(x => x.id === m.id)) return;
  C.datos.lista.push(m);
  const L = $('dmLista'); if (!L || homeView !== 'charla' || $('home').hidden) return;
  if ($('dmVacio')) $('dmVacio').remove();
  const abajo = L.scrollHeight - L.scrollTop - L.clientHeight < 60;
  L.insertAdjacentHTML('beforeend', msjHTML(m));
  if (abajo || m.de === CUENTA.yo.id) L.scrollTop = L.scrollHeight;
}
function mensajeLlega(x){
  if (!conCuenta() || !x.m) return;
  const con = x.de ? x.de.id : x.con, C = cuentaVista.charla;
  const viendo = C && C.id === con && homeView === 'charla' && !$('home').hidden && !document.hidden;
  if (C && C.id === con) charlaAgregar(x.m);
  if (!x.de) return;                                    // lo mandé yo desde otra pestaña
  if (viendo) { api('mensajes/leido', { con }).catch(() => {}); SND.play('chat'); return; }
  const a = CUENTA.amigos && CUENTA.amigos.amigos.find(y => y.id === con);
  if (a) a.sinLeer = (a.sinLeer || 0) + 1;
  cuentaRefrescar();
  const txt = x.m.texto.length > 80 ? x.m.texto.slice(0, 80) + '…' : x.m.texto;
  avisoCuenta(`💬 ${x.de.apodo}: ${txt}`, () => abrirCharla(con));
}

// ---------- Gremios ----------
// Un gremio junta hasta 30 cuentas. Suma los partidos que juegan sus integrantes mientras están en él (para el
// ranking, como siempre: mesas del servidor con cuenta en los dos equipos) y compite en el ranking de gremios,
// general y del mes. Cualquiera con cuenta entra a uno o arma el suyo; quien lo armó está a cargo (puede sacar
// a alguien y cambiar el lema), y si se va, queda a cargo el que hace más que está.
function renderGremios(box){
  const D = cuentaVista.datos, tipo = cuentaVista.tipo === 'mes' ? 'mes' : 'general';
  let h = barra('Gremios') + avisoHTML();
  if (conCuenta()) h += CUENTA.yo.gremio
    ? `<div class="hlinks"><button class="act flor" id="gMio">Mi gremio: [${esc(CUENTA.yo.gremio.sigla)}] ${esc(CUENTA.yo.gremio.nombre)}</button></div>`
    : cuentaVista.crear
      ? `<form id="gCrear" class="eform gform"><label>Nombre<input id="gNom" maxlength="24" required placeholder="Los Pardos"></label><label>Sigla<input id="gSig" maxlength="4" required placeholder="LP"></label>
          <label>Lema (si querés)<input id="gLema" maxlength="80" placeholder="A la carga"></label><div class="hlinks"><button class="act flor" type="submit">Armar el gremio</button><button class="tool" type="button" id="gNo">Cancelar</button></div></form>`
      : `<div class="hlinks"><button class="act flor" id="gArmar">Armar un gremio</button><span class="hkey">o entrá a uno de la lista.</span></div>`;
  h += `<div class="seg" role="group" aria-label="Qué ranking"><button type="button" data-t="general" aria-pressed="${tipo === 'general'}">General</button><button type="button" data-t="mes" aria-pressed="${tipo === 'mes'}">Este mes</button></div>`;
  if (!D || D.tipo !== tipo) {
    h += cuentaVista.error ? `<p class="hnote">${esc(cuentaVista.error)}</p>` : '<p class="lob">Cargando…</p>';
    if (!cuentaVista.error) setTimeout(() => cuentaCargar('gremios', 'gremios' + (tipo === 'mes' ? '?tipo=mes' : '')), 0);
  } else {
    const mio = CUENTA.yo && CUENTA.yo.gremio && CUENTA.yo.gremio.id;
    const fila = g => { const x = tipo === 'mes' ? g.mes : g; return `<tr class="${g.id === mio ? 'me' : ''}" data-g="${g.id}" tabindex="0"><td>${g.pos}</td><td><b class="sigla">${esc(g.sigla)}</b> ${esc(g.nombre)}</td><td>${x.ganados}</td><td>${x.partidos}</td><td>${pct(x.ganados, x.partidos)}</td><td>${g.miembros}</td></tr>`; };
    h += D.lista.length
      ? `<table class="rk"><thead><tr><th>#</th><th>Gremio</th><th>Ganados</th><th>Jugados</th><th>%</th><th>Gente</th></tr></thead><tbody>${D.lista.map(fila).join('')}</tbody></table>`
      : `<p class="lob">${tipo === 'mes' ? 'Este mes todavía ningún gremio jugó un partido para el ranking.' : 'Todavía no hay gremios. ¡Armá el primero!'}</p>`;
    h += `<p class="hkey">Cada partido para el ranking que gana alguien de un gremio le suma uno a su gremio (si son dos del mismo gremio en el mismo equipo, suman los dos). Solo cuenta lo que se juega mientras se está en el gremio. Gana el que más partidos ganó; si empatan, el que jugó menos. El del mes arranca de cero el primer día.</p>`;
  }
  box.innerHTML = h;
  $('hBack').onclick = volverDeCuenta;
  if ($('gMio')) $('gMio').onclick = () => cuentaIr('gremio', { id: CUENTA.yo.gremio.id, volver: cuentaVista.volver });
  if ($('gArmar')) $('gArmar').onclick = () => { cuentaVista.crear = true; renderHome(); $('gNom').focus(); };
  if ($('gNo')) $('gNo').onclick = () => { cuentaVista.crear = false; renderHome(); };
  if ($('gCrear')) $('gCrear').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('gremio/crear', { nombre: $('gNom').value, sigla: $('gSig').value, lema: $('gLema').value });
      cuentaVista.crear = false; await gremioRefrescarYo(); cuentaIr('gremio', { id: r.id, volver: cuentaVista.volver });
    } catch (x) { cuentaVista.aviso = x.message; renderHome(); }
  };
  box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { cuentaVista.tipo = b.dataset.t; cuentaVista.datos = null; cuentaVista.error = ''; renderHome(); });
  box.querySelectorAll('tr[data-g]').forEach(tr => { const ir = () => cuentaIr('gremio', { id: +tr.dataset.g, volver: cuentaVista.volver }); tr.onclick = ir; tr.onkeydown = e => { if (e.key === 'Enter') ir(); }; });
}
async function gremioRefrescarYo(){ try { cuentaGuardar(undefined, (await api('cuenta/yo')).yo); } catch (e) {} }
function renderGremio(box){
  const D = cuentaVista.datos;
  if (!D) {
    box.innerHTML = barra('Gremio') + (cuentaVista.error ? `<p class="hnote">${esc(cuentaVista.error)}</p>` : '<p class="lob">Cargando…</p>');
    $('hBack').onclick = () => cuentaIr('gremios', { volver: cuentaVista.volver });
    if (!cuentaVista.error) cuentaCargar('gremio', 'gremio?id=' + cuentaVista.gremio);
    return;
  }
  const g = D.gremio, yo = CUENTA.yo && CUENTA.yo.id, aCargo = yo && g.dueno === yo;
  let h = barra('Gremio') + avisoHTML();
  h += `<div class="cficha grande"><span class="avt g gsig">${esc(g.sigla)}</span><div><b>${esc(g.nombre)}</b><span>Puesto ${g.posicion} · ${g.miembros} de ${D.max} · desde ${new Date(g.creado).toLocaleDateString('es-UY', { month: 'long', year: 'numeric' })}</span>${g.lema ? `<span><i>«${esc(g.lema)}»</i></span>` : ''}</div></div>`;
  const tile = (n, l) => `<div class="stile"><b>${n}</b><span>${l}</span></div>`;
  h += `<div class="stiles">${tile(g.ganados, `partidos ganados (${pct(g.ganados, g.partidos)})`)}${tile(g.partidos, 'partidos jugados')}${tile(g.mes.ganados, `ganados este mes (de ${g.mes.partidos})`)}</div>`;
  h += '<div class="hlinks">';
  if (D.mio) h += cuentaVista.borrar ? `<button class="act mazo" id="gSalirSi">Sí, salir del gremio</button><button class="tool" id="gSalirNo">No</button>` : `<button class="tool sec" id="gSalir">Salir del gremio</button>`;
  else if (conCuenta() && !D.enOtro && g.miembros < D.max) h += `<button class="act flor" id="gUnirme">Entrar al gremio</button>`;
  else if (D.enOtro) h += `<span class="hkey">Ya estás en otro gremio: para entrar a este, primero salí de ese.</span>`;
  else if (!conCuenta()) h += `<span class="hkey">Entrá con tu cuenta para sumarte.</span>`;
  h += '</div>';
  if (aCargo) h += `<form class="hlinks" id="gLemaF"><input id="gLemaN" maxlength="80" value="${esc(g.lema)}" placeholder="Lema del gremio" aria-label="Lema del gremio"><button class="tool" type="submit">Cambiar el lema</button></form>`;
  h += '<section><h2 class="h3">Integrantes</h2><ul class="amg">' + D.miembros.map(r => `<li><i class="dot ${r.enLinea ? 'on' : ''}" title="${r.enLinea ? 'En línea' : 'Desconectado'}"></i>${avatar(r, 'c')}<button class="lnk" data-p="${r.id}">${esc(r.apodo)}</button><small>${r.id === g.dueno ? 'a cargo · ' : ''}${r.puntos} pts · ${r.ganados}/${r.partidos}</small>${
      aCargo && r.id !== yo ? (cuentaVista.quitar === r.id ? `<button class="act mazo" data-echar="${r.id}">Sí, sacar</button><button class="tool" data-q="">No</button>` : `<button class="tool sec" data-q="${r.id}">Sacar</button>`) : ''}</li>`).join('') + '</ul></section>';
  box.innerHTML = h;
  $('hBack').onclick = () => cuentaIr('gremios', { volver: cuentaVista.volver });
  const hacer = async (ruta, cuerpo, aviso) => {
    try { await api(ruta, cuerpo); if (aviso) cuentaVista.aviso = aviso; } catch (x) { cuentaVista.aviso = x.message; }
    cuentaVista.borrar = false; cuentaVista.quitar = null; await gremioRefrescarYo();
    cuentaVista.datos = null; renderHome();
  };
  if ($('gUnirme')) $('gUnirme').onclick = () => hacer('gremio/unirme', { id: g.id }, `Entraste a ${g.nombre}.`);
  if ($('gSalir')) $('gSalir').onclick = () => { cuentaVista.borrar = true; renderHome(); };
  if ($('gSalirNo')) $('gSalirNo').onclick = () => { cuentaVista.borrar = false; renderHome(); };
  if ($('gSalirSi')) $('gSalirSi').onclick = async () => {
    try { await api('gremio/salir', {}); cuentaVista.aviso = `Saliste de ${g.nombre}.`; } catch (x) { cuentaVista.aviso = x.message; }
    cuentaVista.borrar = false; await gremioRefrescarYo(); cuentaIr('gremios', { volver: cuentaVista.volver });
  };
  if ($('gLemaF')) $('gLemaF').onsubmit = e => { e.preventDefault(); hacer('gremio/editar', { lema: $('gLemaN').value }, 'Listo, cambió el lema.'); };
  box.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { cuentaVista.quitar = b.dataset.q ? +b.dataset.q : null; renderHome(); });
  box.querySelectorAll('[data-echar]').forEach(b => b.onclick = () => hacer('gremio/echar', { id: +b.dataset.echar }));
  box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => cuentaIr('perfil', { id: +b.dataset.p, volver: cuentaVista.volver }));
}

// solo para quien administra el juego (ADMINS en wrangler.jsonc): quiénes se van creando una cuenta
// el panel de quien administra: las cuentas, los reportes de los jugadores y cuánto se usa el juego
const ADM_TABS = [['cuentas', 'Cuentas', 'admin/cuentas'], ['reportes', 'Reportes', 'admin/reportes'], ['uso', 'Uso', 'admin/uso']];
function renderAdmin(box){
  if (!conCuenta() || !CUENTA.yo.admin) { homeView = 'main'; return renderHome(); }
  const tab = cuentaVista.adm || 'cuentas', D = cuentaVista.datos;
  let h = barra('Administrar') + `<div class="seg" role="group" aria-label="Sección">${ADM_TABS.map(([k, t]) => `<button type="button" data-adm="${k}" aria-pressed="${tab === k}">${t}</button>`).join('')}</div>` + avisoHTML();
  const enlazar = () => {
    $('hBack').onclick = () => { cuentaVista.adm = 'cuentas'; volverDeCuenta(); };
    box.querySelectorAll('[data-adm]').forEach(b => b.onclick = () => { if (b.dataset.adm === tab) return; cuentaVista.adm = b.dataset.adm; cuentaVista.datos = null; cuentaVista.error = ''; renderHome(); });
  };
  if (!D) {
    h += cuentaVista.error ? `<p class="hnote">${esc(cuentaVista.error)}</p>` : '<p class="lob">Cargando…</p>';
    box.innerHTML = h; enlazar();
    if (!cuentaVista.error) cuentaCargar('admin', ADM_TABS.find(t => t[0] === tab)[2]);
    return;
  }
  if (tab === 'reportes') return adminReportes(box, h, D, enlazar);
  if (tab === 'uso') return adminUso(box, h, D, enlazar);
  const tile = (n, l) => `<div class="stile"><b>${n}</b><span>${l}</span></div>`;
  const cuando = t => t ? fechaCorta(t) : '—';
  h += `<div class="stiles">${tile(D.total, 'cuentas en total')}${tile(D.hoy, 'creadas hoy')}${tile(D.semana, 'en los últimos 7 días')}${tile(D.conPartidos, 'ya jugaron para el ranking')}${tile(D.enLinea, 'conectadas ahora')}</div>`;
  h += D.lista.length ? `<table class="rk adm"><thead><tr><th>#</th><th>Apodo</th><th>Se creó</th><th>Última vez</th><th>Partidos</th></tr></thead><tbody>${D.lista.map(r =>
      `<tr data-id="${r.id}" tabindex="0"><td>${r.id}</td><td>${r.enLinea ? '<i class="dot on" title="En línea"></i> ' : ''}${avatar(r, 'c')} ${esc(r.apodo)}${r.foto || r.textos ? ` <button class="tool mini" data-limpiar="${r.id}" title="Quitar la foto, el nombre, la biografía y el cuadro">Quitar foto y textos</button>` : ''}</td><td>${cuando(r.creado)}</td><td>${r.enLinea ? 'ahora' : cuando(r.visto)}</td><td>${r.partidos}${r.partidos ? ` <small>(${r.puntos} pts)</small>` : ''}</td></tr>`).join('')}</tbody></table>`
    : '<p class="lob">Todavía no se creó ninguna cuenta.</p>';
  h += '<p class="hkey">De la más nueva a la más vieja. Solo vos ves esta lista; tocá una fila para ver el perfil. No se guarda el correo de nadie.</p><div class="hlinks"><button class="tool" id="aAct">Actualizar</button></div>';
  box.innerHTML = h; enlazar();
  $('aAct').onclick = () => { cuentaVista.datos = null; renderHome(); };
  box.querySelectorAll('tr[data-id]').forEach(tr => { const ir = () => cuentaIr('perfil', { id: +tr.dataset.id, volver: 'main' }); tr.onclick = ir; tr.onkeydown = e => { if (e.key === 'Enter') ir(); }; });
  box.querySelectorAll('[data-limpiar]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Quitar'; return; }
    try { await api('admin/limpiar', { id: +b.dataset.limpiar }); cuentaVista.datos = null; } catch (x) { cuentaVista.aviso = x.message; }
    renderHome();
  });
}

const MOTIVO_TXT = { insultos: 'Insultos', trampa: 'Trampa', abandono: 'Abandono', perfil: 'Perfil ofensivo', otro: 'Otro' };
function adminReportes(box, h, D, enlazar){
  h += `<p class="hkey">${D.nuevos ? `${D.nuevos} sin ver.` : 'No hay reportes sin ver.'} Suspender no deja entrar a mesas públicas; las de amigos siguen andando.</p>`;
  h += D.lista.length ? D.lista.map(r => `<div class="panel rep${r.estado === 'nuevo' ? ' nuevo' : ''}">
      <p><b>${esc(MOTIVO_TXT[r.motivo] || r.motivo)}</b> · ${fechaCorta(r.creado)} · mesa ${esc(r.mesa || '—')}<br>
      <small>${esc(r.de.apodo || '#' + r.de.id)} reportó a</small> <b>${esc(r.a ? r.a.apodo : r.nombre)}</b>${r.a && r.a.suspendido ? ` <small>(suspendido hasta ${fechaCorta(r.a.suspendido)})</small>` : ''}</p>
      ${r.detalle ? `<p>“${esc(r.detalle)}”</p>` : ''}
      ${r.chat.length ? `<details><summary>Chat (${r.chat.length})</summary>${r.chat.map(l => `<div class="cm"><b>${esc(l.n)}</b> ${esc(l.t)}</div>`).join('')}</details>` : ''}
      <div class="hlinks">${r.estado === 'nuevo' ? `<button class="tool" data-visto="${r.id}">Marcar visto</button>` : `<small>Visto</small>`}
        ${r.a ? (r.a.suspendido ? `<button class="tool" data-susp="${r.a.id}" data-h="0">Quitar la suspensión</button>`
          : [[24, '1 día'], [168, '7 días'], [720, '30 días']].map(([n, t]) => `<button class="tool" data-susp="${r.a.id}" data-h="${n}" data-rep="${r.id}">Suspender ${t}</button>`).join(' ')) : '<small>(sin cuenta)</small>'}
        ${r.a ? `<button class="tool" data-ver="${r.a.id}">Ver perfil</button>` : ''}</div></div>`).join('')
    : '<p class="lob">Nadie reportó a nadie todavía.</p>';
  h += '<div class="hlinks"><button class="tool" id="aAct">Actualizar</button></div>';
  box.innerHTML = h; enlazar();
  const otra = async (ruta, cuerpo) => { try { await api(ruta, cuerpo); cuentaVista.datos = null; } catch (x) { cuentaVista.aviso = x.message; } renderHome(); };
  $('aAct').onclick = () => { cuentaVista.datos = null; renderHome(); };
  box.querySelectorAll('[data-visto]').forEach(b => b.onclick = () => otra('admin/reporte', { id: +b.dataset.visto, estado: 'visto' }));
  box.querySelectorAll('[data-susp]').forEach(b => b.onclick = async () => {
    if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = '¿Seguro?'; return; }
    const r = D.lista.find(x => x.id === +b.dataset.rep);
    if (r) { try { await api('admin/reporte', { id: r.id, estado: 'visto' }); } catch (x) {} }
    otra('admin/suspender', { id: +b.dataset.susp, horas: +b.dataset.h, motivo: r ? 'Por un reporte: ' + (MOTIVO_TXT[r.motivo] || r.motivo).toLowerCase() : '' });
  });
  box.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => cuentaIr('perfil', { id: +b.dataset.ver, volver: 'main' }));
}
function adminUso(box, h, D, enlazar){
  const TIP = [['abre', 'Abrieron'], ['instalada', 'Instalada'], ['solo', 'Contra la compu'], ['online', 'Online']];
  const dias = [...new Set(D.visitas.map(v => v.dia))];
  const n = (d, t) => (D.visitas.find(v => v.dia === d && v.tipo === t) || {}).n || 0;
  const total = t => D.visitas.filter(v => v.tipo === t).reduce((a, v) => a + v.n, 0);
  h += `<div class="stiles">${TIP.map(([t, l]) => `<div class="stile"><b>${total(t)}</b><span>${l} · 30 días</span></div>`).join('')}</div>`;
  h += dias.length ? `<table class="rk adm"><thead><tr><th>Día</th>${TIP.map(t => `<th>${t[1]}</th>`).join('')}</tr></thead><tbody>${dias.map(d => `<tr><td>${esc(d)}</td>${TIP.map(([t]) => `<td>${n(d, t)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="lob">Todavía no hay visitas contadas.</p>';
  h += `<h3>De dónde vienen</h3>` + (D.origenes.length ? `<table class="rk adm"><tbody>${D.origenes.map(o => `<tr><td>${esc(o.origen || '(directo)')}</td><td>${o.n}</td></tr>`).join('')}</tbody></table>` : '<p class="lob">Sin datos.</p>');
  h += `<h3>Errores en los navegadores · 7 días</h3>` + (D.errores.length ? `<table class="rk adm"><thead><tr><th>Error</th><th>Veces</th><th>Último</th></tr></thead><tbody>${D.errores.map(e => `<tr><td><small>${esc(e.firma)}</small></td><td>${e.n}</td><td>${esc(e.ultimo)}</td></tr>`).join('')}</tbody></table>` : '<p class="lob">Ningún error. 🎉</p>');
  h += '<p class="hkey">Se cuenta por día, sin guardar quién es nadie ni su dirección. “Abrieron” es una vez por visita.</p><div class="hlinks"><button class="tool" id="aAct">Actualizar</button></div>';
  box.innerHTML = h; enlazar();
  $('aAct').onclick = () => { cuentaVista.datos = null; renderHome(); };
}

// ---------- editar el perfil ----------
// La foto se recorta cuadrada y se achica acá (256×256) antes de mandarla: pesa poco y sale igual en todos lados.
async function prepararFoto(file){
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Elegí una imagen (JPG, PNG o similar).');
  if (file.size > 25e6) throw new Error('Esa imagen es demasiado grande.');
  let img;
  try { img = await createImageBitmap(file); }
  catch (e) {
    img = await new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('No pude abrir esa imagen.')); }; i.src = u; });
  }
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const w = img.width, h = img.height, k = Math.max(S / w, S / h);
  const x = c.getContext('2d'); x.fillStyle = '#2a1d13'; x.fillRect(0, 0, S, S);
  x.drawImage(img, (S - w * k) / 2, (S - h * k) / 2, w * k, h * k);
  let d = c.toDataURL('image/webp', 0.82);
  if (!/^data:image\/webp/.test(d) || d.length > 110000) d = c.toDataURL('image/jpeg', 0.82);
  if (d.length > 110000) d = c.toDataURL('image/jpeg', 0.6);
  return d;
}
function renderEditar(box){
  if (!conCuenta()) { homeView = 'main'; return renderHome(); }
  const y = CUENTA.yo;
  const E = cuentaVista.edit || (cuentaVista.edit = { apodo: y.apodo, nombre: y.nombre || '', bio: y.bio || '', lugar: y.lugar || '', cuadro: y.cuadro || '', color: Number.isInteger(y.color) ? y.color : null, foto: undefined, preview: null, error: '' });
  const verFoto = E.foto === null ? null : E.preview || (y.foto ? fotoURL(y.id, y.foto) : null);
  const muestra = verFoto ? `<img class="avt g" src="${esc(verFoto)}" alt="Tu foto">` : `<span class="avt g" style="background:${COLORES[E.color ?? y.id % COLORES.length]}" aria-hidden="true">${esc(iniciales(E.apodo || y.apodo))}</span>`;
  box.innerHTML = barra('Editar perfil') + (E.error ? `<p class="hnote" role="alert">${esc(E.error)}</p>` : '') + `
    <form id="eForm" class="eform">
      <div class="efoto">${muestra}<div>
        <label class="tool" for="eFile">${verFoto ? 'Cambiar la foto' : 'Subir una foto'}</label><input type="file" id="eFile" accept="image/*" hidden>
        ${verFoto ? '<button type="button" class="tool" id="eSinFoto">Quitar la foto</button>' : ''}
        <p class="hkey">Se recorta cuadrada y la ven todos. ${verFoto ? '' : 'Sin foto, se usa tu inicial con el color que elijas.'}</p></div></div>
      ${verFoto ? '' : `<div class="ecolores" role="radiogroup" aria-label="Color">${COLORES.map((c, i) => `<button type="button" role="radio" aria-checked="${(E.color ?? y.id % COLORES.length) === i}" data-col="${i}" style="background:${c}" aria-label="Color ${i + 1}"></button>`).join('')}</div>`}
      <div class="cfg">
        <label for="eApodo">Apodo</label><input id="eApodo" maxlength="20" value="${esc(E.apodo)}" required>
        <div class="desc">El nombre que ven todos en las mesas y en el ranking. No puede repetirse.</div>
        <label for="eNombre">Nombre</label><input id="eNombre" maxlength="40" value="${esc(E.nombre)}" placeholder="Opcional" autocomplete="name">
        <div class="desc">Si querés que se vea en tu perfil.</div>
        <label for="eBio">Sobre vos</label><textarea id="eBio" maxlength="200" rows="3" placeholder="Desde cuándo jugás, con quién, tu jugada favorita…">${esc(E.bio)}</textarea>
        <div class="desc"><span id="eCuenta">${E.bio.length}</span> de 200</div>
        <label for="eLugar">De dónde sos</label><select id="eLugar"><option value="">Prefiero no decir</option>${LUGARES.map(l => `<option ${l === E.lugar ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <label for="eCuadro">Tu cuadro</label><input id="eCuadro" maxlength="30" value="${esc(E.cuadro)}" placeholder="Opcional">
      </div>
      <div class="row"><button class="act flor" type="submit" id="eGuardar">Guardar cambios</button><button class="act mazo" type="button" id="eCancelar">Cancelar</button></div>
    </form>`;
  const leer = () => { E.apodo = $('eApodo').value; E.nombre = $('eNombre').value; E.bio = $('eBio').value; E.lugar = $('eLugar').value; E.cuadro = $('eCuadro').value; };
  const volver = () => { cuentaVista.edit = null; cuentaVista.datos = null; cuentaVista.perfil = null; homeView = 'perfil'; renderHome(); };
  $('hBack').onclick = volver; $('eCancelar').onclick = volver;
  $('eBio').oninput = () => { $('eCuenta').textContent = $('eBio').value.length; };
  $('eFile').onchange = async () => {
    leer();
    try { const d = await prepararFoto($('eFile').files[0]); E.foto = d; E.preview = d; E.error = ''; }
    catch (x) { E.error = x.message; }
    renderHome();
  };
  if ($('eSinFoto')) $('eSinFoto').onclick = () => { leer(); E.foto = null; E.preview = null; renderHome(); };
  box.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { leer(); E.color = +b.dataset.col; renderHome(); });
  $('eForm').onsubmit = async e => {
    e.preventDefault(); leer();
    $('eGuardar').disabled = true; $('eGuardar').textContent = 'Guardando…';
    const cuerpo = { apodo: E.apodo, nombre: E.nombre, bio: E.bio, lugar: E.lugar, cuadro: E.cuadro, color: E.color };
    if (E.foto !== undefined) cuerpo.foto = E.foto;
    try {
      const r = await api('cuenta/editar', cuerpo);
      cuentaGuardar(undefined, r.yo);
      if (NET && NET.tr && NET.tr.kind === 'server' && !(NET.lobby && NET.lobby.started)) { NET.name = myName(); if (NET.owner) netPost({ t: 'name', name: NET.name }); }
      cuentaVista.aviso = 'Listo, tu perfil quedó guardado.';
      volver();
    } catch (x) { E.error = x.message; renderHome(); }
  };
}

// ---------- Cómo tanteás: cómo dejás los porotos en la mesa 3D (se guarda en este navegador y se manda al sentarte) ----------
const TANTEO_OP = [['montones', 'Montoncitos de 5'], ['filas', 'Filas de 5'], ['sueltos', 'Sueltos']];
const tanteoValido = k => TANTEO_OP.some(x => x[0] === k) ? k : null;
const miTanteo = () => (conCuenta() && CUENTA.yo.tanteo !== undefined ? tanteoValido(CUENTA.yo.tanteo) : tanteoValido(store.get('truco.tanteo')));
// cambiarlo se puede cuando quieras, también en pleno partido (como en la mesa de verdad): se reacomodan tus
// porotos y, si estás en una mesa online, los demás lo ven al toque
async function elegirTanteo(k){
  k = tanteoValido(k);
  store.set('truco.tanteo', k || '');
  if (conCuenta()) CUENTA.yo.tanteo = k;
  if (typeof GM !== 'undefined' && GM && GM.tqs && !NET) GM.tqs[ME] = k;
  if (NET && NET.started) {
    if (NET.role === 'host' && GM) { if (!GM.tqs) GM.tqs = Array(GM.n).fill(null); GM.tqs[NET.seat] = k; }
    else netPost({ t: 'tanteo', tq: k || null });
  }
  if (G && G.round && typeof render === 'function') render();
  if (conCuenta()) { try { const r = await api('cuenta/editar', { tanteo: k }); cuentaGuardar(undefined, r.yo); } catch (e) {} }
}
const TANTEO_SIG = { montones: 'filas', filas: 'sueltos', sueltos: 'montones' };

// ---------- Tu personaje: cómo te ven los demás en la mesa 3D ----------
// Se guarda en este navegador y, con cuenta, también en la cuenta (así es el mismo en el celular y en la
// compu). Se manda al sentarse en una mesa; los de la computadora tienen cada uno su cara.
function miPj(){ return pjValido(conCuenta() && CUENTA.yo.pj) || pjValido(store.get('truco.pj')); }
const hex = n => '#' + n.toString(16).padStart(6, '0');
function pjModal(){
  // las fotos salen del modelo 3D: si todavía no se bajó, se muestran círculos y se rehace al terminar de cargar
  if (!V3.listo && V3.available()) V3.cargar().then(r => { if (r && $('overlay2').innerHTML.includes('pjgrid')) pjModal(); });
  const yo = miPj();
  const op = (id, nombre, img) => `<button type="button" class="pjop" data-pj="${id}" aria-pressed="${(yo || '') === id}">${img}<b>${esc(nombre)}</b></button>`;
  const items = PERSONAJES.map(x => {
    const src = V3.retrato(x.id);
    return op(x.id, x.nombre, src ? `<img src="${src}" alt="" width="110" height="110">` : `<span class="pjsin" style="--piel:${hex(x.look.skin)};--pelo:${hex(x.look.hc)}" aria-hidden="true"></span>`);
  }).join('');
  toolModal(`<h3>Tu personaje</h3>
    <p class="small">Así te ven los demás en la mesa 3D. Vos mirás desde tu lugar, así que en tu pantalla no aparecés.${NET ? ' En la mesa en la que estás se ve desde la próxima vez que entres.' : ''}</p>
    <div class="pjgrid" role="group" aria-label="Personajes">${items}${op('', 'Que lo elija el juego', '<span class="pjsin nada" aria-hidden="true">?</span>')}</div>
    <p class="small" id="pjNota" role="status"></p>
    <h3>Cómo tanteás</h3>
    <p class="small">Cómo dejás los porotos al lado tuyo cuando tu equipo suma. En pleno partido también se cambia con el botón de los porotos, arriba en la mesa.</p>
    <div class="seg" role="group" aria-label="Cómo tanteás">${TANTEO_OP.concat([['', 'Que lo elija el juego']]).map(([k, t]) => `<button type="button" data-tq="${k}" aria-pressed="${(miTanteo() || '') === k}">${t}</button>`).join('')}</div>
    <div class="row"><button class="act" id="pjListo">Listo</button></div>`);
  document.querySelectorAll('.pjop').forEach(b => b.onclick = () => elegirPj(b.dataset.pj || null));
  document.querySelectorAll('[data-tq]').forEach(b => b.onclick = () => {
    document.querySelectorAll('[data-tq]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    elegirTanteo(b.dataset.tq);
  });
  $('pjListo').onclick = closeTool;
}
async function elegirPj(id){
  store.set('truco.pj', id || '');
  document.querySelectorAll('.pjop').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.pj || null) === id)));
  const nota = $('pjNota');
  if (nota) nota.textContent = id ? `Elegiste: ${PERSONAJES.find(x => x.id === id).nombre}.` : 'Te toca la cara del lugar donde te sientes.';
  if (!conCuenta()) return;
  try { const r = await api('cuenta/editar', { pj: id }); cuentaGuardar(undefined, r.yo); }
  catch (e) { if ($('pjNota')) $('pjNota').textContent = 'Quedó en este navegador, pero no se pudo guardar en tu cuenta: ' + e.message; }
}

// ---------- mesas públicas: cualquiera con cuenta elige el modo y se sienta donde esperan gente ----------
async function cuentaPublicas(){
  if (!cuentaOK()) return;
  try { const r = await api('publicas'); CUENTA.publicas = r.lista; CUENTA.conectados = r.conectados || 0; } catch (e) { return; }
  cuentaRefrescar();
}
const esperandoEn = n => (CUENTA.publicas || []).filter(m => m.n === n && !m.empezada && m.personas < m.n);
const enJuegoPub = () => (CUENTA.publicas || []).filter(m => m.empezada);
async function buscarPublica(n){
  if (!conCuenta()) return;
  try { CUENTA.publicas = (await api('publicas')).lista; } catch (e) {}
  const m = esperandoEn(n).filter(x => !(NET && NET.code === x.codigo))[0];   // la que tiene más gente (la lista viene ordenada así)
  if (m) joinTable(m.codigo, myName(), false, { publica: true });
  else abrirCrear(true, n);      // no hay nadie esperando: se arma una, eligiendo las reglas
}
function renderPublicas(box){
  const lista = CUENTA.publicas;
  let h = barra('Mesas públicas');
  if (netNote) { h += `<p class="hnote" role="alert">${esc(netNote)}</p>`; netNote = ''; }
  h += avisoHTML();
  h += '<p class="lob">Jugá con cualquiera que tenga cuenta. Elegí el modo: si hay una mesa esperando gente te sentás ahí, y si no, armás una nueva con las reglas que quieras y esperás a que llegue alguien.</p>';
  if (!conCuenta()) {
    h += '<p class="hnote">Para las mesas públicas tenés que entrar con tu cuenta.</p>';
    if (CUENTA.cfg && CUENTA.cfg.google) h += '<div id="hGsi" class="gsi"></div>';
  }
  h += '<div class="hmodes">' + MODES.map(([n, nm]) => {
    const e = esperandoEn(n), gente = e.reduce((a, m) => a + m.personas, 0);
    return `<button class="hmode" data-pn="${n}" ${conCuenta() ? '' : 'disabled'}>${tableSVG(n)}<div><b>${nm}</b><span>${gente ? `${gente} ${gente === 1 ? 'persona esperando' : 'personas esperando'}` : 'Nadie esperando: armás la mesa'}</span></div></button>`;
  }).join('') + '</div>';
  const esperan = lista && lista.filter(m => !m.empezada), juegan = lista && lista.filter(m => m.empezada);
  h += '<section><h2 class="h3">Mesas esperando gente</h2>';
  if (!lista) h += '<p class="lob">Cargando…</p>';
  else if (!esperan.length) h += '<p class="hkey">Ahora no hay ninguna. Elegí un modo y sé el primero: la mesa aparece acá para los demás.</p>';
  else h += '<ul class="amg">' + esperan.map(m => `<li><b>${esc(modeName(m.n))}</b><small>${esc(m.nombres.join(', '))} · ${m.personas} de ${m.n}</small><small class="mreg">${esc(cfgCorto(limpiarCfgMesa(m.cfg)))}</small>${conCuenta() ? `<button class="tool" data-pc="${m.codigo}">Sentarme</button>` : ''}</li>`).join('') + '</ul>';
  if (conCuenta()) h += `<div class="hlinks"><button class="tool" id="hPubNueva">Armar una mesa nueva</button></div>`;
  // los partidos que se están jugando: se pueden mirar (sin ver las cartas de nadie hasta que se juegan)
  if (juegan && juegan.length) {
    h += '</section><section><h2 class="h3">Partidos en juego</h2><ul class="amg">' + juegan.map(m => {
      const t = Array.isArray(m.tanto) ? ` · van ${m.tanto[0]} a ${m.tanto[1]}` : '', mir = m.mirando ? ` · ${m.mirando} mirando` : '';
      return `<li><b>${esc(modeName(m.n))}</b><small>${esc(m.nombres.join(', '))}${t}${mir}</small><small class="mreg">${esc(cfgCorto(limpiarCfgMesa(m.cfg)))}</small>${conCuenta() ? `<button class="tool" data-pm="${m.codigo}">Mirar</button>` : ''}</li>`;
    }).join('') + '</ul><p class="hkey">Mirando ves las cartas cuando se juegan, el tanteador y el chat de la mesa. Si molestás, los que juegan pueden votar echarte.</p>';
  }
  h += '</section><p class="hkey">Las reglas (a cuántos puntos, cuántos chicos, el achique, el chat y la voz) las elige quien arma la mesa. Todas se juegan con flor, 30 segundos por jugada y en modo realista. Empiezan solas cuando se llenan; si ya son dos o más y todos quieren, pueden empezar antes y la computadora completa los lugares libres. Cuentan para el ranking cuando hay gente en los dos equipos.</p>';
  box.innerHTML = h;
  $('hBack').onclick = () => { homeView = 'main'; renderHome(); };
  if ($('hGsi')) gsiBoton($('hGsi'));
  box.querySelectorAll('[data-pn]').forEach(b => b.onclick = () => buscarPublica(+b.dataset.pn));
  box.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => joinTable(b.dataset.pc, myName(), false, { publica: true }));
  box.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => joinTable(b.dataset.pm, myName(), false, { publica: true, mirar: true }));
  if ($('hPubNueva')) $('hPubNueva').onclick = () => abrirCrear(true, players);
  if (!lista) cuentaPublicas();
}

window.__trucoCuentaIr = (v, o) => { if ($('home').hidden) showHome(); cuentaIr(v, o); };
window.__trucoCuentaSalir = () => cuentaSalir(); window.__trucoNombre = () => myName(); window.__trucoSalirMesa = () => leaveNet(); window.__trucoHomeView = () => homeView;
window.__trucoCuenta = () => ({ token: !!CUENTA.token, yo: CUENTA.yo, cfg: CUENTA.cfg, ws: !!CUENTA.ws && CUENTA.ws.readyState, amigos: CUENTA.amigos });
cuentaInit();

// ---------- cuánto se usa y qué falla ----------
// Se cuenta por día y sin datos de nadie: que se abrió (y de dónde vino el enlace), si está instalada,
// si se juega contra la computadora u online. Los errores del navegador van igual: el texto y dónde, nada más.
const VERSION = '/*VERSION*/';
function avisarServidor(ruta, cuerpo){
  if (!serverOK()) return;
  try { fetch(serverURL() + '/api/' + ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo), keepalive: true }).catch(() => {}); } catch (e) {}
}
const VISTAS = new Set();
function visita(tipo){
  if (VISTAS.has(tipo)) return; VISTAS.add(tipo);   // una vez por visita y por tipo
  const c = { tipo };
  if (tipo === 'abre') {
    let o = '';
    try { o = new URLSearchParams(location.search).get('utm_source') || (document.referrer && new URL(document.referrer).hostname !== location.hostname ? new URL(document.referrer).hostname : ''); } catch (e) {}
    c.origen = o.replace(/^www\./, '');
  }
  avisarServidor('visita', c);
}
(function errores(){
  let n = 0;
  const mandar = (msg, donde) => { if (++n > 3 || !msg) return; avisarServidor('error', { msg: String(msg).slice(0, 160), donde: String(donde || '').slice(0, 80), v: VERSION }); };
  const lugar = (f, l) => f ? String(f).split('/').pop().split('?')[0] + ':' + (l || 0) : '';
  addEventListener('error', e => { if (e && e.message) mandar(e.message, lugar(e.filename, e.lineno)); });
  addEventListener('unhandledrejection', e => { const r = e && e.reason; mandar(r && r.message || String(r), r && r.stack ? String(r.stack).split('\n')[1] || '' : ''); });
  setTimeout(() => {
    visita('abre');
    try { if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) visita('instalada'); } catch (e) {}
  }, 1500);
})();
