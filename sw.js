// Truco Uruguayo instalado como app: guarda la página para poder abrirla (y jugar contra la computadora)
// sin internet. La página se pide siempre primero a la red, así cada vez que hay conexión llega la última
// versión; si no hay internet, se abre la guardada. Lo del servidor (cuentas, mesas) nunca se guarda.
const CACHE = 'truco-v1';
const BASE = ['./', './manifest.webmanifest', './icono-192.png', './icono-512.png', './icono-mascara-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === location.origin) {
    if (u.pathname.includes('/api/')) return;                          // el servidor: siempre a la red
    const clave = r.mode === 'navigate' ? './' : r;                     // la página, con o sin ?mesa=...
    e.respondWith(fetch(r).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(clave, copia)); }
      return res;
    }).catch(() => caches.match(clave, { ignoreSearch: true }).then(x => x || caches.match('./'))));
    return;
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    // las letras: la guardada al toque, y se actualiza por detrás
    e.respondWith(caches.open(CACHE).then(c => c.match(r).then(hit => {
      const red = fetch(r).then(res => { if (res.ok || res.type === 'opaque') c.put(r, res.clone()); return res; }).catch(() => hit);
      return hit || red;
    })));
  }
});
