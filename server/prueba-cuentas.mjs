// Pruebas de las cuentas (ranking, estadísticas, historial, amigos) con SQLite de Node, sin Cloudflare.
// Uso: node server/prueba-cuentas.mjs
import assert from 'assert';
import { DatabaseSync } from 'node:sqlite';
import { Cuentas, ELO0, mesDe } from './cuentas.mjs';
import { verificarGoogle } from './google.mjs';

let fails = 0;
async function t(name, f) { try { await f(); console.log('ok  ', name); } catch (e) { fails++; console.log('FAIL', name, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); } }

function mundo(extra) {
  const db = new DatabaseSync(':memory:');
  let now = Date.UTC(2026, 10, 18, 15, 0, 0);
  const avisos = [], online = new Set();
  const sql = (q, ...a) => { const st = db.prepare(q); return /^\s*(SELECT|WITH)/i.test(q) ? st.all(...a) : (st.run(...a), []); };
  const c = new Cuentas({ sql, now: () => now, prueba: true, avisar: (uid, m) => avisos.push({ uid, ...m }), enLinea: () => online, ...extra });
  c.init();
  const pedir = async (metodo, ruta, token, cuerpo) => {
    const h = { 'content-type': 'application/json' }; if (token) h.authorization = 'Bearer ' + token;
    const r = await c.http(new Request('https://x.dev/api/' + ruta, { method: metodo, headers: h, body: cuerpo ? JSON.stringify(cuerpo) : undefined }));
    return { s: r.s, ...r.j };
  };
  const alta = async nombre => { const r = await pedir('POST', 'cuenta/prueba', null, { nombre }); assert.equal(r.s, 200, JSON.stringify(r)); return r; };
  return { c, db, avisos, online, pedir, alta, avanzar: ms => { now += ms; }, get now() { return now; } };
}
const partido = (id, ganador, cuentas) => ({ id, n: 2, ganador, tanteador: '30 a 20', equipos: [[{ nombre: 'A' }], [{ nombre: 'B' }]], cuentas });
const stats = { manos: 9, manosGanadas: 5, envidos: 2, flores: 1, trucos: 3 };

await t('alta, sesión, apodos únicos y cambio de apodo', async () => {
  const W = mundo();
  const a = await W.alta('Ana'), a2 = await W.alta('ana');      // la misma persona de prueba (mismo identificador)
  assert.equal(a.yo.id, a2.yo.id);
  const W2 = mundo();
  await W2.c.entrar('g:1', 'Juan'); const j2 = await W2.c.entrar('g:2', 'Juan');
  assert.equal(j2.yo.apodo, 'Juan 2');
  const yo = await W.pedir('GET', 'cuenta/yo', a.token);
  assert.equal(yo.yo.apodo, 'Ana'); assert.equal(yo.yo.puntos, ELO0);
  assert.equal((await W.pedir('GET', 'cuenta/yo', 'x'.repeat(43))).s, 401);
  const b = await W.alta('Beto');
  assert.equal((await W.pedir('POST', 'cuenta/apodo', b.token, { apodo: 'ANA' })).s, 409);
  assert.equal((await W.pedir('POST', 'cuenta/apodo', b.token, { apodo: 'x' })).s, 400);
  const r = await W.pedir('POST', 'cuenta/apodo', b.token, { apodo: '  El   Beto <script> ' });
  assert.equal(r.yo.apodo, 'El Beto script');
  // salir invalida la sesión
  await W.pedir('POST', 'cuenta/salir', b.token);
  assert.equal((await W.pedir('GET', 'cuenta/yo', b.token)).s, 401);
  // la entrada de prueba no existe en producción
  const W3 = mundo({ prueba: false });
  assert.equal((await W3.pedir('POST', 'cuenta/prueba', null, { nombre: 'X' })).s, 404);
  assert.equal((await W3.pedir('POST', 'cuenta/google', null, { credential: 'a.b.c' })).s, 503);
});

await t('ranking: puntos tipo ELO, solo con cuentas en los dos equipos, sin repetir', async () => {
  const W = mundo();
  const a = (await W.alta('Ana')).yo.id, b = (await W.alta('Beto')).yo.id, c = (await W.alta('Ceci')).yo.id;
  // un solo equipo con cuenta: no cuenta
  assert.equal(W.c.registrar(partido('p0', 0, [{ uid: a, equipo: 0, stats }])).anotado, false);
  const r = W.c.registrar(partido('p1', 0, [{ uid: a, equipo: 0, stats }, { uid: b, equipo: 1, stats }]));
  assert(r.anotado); assert.deepEqual(r.jugadores.map(j => j.delta), [16, -16]);
  assert.equal(W.c.registrar(partido('p1', 0, [{ uid: a, equipo: 0 }, { uid: b, equipo: 1 }])).por, 'repetido');
  // ganarle a alguien con menos puntos da menos
  const r2 = W.c.registrar(partido('p2', 0, [{ uid: a, equipo: 0 }, { uid: b, equipo: 1 }]));
  assert(r2.jugadores[0].delta < 16 && r2.jugadores[0].delta > 0);
  // parejas: Ana y Ceci contra Beto; el que abandona pierde aunque su equipo gane
  const r3 = W.c.registrar({ ...partido('p3', 0, [{ uid: a, equipo: 0 }, { uid: c, equipo: 0, abandono: true }, { uid: b, equipo: 1 }]), n: 4 });
  const ceci = r3.jugadores.find(j => j.uid === c);
  assert.equal(ceci.gano, false); assert(ceci.delta < 0);
  const rk = await W.pedir('GET', 'ranking', null);
  assert.deepEqual(rk.lista.map(x => x.apodo), ['Ana', 'Ceci', 'Beto']);
  const perfil = (await W.pedir('GET', 'cuenta/perfil?id=' + a, null)).perfil;
  assert.equal(perfil.partidos, 3); assert.equal(perfil.ganados, 3); assert.equal(perfil.racha, 3); assert.equal(perfil.mejorRacha, 3);
  assert.equal(perfil.manos, 9); assert.equal(perfil.flores, 1); assert.equal(perfil.posicion, 1);
  const pc = (await W.pedir('GET', 'cuenta/perfil?id=' + c, null)).perfil;
  assert.equal(pc.abandonos, 1); assert.equal(pc.racha, 0);
  // historial, del más nuevo al más viejo
  const h = (await W.pedir('GET', 'cuenta/perfil?id=' + b, null)).historial;
  assert.equal(h.length, 3); assert.equal(h[0].n, 4); assert.equal(h[0].gano, false); assert.equal(h[0].tanteador, '30 a 20');
});

await t('ranking del mes: arranca de cero cada mes', async () => {
  const W = mundo();
  const ta = await W.alta('Ana'), a = ta.yo.id, b = (await W.alta('Beto')).yo.id;
  W.c.registrar(partido('m1', 0, [{ uid: a, equipo: 0 }, { uid: b, equipo: 1 }]));
  let mes = await W.pedir('GET', 'ranking?tipo=mes', null);
  assert.equal(mes.mes, '2026-11'); assert.deepEqual(mes.lista.map(x => [x.apodo, x.puntos]), [['Ana', 1016], ['Beto', 984]]);
  W.avanzar(20 * 864e5);                        // diciembre
  mes = await W.pedir('GET', 'ranking?tipo=mes', null);
  assert.equal(mes.mes, '2026-12'); assert.equal(mes.lista.length, 0);
  W.c.registrar(partido('m2', 1, [{ uid: a, equipo: 0 }, { uid: b, equipo: 1 }]));
  mes = await W.pedir('GET', 'ranking?tipo=mes', null);
  assert.deepEqual(mes.lista.map(x => [x.apodo, x.puntos]), [['Beto', 1016], ['Ana', 984]]);
  const gen = await W.pedir('GET', 'ranking', ta.token);
  assert.deepEqual(gen.lista.map(x => [x.apodo, x.puntos]), [['Beto', 1001], ['Ana', 999]]);   // en el general, ganarle al de más puntos da más
  const yo = (await W.pedir('GET', 'cuenta/yo', ta.token)).yo;
  assert.equal(yo.mes.partidos, 1); assert.equal(yo.mes.puntos, 984);
  assert.equal(mesDe(Date.UTC(2026, 11, 1, 2, 0)), '2026-11');   // las 2 de la mañana del 1° de diciembre en UTC son las 23 del 30 de noviembre en Uruguay
});

await t('amigos: pedir, aceptar, solicitud cruzada, buscar, quitar', async () => {
  const W = mundo();
  const A = await W.alta('Ana'), B = await W.alta('Beto'), C = await W.alta('Carla');
  const busq = await W.pedir('GET', 'amigos/buscar?q=be', A.token);
  assert.deepEqual(busq.lista.map(x => x.apodo), ['Beto']);
  assert.equal((await W.pedir('POST', 'amigos/pedir', A.token, { id: B.yo.id })).relacion, 'enviada');
  assert(W.avisos.some(x => x.uid === B.yo.id && x.t === 'amigos' && x.solicitud === 'Ana'));
  let lb = await W.pedir('GET', 'amigos', B.token);
  assert.deepEqual(lb.recibidas.map(x => x.apodo), ['Ana']);
  assert.equal((await W.pedir('POST', 'amigos/aceptar', B.token, { id: A.yo.id })).relacion, 'amigos');
  // solicitud cruzada: si Carla le pide a Ana y Ana le pide a Carla, quedan amigas
  await W.pedir('POST', 'amigos/pedir', C.token, { id: A.yo.id });
  assert.equal((await W.pedir('POST', 'amigos/pedir', A.token, { id: C.yo.id })).relacion, 'amigos');
  W.online.add(B.yo.id);
  const la = await W.pedir('GET', 'amigos', A.token);
  assert.deepEqual(la.amigos.map(x => [x.apodo, x.enLinea]), [['Beto', true], ['Carla', false]]);
  assert.equal((await W.pedir('GET', 'cuenta/perfil?id=' + B.yo.id, A.token)).relacion, 'amigos');
  await W.pedir('POST', 'amigos/borrar', A.token, { id: C.yo.id });
  assert.equal((await W.pedir('GET', 'amigos', A.token)).amigos.length, 1);
  assert.equal((await W.pedir('POST', 'amigos/pedir', A.token, { id: A.yo.id })).s, 404);
});

await t('invitar: solo a amigos, solo si están conectados, sin llenarlos de invitaciones', async () => {
  const W = mundo();
  const A = await W.alta('Ana'), B = await W.alta('Beto'), C = await W.alta('Carla');
  await W.pedir('POST', 'amigos/pedir', A.token, { id: B.yo.id }); await W.pedir('POST', 'amigos/aceptar', B.token, { id: A.yo.id });
  assert.equal((await W.pedir('POST', 'amigos/invitar', A.token, { id: C.yo.id, codigo: 'ABCD' })).s, 403);
  assert.equal((await W.pedir('POST', 'amigos/invitar', A.token, { id: B.yo.id, codigo: 'abcd' })).s, 400);
  assert.equal((await W.pedir('POST', 'amigos/invitar', A.token, { id: B.yo.id, codigo: 'ABCD' })).enLinea, false);
  W.online.add(B.yo.id); W.avisos.length = 0;
  await W.pedir('POST', 'amigos/invitar', A.token, { id: B.yo.id, codigo: 'ABCD' });
  await W.pedir('POST', 'amigos/invitar', A.token, { id: B.yo.id, codigo: 'ABCD' });
  assert.equal(W.avisos.filter(x => x.t === 'invita').length, 1);
  assert.deepEqual(W.avisos[0], { uid: B.yo.id, t: 'invita', de: { id: A.yo.id, apodo: 'Ana' }, codigo: 'ABCD' });
  W.c.presencia(B.yo.id, true);
  assert(W.avisos.some(x => x.uid === A.yo.id && x.t === 'presencia' && x.id === B.yo.id && x.enLinea));
});

await t('borrar la cuenta borra todo lo suyo', async () => {
  const W = mundo();
  const A = await W.alta('Ana'), B = await W.alta('Beto');
  await W.pedir('POST', 'amigos/pedir', A.token, { id: B.yo.id }); await W.pedir('POST', 'amigos/aceptar', B.token, { id: A.yo.id });
  W.c.registrar(partido('x1', 0, [{ uid: A.yo.id, equipo: 0 }, { uid: B.yo.id, equipo: 1 }]));
  assert.equal((await W.pedir('POST', 'cuenta/borrar', A.token)).ok, true);
  assert.equal((await W.pedir('GET', 'cuenta/yo', A.token)).s, 401);
  assert.equal((await W.pedir('GET', 'amigos', B.token)).amigos.length, 0);
  assert.deepEqual((await W.pedir('GET', 'ranking', null)).lista.map(x => x.apodo), ['Beto']);
  assert.equal((await W.pedir('GET', 'cuenta/perfil?id=' + B.yo.id, null)).historial.length, 1);
  // vuelve a entrar con Google: cuenta nueva, de cero
  const A2 = await W.alta('Ana');
  assert.equal(A2.yo.partidos, 0); assert.notEqual(A2.yo.id, A.yo.id);
});

await t('Google: firma, emisor, app y vencimiento', async () => {
  const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pub = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'k1' };
  const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const firmar = async (datos, kid = 'k1') => {
    const h = b64({ alg: 'RS256', kid, typ: 'JWT' }), p = b64(datos);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(h + '.' + p));
    return h + '.' + p + '.' + Buffer.from(sig).toString('base64url');
  };
  const now = () => 1.8e12, opts = { claves: [pub], now };
  const base = { iss: 'https://accounts.google.com', aud: 'cliente', sub: '123', name: 'Ana Pérez', given_name: 'Ana', exp: 1.8e9 + 600 };
  const ok = await verificarGoogle(await firmar(base), 'cliente', opts);
  assert.deepEqual(ok, { sub: '123', nombre: 'Ana Pérez', dado: 'Ana' });
  const falla = async (tok, que) => { try { await verificarGoogle(tok, 'cliente', opts); } catch (e) { return; } throw new Error('aceptó ' + que); };
  await falla(await firmar({ ...base, aud: 'otra' }), 'otra app');
  await falla(await firmar({ ...base, iss: 'evil.com' }), 'otro emisor');
  await falla(await firmar({ ...base, exp: 1.8e9 - 600 }), 'vencido');
  await falla(await firmar(base, 'k2'), 'otra clave');
  const bueno = await firmar(base), [h, , s] = bueno.split('.');
  await falla(h + '.' + b64({ ...base, sub: '999' }) + '.' + s, 'datos cambiados');
  // a través de las cuentas
  const W = mundo({ google: (tok, id) => verificarGoogle(tok, id, opts), googleId: 'cliente' });
  const r = await W.pedir('POST', 'cuenta/google', null, { credential: bueno });
  assert.equal(r.s, 200); assert.equal(r.yo.apodo, 'Ana');
  assert.equal((await W.pedir('POST', 'cuenta/google', null, { credential: 'basura' })).s, 401);
});

console.log(fails ? `\n${fails} pruebas fallaron` : '\nTodo OK');
process.exit(fails ? 1 : 0);
