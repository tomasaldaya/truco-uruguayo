// Casos borde del modo realista: arma manos a mano y muestra qué decide el juego. No cambia nada del juego.
const T = require('../../engine.js');
const AI = require('../../ai.js');
const C = (n, s) => ({ n, s, id: n + '-' + s });
function setup(h0, h1, muestra, o = {}) {
  const G = T.newMatch({ manual: [o.manual0 !== false, !!o.manual1], rules: o.rules });
  G.dealer = o.cpuMano ? 1 : 0; G.round = { dummy: true };
  if (o.scores) G.scores = o.scores.slice();
  const order = [], first = o.cpuMano ? h1 : h0, second = o.cpuMano ? h0 : h1;
  for (let i = 0; i < 3; i++) { order.push(first[i]); order.push(second[i]); }
  order.push(muestra);
  const rest = T.makeDeck().filter(c => !order.some(x => x.id === c.id));
  T.startRound(G, rest.concat(order.reverse()));
  return G;
}
function setup4(hands, muestra, dealer, manual, rules, scores) {
  const G = T.newMatch({ players: 4, manual: manual || [true], rules });
  G.dealer = (dealer + 3) % 4; G.round = { dummy: true };
  if (scores) G.scores = scores.slice();
  const mano = (dealer + 1) % 4, order = [];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) order.push(hands[(mano + i) % 4][r]);
  order.push(muestra);
  const rest = T.makeDeck().filter(c => !order.some(x => x.id === c.id));
  T.startRound(G, rest.concat(order.reverse()));
  return G;
}
const typ = (ty, extra) => a => a.type === ty && Object.entries(extra || {}).every(([k, v]) => a[k] === v);
function act(G, p, f) { const a = T.legal(G, p).find(f); if (!a) throw new Error(`acción no legal para ${p}: ${f} | legales: ${T.legal(G, p).map(x => T.label(G, x)).join(', ')}`); T.apply(G, p, a); }
const sing = (G, p, n) => T.apply(G, p, { type: 'sing', pts: n });
// la computadora juega hasta que le toque al humano (0) o termine la mano
function cpu(G, hasta = 0) { let k = 0; while (G.phase === 'play' && T.actor(G) !== hasta && k++ < 50) { const q = T.actor(G); T.apply(G, q, AI.choose(G, q, { samples: 30 })); } }
function humano(G) {
  const R = G.round, L = T.legal(G, 0);
  if (R.canto) { const real = R.canto.kind === 'flor' ? R.flor.pts[0] : R.envPts[0]; try { const G2 = JSON.parse(JSON.stringify(G)); T.apply(G2, 0, { type: 'sing', pts: real }); return { type: 'sing', pts: real }; } catch (e) { return { type: 'buenas' }; } }
  return L.find(x => x.type === 'play') || L.find(x => x.type === 'quiero') || L.find(x => x.type === 'noflor') || L[0];
}
function jugarTodo(G, mias) { let k = 0; while (G.phase === 'play' && k++ < 80) { const q = T.actor(G); let a;
  if (q === 0) { a = humano(G); if (a.type === 'play' && mias && mias.length) { const id = mias.find(i => G.round.hands[0].some(c => c.id === i)); if (id) a = T.legal(G, 0).find(x => x.type === 'play' && x.card.id === id); } }
  else a = AI.choose(G, q, { samples: 30 });
  T.apply(G, q, a); } }
function resumen(G, desde = 0) {
  const R = G.round;
  return {
    puntos: G.scores.join('-'), fase: G.phase, ganador_partido: G.matchWinner,
    pena: R.penalty ? `${R.penalty.reason} (total ${R.penalty.total})` : null,
    descalificado: G.disq ? `${G.names[G.disq.p]}: ${G.disq.reason}` : null,
    faltas: R.faults.map((f, p) => f.length ? `${G.names[p]}: ${f.join('+')}` : null).filter(Boolean),
    log: G.log.slice(desde).filter(l => l.kind !== 'canto' || true).map(l => (l.who !== null ? G.names[l.who] + ': ' : '· ') + l.text),
  };
}
const casos = [];
function caso(nombre, f) { try { casos.push([nombre, f()]); } catch (e) { casos.push([nombre, { ERROR: e.message }]); } }

// ======================= FLOR vs ENVIDO (el ejemplo) =======================
// 2 de la muestra (copa) + 1 y 7 de oro: flor 38; sin flor, envido 37
const FLOR38 = [C(2, 'copa'), C(1, 'oro'), C(7, 'oro')];
const FLOR37 = [C(7, 'oro'), C(6, 'oro'), C(4, 'oro')];   // flor 37 sin piezas; envido 33
caso('A1 · Tengo flor de 38 (37 de envido), me tocan envido, no canto la flor, quiero y canto 37: gano el envido', () => {
  const G = setup(FLOR38, [C(6, 'basto'), C(7, 'basto'), C(3, 'espada')], C(5, 'copa'), { cpuMano: true });
  act(G, 1, typ('envido', { kind: 'envido' }));
  const opciones = T.legal(G, 0).map(a => T.label(G, a));
  const n0 = G.log.length; act(G, 0, typ('noflor')); const despues = T.legal(G, 0).map(a => T.label(G, a)); act(G, 0, typ('quiero')); cpu(G);
  if (T.actor(G) === 0 && G.round.canto) sing(G, 0, 37);
  return Object.assign({ opciones_al_tocarme: opciones, opciones_despues: despues, envPts: G.round.envPts[0], florPts: G.round.florPts[0] }, resumen(G, n0));
});
caso('A2 · Igual, pero el rival tiene 33 y yo canto 37 mintiendo poco: no; canto 37 real pero PIERDO (rival con 37 y mano)', () => {
  const G = setup(FLOR38, [C(2, 'espada'), C(7, 'basto'), C(4, 'oro')], C(5, 'copa'), { cpuMano: true }); // rival: 7 basto + ... 27? 
  act(G, 1, typ('envido', { kind: 'envido' })); const n0 = G.log.length; act(G, 0, typ('noflor')); act(G, 0, typ('quiero')); cpu(G);
  if (T.actor(G) === 0 && G.round.canto) { const legales = T.legal(G, 0).map(a => a.type); if (legales.includes('buenas')) T.apply(G, 0, { type: 'buenas' }); else sing(G, 0, 37); }
  return Object.assign({ rival_env: G.round.envPts[1] }, resumen(G, n0));
});
caso('A3 · Tengo flor, me tocan envido y digo NO QUIERO (no canto la flor): el rival cobra 1. Después juego las 3 cartas', () => {
  const G = setup(FLOR38, [C(6, 'basto'), C(7, 'basto'), C(3, 'espada')], C(5, 'copa'), { cpuMano: true });
  act(G, 1, typ('envido', { kind: 'envido' })); const n0 = G.log.length; act(G, 0, typ('noflor')); act(G, 0, typ('noquiero'));
  jugarTodo(G, ['1-oro', '2-copa', '7-oro']);
  return Object.assign({ cartas_que_jugue: G.round.played[0] }, resumen(G, n0));
});
caso('A3b · Igual que A3 pero la mano se termina antes de que juegue la tercera', () => {
  const G = setup(FLOR38, [C(6, 'basto'), C(7, 'basto'), C(3, 'espada')], C(5, 'copa'), { cpuMano: true });
  act(G, 1, typ('envido', { kind: 'envido' })); const n0 = G.log.length; act(G, 0, typ('noflor')); act(G, 0, typ('noquiero'));
  jugarTodo(G, ['2-copa', '7-oro', '1-oro']);
  return resumen(G, n0);
});
caso('A4 · Tengo flor, YO toco envido sin cantarla, el rival no quiere (gano 1). Después juego las 3 cartas', () => {
  const G = setup(FLOR38, [C(3, 'basto'), C(4, 'espada'), C(12, 'copa')], C(5, 'copa'));
  const n0 = G.log.length; act(G, 0, typ('envido', { kind: 'envido' }));
  T.apply(G, 1, { type: 'noquiero' }); jugarTodo(G, ['1-oro', '2-copa', '7-oro']);
  return Object.assign({ cartas_que_jugue: G.round.played[0] }, resumen(G, n0));
});
caso('A5 · Tengo flor, YO toco envido sin cantarla, el rival no quiere (gano 1) y la mano se termina antes de la tercera carta', () => {
  const G = setup(FLOR38, [C(6, 'basto'), C(12, 'basto'), C(3, 'espada')], C(5, 'copa'));
  const n0 = G.log.length; act(G, 0, typ('envido', { kind: 'envido' }));
  // si la compu quiere, canto mis 37 reales; si no quiere, sigo
  cpu(G); if (G.round.canto && T.actor(G) === 0) sing(G, 0, 37);
  if (G.phase === 'play') { act(G, 0, a => a.type === 'play' && a.card.id === '2-copa'); cpu(G); }
  if (G.phase === 'play') { const m = T.legal(G, 0).find(a => a.type === 'mazo'); if (m) T.apply(G, 0, m); }
  return resumen(G, n0);
});
caso('A6 · Canto la flor como corresponde (38) y el rival no tiene: gano 3 y la muestro al final', () => {
  const G = setup(FLOR38, [C(6, 'basto'), C(7, 'basto'), C(3, 'espada')], C(5, 'copa'), { cpuMano: true });
  act(G, 1, typ('envido', { kind: 'envido' })); const n0 = G.log.length; act(G, 0, typ('flor'));
  return Object.assign({ tengo_que_mostrar: G.round.mustShow[0] }, resumen(G, n0));
});

// ======================= CANTAR LOS PUNTOS =======================
const H0 = [C(6, 'oro'), C(7, 'oro'), C(3, 'basto')];      // 33
const H1 = [C(6, 'basto'), C(1, 'basto'), C(3, 'oro')];    // 27
caso('B1 · Miento para arriba (tengo 33, canto 35) y gano el envido', () => {
  const G = setup(H0, H1, C(4, 'espada')); act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero'));
  const n0 = G.log.length; sing(G, 0, 35); return resumen(G, n0);
});
caso('B2 · Canto MENOS de lo que tengo pero igual gano (tengo 33, canto 28 contra 27)', () => {
  const G = setup(H0, H1, C(4, 'espada'), { cpuMano: true }); act(G, 1, typ('envido', { kind: 'envido' })); act(G, 0, typ('quiero'));
  const n0 = G.log.length; cpu(G); let r = null; try { sing(G, 0, 28); } catch (e) { r = e.message; }
  return Object.assign({ error: r }, resumen(G, n0));
});
caso('B3 · Digo "son buenas" teniendo más (tengo 33, el rival canta 27) y la mano termina sin jugar las 3', () => {
  const G = setup(H0, H1, C(4, 'espada'), { cpuMano: true }); act(G, 1, typ('envido', { kind: 'envido' })); act(G, 0, typ('quiero'));
  const n0 = G.log.length; cpu(G); T.apply(G, 0, { type: 'buenas' });
  if (G.phase === 'play') { cpu(G); const m = T.legal(G, 0).find(a => a.type === 'mazo'); if (m) T.apply(G, 0, m); }
  return resumen(G, n0);
});
caso('B4 · Digo "son buenas" teniendo más y después juego las 3 cartas', () => {
  const G = setup(H0, H1, C(4, 'espada'), { cpuMano: true }); act(G, 1, typ('envido', { kind: 'envido' })); act(G, 0, typ('quiero'));
  const n0 = G.log.length; cpu(G); T.apply(G, 0, { type: 'buenas' }); jugarTodo(G, ['3-basto', '6-oro', '7-oro']);
  return Object.assign({ cartas_que_jugue: G.round.played[0] }, resumen(G, n0));
});
caso('B5 · Miento para arriba (tengo 22, canto 34 contra 33) y gano: ¿y si el rival tiene más?', () => {
  const G = setup([C(2, 'oro'), C(12, 'oro'), C(5, 'basto')], H0.map(c => c), C(4, 'espada'), { cpuMano: true });
  act(G, 1, typ('envido', { kind: 'envido' })); act(G, 0, typ('quiero')); const n0 = G.log.length; cpu(G);
  let err = null; try { sing(G, 0, 34); } catch (e) { err = e.message; } cpu(G);
  if (G.phase === 'play') jugarTodo(G);
  return Object.assign({ mi_envido_real: G.round.envPts[0], error: err }, resumen(G, n0));
});
caso('B6 · Soy mano y quiero decir "son buenas" de entrada', () => {
  const G = setup(H0, H1, C(4, 'espada')); act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero'));
  let err = null; try { T.apply(G, 0, { type: 'buenas' }); } catch (e) { err = e.message; }
  return { opciones: T.legal(G, 0).map(a => T.label(G, a)), error: err };
});
caso('B7 · Cifras imposibles: 15, 38, 36 sin poder tenerlas', () => {
  const G = setup(H0, H1, C(4, 'espada')); act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero'));
  const r = {}; for (const n of [15, 38, 36]) { try { const G2 = JSON.parse(JSON.stringify(G)); sing(G2, 0, n); r[n] = 'aceptado → ' + resumen(G2).puntos + (G2.round.penalty ? ' pena: ' + G2.round.penalty.reason : ''); } catch (e) { r[n] = 'rechazado: ' + e.message; } }
  return r;
});
caso('B8 · Dos piezas (2 y 4 de la muestra) + un 7: ¿cuánto vale el envido?', () => {
  const G = setup([C(2, 'copa'), C(4, 'copa'), C(7, 'oro')], H1, C(5, 'copa'));
  return { envido: G.round.envPts[0], flor: G.round.florPts[0], tiene_flor: G.round.florHas[0] };
});

// ======================= FLOR EN EL MODO REALISTA =======================
caso('C1 · Canto flor sin tenerla (farol)', () => {
  const G = setup(H0, H1, C(4, 'espada')); const n0 = G.log.length; act(G, 0, typ('flor')); return resumen(G, n0);
});
caso('C2 · Tengo flor y juego sin cantarla; la mano termina en 2 bazas (la tercera carta no se ve)', () => {
  const G = setup(FLOR38, H1, C(5, 'copa')); const n0 = G.log.length;
  jugarTodo(G, ['2-copa', '7-oro', '1-oro']);
  return Object.assign({ cartas_jugadas: G.round.played[0] }, resumen(G, n0));
});
caso('C2b · Tengo flor y juego sin cantarla; se juegan las 3 cartas', () => {
  const G = setup(FLOR38, [C(3, 'basto'), C(4, 'espada'), C(12, 'basto')], C(5, 'copa')); const n0 = G.log.length;
  jugarTodo(G, ['1-oro', '2-copa', '7-oro']);
  return Object.assign({ cartas_jugadas: G.round.played[0] }, resumen(G, n0));
});
caso('C3 · Tengo flor, el rival canta flor y yo digo "seguir sin cantar"', () => {
  const G = setup(FLOR38, [C(4, 'basto'), C(5, 'basto'), C(6, 'basto')], C(5, 'copa'), { cpuMano: true });
  const n0 = G.log.length; cpu(G); const op = T.legal(G, 0).map(a => T.label(G, a));
  if (T.legal(G, 0).some(a => a.type === 'noflor')) act(G, 0, typ('noflor'));
  jugarTodo(G);
  return Object.assign({ opciones: op }, resumen(G, n0));
});
caso('C4 · Contra flor: canto mis puntos de flor mal (tengo 38, canto 40) y gano', () => {
  const G = setup(FLOR38, [C(4, 'basto'), C(5, 'basto'), C(6, 'basto')], C(5, 'copa'), { cpuMano: true });
  cpu(G); const n0 = G.log.length; act(G, 0, typ('flor'));
  let r = {};
  try {
    cpu(G); r.opciones = T.legal(G, 0).map(a => T.label(G, a));
    if (T.legal(G, 0).some(a => a.type === 'quiero')) act(G, 0, typ('quiero')); cpu(G);
    if (G.round.canto && T.actor(G) === 0) sing(G, 0, 40); cpu(G);
  } catch (e) { r.error = e.message; }
  return Object.assign(r, resumen(G, n0));
});

// ======================= MAZO, PASO Y MOSTRAR =======================
caso('D1 · Gané el envido (realista) y me voy al mazo', () => {
  const G = setup(H0, H1, C(4, 'espada')); act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero')); sing(G, 0, 33);
  const n0 = G.log.length; act(G, 0, typ('mazo')); return resumen(G, n0);
});
caso('D2 · Gané el envido NO QUERIDO (1 punto) y me voy al mazo: ¿tengo que mostrar?', () => {
  const G = setup(H0, H1, C(4, 'espada')); act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('noquiero'));
  const n0 = G.log.length; const paso = T.legal(G, 0).some(a => a.type === 'paso'); act(G, 0, typ('mazo'));
  return Object.assign({ tenia_paso: paso, tenia_que_mostrar: G.round.mustShow[0] }, resumen(G, n0));
});
caso('D3 · Gané el envido mintiendo (detectado al instante): ¿llego a poder irme al mazo para no mostrar?', () => {
  const G = setup(H0, H1, C(4, 'espada')); act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero'));
  const n0 = G.log.length; sing(G, 0, 36); return Object.assign({ sigue_la_mano: G.phase === 'play' }, resumen(G, n0));
});

// ======================= LA COMPU DECIDE POR UN JUGADOR REALISTA =======================
caso('E1 · Se me acaba el tiempo cuando tengo que cantar mis puntos (la compu elige por mí)', () => {
  const G = setup(H0, H1, C(4, 'espada')); act(G, 0, typ('envido', { kind: 'envido' })); act(G, 1, typ('quiero'));
  const a = AI.choose(G, 0, { samples: 30 }); let err = null; try { T.apply(G, 0, a); } catch (e) { err = e.message; }
  return { eligio: a, error: err, sigue_esperandome: T.actor(G) === 0 && !!G.round.canto };
});
caso('E2 · Se me acaba el tiempo teniendo flor sin cantar (primera jugada)', () => {
  const r = {}; for (let s = 1; s <= 6; s++) { const G = setup(FLOR38, H1, C(5, 'copa')); const a = AI.choose(G, 0, { samples: 30 }); r['prueba ' + s] = T.label(G, a); }
  return r;
});
caso('E3 · Se me acaba el tiempo cuando el rival cantó flor y yo tengo flor', () => {
  const r = {}; for (let s = 1; s <= 6; s++) { const G = setup(FLOR38, [C(4, 'basto'), C(5, 'basto'), C(6, 'basto')], C(5, 'copa'), { cpuMano: true }); cpu(G); const a = AI.choose(G, 0, { samples: 30 }); r['prueba ' + s] = T.label(G, a); }
  return r;
});
// ======================= MÁS CASOS =======================
caso('E4 · Se me acaba el tiempo en "con ley / a punto" (a ley de juego), teniendo flor', () => {
  const r = {};
  for (let s = 1; s <= 4; s++) {
    const hands = [FLOR38, [C(3, 'basto'), C(4, 'espada'), C(12, 'basto')], [C(6, 'basto'), C(7, 'espada'), C(1, 'copa')], [C(5, 'oro'), C(6, 'oro'), C(10, 'espada')]];
    const G = setup4(hands, C(5, 'copa'), 0, [true], null, [22, 10]);
    let k = 0; while (G.phase === 'play' && T.actor(G) !== 0 && k++ < 20) { const q = T.actor(G); T.apply(G, q, AI.choose(G, q, { samples: 20 })); }
    const L = T.legal(G, 0);
    if (L.some(a => a.type === 'leyest')) r['prueba ' + s] = 'la compu elige por mí: ' + T.label(G, AI.choose(G, 0, { samples: 20 }));
    else r['prueba ' + s] = 'no llegó a la ley (' + L.map(a => T.label(G, a)).slice(0, 4).join(', ') + ')';
  }
  return r;
});
caso('F1 · Parejas: niego mi flor (juego una carta), mi compañero gana un envido y después yo juego las 3', () => {
  const hands = [FLOR37, [C(3, 'basto'), C(4, 'espada'), C(12, 'basto')], [C(4, 'copa'), C(7, 'espada'), C(1, 'basto')], [C(5, 'oro'), C(6, 'basto'), C(10, 'basto')]];
  const G = setup4(hands, C(5, 'copa'), 3, [true]);   // da 3: soy mano
  const n0 = G.log.length;
  act(G, 0, a => a.type === 'play' && a.card.id === '4-oro');           // juego sin cantar la flor
  T.apply(G, 1, T.legal(G, 1).find(a => a.type === 'play'));
  T.apply(G, 2, T.legal(G, 2).find(a => a.type === 'envido' && a.kind === 'envido'));   // el compañero toca
  let k = 0; while (G.phase === 'play' && T.actor(G) !== 0 && k++ < 10) { const q = T.actor(G); const L = T.legal(G, q); T.apply(G, q, L.find(a => a.type === 'quiero') || AI.choose(G, q, { samples: 20 })); }
  let j = 0; while (G.phase === 'play' && G.round.canto && j++ < 10) { const q = T.actor(G); T.apply(G, q, q === 0 ? (G.round.canto.best ? { type: 'buenas' } : { type: 'sing', pts: 33 }) : AI.choose(G, q, { samples: 20 })); }
  jugarTodo(G, ['7-oro', '6-oro']);
  return Object.assign({ cartas_que_jugue: G.round.played[0], gano_el_envido: G.round.envido.result && G.names[G.round.envido.result.winner] }, resumen(G, n0));
});
caso('F2 · Parejas: mi compañero (la compu) grita truco antes de que yo cante mi flor', () => {
  const hands = [FLOR38, [C(3, 'basto'), C(4, 'espada'), C(12, 'copa')], [C(6, 'espada'), C(7, 'espada'), C(1, 'basto')], [C(5, 'oro'), C(4, 'oro'), C(10, 'basto')]];
  const G = setup4(hands, C(5, 'copa'), 0, [true]);   // da 0: es mano 1, después 2 (mi compañero), 3, y yo último
  const n0 = G.log.length;
  T.apply(G, 1, T.legal(G, 1).find(a => a.type === 'play'));
  T.apply(G, 2, T.legal(G, 2).find(a => a.type === 'truco'));
  return Object.assign({ mi_flor: { perdida: G.round.flor.lost[0], por: G.round.flor.lostBy[0], negada: G.round.flor.negada[0] }, opciones_cuando_me_toca: T.actor(G) === 0 ? T.legal(G, 0).map(a => T.label(G, a)) : 'no me toca' }, resumen(G, n0));
});
caso('F3 · Ley de juego: digo "con ley" sin tener flor', () => {
  const hands = [[C(3, 'basto'), C(4, 'espada'), C(12, 'copa')], [C(6, 'basto'), C(7, 'basto'), C(1, 'copa')], [C(6, 'espada'), C(7, 'espada'), C(1, 'basto')], [C(5, 'oro'), C(4, 'oro'), C(10, 'basto')]];
  const G = setup4(hands, C(5, 'copa'), 3, [true], null, [22, 10]);
  const n0 = G.log.length; let k = 0;
  while (G.phase === 'play' && k++ < 30) {
    const q = T.actor(G), L = T.legal(G, q);
    if (q === 1 && L.some(a => a.type === 'ley')) { T.apply(G, q, L.find(a => a.type === 'ley' && a.form === 'todo')); continue; }
    if (q === 0 && L.some(a => a.type === 'leyest')) { T.apply(G, 0, L.find(a => a.type === 'leyest' && a.ley)); continue; }
    if (q === 0) { T.apply(G, 0, humano(G)); continue; }
    T.apply(G, q, AI.choose(G, q, { samples: 20 }));
  }
  return resumen(G, n0);
});
caso('G1 · Un jugador realista abandona online y la compu sigue en su lugar (G.manual queda prendido): le toca cantar', () => {
  const G = setup(H0, H1, C(4, 'espada'), { manual1: true });   // el lugar 1 "es realista" pero lo maneja la compu
  act(G, 0, typ('envido', { kind: 'envido' })); T.apply(G, 1, { type: 'quiero' });
  T.apply(G, 0, { type: 'sing', pts: 33 });
  const a = AI.choose(G, 1, { samples: 20 }); let err = null; try { T.apply(G, 1, a); } catch (e) { err = e.message; }
  return { la_compu_eligio: a, error: err };
});

// jugadas exactas de los dos lados: [quién, carta] (sin truco), para que se jueguen las 3 cartas
function secuencia(G, pasos) { for (const [q, id] of pasos) { if (G.phase !== 'play') break; const a = T.legal(G, q).find(x => x.type === 'play' && x.card.id === id); if (!a) throw new Error(`no puede jugar ${id} (${q}); legales: ${T.legal(G, q).map(x => T.label(G, x)).join(', ')}`); T.apply(G, q, a); } }
caso('H1 · Niego la flor, PIERDO el envido honestamente (33 contra 35) y se juegan las 3 cartas', () => {
  const G = setup(FLOR37, [C(5, 'copa'), C(7, 'basto'), C(3, 'espada')], C(2, 'copa'), { cpuMano: true });
  act(G, 1, typ('envido', { kind: 'envido' })); const n0 = G.log.length; act(G, 0, typ('noflor')); act(G, 0, typ('quiero'));
  cpu(G); T.apply(G, 0, { type: 'buenas' });
  secuencia(G, [[1, '3-espada'], [0, '4-oro'], [1, '7-basto'], [0, '7-oro'], [0, '6-oro'], [1, '5-copa']]);
  return Object.assign({ cartas_que_jugue: G.round.played[0] }, resumen(G, n0));
});
caso('H2 · Niego la flor, toco envido, el rival NO QUIERE (gano 1 punto) y se juegan las 3 cartas', () => {
  const G = setup(FLOR37, [C(3, 'basto'), C(1, 'espada'), C(12, 'basto')], C(2, 'copa'));
  const n0 = G.log.length; act(G, 0, typ('envido', { kind: 'envido' })); T.apply(G, 1, { type: 'noquiero' });
  secuencia(G, [[0, '4-oro'], [1, '3-basto'], [1, '12-basto'], [0, '7-oro'], [0, '6-oro'], [1, '1-espada']]);
  return Object.assign({ cartas_que_jugue: G.round.played[0] }, resumen(G, n0));
});
caso('H3 · Niego la flor, no se toca nada y se juegan las 3 cartas', () => {
  const G = setup(FLOR37, [C(3, 'basto'), C(1, 'espada'), C(12, 'basto')], C(2, 'copa'));
  const n0 = G.log.length;
  secuencia(G, [[0, '4-oro'], [1, '3-basto'], [1, '12-basto'], [0, '7-oro'], [0, '6-oro'], [1, '1-espada']]);
  return Object.assign({ cartas_que_jugue: G.round.played[0] }, resumen(G, n0));
});
caso('H4 · Digo "son buenas" teniendo más, y la mano termina sin ver mi tercera carta', () => {
  const G = setup(H0, H1, C(4, 'espada'), { cpuMano: true }); act(G, 1, typ('envido', { kind: 'envido' })); act(G, 0, typ('quiero'));
  const n0 = G.log.length; cpu(G); T.apply(G, 0, { type: 'buenas' });
  secuencia(G, [[1, '1-basto'], [0, '6-oro'], [1, '3-oro'], [0, '3-basto']]);
  return Object.assign({ cartas_que_jugue: G.round.played[0] }, resumen(G, n0));
});
for (const [n, r] of casos) { console.log('\n### ' + n); console.log(JSON.stringify(r, null, 1).slice(0, 2200)); }
