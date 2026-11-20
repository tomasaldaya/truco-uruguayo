const T = require('./engine.js');
const AI = require('./ai.js');
const assert = require('assert');

function seeded(s) { return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
const C = (n, s) => ({ n, s, id: n + '-' + s });
let fails = 0;
function t(name, f) { try { f(); console.log('ok  ', name); } catch (e) { fails++; console.log('FAIL', name, '\n   ', e.message); } }

t('la computadora se imagina a los rivales con la flor que cantaron (tres flores en tercetos)', () => {
  const sem = seeded(4321); T.setRng(sem); AI.setRng(sem);
  const hands = [
    [C(3, 'espada'), C(2, 'oro'), C(1, 'copa')], [C(4, 'copa'), C(6, 'basto'), C(5, 'basto')], [C(7, 'oro'), C(11, 'espada'), C(12, 'basto')],
    [C(5, 'copa'), C(11, 'copa'), C(3, 'oro')], [C(2, 'copa'), C(4, 'espada'), C(12, 'oro')], [C(1, 'basto'), C(7, 'basto'), C(4, 'basto')],
  ];
  const G = T.newMatch({ players: 6, humans: [0] });
  G.dealer = 2; G.round = { dummy: true }; G.roundInChico = 0; G.scores = [10, 12];   // da 3: Lalo (4) es mano
  const order = []; for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) order.push(hands[(4 + i) % 6][r]); order.push(C(7, 'copa'));
  T.startRound(G, T.makeDeck().filter(c => !order.some(o => o.id === c.id)).concat(order.reverse()));
  // cantan las tres flores (Lalo es mano y no tiene: juega; Beto canta y detrás Tito y Nacho)
  let k = 0;
  while (G.phase === 'play' && !(T.actor(G) === 4 && G.round.flor.sung.filter(Boolean).length === 3) && k++ < 20) {
    const q = T.actor(G), L = T.legal(G, q);
    T.apply(G, q, L.find(a => a.type === 'flor') || L.filter(a => a.type === 'play').sort((a, b) => T.rank(a.card, G.round.muestra) - T.rank(b.card, G.round.muestra))[0] || L[0]);
  }
  const R = G.round, jugadas = q => R.tricks.map(t => t.cards[q]).filter(Boolean).concat(R.cur[q] ? [R.cur[q]] : []);
  const ws = AI.sampleWorlds(G, 4, 45, 'normal');
  assert(ws.length >= 40);
  assert(ws.every(w => [1, 3, 5].every(q => !R.flor.sung[q] || T.hasFlor(jugadas(q).concat(w[q]), R.muestra))), 'todas las manos imaginadas respetan las flores cantadas');
  if (T.actor(G) === 4 && G.phase === 'play') {
    const elige = Array.from({ length: 12 }, () => AI.choose(G, 4, { samples: 45 }));
    assert(!elige.some(a => a.type === 'truco'), 'con solo el 2 de la muestra contra tres flores no grita');
  }
  T.setRng(Math.random); AI.setRng(Math.random);
});
t('pico a pico: lo que se muestra al final del duelo lo ve solo el rival de ese duelo', () => {
  const TV = require('./vista.js');
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
  T.setRng(Math.random);
  assert(probados >= 10, 'pocos duelos con cartas para mostrar: ' + probados);
});

// ---- Jerarquía (Art. 12) ----
const m = C(7, 'copa');
t('dos de la muestra es la carta más alta', () => {
  assert(T.rank(C(2, 'copa'), m) > T.rank(C(4, 'copa'), m));
  assert(T.rank(C(10, 'copa'), m) > T.rank(C(1, 'espada'), m));
});
t('orden de piezas 2>4>5>perico>perica', () => {
  const r = [2, 4, 5, 11, 10].map(n => T.rank(C(n, 'copa'), m));
  for (let i = 1; i < r.length; i++) assert(r[i - 1] > r[i]);
});
t('matas: espadilla>bastillo>7 espada>7 oro', () => {
  const r = [C(1, 'espada'), C(1, 'basto'), C(7, 'espada'), C(7, 'oro')].map(c => T.rank(c, m));
  for (let i = 1; i < r.length; i++) assert(r[i - 1] > r[i]);
});
t('fíos: 3 > 2 (no muestra) > as de oro/copa > rey', () => {
  assert(T.rank(C(3, 'oro'), m) > T.rank(C(2, 'oro'), m));
  assert(T.rank(C(2, 'oro'), m) > T.rank(C(1, 'oro'), m));
  assert(T.rank(C(1, 'copa'), m) > T.rank(C(12, 'oro'), m));
  assert.equal(T.rank(C(1, 'oro'), m), T.rank(C(1, 'copa'), m));
});
t('comunes: rey>caballo>sota>7 copa/basto>6>5>4', () => {
  const r = [C(12, 'oro'), C(11, 'oro'), C(10, 'oro'), C(7, 'basto'), C(6, 'oro'), C(5, 'oro'), C(4, 'oro')].map(c => T.rank(c, m));
  for (let i = 1; i < r.length; i++) assert(r[i - 1] > r[i]);
});
t('el rey reemplaza a la pieza que salió de muestra (Art. 12 b)', () => {
  const m4 = C(4, 'oro');
  assert.equal(T.rank(C(12, 'oro'), m4), T.rank(C(4, 'copa'), C(7, 'copa')));
  assert.equal(T.envVal(C(12, 'oro'), m4), 29);
  assert.equal(T.category(C(12, 'oro'), m4), 'pieza');
  assert.equal(T.category(C(12, 'oro'), C(7, 'oro')), 'negra');
});
t('el 4 que no es de la muestra es la más débil', () => {
  const all = T.makeDeck().filter(c => c.id !== m.id).map(c => T.rank(c, m));
  assert.equal(Math.min(...all), T.rank(C(4, 'oro'), m));
});

// ---- Puntos (Art. 13 y 14) ----
t('envido con una pieza: pieza + blanca más alta', () => {
  assert.equal(T.envidoPoints([C(2, 'copa'), C(7, 'oro'), C(12, 'espada')], m), 37);
});
t('envido dos del mismo palo: 20 + valores', () => {
  assert.equal(T.envidoPoints([C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], m), 33);
  assert.equal(T.envidoPoints([C(12, 'oro'), C(7, 'oro'), C(3, 'basto')], m), 27);
  assert.equal(T.envidoPoints([C(12, 'oro'), C(11, 'oro'), C(3, 'basto')], m), 20);
});
t('envido sin pieza ni pares: la blanca más alta; tres negras 0', () => {
  assert.equal(T.envidoPoints([C(6, 'oro'), C(3, 'espada'), C(12, 'basto')], m), 6);
  assert.equal(T.envidoPoints([C(12, 'oro'), C(11, 'espada'), C(10, 'basto')], m), 0);
});
t('flores (Art. 15)', () => {
  assert(T.hasFlor([C(2, 'copa'), C(4, 'copa'), C(12, 'oro')], m));
  assert(T.hasFlor([C(5, 'copa'), C(1, 'oro'), C(6, 'oro')], m));
  assert(T.hasFlor([C(1, 'oro'), C(3, 'oro'), C(6, 'oro')], m));
  assert(!T.hasFlor([C(5, 'copa'), C(1, 'oro'), C(6, 'basto')], m));
});
t('puntos de flor (Art. 14 A)', () => {
  assert.equal(T.florPoints([C(2, 'copa'), C(4, 'copa'), C(5, 'copa')], m), 47);
  assert.equal(T.florPoints([C(2, 'copa'), C(4, 'copa'), C(7, 'oro')], m), 46);
  assert.equal(T.florPoints([C(2, 'copa'), C(4, 'copa'), C(12, 'oro')], m), 39);
  assert.equal(T.florPoints([C(2, 'copa'), C(7, 'oro'), C(6, 'oro')], m), 43);
  assert.equal(T.florPoints([C(1, 'oro'), C(7, 'oro'), C(6, 'oro')], m), 34);
  assert.equal(T.florPoints([C(12, 'oro'), C(11, 'oro'), C(10, 'oro')], m), 20);
});

// ---- Bazas (Art. 57-59) ----
t('ganador de la mano por bazas', () => {
  const W = T.roundWinner;
  assert.equal(W([0, 0], 1), 0);
  assert.equal(W([0, -1], 1), 0);
  assert.equal(W([-1, 1], 0), 1);
  assert.equal(W([0, 1], 0), null);
  assert.equal(W([0, 1, 1], 0), 1);
  assert.equal(W([0, 1, -1], 1), 0);
  assert.equal(W([-1, -1, 1], 0), 1);
  assert.equal(W([-1, -1, -1], 1), 1);
  assert.equal(W([-1, -1], 0), null);
});

// ---- Flujo con mazos preparados ----
// Deck se reparte con pop(): se arma al revés. dealer 1 => mano 0.
function setup(hand0, hand1, muestra, scores, manual, cpuMano, rules) {
  const G = T.newMatch({ manual: manual ? [true, false] : [false, false], rules });
  G.dealer = cpuMano ? 1 : 0; G.round = { dummy: true }; // startRound alterna el dador
  if (scores) G.scores = scores.slice();
  const order = [];
  const first = cpuMano ? hand1 : hand0, second = cpuMano ? hand0 : hand1;
  for (let i = 0; i < 3; i++) { order.push(first[i]); order.push(second[i]); }
  order.push(muestra);
  const rest = T.makeDeck().filter(c => !order.some(o => o.id === c.id));
  T.startRound(G, rest.concat(order.reverse()));
  return G;
}
const act = (G, p, f) => { const a = T.legal(G, p).find(f); if (!a) throw new Error('acción no legal: ' + f); T.apply(G, p, a); };
const typ = (ty, extra) => a => a.type === ty && Object.entries(extra || {}).every(([k, v]) => a[k] === v);

t('envido querido: gana el de más punto; empate gana el mano', () => {
  const G = setup([C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], [C(6, 'basto'), C(7, 'basto'), C(3, 'oro')], C(4, 'espada'));
  assert.equal(G.round.mano, 0);
  act(G, 0, typ('envido', { kind: 'envido' }));
  act(G, 1, typ('quiero'));
  assert.deepEqual(G.scores, [2, 0]); // 33 vs 33: mano
});
t('envido no querido da 1; reenvite no querido da lo anterior (Arts. 24, 34, 35)', () => {
  let G = setup([C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], [C(6, 'basto'), C(1, 'basto'), C(3, 'oro')], C(4, 'espada'));
  act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('noquiero'));
  assert.deepEqual(G.scores, [1, 0]);
  G = setup([C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], [C(6, 'basto'), C(1, 'basto'), C(3, 'oro')], C(4, 'espada'));
  act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('envido', { kind: 'real' })); act(G, 0, typ('noquiero'));
  assert.deepEqual(G.scores, [0, 2]);
  G = setup([C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], [C(6, 'basto'), C(1, 'basto'), C(3, 'oro')], C(4, 'espada'));
  act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('envido', { kind: 'real' })); act(G, 0, typ('quiero'));
  assert.deepEqual(G.scores, [5, 0]);
});
t('falta envido = lo que le falta al que va adelante', () => {
  const G = setup([C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], [C(6, 'basto'), C(1, 'basto'), C(3, 'oro')], C(4, 'espada'), [12, 25]);
  act(G, 0, typ('envido', { kind: 'falta' })); act(G, 1, typ('quiero'));
  assert.deepEqual(G.scores, [27, 25]);
});
t('flor de uno solo: 3 puntos y no hay envido (Art. 27)', () => {
  const G = setup([C(1, 'oro'), C(3, 'oro'), C(6, 'oro')], [C(6, 'basto'), C(1, 'basto'), C(3, 'copa')], C(4, 'espada'));
  assert.deepEqual(T.legal(G, 0).map(a => a.type), ['flor']);
  act(G, 0, typ('flor'));
  assert.deepEqual(G.scores, [3, 0]);
  assert(!T.legal(G, 0).some(a => a.type === 'envido'));
});
t('contra flor querida: envite + las dos flores (Art. 31)', () => {
  const G = setup([C(1, 'oro'), C(3, 'oro'), C(6, 'oro')], [C(6, 'basto'), C(1, 'basto'), C(3, 'basto')], C(4, 'espada'));
  act(G, 0, typ('flor')); act(G, 1, typ('flor'));
  act(G, 0, a => a.type === 'fenv' && a.contra && a.amt === 2);
  act(G, 1, typ('quiero'));
  // 30 vs 30 empate -> mano
  assert.deepEqual(G.scores, [2 + 3 + 3, 0]);
});
t('con flor envido no querido: solo la flor propia (Art. 32)', () => {
  const G = setup([C(1, 'oro'), C(3, 'oro'), C(6, 'oro')], [C(6, 'basto'), C(1, 'basto'), C(3, 'basto')], C(4, 'espada'));
  act(G, 0, typ('flor')); act(G, 1, typ('flor'));
  act(G, 0, a => a.type === 'fenv' && !a.contra && a.amt === 2);
  act(G, 1, typ('noquiero'));
  assert.deepEqual(G.scores, [3, 0]);
});
t('con achique, el con flor envido (o contra flor) no querido cobra la flor y un punto; el reenvite no querido no', () => {
  const H0 = [C(1, 'oro'), C(3, 'oro'), C(6, 'oro')], H1 = [C(6, 'basto'), C(1, 'basto'), C(3, 'basto')], M = C(4, 'espada');
  let G = setup(H0, H1, M, null, false, false, { achique: true });
  act(G, 0, typ('flor')); act(G, 1, typ('flor'));
  act(G, 0, a => a.type === 'fenv' && !a.contra && a.amt === 2);
  act(G, 1, typ('noquiero'));
  assert.deepEqual(G.scores, [4, 0]);
  assert.deepEqual(G.round.gained[0].map(g => g.pts), [3, 1]);
  assert.equal(G.round.gained[0][1].why, 'el achique');
  G = setup(H0, H1, M, null, false, false, { achique: true });
  act(G, 0, typ('flor')); act(G, 1, typ('flor'));
  act(G, 0, a => a.type === 'fenv' && a.contra && a.amt === 2);
  act(G, 1, typ('noquiero'));
  assert.deepEqual(G.scores, [4, 0]);
  // el que se achicó antes y después no quiere: también se cobra el achique
  G = setup(H0, H1, M, null, false, false, { achique: true });
  act(G, 0, typ('flor')); act(G, 1, typ('flor'));
  act(G, 0, typ('chica'));
  act(G, 1, a => a.type === 'fenv' && !a.contra && a.amt === 2);
  act(G, 0, typ('noquiero'));
  assert.deepEqual(G.scores, [0, 4]);
  // reenvite no querido: lo envidado antes y la flor, sin achique (como el envido, Art. 35)
  G = setup(H0, H1, M, null, false, false, { achique: true });
  act(G, 0, typ('flor')); act(G, 1, typ('flor'));
  act(G, 0, a => a.type === 'fenv' && !a.contra && a.amt === 2);
  act(G, 1, a => a.type === 'fenv' && a.contra && a.amt === 2);
  act(G, 0, typ('noquiero'));
  assert.deepEqual(G.scores, [0, 3 + 2]);
  // los dos se achican: se comparan las flores, sin achique
  G = setup(H0, [C(6, 'basto'), C(7, 'basto'), C(3, 'basto')], M, null, false, false, { achique: true });
  act(G, 0, typ('flor')); act(G, 1, typ('flor'));
  act(G, 0, typ('chica')); act(G, 1, typ('chica'));
  assert.deepEqual(G.scores, [0, 0]);              // la flor se cuenta al final de la mano
  act(G, 0, typ('mazo'));
  assert.deepEqual(G.scores, [0, 3 + 1]);          // la flor mayor (3) y el punto de la mano
  assert.equal(G.round.florEnv.result.pts, 3);
});
t('ambos se achican: gana la flor mayor', () => {
  const G = setup([C(1, 'oro'), C(3, 'oro'), C(6, 'oro')], [C(6, 'basto'), C(7, 'basto'), C(3, 'basto')], C(4, 'espada'));
  act(G, 0, typ('flor')); act(G, 1, typ('flor'));
  act(G, 0, typ('chica')); act(G, 1, typ('chica'));
  assert.deepEqual(G.scores, [0, 0]);              // la flor se cuenta al final de la mano
  act(G, 0, typ('mazo'));
  assert.deepEqual(G.scores, [0, 3 + 1]);          // la flor mayor (3) y el punto de la mano
  assert.equal(G.round.florEnv.result.pts, 3);
});
t('ambos se achican en modo realista: al final de la mano cada uno canta, con las cartas a la vista', () => {
  const G = setup([C(1, 'oro'), C(3, 'oro'), C(6, 'oro')], [C(6, 'basto'), C(7, 'basto'), C(3, 'basto')], C(4, 'espada'));
  act(G, 0, typ('flor')); act(G, 1, typ('flor'));
  act(G, 0, typ('chica')); act(G, 1, typ('chica'));
  assert.equal(G.round.canto, null);
  G.manual = [true, true];
  while (!G.round.canto && G.phase === 'play') { const p = T.actor(G); T.apply(G, p, T.legal(G, p).find(x => x.type === 'play')); }
  assert(G.round.canto && G.round.canto.ctx.final && G.phase === 'play');   // terminaron las bazas: ahora la flor
  const V = require('./vista.js').viewFor(G, 0, {});
  assert(V.round.initial[1].every(c => !c.hidden)); assert.equal(V.round.flor.pts[1], null);   // se ven las cartas, no los puntos
  const real = G.round.flor.pts;
  T.apply(G, T.actor(G), { type: 'sing', pts: real[T.actor(G)] });
  const q = T.actor(G);
  T.apply(G, q, real[q] > real[1 - q] ? { type: 'sing', pts: real[q] } : { type: 'buenas' });
  assert.equal(G.phase, 'roundEnd');
  assert.equal(G.round.gained[0].concat(G.round.gained[1]).filter(g => g.cat === 'flor').length, 1);
});
t('truco querido vale 2, retruco no querido 2, vale cuatro 4', () => {
  let G = setup([C(1, 'espada'), C(1, 'basto'), C(7, 'espada')], [C(4, 'basto'), C(5, 'basto'), C(6, 'copa')], C(4, 'oro'));
  act(G, 0, typ('truco')); act(G, 1, typ('quiero'));
  act(G, 0, typ('play')); act(G, 1, typ('play')); act(G, 0, typ('play')); act(G, 1, typ('play'));
  assert.deepEqual(G.scores, [2, 0]);
  G = setup([C(1, 'espada'), C(1, 'basto'), C(7, 'espada')], [C(4, 'basto'), C(5, 'basto'), C(6, 'copa')], C(4, 'oro'));
  act(G, 0, typ('truco')); act(G, 1, typ('truco')); act(G, 0, typ('noquiero'));
  assert.deepEqual(G.scores, [0, 2]);
});
t('envido respondiendo al truco y luego contestar el truco', () => {
  const G = setup([C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], [C(6, 'basto'), C(1, 'basto'), C(3, 'oro')], C(4, 'espada'));
  act(G, 0, typ('truco'));
  act(G, 1, typ('envido', { kind: 'envido' }));
  // quien trucó no puede reenvidar (Art. 35 / 22 c)
  assert(!T.legal(G, 0).some(a => a.type === 'envido'));
  act(G, 0, typ('quiero'));
  assert.equal(T.actor(G), 1);
  assert(T.legal(G, 1).some(a => a.type === 'quiero'));
});
t('no se puede retrucar después de jugar la carta de la rueda (Art. 67)', () => {
  const G = setup([C(1, 'espada'), C(1, 'basto'), C(7, 'espada')], [C(4, 'basto'), C(5, 'basto'), C(6, 'copa')], C(4, 'oro'));
  act(G, 0, typ('play'));
  act(G, 1, typ('truco'));
  assert(!T.legal(G, 0).some(a => a.type === 'truco'));
});


// ---- Momento de cantar la flor ----
const sinFlor = [C(6, 'basto'), C(1, 'basto'), C(3, 'copa')];
const conFlor = [C(1, 'oro'), C(3, 'oro'), C(6, 'oro')];
t('el pie canta la flor recién cuando le toca', () => {
  const G = setup(sinFlor, conFlor, C(4, 'espada'));
  assert.equal(T.actor(G), 0);
  assert(!T.legal(G, 0).every(a => a.type === 'flor'));
  act(G, 0, typ('play'));
  assert.deepEqual(T.legal(G, 1).map(a => a.type), ['flor']);
  act(G, 1, typ('flor'));
  assert.deepEqual(G.scores, [0, 3]);
});
t('si el mano canta flor, el otro canta la suya enseguida, en orden', () => {
  const G = setup(conFlor, [C(6, 'basto'), C(7, 'basto'), C(3, 'basto')], C(4, 'espada'));
  act(G, 0, typ('flor'));
  assert.equal(T.actor(G), 1);
  assert.deepEqual(T.legal(G, 1).map(a => a.type), ['flor']);
});
t('la flor anula el envido (Art. 27)', () => {
  const G = setup(sinFlor, conFlor, C(4, 'espada'));
  act(G, 0, typ('envido', { kind: 'envido' }));
  act(G, 1, typ('flor'));
  assert.deepEqual(G.scores, [0, 3]);
  assert.equal(T.actor(G), 0);
  assert(!T.legal(G, 0).some(a => a.type === 'envido'));
});
t('flor respondiendo al truco: suma 3 y después contesta el truco', () => {
  const G = setup(sinFlor, conFlor, C(4, 'espada'));
  act(G, 0, typ('truco'));
  act(G, 1, typ('flor'));
  assert.deepEqual(G.scores, [0, 3]);
  assert.equal(T.actor(G), 1);
  assert(T.legal(G, 1).some(a => a.type === 'quiero'));
});

// ---- Modo realista ----
const singAct = n => a => a.type === 'sing';
function sing(G, p, n) { T.apply(G, p, { type: 'sing', pts: n }); }
t('realista: el humano canta sus puntos; canto correcto gana', () => {
  const G = setup([C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], [C(6, 'basto'), C(1, 'basto'), C(3, 'oro')], C(4, 'espada'), null, true);
  act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero'));
  assert.equal(T.actor(G), 0);
  sing(G, 0, 33);
  assert.deepEqual(G.scores, [2, 0]);
});
t('realista: el que ganó el envido y se va al mazo sin mostrar pierde esos puntos; con paso no', () => {
  const mano = () => [[C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], [C(6, 'basto'), C(1, 'basto'), C(3, 'oro')]];
  // realista: gana el envido (2), se va al mazo sin mostrar: los 2 van para el rival, que además cobra la mano (1)
  let G = setup(...mano(), C(4, 'espada'), null, true);
  act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero')); sing(G, 0, 33);
  assert.deepEqual(G.scores, [2, 0]);
  assert(T.legal(G, 0).some(a => a.type === 'paso'), 'el que tiene que mostrar puede pasar, aun mano a mano');
  act(G, 0, typ('mazo'));
  assert.deepEqual(G.scores, [0, 3]);
  assert(!G.round.mustShow[0]);
  assert(G.round.gained[0].some(g => g.pts === -2 && g.cat === 'envido'));
  assert(G.round.gained[1].some(g => g.pts === 2 && g.cat === 'envido'));
  // con paso: sale de la mano, el rival cobra la mano, pero el envido queda y muestra al final
  G = setup(...mano(), C(4, 'espada'), null, true);
  act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero')); sing(G, 0, 33);
  act(G, 0, typ('paso'));
  assert.deepEqual(G.scores, [2, 1]);
  assert(G.round.mustShow[0]);
  // sin el modo realista se muestran solas: irse al mazo no hace perder nada
  G = setup(...mano(), C(4, 'espada'));
  act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero'));
  assert.deepEqual(G.scores, [2, 0]);
  act(G, 0, typ('mazo'));
  assert.deepEqual(G.scores, [2, 1]);
  // y el que no tiene que mostrar, mano a mano, no tiene paso
  G = setup(...mano(), C(4, 'espada'), null, true);
  assert(!T.legal(G, 0).some(a => a.type === 'paso'));
});
t('realista: cifra que no vale como canto se rechaza (Art. 43)', () => {
  const G = setup([C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], [C(6, 'basto'), C(1, 'basto'), C(3, 'oro')], C(4, 'espada'), null, true);
  act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero'));
  assert.throws(() => sing(G, 0, 15));
  assert.equal(T.actor(G), 0);
});
t('realista: canto errado pierde todo lo de la mano (Art. 46)', () => {
  const G = setup([C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], [C(6, 'basto'), C(1, 'basto'), C(3, 'oro')], C(4, 'espada'), null, true);
  act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero'));
  sing(G, 0, 31);
  // envido 2 + truco no aceptado 1
  assert.deepEqual(G.scores, [0, 3]);
  assert.equal(G.round.penalty.off, 0);
  assert.equal(G.phase, 'roundEnd');
});
t('realista: decir "son buenas" teniendo más queda como falta oculta (Art. 44)', () => {
  const G = setup([C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], [C(6, 'basto'), C(5, 'basto'), C(3, 'copa')], C(4, 'espada'), null, true, true);
  assert.equal(G.round.mano, 1);
  act(G, 1, a => a.type === 'envido' && a.kind === 'envido' || a.type === 'play');
  if (G.round.pending.length) {
    act(G, 0, typ('quiero'));
    // la compu (mano) cantó 31; el humano tiene 33 y dice son buenas
    T.apply(G, 0, { type: 'buenas' });
    assert(G.round.faults[0].includes('errado'));
    assert.equal(G.round.penalty, null);
  }
});
t('realista: flor sin tenerla se pena', () => {
  const G = setup(sinFlor, [C(6, 'oro'), C(1, 'copa'), C(3, 'espada')], C(4, 'espada'), null, true);
  act(G, 0, typ('flor'));
  assert.deepEqual(G.scores, [0, 4]); // flor cantada 3 + truco 1
});
t('realista: flor negada se descubre al jugar la tercera carta (sin piezas hacen falta las tres)', () => {
  // humano: as, 3 y 6 de oro (flor). Compu: 4 y 6 de basto y 6 de copa -> tres bazas
  const G = setup(conFlor, [C(1, 'espada'), C(6, 'basto'), C(4, 'copa')], C(4, 'espada'), null, true);
  T.apply(G, 0, { type: 'play', card: C(6, 'oro') });   // pierde con el as de espada
  assert(G.round.flor.negada[0]);
  T.apply(G, 1, { type: 'play', card: C(1, 'espada') });
  T.apply(G, 1, { type: 'play', card: C(4, 'copa') });
  T.apply(G, 0, { type: 'play', card: C(3, 'oro') });
  assert.equal(G.round.penalty, null, 'con dos cartas del mismo palo todavía no se sabe');
  T.apply(G, 0, { type: 'play', card: C(1, 'oro') });   // la tercera: se ve la flor, ahí mismo
  assert.equal(G.round.penalty.off, 0);
  assert.equal(G.phase, 'roundEnd');
  assert.deepEqual(G.scores, [0, 4]); // flor negada 3 + truco 1
});
t('realista: con dos piezas, jugar las dos ya muestra la flor negada', () => {
  // muestra 4 de espada: el 2 y el 5 de espada son piezas; el humano juega las dos y se descubre
  const G = setup([C(2, 'espada'), C(5, 'espada'), C(3, 'copa')], [C(1, 'basto'), C(6, 'basto'), C(4, 'copa')], C(4, 'espada'), null, true);
  T.apply(G, 0, { type: 'play', card: C(5, 'espada') });
  T.apply(G, 1, { type: 'play', card: C(6, 'basto') });
  assert.equal(G.round.penalty, null);
  T.apply(G, 0, { type: 'play', card: C(2, 'espada') });
  assert.equal(G.round.penalty.off, 0); assert(G.round.penalty.negada);
  assert.deepEqual(G.scores, [0, 4]);
});
t('realista: una pieza y dos del mismo palo: no alcanza con jugar la pieza y una más', () => {
  const G = setup([C(2, 'espada'), C(6, 'oro'), C(7, 'oro')], [C(1, 'basto'), C(6, 'basto'), C(4, 'copa')], C(4, 'espada'), null, true);
  T.apply(G, 0, { type: 'play', card: C(2, 'espada') });
  T.apply(G, 1, { type: 'play', card: C(4, 'copa') });
  T.apply(G, 0, { type: 'play', card: C(6, 'oro') });
  assert.equal(G.round.penalty, null);
});
t('realista: negar la flor y ganar un envido no querido: al verse la flor, ese punto no vale y el rival cobra flor y truco', () => {
  const G = setup([C(2, 'espada'), C(5, 'espada'), C(3, 'copa')], [C(1, 'basto'), C(6, 'basto'), C(4, 'copa')], C(4, 'espada'), null, true);
  act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('noquiero'));
  assert.deepEqual(G.scores, [1, 0]);
  T.apply(G, 0, { type: 'play', card: C(5, 'espada') }); T.apply(G, 1, { type: 'play', card: C(6, 'basto') });
  T.apply(G, 0, { type: 'play', card: C(2, 'espada') });
  assert.equal(G.matchWinner, null, 'ya no se pierde el partido');
  assert.deepEqual(G.scores, [0, 4]);
  assert(G.round.gained[0].some(g => g.pts === -1 && g.cat === 'envido'));
});
t('realista: flor negada no se descubre si te vas al mazo', () => {
  const G = setup(conFlor, [C(4, 'basto'), C(5, 'basto'), C(6, 'copa')], C(4, 'espada'), null, true);
  act(G, 0, typ('play'));
  act(G, 1, typ('play'));
  act(G, 0, typ('mazo'));
  assert.equal(G.round.penalty, null);
  assert.deepEqual(G.scores, [0, 1]);
});
t('realista: flor negada no se descubre si la mano termina en dos bazas', () => {
  const G = setup(conFlor, [C(4, 'basto'), C(5, 'basto'), C(6, 'copa')], C(4, 'espada'), null, true);
  while (G.phase === 'play') { const p = T.actor(G); T.apply(G, p, T.legal(G, p).find(a => a.type === 'play')); }
  assert.equal(G.round.tricks.length, 2);
  assert.equal(G.round.penalty, null);
  assert.deepEqual(G.scores, [1, 0]);
});
t('realista: ganar un envido negando la flor: el envido no vale y el rival cobra la flor y el truco', () => {
  const G = setup([C(1, 'oro'), C(7, 'oro'), C(6, 'oro')], [C(4, 'basto'), C(5, 'basto'), C(12, 'copa')], C(4, 'espada'), null, true);
  act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero'));
  sing(G, 0, 33);
  assert.equal(G.phase, 'roundEnd');
  assert.equal(G.matchWinner, null);
  assert.equal(G.disq, null);
  assert(G.round.penalty.negada);
  assert.deepEqual(G.scores, [0, 4]);   // 3 de la flor + 1 del truco; los 2 del envido no los cobra nadie
});
t('realista: se acaba el tiempo para cantar los puntos: el envido es del rival y la mano sigue', () => {
  const G = setup([C(6, 'oro'), C(7, 'oro'), C(3, 'basto')], [C(6, 'basto'), C(1, 'basto'), C(3, 'oro')], C(4, 'espada'), null, true);
  act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero'));
  const a = AI.porTiempo(G, 0, { samples: 10 });
  assert.equal(a.type, 'vencido');
  T.apply(G, 0, a);
  assert.deepEqual(G.scores, [0, 2]);
  assert.equal(G.phase, 'play'); assert.equal(G.round.canto, null);
  assert(!G.round.mustShow[1], 'el rival no tiene que mostrar: no cantó');
});
t('realista: si se acaba el tiempo en otra cosa, la computadora no hace trampa por vos', () => {
  // con flor sin cantar: la canta
  for (let i = 0; i < 5; i++) {
    const G = setup([C(2, 'espada'), C(6, 'oro'), C(7, 'oro')], [C(1, 'basto'), C(6, 'basto'), C(4, 'copa')], C(4, 'espada'), null, true);
    assert.equal(AI.porTiempo(G, 0, { samples: 10 }).type, 'flor');
    assert.equal(G.manual[0], true, 'sigue en modo realista');
  }
});
t('realista: con flor puede seguir sin cantar cuando el otro cantó', () => {
  const G = setup(conFlor, [C(6, 'basto'), C(7, 'basto'), C(3, 'basto')], C(4, 'espada'), null, true, true);
  // la compu es mano y canta flor; el humano decide
  assert.equal(T.actor(G), 1); act(G, 1, typ('flor'));
  assert.deepEqual(T.legal(G, 0).map(a => a.type), ['flor', 'noflor']);
});


// ---- Parejas (4 jugadores) ----
function setup4(hands, muestra, dealer, manual, rules) {
  const G = T.newMatch({ players: 4, manual: manual ? [true] : [], rules });
  G.dealer = (dealer + 3) % 4; G.round = { dummy: true };
  const mano = (dealer + 1) % 4;
  const order = [];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) order.push(hands[(mano + i) % 4][r]);
  order.push(muestra);
  const rest = T.makeDeck().filter(c => !order.some(o => o.id === c.id));
  T.startRound(G, rest.concat(order.reverse()));
  return G;
}
t('parejas: reparto y orden hacia la derecha; mano a la derecha del que da', () => {
  const G = setup4([[C(4,'oro'),C(5,'copa'),C(6,'basto')],[C(4,'basto'),C(5,'oro'),C(6,'copa')],[C(7,'copa'),C(12,'oro'),C(11,'basto')],[C(10,'copa'),C(12,'espada'),C(6,'oro')]], C(7,'espada'), 3);
  assert.equal(G.round.mano, 0);
  assert.equal(G.round.hands[2][0].id, '7-copa');
  act(G, 0, typ('play')); assert.equal(T.actor(G), 1);
  act(G, 1, typ('play')); assert.equal(T.actor(G), 2);
});
t('parejas: si empatan compañeros la baza es del equipo, no parda', () => {
  const G = setup4([[C(3,'oro'),C(4,'copa'),C(6,'basto')],[C(4,'basto'),C(5,'oro'),C(6,'copa')],[C(3,'copa'),C(12,'oro'),C(11,'basto')],[C(10,'copa'),C(12,'espada'),C(6,'oro')]], C(7,'espada'), 3);
  T.apply(G, 0, { type: 'play', card: C(3,'oro') });
  T.apply(G, 1, { type: 'play', card: C(4,'basto') });
  T.apply(G, 2, { type: 'play', card: C(3,'copa') });
  T.apply(G, 3, { type: 'play', card: C(10,'copa') });
  assert.equal(G.round.tricks[0].winnerTeam, 0);
  assert.equal(G.round.tricks[0].winnerPlayer, 0); // el más mano
  assert.equal(T.actor(G), 0);
});
t('parejas: si empatan rivales es parda y sale el mano', () => {
  const G = setup4([[C(3,'oro'),C(4,'copa'),C(6,'basto')],[C(3,'espada'),C(5,'oro'),C(6,'copa')],[C(4,'basto'),C(12,'oro'),C(11,'basto')],[C(10,'copa'),C(12,'espada'),C(6,'oro')]], C(7,'espada'), 2);
  assert.equal(G.round.mano, 3);
  T.apply(G, 3, { type: 'play', card: C(10,'copa') });
  T.apply(G, 0, { type: 'play', card: C(3,'oro') });
  T.apply(G, 1, { type: 'play', card: C(3,'espada') });
  T.apply(G, 2, { type: 'play', card: C(4,'basto') });
  assert.equal(G.round.tricks[0].winnerTeam, -1);
  assert.equal(T.actor(G), 3);
});
t('parejas: canto del envido por equipos, gana el mayor y suma al equipo', () => {
  // mano 0: 25; 1: 27; 2: 31; 3: 20
  const G = setup4([[C(5,'oro'),C(12,'oro'),C(1,'copa')],[C(7,'basto'),C(12,'basto'),C(4,'copa')],[C(6,'basto'),C(5,'basto'),C(2,'oro')],[C(11,'copa'),C(10,'copa'),C(3,'espada')]], C(7,'espada'), 3);
  assert.deepEqual(G.round.envPts, [25, 27, 31, 20]);
  act(G, 0, typ('envido', { kind: 'envido' }));
  act(G, 1, typ('quiero'));
  assert.deepEqual(G.scores, [2, 0]);
  const sung = G.log.filter(l => l.kind === 'canto').map(l => G.names[l.who] + ':' + l.text);
  assert.deepEqual(sung.slice(-4), ['Vos:25', 'Tito:27 son mejores', 'Pocho:31 son mejores', 'Nacho:Son buenas']);
});
t('parejas: flores de un mismo equipo suman 3 cada una', () => {
  const G = setup4([[C(1,'oro'),C(3,'oro'),C(6,'oro')],[C(4,'basto'),C(5,'copa'),C(6,'espada')],[C(1,'copa'),C(3,'copa'),C(6,'copa')],[C(10,'copa'),C(12,'espada'),C(6,'basto')]], C(7,'espada'), 3);
  act(G, 0, typ('flor'));
  assert.equal(T.actor(G), 2);
  act(G, 2, typ('flor'));
  assert.deepEqual(G.scores, [6, 0]);
});
t('parejas: el truco lo contesta el rival que todavía no jugó', () => {
  const G = setup4([[C(4,'oro'),C(5,'copa'),C(6,'basto')],[C(4,'basto'),C(5,'oro'),C(6,'copa')],[C(7,'copa'),C(12,'oro'),C(11,'basto')],[C(10,'copa'),C(12,'espada'),C(6,'oro')]], C(7,'espada'), 3);
  act(G, 0, typ('play')); act(G, 1, typ('play')); act(G, 2, typ('play'));
  act(G, 3, typ('truco'));
  assert.equal(T.actor(G), 0);
});

t('parejas: si el rival mano canta truco, podés contestar vos con envido (el envido está primero)', () => {
  const hands = [[C(4,'oro'),C(5,'copa'),C(6,'basto')],[C(4,'basto'),C(5,'oro'),C(6,'copa')],[C(7,'copa'),C(12,'oro'),C(11,'basto')],[C(10,'copa'),C(12,'espada'),C(6,'oro')]];
  const G = setup4(hands, C(7,'espada'), 0);
  assert.equal(G.round.mano, 1);
  act(G, 1, typ('truco'));
  assert.equal(T.actor(G), 0);
  assert(T.legal(G, 0).some(a => a.type === 'envido'));
  act(G, 0, typ('envido', { kind: 'envido' }));
  act(G, T.actor(G), typ('quiero'));
  assert.equal(T.actor(G), 0); // después del envido, contestás el truco
  assert(T.legal(G, 0).some(a => a.type === 'quiero'));
});
t('parejas: las señas pescadas son verdaderas', () => {
  for (let k = 0; k < 200; k++) {
    const G = T.newMatch({ players: 4 }); T.startRound(G);
    const R = G.round;
    T.setSenas(G, 0, T.senasFor(R.initial[0], R.muestra));
    for (let o = 0; o < 4; o++) for (const v of R.seen[o]) {
      assert(T.team(v.p) !== T.team(o));
      assert(T.senasFor(R.initial[v.p], R.muestra).includes(v.s));
    }
  }
});
t('parejas: con la regla del Art. 90, irse al mazo pierde el equipo', () => {
  const G = setup4([[C(4,'oro'),C(5,'copa'),C(6,'basto')],[C(4,'basto'),C(5,'oro'),C(6,'copa')],[C(7,'copa'),C(12,'oro'),C(11,'basto')],[C(10,'copa'),C(12,'espada'),C(6,'oro')]], C(7,'espada'), 3, false, { mazo: 'equipo' });
  act(G, 0, typ('truco')); act(G, 1, typ('quiero'));
  act(G, 0, typ('mazo'));
  assert.deepEqual(G.scores, [0, 2]);
});


// ---- Flor cuando se toca, variantes y paso ----
// mano 1 (Tito). Nacho (3) tiene flor de oros.
const H4 = () => [[C(4,'basto'),C(5,'copa'),C(6,'espada')],[C(6,'basto'),C(1,'basto'),C(3,'copa')],[C(7,'copa'),C(12,'oro'),C(11,'basto')],[C(1,'oro'),C(3,'oro'),C(6,'oro')]];
t('parejas: si Tito toca, la flor de Nacho queda negada (regla "niega")', () => {
  const G = setup4(H4(), C(7,'espada'), 0, false, { florCompanero: 'niega' });
  assert.equal(G.round.mano, 1);
  act(G, 1, typ('envido', { kind: 'envido' }));
  assert.equal(T.actor(G), 0);               // contestás vos, Nacho no canta
  assert(G.round.flor.lost[3]);
  act(G, 0, typ('quiero'));
  // después nadie canta flor
  while (G.phase === 'play' && T.legal(G, T.actor(G)).some(a => a.type === 'play')) {
    const p = T.actor(G); assert(!T.legal(G, p).some(a => a.type === 'flor')); T.apply(G, p, T.legal(G, p).find(a => a.type === 'play'));
  }
  assert(!G.round.flor.sung[3]);
});
t('parejas: si Tito toca, Nacho dice "tengo flor" y se juega la flor (regla "tengo")', () => {
  const G = setup4(H4(), C(7,'espada'), 0, false, { florCompanero: 'tengo' });
  act(G, 1, typ('envido', { kind: 'envido' }));
  assert.equal(T.actor(G), 3);
  act(G, 3, typ('flor'));
  assert.deepEqual(G.scores, [0, 3]);
  assert(G.round.envido.done);
  assert.equal(T.actor(G), 1);               // sigue jugando el mano
});
t('parejas: si Tito grita antes de que Nacho cante su flor, se la anula (regla "niega")', () => {
  const G = setup4(H4(), C(7,'espada'), 0, false, { florCompanero: 'niega' });
  act(G, 1, typ('truco'));
  assert(G.round.flor.lost[3]);
  assert.equal(G.round.flor.lostBy[3], 'grito');
  assert.equal(T.actor(G), 0);               // contestás vos, Nacho no canta
  act(G, 0, typ('quiero'));
  while (G.phase === 'play' && T.legal(G, T.actor(G)).some(a => a.type === 'play')) {
    const p = T.actor(G); assert(!T.legal(G, p).some(a => a.type === 'flor')); T.apply(G, p, T.legal(G, p).find(a => a.type === 'play'));
  }
  assert(!G.round.flor.sung[3]);
  assert.deepEqual(G.round.flor.negada, [false, false, false, false]);   // anulada no es negada: no hay pena
});
t('parejas: si Tito grita, Nacho dice "tengo flor" (regla "tengo")', () => {
  const G = setup4(H4(), C(7,'espada'), 0, false, { florCompanero: 'tengo' });
  act(G, 1, typ('truco'));
  assert.equal(T.actor(G), 3);
  act(G, 3, typ('flor'));
  assert.deepEqual(G.scores, [0, 3]);
  assert.equal(T.actor(G), 0);               // después se contesta el truco
});
t('parejas: la vista de los demás no deja saber que a alguien le anularon la flor', () => {
  const V = require('./vista.js');
  const G = setup4(H4(), C(7,'espada'), 0, false, { florCompanero: 'niega' });
  act(G, 1, typ('truco'));
  for (const s of [0, 1, 2]) { const v = V.viewFor(G, s); assert(!v.round.flor.lost[3] && !v.round.flor.lostBy[3]); }
  assert.equal(V.viewFor(G, 3).round.flor.lostBy[3], 'grito');
});
t('señas: se pesca más o menos una de cada 50', () => {
  T.setRng(seeded(77));
  let hechas = 0, pescadas = 0;
  for (let k = 0; k < 3000; k++) {
    const G = T.newMatch({ players: 4 }); T.startRound(G);
    const R = G.round, list = T.senasFor(R.initial[0], R.muestra);
    if (!list.length) continue;
    T.setSenas(G, 0, list);
    for (let q = 0; q < 4; q++) hechas += (R.senasShown[q] || []).length;   // las de la computadora se hacen al repartir
    for (let o = 0; o < 4; o++) pescadas += R.seen[o].length;
  }
  const r = pescadas / hechas;
  assert(r > 0.012 && r < 0.03, 'proporción ' + r.toFixed(4) + ' (' + pescadas + ' de ' + hechas + ')');
  T.setRng(Math.random);
});
t('la computadora no toca ni grita mientras un compañero puede cantar flor', () => {
  T.setRng(seeded(5)); AI.setRng(seeded(6));
  let calls = 0;
  for (const n of [4, 6]) for (let k = 0; k < (n === 4 ? 30 : 15); k++) {
    const G = T.newMatch({ players: n }); T.startRound(G);
    let guard = 0;
    while (G.phase === 'play' && guard++ < 200) {
      const p = T.actor(G), a = AI.choose(G, p, { samples: 8 }), R = G.round, top = R.pending[R.pending.length - 1];
      if ((a.type === 'envido' || a.type === 'truco') && !(top && (top.kind === 'env' || top.kind === 'fenv')) && G.rules.flor && !R.duel) {
        calls++;
        for (let q = 0; q < n; q++) if (q !== p && T.team(q) === T.team(p) && T.inGame(R, q))
          assert(R.acted[q] || R.played[q] > 0 || R.flor.sung[q], `${G.names[p]} dijo ${a.type} antes de que ${G.names[q]} hablara`);
      }
      T.apply(G, p, a);
    }
  }
  assert(calls > 5, 'casi no hubo cantos: ' + calls);
  T.setRng(Math.random); AI.setRng(Math.random);
});
t('parejas: si tocan y un rival que no contesta tiene flor, la canta y anula el envido', () => {
  const h = H4(); [h[2], h[3]] = [[C(1,'oro'),C(3,'oro'),C(6,'oro')], [C(7,'copa'),C(12,'oro'),C(11,'basto')]];
  const G = setup4(h, C(7,'espada'), 0);
  act(G, 1, typ('envido', { kind: 'envido' }));
  assert.equal(T.actor(G), 2);               // Pocho canta su flor antes de que contestes
  act(G, 2, typ('flor'));
  assert.deepEqual(G.scores, [3, 0]);
  assert(G.round.envido.done);
});
t('regla: cartas iguales gana el más mano', () => {
  const G = setup([C(3,'oro'),C(4,'copa'),C(6,'basto')], [C(3,'espada'),C(5,'oro'),C(6,'copa')], C(7,'espada'), null, false, false, { iguales: 'mano' });
  T.apply(G, 0, { type: 'play', card: C(3,'oro') });
  T.apply(G, 1, { type: 'play', card: C(3,'espada') });
  assert.equal(G.round.tricks[0].winnerTeam, 0);
});
t('regla: sin flor, tres del mismo palo no es flor y se puede tocar', () => {
  const G = setup(conFlor, sinFlor, C(4,'espada'), null, false, false, { flor: false });
  assert(T.legal(G, 0).some(a => a.type === 'envido'));
  assert(!T.legal(G, 0).some(a => a.type === 'flor'));
});
t('parejas: paso individual, el compañero sigue jugando', () => {
  const G = setup4([[C(4,'oro'),C(5,'copa'),C(6,'basto')],[C(4,'basto'),C(5,'oro'),C(6,'copa')],[C(7,'copa'),C(12,'oro'),C(11,'basto')],[C(10,'copa'),C(12,'espada'),C(6,'oro')]], C(7,'espada'), 3);
  assert.equal(G.round.mano, 0);
  act(G, 0, typ('paso'));
  assert(G.round.out[0]);
  act(G, 1, typ('play')); act(G, 2, typ('play')); act(G, 3, typ('play'));
  assert.equal(G.round.tricks.length, 1);
  assert(!T.legal(G, T.actor(G)).some(a => false));
  assert.notEqual(T.actor(G), 0);
});
t('parejas: si pasan los dos del equipo, pierden la mano', () => {
  const G = setup4([[C(4,'oro'),C(5,'copa'),C(6,'basto')],[C(4,'basto'),C(5,'oro'),C(6,'copa')],[C(7,'copa'),C(12,'oro'),C(11,'basto')],[C(10,'copa'),C(12,'espada'),C(6,'oro')]], C(7,'espada'), 3);
  act(G, 0, typ('paso')); act(G, 1, typ('play'));
  assert(!T.legal(G, 2).some(a => a.type === 'paso')); // el último del equipo solo puede irse al mazo
  act(G, 2, typ('mazo'));
  assert.deepEqual(G.scores, [0, 2]);   // en la primera, sin tocar ni gritar, y Nacho todavía podía tocar: dos
});


t('parejas: si no sos el pie y te vas al mazo, tu equipo sigue; si se va el pie, pierde', () => {
  const G = setup4([[C(4,'oro'),C(5,'copa'),C(6,'basto')],[C(4,'basto'),C(5,'oro'),C(6,'copa')],[C(7,'copa'),C(12,'oro'),C(11,'basto')],[C(10,'copa'),C(12,'espada'),C(6,'oro')]], C(7,'espada'), 3);
  assert.equal(G.round.mano, 0);
  assert(!T.esPie(G, 0)); assert(T.esPie(G, 2));
  act(G, 0, typ('mazo'));
  assert.equal(G.phase, 'play'); assert(G.round.out[0]);
  act(G, 1, typ('play'));
  act(G, 2, typ('mazo'));                     // el pie se va: pierde el equipo (en la primera y sin tocar: dos)
  assert.deepEqual(G.scores, [0, 2]);
});
t('ley de juego: solo en parejas o tercetos y cuando alguien entró en buenas', () => {
  const G2 = setup([C(6,'oro'),C(7,'oro'),C(3,'basto')], [C(6,'basto'),C(1,'basto'),C(3,'copa')], C(4,'espada'), [5, 25]);
  assert(!G2.round.leyPhase);
  const G4a = setup4(H4(), C(7,'espada'), 0); assert(!G4a.round.leyPhase);
  const G4 = T.newMatch({ players: 4 }); G4.scores = [10, 22]; T.startRound(G4);
  assert(G4.round.leyPhase); assert.equal(G4.round.leyPhase.team, 0);
});

// ---- Tercetos ----
t('tercetos: primera ronda general, segunda mano a mano con tres duelos', () => {
  const G = T.newMatch({ players: 6 });
  T.startRound(G);
  assert.equal(G.round.type, 'general');
  assert.equal(G.round.active.filter(x => x).length, 6);
  while (G.phase === 'play') { const p = T.actor(G); T.apply(G, p, T.legal(G, p).find(a => a.type === 'play') || T.legal(G, p)[0]); }
  if (G.phase === 'roundEnd') {
    T.nextRound(G);
    const R = G.round;
    assert.equal(R.type, 'duelos');
    assert.equal(R.active.filter(x => x).length, 2);
    const [a, b] = R.duel.pairs[0];
    assert.equal(b, (a + 3) % 6); assert.notEqual(T.team(a), T.team(b));
    assert(R.falta <= 10);
    let duels = 1;
    while (G.phase !== 'roundEnd' && G.phase !== 'chicoEnd' && G.phase !== 'matchEnd') {
      if (G.phase === 'duelEnd') { T.nextRound(G); duels++; continue; }
      const p = T.actor(G); assert(G.round.active[p]);
      T.apply(G, p, T.legal(G, p).find(a => a.type === 'play') || T.legal(G, p)[0]);
    }
    assert.equal(duels, 3);
  }
});

// ---- A ley de juego ----
// mano 0 (vos, 33 de envido: 6 y 7 de oro), Tito 27, Pocho 22, Nacho 20. Vamos perdiendo 5 a 25.
const HL = () => [[C(6,'oro'),C(7,'oro'),C(3,'basto')],[C(6,'basto'),C(1,'basto'),C(3,'copa')],[C(2,'copa'),C(12,'oro'),C(11,'basto')],[C(11,'copa'),C(10,'copa'),C(4,'basto')]];
function setupLey(){ const G = setup4(HL(), C(4,'espada'), 3); G.scores = [5, 25]; G.round = { dummy: true }; G.dealer = 2; G.roundNo = 0;
  const order = []; const h = HL(); for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) order.push(h[i][r]); order.push(C(4,'espada'));
  const rest = T.makeDeck().filter(c => !order.some(o => o.id === c.id)); T.startRound(G, rest.concat(order.reverse())); return G; }
t('realista: si se acaba el tiempo en "con ley / a punto", la computadora dice la verdad', () => {
  for (const [mia, esperado] of [[[C(2, 'copa'), C(1, 'oro'), C(7, 'oro')], true], [[C(3, 'basto'), C(4, 'espada'), C(12, 'oro')], false]]) {
    const hands = [mia, [C(6, 'basto'), C(7, 'basto'), C(1, 'copa')], [C(6, 'espada'), C(7, 'espada'), C(1, 'basto')], [C(5, 'oro'), C(6, 'oro'), C(10, 'espada')]];
    const G = setup4(hands, C(5, 'copa'), 0, true); G.scores = [22, 10];
    G.round = { dummy: true }; G.dealer = 2; G.roundNo = 0;   // startRound pasa a dar el 3: es mano el 0
    const order = []; for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) order.push(hands[i][r]); order.push(C(5, 'copa'));
    T.startRound(G, T.makeDeck().filter(c => !order.some(o => o.id === c.id)).concat(order.reverse()));
    let k = 0;
    while (G.phase === 'play' && T.actor(G) !== 0 && k++ < 20) { const q = T.actor(G), L = T.legal(G, q); T.apply(G, q, L.find(a => a.type === 'ley' && a.form === 'todo') || AI.choose(G, q, { samples: 10 })); }
    if (!T.legal(G, 0).some(a => a.type === 'leyest')) continue;
    const a = AI.porTiempo(G, 0, { samples: 10 });
    assert.equal(a.type, 'leyest'); assert.equal(a.ley, esperado);
  }
});
t('ley de juego: el que va perdiendo la impone antes de la muestra; falta y truco', () => {
  const G = setupLey();
  assert.equal(G.round.mano, 0);
  assert(G.round.leyPhase);
  assert.equal(T.actor(G), 0);
  act(G, 0, a => a.type === 'ley' && a.form === 'falta_truco');
  // los desafiados dicen su estado en su turno (Tito y después Nacho) y contesta el pie, Nacho
  assert.equal(T.actor(G), 1); act(G, 1, a => a.type === 'leyest');
  assert.equal(T.actor(G), 3); act(G, 3, a => a.type === 'leyest');
  assert.equal(G.round.said[1].text, 'A punto'); assert.equal(G.round.said[3].text, 'A punto');
  assert(G.round.ley.pendingResp);
  assert.equal(G.round.ley.envPart, 'falta');
  assert.equal(T.actor(G), 3);
  act(G, 3, a => a.type === 'leyresp' && a.env && a.truco);
  // 33 gana la falta (15) para el equipo que impuso la ley
  assert.deepEqual(G.scores, [20, 25]);
  assert.equal(G.round.trucoLevel, 2);
});
t('ley de juego: no querer nada da 1 por el envite y 1 por el truco', () => {
  const G = setupLey();
  act(G, 0, a => a.type === 'ley' && a.form === 'falta_truco');
  act(G, 1, a => a.type === 'leyest'); act(G, 3, a => a.type === 'leyest');
  act(G, T.actor(G), a => a.type === 'leyresp' && !a.env && !a.truco);
  assert.deepEqual(G.scores, [7, 25]);
  assert.equal(G.phase, 'roundEnd');
});

t('ley de juego solo por el truco: quien dijo "con ley" cobra su flor aunque su equipo pase', () => {
  // Tito (desafiado) tiene flor de copas y dice "con ley"; la ley no tiene resto, así que solo queda el truco
  const H = [[C(6,'oro'),C(7,'oro'),C(3,'basto')],[C(1,'copa'),C(12,'copa'),C(5,'copa')],[C(2,'oro'),C(12,'oro'),C(11,'basto')],[C(11,'oro'),C(10,'basto'),C(4,'basto')]];
  const G = setup4(H, C(4,'espada'), 3); G.scores = [5, 25]; G.round = { dummy: true }; G.dealer = 2; G.roundNo = 0;
  const order = []; for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) order.push(H[i][r]); order.push(C(4,'espada'));
  T.startRound(G, T.makeDeck().filter(c => !order.some(o => o.id === c.id)).concat(order.reverse()));
  assert(G.round.flor.has[1]);
  act(G, 0, a => a.type === 'ley' && a.form === 'falta_truco');
  act(G, 1, a => a.type === 'leyest'); act(G, 3, a => a.type === 'leyest');
  assert.equal(G.round.ley.envPart, null);
  act(G, T.actor(G), a => a.type === 'leyresp' && !a.truco);
  assert.deepEqual(G.scores, [5 + 1, 25 + 3]);
  assert(G.round.gained[1].some(g => g.cat === 'flor' && g.pts === 3));
});
t('ley de juego: si hay flor y no se quiere el envite, la flor se cobra y el punto del envite no es para nadie', () => {
  // Pocho (compañero del que impone la ley) tiene flor de copas; los otros dos dicen "a punto" y no quieren nada
  const H = [[C(6,'oro'),C(7,'oro'),C(3,'copa')],[C(6,'basto'),C(1,'basto'),C(3,'oro')],[C(1,'copa'),C(12,'copa'),C(5,'copa')],[C(11,'copa'),C(10,'copa'),C(4,'basto')]];
  const G = setup4(H, C(4,'espada'), 3); G.scores = [5, 25]; G.round = { dummy: true }; G.dealer = 2; G.roundNo = 0;
  const order = []; for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) order.push(H[i][r]); order.push(C(4,'espada'));
  const rest = T.makeDeck().filter(c => !order.some(o => o.id === c.id)); T.startRound(G, rest.concat(order.reverse()));
  assert(G.round.flor.has[2], 'Pocho tiene flor');
  act(G, 0, a => a.type === 'ley' && a.form === 'falta_truco');
  act(G, 1, a => a.type === 'leyest'); act(G, 3, a => a.type === 'leyest');
  assert.equal(G.round.ley.envPart, 'falta');
  act(G, T.actor(G), a => a.type === 'leyresp' && !a.env && !a.truco);
  // flor de Pocho: 3; truco no querido: 1; el envite no querido: nada
  assert.deepEqual(G.scores, [9, 25]);
  assert(!G.round.gained[0].some(g => /envite no querido/.test(g.why)));
});

t('atajos al compañero: vení, jugá algo, gritá y tengo algo para el tanto (la computadora hace caso)', () => {
  const H = () => [[C(4,'basto'),C(5,'oro'),C(6,'basto')],[C(3,'oro'),C(7,'basto'),C(11,'espada')],[C(4,'oro'),C(1,'basto'),C(2,'copa')],[C(10,'oro'),C(12,'espada'),C(6,'oro')]];
  const sin = { flor: false };
  // vení: Pocho juega su carta más baja (el cuatro de oro), que la baza la hace el compañero
  let G = setup4(H(), C(7,'copa'), 3, false, sin);
  act(G, 0, a => a.type === 'play' && a.card.id === '4-basto');
  act(G, 1, a => a.type === 'play' && a.card.id === '3-oro');
  assert(T.pedir(G, 0, 'veni'));
  assert.equal(G.round.said[0].text, '¡Vení!');
  let a = AI.choose(G, 2, { samples: 10 });
  assert.equal(a.type, 'play'); assert.equal(a.card.id, '4-oro');
  // jugá algo, sin poder ganar: no tira la peor
  G = setup4(H(), C(7,'copa'), 3, false, sin);
  act(G, 0, a => a.type === 'play' && a.card.id === '4-basto');
  act(G, 1, a => a.type === 'play' && a.card.id === '3-oro');
  T.pedir(G, 0, 'algo');
  a = AI.choose(G, 2, { samples: 10 });
  assert.equal(a.card.id, '1-basto');
  // gritá: canta truco en su turno
  G = setup4(H(), C(7,'copa'), 3, false, sin);
  T.pedir(G, 0, 'grita');
  act(G, 0, typ('play')); act(G, 1, typ('play'));
  assert.equal(AI.choose(G, 2, { samples: 10 }).type, 'truco');
  // tengo algo para el tanto: toca (envido)
  G = setup4(H(), C(7,'copa'), 3, false, sin);
  T.pedir(G, 0, 'tanto');
  act(G, 0, typ('play')); act(G, 1, typ('play'));
  a = AI.choose(G, 2, { samples: 10 });
  assert.equal(a.type, 'envido'); assert.equal(a.kind, 'envido');
  // los rivales no le hacen caso, y en mano a mano no hay atajos
  G = setup4(H(), C(7,'copa'), 3, false, sin);
  T.pedir(G, 1, 'grita');
  act(G, 0, typ('play')); act(G, 1, typ('play'));
  const G2 = setup([C(4,'oro'),C(5,'copa'),C(6,'basto')], [C(4,'basto'),C(5,'oro'),C(6,'copa')], C(7,'espada'));
  assert(!T.pedir(G2, 0, 'veni'));
});

t('mazo en la primera sin tocar ni gritar, si el otro todavía podía tocar: dos puntos', () => {
  const sin = { flor: false };
  // el mano se va enseguida: el pie todavía podía tocar
  let G = setup([C(4,'oro'),C(5,'copa'),C(6,'basto')], [C(4,'basto'),C(5,'oro'),C(6,'copa')], C(7,'espada'), [0, 0], sin);
  act(G, T.actor(G), typ('mazo'));
  assert.equal(G.scores[1 - T.team(G.round.mano)], 2);
  // el mano ya jugó y el pie se va: el mano ya no podía tocar, es uno
  G = setup([C(4,'oro'),C(5,'copa'),C(6,'basto')], [C(4,'basto'),C(5,'oro'),C(6,'copa')], C(7,'espada'), [0, 0], sin);
  const mano = T.actor(G); act(G, mano, typ('play'));
  act(G, T.actor(G), typ('mazo'));
  assert.equal(G.scores[T.team(mano)], 1);
  // si ya se tocó (envido no querido), irse vale lo de siempre
  G = setup([C(4,'oro'),C(5,'copa'),C(6,'basto')], [C(4,'basto'),C(5,'oro'),C(6,'copa')], C(7,'espada'), [0, 0], sin);
  const m0 = T.actor(G); act(G, m0, a => a.type === 'envido' && a.kind === 'envido');
  act(G, T.actor(G), typ('noquiero'));
  const quien = T.actor(G), antes = G.scores.slice(); act(G, quien, typ('mazo'));
  assert.equal(G.scores[1 - T.team(quien)] - antes[1 - T.team(quien)], 1);
  // en la segunda baza, uno
  G = setup([C(4,'oro'),C(5,'copa'),C(6,'basto')], [C(4,'basto'),C(5,'oro'),C(6,'copa')], C(7,'espada'), [0, 0], sin);
  act(G, T.actor(G), typ('play')); act(G, T.actor(G), typ('play'));
  const q2 = T.actor(G), a2 = G.scores.slice(); act(G, q2, typ('mazo'));
  assert.equal(G.scores[1 - T.team(q2)] - a2[1 - T.team(q2)], 1);
});

t('quien mira (vista -1) no ve ninguna carta sin jugar ni ninguna seña, en ningún momento', () => {
  const TV = require('./vista.js');
  for (const n of [2, 4, 6]) for (let semilla = 1; semilla <= 30; semilla++) {
    let x = semilla * 7919; T.setRng(() => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; });
    const G = T.newMatch({ players: n, humans: [0] }); T.startRound(G);
    for (let k = 0; k < 400 && G.phase !== 'matchEnd'; k++) {
      if (G.phase !== 'play') { T.nextRound(G); continue; }
      const R = G.round, V = TV.viewFor(G, -1), VR = V.round;
      // lo que todavía nadie jugó: lo que queda en cada mano (y la muestra, mientras se decide a ley de juego)
      for (let q = 0; q < n; q++) {
        assert(VR.hands[q].every(c => c.hidden), `semilla ${semilla}: ve la mano de ${q}`);
        assert(VR.initial[q].every((c, i) => c.hidden || !R.hands[q].some(h => h.id === c.id)), `semilla ${semilla}: ve una carta sin jugar de ${q}`);
        assert(VR.senas[q] === null && VR.senasShown[q] === null, 've señas');
        assert(VR.envPts[q] === null && VR.florPts[q] === null, 've los puntos');
      }
      if (R.leyPhase) assert(VR.muestra.hidden);
      // en el pico a pico, tampoco las piezas que se juegan dadas vuelta
      if (R.duel) R.tricks.concat([{ cards: R.cur }]).forEach(t => t.cards.forEach((c, i) => {
        const v = (VR.tricks[R.tricks.indexOf(t)] || { cards: VR.cur }).cards[i];
        if (c && !R.muestra.hidden && T.isPieza(c, R.muestra)) assert(!v || v.hidden, 've una pieza del duelo');
      }));
      const q = T.actor(G), L = T.legal(G, q);
      T.apply(G, q, L[Math.floor(Math.random() * L.length)]);
    }
  }
  T.setRng(Math.random);
});
t('ley de juego: mientras se decide nadie ve sus cartas; impuesta, los desafiantes tampoco hasta la respuesta', () => {
  const V = require('./vista.js');
  const G = setupLey();
  for (let s = 0; s < 4; s++) { const v = V.viewFor(G, s); assert(v.round.hands[s].every(c => c.hidden)); assert(v.round.muestra.hidden); }
  act(G, 0, a => a.type === 'ley' && a.form === 'falta_truco');
  assert(V.viewFor(G, 0).round.hands[0].every(c => c.hidden));      // desafiante
  assert(V.viewFor(G, 2).round.hands[2].every(c => c.hidden));
  assert(V.viewFor(G, 1).round.hands[1].every(c => !c.hidden));     // desafiado: ve sus cartas y la muestra
  assert(!V.viewFor(G, 1).round.muestra.hidden);
  act(G, 1, a => a.type === 'leyest'); act(G, 3, a => a.type === 'leyest');
  act(G, 3, a => a.type === 'leyresp' && !a.env && a.truco);
  assert(V.viewFor(G, 0).round.hands[0].every(c => !c.hidden));     // contestado: todos ven
});
t('ley de juego: en modo realista se puede decir "a punto" con flor (la niega)', () => {
  const h = HL(); h[1] = [C(1,'oro'),C(3,'oro'),C(6,'oro')];
  const G = setup4(h, C(4,'espada'), 3); G.scores = [5, 25]; G.round = { dummy: true }; G.dealer = 2; G.roundNo = 0; G.manual = [false, true, false, false];
  const order = []; for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) order.push(h[i][r]); order.push(C(4,'espada'));
  const rest = T.makeDeck().filter(c => !order.some(o => o.id === c.id)); T.startRound(G, rest.concat(order.reverse()));
  act(G, 0, a => a.type === 'ley' && a.form === 'todo');
  assert.equal(T.legal(G, 1).length, 2);
  act(G, 1, a => a.type === 'leyest' && !a.ley);
  assert(G.round.flor.negada[1]);
});
t('señas: con dos matas la seña va dos veces; el dos y el as tienen señas distintas', () => {
  const m = C(4,'copa');
  assert.deepEqual(T.senasFor([C(1,'espada'), C(7,'oro'), C(6,'copa')], m), ['mata', 'mata']);
  assert.deepEqual(T.senasFor([C(3,'oro'), C(3,'basto'), C(6,'copa')], m), ['3', '3']);
  assert.deepEqual(T.senasFor([C(2,'oro'), C(1,'copa'), C(12,'basto')], m), ['dos', 'as']);
  assert.deepEqual(T.senasMinus(['mata', 'mata', '3'], ['mata']), ['mata', '3']);
});
t('pico a pico: las piezas jugadas solo las ven los dos del duelo', () => {
  const V = require('./vista.js');
  T.setRng(seeded(31));
  for (let k = 0; k < 400; k++) {
    const G = T.newMatch({ players: 6 }); G.roundInChico = 1; T.startRound(G);
    const R = G.round; if (!R.duel) continue;
    const [a, b] = R.duel.pairs[0];
    const piece = R.hands[a].find(c => T.isPieza(c, R.muestra));
    if (!piece || T.actor(G) !== a) continue;
    T.apply(G, a, { type: 'play', card: piece });
    const other = [0,1,2,3,4,5].find(q => q !== a && q !== b);
    assert(V.viewFor(G, other).round.cur[a].hidden);
    assert.equal(V.viewFor(G, b).round.cur[a].id, piece.id);
    T.setRng(Math.random);
    return;
  }
  throw new Error('no se dio el caso');
});

// ---- Fuzz: partidas completas con jugadas al azar ----
function playMatch(seed, pick, manual, players, rules) {
  const r = seeded(seed); T.setRng(r); AI.setRng(r);
  const G = T.newMatch({ manual: manual ? [true] : [], players: players || 2, rules });
  T.startRound(G);
  let steps = 0;
  while (G.phase !== 'matchEnd') {
    if (++steps > 20000) throw new Error('no termina');
    if (G.phase !== 'play') { T.nextRound(G); continue; }
    if (++steps > 40000) throw new Error('no termina');
    const p = T.actor(G);
    const acts = T.legal(G, p);
    if (!acts.length) throw new Error('sin acciones en fase play');
    let a = pick(G, p, acts, r);
    if (a.type === 'sing' && a.pts === null) {
      const R = G.round, real = R.canto.kind === 'flor' ? R.flor.pts[p] : R.envPts[p];
      const n = r() < 0.8 ? real : real + 1;
      a = { type: 'sing', pts: n };
      try { const G2 = JSON.parse(JSON.stringify(G)); T.apply(G2, p, a); }
      catch (e) { a = R.canto.best ? { type: 'buenas' } : { type: 'sing', pts: real }; }
    }
    const before = G.scores.slice();
    T.apply(G, p, a);
    if (!manual && (G.scores[0] < before[0] || G.scores[1] < before[1])) throw new Error('puntaje bajó');
  }
  return G;
}
t('2000 partidos al azar terminan sin errores', () => {
  for (let s = 1; s <= 2000; s++) playMatch(s, (G, p, acts, r) => acts[Math.floor(r() * acts.length)]);
});
t('IA contra jugador al azar: la IA gana la gran mayoría', () => {
  let ai = 0; const n = 40;
  for (let s = 1; s <= n; s++) {
    const G = playMatch(1000 + s, (G, p, acts, r) => p === 1 ? AI.choose(G, p, { samples: 40 }) : acts[Math.floor(r() * acts.length)]);
    if (G.matchWinner === 1) ai++;
  }
  console.log(`      IA ganó ${ai}/${n}`);
  assert(ai >= n * 0.85);
});
t('2000 partidos al azar en modo realista terminan sin errores', () => {
  let pen = 0, disq = 0;
  for (let s = 1; s <= 2000; s++) {
    const G = playMatch(9000 + s, (G, p, acts, r) => acts[Math.floor(r() * acts.length)], true);
    if (G.disq) disq++;
  }
  console.log(`      descalificaciones: ${disq}`);
});
t('2000 partidos de parejas al azar (normal y realista) terminan sin errores', () => {
  for (let s = 1; s <= 1000; s++) playMatch(20000 + s, (G, p, acts, r) => acts[Math.floor(r() * acts.length)], false, 4);
  for (let s = 1; s <= 1000; s++) playMatch(30000 + s, (G, p, acts, r) => acts[Math.floor(r() * acts.length)], true, 4);
});
t('parejas: equipo de IA contra equipo al azar gana la gran mayoría', () => {
  let ai = 0; const n = 20;
  for (let s = 1; s <= n; s++) {
    const G = playMatch(40000 + s, (G, p, acts, r) => p % 2 === 1 ? AI.choose(G, p, { samples: 25 }) : acts[Math.floor(r() * acts.length)], false, 4);
    if (G.matchWinner === 1) ai++;
  }
  console.log(`      IA ganó ${ai}/${n}`);
  assert(ai >= n * 0.8);
});
t('6000 partidos al azar con reglas variadas y tercetos terminan sin errores', () => {
  const opts = [{}, { ley: true }, { florCompanero: 'tengo' }, { iguales: 'mano' }, { flor: false }, { target: 30, chicosToWin: 1, ley: true, florCompanero: 'tengo' }, { achique: true, target: 10 }, { achique: true, target: 20, chicosToWin: 1 }];
  let k = 0;
  for (const players of [2, 4, 6]) for (const manual of [false, true]) for (let s = 1; s <= 1000; s++) {
    const rules = opts[(s + k) % opts.length];
    playMatch(50000 + k * 1000 + s, (G, p, acts, r) => acts[Math.floor(r() * acts.length)], manual, players, rules);
    k++;
  }
});
t('tercetos y ley: equipo de IA contra equipo al azar gana la gran mayoría', () => {
  let ai = 0; const n = 12;
  for (let s = 1; s <= n; s++) {
    const G = playMatch(70000 + s, (G, p, acts, r) => p % 2 === 1 ? AI.choose(G, p, { samples: 20, level: ['facil','normal','dificil'][s % 3] }) : acts[Math.floor(r() * acts.length)], false, 6, { ley: true });
    if (G.matchWinner === 1) ai++;
  }
  console.log(`      IA ganó ${ai}/${n}`);
  assert(ai >= n * 0.75);
});
t('IA contra IA termina sin errores', () => {
  for (let s = 1; s <= 10; s++) playMatch(5000 + s, (G, p) => AI.choose(G, p, { samples: 30 }));
});

// ---- Mesa compartida: lo que ve cada jugador (vista.js) ----
const { viewFor } = require('./vista.js');
t('ninguna vista deja ver cartas ajenas, puntos ajenos, señas de rivales ni la muestra antes de tiempo', () => {
  for (const n of [2, 4, 6]) for (let seed = 1; seed <= 4; seed++) {
    const r = seeded(90000 + seed * 7 + n); T.setRng(r); AI.setRng(r);
    const humans = n === 2 ? [0, 1] : n === 4 ? [0, 2, 3] : [0, 1, 4];
    const G = T.newMatch({ players: n, humans, rules: n >= 4 ? { ley: true } : {} }); T.startRound(G);
    let steps = 0;
    while (G.phase !== 'matchEnd' && steps++ < 3000) {
      for (let s = 0; s < n; s++) {
        const V = viewFor(G, s), js = JSON.stringify(V), R = G.round;
        assert(!('memory' in V));
        for (let q = 0; q < n; q++) {
          if (q === s) continue;
          if (G.phase === 'play') { for (const c of R.hands[q]) assert(!js.includes(`"${c.id}"`), `desde ${s} se ve una carta de ${q}`); assert(V.round.envPts[q] === null); }
          if (q % 2 !== s % 2) assert(V.round.senasShown[q] === null);
        }
        if (R.leyPhase && !R.hands[s].some(c => c.id === R.muestra.id)) assert(!js.includes(`"${R.muestra.id}"`), 'se ve la muestra durante la ley');
        assert.strictEqual(T.actor(V), T.actor(G));
      }
      if (G.phase !== 'play') { T.nextRound(G); continue; }
      const p = T.actor(G);
      let a = AI.choose(G, p, { samples: 6 });
      if (a.type === 'sing' && a.pts === null) a = { type: 'sing', pts: G.round.canto.kind === 'flor' ? G.round.flor.pts[p] : G.round.envPts[p] };
      if (n >= 4 && humans.includes(p) && r() < 0.15) T.setSenas(G, p, T.senasFor(G.round.initial[p], G.round.muestra));
      T.apply(G, p, a);
    }
  }
});

console.log(fails ? `\n${fails} FALLAS` : '\nTodo OK');
process.exit(fails ? 1 : 0);
