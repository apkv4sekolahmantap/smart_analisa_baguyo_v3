/* Klien REST untuk GAS — fetch teks/plain (tanpa preflight CORS), timeout, retry, reqId idempoten. */
const API_URL = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
const API_OK = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(API_URL) && API_URL.indexOf('GANTI_DENGAN') < 0;
const Auth = { token: '' };
const READ_RE = /^(ping|bootstrap|listUsers|scanData)$/;   // aksi baca: aman diulang; aksi lain membawa reqId
const Perf = { rows: [], add(a, t, s) { this.rows.push({ action: a, total: t, server: s == null ? null : s, jaringan: s == null ? null : t - s }); if (this.rows.length > 100) this.rows.shift(); }, table() { console.table(this.rows.slice(-30)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const newReqId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
function waitOnline(ms) { return new Promise(r => { if (navigator.onLine !== false) return r(); const t = setTimeout(done, ms); function done() { clearTimeout(t); removeEventListener('online', done); r(); } addEventListener('online', done); }); }
async function apiOnce(action, data, timeout, reqId) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout), t0 = performance.now();
  try {
    const res = await fetch(API_URL, { method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // WAJIB: application/json memicu preflight yang ditolak GAS
      body: JSON.stringify({ action: action, token: Auth.token || '', reqId: reqId, data: data || {} }) });
    const text = await res.text();
    try { const j = JSON.parse(text); Perf.add(action, Math.round(performance.now() - t0), j.ms); return j; }
    catch (e) { return { success: false, network: true, retryable: true, message: 'Server membalas HTTP ' + res.status + ' (bukan JSON). Periksa API_URL dan pengaturan deploy (Anyone).' }; }
  } catch (err) {
    return { success: false, network: true, retryable: true, message: err.name === 'AbortError' ? 'Server terlalu lama merespons.' : 'Koneksi terputus.' };
  } finally { clearTimeout(timer); }
}
async function api(action, data, opt) {
  if (!API_OK) return { success: false, message: 'API_URL belum diisi di js/config.js (URL /exec dari Apps Script).' };
  const isRead = READ_RE.test(action), reqId = isRead ? '' : ((opt && opt.reqId) || newReqId()), tries = isRead ? 3 : 2;
  let res;
  for (let i = 0; i < tries; i++) {
    if (i) { await sleep(1200 * i); if (navigator.onLine === false) await waitOnline(15000); }
    res = await apiOnce(action, data, isRead ? (i ? 40000 : 25000) : 90000, reqId);   // tulis aman diulang: reqId sama = tidak dobel
    if (res.success || !res.retryable) break;
  }
  return res;
}
/** Pemanasan server (cold start) + status database. Mengembalikan data ping atau null. */
function warmUp() {
  if (!API_OK) return Promise.resolve(null);
  return fetch(API_URL + '?action=ping', { cache: 'no-store', redirect: 'follow' }).then(r => r.json()).then(j => j && j.data).catch(() => null);
}
