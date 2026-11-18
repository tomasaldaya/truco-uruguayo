// Cuánto se usó el juego, según las estadísticas de Cloudflare. Solo muestra totales (nada de nombres,
// códigos de mesa ni direcciones), porque el resultado queda a la vista en GitHub Actions.
// Uso: CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node server/actividad.mjs [sondeo] [días]
const TOKEN = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
const CUENTA = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const modo = process.argv[2] || 'resumen';
const dias = Math.max(1, Math.min(30, Number(process.argv[3]) || 7));
if (!TOKEN || !CUENTA) { console.error('Faltan CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID'); process.exit(2); }
const API = 'https://api.cloudflare.com/client/v4';
const hasta = new Date(), desde = new Date(hasta - dias * 864e5);

async function cf(path, body, method) {
  const r = await fetch(API + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  try { return JSON.parse(txt); } catch (e) { return { success: false, errors: [{ message: `HTTP ${r.status}: ${txt.slice(0, 200)}` }] }; }
}
async function gql(query, variables) {
  const r = await cf('/graphql', { query, variables });
  if (r.errors && r.errors.length) throw new Error(r.errors.map(e => e.message).join(' | '));
  return r.data;
}
const unwrap = t => { while (t && !t.name) t = t.ofType; return t && t.name; };
async function campos(tipo) {
  const d = await gql(`query($n:String!){ __type(name:$n){ fields { name type { name kind ofType { name kind ofType { name kind ofType { name } } } } } } }`, { n: tipo });
  return d.__type ? d.__type.fields.map(f => ({ name: f.name, type: unwrap(f.type) })) : [];
}

async function sondeo() {
  const v = await cf('/user/tokens/verify');
  console.log('token:', v.success ? v.result.status : JSON.stringify(v.errors));
  try {
    const acc = (await campos('account')).concat(await campos('Account'));
    const sets = acc.filter(f => /workers|durable/i.test(f.name));
    console.log('\nConjuntos de datos de la cuenta:', sets.map(f => f.name).join(', ') || '(ninguno: falta permiso de Analytics?)');
    for (const s of sets.filter(f => /workersInvocationsAdaptive$|durableObjectsInvocationsAdaptiveGroups$|durableObjectsPeriodicGroups$|durableObjectsStorageGroups$/.test(f.name))) {
      const fs = await campos(s.type);
      console.log(`\n${s.name} (${s.type}):`, fs.map(f => f.name).join(', '));
      for (const sub of fs.filter(f => ['dimensions', 'sum', 'count', 'uniq', 'max', 'avg', 'quantiles'].includes(f.name) && f.type)) {
        console.log(`  ${sub.name}:`, (await campos(sub.type)).map(f => f.name).join(', '));
      }
    }
  } catch (e) { console.log('GraphQL:', e.message); }
  const tf = { from: +desde, to: +hasta };
  const k = await cf(`/accounts/${CUENTA}/workers/observability/telemetry/keys`, { timeframe: tf, limit: 200 });
  console.log('\nClaves de los registros:', k.success ? (k.result || []).map(x => x.key).join(', ') : JSON.stringify(k.errors));
}

// ---------- resumen ----------
const fmtDia = d => new Date(d).toLocaleDateString('es-UY', { timeZone: 'America/Montevideo', weekday: 'short', day: 'numeric', month: 'short' });
const fmtHora = d => new Date(d).toLocaleString('es-UY', { timeZone: 'America/Montevideo', weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const salida = [];
const say = s => { salida.push(s); console.log(s); };

async function resumen() {
  say(`# Actividad del Truco Uruguayo\n\nÚltimos ${dias} días (hasta ${fmtHora(hasta)}, hora de Uruguay).\n`);
  // pedidos al servidor (página + conexiones a mesas), por hora
  const d = await gql(`query($a:String!,$s:Time!,$u:Time!){ viewer { accounts(filter:{accountTag:$a}) {
      workersInvocationsAdaptive(limit:5000, filter:{scriptName:"truco-uruguayo", datetime_geq:$s, datetime_leq:$u}) {
        sum { requests errors } dimensions { datetimeHour status } }
      durableObjectsPeriodicGroups(limit:5000, filter:{datetimeHour_geq:$s, datetimeHour_leq:$u}) {
        sum { inboundWebsocketMsgCount outboundWebsocketMsgCount activeTime } dimensions { datetimeHour objectId } }
    } } }`, { a: CUENTA, s: desde.toISOString(), u: hasta.toISOString() });
  const acc = d.viewer.accounts[0] || {};
  const inv = acc.workersInvocationsAdaptive || [], per = acc.durableObjectsPeriodicGroups || [];
  const pedidos = inv.reduce((t, x) => t + x.sum.requests, 0), errores = inv.reduce((t, x) => t + x.sum.errors, 0);
  const mesas = new Set(per.filter(x => x.sum.inboundWebsocketMsgCount > 0).map(x => x.dimensions.objectId));
  const msgs = per.reduce((t, x) => t + x.sum.inboundWebsocketMsgCount, 0);
  const activo = per.reduce((t, x) => t + x.sum.activeTime, 0) / 1e6;   // microsegundos → segundos
  say(`- **Mesas con gente**: ${mesas.size}`);
  say(`- **Tiempo de mesas abiertas** (sumando todas): ${(activo / 3600).toFixed(1)} h`);
  say(`- **Mensajes de los jugadores al servidor** (jugadas, chat, latidos): ${msgs.toLocaleString('es-UY')}`);
  say(`- **Pedidos al servidor** (abrir la página o conectarse a una mesa): ${pedidos.toLocaleString('es-UY')}, con error: ${errores}`);
  // por día
  const porDia = new Map();
  for (const x of per) {
    if (!x.sum.inboundWebsocketMsgCount) continue;
    const dia = fmtDia(x.dimensions.datetimeHour);
    const e = porDia.get(dia) || { mesas: new Set(), horas: new Set(), msgs: 0 };
    e.mesas.add(x.dimensions.objectId); e.horas.add(x.dimensions.datetimeHour); e.msgs += x.sum.inboundWebsocketMsgCount;
    porDia.set(dia, e);
  }
  if (porDia.size) {
    say(`\n| Día | Mesas | Horas con juego | Mensajes |\n|---|---|---|---|`);
    for (const [dia, e] of porDia) say(`| ${dia} | ${e.mesas.size} | ${e.horas.size} | ${e.msgs.toLocaleString('es-UY')} |`);
  }
  // horas con más movimiento
  const porHora = new Map();
  for (const x of per) if (x.sum.inboundWebsocketMsgCount) {
    const h = x.dimensions.datetimeHour, e = porHora.get(h) || { mesas: new Set(), msgs: 0 };
    e.mesas.add(x.dimensions.objectId); e.msgs += x.sum.inboundWebsocketMsgCount; porHora.set(h, e);
  }
  const top = [...porHora].sort((a, b) => b[1].msgs - a[1].msgs).slice(0, 8);
  if (top.length) {
    say(`\nHoras con más movimiento:\n`);
    for (const [h, e] of top) say(`- ${fmtHora(h)}: ${e.mesas.size} mesa${e.mesas.size === 1 ? '' : 's'}, ${e.msgs.toLocaleString('es-UY')} mensajes`);
  }
  // errores del servidor (solo cuántos y el mensaje, sin datos de nadie)
  const q = await cf(`/accounts/${CUENTA}/workers/observability/telemetry/query`, {
    queryId: 'actividad-errores', view: 'events', limit: 50,
    timeframe: { from: +desde, to: +hasta },
    parameters: { datasets: ['cloudflare-workers'], filters: [{ key: '$metadata.level', operation: 'eq', type: 'string', value: 'error' }] },
  });
  if (q.success) {
    const ev = (q.result && q.result.events && q.result.events.events) || [];
    const tipos = new Map();
    for (const e of ev) { const m = String((e.$metadata && (e.$metadata.error || e.$metadata.message)) || '?').slice(0, 120); tipos.set(m, (tipos.get(m) || 0) + 1); }
    say(`\nErrores registrados por el servidor: ${ev.length}${ev.length ? '' : ' 🎉'}`);
    for (const [m, n] of tipos) say(`- ${n} × ${m}`);
  } else say(`\n(No pude leer los registros de errores: ${JSON.stringify(q.errors).slice(0, 200)})`);
}

try {
  if (modo === 'sondeo') await sondeo(); else await resumen();
  if (process.env.GITHUB_STEP_SUMMARY && salida.length) (await import('fs')).appendFileSync(process.env.GITHUB_STEP_SUMMARY, salida.join('\n') + '\n');
} catch (e) { console.error('Error:', e.message); process.exit(1); }
