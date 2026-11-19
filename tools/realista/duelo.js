// Pico a pico: lo que se muestra al final del duelo lo ve solo el rival de ese duelo
const T = require('../../engine.js'), TV = require('../../vista.js');
const assert = require('assert');
let probados = 0;
for (let semilla = 1; semilla < 400 && probados < 25; semilla++) {
  let s = semilla; T.setRng(() => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; });
  const G = T.newMatch({ players: 6 }); G.dealer = 5; T.startRound(G);
  if (G.round.type !== 'duelos') { G.roundInChico = 1; G.round = null; G.dealer = 5; T.startRound(G); }
  if (G.round.type !== 'duelos') continue;
  // se juega el primer duelo con jugadas al azar hasta que termine
  let k = 0;
  while (G.phase === 'play' && k++ < 60) { const q = T.actor(G), L = T.legal(G, q); const a = L.find(x => x.type === 'quiero') || L.find(x => x.type === 'flor') || L.find(x => x.type === 'envido') || L.find(x => x.type === 'play') || L[0]; T.apply(G, q, a); }
  const R = G.round, quien = R.mustShow.findIndex(Boolean);
  if (quien < 0) continue;
  probados++;
  const par = R.duel.pairs.find(pr => pr.includes(quien)), rival = par.find(q => q !== quien);
  for (let v = 0; v < 6; v++) {
    if (v === quien) continue;
    for (const revealEnd of [false, true]) {
      const V = TV.viewFor(G, v, { revealEnd });
      // lo que no se vio jugando: lo que le queda en la mano y las piezas (en el pico a pico se juegan dadas vuelta)
      const privadas = R.initial[quien].filter(c => R.hands[quien].some(h => h.id === c.id) || T.isPieza(c, R.muestra)).map(c => c.id);
      const vistas = V.round.initial[quien].filter(c => !c.hidden).map(c => c.id);
      if (v === rival) assert.equal(vistas.length, 3, `semilla ${semilla}: el rival ${v} tiene que ver las tres de ${quien}`);
      else assert(!privadas.some(id => vistas.includes(id)), `semilla ${semilla}: ${v} ve cartas de ${quien} que no se mostraron a la mesa (revealEnd ${revealEnd})`);
    }
  }
}
console.log('duelos probados:', probados, '— solo el rival ve las cartas que se muestran');
