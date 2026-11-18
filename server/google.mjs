// Verifica el "credential" que devuelve el botón de Google (un JWT firmado por Google con RS256):
// la firma con las claves públicas de Google, quién lo emitió, para qué app es y que no esté vencido.
// No hace falta ningún secreto: solo el ID de cliente (que es público).
const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const EMISORES = ['accounts.google.com', 'https://accounts.google.com'];
let cache = { keys: null, until: 0 };

const b64u = s => {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - s.length % 4) % 4);
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};
const json = s => JSON.parse(new TextDecoder().decode(b64u(s)));

async function clavesGoogle(f, now, forzar) {
  if (!forzar && cache.keys && now() < cache.until) return cache.keys;
  const r = await f(CERTS);
  if (!r.ok) throw new Error('No se pudieron leer las claves de Google');
  const j = await r.json();
  const age = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  cache = { keys: j.keys || [], until: now() + (age ? Math.min(+age[1], 86400) : 3600) * 1000 };
  return cache.keys;
}

// opts para pruebas: { fetch, now, claves }
export async function verificarGoogle(token, clientId, opts = {}) {
  const f = opts.fetch || fetch, now = opts.now || Date.now;
  if (!clientId) throw new Error('Falta el ID de cliente de Google');
  const partes = String(token || '').split('.');
  if (partes.length !== 3) throw new Error('Token de Google inválido');
  const cab = json(partes[0]), datos = json(partes[1]);
  if (cab.alg !== 'RS256') throw new Error('Token de Google inválido');
  let claves = opts.claves || await clavesGoogle(f, now, false);
  let jwk = claves.find(k => k.kid === cab.kid);
  if (!jwk && !opts.claves) { claves = await clavesGoogle(f, now, true); jwk = claves.find(k => k.kid === cab.kid); }
  if (!jwk) throw new Error('Token de Google con clave desconocida');
  const clave = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clave, b64u(partes[2]), new TextEncoder().encode(partes[0] + '.' + partes[1]));
  if (!ok) throw new Error('La firma del token de Google no es válida');
  if (!EMISORES.includes(datos.iss)) throw new Error('Token que no es de Google');
  if (datos.aud !== clientId) throw new Error('Token de Google para otra app');
  const t = now() / 1000;
  if (!(datos.exp > t - 60)) throw new Error('Token de Google vencido');
  if (!datos.sub) throw new Error('Token de Google sin usuario');
  return { sub: String(datos.sub), nombre: datos.name || '', dado: datos.given_name || '' };
}
