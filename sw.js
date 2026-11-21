// Truco Uruguayo instalado como app: guarda la página del juego para poder abrirla (y jugar contra la
// computadora) sin internet. Solo se mete al abrir la página y con unos pocos archivos fijos; durante el
// partido no interviene. La página se pide siempre primero a la red, así llega la última versión; si no hay
// internet (o tarda más de 6 segundos, o contesta con un error), se abre la guardada. Lo del servidor (cuentas, mesas) nunca se guarda.
const CACHE = 'truco-v4';   // v4: three.min.js con InstancedMesh (los porotos)   // (cambiarlo borra lo guardado: no hace falta para actualizar la página)
const FIJOS = ['./three.min.js', './manifest.webmanifest', './icono-192.png', './icono-512.png', './icono-mascara-512.png', './icono-apple-180.png'];
const RAIZ = new URL('./', self.registration.scope).pathname;
const esLaPagina = u => u.pathname === RAIZ || u.pathname === RAIZ + 'index.html';
const firma = r => r && (r.headers.get('etag') || r.headers.get('last-modified'));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    c.addAll(FIJOS),
    // la página se guarda de lo que el navegador ya bajó al abrirla: no se descarga otra vez
    fetch(new Request('./', { cache: 'force-cache' })).then(res => res.ok && c.put('./', res)).catch(() => {}),
  ])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// la página nueva se guarda solo si cambió (son casi 2 MB: no se reescriben cada vez que se abre)
async function guardar(res){
  const c = await caches.open(CACHE), vieja = await c.match('./');
  if (vieja && firma(vieja) && firma(vieja) === firma(res)) return;
  await c.put('./', res);
}
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin && esLaPagina(u)) {
    // primero la red; pero si en 6 segundos no contestó, o contestó con un error (por ejemplo, justo mientras se
    // publica una versión nueva), se abre la guardada y la nueva se guarda cuando llegue (para la próxima vez)
    e.respondWith((async () => {
      const red = fetch(r);
      const guardada = () => caches.match('./');
      try {
        const res = await Promise.race([red, new Promise((_, no) => setTimeout(() => no(new Error('lenta')), 6000))]);
        if (res.ok) { e.waitUntil(guardar(res.clone())); return res; }
        return (await guardada()) || res;
      } catch (err) {
        const x = await guardada();
        if (x) { e.waitUntil(red.then(res => res.ok && guardar(res.clone())).catch(() => {})); return x; }
        return red.catch(() => Response.error());
      }
    })());
    return;
  }
  // Three.js (la mesa 3D): la guardada al toque, y se actualiza por detrás para la próxima vez
  if (u.origin === location.origin && u.pathname === RAIZ + 'three.min.js') {
    e.respondWith(caches.open(CACHE).then(c => c.match(r, { ignoreSearch: true }).then(hit => {
      const red = fetch(r).then(res => { if (res.ok) c.put('./three.min.js', res.clone()); return res; }).catch(() => hit);
      return hit || red;
    })));
    return;
  }
  if (u.origin === location.origin && FIJOS.some(f => u.pathname === RAIZ + f.slice(2))) {
    e.respondWith(caches.match(r).then(x => x || fetch(r)));
    return;
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    // las letras: la guardada al toque, y se actualiza por detrás
    e.respondWith(caches.open(CACHE).then(c => c.match(r).then(hit => {
      const red = fetch(r).then(res => { if (res.ok || res.type === 'opaque') c.put(r, res.clone()); return res; }).catch(() => hit);
      return hit || red;
    })));
  }
  // todo lo demás (el servidor, Google, otras páginas como la de privacidad) va directo, sin tocarlo
});
