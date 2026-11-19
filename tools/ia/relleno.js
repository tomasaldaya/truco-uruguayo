// ¿Cuántas veces la computadora no encuentra manos que cumplan con lo que sabe y completa con manos al azar?
const dir = process.argv[2] || '../../';
const T = require(dir + 'engine.js'), AI = require(dir + 'ai.js');
let s = 99; const r = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
T.setRng(r); AI.setRng(r);
for (const n of [2, 4, 6]) {
  let total = 0, malas = 0, decis = 0, conMalas = 0;
  for (let m = 0; m < 6; m++) {
    const G = T.newMatch({ players: n, humans: [] }); T.startRound(G); let k = 0;
    while (G.phase !== 'matchEnd' && k++ < 3000) {
      if (G.phase !== 'play') { T.nextRound(G); continue; }
      const q = T.actor(G), R = G.round;
      const ws = AI.sampleWorlds(G, q, 45, 'normal');
      // una mano imaginada es "mala" si contradice lo cantado: flor cantada sin flor o puntos cantados distintos
      let mal = 0;
      for (const w of ws) {
        for (let o = 0; o < n; o++) {
          if (o === q || !R.active[o]) continue;
          const full = R.tricks.map(t => t.cards[o]).filter(Boolean).concat(R.cur[o] ? [R.cur[o]] : [], w[o]);
          const er = R.envido.result;
          if ((R.flor.sung[o] && !T.hasFlor(full, R.muestra)) || (er && er.accepted && er.sung && er.sung[o] !== undefined && T.envidoPoints(full, R.muestra) !== er.sung[o])) { mal++; break; }
        }
      }
      total += ws.length; malas += mal; decis++; if (mal) conMalas++;
      T.apply(G, q, AI.choose(G, q, { samples: n === 6 ? 40 : n === 4 ? 60 : 160 }));
    }
  }
  console.log(`${n} jugadores: decisiones con manos imposibles ${conMalas} de ${decis}; manos imposibles ${Math.round(100 * malas / total)}% del total`);
}
