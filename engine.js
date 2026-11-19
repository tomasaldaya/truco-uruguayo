// Motor de reglas del Truco Uruguayo, según el Reglamento.
// Mano a mano (2), parejas (4) o tercetos (6). Equipo de un jugador = p % 2.
// Asientos: 0 = humano (abajo) y se sigue hacia la derecha: el siguiente de p es (p + 1) % n.
// Jerga: tocar = envido, gritar = truco, cantar = flor (o los tantos).
// Reglas de la mesa (G.rules): variantes que cambian según dónde se juegue.
// Modo realista (G.manual[p]): el jugador canta sus puntos, puede negar la flor o
// cantarla sin tenerla. Las faltas se descubren cuando se ven sus cartas: la flor negada, en cuanto
// las cartas jugadas la prueban (o al ganar un envite); los puntos mal cantados, al ganar o al jugar las tres.
(function (global) {
  'use strict';

  let rng = Math.random;
  function setRng(f) { rng = f; }

  const SUITS = ['oro', 'copa', 'espada', 'basto'];
  const NUMS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
  const PIEZA_ORDER = [2, 4, 5, 11, 10];
  const PIEZA_ENV = { 2: 30, 4: 29, 5: 28, 11: 27, 10: 27 };
  const TRUCO_NAMES = { 2: 'Truco', 3: 'Retruco', 4: 'Vale cuatro' };
  const FIG = { 10: 'Sota', 11: 'Caballo', 12: 'Rey' };
  const DEFAULT_RULES = {
    target: 40,               // Art. 4 (en muchas mesas se juega a 30)
    chicosToWin: 2,           // al mejor de tres chicos (1 = un solo chico)
    flor: true,               // con o sin flor
    florCompanero: 'niega',   // si tu compañero toca o grita antes de que cantes tu flor: 'niega' (se anula) o 'tengo' (decís "tengo flor")
    iguales: 'parda',         // cartas iguales de rivales: 'parda' (Art. 57) o 'mano' (Art. 12, gana el más mano)
    senas: true,              // señas entre compañeros (Art. 102)
    mazo: 'solo',             // irse al mazo sin ser el pie: 'solo' (sale ese jugador) o 'equipo' (Art. 90)
    tiempo: 30,               // segundos por decisión de cada persona (0 = sin límite); al vencer decide la computadora (lo maneja la interfaz)
  };
  const LEY_FORMS = {
    todo: 'Todo dicho', falta: 'La falta envido', resto: 'El resto', falta_resto: 'Falta envido y resto',
    falta_truco: 'La falta envido y el truco', truco: 'El truco', resto_truco: 'Resto y truco',
  };

  function makeDeck() {
    const d = [];
    for (const s of SUITS) for (const n of NUMS) d.push({ n, s, id: n + '-' + s });
    return d;
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---- Valores (Cap. II) ----
  function piezaRole(c, m) {
    if (c.s !== m.s) return null;
    if (PIEZA_ORDER.includes(c.n)) return c.n;
    if (c.n === 12 && PIEZA_ORDER.includes(m.n)) return m.n;
    return null;
  }
  function isPieza(c, m) { return piezaRole(c, m) !== null; }
  function rank(c, m) {
    const r = piezaRole(c, m);
    if (r !== null) return 100 - PIEZA_ORDER.indexOf(r);
    if (c.n === 1 && c.s === 'espada') return 90;
    if (c.n === 1 && c.s === 'basto') return 89;
    if (c.n === 7 && c.s === 'espada') return 88;
    if (c.n === 7 && c.s === 'oro') return 87;
    if (c.n === 3) return 80;
    if (c.n === 2) return 79;
    if (c.n === 1) return 78;
    return { 12: 70, 11: 69, 10: 68, 7: 67, 6: 66, 5: 65, 4: 64 }[c.n];
  }
  function category(c, m) {
    const r = rank(c, m);
    if (r >= 96) return 'pieza';
    if (r >= 87) return 'mata';
    if (r >= 78) return 'fio';
    return c.n >= 10 ? 'negra' : 'blanca';
  }
  function envVal(c, m) {
    const r = piezaRole(c, m);
    if (r !== null) return PIEZA_ENV[r];
    if (c.n >= 10) return 0;
    return c.n;
  }
  function hasFlor(cards, m) {
    const p = cards.filter(c => isPieza(c, m));
    const o = cards.filter(c => !isPieza(c, m));
    if (p.length >= 2) return true;
    if (p.length === 1) return o[0].s === o[1].s;
    return o[0].s === o[1].s && o[1].s === o[2].s;
  }
  function florPoints(cards, m) {
    const p = cards.filter(c => isPieza(c, m)).map(c => envVal(c, m)).sort((a, b) => b - a);
    const o = cards.filter(c => !isPieza(c, m)).map(c => envVal(c, m));
    if (p.length === 3) return p[0] + (p[1] - 20) + (p[2] - 20);
    if (p.length === 2) return p[0] + (p[1] - 20) + o[0];
    if (p.length === 1) return p[0] + o[0] + o[1];
    return 20 + o[0] + o[1] + o[2];
  }
  function envidoPoints(cards, m) {
    const p = cards.filter(c => isPieza(c, m)).sort((a, b) => envVal(b, m) - envVal(a, m));
    const o = cards.filter(c => !isPieza(c, m));
    if (p.length >= 1) {
      const rest = cards.filter(c => c !== p[0]).map(c => isPieza(c, m) ? envVal(c, m) - 20 : envVal(c, m));
      return Math.min(37, envVal(p[0], m) + Math.max(...rest));
    }
    let best = -1;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      if (o[i].s === o[j].s) best = Math.max(best, 20 + envVal(o[i], m) + envVal(o[j], m));
    }
    if (best >= 0) return best;
    return Math.max(...o.map(c => envVal(c, m)));
  }
  function cardName(c) {
    const n = FIG[c.n] || (c.n === 1 ? 'As' : String(c.n));
    return n + ' de ' + c.s;
  }

  // ---- Señas (Art. 102) ----
  const SENAS = {
    '2': { gesto: 'levanta las cejas', cartas: 'el dos' },
    '4': { gesto: 'adelanta los labios', cartas: 'el cuatro' },
    '5': { gesto: 'frunce la nariz', cartas: 'el cinco' },
    'perico': { gesto: 'guiña un ojo', cartas: 'perico o perica' },
    'mata': { gesto: 'tuerce los labios', cartas: 'una mata' },
    '3': { gesto: 'se muerde el labio', cartas: 'un tres' },
    'dos': { gesto: 'abre un poco la boca', cartas: 'un dos' },
    'as': { gesto: 'saca un poquito la lengua', cartas: 'un as de copa u oro' },
    'nada': { gesto: 'cierra los ojos', cartas: 'nada de valor' },
  };
  // cuántas veces se puede repetir cada seña (una por carta: con dos matas, la seña va dos veces)
  const SENA_MAX = { '2': 1, '4': 1, '5': 1, perico: 2, mata: 3, '3': 3, dos: 3, as: 2, nada: 1 };
  function senaOf(c, m) {
    const r = piezaRole(c, m);
    if (r === 2 || r === 4 || r === 5) return String(r);
    if (r === 11 || r === 10) return 'perico';
    const cat = category(c, m);
    if (cat === 'mata') return 'mata';
    if (c.n === 3) return '3';
    if (cat === 'fio') return c.n === 2 ? 'dos' : 'as';
    return null;
  }
  const SENA_ORDER = Object.keys(SENAS);
  function senasFor(cards, m) {
    const out = [];
    for (const c of cards) { const s = senaOf(c, m); if (s) out.push(s); }
    out.sort((a, b) => SENA_ORDER.indexOf(a) - SENA_ORDER.indexOf(b));
    return out.length ? out : ['nada'];
  }
  // lo que tiene una lista de más que otra, contando repetidas
  function senasMinus(list, prev) {
    const left = (prev || []).slice(), out = [];
    for (const s of list) { const i = left.indexOf(s); if (i >= 0) left.splice(i, 1); else out.push(s); }
    return out;
  }

  // ---- Bazas (Arts. 57–59). w: equipo ganador de cada baza o -1 (parda) ----
  function roundWinner(w, manoTeam) {
    if (w.length >= 2) {
      const [a, b] = w;
      if (a !== -1 && (b === a || b === -1)) return a;
      if (a === -1 && b !== -1) return b;
    }
    if (w.length === 3) {
      const [a, b, c] = w;
      if (a !== -1 && b !== -1) return c !== -1 ? c : a;
      return c !== -1 ? c : manoTeam;
    }
    return null;
  }

  function validCanto(kind, n) {
    if (!Number.isInteger(n)) return false;
    if (kind === 'flor') return n >= 20 && n <= 47;
    return (n >= 0 && n <= 7) || (n >= 20 && n <= 37);
  }

  // ---- Partido ----
  const NAMES = { 2: ['Vos', 'Computadora'], 4: ['Vos', 'Tito', 'Pocho', 'Nacho'], 6: ['Vos', 'Tito', 'Pocho', 'Nacho', 'Lalo', 'Beto'] };
  function newMatch(opts) {
    opts = opts || {};
    const n = [2, 4, 6].includes(opts.players) ? opts.players : 2;
    const rules = Object.assign({}, DEFAULT_RULES, opts.rules || {});
    const names = opts.names || NAMES[n].slice();
    return {
      n, rules,
      target: rules.target, chicosToWin: rules.chicosToWin,
      scores: [0, 0], chicos: [0, 0],
      dealer: Math.floor(rng() * n),
      manual: (opts.manual || []).concat(Array(n).fill(false)).slice(0, n),
      humans: opts.humans || [0],
      round: null, phase: 'idle', log: [], roundNo: 0, roundInChico: 0,
      matchWinner: null, chicoWinner: null, disq: null,
      names,
      teamNames: opts.teamNames || (n === 2 ? names.slice() : ['Nosotros', 'Ellos']),
      memory: { lies: {}, bluff: {} },
    };
  }
  const team = p => p % 2;
  const nxt = (G, p) => (p + 1) % G.n;
  function pos(G, p) { return (p - G.round.mano + G.n) % G.n; }
  function inGame(R, q) { return R.active[q] && !R.out[q]; }
  function fromMano(G) {
    const R = G.round, o = [];
    for (let i = 0; i < G.n; i++) { const q = (R.mano + i) % G.n; if (inGame(R, q)) o.push(q); }
    return o;
  }
  function firstInGameFrom(G, p) {
    const R = G.round;
    for (let i = 0; i < G.n; i++) { const q = (p + i) % G.n; if (inGame(R, q)) return q; }
    return p;
  }
  function nextIn(G, p) { return firstInGameFrom(G, nxt(G, p)); }
  // El pie es el último de su equipo en jugar (entre los que siguen en juego)
  function esPie(G, p) { return !fromMano(G).some(q => q !== p && team(q) === team(p) && pos(G, q) > pos(G, p)); }
  function trickComplete(G) { const R = G.round; return fromMano(G).every(q => R.cur[q] !== null); }

  function say(G, who, text) {
    G.log.push({ who, text, kind: 'canto', round: G.roundNo });
    if (G.round) G.round.said[who] = { text, t: G.log.length };
  }
  function info(G, text, kind) { G.log.push({ who: null, text, kind: kind || 'info', round: G.roundNo }); }

  function roundType(G) {
    // Art. 83–84: en tercetos, hasta la mitad del chico se alternan rondas generales y mano a mano
    if (G.n !== 6) return 'general';
    if (Math.max(G.scores[0], G.scores[1]) >= G.target / 2) return 'general';
    return G.roundInChico % 2 === 1 ? 'duelos' : 'general';
  }

  function startRound(G, presetDeck) {
    const n = G.n;
    if (G.round) G.dealer = nxt(G, G.dealer);
    G.roundNo++;
    G.chicoWinner = null;
    const deck = presetDeck ? presetDeck.slice() : shuffle(makeDeck());
    const mano = nxt(G, G.dealer);
    const hands = Array.from({ length: n }, () => []);
    for (let r = 0; r < 3; r++) for (let i = 0; i < n; i++) hands[(mano + i) % n].push(deck.pop());
    const muestra = deck.pop();
    const type = roundType(G);
    G.roundInChico++;
    const conFlor = G.rules.flor;
    const R = {
      type, hands, muestra, dealMano: mano,
      initial: hands.map(h => h.slice()),
      florHas: hands.map(h => conFlor && hasFlor(h, muestra)),
      florPts: hands.map(h => (conFlor && hasFlor(h, muestra)) ? florPoints(h, muestra) : 0),
      envPts: hands.map(h => envidoPoints(h, muestra)),
      senas: hands.map(h => senasFor(h, muestra)),
      senasShown: Array(n).fill(null),
      seen: Array.from({ length: n }, () => []),
      duel: null, ley: null, leyPhase: null,
    };
    G.round = R;
    if (type === 'duelos') {
      R.duel = { pairs: [0, 1, 2].map(k => [(mano + k) % n, (mano + k + 3) % n]), idx: 0 };
      initPlay(G, R.duel.pairs[0], R.duel.pairs[0][0]);
    } else {
      initPlay(G, Array.from({ length: n }, (_, i) => i), mano);
      if (G.rules.senas && n >= 4) {
        for (let p = 0; p < n; p++) if (!G.humans.includes(p)) R.senasShown[p] = R.senas[p].slice();
        for (let p = 0; p < n; p++) if (R.senasShown[p]) catchSenas(G, R, p, R.senasShown[p]);
      }
      if (leyDisponible(G)) {
        // Art. 71: tiene preferencia el equipo que va perdiendo; con el tanteador igualado, el del mano
        const t = G.scores[0] < G.scores[1] ? 0 : G.scores[1] < G.scores[0] ? 1 : team(mano);
        R.leyPhase = { team: t, decider: preferHuman(G, fromMano(G).filter(q => team(q) === t)) };
      }
    }
    G.phase = 'play';
    info(G, `Mano ${G.roundNo}. Da ${G.names[G.dealer]}, es mano ${G.names[mano]}.` + (R.leyPhase ? '' : ` Muestra: ${cardName(muestra)}.`));
    if (R.duel) info(G, `Ronda mano a mano (Art. 83): ${duelLabel(G)}.`);
    return G;
  }
  // A ley de juego: en parejas y tercetos, cuando algún equipo ya entró en buenas
  function leyDisponible(G) { return G.n >= 4 && Math.max(G.scores[0], G.scores[1]) > G.target / 2; }
  function duelLabel(G) {
    const R = G.round, [a, b] = R.duel.pairs[R.duel.idx];
    return `${G.names[a]} contra ${G.names[b]}`;
  }
  function preferHuman(G, list) {
    const h = list.find(q => G.humans.includes(q));
    return h !== undefined ? h : list[0];
  }

  // Estado de juego de una mano (o de cada duelo en tercetos)
  function initPlay(G, active, mano) {
    const R = G.round, n = G.n, arr = v => Array(n).fill(v);
    R.active = arr(false); active.forEach(p => R.active[p] = true);
    R.out = arr(false);
    R.mano = mano;
    R.tricks = []; R.cur = arr(null); R.turn = mano; R.trickLeader = mano;
    R.pending = [];
    R.trucoLevel = 1; R.trucoOwner = null;
    R.saidTruco = [false, false]; R.saidQuiero = [false, false];
    R.played = arr(0); R.acted = arr(false); R.trucoCalls = arr(0);
    R.falta = G.target - Math.max(G.scores[0], G.scores[1]);
    if (R.duel) R.falta = Math.min(R.falta, 10); // Art. 86
    R.flor = {
      has: R.florHas.map((h, q) => h && R.active[q]), pts: R.florPts.slice(),
      sung: arr(false), negada: arr(false), lost: arr(false), lostBy: arr(null), achico: [false, false], sungPts: {}, declined: {},
    };
    R.florQueue = []; R.florEnv = null;
    R.envido = { done: false, result: null };
    R.canto = null;
    R.faults = Array.from({ length: n }, () => []);
    R.wonEnvite = [false, false];
    R.mustShow = arr(false);
    R.said = arr(null);
    R.result = null; R.penalty = null;
    R.gained = [[], []];
  }

  // Señas: cuando p le hace señas a sus compañeros, cada rival puede pescar una (una vez por mano).
  const CATCH = 1 / 50;   // de cada 50 señas hechas, una la pesca algún rival
  function catchSenas(G, R, p, list) {
    if (G.n < 4 || !list.length) return;
    const rivals = [];
    for (let o = 0; o < G.n; o++) if (team(o) !== team(p)) rivals.push(o);
    for (const s of list) {
      if (rng() >= CATCH) continue;
      const o = rivals[Math.floor(rng() * rivals.length)];
      R.seen[o].push({ p, s });
    }
  }
  // Lo que uno le dice en voz alta a su compañero (lo oye toda la mesa): la computadora compañera le hace caso
  const PEDIDOS = {
    veni: { texto: '¡Vení!', ayuda: 'que juegue su carta más baja, que la baza la hacés vos' },
    algo: { texto: '¡Jugá algo!', ayuda: 'que juegue una carta que valga algo, no la peor' },
    grita: { texto: '¡Gritá!', ayuda: 'que cante truco' },
    tanto: { texto: 'Tengo algo para el tanto', ayuda: 'que toque (envido) o quiera el envido' },
  };
  function pedir(G, p, k) {
    const R = G.round;
    if (!PEDIDOS[k] || !R || G.phase !== 'play' || G.n < 4 || !R.active[p] || R.out[p] || R.leyPhase) return false;
    R.pedidos = (R.pedidos || []).concat([{ p, k, baza: R.tricks.length, t: G.log.length }]).slice(-12);
    say(G, p, PEDIDOS[k].texto);
    return true;
  }
  function setSenas(G, p, list) {
    const R = G.round;
    if (!R || !G.rules.senas || R.duel) return;
    const prev = R.senasShown[p] || [];
    R.senasShown[p] = list.slice();
    const nuevas = senasMinus(list, prev);
    if (nuevas.length) catchSenas(G, R, p, nuevas);
  }

  function florDecider(G, t) {
    const R = G.round;
    return preferHuman(G, fromMano(G).filter(q => team(q) === t && R.flor.sung[q]));
  }

  function actor(G) {
    const R = G.round;
    if (!R || G.phase !== 'play') return null;
    if (R.leyPhase) return R.leyPhase.decider;
    if (R.ley && R.ley.queue && R.ley.queue.length) return R.ley.queue[0];
    if (R.ley && R.ley.pendingResp) return R.ley.responder;
    if (R.canto) return R.canto.cur;
    if (R.florQueue.length) return R.florQueue[0];
    const top = R.pending[R.pending.length - 1];
    if (top && top.kind === 'fenv') return top.to;
    if (R.florEnv && !R.florEnv.done) return florDecider(G, R.florEnv.curTeam);
    if (top) return top.to;
    return R.turn;
  }

  function florCandidate(G, q) {
    const R = G.round, f = R.flor;
    return f.has[q] && !f.sung[q] && !f.negada[q] && !f.lost[q] && inGame(R, q);
  }
  function anyFlorSung(R) { return R.flor.sung.some(x => x); }
  function mustSingFlor(G, p) { return !G.manual[p] && florCandidate(G, p); }
  function canOfferFlor(G, p) {
    const R = G.round;
    return G.rules.flor && G.manual[p] && !R.flor.sung[p] && !R.flor.negada[p] && !R.flor.lost[p] && !R.acted[p] && R.played[p] === 0;
  }

  function canEnvidar(G, p) {
    const R = G.round, t = team(p);
    if (anyFlorSung(R) || R.envido.done || !inGame(R, p)) return false;
    if (R.played[p] > 0) return false;                       // Art. 22 b)
    if (R.saidTruco[t] || R.saidQuiero[t]) return false;     // Art. 22 c) y d)
    if (R.pending.some(x => x.kind === 'env' || x.kind === 'fenv')) return false;
    if (R.pending.length === 0) return R.turn === p;
    const top = R.pending[R.pending.length - 1];
    return R.pending.length === 1 && top.kind === 'truco' && top.to === p && top.level === 2;
  }
  // el equipo t se va en la primera baza sin haber tocado ni gritado nadie, y al otro le quedaba el envido
  function puedeTocarElOtro(G, t) {
    const R = G.round;
    if (R.tricks.length || R.leyPhase || R.ley || R.envido.done || anyFlorSung(R) || R.trucoLevel > 1) return false;
    if (R.saidTruco[0] || R.saidTruco[1] || R.saidQuiero[0] || R.saidQuiero[1] || R.pending.length) return false;
    return fromMano(G).some(q => team(q) !== t && R.played[q] === 0);
  }
  function canReenvidar(G, p) { const t = team(p); return !G.round.saidTruco[t] && !G.round.saidQuiero[t]; }

  function numAmt(b) { return typeof b.amt === 'number' ? b.amt : 0; }
  function betTotal(bets, falta) {
    if (!bets.length) return 0;
    if (bets.some(b => b.amt === 'falta' || b.amt === 'resto')) return falta;
    const s = bets.reduce((a, b) => a + b.amt, 0);
    return Math.min(s, Math.max(falta, 2));
  }
  function lastNum(bets) { return bets.length ? numAmt(bets[bets.length - 1]) : 0; }

  function envOptions(G, p, bets) {
    const R = G.round, out = [];
    if (bets.some(b => b.amt === 'falta')) return out;
    const prev = bets.reduce((a, b) => a + b.amt, 0);
    const e = Math.max(2, lastNum(bets)), r = Math.max(3, lastNum(bets));
    if (prev + e < R.falta || !bets.length) out.push({ type: 'envido', kind: 'envido', amt: e });
    if (prev + r < R.falta) out.push({ type: 'envido', kind: 'real', amt: r });
    out.push({ type: 'envido', kind: 'falta', amt: 'falta' });
    return out;
  }
  function fenvOptions(G, p, bets) {
    const R = G.round, out = [];
    if (bets.some(b => b.amt === 'falta' || b.amt === 'resto')) return out;
    const contra = bets.some(b => b.contra);
    const prev = bets.reduce((a, b) => a + b.amt, 0);
    const e = Math.max(2, lastNum(bets));
    const ok = prev + e < R.falta || !bets.length;
    if (!contra && ok) out.push({ type: 'fenv', amt: e, contra: false });
    if (!contra) out.push({ type: 'fenv', amt: 'falta', contra: false });
    if (ok) out.push({ type: 'fenv', amt: e, contra: true });
    out.push({ type: 'fenv', amt: 'resto', contra: true });
    return out;
  }

  function beats(G, pts, p, best) {
    if (!best) return true;
    return pts > best.pts || (pts === best.pts && pos(G, p) < pos(G, best.p));
  }
  function realCanto(G, p) { const R = G.round; return R.canto.kind === 'flor' ? R.flor.pts[p] : R.envPts[p]; }
  function autoCantoAction(G, p) {
    const real = realCanto(G, p), best = G.round.canto.best;
    return beats(G, real, p, best) ? { type: 'sing', pts: real } : { type: 'buenas' };
  }

  // Quién contesta un desafío de p: un rival en juego (si needCard, que no haya jugado en esta baza).
  // Si el humano puede contestar, contesta él.
  function rivalResponder(G, p, needCard) {
    const R = G.round, cands = [];
    for (let i = 1; i < G.n; i++) {
      const q = (p + i) % G.n;
      if (team(q) !== team(p) && inGame(R, q) && (!needCard || R.cur[q] === null)) cands.push(q);
    }
    if (cands.length) return preferHuman(G, cands);
    for (let i = 1; i < G.n; i++) { const q = (p + i) % G.n; if (team(q) !== team(p) && inGame(R, q)) return q; }
    return nxt(G, p);
  }

  function legal(G, p) {
    if (G.phase !== 'play' || actor(G) !== p) return [];
    const R = G.round;
    if (R.leyPhase) return Object.keys(LEY_FORMS).map(form => ({ type: 'ley', form })).concat([{ type: 'noley' }]);
    if (R.ley && R.ley.queue && R.ley.queue.length)
      return G.manual[p] ? [{ type: 'leyest', ley: true }, { type: 'leyest', ley: false }] : [{ type: 'leyest', ley: !!R.flor.has[p] }];
    if (R.ley && R.ley.pendingResp) {
      const L = R.ley, out = [];
      for (const e of L.envPart ? [true, false] : [false]) for (const t of L.truco ? [true, false] : [false]) out.push({ type: 'leyresp', env: e, truco: t });
      return out;
    }
    if (R.canto) {
      if (!G.manual[p]) return [autoCantoAction(G, p)];
      const acts = [{ type: 'sing', pts: null }];
      if (R.canto.best) acts.push({ type: 'buenas' });
      return acts;
    }
    if (R.florQueue.length) return G.manual[p] ? [{ type: 'flor' }, { type: 'noflor' }] : [{ type: 'flor' }];
    if (mustSingFlor(G, p)) return [{ type: 'flor' }];
    const extra = canOfferFlor(G, p) ? [{ type: 'flor' }] : [];
    const top = R.pending[R.pending.length - 1];
    if (top && top.kind === 'fenv') {
      const acts = [{ type: 'quiero' }, { type: 'noquiero' }];
      if (!R.flor.achico[team(p)]) acts.push(...fenvOptions(G, p, top.bets));
      return acts;
    }
    if (R.florEnv && !R.florEnv.done) {
      const acts = R.flor.achico[team(p)] ? [] : fenvOptions(G, p, []);
      acts.push({ type: 'chica' });
      return acts;
    }
    if (top) {
      const acts = extra.concat([{ type: 'quiero' }, { type: 'noquiero' }]);
      if (top.kind === 'truco') {
        if (top.level < 4 && R.cur[p] === null) acts.push({ type: 'truco', level: top.level + 1 });
        if (canEnvidar(G, p)) acts.push(...envOptions(G, p, []));
      } else if (top.kind === 'env') {
        if (canReenvidar(G, p)) acts.push(...envOptions(G, p, top.bets));
      }
      return acts;
    }
    const acts = extra.concat(R.hands[p].map(c => ({ type: 'play', card: c })));
    if (R.trucoLevel < 4 && (R.trucoOwner === null || R.trucoOwner === team(p)))
      acts.push({ type: 'truco', level: R.trucoLevel + 1 });
    if (canEnvidar(G, p)) acts.push(...envOptions(G, p, []));
    // Art. 88/92: "paso" sale de la mano sin arrastrar al equipo (si queda algún compañero en juego).
    // Quien ganó un envite o cantó flor también pasa en vez de irse al mazo: así no tira sus cartas y las
    // puede mostrar al final (Art. 45); en el modo realista, el que se va al mazo sin mostrar pierde esos puntos.
    if ((G.n >= 4 && fromMano(G).some(q => q !== p && team(q) === team(p))) || R.mustShow[p]) acts.push({ type: 'paso' });
    acts.push({ type: 'mazo' });
    return acts;
  }

  function label(G, a) {
    switch (a.type) {
      case 'play': return cardName(a.card);
      case 'truco': return TRUCO_NAMES[a.level];
      case 'envido': {
        const raise = G.round.pending.some(x => x.kind === 'env');
        if (a.kind === 'falta') return 'Falta envido';
        const base = a.kind === 'real' ? 'Real envido' : 'Envido';
        return raise ? `${base} (+${a.amt})` : base;
      }
      case 'fenv': {
        const raise = G.round.pending.some(x => x.kind === 'fenv');
        if (a.amt === 'resto') return 'Contra flor el resto';
        if (a.amt === 'falta') return 'Con flor la falta envido';
        const base = a.contra ? 'Contra flor envido' : 'Con flor envido';
        return raise ? `${base} (+${a.amt})` : base;
      }
      case 'quiero': return 'Quiero';
      case 'noquiero': return 'No quiero';
      case 'chica': return 'Con flor me achico';
      case 'mazo': {
        const R = G.round, p = actor(G);
        if (G.n === 2 || p === null) return 'Me voy al mazo';
        return (!esPie(G, p) && G.rules.mazo === 'solo') ? 'Me voy al mazo (sigue mi equipo)' : 'Me voy al mazo (pierde el equipo)';
      }
      case 'paso': return 'Paso';
      case 'flor': return '¡Flor!';
      case 'noflor': return 'Seguir sin cantar';
      case 'sing': return a.pts === null ? 'Cantar' : String(a.pts);
      case 'buenas': return 'Son buenas';
      case 'ley': return LEY_FORMS[a.form];
      case 'noley': return 'Jugar normal';
      case 'leyest': return a.ley ? 'Con ley' : 'A punto';
      case 'leyresp': {
        const L = G.round.ley;
        if (L.envPart && L.truco) return a.env && a.truco ? 'Quiero todo' : a.env ? 'Quiero el envite, no el truco' : a.truco ? 'Quiero el truco, no el envite' : 'Paso (no quiero nada)';
        return (a.env || a.truco) ? 'Quiero' : 'Paso (no quiero)';
      }
    }
    return a.type;
  }

  function addPoints(G, t, pts, why, cat) {
    if (pts <= 0) return;
    G.scores[t] += pts;
    G.round.gained[t].push({ pts, why, cat: cat || 'otro' });
    info(G, `${G.teamNames[t]} +${pts} (${why}).`);
  }
  // Modo realista: el que ganó el envido o cantó flor y se va al mazo sin mostrar sus cartas pierde esos
  // puntos, que van para el rival. Para salir de la mano sin perderlos está el paso.
  function sinMostrar(G, p) {
    const R = G.round, t = team(p), cobrado = cat => R.gained[t].filter(g => g.cat === cat).reduce((a, g) => a + g.pts, 0);
    const env = R.envido.result && R.envido.result.winner === p && R.envido.result.accepted ? Math.min(R.envido.result.pts, cobrado('envido')) : 0;
    const fr = R.florEnv && R.florEnv.result;
    const flor = R.flor.sung[p] && R.flor.has[p] ? Math.min(fr && fr.winner === p ? fr.pts : 3, cobrado('flor')) : 0;
    R.mustShow[p] = false;
    R.sinMostrar = R.sinMostrar || {};
    R.sinMostrar[p] = env + flor;
    const quien = G.names[p] === 'Vos' ? 'Te fuiste' : G.names[p] + ' se fue';
    if (!env && !flor) return;
    info(G, `${quien} al mazo sin mostrar las cartas: esos puntos (${[env && 'envido', flor && 'flor'].filter(Boolean).join(' y ')}) van para ${G.teamNames[1 - t]}. Para no perderlos se dice paso (Art. 45).`);
    for (const [pts, cat, que] of [[env, 'envido', 'del envido'], [flor, 'flor', 'de la flor']]) {
      if (!pts) continue;
      G.scores[t] -= pts;
      R.gained[t].push({ pts: -pts, why: `se fue al mazo sin mostrar: los puntos ${que} van para el rival`, cat });
      addPoints(G, 1 - t, pts, `${cat}: el rival se fue al mazo sin mostrar`, cat);
    }
  }
  function checkChico(G) {
    if (G.matchWinner !== null) return true;
    for (const t of [0, 1]) {
      if (G.scores[t] >= G.target) {
        G.chicos[t]++;
        G.chicoWinner = t;
        const gana = G.n === 2 ? (t === 0 && G.names[0] === 'Vos' ? 'ganás' : 'gana') : (G.teamNames[t] === 'Nosotros' ? 'ganamos' : 'ganan');
        info(G, `${G.teamNames[t]} ${gana} el chico ${G.scores[t]} a ${G.scores[1 - t]}.`);
        if (G.chicos[t] >= G.chicosToWin) G.matchWinner = t;
        return true;
      }
    }
    return false;
  }

  // Lo que la computadora puede recordar: señas que resultaron falsas y faroles al truco
  function updateMemory(G) {
    const R = G.round, M = G.memory;
    for (let p = 0; p < G.n; p++) {
      if (!R.active[p]) continue;
      const known = R.played[p] === 3 || R.mustShow[p];
      if (!known) continue;
      const truth = R.senas[p];
      const claims = (R.senasShown[p] || []).slice();
      R.seen.forEach(list => list.forEach(v => { if (v.p === p) claims.push(v.s); }));
      if (claims.some(s => !truth.includes(s))) M.lies[p] = (M.lies[p] || 0) + 1;
      if (R.trucoCalls[p] > 0) {
        const b = M.bluff[p] || (M.bluff[p] = { calls: 0, weak: 0 });
        b.calls++;
        if (!R.initial[p].some(c => rank(c, R.muestra) >= 87)) b.weak++;
      }
    }
  }

  function endRound(G, reason) {
    const R = G.round;
    R.result = R.result || { reason };
    updateMemory(G);
    if (G.matchWinner !== null) G.phase = 'matchEnd';
    else if (G.chicoWinner !== null) G.phase = 'chicoEnd';
    else if (R.duel && R.duel.idx < R.duel.pairs.length - 1) G.phase = 'duelEnd';
    else G.phase = 'roundEnd';
  }
  function afterPoints(G) {
    if (checkChico(G)) { G.round.result = G.round.result || { reason: 'chico' }; endRound(G, 'chico'); return true; }
    return false;
  }

  // ---- Penas (Art. 46) y faltas graves (Art. 100) ----
  function penalize(G, off, reason) {
    const R = G.round, ot = 1 - team(off);
    for (const t of [0, 1]) {
      const g = R.gained[t].reduce((a, x) => a + x.pts, 0);
      if (g) { G.scores[t] -= g; R.gained[t] = []; }
    }
    let envStake = 0;
    if (R.canto && R.canto.stake) envStake = R.canto.stake;
    else if (R.envido.result) envStake = R.envido.result.pts;
    else if (R.florEnv && R.florEnv.result) envStake = R.florEnv.result.stake || 0;
    else {
      const top = R.pending.find(x => x.kind === 'env' || x.kind === 'fenv');
      if (top) envStake = betTotal(top.bets, R.falta);
    }
    const flores = R.flor.sung.filter(x => x).length + R.flor.negada.filter(x => x).length;
    const truco = R.trucoLevel > 1 ? R.trucoLevel : 1;
    const total = envStake + 3 * flores + truco;
    R.canto = null; R.pending = []; R.florQueue = []; if (R.ley) R.ley.afterCanto = null;
    R.mustShow[off] = true;
    R.penalty = { off, reason, envStake, flores, truco, total };
    info(G, `${G.names[off]}: ${reason}. Su equipo pierde lo de esta mano (Art. 46).`, 'falta');
    R.result = { winnerTeam: ot, pts: total, reason: 'penalty' };
    addPoints(G, ot, total, 'pena por ' + reason, 'pena');
    checkChico(G);
    endRound(G, 'penalty');
  }
  // Flor negada (Art. 17), cuando se descubre: el rival cobra los 3 de la flor y el truco que se esté
  // jugando (1 si no se gritó), y la mano se termina. El envido que haya cobrado en esta mano el equipo del
  // que la negó no vale, porque la flor anula el envido; lo que cobró el rival, sí.
  function florNegada(G, off) {
    const R = G.round, t = team(off), ot = 1 - t;
    const env = R.gained[t].filter(g => g.cat === 'envido').reduce((a, g) => a + g.pts, 0);
    if (env > 0) {
      G.scores[t] -= env;
      R.gained[t].push({ pts: -env, why: 'el envido no vale: tenía flor y la negó', cat: 'envido' });
    }
    const truco = R.trucoLevel;
    R.canto = null; R.pending = []; R.florQueue = []; if (R.ley) R.ley.afterCanto = null;
    R.mustShow[off] = true;
    R.penalty = { off, reason: 'flor negada', envStake: 0, flores: 1, truco, total: 3 + truco, negada: true, anulado: env };
    info(G, `${G.names[off] === 'Vos' ? 'Tenías flor y la negaste' : G.names[off] + ' tenía flor y la negó'}: para ${G.teamNames[ot]} van los 3 de la flor y ${truco === 1 ? 'el punto' : 'los ' + truco} del truco, y se termina la mano.`, 'falta');
    R.result = { winnerTeam: ot, pts: 3 + truco, reason: 'penalty' };
    addPoints(G, ot, 3, 'flor negada del rival', 'flor');
    addPoints(G, ot, truco, 'truco, por la flor negada del rival', 'truco');
    checkChico(G);
    endRound(G, 'penalty');
  }
  // ¿Las cartas que ya jugó prueban que tenía flor? Con dos piezas alcanza; si no, hacen falta las tres.
  function florProbada(G, p) {
    const R = G.round, vistas = R.initial[p].filter(c => !R.hands[p].some(h => h.id === c.id));
    if (vistas.filter(c => isPieza(c, R.muestra)).length >= 2) return true;
    return vistas.length === 3 && hasFlor(vistas, R.muestra);
  }
  function reveal(G, p) {
    const R = G.round, f = R.faults[p];
    if (!f.length) return false;
    if (f.includes('negada')) florNegada(G, p);
    else penalize(G, p, 'canto errado');
    return true;
  }

  function winTruco(G, t, pts, why) {
    const R = G.round;
    for (let p = 0; p < G.n; p++) if (R.played[p] === 3 && reveal(G, p)) return;
    R.result = { winnerTeam: t, pts, reason: why };
    addPoints(G, t, pts, why, 'truco');
    checkChico(G);
    endRound(G, why);
  }

  // ---- Canto de los puntos (Cap. V) ----
  function startCanto(G, kind, ctx, stake) {
    const R = G.round;
    const order = fromMano(G).filter(q => kind !== 'flor' || R.flor.sung[q]);
    R.canto = { kind, ctx, stake, order, best: null, sung: {}, declined: {}, lastIdx: -1, cur: order[0] };
    runAutoCanto(G);
  }
  function cantoNext(G) {
    const c = G.round.canto, L = c.order.length;
    for (let k = 1; k <= L; k++) {
      const q = c.order[(c.lastIdx + k) % L];
      if (team(q) !== team(c.best.p) && c.sung[q] === undefined && c.declined[q] === undefined) return q;
    }
    return null;
  }
  function runAutoCanto(G) {
    const R = G.round;
    while (R.canto && G.phase === 'play' && R.canto.cur !== null && !G.manual[R.canto.cur]) {
      applyCanto(G, R.canto.cur, autoCantoAction(G, R.canto.cur));
    }
  }
  function applyCanto(G, p, a) {
    const R = G.round, c = R.canto;
    if (a.type === 'sing') {
      if (!validCanto(c.kind, a.pts)) throw new Error('Esa cifra no vale como canto (Art. 43)');
      if (!beats(G, a.pts, p, c.best)) throw new Error('Tenés que cantar más de lo que ya se cantó, o decir "son buenas" (Art. 44)');
      c.sung[p] = a.pts;
      say(G, p, c.best ? `${a.pts} son mejores` : String(a.pts));
      c.best = { p, pts: a.pts };
    } else {
      if (!c.best) throw new Error('El mano tiene que cantar su punto (Art. 39)');
      c.declined[p] = { p: c.best.p, pts: c.best.pts };
      say(G, p, 'Son buenas');
    }
    c.lastIdx = c.order.indexOf(p);
    c.cur = cantoNext(G);
    if (c.cur === null) finishCanto(G);
  }
  // Modo realista: si al que tiene que cantar se le acaba el tiempo, ese canto lo gana el otro equipo
  // (sin cantar ni mostrar nada); la mano sigue.
  function cantoVencido(G, p) {
    const R = G.round, c = R.canto, rt = 1 - team(p);
    const w = c.best && team(c.best.p) === rt ? c.best.p : fromMano(G).find(q => team(q) === rt);
    R.canto = null;
    info(G, `${G.names[p] === 'Vos' ? 'Se te acabó' : 'A ' + G.names[p] + ' se le acabó'} el tiempo para cantar: los puntos son para ${G.teamNames[rt]}.`);
    if (c.ctx.type === 'env') {
      R.envido.result = { winner: w, team: rt, pts: c.stake, accepted: true, vencido: true, sung: Object.assign({}, c.sung), declined: Object.assign({}, c.declined) };
      R.wonEnvite[rt] = true;
      addPoints(G, rt, c.stake, 'envido: al rival se le acabó el tiempo para cantar', 'envido');
    } else {
      const F = florCount(G), contra = c.ctx.type === 'fenv' && c.ctx.bets.some(b => b.contra);
      const pts = c.ctx.type === 'fenv' ? c.stake + 3 * F[rt] + (contra ? 3 * F[1 - rt] : 0) : 3 * F[rt];
      R.florEnv.result = { winner: w, pts, stake: c.stake };
      if (c.ctx.type === 'fenv') R.wonEnvite[rt] = true;
      addPoints(G, rt, pts, 'flor: al rival se le acabó el tiempo para cantar', 'flor');
    }
    if (afterPoints(G)) return;
    if (R.ley && R.ley.afterCanto) { const tr = R.ley.afterCanto; R.ley.afterCanto = null; leyTruco(G, tr.truco); }
  }
  function finishCanto(G) {
    const R = G.round, c = R.canto;
    const w = c.best.p, wt = team(w);
    for (const q of c.order) {
      const real = realCanto(G, q);
      const errado = c.sung[q] !== undefined ? c.sung[q] !== real
        : c.declined[q] !== undefined ? beats(G, real, q, c.declined[q]) : false;
      if (errado && !R.faults[q].includes('errado')) R.faults[q].push('errado');
    }
    if (c.kind === 'flor') { R.flor.sungPts = Object.assign({}, c.sung); R.flor.declined = Object.assign({}, c.declined); }
    R.mustShow[w] = true;
    const ctx = c.ctx;
    if (ctx.type === 'env') {
      R.envido.result = { winner: w, team: wt, pts: c.stake, accepted: true, sung: Object.assign({}, c.sung), declined: Object.assign({}, c.declined) };
      R.wonEnvite[wt] = true;
      if (reveal(G, w)) return;
      R.canto = null;
      addPoints(G, wt, c.stake, 'envido', 'envido');
    } else {
      if (ctx.type === 'fenv') R.wonEnvite[wt] = true;
      if (reveal(G, w)) return;
      R.canto = null;
      const F = florCount(G);
      if (ctx.type === 'fenv') {
        const contra = ctx.bets.some(b => b.contra);
        const pts = c.stake + 3 * F[wt] + (contra ? 3 * F[1 - wt] : 0);
        R.florEnv.result = { winner: w, pts, stake: c.stake };
        addPoints(G, wt, pts, contra ? 'contra flor' : 'con flor envido', 'flor');
      } else {
        R.florEnv.result = { winner: w, pts: 3 * F[wt], stake: 0 };
        addPoints(G, wt, 3 * F[wt], 'flor mayor', 'flor');
      }
    }
    if (afterPoints(G)) return;
    if (R.ley && R.ley.afterCanto) { const tr = R.ley.afterCanto; R.ley.afterCanto = null; leyTruco(G, tr.truco); }
  }
  function florCount(G) {
    const R = G.round, F = [0, 0];
    R.flor.sung.forEach((s, q) => { if (s && R.flor.has[q]) F[team(q)]++; });
    return F;
  }

  function resolveEnvido(G, bets, accepted) {
    const R = G.round;
    R.envido.done = true;
    if (!accepted) {
      const last = bets[bets.length - 1], t = team(last.by);
      const pts = bets.length === 1 ? 1 : betTotal(bets.slice(0, -1), R.falta);
      R.envido.result = { winner: last.by, team: t, pts, accepted: false };
      R.wonEnvite[t] = true;
      addPoints(G, t, pts, 'envido no querido', 'envido');
      afterPoints(G);
      return;
    }
    startCanto(G, 'env', { type: 'env' }, betTotal(bets, R.falta));
  }
  function resolveFlorEnv(G, bets, accepted) {
    const R = G.round;
    R.florEnv.done = true;
    if (!accepted) {
      const last = bets[bets.length - 1], t = team(last.by);
      const contraPrev = bets.slice(0, -1).some(b => b.contra);
      const F = florCount(G);
      let pts = 3 * F[t], stake = 0;
      if (bets.length > 1) { stake = betTotal(bets.slice(0, -1), R.falta); pts += stake + (contraPrev ? 3 * F[1 - t] : 0); }
      R.florEnv.result = { winner: last.by, pts, stake };
      R.wonEnvite[t] = true;
      fromMano(G).filter(q => team(q) === t && R.flor.sung[q]).forEach(q => R.mustShow[q] = true);
      addPoints(G, t, pts, 'flor, envite no querido', 'flor');
      afterPoints(G);
      return;
    }
    startCanto(G, 'flor', { type: 'fenv', bets }, betTotal(bets, R.falta));
  }
  function settleFlores(G) {
    const R = G.round, F = florCount(G);
    if (!F[0] && !F[1]) return;
    if (F[0] && F[1]) {
      const first = fromMano(G).find(q => R.flor.sung[q] && R.flor.has[q]);
      R.florEnv = { curTeam: team(first), done: false, passed: [false, false] };
    } else {
      const t = F[0] ? 0 : 1;
      R.flor.sung.forEach((s, q) => { if (s) R.mustShow[q] = true; });
      addPoints(G, t, 3 * F[t], F[t] > 1 ? 'flores' : 'flor', 'flor');
      afterPoints(G);
    }
  }

  // ---- A ley de juego (Cap. VII), versión simplificada ----
  function leyTruco(G, accepted) {
    const R = G.round, L = R.ley;
    if (!L || !L.truco) return;
    if (accepted) {
      R.trucoLevel = 2; R.saidTruco[L.team] = true; R.saidQuiero[1 - L.team] = true; R.trucoOwner = 1 - L.team;
      info(G, 'Se juega el truco de la ley: vale 2.');
    } else winTruco(G, L.team, 1, 'truco no querido (a ley de juego)');
  }
  function applyLeyResp(G, p, a) {
    const R = G.round, L = R.ley, t = L.team, ct = 1 - t;
    L.pendingResp = false;
    R.envido.done = true;
    say(G, p, label(G, a));
    const chal = fromMano(G).filter(q => team(q) === t && R.flor.has[q]);
    const chd = fromMano(G).filter(q => team(q) === ct && R.flor.has[q] && L.estados[q] !== false);
    const markSung = list => list.forEach(q => { R.flor.sung[q] = true; });
    if (L.envPart) {
      if (a.env) {
        fromMano(G).filter(q => team(q) === t && inGame(R, q)).forEach(q => say(G, q, R.flor.has[q] ? 'Con ley' : 'A punto')); // Art. 80
        if (L.envPart === 'resto') {
          markSung(chd);
          if (chal.length) {
            markSung(chal);
            R.florEnv = { done: true };
            L.afterCanto = { truco: a.truco };
            startCanto(G, 'flor', { type: 'fenv', bets: [{ by: L.decider, amt: 'resto', contra: true }] }, R.falta);
            return;
          }
          settleFlores(G);
        } else {
          if (chal.length) { markSung(chal); settleFlores(G); }
          else {
            L.afterCanto = { truco: a.truco };
            startCanto(G, 'env', { type: 'env' }, R.falta);
            return;
          }
        }
      } else {
        // con flor en juego, el envite no querido no es para nadie: se cobra la flor y nada más
        if (chd.length || chal.length) info(G, 'Hay flor: el envite no querido no suma para nadie.');
        else {
          R.wonEnvite[t] = true;
          addPoints(G, t, 1, 'envite no querido (a ley de juego)', 'envido');
          if (afterPoints(G)) return;
        }
        if (chd.length || chal.length) {
          markSung(chd); markSung(chal);
          const F = florCount(G);
          if (F[0] && F[1]) { R.florEnv = { done: true }; L.afterCanto = { truco: a.truco }; startCanto(G, 'flor', { type: 'cmp' }, 0); return; }
          settleFlores(G);
        }
      }
      if (G.phase !== 'play') return;
    }
    leyTruco(G, a.truco);
  }

  function resolveTrick(G) {
    const R = G.round, m = R.muestra;
    let best = -1, holders = [];
    R.cur.forEach((c, q) => {
      if (!c) return;
      const r = rank(c, m);
      if (r > best) { best = r; holders = [q]; } else if (r === best) holders.push(q);
    });
    holders.sort((a, b) => pos(G, a) - pos(G, b));
    const teams = new Set(holders.map(team));
    let wt, wp;
    if (teams.size === 1 || G.rules.iguales === 'mano') { wp = holders[0]; wt = team(wp); } // Art. 12: entre iguales, el más mano
    else { wt = -1; wp = null; }
    R.tricks.push({ cards: R.cur.slice(), winnerTeam: wt, winnerPlayer: wp, leader: R.trickLeader });
    R.cur = Array(G.n).fill(null);
    const quien = G.names[wp] === 'Vos' ? 'vos' : G.names[wp];
    info(G, wt === -1 ? 'Baza parda.' : `Baza para ${G.n === 2 ? quien : quien + ' (' + G.teamNames[wt] + ')'}.`);
    const rw = roundWinner(R.tricks.map(t => t.winnerTeam), team(R.mano));
    if (rw !== null) {
      winTruco(G, rw, R.trucoLevel, R.trucoLevel === 1 ? 'mano ganada' : TRUCO_NAMES[R.trucoLevel].toLowerCase());
      return;
    }
    R.turn = firstInGameFrom(G, wt === -1 ? R.mano : wp); // Arts. 55 y 57
    R.trickLeader = R.turn;
  }

  function apply(G, p, a) {
    const R = G.round;
    if (actor(G) !== p) throw new Error('No es el turno de ' + p);
    const t = team(p);

    if (a.type === 'noley') {
      R.leyPhase = null;
      info(G, `Muestra: ${cardName(R.muestra)}.`);
      return;
    }
    if (a.type === 'ley') {
      // Art. 72: se impone antes de que se ponga la muestra
      R.leyPhase = null;
      say(G, p, 'A ley de juego: ' + LEY_FORMS[a.form].toLowerCase());
      info(G, `Muestra: ${cardName(R.muestra)}.`);
      const f = a.form;
      const parts = { falta: f === 'todo' || f.includes('falta'), resto: f === 'todo' || f.includes('resto'), truco: f === 'todo' || f.includes('truco') };
      // Art. 74: los desafiados, vistas sus cartas, dicen en su turno "con ley" o "a punto"; contesta el pie (Art. 75)
      const order = fromMano(G).filter(q => team(q) === 1 - t && inGame(R, q));
      R.ley = { team: t, decider: p, form: f, parts, estados: {}, queue: order.slice(), conLey: null, envPart: null, truco: parts.truco, responder: order[order.length - 1], pendingResp: false, afterCanto: null };
      return;
    }
    if (a.type === 'leyest') {
      const L = R.ley;
      L.queue.shift();
      L.estados[p] = !!a.ley;
      say(G, p, a.ley ? 'Con ley' : 'A punto');
      if (a.ley && !R.flor.has[p] && !R.faults[p].includes('errado')) R.faults[p].push('errado');   // canto errado
      if (!a.ley && R.flor.has[p]) { R.flor.negada[p] = true; R.faults[p].push('negada'); }      // niega la flor
      if (!L.queue.length) {
        L.conLey = Object.values(L.estados).some(Boolean);
        L.envPart = L.conLey ? (L.parts.resto ? 'resto' : null) : (L.parts.falta ? 'falta' : null);
        L.pendingResp = !!(L.envPart || L.truco);
        if (!L.pendingResp) info(G, 'La ley no tiene nada que disputar con esa respuesta: se juega normal (Art. 78).');
      }
      return;
    }
    if (a.type === 'leyresp') { applyLeyResp(G, p, a); return; }

    if (R.canto) {
      if (a.type === 'vencido') { cantoVencido(G, p); return; }   // lo manda el reloj, no es una jugada
      applyCanto(G, p, a); runAutoCanto(G); return;
    }

    if (a.type !== 'flor' && R.flor.has[p] && !R.flor.sung[p] && !R.flor.negada[p] && !R.flor.lost[p]) {
      R.flor.negada[p] = true;           // Art. 17
      R.faults[p].push('negada');
    }
    R.acted[p] = true;
    const top = R.pending[R.pending.length - 1];

    switch (a.type) {
      case 'flor': {
        R.flor.sung[p] = true;
        say(G, p, '¡Flor!');
        if (!R.flor.has[p]) { penalize(G, p, 'flor cantada sin tenerla'); return; }
        const envTop = R.pending.findIndex(x => x.kind === 'env');
        if (envTop >= 0) {
          R.pending.splice(envTop, 1);
          R.envido.done = true;
          info(G, 'La flor anula el envido (Art. 27).');
        }
        R.florQueue = fromMano(G).filter(q => q !== p && florCandidate(G, q)); // Art. 18
        if (!R.florQueue.length) settleFlores(G);
        return;
      }
      case 'noflor': {
        R.florQueue = R.florQueue.filter(x => x !== p);
        if (!R.florQueue.length) settleFlores(G);
        return;
      }
      case 'chica': {
        R.flor.achico[t] = true;
        R.florEnv.passed[t] = true;
        say(G, p, 'Con flor me achico');
        if (R.florEnv.passed[1 - t]) {
          R.florEnv.done = true;
          startCanto(G, 'flor', { type: 'cmp' }, 0);
        } else R.florEnv.curTeam = 1 - t;
        return;
      }
      case 'fenv': {
        const bet = { by: p, amt: a.amt, contra: a.contra };
        say(G, p, label(G, a).replace(/ \(\+\d+\)$/, ''));
        const to = florDecider(G, 1 - t);
        if (top && top.kind === 'fenv') { top.bets.push(bet); top.by = p; top.to = to; }
        else R.pending.push({ kind: 'fenv', by: p, to, bets: [bet] });
        return;
      }
      case 'envido': {
        const bet = { by: p, amt: a.amt, kind: a.kind };
        say(G, p, label(G, a).replace(/ \(\+\d+\)$/, ''));
        const to = rivalResponder(G, p, false);
        const raise = top && top.kind === 'env';
        if (raise) { top.bets.push(bet); top.by = p; top.to = to; }
        else R.pending.push({ kind: 'env', by: p, to, bets: [bet] });
        if (!raise) {
          // Al tocar: la flor del compañero queda negada o se dice "tengo flor" (según la mesa),
          // y los rivales que tengan flor la cantan antes de contestar (la flor anula el envido).
          if (G.rules.florCompanero === 'niega')
            fromMano(G).forEach(q => { if (q !== p && team(q) === t && florCandidate(G, q)) { R.flor.lost[q] = true; R.flor.lostBy[q] = 'toco'; } });
          R.florQueue = fromMano(G).filter(q => q !== p && florCandidate(G, q) && (team(q) !== t || G.rules.florCompanero === 'tengo'));
        }
        return;
      }
      case 'truco': {
        say(G, p, TRUCO_NAMES[a.level]);
        // Gritar antes de que un compañero cante su flor se la anula (o dice "tengo flor", según la mesa)
        if (G.rules.flor) {
          if (G.rules.florCompanero === 'niega')
            fromMano(G).forEach(q => { if (q !== p && team(q) === t && florCandidate(G, q)) { R.flor.lost[q] = true; R.flor.lostBy[q] = 'grito'; } });
          else R.florQueue = fromMano(G).filter(q => q !== p && team(q) === t && florCandidate(G, q));
        }
        if (top && top.kind === 'truco') {
          R.pending.pop();
          R.trucoLevel = top.level;
          R.saidQuiero[t] = true;
        }
        R.saidTruco[t] = true;
        R.trucoCalls[p]++;
        R.pending.push({ kind: 'truco', by: p, to: rivalResponder(G, p, true), level: a.level });
        return;
      }
      case 'quiero': {
        say(G, p, 'Quiero');
        R.pending.pop();
        if (top.kind === 'truco') { R.trucoLevel = top.level; R.trucoOwner = t; R.saidQuiero[t] = true; }
        else if (top.kind === 'env') resolveEnvido(G, top.bets, true);
        else if (top.kind === 'fenv') resolveFlorEnv(G, top.bets, true);
        return;
      }
      case 'noquiero': {
        say(G, p, 'No quiero');
        R.pending.pop();
        if (top.kind === 'truco') winTruco(G, 1 - t, R.trucoLevel, TRUCO_NAMES[top.level].toLowerCase() + ' no querido');
        else if (top.kind === 'env') resolveEnvido(G, top.bets, false);
        else if (top.kind === 'fenv') resolveFlorEnv(G, top.bets, false);
        return;
      }
      case 'mazo': {
        say(G, p, 'Me voy al mazo');
        if (R.mustShow[p] && G.manual[p]) sinMostrar(G, p);
        else if (R.mustShow[p]) info(G, G.names[p] === 'Vos' ? 'Mostrás tus cartas del envite antes de irte (Art. 45).' : `${G.names[p]} muestra sus cartas del envite antes de irse (Art. 45).`);
        if (!esPie(G, p) && G.rules.mazo === 'solo') {
          // Sin ser el pie: se va solo él y su equipo sigue jugando
          R.out[p] = true;
          if (R.cur.some(x => x) && trickComplete(G)) resolveTrick(G);
          else R.turn = nextIn(G, p);
          return;
        }
        R.pending = [];
        // irse en la primera sin tocar ni gritar, cuando el otro todavía podía tocar: son dos puntos
        // (uno de la mano y otro por el envido que se le quita al rival)
        if (puedeTocarElOtro(G, t)) addPoints(G, 1 - t, 1, 'se fue en la primera sin tocar ni gritar', 'envido');
        winTruco(G, 1 - t, R.trucoLevel, G.n === 2 ? 'el rival se fue al mazo' : 'el otro equipo se fue al mazo');
        return;
      }
      case 'paso': {
        say(G, p, 'Paso');
        R.out[p] = true;
        if (!fromMano(G).some(q => team(q) === t)) { winTruco(G, 1 - t, R.trucoLevel, G.n === 2 ? 'el rival pasó' : 'el otro equipo pasó'); return; }
        if (R.cur.some(x => x) && trickComplete(G)) resolveTrick(G);
        else R.turn = nextIn(G, p);
        return;
      }
      case 'play': {
        const i = R.hands[p].findIndex(c => c.id === a.card.id);
        if (i < 0) throw new Error('Carta inválida');
        const c = R.hands[p].splice(i, 1)[0];
        if (R.cur.every(x => x === null)) R.trickLeader = p;
        R.cur[p] = c;
        R.played[p]++;
        if (R.faults[p].includes('negada') && florProbada(G, p)) { florNegada(G, p); return; }
        if (trickComplete(G)) resolveTrick(G);
        else R.turn = nextIn(G, p);
        return;
      }
    }
    throw new Error('Acción desconocida ' + a.type);
  }

  function nextRound(G) {
    if (G.phase === 'matchEnd') return G;
    if (G.phase === 'duelEnd') {
      const R = G.round;
      R.duel.idx++;
      const pair = R.duel.pairs[R.duel.idx];
      initPlay(G, pair, pair[0]);
      G.phase = 'play';
      info(G, `Duelo ${R.duel.idx + 1} de 3: ${duelLabel(G)}.`);
      return G;
    }
    if (G.phase === 'chicoEnd') { G.scores = [0, 0]; G.roundInChico = 0; }
    return startRound(G);
  }

  const Truco = {
    setRng, makeDeck, shuffle, piezaRole, isPieza, rank, category, envVal, hasFlor,
    florPoints, envidoPoints, cardName, roundWinner, newMatch, startRound, actor,
    legal, label, apply, nextRound, betTotal, validCanto, setSenas, senasFor, senasMinus, SENAS, SENA_MAX, PEDIDOS, pedir,
    team, pos, inGame, esPie, leyDisponible, TRUCO_NAMES, SUITS, NUMS, DEFAULT_RULES, LEY_FORMS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Truco;
  else global.Truco = Truco;
})(typeof window !== 'undefined' ? window : globalThis);
