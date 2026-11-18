// Jugadores de la computadora. Deciden simulando muchas veces las manos posibles
// de los demás, usando solo lo que sabrían en la mesa: lo jugado, lo cantado, las
// señas de sus compañeros y las que pescaron. Niveles: facil, normal, dificil.
// En "difícil" además recuerda quién le mintió con señas y quién grita de farol.
(function (global) {
  'use strict';
  const T = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : global.Truco;
  let rng = Math.random;
  function setRng(f) { rng = f; }
  const team = p => p % 2;

  function playedBy(R, q) {
    const out = R.tricks.map(t => t.cards[q]).filter(Boolean);
    if (R.cur[q]) out.push(R.cur[q]);
    return out;
  }
  function beatsInfo(G, pts, q, best) {
    if (!best) return true;
    return pts > best.pts || (pts === best.pts && T.pos(G, q) < T.pos(G, best.p));
  }

  // Cuánto le cree p a las señas de q
  function trust(G, p, q, level) {
    if (!G.humans.includes(q)) return 1;            // la computadora no miente con señas
    if (level === 'facil') return 1;
    if (level === 'normal') return 0.9;
    const lies = (G.memory.lies || {})[q] || 0;
    return Math.max(0.25, 0.9 - 0.25 * lies);
  }

  function consistent(G, p, q, full, believe) {
    const R = G.round, m = R.muestra;
    const flor = R.flor.has[q] !== undefined && G.rules.flor && R.active[q] ? T.hasFlor(full, m) : false;
    if (R.flor.sung[q] && !flor) return false;
    if (!R.flor.sung[q] && R.acted[q] && flor && !R.flor.lost[q]) return false;
    const er = R.envido.result;
    if (er && er.accepted) {
      if (er.sung && er.sung[q] !== undefined && T.envidoPoints(full, m) !== er.sung[q]) return false;
      if (er.declined && er.declined[q] && beatsInfo(G, T.envidoPoints(full, m), q, er.declined[q])) return false;
    }
    if (R.flor.sung[q] && flor) {
      if (R.flor.sungPts[q] !== undefined && T.florPoints(full, m) !== R.flor.sungPts[q]) return false;
      if (R.flor.declined[q] && beatsInfo(G, T.florPoints(full, m), q, R.flor.declined[q])) return false;
    }
    let has = null;
    const senasOf = () => has || (has = T.senasFor(full, m));
    const seen = R.seen[p] || [];
    for (let i = 0; i < seen.length; i++) {
      const v = seen[i];
      if (v.p === q && believe[`s${i}`] && !senasOf().includes(v.s)) return false;
    }
    if (team(q) === team(p) && q !== p && R.senasShown[q] && believe[`p${q}`]) {
      const shown = R.senasShown[q];
      if (shown.includes('nada')) { if (!senasOf().includes('nada')) return false; }
      else if (T.senasMinus(shown, senasOf()).length) return false;   // con dos matas, la seña va dos veces
    }
    return true;
  }

  function sampleWorlds(G, p, n, level) {
    const R = G.round, N = G.n;
    const others = [];
    for (let q = 0; q < N; q++) if (q !== p) others.push(q);
    const known = new Set(R.initial[p].map(c => c.id).concat([R.muestra.id]));
    const played = {};
    for (const q of others) { played[q] = playedBy(R, q); played[q].forEach(c => known.add(c.id)); }
    const unseen = T.makeDeck().filter(c => !known.has(c.id));
    const need = others.map(q => R.hands[q].length);
    const total = need.reduce((a, b) => a + b, 0);
    const out = [];
    let tries = 0;
    const draw = (check) => {
      for (let i = 0; i < total; i++) {
        const j = i + Math.floor(rng() * (unseen.length - i));
        [unseen[i], unseen[j]] = [unseen[j], unseen[i]];
      }
      const believe = {};
      (R.seen[p] || []).forEach((v, i) => { believe[`s${i}`] = rng() < trust(G, p, v.p, level); });
      for (const q of others) if (team(q) === team(p)) believe[`p${q}`] = rng() < trust(G, p, q, level);
      const w = {}; let k = 0;
      for (let i = 0; i < others.length; i++) {
        const q = others[i];
        w[q] = unseen.slice(k, k + need[i]); k += need[i];
        if (check && R.active[q] && !consistent(G, p, q, played[q].concat(w[q]), believe)) return null;
      }
      return w;
    };
    while (out.length < n && tries < n * 40) { tries++; const w = draw(true); if (w) out.push(w); }
    while (out.length < Math.min(n, 12)) out.push(draw(false));
    return out;
  }

  function policy(G, hand, cur, me, winners, m) {
    const sorted = hand.slice().sort((a, b) => T.rank(a, m) - T.rank(b, m));
    let best = -1, bestTeams = new Set();
    cur.forEach((c, q) => {
      if (!c) return;
      const r = T.rank(c, m);
      if (r > best) { best = r; bestTeams = new Set([team(q)]); }
      else if (r === best) bestTeams.add(team(q));
    });
    if (best < 0) {
      if (winners.length === 0 && sorted.length === 3) return sorted[1];
      return sorted[sorted.length - 1];
    }
    if (bestTeams.size === 1 && bestTeams.has(team(me))) return sorted[0];
    const beat = sorted.find(c => T.rank(c, m) > best);
    if (beat) return beat;
    const tie = sorted.find(c => T.rank(c, m) === best);
    if (tie && winners[0] === team(me)) return tie;
    return sorted[0];
  }

  function simulate(G, p, world, firstCard) {
    const R = G.round, m = R.muestra, N = G.n;
    const live = q => R.active[q] && !R.out[q];
    const hands = [];
    for (let q = 0; q < N; q++) hands[q] = q === p ? R.hands[p].slice() : world[q].slice();
    const cur = R.cur.slice();
    const winners = R.tricks.map(t => t.winnerTeam);
    let turn = R.turn, first = firstCard;
    const posOf = q => (q - R.mano + N) % N;
    const nextLive = q => { for (let i = 1; i <= N; i++) { const r = (q + i) % N; if (live(r)) return r; } return q; };
    for (let guard = 0; guard < 40; guard++) {
      const rw = T.roundWinner(winners, team(R.mano));
      if (rw !== null) return rw;
      if (cur[turn] === null && hands[turn].length) {
        let c;
        if (turn === p && first) { c = first; first = null; }
        else c = policy(G, hands[turn], cur, turn, winners, m);
        hands[turn] = hands[turn].filter(x => x.id !== c.id);
        cur[turn] = c;
      }
      let complete = true;
      for (let q = 0; q < N; q++) if (live(q) && cur[q] === null) complete = false;
      if (complete) {
        let best = -1, holders = [];
        cur.forEach((c, q) => { if (!c) return; const r = T.rank(c, m); if (r > best) { best = r; holders = [q]; } else if (r === best) holders.push(q); });
        holders.sort((a, b) => posOf(a) - posOf(b));
        const teams = new Set(holders.map(team));
        let wt = -1, wp = R.mano;
        if (teams.size === 1 || G.rules.iguales === 'mano') { wt = team(holders[0]); wp = holders[0]; }
        winners.push(wt);
        for (let q = 0; q < N; q++) cur[q] = null;
        turn = live(wp) ? wp : nextLive(wp);
      } else turn = nextLive(turn);
    }
    return T.roundWinner(winners, team(R.mano));
  }

  function winProb(G, p, card, worlds) {
    let w = 0;
    for (const s of worlds) if (simulate(G, p, s, card) === team(p)) w++;
    return worlds.length ? w / worlds.length : 0.5;
  }

  const find = (acts, f) => acts.find(f);
  const LV = {
    facil:   { samples: 20,  noise: 0.35, envAdj: 2, callTr: 0.08, accTr: 0.06, bluff: 0 },
    normal:  { samples: 1,   noise: 0,    envAdj: 0, callTr: 0,    accTr: 0,    bluff: 1 },
    dificil: { samples: 1.5, noise: 0,    envAdj: 0, callTr: 0,    accTr: 0,    bluff: 1.3 },
  };
  function envBonus(G) { return G.n >= 4 ? 1 : 0; }
  const rivalScore = (G, p) => G.scores[1 - team(p)];

  function chooseEnvidoInit(G, p, acts, pts, L) {
    const R = G.round, behind = rivalScore(G, p) - G.scores[team(p)];
    const adj = pts + (R.mano === p ? 1 : 0) + envBonus(G) - L.envAdj;
    const falta = find(acts, a => a.type === 'envido' && a.kind === 'falta');
    const real = find(acts, a => a.type === 'envido' && a.kind === 'real');
    const env = find(acts, a => a.type === 'envido' && a.kind === 'envido');
    if (adj >= 33 && falta && (behind > 5 || rng() < 0.3)) return falta;
    if (adj >= 31 && real && rng() < 0.6) return real;
    if (adj >= 27 && env && rng() < 0.8) return env;
    if (adj < 24 && env && rng() < 0.07 * L.bluff) return env;
    return null;
  }

  function respondEnvido(G, p, acts, top, L) {
    const R = G.round, pts = R.envPts[p] + envBonus(G) - L.envAdj;
    const total = T.betTotal(top.bets, R.falta);
    const isFalta = top.bets.some(b => b.amt === 'falta');
    let need = total <= 2 ? 26 : total <= 5 ? 28 : total <= 8 ? 29 : 31;
    if (isFalta) need = R.falta <= 4 ? 27 : 31;
    if (T.pos(G, p) === 0) need -= 1;
    // Mirar el tanteador: si no querer le da el chico al rival, se quiere igual
    const refusePts = top.bets.length === 1 ? 1 : T.betTotal(top.bets.slice(0, -1), R.falta);
    if (rivalScore(G, p) + refusePts >= G.target) need = 0;
    const raises = acts.filter(a => a.type === 'envido');
    if (raises.length && pts >= need + 4 && rng() < 0.6) {
      const f = raises.find(a => a.kind === 'falta');
      if (pts >= 33 && f) return f;
      return raises.find(a => a.kind === 'real') || raises[0];
    }
    return find(acts, a => a.type === (pts >= need ? 'quiero' : 'noquiero'));
  }

  function florStrength(G, p) { return G.round.flor.pts[p] + (T.pos(G, p) === 0 ? 1 : 0); }
  function florInit(G, p, acts) {
    const fp = florStrength(G, p);
    const resto = find(acts, a => a.type === 'fenv' && a.amt === 'resto');
    const contra = find(acts, a => a.type === 'fenv' && a.contra && a.amt !== 'resto');
    const con = find(acts, a => a.type === 'fenv' && !a.contra && typeof a.amt === 'number');
    if (fp >= 41 && resto && rng() < 0.5) return resto;
    if (fp >= 36 && contra) return contra;
    if (fp >= 32 && con) return con;
    return find(acts, a => a.type === 'chica');
  }
  function florRespond(G, p, acts, top) {
    const R = G.round;
    const fp = florStrength(G, p);
    const contra = top.bets.some(b => b.contra);
    const big = top.bets.some(b => b.amt === 'falta' || b.amt === 'resto');
    let need = big ? (R.falta <= 6 ? 34 : 38) : contra ? 35 : 33;
    const F = R.flor.sung.filter((s, q) => s && team(q) === team(top.by)).length;
    if (rivalScore(G, p) + 3 * F >= G.target) need = 0;
    const raises = acts.filter(a => a.type === 'fenv');
    if (raises.length && fp >= need + 5 && rng() < 0.6) return raises.find(a => a.amt === 'resto') || raises[raises.length - 1];
    return find(acts, a => a.type === (fp >= need ? 'quiero' : 'noquiero'));
  }

  // A ley de juego: se decide antes de ver la muestra
  // La ley se impone sin ver las cartas (Arts. 72 y 79): la computadora decide solo por el tanteador
  function leyDecide(G, p, acts) {
    const behind = rivalScore(G, p) - G.scores[team(p)];
    if (behind >= 15 && rng() < 0.3) return find(acts, a => a.form === 'todo');
    if (behind >= 8 && rng() < 0.25) return find(acts, a => a.form === 'falta_truco');
    return find(acts, a => a.type === 'noley');
  }
  function leyRespond(G, p, acts, L, worlds) {
    const R = G.round, Ly = R.ley;
    let env = false, tr = false;
    if (Ly.envPart === 'falta') env = R.envPts[p] + envBonus(G) >= (R.falta <= 4 ? 26 : 30);
    if (Ly.envPart === 'resto') env = Math.max(...R.flor.pts.filter((x, q) => team(q) === team(p))) >= 36;
    if (Ly.truco) tr = winProb(G, p, null, worlds) >= 0.45 + L.accTr;
    return find(acts, a => a.env === (Ly.envPart ? env : false) && a.truco === (Ly.truco ? tr : false)) || acts[0];
  }

  // Compañeros que todavía no hablaron ni jugaron: pueden tener una flor sin cantar, y tocar o gritar
  // antes se la anularía. La computadora no lo hace (en parejas y tercetos toca y grita el que ya
  // tiene a sus compañeros jugados, normalmente el pie).
  function partnerMayHaveFlor(G, p) {
    const R = G.round;
    if (G.n < 4 || !G.rules.flor || R.duel) return false;
    for (let q = 0; q < G.n; q++)
      if (q !== p && T.team(q) === T.team(p) && T.inGame(R, q) && !R.acted[q] && R.played[q] === 0 && !R.flor.sung[q]) return true;
    return false;
  }
  // Lo que pidió el compañero en voz alta ("¡Vení!", "¡Jugá algo!", "¡Gritá!", "Tengo algo para el tanto").
  // Vale mientras tiene sentido: vení y jugá algo, en la baza en que se dijeron; gritá, mientras nadie gritó;
  // el tanto, mientras no se jugó el envido.
  function cumplirPedido(G, p, legal) {
    const R = G.round;
    if (!R || !R.pedidos || !R.pedidos.length || G.n < 4) return null;
    const top = R.pending[R.pending.length - 1];
    const vigente = x => team(x.p) === team(p) && x.p !== p && (
      x.k === 'veni' || x.k === 'algo' ? x.baza === R.tricks.length && R.cur[p] === null
      : x.k === 'grita' ? R.trucoLevel === 1 && !R.saidTruco[0] && !R.saidTruco[1]
      : !R.envido.done && !R.flor.sung.some(Boolean));
    const ped = R.pedidos.filter(vigente);
    if (!ped.length) return null;
    const quiere = k => ped.some(x => x.k === k);
    if (quiere('tanto')) {
      const q = top && top.kind === 'env' && find(legal, a => a.type === 'quiero');
      if (q) return q;
      const e = !top && find(legal, a => a.type === 'envido' && a.kind === 'envido');
      if (e) return e;
    }
    if (quiere('grita') && (!top || top.kind === 'truco')) {
      const tr = find(legal, a => a.type === 'truco');
      if (tr) return tr;
    }
    const veni = quiere('veni'), algo = quiere('algo');
    if ((veni || algo) && !top) {
      const plays = legal.filter(a => a.type === 'play');
      if (!plays.length) return null;
      const m = R.muestra, rk = c => T.rank(c, m);
      const orden = plays.slice().sort((a, b) => rk(a.card) - rk(b.card));
      let mejor = null;
      R.cur.forEach((c, q) => { if (c && (!mejor || rk(c) > rk(mejor.c))) mejor = { c, q }; });
      if (mejor && team(mejor.q) === team(p)) return orden[0];                 // ya la va ganando el equipo
      const ganan = mejor ? orden.filter(a => rk(a.card) > rk(mejor.c)) : [];
      if (veni) return mejor ? (ganan[0] || orden[orden.length - 1]) : orden[orden.length - 1];
      return mejor ? (ganan[0] || orden[Math.floor(orden.length / 2)]) : orden[Math.floor(orden.length / 2)];
    }
    return null;
  }

  function choose(G, p, opts) {
    opts = opts || {};
    const level = opts.level || 'normal', L = LV[level] || LV.normal;
    let acts = T.legal(G, p);
    const top0 = G.round && G.round.pending[G.round.pending.length - 1];
    if (acts.length > 1 && !(top0 && (top0.kind === 'env' || top0.kind === 'fenv')) && partnerMayHaveFlor(G, p)) {
      const calm = acts.filter(a => a.type !== 'envido' && a.type !== 'truco');
      if (calm.length) acts = calm;
    }
    if (acts.length <= 1) return acts[0];
    const R = G.round;
    const top = R.pending[R.pending.length - 1];
    const base = opts.samples || (G.n === 6 ? 45 : G.n === 4 ? 70 : 120);
    const N = level === 'facil' ? LV.facil.samples : Math.round(base * L.samples);

    if (R.leyPhase) return leyDecide(G, p, acts);
    const pedido = cumplirPedido(G, p, T.legal(G, p));
    if (pedido) return pedido;
    if (top && top.kind === 'fenv') return florRespond(G, p, acts, top);
    if (R.florEnv && !R.florEnv.done && !(top && top.kind === 'fenv')) return florInit(G, p, acts);
    if (top && top.kind === 'env') return respondEnvido(G, p, acts, top, L);

    const worlds = sampleWorlds(G, p, N, level);
    if (R.ley && R.ley.pendingResp) return leyRespond(G, p, acts, L, worlds);

    if (top && top.kind === 'truco') {
      const e = chooseEnvidoInit(G, p, acts, R.envPts[p], L);
      if (e && rng() < 0.85) return e;
      let wp = winProb(G, p, null, worlds) - 0.08;
      if (level === 'dificil') {
        const b = (G.memory.bluff || {})[top.by];
        if (b && b.calls >= 3 && b.weak / b.calls > 0.3) wp += 0.06; // ese grita de farol seguido
      }
      const Lv = top.level;
      const raise = find(acts, a => a.type === 'truco');
      if (raise && wp > 0.74 + 0.04 * (Lv - 2) && rng() < 0.8) return raise;
      let need = { 2: 0.38, 3: 0.46, 4: 0.54 }[Lv] + L.accTr;
      if (rivalScore(G, p) + R.trucoLevel >= G.target) need = 0;                       // no querer = perder el chico
      else if (rivalScore(G, p) + Lv >= G.target && G.scores[team(p)] + Lv < G.target) need += 0.08; // perderlo da el chico
      return find(acts, a => a.type === (wp >= need ? 'quiero' : 'noquiero'));
    }

    if (acts.some(a => a.type === 'envido')) {
      const e = chooseEnvidoInit(G, p, acts, R.envPts[p], L);
      if (e) return e;
    }
    const cards = acts.filter(a => a.type === 'play');
    let best = null, bestWp = -1;
    if (cards.length && rng() < L.noise) best = cards[Math.floor(rng() * cards.length)], bestWp = 0.5;
    else for (const a of cards) {
      const wp = winProb(G, p, a.card, worlds) + rng() * 0.02;
      if (wp > bestWp) { bestWp = wp; best = a; }
    }
    const tr = find(acts, a => a.type === 'truco');
    if (tr) {
      const thr = { 2: 0.66, 3: 0.76, 4: 0.84 }[tr.level] + L.callTr;
      if (bestWp > thr && rng() < 0.8) return tr;
      if (tr.level === 2 && bestWp < 0.3 && rng() < 0.06 * L.bluff) return tr;
    }
    return best || acts[0];
  }

  const AI = { choose, setRng, sampleWorlds, winProb, simulate };
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
  else global.TrucoAI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
