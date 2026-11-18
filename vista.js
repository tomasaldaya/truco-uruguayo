// Truco Uruguayo — lo que ve cada jugador.
// viewFor(G, s) devuelve una copia del partido con solo lo que el jugador del lugar s puede saber:
// sus cartas, las cartas jugadas, la muestra (salvo mientras se decide a ley de juego), las señas
// de sus compañeros y las que pescó de los rivales. Las cartas ajenas quedan tapadas
// ({ id: 'x<lugar>-<n>', hidden: true }). El anfitrión le manda a cada invitado su vista, y cada
// pantalla dibuja la suya, así que nadie tiene en sus datos lo que no le corresponde ver.
// opts.revealEnd: al terminar la mano se ven las cartas de todos (jugando solo contra la computadora).
(function (global) {
  'use strict';
  const team = p => p % 2;
  const tapada = (pre, q, i) => ({ id: `${pre}${q}-${i}`, hidden: true });

  function viewFor(G, s, opts) {
    opts = opts || {};
    const V = JSON.parse(JSON.stringify(G));
    delete V.memory; // lo que la computadora recuerda de los faroles de cada uno
    const R = V.round;
    if (!R) return V;
    const n = V.n, mine = q => team(q) === team(s), ended = V.phase !== 'play';

    // Mientras se decide a ley de juego la muestra no se ve (Art. 72), y con ella nada de lo que depende de ella
    if (R.leyPhase) {
      R.muestra = { id: 'xm', hidden: true };
      R.envPts[s] = null; R.florHas[s] = null; R.florPts[s] = null; R.senas[s] = null;
      if (R.flor) { R.flor.has[s] = null; R.flor.pts[s] = null; }
    }
    for (let q = 0; q < n; q++) {
      if (q === s) continue;
      const show = ended && (opts.revealEnd || R.mustShow[q]);
      if (!show) {
        const inHand = new Set(R.hands[q].map(c => c.id));
        R.initial[q] = R.initial[q].map((c, i) => inHand.has(c.id) ? tapada('y', q, i) : c);
        R.hands[q] = R.hands[q].map((c, i) => tapada('x', q, i));
        R.florHas[q] = null; R.florPts[q] = null; R.envPts[q] = null;
        if (R.flor) { R.flor.has[q] = null; R.flor.pts[q] = null; R.flor.negada[q] = false; R.flor.lost[q] = false; if (R.flor.lostBy) R.flor.lostBy[q] = null; }
      }
      R.senas[q] = null;
      if (R.faults) R.faults[q] = [];
      if (!mine(q)) R.senasShown[q] = null;          // las señas de los rivales solo si las pescaste
      R.seen[q] = mine(q) ? [] : R.seen[q].filter(v => v.p === s); // de los rivales: solo si te pescaron a vos
    }
    // Quién más tiene flor se sabe cuando le toca cantarla, no antes
    if (R.florQueue && R.florQueue.length > 1) R.florQueue = R.florQueue.slice(0, 1);
    return V;
  }

  const Vista = { viewFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = Vista;
  else global.TrucoVista = Vista;
})(typeof window !== 'undefined' ? window : globalThis);
