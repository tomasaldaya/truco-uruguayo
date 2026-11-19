// Lalo con el 2 de la muestra contra tres flores, en distintas situaciones de la primera baza
const T = require(process.argv[2] || '../../engine.js');
const AI = require(process.argv[3] || '../../ai.js');
const C = (n, s) => ({ n, s, id: n + '-' + s });
function setup6(hands, muestra, dealer) {
  const G = T.newMatch({ players: 6, humans: [0] });
  G.dealer = (dealer + 5) % 6; G.round = { dummy: true }; G.roundInChico = 0; G.scores = [10, 12];
  const mano = (dealer + 1) % 6, order = [];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) order.push(hands[(mano + i) % 6][r]);
  order.push(muestra);
  const rest = T.makeDeck().filter(c => !order.some(o => o.id === c.id));
  T.startRound(G, rest.concat(order.reverse()));
  return G;
}
// parecido a tu mano: vos 3, 2 y 1 (de oro/copa); Pocho con un 7 de oro; Lalo con el 2 de la muestra
const hands = () => [
  [C(3, 'espada'), C(2, 'oro'), C(1, 'copa')],            // Vos (0)
  [C(4, 'copa'), C(6, 'basto'), C(5, 'basto')],           // Tito (1): flor
  [C(7, 'oro'), C(11, 'espada'), C(12, 'basto')],         // Pocho (2): el 7 de oro
  [C(5, 'copa'), C(11, 'copa'), C(3, 'oro')],             // Nacho (3): flor con dos piezas
  [C(2, 'copa'), C(4, 'espada'), C(12, 'oro')],           // Lalo (4): el 2 de la muestra y nada más
  [C(1, 'basto'), C(7, 'basto'), C(4, 'basto')],          // Beto (5): flor
];
const MU = C(7, 'copa');
function decide(G, p, veces = 30) { const c = {}; for (let i = 0; i < veces; i++) { const l = T.label(G, AI.choose(G, p, { samples: 60 })); c[l] = (c[l] || 0) + 1; } return c; }
function hastaLalo(dealer, guion) {
  const G = setup6(hands(), MU, dealer); let k = 0;
  while (G.phase === 'play' && T.actor(G) !== 4 && k++ < 40) {
    const q = T.actor(G), L = T.legal(G, q);
    const g = guion && guion(G, q, L);
    T.apply(G, q, g || (L.find(a => a.type === 'flor') || L.filter(a => a.type === 'play').sort((a, b) => T.rank(a.card, MU) - T.rank(b.card, MU))[0] || L.find(a => a.type === 'quiero') || L[0]));
  }
  return G;
}
const mesa = G => G.round.cur.map((c, q) => c ? G.names[q] + ' ' + T.cardName(c) : null).filter(Boolean).join(', ') || '(nada)';
// (a) Lalo es mano: cantan las tres flores y Lalo sale primero
let G = hastaLalo(3);
console.log('(a) Lalo sale primero. Mesa:', mesa(G), '→', JSON.stringify(decide(G, 4)));
// (b) Lalo juega después de rivales que tiraron cartas bajas
G = hastaLalo(0);
console.log('(b) rivales tiraron bajo. Mesa:', mesa(G), '→', JSON.stringify(decide(G, 4)));
// (c) a Lalo le gritan truco (Nacho, antes de jugar) y le toca contestar
G = hastaLalo(0);
const atras = JSON.parse(JSON.stringify(G));
G = setup6(hands(), MU, 0); let k = 0;
while (G.phase === 'play' && k++ < 40) {
  const q = T.actor(G), L = T.legal(G, q);
  if (q === 4) break;
  if (q === 3 && G.round.played[3] === 0 && !G.round.saidTruco[1]) { const tr = L.find(a => a.type === 'truco'); if (tr) { T.apply(G, 3, tr); continue; } }
  T.apply(G, q, L.find(a => a.type === 'flor') || L.find(a => a.type === 'quiero' && q !== 4) || L.filter(a => a.type === 'play').sort((a, b) => T.rank(a.card, MU) - T.rank(b.card, MU))[0] || L[0]);
}
const top = G.round.pending[G.round.pending.length - 1];
console.log('(c) gritó', top ? G.names[top.by] : 'nadie', '| contesta', G.names[T.actor(G)], '→', JSON.stringify(decide(G, T.actor(G))));
// (d) Lalo grita truco y un rival le contesta retruco: ¿Lalo quiere?
{
  const G = hastaLalo(0);
  const tr = T.legal(G, 4).find(a => a.type === 'truco');
  if (tr) {
    T.apply(G, 4, tr);
    const q = T.actor(G), re = T.legal(G, q).find(a => a.type === 'truco');
    if (re) { T.apply(G, q, re); console.log('(d) Lalo gritó, ' + G.names[q] + ' contestó retruco; contesta', G.names[T.actor(G)], '→', JSON.stringify(decide(G, T.actor(G)))); }
    else console.log('(d) el rival no podía retrucar');
  } else console.log('(d) Lalo no puede gritar acá');
}
