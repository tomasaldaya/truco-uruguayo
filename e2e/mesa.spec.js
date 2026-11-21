// Las cuatro pruebas de navegador de base: dos jugadores en una mesa, volver a entrar con el mismo lugar,
// alguien que mira sin ver cartas ajenas, y abrir el juego sin internet.
const { test, expect } = require('@playwright/test');

// una pestaña nueva (cada una es otra persona: su propio navegador)
async function persona(browser, ruta = '/') {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const errores = [];
  pg.on('pageerror', e => errores.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem('truco.view', '2d'); } catch (e) {} });   // la 2D es más rápida
  await pg.goto(ruta);
  return { ctx, pg, errores };
}
const net = pg => pg.evaluate(() => window.__trucoNet && window.__trucoNet());
// de la pantalla de la mesa al partido ("Volver a la mesa" / "Volver a mirar"), cuando aparece el botón
async function entrar(x){
  // el invitado entra solo cuando empieza el partido; si quedó en la pantalla de la mesa, toca el botón
  await expect.poll(() => x.pg.evaluate(() => document.getElementById('home').hidden || !!document.getElementById('hGo'))).toBe(true);
  if (await x.pg.evaluate(() => !document.getElementById('home').hidden)) await x.pg.click('#hGo');
}
const vista = pg => pg.evaluate(() => window.__trucoView && window.__trucoView());

// arma una mesa de mano a mano con dos personas y empieza el partido
async function mesaDeDos(browser) {
  const a = await persona(browser);
  // Truco uruguayo → Online: pide la cuenta (de prueba, con DEV_LOGIN) y ahí se crea la mesa
  await a.pg.click('#pUru'); await a.pg.click('[data-tab="online"]');
  await a.pg.fill('#cPruebaN', 'Ana'); await a.pg.locator('#cPrueba').evaluate(f => f.requestSubmit());
  await a.pg.click('#hHost');
  await a.pg.click('[data-cn] button[data-n="2"]');
  await a.pg.click('#hCrear');
  await expect.poll(async () => (await net(a.pg) || {}).code || '').toMatch(/^[A-Z]{4}$/);
  const code = (await net(a.pg)).code;
  const b = await persona(browser, '/#mesa=' + code);
  await b.pg.fill('#hName', 'Beto');
  await b.pg.locator('#hJoinForm').evaluate(f => f.requestSubmit());
  await expect.poll(async () => ((await net(a.pg)) || {}).seats?.filter(s => s.kind === 'guest').length || 0).toBe(1);
  await a.pg.click('#hGo');   // Empezar partido
  await entrar(b);
  for (const x of [a, b]) await expect.poll(async () => ((await vista(x.pg)) || {}).phase).toBe('play');
  return { a, b, code };
}

test('dos jugadores en una mesa: cada uno ve solo sus cartas y se juega', async ({ browser }) => {
  const { a, b } = await mesaDeDos(browser);
  for (const x of [a, b]) {
    const V = await vista(x.pg), yo = (await net(x.pg)).seat, otro = 1 - yo;
    expect(V.round.hands[yo].every(c => !c.hidden)).toBe(true);
    expect(V.round.hands[otro].every(c => c.hidden)).toBe(true);
  }
  // juega el que le toca una carta
  const turno = async x => x.pg.evaluate(() => window.__trucoActor() === window.__trucoMe());
  await expect.poll(async () => (await turno(a)) || (await turno(b))).toBe(true);
  const quien = (await turno(a)) ? a : b;
  const huella = V => JSON.stringify([V.round.cur.map(c => c && c.id), V.round.tricks.length, V.log.length]);
  const antes = huella(await vista(quien.pg));
  await expect.poll(() => quien.pg.evaluate(() => window.__trucoLegal().length)).toBeGreaterThan(0);
  await quien.pg.evaluate(() => {
    const l = window.__trucoLegal(), V = window.__trucoView(), yo = window.__trucoMe();
    let j = l.find(x => x.type === 'play') || l.find(x => x.type === 'flor') || l[0];
    if (j.type === 'sing' && j.pts == null) j = { ...j, pts: V.round.envPts[yo] };   // modo realista: canta lo que tiene
    window.__trucoAct(j);
  });
  await expect.poll(async () => huella(await vista(a.pg))).not.toBe(antes);   // al otro también le llegó
  // en la mesa se puede silenciar al otro (solo para uno): sus mensajes dejan de verse
  await b.pg.evaluate(() => window.__trucoChat && window.__trucoChat('hola'));
  await expect.poll(() => a.pg.locator('[data-silenciar]').count()).toBeGreaterThan(0);
  await a.pg.locator('[data-silenciar]').first().evaluate(x => x.click());
  await expect.poll(() => a.pg.locator('[data-silenciar]').first().textContent()).toContain('Escuchar');
  expect([...a.errores, ...b.errores]).toEqual([]);
});

test('volver a entrar (recargar la página) recupera el mismo lugar y el partido sigue', async ({ browser }) => {
  const { a, b } = await mesaDeDos(browser);
  const lugar = (await net(b.pg)).seat, mano = (await vista(b.pg)).roundNo, cartas = (await vista(b.pg)).round.hands[lugar].map(c => c.id).join();
  await expect.poll(async () => ((await b.pg.evaluate(() => window.__trucoReloj())) || {}).ms > 0).toBe(true);
  await b.pg.waitForTimeout(3000);   // que corra un poco el reloj
  const quedaba = (await b.pg.evaluate(() => window.__trucoReloj())).ms;
  await b.pg.reload();
  await expect.poll(async () => ((await net(b.pg)) || {}).seat).toBe(lugar);
  await expect.poll(async () => ((await vista(b.pg)) || {}).roundNo).toBe(mano);
  expect((await vista(b.pg)).round.hands[lugar].map(c => c.id).join()).toBe(cartas);
  await expect.poll(async () => ((await b.pg.evaluate(() => window.__trucoReloj())) || {}).ms > 0).toBe(true);
  expect((await b.pg.evaluate(() => window.__trucoReloj())).ms).toBeLessThan(quedaba);
  // y el reloj de la jugada sigue donde estaba (no vuelve a 30 segundos): el servidor manda lo que le queda
  expect((await vista(a.pg)).roundNo).toBe(mano);
});

test('quien mira el partido no recibe ninguna carta sin jugar', async ({ browser }) => {
  const { code } = await mesaDeDos(browser);
  const c = await persona(browser, '/#mesa=' + code);
  await c.pg.fill('#hName', 'Mirón');
  await c.pg.locator('#hJoinForm').evaluate(f => f.requestSubmit());
  await c.pg.click('#hMirar');
  await expect.poll(async () => ((await net(c.pg)) || {}).seat).toBe(-1);
  await entrar(c);
  await expect.poll(async () => ((await vista(c.pg)) || {}).phase).toBe('play');
  const V = await vista(c.pg);
  for (const h of V.round.hands) expect(h.every(x => x.hidden)).toBe(true);
  expect(c.errores).toEqual([]);
});

test('sin internet, el juego abre igual (lo guardado por el service worker)', async ({ browser }) => {
  const { ctx, pg } = await persona(browser);
  await pg.evaluate(() => navigator.serviceWorker.ready);
  await pg.reload();                                   // ya controlada por el service worker, que guardó la página
  await pg.waitForTimeout(1000);
  await ctx.setOffline(true);
  await pg.reload();
  await expect(pg.locator('#hfan')).toBeVisible();
  await pg.evaluate(() => window.__trucoNew(2));       // y se puede jugar contra la computadora
  await expect.poll(async () => ((await vista(pg)) || {}).phase).toBe('play');
});

test('la mesa 3D se baja recién al usarla, y después anda también sin internet', async ({ browser }) => {
  const ctx = await browser.newContext(); const pg = await ctx.newPage(); const errores = [];
  pg.on('pageerror', e => errores.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem('truco.view', '3d'); } catch (e) {} });
  await pg.goto('/');
  expect(await pg.evaluate(() => fetch('/').then(r => r.text()).then(t => t.includes('var THREE=')))).toBe(false);   // index.html ya no trae Three.js
  await pg.evaluate(() => window.__trucoNew(4));
  await expect.poll(() => pg.evaluate(() => window.__v3.listo)).toBe(true);    // al entrar a la mesa 3D se baja
  await expect(pg.locator('#stage canvas')).toBeVisible();
  await pg.evaluate(() => navigator.serviceWorker.ready); await pg.waitForTimeout(1500);
  await ctx.setOffline(true);
  await pg.reload();
  await pg.click('#hCont').catch(() => pg.evaluate(() => window.__trucoNew(4)));
  await expect.poll(() => pg.evaluate(() => window.__v3.listo)).toBe(true);
  await expect(pg.locator('#stage canvas')).toBeVisible();
  expect(errores).toEqual([]);
});
