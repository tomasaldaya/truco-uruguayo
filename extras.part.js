// ---------- En la mesa: dichos, gestos y sonidos; racha; reglamento; logros (19/11) ----------
// Un panel en el costado con tres pestañas, para tener abierto mientras se juega (y se habla por la voz):
//  - Dichos: el frasero, versitos y dichos del truco, del envido y de la flor, solo para leer y decirlos por la voz.
//  - Gestos: dedito para arriba, que no con el dedo… salen arriba de tu personaje y en la 3D se mueve.
//  - Sonidos: los oye toda la mesa (cada uno puede apagar los de los demás).
// Gestos y sonidos viajan solo como código (g:…, s:…) en el mensaje "gesto"; nunca texto libre. Para sumar dichos, gestos o
// sonidos, alcanza con agregarlos a estas listas (el código: minúsculas, números y guiones, hasta 24).

// El frasero: solo para leer (y decirlo por la voz); no toca el partido ni se muestra en la mesa.
// Para agregar un dicho, ponelo tal cual se dice en el grupo que va (truco, envido o flor).
const DICHOS = [
  ['truco', 'Truco', [
  ]],
  ['envido', 'Envido', [
  ]],
  ['flor', 'Flor', [
    'A lo Farruco: ¡flor y truco!',
    'Por el río Paraná venía navegando un piojo, con un hachazo en el ojo y una flor en el ojal.',
  ]],
];
// [código, emoji, qué es]. En la 3D el personaje hace el gesto con la mano (GA en mesa3d.part.js, mismo código).
const GESTOS = [
  ['pulgar', '👍', 'Dedito para arriba'],
  ['nodedo', '☝️', 'Que no, con el dedo'],
  ['aplauso', '👏', 'Aplausos'],
  ['risa', '😂', 'Me muero de risa'],
  ['bienahi', '🙌', 'Bien ahí'],
  ['mirar', '👀', 'Te estoy mirando'],
  ['quese', '🤷', 'Qué sé yo'],
  ['pensar', '🤔', 'Pensando…'],
  ['shh', '🤫', 'Shhh'],
  ['bronca', '😤', 'Qué bronca'],
  ['saludo', '👋', 'Hola / chau'],
  ['mate', '🧉', 'Un matecito'],
];
// [código, emoji, nombre]: los hace SND (sonido.part.js) en el momento. Los propios del jugador, más adelante.
const SONIDOS_MESA = [['aplausos', '👏', 'Aplausos'], ['silbido', '😙', 'Silbido'], ['grillos', '🦗', 'Grillos']];
const GESTO_VIVO = {};   // p -> { txt, at, ms, largo }: lo que se ve arriba de cada uno (mesa 2D)
let sonMesa = store.get('truco.sonmesa') !== '0', gestoAt = 0, mesaTab = store.get('truco.mesatab') || 'dichos', dichoTab = store.get('truco.dichotab') || 'truco';

function mandarGesto(k){
  const now = Date.now();
  if (now - gestoAt < 1500 || !G || mirando()) return;
  gestoAt = now;
  document.querySelectorAll('#mesaBox button[data-k]').forEach(b => { b.disabled = true; });
  setTimeout(() => document.querySelectorAll('#mesaBox button[data-k]').forEach(b => { b.disabled = false; }), 1500);
  if (NET && NET.role === 'host') { const m = { t: 'gesto', p: 0, k }; recibirGesto(m); netPost(m); }
  else if (NET) netPost({ t: 'gesto', k });   // el servidor (o el anfitrión) lo reparte, también a mí
  else recibirGesto({ p: ME, k });
}
function recibirGesto(m){
  if (!G || typeof m.p !== 'number' || m.p < 0 || m.p >= G.n || typeof m.k !== 'string') return;
  const tipo = m.k[0], id = m.k.slice(2), mio = m.p === ME && !mirando();
  let txt, ms = 2600, largo = false;
  if (tipo === 'g') { const x = GESTOS.find(g => g[0] === id); if (!x) return; txt = x[1] + ' ' + x[2]; ms = 2800; }
  else if (tipo === 's') { const x = SONIDOS_MESA.find(g => g[0] === id); if (!x) return; txt = x[1] + ' ' + x[2]; if (mio || sonMesa) SND.mesa(id); }
  else return;
  GESTO_VIVO[m.p] = { txt, at: Date.now(), ms, largo };
  if (use3D()) {
    const cartas = V3.gesto(m.p, txt, tipo === 'g' ? id : null, ms);
    if (cartas) { render(); setTimeout(() => { if (G) render(); }, cartas * 1000 + 30); }   // deja las cartas y las vuelve a agarrar
  }
  else { render(); setTimeout(() => { if (G && !use3D()) render(); }, ms + 80); }
}
// mesa 2D: si alguien acaba de hacer un gesto, va en su etiqueta (en vez de lo último que dijo)
function gestoBurbuja(parent, p){
  const g = GESTO_VIVO[p], pasó = g ? Date.now() - g.at : 1e9;
  if (!g || pasó >= g.ms) return false;
  const b = el('div', 'dicho gesto' + (g.largo ? ' largo' : ''), esc(g.txt));
  b.style.animationDuration = g.ms + 'ms'; b.style.animationDelay = -pasó + 'ms';
  parent.appendChild(b);
  return true;
}
// 🔥 al lado del nombre de quien lleva dos partidos o más ganados seguidos (con cuenta, en mesas del servidor)
function fuego(p){
  const r = G && G.rachas ? G.rachas[p] | 0 : 0;
  return r >= 2 ? ` <span class="fuego" title="Lleva ${r} partidos ganados seguidos">🔥${r}</span>` : '';
}

function mesaPanelHTML(){
  const tab = (k, nm) => `<button type="button" class="mtab" data-tab="${k}" aria-pressed="${mesaTab === k}">${nm}</button>`;
  const dtab = (k, nm) => `<button type="button" class="mtab chico" data-dtab="${k}" aria-pressed="${dichoTab === k}">${nm}</button>`;
  const dichos = `<div class="mtabs">${DICHOS.map(([k, nm]) => dtab(k, nm)).join('')}</div>` + DICHOS.map(([k, , l]) => `<div class="dpag" data-dpag="${k}"${dichoTab === k ? '' : ' hidden'}>${
    l.length ? l.map(tx => `<p class="mdicho">${esc(tx)}</p>`).join('') : '<p class="small">Todavía no hay dichos acá.</p>'}</div>`).join('');
  const gestos = GESTOS.map(([id, em, nm]) => `<button type="button" class="mgesto" data-k="g:${id}" title="${esc(nm)}"><span>${em}</span><small>${esc(nm)}</small></button>`).join('');
  const sonidos = SONIDOS_MESA.map(([id, em, nm]) => `<button type="button" class="mgesto" data-k="s:${id}" title="${esc(nm)}"><span>${em}</span><small>${esc(nm)}</small></button>`).join('');
  return `<div class="mtabs" role="group">${tab('dichos', 'Dichos')}${tab('gestos', 'Gestos')}${tab('sonidos', 'Sonidos')}</div>
    <div class="mpag" data-pag="dichos"${mesaTab === 'dichos' ? '' : ' hidden'}>${dichos}<p class="small">Para leerlos y decirlos por la voz.</p></div>
    <div class="mpag mgrid" data-pag="gestos"${mesaTab === 'gestos' ? '' : ' hidden'}>${gestos}</div>
    <div class="mpag" data-pag="sonidos"${mesaTab === 'sonidos' ? '' : ' hidden'}><div class="mgrid">${sonidos}</div>
      <label class="msw"><input type="checkbox" id="sonMesa"${sonMesa ? ' checked' : ''}> Escuchar los sonidos de los demás</label>
      <p class="small">Suenan con el volumen de Configuración; si tenés el sonido apagado, no se oyen.</p></div>`;
}
function mesaPanelSync(){
  const P = $('mesaPanel'); if (!P) return;
  const ver = !!G && !mirando() && $('home').hidden;
  if (P.hidden === !ver) return;
  P.hidden = !ver;
  if (ver && !P.dataset.listo) {
    P.dataset.listo = '1';
    const box = $('mesaBox'); box.innerHTML = mesaPanelHTML();
    box.onclick = e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.dtab) {
        dichoTab = t.dataset.dtab; store.set('truco.dichotab', dichoTab);
        box.querySelectorAll('[data-dtab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dtab === dichoTab)));
        box.querySelectorAll('.dpag').forEach(x => { x.hidden = x.dataset.dpag !== dichoTab; });
      } else if (t.dataset.tab) {
        mesaTab = t.dataset.tab; store.set('truco.mesatab', mesaTab);
        box.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === mesaTab)));
        box.querySelectorAll('.mpag').forEach(x => { x.hidden = x.dataset.pag !== mesaTab; });
      } else if (t.dataset.k) mandarGesto(t.dataset.k);
    };
    $('sonMesa').onchange = e => { sonMesa = e.target.checked; store.set('truco.sonmesa', sonMesa ? '1' : '0'); };
  }
}

// ---------- El reglamento completo (reglamento.txt, que build.py mete en REGLAMENTO) ----------
function reglamentoModal(){
  const parr = REGLAMENTO.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const indice = []; let body = '';
  parr.forEach((t, i) => {
    const titulo = t.length < 90 && t === t.toUpperCase() && !/^ART/.test(t);
    if (/^CAP[IÍ]TULO/.test(t)) { indice.push([i, t.replace(/^CAP[IÍ]TULO\s*/, '').replace(/\..*$/, '')]); body += `<h4 id="rg${i}">${esc(t)}</h4>`; }
    else if (titulo) body += i < 2 ? `<h3>${esc(t)}</h3>` : `<h5>${esc(t)}</h5>`;
    else { const m = /^(ART[IÍ]CULO\s+[^—]{1,12}—)\s*([\s\S]*)$/.exec(t); body += m ? `<p><b>${esc(m[1])}</b> ${esc(m[2])}</p>` : `<p>${esc(t)}</p>`; }
  });
  toolModal(`<h3>Reglamento del Truco Uruguayo</h3>
    <div class="rgtop"><input type="search" id="rgBus" placeholder="Buscar (por ejemplo: flor, Art. 45, pico)" aria-label="Buscar en el reglamento">
    <div class="rgidx">${indice.map(([i, nm]) => `<button type="button" class="tool" data-rg="${i}">${esc(nm.charAt(0) + nm.slice(1).toLowerCase())}</button>`).join('')}</div></div>
    <div class="rgtxt" id="rgTxt">${body}</div>
    <p class="small">Transcripción de Tomás Aldaya (noviembre 2025). El juego sigue este reglamento con las decisiones que se cuentan en Cómo se juega.</p>
    <div class="row"><button class="act" id="mOk">Cerrar</button></div>`);
  $('mOk').onclick = closeTool;
  document.querySelectorAll('[data-rg]').forEach(b => b.onclick = () => { const h = $('rg' + b.dataset.rg); if (h) h.scrollIntoView({ block: 'start' }); });
  $('rgBus').oninput = e => {
    const q = e.target.value.trim().toLowerCase().replace(/^art\.?\s*/, 'artículo ');
    $('rgTxt').querySelectorAll('p').forEach(p => { p.hidden = !!q && !p.textContent.toLowerCase().includes(q); });
  };
}

// ---------- Logros (en el perfil), con lo que ya guarda la cuenta ----------
// [qué, cuánto hace falta, de dónde sale, emoji]. Se calculan al mostrar el perfil: no hace falta guardar nada más.
const LOGROS = [
  ['Primera victoria', 1, p => p.ganados, '🥇'], ['Ganar 5 partidos', 5, p => p.ganados, '🖐️'],
  ['Ganar 25 partidos', 25, p => p.ganados, '🏅'], ['Ganar 100 partidos', 100, p => p.ganados, '🏆'],
  ['Ganar 3 seguidos', 3, p => p.mejorRacha, '🔥'], ['Ganar 5 seguidos', 5, p => p.mejorRacha, '☄️'], ['Ganar 10 seguidos', 10, p => p.mejorRacha, '🌋'],
  ['Cantar 10 flores', 10, p => p.flores, '🌼'], ['Cantar 50 flores', 50, p => p.flores, '💐'],
  ['Ganar 25 trucos', 25, p => p.trucos, '🃏'], ['Ganar 25 envidos', 25, p => p.envidos, '🎯'],
  ['Ganar una falta envido', 1, p => p.faltas || 0, '💥'], ['Ganar una falta envido con 37', 1, p => p.falta37 || 0, '👑'],
  ['Jugar 50 partidos', 50, p => p.partidos, '🧉'], ['Estar entre los 10 primeros', 1, p => p.partidos && p.posicion && p.posicion <= 10 ? 1 : 0, '⭐'],
];
function logrosHTML(p){
  const l = LOGROS.map(([nm, meta, f, em]) => { const v = Math.max(0, f(p) | 0); return { nm, meta, v: Math.min(v, meta), ok: v >= meta, em }; });
  const n = l.filter(x => x.ok).length;
  return `<h3 class="clogt">Logros <small>${n} de ${l.length}</small></h3><div class="logros">` + l.map(x =>
    `<div class="logro${x.ok ? ' ok' : ''}" title="${esc(x.nm)}${x.ok ? ': conseguido' : `: ${x.v} de ${x.meta}`}"><span>${x.em}</span><b>${esc(x.nm)}</b>${x.ok || x.meta === 1 ? '' : `<i style="--pr:${Math.round(x.v / x.meta * 100)}%"></i>`}</div>`).join('') + '</div>';
}
