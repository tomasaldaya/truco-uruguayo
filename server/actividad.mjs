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

const fmtHora = d => new Date(d).toLocaleString('es-UY', { timeZone: 'America/Montevideo', weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const salida = [];
const say = s => { salida.push(s); console.log(s); };

// distintos valores de un campo de los registros, solo para las conexiones a mesas de gente
// (se dejan afuera las pruebas automáticas, que corren en máquinas de GitHub en Microsoft Azure)
const DE_GENTE = [
  { kind: 'filter', key: '$workers.event.request.url', operation: 'includes', type: 'string', value: '/api/mesa/' },
  { kind: 'filter', key: '$workers.event.request.cf.asOrganization', operation: 'not_includes', type: 'string', value: 'Microsoft' },
  { kind: 'filter', key: '$workers.event.request.cf.asOrganization', operation: 'not_includes', type: 'string', value: 'MICROSOFT' },
];
async function valores(key, filters) {
  const r = await cf(`/accounts/${CUENTA}/workers/observability/telemetry/values`, { datasets: [], key, type: 'string', timeframe: { from: +desde, to: +hasta }, filters, limit: 1000 });
  if (!r.success) throw new Error(JSON.stringify(r.errors).slice(0, 200));
  return [...new Set((r.result || []).map(x => String(x.value)))];
}
// las pruebas automáticas de cada publicación (para no contarlas como mesas)
async function ventanasDePrueba() {
  const repo = process.env.GITHUB_REPOSITORY, gh = process.env.GITHUB_TOKEN;
  if (!repo || !gh) return [];
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/servidor.yml/runs?per_page=100`, { headers: { Authorization: 'Bearer ' + gh, Accept: 'application/vnd.github+json' } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.workflow_runs || []).map(x => [Date.parse(x.run_started_at || x.created_at), Date.parse(x.updated_at) + 5 * 60e3]);
}
const UY = 'America/Montevideo';
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const durTxt = min => min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`;

async function resumen() {
  say(`# Actividad del Truco Uruguayo\n\nÚltimos ${plural(dias, 'día', 'días')}, hasta ${fmtHora(hasta)} (hora de Uruguay).\n`);
  const d = await gql(`query($a:String!,$s:Time!,$u:Time!){ viewer { accounts(filter:{accountTag:$a}) {
      workersInvocationsAdaptive(limit:5000, filter:{scriptName:"truco-uruguayo", datetime_geq:$s, datetime_leq:$u}) {
        sum { requests errors } dimensions { datetimeHour } }
      durableObjectsPeriodicGroups(limit:10000, filter:{datetimeFiveMinutes_geq:$s, datetimeFiveMinutes_leq:$u}) {
        sum { inboundWebsocketMsgCount activeTime } max { activeWebsocketConnections } dimensions { datetimeFiveMinutes objectId } }
    } } }`, { a: CUENTA, s: desde.toISOString(), u: hasta.toISOString() });
  const acc = d.viewer.accounts[0] || {};
  const inv = acc.workersInvocationsAdaptive || [], per = acc.durableObjectsPeriodicGroups || [];
  const pruebas = await ventanasDePrueba();
  // cada mesa: cuándo empezó y terminó, cuánta gente llegó a tener a la vez
  const mesas = new Map();
  for (const x of per) {
    const t = Date.parse(x.dimensions.datetimeFiveMinutes), id = x.dimensions.objectId;
    const m = mesas.get(id) || { desde: t, hasta: t, gente: 0, msgs: 0, tramos: 0 };
    m.desde = Math.min(m.desde, t); m.hasta = Math.max(m.hasta, t); m.tramos++;
    m.gente = Math.max(m.gente, x.max.activeWebsocketConnections || 0); m.msgs += x.sum.inboundWebsocketMsgCount;
    mesas.set(id, m);
  }
  const deGente = [...mesas.values()].filter(m => m.msgs > 0 && !pruebas.some(([a, b]) => m.desde >= a - 5 * 60e3 && m.hasta <= b));
  deGente.sort((a, b) => a.desde - b.desde);
  const conVarios = deGente.filter(m => m.gente >= 2);
  const minutos = m => m.tramos * 5;
  const totalMin = deGente.reduce((t, m) => t + minutos(m), 0);
  say(`- **Mesas abiertas**: ${deGente.length} (${conVarios.length} con dos o más personas conectadas a la vez)`);
  say(`- **Tiempo total con mesas abiertas**: ${durTxt(totalMin)}`);
  if (deGente.length) {
    const max = Math.max(...deGente.map(m => m.gente));
    say(`- **Lo máximo en una mesa**: ${plural(max, 'persona conectada', 'personas conectadas')} a la vez`);
  }
  try {
    const ips = await valores('$workers.event.request.headers.cf-connecting-ip', DE_GENTE);
    const paises = await valores('$workers.event.request.cf.country', DE_GENTE);
    const uas = await valores('$workers.event.request.headers.user-agent', DE_GENTE);
    const tipo = ua => /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'Mac' : /Linux|CrOS/.test(ua) ? 'Linux/Chromebook' : 'otro';
    const porTipo = {}; for (const u of uas) porTipo[tipo(u)] = (porTipo[tipo(u)] || 0) + 1;
    say(`- **Conexiones distintas** (más o menos, casas o celulares distintos): ${ips.length}`);
    say(`- **Desde**: ${paises.sort().join(', ') || '—'}`);
    say(`- **Aparatos** (combinaciones distintas de aparato y navegador): ${Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || '—'}`);
  } catch (e) { say(`- (No pude leer los registros de conexiones: ${e.message})`); }
  // mesa por mesa
  if (deGente.length) {
    say(`\n| Empezó | Duró | Gente a la vez |\n|---|---|---|`);
    for (const m of deGente) say(`| ${fmtHora(m.desde)} | ${durTxt(minutos(m))} | ${m.gente} |`);
  }
  // errores
  const errores = inv.reduce((t, x) => t + x.sum.errors, 0);
  let msgsErr = [];
  try { msgsErr = await valores('$metadata.error', [{ kind: 'filter', key: '$metadata.level', operation: 'eq', type: 'string', value: 'error' }]); } catch (e) {}
  say(`\nErrores del servidor: ${errores}${msgsErr.length ? '' : errores ? '' : ' (ninguno)'}`);
  for (const m of msgsErr.slice(0, 10)) say(`- ${m.split('\n')[0].slice(0, 140)}`);
  say(`\n_No incluye las mesas de prueba automáticas de cada publicación. Quien abre el juego desde GitHub Pages y no entra a una mesa no queda registrado._`);
}

try {
  if (modo === 'sondeo') await sondeo(); else await resumen();
  if (process.env.GITHUB_STEP_SUMMARY && salida.length) (await import('fs')).appendFileSync(process.env.GITHUB_STEP_SUMMARY, salida.join('\n') + '\n');
} catch (e) { console.error('Error:', e.message); process.exit(1); }
