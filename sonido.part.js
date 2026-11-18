// ---------- Sonidos ----------
// Hechos en el momento con WebAudio (sin archivos): suaves y cortos, para acompañar sin molestar.
// barajar, repartir, carta a la mesa, gritar (golpe en la mesa), flor, tu turno, últimos segundos,
// mano ganada o perdida y mensaje de chat. Se apagan o se cambia el volumen en Configuración.
const SND = (() => {
  const VOL = { bajo: .35, medio: .65, alto: 1 };
  let ctx = null, out = null, noise = null;
  let on = store.get('truco.sonido') !== '0', vol = VOL[store.get('truco.volumen')] ? store.get('truco.volumen') : 'bajo';
  const last = {};
  function ac(){
    if (!on) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      out = ctx.createGain(); out.gain.value = VOL[vol] * .55;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
      out.connect(comp); comp.connect(ctx.destination);
      const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noise = n;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  // los navegadores no dejan sonar nada hasta que la persona toca algo
  ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => { if (on && (!ctx || ctx.state === 'suspended')) ac(); }, { passive: true }));

  // ruido filtrado con envolvente: roce de cartas, golpes
  function hiss(t, dur, f0, f1, q, gain, type){
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = .9 + Math.random()*.2;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(.012, dur/3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()*.5, dur + .05);
  }
  // nota corta y redonda (tipo marimba)
  function tone(t, freq, dur, gain, type){
    const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .02);
  }
  const SOUNDS = {
    shuffle(t){ for (let i = 0; i < 9; i++) hiss(t + i*.045 + Math.random()*.01, .05, 3800, 2200, 1.2, .1); hiss(t + .45, .09, 2600, 900, .9, .14); },
    deal(t){ hiss(t, .07, 4200, 1600, 1.1, .07); },
    place(t){ hiss(t, .045, 1800, 700, .8, .16, 'lowpass'); tone(t, 170, .07, .07); },
    call(t){ tone(t, 120, .11, .16); hiss(t, .05, 900, 300, .7, .18, 'lowpass'); },        // golpe en la mesa al gritar
    flor(t){ tone(t, 784, .22, .035); tone(t + .07, 988, .26, .03); },
    turn(t){ tone(t, 660, .18, .04, 'triangle'); tone(t + .1, 880, .24, .035, 'triangle'); },
    tick(t){ tone(t, 1250, .035, .025, 'triangle'); },
    win(t){ [523, 659, 784].forEach((f, i) => tone(t + i*.09, f, .3, .04, 'triangle')); },
    lose(t){ tone(t, 392, .25, .03, 'triangle'); tone(t + .12, 330, .32, .028, 'triangle'); },
    chat(t){ tone(t, 988, .09, .03); tone(t + .06, 1318, .12, .025); },
  };
  // cada sonido tiene un mínimo de tiempo entre uno y otro, para que nunca se amontonen
  const GAP = { deal: .035, place: .06, tick: .5, chat: .4, turn: .8, shuffle: .8, call: .25 };
  function play(name, delay){
    const c = ac(); if (!c || !SOUNDS[name]) return;
    const t = c.currentTime + (delay || 0);
    if (last[name] !== undefined && t - last[name] < (GAP[name] || .15)) return;
    last[name] = t;
    try { SOUNDS[name](t); } catch (e) {}
  }
  return {
    play,
    get on(){ return on; }, get vol(){ return vol; },
    setOn(v){ on = !!v; store.set('truco.sonido', on ? '1' : '0'); if (on) play('turn'); else if (ctx) ctx.suspend().catch(() => {}); },
    setVol(v){ if (!VOL[v]) return; vol = v; store.set('truco.volumen', v); if (out) out.gain.value = VOL[v] * .55; play('turn'); },
  };
})();
