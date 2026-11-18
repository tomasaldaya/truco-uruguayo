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
function cuentaRepintar(){ if (!$('home').hidden && ['main', 'perfil', 'ranking', 'amigos', 'lobby', 'join'].includes(homeView)) renderHome(); }

async function cuentaInit(){
  if (!cuentaOK()) return;
  try { CUENTA.cfg = await api('cuenta/config'); } catch (e) { CUENTA.cfg = null; return; }
  if (CUENTA.token) {
    try { const r = await api('cuenta/yo'); cuentaGuardar(undefined, r.yo); cuentaConectar(); cuentaAmigos(); }
    catch (e) { /* sin red: queda lo guardado; sin sesión: api() ya la olvidó */ }
  }
  cuentaRepintar();
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
    google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'es-419', width: 250 });
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
    if (m.t === 'amigos') { if (m.solicitud) avisoCuenta(`${m.solicitud} quiere ser tu amigo.`, 'amigos'); cuentaAmigos(); }
    if (m.t === 'presencia') {
      const a = CUENTA.amigos && CUENTA.amigos.amigos.find(x => x.id === m.id);
      if (a) { a.enLinea = !!m.enLinea; if (homeView === 'amigos' || homeView === 'main') cuentaRepintar(); }
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
  if (homeView === 'amigos' || homeView === 'main') cuentaRepintar();
}
// al terminar un partido que contó para el ranking
function cuentaRanking(m){
  if (!conCuenta()) return;
  const d = m.delta > 0 ? `+${m.delta}` : String(m.delta);
  avisoCuenta(`Ranking: ${d} puntos. Ahora tenés ${m.puntos}.`);
  api('cuenta/yo').then(r => { cuentaGuardar(undefined, r.yo); }).catch(() => {});
}

// avisos flotantes (invitaciones, solicitudes, ranking), en cualquier pantalla
function avisoCuenta(texto, ir){
  let el = $('ctaToast');
  if (!el) { el = document.createElement('div'); el.id = 'ctaToast'; el.className = 'ctatoast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(texto)}</span>${ir ? '<button class="tool" id="ctaVer">Ver</button>' : ''}<button class="tool" id="ctaX" aria-label="Cerrar">✕</button>`;
  el.hidden = false;
  SND.play('chat');
  if (ir) $('ctaVer').onclick = () => { el.hidden = true; if ($('home').hidden) showHome(); cuentaIr(ir); };
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
const avatar = (u, cls) => `<span class="avt ${cls || ''}" style="background:${COLORES[(u.id || 0) % COLORES.length]}" aria-hidden="true">${esc(iniciales(u.apodo))}</span>`;
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
const fechaCorta = t => new Date(t).toLocaleDateString('es-UY', { day: 'numeric', month: 'short' }) + ' ' + new Date(t).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
const barra = titulo => `<div class="hbar"><button class="tool" id="hBack">Volver</button><h2>${titulo}</h2></div>`;
function volverDeCuenta(){ homeView = cuentaVista.volver === 'lobby' && NET ? 'lobby' : 'main'; renderHome(); }
function avisoHTML(){ const a = cuentaVista.aviso; cuentaVista.aviso = ''; return a ? `<p class="hnote ok" role="status">${esc(a)}</p>` : ''; }

// en el inicio: entrar, o la ficha de la cuenta
function cuentaHTML(){
  if (!cuentaOK() || !CUENTA.cfg) return '';
  let h = '<section class="hcuenta"><h2>Tu cuenta</h2>' + avisoHTML();
  if (conCuenta()) {
    const y = CUENTA.yo, A = CUENTA.amigos;
    const en = A ? A.amigos.filter(a => a.enLinea).length : 0, sol = A ? A.recibidas.length : 0;
    h += `<div class="cficha">${avatar(y)}<div><b>${esc(y.apodo)}</b><span>${y.partidos ? `${y.puntos} puntos${y.posicion ? ` · puesto ${y.posicion} del ranking` : ''}` : 'Todavía sin partidos en el ranking'}</span></div></div>
      <div class="hlinks"><button class="tool" id="cPerfil">Mi perfil</button><button class="tool" id="cRank">Ranking</button>
      <button class="tool" id="cAmigos">Amigos${en ? ` · ${en} en línea` : ''}${sol ? ` · <b class="cbadge">${sol} ${sol === 1 ? 'solicitud' : 'solicitudes'}</b>` : ''}</button></div>`;
  } else {
    h += `<p class="hkey cta">Entrá con tu cuenta para aparecer en el ranking, guardar tus estadísticas e historial y jugar con amigos. Sin cuenta se puede jugar igual.</p>`;
    if (CUENTA.cfg.google) h += '<div id="hGsi" class="gsi"></div>';
    if (CUENTA.cfg.prueba) h += `<form id="cPrueba" class="hlinks"><input id="cPruebaN" placeholder="Nombre de prueba" maxlength="20" aria-label="Nombre de prueba"><button class="tool" type="submit">Entrar de prueba</button></form>`;
    h += '<div class="hlinks"><button class="tool" id="cRank">Ver el ranking</button></div>';
  }
  return h + '</section>';
}
function bindCuenta(){
  if ($('cPerfil')) $('cPerfil').onclick = () => cuentaIr('perfil');
  if ($('cRank')) $('cRank').onclick = () => cuentaIr('ranking');
  if ($('cAmigos')) $('cAmigos').onclick = () => cuentaIr('amigos');
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
  h += `<div class="cficha grande">${avatar(p, 'g')}<div><b>${esc(p.apodo)}</b><span>${p.enLinea ? '<i class="dot on"></i> En línea · ' : ''}Juega desde ${new Date(p.desde).toLocaleDateString('es-UY', { month: 'long', year: 'numeric' })}</span></div></div>`;
  h += statsHTML(p);
  if (!propio && D.relacion) {
    const r = D.relacion;
    h += '<div class="hlinks">' + (r === 'no' ? '<button class="tool" id="pAm" data-a="pedir">Agregar a amigos</button>'
      : r === 'enviada' ? '<span class="hkey">Solicitud enviada.</span><button class="tool" id="pAm" data-a="borrar">Cancelar solicitud</button>'
      : r === 'recibida' ? '<button class="act flor" id="pAm" data-a="aceptar">Aceptar solicitud de amistad</button>'
      : `<span class="hkey">Son amigos.</span>${NET && NET.code && p.enLinea ? '<button class="tool" id="pInv">Invitar a mi mesa</button>' : ''}`) + '</div>';
  }
  h += `<section><h2 class="h3">Últimos partidos</h2>${historialHTML(D.historial, p.id)}</section>`;
  if (propio) {
    h += `<section class="cfgsec"><h3>Apodo</h3><form class="hlinks" id="pApodoF"><input id="pApodo" maxlength="20" value="${esc(p.apodo)}" aria-label="Apodo"><button class="tool" type="submit">Cambiar</button></form>
      <p class="hkey">Es el nombre que ven todos en las mesas y en el ranking.</p></section>
      <div class="hlinks"><button class="tool" id="pSalir">Salir de la cuenta</button>${cuentaVista.borrar
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
  if ($('pApodoF')) $('pApodoF').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api('cuenta/apodo', { apodo: $('pApodo').value }); D.yo = r.yo; cuentaGuardar(undefined, r.yo); cuentaVista.aviso = 'Listo, ahora sos ' + r.yo.apodo + '.'; if (NET && NET.tr && NET.tr.kind === 'server' && !NET.lobby?.started) { NET.name = myName(); netPost({ t: 'name', name: NET.name }); } }
    catch (x) { cuentaVista.aviso = x.message; }
    renderHome();
  };
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
    h += A.amigos.length ? '<ul class="amg">' + A.amigos.map(r => `<li><i class="dot ${r.enLinea ? 'on' : ''}" title="${r.enLinea ? 'En línea' : 'Desconectado'}"></i>${avatar(r, 'c')}<button class="lnk" data-p="${r.id}">${esc(r.apodo)}</button><small>${r.enLinea ? 'en línea' : r.puntos + ' pts'}</small>${
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

window.__trucoCuentaIr = (v, o) => { if ($('home').hidden) showHome(); cuentaIr(v, o); };
window.__trucoCuentaSalir = () => cuentaSalir(); window.__trucoNombre = () => myName(); window.__trucoSalirMesa = () => leaveNet(); window.__trucoHomeView = () => homeView;
window.__trucoCuenta = () => ({ token: !!CUENTA.token, yo: CUENTA.yo, cfg: CUENTA.cfg, ws: !!CUENTA.ws && CUENTA.ws.readyState, amigos: CUENTA.amigos });
cuentaInit();
