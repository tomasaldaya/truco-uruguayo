// @ts-check
// El idioma de los mensajes entre el jugador y la mesa del servidor (WebSocket /api/mesa/<CÓDIGO>).
// Primer paso de TypeScript, de a poco: los tipos van en comentarios (JSDoc) y los revisa `npx tsc` (tsconfig.json)
// sin cambiar cómo se arma ni se publica nada. Todo lo que llega del jugador pasa por validarDelJugador() antes de
// tocar la mesa: si el tipo no existe o un campo viene con otro tipo, el campo (o el mensaje) se descarta.

/** @typedef {{ n?: number, key?: string, publica?: boolean, cfg?: Record<string, unknown> }} Crear */
/** @typedef {{ t: 'hello', name?: string, pid?: string, code?: string, key?: string, crear?: Crear, token?: string, vozId?: string, pj?: string, tq?: string, mirar?: boolean, v?: number, from?: string }} Hello */
/** @typedef {{ t: 'pong', s?: number, seated?: boolean }} Pong */
/** @typedef {{ t: 'sit', seat?: number, name?: string }} Sit */
/** @typedef {{ t: 'bye', pausa?: boolean }} Bye */
/** @typedef {{ t: 'empezar', si?: boolean }} Empezar */
/** @typedef {{ t: 'act', a?: Record<string, unknown> }} Act */
/** @typedef {{ t: 'senas', list?: string[] }} Senas */
/** @typedef {{ t: 'pedido', k?: string }} Pedido */
/** @typedef {{ t: 'ready', key?: string }} Ready */
/** @typedef {{ t: 'chat', text?: string, name?: string }} Chat */
/** @typedef {{ t: 'talk', on?: boolean }} Talk */
/** @typedef {{ t: 'vozid', id?: string }} VozId */
/** @typedef {{ t: 'mirar' }} Mirar */
/** @typedef {{ t: 'mirada', y?: number, pi?: number, z?: number, mu?: boolean }} Mirada */
/** @typedef {{ t: 'echar', id?: string, no?: boolean }} Echar */
/** @typedef {{ t: 'gesto', k?: string }} Gesto */
/** @typedef {{ t: 'mode', n?: number }} Mode */
/** @typedef {{ t: 'name', name?: string }} Name */
/** @typedef {{ t: 'cfg', cfg?: Record<string, unknown> }} Cfg */
/** @typedef {{ t: 'start', rules?: Record<string, unknown>, speed?: string, level?: string }} Start */
/** @typedef {{ t: 'close' }} Close */
/** @typedef {{ t: 'voz', esperados?: number, conectados?: number, turn?: boolean }} Voz */
/** @typedef {{ t: 'tanteo', tq?: string }} Tanteo */
/** @typedef {Tanteo|Hello|Pong|Sit|Bye|Empezar|Act|Senas|Pedido|Ready|Chat|Talk|VozId|Mirar|Mirada|Echar|Gesto|Mode|Name|Cfg|Start|Close|Voz} DelJugador */

/** @typedef {'s'|'n'|'b'|'o'|'as'} Clase  s: texto, n: número, b: sí/no, o: objeto, as: lista de textos */
/** @type {Record<string, Record<string, Clase>>} */
const CAMPOS = {
  hello: { name: 's', pid: 's', code: 's', key: 's', crear: 'o', token: 's', vozId: 's', pj: 's', tq: 's', mirar: 'b', v: 'n', from: 's' },
  pong: { s: 'n', seated: 'b' },
  sit: { seat: 'n', name: 's' },
  bye: { pausa: 'b' },
  empezar: { si: 'b' },
  act: { a: 'o' },
  senas: { list: 'as' },
  pedido: { k: 's' },
  ready: { key: 's' },
  chat: { text: 's', name: 's' },
  talk: { on: 'b' },
  vozid: { id: 's' },
  mirar: {},
  mirada: { y: 'n', pi: 'n', z: 'n', mu: 'b' },
  echar: { id: 's', no: 'b' },
  gesto: { k: 's' },
  mode: { n: 'n' },
  name: { name: 's' },
  cfg: { cfg: 'o' },
  start: { rules: 'o', speed: 's', level: 's' },
  close: {},
  voz: { esperados: 'n', conectados: 'n', turn: 'b' },
  tanteo: { tq: 's' },
};
export const TIPOS_DEL_JUGADOR = Object.keys(CAMPOS);
const MAX_TEXTO = 2000;

/** @param {unknown} v @param {Clase} c @returns {boolean} */
function esDeClase(v, c) {
  if (c === 's') return typeof v === 'string' && v.length <= MAX_TEXTO;
  if (c === 'n') return typeof v === 'number' && Number.isFinite(v);
  if (c === 'b') return typeof v === 'boolean';
  if (c === 'o') return !!v && typeof v === 'object' && !Array.isArray(v);
  return Array.isArray(v) && v.length <= 20 && v.every(x => typeof x === 'string' && x.length <= 40);
}

/**
 * Un mensaje del jugador, limpio: solo los campos que corresponden a su tipo y con la clase que corresponde
 * (el resto se descarta). Si no es un mensaje conocido, null.
 * @param {unknown} m
 * @returns {DelJugador | null}
 */
export function validarDelJugador(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = /** @type {Record<string, unknown>} */ (m);
  if (typeof o.t !== 'string' || !Object.prototype.hasOwnProperty.call(CAMPOS, o.t)) return null;
  const campos = CAMPOS[o.t];
  /** @type {Record<string, unknown>} */
  const limpio = { t: o.t };
  for (const k in campos) if (o[k] !== undefined && esDeClase(o[k], campos[k])) limpio[k] = o[k];
  return /** @type {DelJugador} */ (limpio);
}
