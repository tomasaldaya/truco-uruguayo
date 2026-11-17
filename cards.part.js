// ---------- Cartas: baraja española, diseño propio ----------
// Colores clásicos (rojo, amarillo, azul, verde), pintas en el marco
// (oros 1 corte, copas 2, espadas 3, bastos 4) y cada número con sus palos.
const COL = { red:'#c8312b', yellow:'#f2c230', blue:'#5b9bd8', green:'#3c8c3a', skin:'#f3cfa8', ink:'#3a2a1a', horse:'#dfe9f5', brown:'#7a5a3a' };
const SUIT_COLOR = { oro:'#a8740a', copa:'#c8312b', espada:'#2d5aa0', basto:'#3c7a32' };
const GAPS = { oro:1, copa:2, espada:3, basto:4 };
const PAL = { oro:[COL.red, COL.green], copa:[COL.green, COL.red], espada:[COL.blue, COL.red], basto:[COL.red, COL.blue] };
const f1 = v => (Math.round(v*10)/10);

function coin(x, y, r){
  let t = '';
  for (let i=0;i<16;i++){
    const a = i*Math.PI/8, c = Math.cos(a), s = Math.sin(a);
    t += `<line x1="${f1(x+c*r*.6)}" y1="${f1(y+s*r*.6)}" x2="${f1(x+c*r*.86)}" y2="${f1(y+s*r*.86)}" stroke="#c0661a" stroke-width="${f1(r*.1)}" stroke-linecap="round"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${COL.yellow}" stroke="${COL.ink}" stroke-width="${f1(Math.max(.8,r*.07))}"/>${t}
    <circle cx="${x}" cy="${y}" r="${f1(r*.48)}" fill="#f8d968" stroke="#c0661a" stroke-width="${f1(r*.07)}"/>
    <circle cx="${x}" cy="${y}" r="${f1(r*.15)}" fill="#c0661a"/>`;
}
function cup(x, y, s){
  const k = s/40;
  return `<g transform="translate(${f1(x-20*k)},${f1(y-20*k)}) scale(${f1(k*100)/100})" stroke="${COL.ink}" stroke-width="1.1" stroke-linejoin="round">
    <path d="M6 6 H34 C34 16 28 21 20 21 C12 21 6 16 6 6 Z" fill="${COL.red}"/>
    <path d="M8 11 Q20 16 32 11" fill="none" stroke="${COL.yellow}" stroke-width="2.2"/>
    <rect x="4.5" y="3.5" width="31" height="4" rx="1.5" fill="${COL.yellow}"/>
    <rect x="17.5" y="21" width="5" height="9" fill="${COL.yellow}"/>
    <ellipse cx="20" cy="26" rx="5" ry="2.2" fill="${COL.blue}"/>
    <path d="M9 37 Q20 28 31 37 Z" fill="${COL.red}"/>
    <rect x="8" y="36" width="24" height="2.4" rx="1" fill="${COL.yellow}"/>
  </g>`;
}
function sword(x, y, L, ang){
  const h = L/2, w = Math.min(L*.06, 3.2), g = h*.5, lw = f1(Math.max(.6, w*.32));
  return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${ang||0})" stroke="${COL.ink}" stroke-width="${lw}" stroke-linejoin="round">
    <path d="M0 ${f1(-h)} L${f1(w)} ${f1(-h+w*2.4)} L${f1(w)} ${f1(g)} L${f1(-w)} ${f1(g)} L${f1(-w)} ${f1(-h+w*2.4)} Z" fill="#b8d6f2"/>
    <line x1="0" y1="${f1(-h+w*2.6)}" x2="0" y2="${f1(g-1)}" stroke="#4f7fb3" stroke-width="${lw}"/>
    <rect x="${f1(-w*2.6)}" y="${f1(g)}" width="${f1(w*5.2)}" height="${f1(w*1.4)}" rx="${f1(w*.6)}" fill="${COL.yellow}"/>
    <rect x="${f1(-w*.85)}" y="${f1(g+w*1.4)}" width="${f1(w*1.7)}" height="${f1(h*.28)}" fill="${COL.red}"/>
    <circle cx="0" cy="${f1(g+w*1.4+h*.28+w*.9)}" r="${f1(w*1.1)}" fill="${COL.yellow}"/>
  </g>`;
}
function club(x, y, L, ang, color){
  const h = L/2, wt = Math.min(L*.12, 7.5), wb = wt*.45, lw = f1(Math.max(.6, wt*.14));
  let knots = '';
  [-.45, -.05, .35].forEach((t, i) => {
    const side = i%2 ? 1 : -1, ww = wt + (wb-wt)*((t+1)/2);
    knots += `<ellipse cx="${f1(-side*ww*.25)}" cy="${f1(h*t+wt*.4)}" rx="${f1(wt*.18)}" ry="${f1(wt*.28)}" fill="${COL.ink}" stroke="none"/>`;
  });
  return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${ang||0})" stroke="${COL.ink}" stroke-width="${lw}" stroke-linejoin="round">
    <path d="M${f1(-wb)} ${f1(h)} L${f1(-wt)} ${f1(-h*.6)} Q${f1(-wt)} ${f1(-h)} 0 ${f1(-h)} Q${f1(wt)} ${f1(-h)} ${f1(wt)} ${f1(-h*.6)} L${f1(wb)} ${f1(h)} Z" fill="${color}"/>
    <path d="M${f1(-wt*.35)} ${f1(-h*.8)} L${f1(-wb*.4)} ${f1(h*.8)}" stroke="rgba(255,255,255,.55)" stroke-width="${f1(wt*.22)}" fill="none"/>
    ${knots}
    <ellipse cx="0" cy="${f1(h)}" rx="${f1(wb)}" ry="${f1(wb*.5)}" fill="#e9d3a8"/>
  </g>`;
}
const CLUB_COLORS = [COL.red, COL.green, COL.blue, COL.yellow];

function pipAt(s, x, y, size, i){
  if (s==='oro') return coin(x, y, size/2);
  if (s==='copa') return cup(x, y, size);
  if (s==='espada') return sword(x, y, size*2, 0);
  return club(x, y, size*1.9, -18, CLUB_COLORS[(i||0)%4]);
}

const ROUND_POS = {
  2:[[50,46],[50,106]], 3:{oro:[[34,42],[50,76],[66,110]], copa:[[50,40],[50,76],[50,112]]},
  4:[[33,44],[67,44],[33,108],[67,108]], 5:[[33,42],[67,42],[50,76],[33,110],[67,110]],
  6:[[33,40],[67,40],[33,76],[67,76],[33,112],[67,112]], 7:[[33,34],[67,34],[50,56],[33,80],[67,80],[33,114],[67,114]],
};
function longPos(n){
  if (n===2) return [[40,76,98,0],[60,76,98,0]];
  if (n===3) return [[30,76,98,0],[50,76,98,0],[70,76,98,0]];
  const xs = n<=5 ? [38,62] : [30,50,70], out = [];
  for (const x of xs){ out.push([x,49,46,0]); out.push([x,103,46,0]); }
  if (n===5 || n===7) out.push([50,76,60,90]);
  return out;
}
function pipsBody(c){
  const s = c.s, n = c.n;
  if (s==='oro' || s==='copa'){
    const P = n===3 ? ROUND_POS[3][s] : ROUND_POS[n];
    const size = s==='oro' ? (n<=3?30:n<=5?26:20) : (n<=3?34:n<=5?30:26);
    return P.map(([x,y],i) => pipAt(s, x, y, size, i)).join('');
  }
  return longPos(n).map(([x,y,L,a],i) => s==='espada' ? sword(x,y,L,a) : club(x,y,L*0.98,a,CLUB_COLORS[i%4])).join('');
}
function leaf(x, y, ang, k){
  k = k||1;
  return `<path transform="translate(${x},${y}) rotate(${ang}) scale(${k})" d="M0 0 Q6 -5 13 0 Q6 5 0 0 Z" fill="${COL.green}" stroke="${COL.ink}" stroke-width=".8"/>`;
}
function aceBody(s){
  if (s==='oro') return `${leaf(30,106,150,1.3)}${leaf(70,106,30,1.3)}${leaf(26,96,190,1.1)}${leaf(74,96,-10,1.1)}${coin(50,74,25)}`;
  if (s==='copa') return `${leaf(22,70,200)}${leaf(78,70,-20)}${cup(50,78,70)}`;
  if (s==='espada') return `<path d="M30 96 Q40 92 50 98 Q60 92 70 96" fill="none" stroke="${COL.green}" stroke-width="3"/>${leaf(30,96,200)}${leaf(70,96,-20)}${leaf(36,90,230,.9)}${leaf(64,90,-50,.9)}${sword(50,76,118,0)}`;
  return `${club(50,80,104,0,COL.red)}${leaf(58,34,-40,1.1)}${leaf(40,40,210,1)}${leaf(60,52,-10,.9)}`;
}
function head(x, y){
  return `<circle cx="${x}" cy="${y}" r="7" fill="${COL.skin}" stroke="${COL.ink}" stroke-width="1"/>
    <circle cx="${x-2.4}" cy="${y-.8}" r=".85" fill="${COL.ink}"/><circle cx="${x+2.4}" cy="${y-.8}" r=".85" fill="${COL.ink}"/>
    <path d="M${x-2} ${y+3} q2 1.4 4 0" stroke="${COL.ink}" stroke-width=".8" fill="none"/>`;
}
function figureBody(c){
  const s = c.s, col = SUIT_COLOR[c.s], I = COL.ink;
  const name = {10:'SOTA', 11:'CABALLO', 12:'REY'}[c.n];
  let emblem;
  if (c.n === 12) emblem = `<path d="M36 44 L38 28 L44 37 L50 24 L56 37 L62 28 L64 44 Z" fill="${COL.yellow}" stroke="${I}" stroke-width="1.2" stroke-linejoin="round"/>
      <rect x="35" y="43" width="30" height="5" rx="1.5" fill="${COL.yellow}" stroke="${I}" stroke-width="1.2"/>
      <circle cx="50" cy="33" r="1.8" fill="${COL.red}"/><circle cx="41" cy="39" r="1.3" fill="${COL.blue}"/><circle cx="59" cy="39" r="1.3" fill="${COL.blue}"/>`;
  else if (c.n === 11) emblem = `<g transform="translate(31,22) scale(.95)"><path d="M28 3 L25 0 L23 6 C17 7 11 12 7 19 L3 25 C2 28 5 30 8 29 L13 26 C15 29 17 33 17 38 L33 38 C33 30 32 22 33 14 C34 9 32 6 28 3 Z" fill="${COL.horse}" stroke="${I}" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M25 6 C29 14 30 26 31 37" stroke="${COL.brown}" stroke-width="2.6" fill="none"/><circle cx="17" cy="14" r="1.3" fill="${I}"/><circle cx="7" cy="25" r=".9" fill="${I}"/></g>`;
  else emblem = `<path d="M34 42 Q50 22 66 42 Z" fill="${col}" stroke="${I}" stroke-width="1.2"/><ellipse cx="50" cy="42" rx="19" ry="4" fill="${col}" stroke="${I}" stroke-width="1.2"/>
      <path d="M60 33 Q70 20 78 26" stroke="${COL.red}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  const pip = c.s==='espada' ? sword(50, 84, 44, 0) : c.s==='basto' ? club(50, 84, 42, 0, COL.red) : pipAt(c.s, 50, 84, c.s==='oro' ? 30 : 32, 0);
  return `<rect x="16" y="27" width="68" height="99" rx="10" fill="${col}" fill-opacity=".08" stroke="${col}" stroke-width="1.2"/>
    <rect x="20" y="31" width="60" height="91" rx="8" fill="none" stroke="${col}" stroke-opacity=".45" stroke-width=".8"/>
    <g transform="translate(0,9) scale(1 .92)">${emblem}</g>${pip}
    <text x="50" y="117" text-anchor="middle" font-family="Alegreya, Georgia, serif" font-weight="800" font-size="10.5" letter-spacing="1.5" fill="${col}">${name}</text>`;
}
function frameLine(x1, x2, y, gaps, color){
  const segs = gaps + 1, gap = 6, len = (x2 - x1 - gaps*gap)/segs;
  let out = '';
  for (let i=0;i<segs;i++){ const a = x1 + i*(len+gap); out += `<line x1="${f1(a)}" y1="${y}" x2="${f1(a+len)}" y2="${y}" stroke="${color}" stroke-width="1.6"/>`; }
  return out;
}
const SVG_CACHE = {};
function cardSVG(c){
  if (SVG_CACHE[c.id]) return SVG_CACHE[c.id];
  const col = SUIT_COLOR[c.s];
  const body = c.n===1 ? aceBody(c.s) : c.n>=10 ? figureBody(c) : pipsBody(c);
  const idx = `<text x="13" y="23" font-family="Alegreya, Georgia, serif" font-weight="800" font-size="15" fill="${col}">${c.n}</text>`;
  const out = `<svg viewBox="0 0 100 152" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${frameLine(8,92,8,GAPS[c.s],col)}${frameLine(8,92,144,GAPS[c.s],col)}
    <line x1="8" y1="8" x2="8" y2="144" stroke="${col}" stroke-width="1.6"/><line x1="92" y1="8" x2="92" y2="144" stroke="${col}" stroke-width="1.6"/>
    ${body}
    ${idx}<g transform="rotate(180 50 76)">${idx}</g>
  </svg>`;
  return SVG_CACHE[c.id] = out;
}
const CAT_LBL = {pieza:'pieza', mata:'mata', fio:'fío'};
function cardEl(c, opts){
  if (c.hidden) return backEl(); // carta ajena tapada
  opts = opts || {};
  const d = document.createElement(opts.button ? 'button' : 'div');
  d.className = 'card' + (opts.cls ? ' '+opts.cls : '');
  if (opts.button) { d.type='button'; d.style.border='0'; d.style.padding='0'; }
  d.innerHTML = (typeof customDeck !== 'undefined' && customDeck && customDeck[c.id])
    ? `<img src="${customDeck[c.id]}" alt="" draggable="false">` : cardSVG(c);
  d.setAttribute('aria-label', T.cardName(c));
  d.title = T.cardName(c);
  if (opts.badge && G && G.round) {
    const cat = T.category(c, G.round.muestra);
    if (CAT_LBL[cat]) { const b = document.createElement('span'); b.className='badge '+cat; b.textContent = CAT_LBL[cat]; d.appendChild(b); }
  }
  return d;
}
function backEl(){ const d=document.createElement('div'); d.className='back'; return d; }
