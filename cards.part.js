// ---------- Cartas ----------
// La baraja española libre de Basquetteur (naipes.part.js, CC BY-SA 3.0), o el mazo del jugador si
// cargó uno ("Tu mazo"). Los colores por palo se usan en la carta de repuesto de la mesa 3D.
const SUIT_COLOR = { oro:'#a8740a', copa:'#c8312b', espada:'#2d5aa0', basto:'#3c7a32' };
const ownDeck = id => (typeof customDeck !== 'undefined' && customDeck && customDeck[id]) || '';
const naipeSrc = id => ownDeck(id) || NAIPES[id] || '';
try { document.documentElement.style.setProperty('--dorso', `url("${NAIPES.back}")`); } catch (e) {}
const CAT_LBL = {pieza:'pieza', mata:'mata', fio:'fío'};
function cardEl(c, opts){
  if (c.hidden) return backEl(); // carta ajena tapada
  opts = opts || {};
  const d = document.createElement(opts.button ? 'button' : 'div');
  d.className = 'card' + (opts.cls ? ' '+opts.cls : '');
  if (opts.button) { d.type='button'; d.style.border='0'; d.style.padding='0'; }
  d.innerHTML = `<img src="${naipeSrc(c.id)}" alt="" draggable="false"${ownDeck(c.id) ? '' : ' class="nat"'}>`;
  d.setAttribute('aria-label', T.cardName(c));
  d.title = T.cardName(c);
  if (opts.badge && G && G.round) {
    const cat = T.category(c, G.round.muestra);
    if (CAT_LBL[cat]) { const b = document.createElement('span'); b.className='badge '+cat; b.textContent = CAT_LBL[cat]; d.appendChild(b); }
  }
  return d;
}
function backEl(){ const d=document.createElement('div'); d.className='back'; return d; }
