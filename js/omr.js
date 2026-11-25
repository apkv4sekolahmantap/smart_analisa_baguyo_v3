/* Smart Analisa Baguyo — Mesin OMR + template cetak LJK (v3.2).
   SATU sumber kebenaran: layout (buildLayout) dipakai untuk MENCETAK dan untuk MEMBACA, sehingga
   geometri kertas yang dicetak SELALU sama dengan geometri yang dibaca pemindai.
   LJK memuat: identitas ringkas (Nama, Kelas, No. Urut) • PG (10 nomor ke bawah, lanjut ke kolom samping)
   • Isian & Uraian (guru menghitamkan bulatan SKOR tiap butir). Bila tidak muat satu halaman → halaman lanjutan otomatis. */
const TPL = { W: 210, H: 297, PX: 4, R: 1.8,
  mk: [{ x: 15, y: 15, s: 12 }, { x: 195, y: 15, s: 7 }, { x: 195, y: 282, s: 7 }, { x: 15, y: 282, s: 7 }], // TL lebih besar = penanda orientasi
  L: 21, Rt: 188, top: 53, bot: 271,
  idX: 131, idDx: 5.2, idY: [30, 35.5, 41],
  pgPitch: 33.6, pgOx: 8.5, pgDx: 5.0, pgDy: 6, pgCol: 10, pgBand: 50,
  sc: 4.6, scGap: 3.2, pgBub: [165, 172, 179], pgBubY: 15.5 };
const OPT = ['A', 'B', 'C', 'D', 'E'], MARK = 0.30, WEAK = 0.15;
const noLabel = n => n > 200 ? 'U' + (n - 200) : n > 100 ? 'I' + (n - 100) : String(n);
const idXY = (r, d) => [TPL.idX + d * TPL.idDx, TPL.idY[r]];

/* ═════════ TATA LETAK (layout) ═════════ */
function normSpec(s) {
  s = s || {}; const num = a => (a || []).map(x => Math.max(0.5, +x || 1));
  return { pg: Math.max(0, Math.min(60, Math.round(+s.pg || 0))), isi: num(s.isi).slice(0, 20), ura: num(s.ura).slice(0, 10) };
}
function scGeo(kind, maxes) { // geometri deret bulatan skor satu seksi (rata kanan)
  const T = TPL, M = Math.max.apply(null, maxes);
  if (M > 99) throw new Error('Skor maksimal butir untuk LJK tidak boleh lebih dari 99.');
  const two = M > 10, half = kind === 'Uraian' || maxes.some(m => m % 1 !== 0);
  const groups = two ? [{ mul: 10, n: Math.floor(M / 10) + 1 }, { mul: 1, n: 10 }] : [{ mul: 1, n: Math.floor(M) + 1 }];
  const w = groups.reduce((a, g) => a + g.n * T.sc, 0) + (groups.length - 1) * T.scGap + (half ? T.scGap + T.sc : 0);
  return { groups: groups, half: half, w: w, xs: T.Rt - w, M: M };
}
function scPos(geo, max, yc) { // posisi bulatan satu butir
  const T = TPL, o = []; let x = geo.xs;
  geo.groups.forEach((g, gi) => { const n = geo.groups.length === 1 ? Math.min(g.n, Math.floor(max) + 1) : g.n;
    for (let i = 0; i < n; i++) o.push({ x: x + T.sc / 2 + i * T.sc, y: yc, g: gi, v: i * g.mul }); x += g.n * T.sc + T.scGap; });
  if (geo.half) o.push({ x: x + T.sc / 2, y: yc, g: geo.groups.length, v: 0.5, half: true });
  return o;
}
function pgXY(band, k, j) { const T = TPL, c = Math.floor(k / T.pgCol), r = k % T.pgCol; return [T.L + c * T.pgPitch + T.pgOx + j * T.pgDx, band.y + band.head + 8 + r * T.pgDy]; }
function buildLayout(spec, hb) {
  const T = TPL, pages = [{ els: [] }]; let y = T.top;
  const cur = () => pages[pages.length - 1], room = h => y + h <= T.bot, nxt = () => { pages.push({ els: [] }); y = T.top; };
  const kinds = []; if (spec.pg) kinds.push('PG'); if (spec.isi.length) kinds.push('Isian'); if (spec.ura.length) kinds.push('Uraian');
  const letter = {}; kinds.forEach((k, i) => letter[k] = String.fromCharCode(65 + i));
  if (spec.pg) {
    for (let b = 0; b * T.pgBand < spec.pg; b++) {
      const cnt = Math.min(T.pgBand, spec.pg - b * T.pgBand), rows = Math.min(T.pgCol, cnt), head = b === 0 ? 6 : 0, h = head + 8 + (rows - 1) * T.pgDy + 4;
      if (!room(h)) nxt();
      cur().els.push({ t: 'pg', y: y, head: head, base: b * T.pgBand, cnt: cnt, first: b === 0 }); y += h;
    }
    y += 2;
  }
  [['Isian', spec.isi, 100], ['Uraian', spec.ura, 200]].forEach(sec => {
    const kind = sec[0], mx = sec[1], base = sec[2]; if (!mx.length) return;
    const geo = scGeo(kind, mx), ih = kind === 'Isian' ? 7.5 : 6 + hb + 2.5; let started = false, placed = 0;
    mx.forEach((m, i) => {
      let head = started ? 0 : 11; if (!room(head + ih)) { nxt(); started = false; }
      if (!started) { cur().els.push({ t: 'sh', y: y, kind: kind, geo: geo, cont: placed > 0, ltr: letter[kind] }); y += 11; started = true; }
      cur().els.push({ t: 's', no: base + i + 1, y: y, yc: y + (kind === 'Isian' ? 3.5 : 2.5), max: m, kind: kind, geo: geo, hb: hb }); y += ih; placed++;
    });
    y += 3;
  });
  return { pages: pages, letter: letter };
}
const _LC = {};
/** Pilih layout dengan halaman paling sedikit; kotak jawaban uraian dibuat sebesar mungkin yang masih muat. */
function ljkLayout(spec) {
  const s = normSpec(spec), key = JSON.stringify(s); if (_LC[key]) return _LC[key];
  if (!s.pg && !s.isi.length && !s.ura.length) throw new Error('Ujian belum memiliki butir soal.');
  let best = null; for (let tg = 1; tg <= 3 && !best; tg++) [18, 14, 10, 8].forEach(h => { if (best) return; const L = buildLayout(s, h); if (L.pages.length <= tg) best = L; });
  if (!best) throw new Error('Butir terlalu banyak untuk 3 halaman LJK. Kurangi jumlah soal.');
  best.spec = s; return (_LC[key] = best);
}
const ljkPages = spec => ljkLayout(spec).pages.length;

function toGray(im) { const s = im.data, n = im.width * im.height, d = new Uint8ClampedArray(n); for (let i = 0, j = 0; i < n; i++, j += 4) d[i] = (s[j] * 77 + s[j + 1] * 150 + s[j + 2] * 29) >> 8; return { w: im.width, h: im.height, d: d }; }
function shrink(g, nw) {
  if (g.w <= nw) return { g: g, f: 1 };
  const f = g.w / nw, nh = Math.round(g.h / f), d = new Uint8ClampedArray(nw * nh);
  for (let y = 0; y < nh; y++) { const y0 = Math.floor(y * f), y1 = Math.min(g.h, Math.max(y0 + 1, Math.floor((y + 1) * f)));
    for (let x = 0; x < nw; x++) { const x0 = Math.floor(x * f), x1 = Math.min(g.w, Math.max(x0 + 1, Math.floor((x + 1) * f))); let s = 0, c = 0;
      for (let yy = y0; yy < y1; yy++) { const o = yy * g.w; for (let xx = x0; xx < x1; xx++) { s += g.d[o + xx]; c++; } } d[y * nw + x] = s / c; } }
  return { g: { w: nw, h: nh, d: d }, f: f };
}
function binarize(g, win) { // ambang adaptif (tahan bayangan/cahaya tak merata) lewat integral image
  const w = g.w, h = g.h, d = g.d, W1 = w + 1, I = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) { let r = 0; for (let x = 0; x < w; x++) { r += d[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + r; } }
  const hf = win >> 1, b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const y0 = Math.max(0, y - hf), y1 = Math.min(h, y + hf + 1);
    for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - hf), x1 = Math.min(w, x + hf + 1);
      const m = (I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0)), v = d[y * w + x];
      if (v < m * 0.78 && v < 150) b[y * w + x] = 1; } }
  return b;
}
function blobs(b, w, h) {
  const seen = new Uint8Array(w * h), st = new Int32Array(w * h), out = [];
  for (let s = 0; s < w * h; s++) { if (!b[s] || seen[s]) continue;
    let sp = 0, a = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0; st[sp++] = s; seen[s] = 1;
    while (sp) { const p = st[--sp], x = p % w, y = (p / w) | 0; a++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && b[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; st[sp++] = p - 1; } if (x < w - 1 && b[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; st[sp++] = p + 1; }
      if (y > 0 && b[p - w] && !seen[p - w]) { seen[p - w] = 1; st[sp++] = p - w; } if (y < h - 1 && b[p + w] && !seen[p + w]) { seen[p + w] = 1; st[sp++] = p + w; } }
    out.push({ a: a, cx: sx / a, cy: sy / a, bw: x1 - x0 + 1, bh: y1 - y0 + 1 }); }
  return out;
}
/** Cari 4 penanda sudut. Kembalikan titik TL,TR,BR,BL (koordinat gambar asli) atau null. */
function findMarkers(g0, nw) {
  const sh = shrink(g0, nw), g = sh.g, f = sh.f, w = g.w, h = g.h, win = Math.round(w / 6) | 1, maxW = w * 0.14;
  const c = blobs(binarize(g, win), w, h).filter(o => o.bw >= 5 && o.bh >= 5 && o.bw <= maxW && o.bh <= maxW && o.bw / o.bh > 0.6 && o.bw / o.bh < 1.67 && o.a / (o.bw * o.bh) > 0.66);
  if (c.length < 4) return null;
  c.sort((p, q) => q.a - p.a); const top = c.slice(0, 12), good = top.filter(o => o.a >= top[0].a * 0.2);
  const Q = [[0, 0], [w, 0], [w, h], [0, h]], pick = Q.map((q, i) => { let best = null, bd = 1e18;
    good.forEach(o => { if ((i === 0 || i === 3 ? o.cx < w / 2 : o.cx >= w / 2) && (i < 2 ? o.cy < h / 2 : o.cy >= h / 2)) { const dd = (o.cx - q[0]) ** 2 + (o.cy - q[1]) ** 2; if (dd < bd) { bd = dd; best = o; } } }); return best; });
  if (pick.some(p => !p)) return null;
  const mx = pick.reduce((a, o) => a + o.cx, 0) / 4, my = pick.reduce((a, o) => a + o.cy, 0) / 4;
  const pts = pick.map(o => ({ x: o.cx * f, y: o.cy * f, a: o.a, ang: Math.atan2(o.cy - my, o.cx - mx) })).sort((p, q) => p.ang - q.ang);
  let k = 0; pts.forEach((p, i) => { if (p.a > pts[k].a) k = i; });
  const o = [0, 1, 2, 3].map(i => pts[(k + i) % 4]), dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const others = (o[1].a + o[2].a + o[3].a) / 3; if (o[0].a < others * 1.35) return null; // penanda orientasi harus jelas lebih besar
  const rt = dist(o[0], o[1]) / dist(o[0], o[3]); if (rt < 0.45 || rt > 0.95) return null;
  let ar = 0; for (let i = 0; i < 4; i++) { const p = o[i], q = o[(i + 1) % 4]; ar += p.x * q.y - q.x * p.y; } ar = Math.abs(ar) / 2;
  if (ar < 0.10 * g0.w * g0.h) return null;
  return { pts: o.map(p => ({ x: p.x, y: p.y })), frac: ar / (g0.w * g0.h) };
}
function solve8(A, b) {
  const n = 8; for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) { const m = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= m * A[i][c]; b[r] -= m * b[i]; } }
  const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; } return x;
}
function homog(src, dst) { // 4 pasang titik src→dst
  const A = [], b = []; for (let i = 0; i < 4; i++) { const X = src[i].x, Y = src[i].y, x = dst[i].x, y = dst[i].y;
    A.push([X, Y, 1, 0, 0, 0, -x * X, -x * Y]); b.push(x); A.push([0, 0, 0, X, Y, 1, -y * X, -y * Y]); b.push(y); }
  return solve8(A, b);
}
function warp(g, H) { // lembar kanonik: tiap piksel = 1/PX mm
  const P = TPL.PX, cw = TPL.W * P, ch = TPL.H * P, d = new Uint8ClampedArray(cw * ch);
  for (let v = 0; v < ch; v++) { const Y = (v + 0.5) / P; for (let u = 0; u < cw; u++) { const X = (u + 0.5) / P, w = H[6] * X + H[7] * Y + 1,
      x = (H[0] * X + H[1] * Y + H[2]) / w - 0.5, y = (H[3] * X + H[4] * Y + H[5]) / w - 0.5, x0 = Math.floor(x), y0 = Math.floor(y);
    if (x0 < 0 || y0 < 0 || x0 >= g.w - 1 || y0 >= g.h - 1) { d[v * cw + u] = 255; continue; }
    const fx = x - x0, fy = y - y0, o = y0 * g.w + x0, a = g.d[o], b = g.d[o + 1], c = g.d[o + g.w], e = g.d[o + g.w + 1];
    d[v * cw + u] = a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy; } }
  return { w: cw, h: ch, d: d };
}
function disc(g, cx, cy, r) {
  let s = 0, c = 0; const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= 0 && y >= 0 && x < g.w && y < g.h) { s += g.d[y * g.w + x]; c++; }
  return c ? s / c : 255;
}
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
function decide(f) { // f = tingkat hitam 5 opsi (0..1) → {a, st, f}
  const ix = f.map((v, i) => i).sort((p, q) => f[q] - f[p]), t = f[ix[0]], s2 = f[ix[1]], L = OPT[ix[0]];
  if (t < WEAK) return { a: null, st: 'kosong', f: f };
  if (s2 >= MARK && s2 > 0.6 * t) return { a: null, st: 'ganda', f: f };
  if (t >= MARK) return { a: L, st: (s2 > WEAK && s2 > 0.45 * t) ? 'ragu' : 'ok', f: f };
  return { a: L, st: 'ragu', f: f };
}

/* ═════════ PEMBACA LEMBAR ═════════ */
const dec1 = f => { // keputusan satu kelompok bulatan (hanya satu boleh terisi)
  const ix = f.map((v, i) => i).sort((p, q) => f[q] - f[p]), t = f[ix[0]], s2 = f.length > 1 ? f[ix[1]] : 0;
  if (t < WEAK) return { i: null, st: 'kosong' };
  if (s2 >= MARK && s2 > 0.6 * t) return { i: null, st: 'ganda' };
  return { i: ix[0], st: (t >= MARK && !(s2 > WEAK && s2 > 0.45 * t)) ? 'ok' : 'ragu' };
};
function readSheet(wg, spec) {
  const T = TPL, P = T.PX, L = ljkLayout(spec), C = p => [p[0] * P - 0.5, p[1] * P - 0.5], rs = T.R * 0.58 * P;
  const ink = T.mk.map(m => { const c = C([m.x, m.y]); return disc(wg, c[0], c[1], Math.min(m.s / 2 - 1.2, 2.5) * P); }).reduce((a, b) => a + b, 0) / 4;
  const smp = []; for (let i = 0; i < wg.d.length; i += 37) smp.push(wg.d[i]); smp.sort((a, b) => a - b);
  const paper = smp[Math.floor(smp.length * 0.6)], range = Math.max(40, paper - ink);
  const fill = pts => { const s = pts.map(p => disc(wg, C(p)[0], C(p)[1], rs)), base = pts.length >= 3 ? median(s) : paper; return s.map(v => Math.max(0, (base - v) / range)); };
  const res = { ok: true, pages: L.pages.length, page: 1, q: {}, s: {}, noUrut: null, paper: paper, ink: ink, lowContrast: paper - ink < 60 };
  // halaman (bulatan tercetak hitam pada halaman yang bersangkutan)
  if (L.pages.length > 1) { const f = fill(L.pages.map((_, i) => [T.pgBub[i], T.pgBubY])), ix = f.map((v, i) => i).sort((p, q) => f[q] - f[p]);
    if (f[ix[0]] < MARK || f[ix[1]] > 0.6 * f[ix[0]]) return { ok: false, why: 'Nomor halaman LJK tidak terbaca. Foto ulang dengan seluruh kertas terlihat.' };
    res.page = ix[0] + 1; }
  const dg = []; for (let r = 0; r < 3; r++) { const f = fill([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => idXY(r, d))), ix = f.map((v, i) => i).sort((p, q) => f[q] - f[p]);
    dg.push(f[ix[0]] >= MARK && f[ix[1]] < 0.5 * f[ix[0]] ? ix[0] : null); }
  res.noUrut = dg.every(v => v !== null) ? dg[0] * 100 + dg[1] * 10 + dg[2] : null;
  L.pages[res.page - 1].els.forEach(el => {
    if (el.t === 'pg') for (let k = 0; k < el.cnt; k++) res.q[el.base + k + 1] = decide(fill(OPT.map((_, j) => pgXY(el, k, j))));
    else if (el.t === 's') res.s[el.no] = readScore(el, fill);
  });
  return res;
}
function readScore(el, fill) {
  const pts = scPos(el.geo, el.max, el.yc), f = fill(pts.map(p => [p.x, p.y])), ng = el.geo.groups.length, by = [];
  pts.forEach((p, i) => (by[p.g] = by[p.g] || []).push(f[i]));
  let st = 'ok', v = 0, any = false;
  const gr = []; for (let g = 0; g < ng; g++) { const r = dec1(by[g] || []); if (r.st === 'ganda') return { v: null, st: 'ganda' }; gr.push(r); }
  if (ng === 1) { if (gr[0].i !== null) { any = true; v = gr[0].i; if (gr[0].st === 'ragu') st = 'ragu'; } }
  else { if (gr[0].i !== null || gr[1].i !== null) { any = true; v = (gr[0].i || 0) * 10 + (gr[1].i || 0); if (gr[1].i === null || gr[0].st === 'ragu' || gr[1].st === 'ragu') st = 'ragu'; } }
  if (el.geo.half) { const h = by[ng] ? by[ng][0] : 0; if (h >= MARK) { v += 0.5; any = true; } else if (h > WEAK) st = 'ragu'; }
  if (!any) return { v: null, st: 'kosong' };
  if (v > el.max + 1e-9) return { v: null, st: 'ragu', over: true };
  return { v: v, st: st };
}
/** Satu panggilan: gambar abu-abu → hasil baca halaman itu. spec = {pg, isi:[skor maks…], ura:[…]} */
function scanGray(g, spec) {
  const det = findMarkers(g, 900); if (!det) return { ok: false, why: 'LJK tidak terdeteksi. Pastikan 4 kotak hitam di sudut kertas terlihat jelas dan foto tidak terpotong.' };
  const H = homog(TPL.mk.map(m => ({ x: m.x, y: m.y })), det.pts), wg = warp(g, H), r = readSheet(wg, spec); r.wg = wg; return r;
}

/* ═════════ TEMPLATE CETAK LJK (A4, mm) ═════════ */
const xmlEsc_ = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
/** o: {judul, mapel, kelas, spec, id, nama, no, page (1..n)} → SVG satu halaman */
function ljkSvg(o) {
  const T = TPL, L = ljkLayout(o.spec), np = L.pages.length, pi = Math.max(0, Math.min(np - 1, (+o.page || 1) - 1)), P = L.pages[pi], r = T.R, X = xmlEsc_;
  const cir = (x, y, f) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f ? '#000' : '#fff'}" stroke="#000" stroke-width=".3"/>`;
  const fit = (t, size, max) => String(t).length * size * 0.56 > max ? ` textLength="${max}" lengthAdjust="spacingAndGlyphs"` : '';
  const tx = (x, y, t, sz, extra) => `<text x="${x}" y="${y}" font-size="${sz}"${extra || ''}>${X(t)}</text>`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T.W} ${T.H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block" font-family="Arial,Helvetica,sans-serif" fill="#000"><rect width="${T.W}" height="${T.H}" fill="#fff"/>`;
  T.mk.forEach(m => s += `<rect x="${m.x - m.s / 2}" y="${m.y - m.s / 2}" width="${m.s}" height="${m.s}"/>`);
  // judul
  const sub = (o.judul || '') + (o.mapel ? ' • ' + o.mapel : '');
  s += tx(105, 16, 'LEMBAR JAWAB KOMPUTER', 5, ' text-anchor="middle" font-weight="700"') + tx(105, 21.5, sub, 3.2, ' text-anchor="middle"' + fit(sub, 3.2, 100));
  if (np > 1) { s += tx(T.pgBub[0] - 4, T.pgBubY + 1, 'Hal', 2.6, ' text-anchor="end"');
    for (let i = 0; i < np; i++) s += cir(T.pgBub[i], T.pgBubY, i === pi) + tx(T.pgBub[i], T.pgBubY + 5.2, i + 1, 2.2, ' text-anchor="middle"'); }
  // identitas (sesederhana mungkin): Nama, Kelas, No. Urut
  const ln = (y, x2) => `<line x1="36" y1="${y}" x2="${x2}" y2="${y}" stroke="#000" stroke-width=".25"/>`;
  s += tx(21, 32.2, 'Nama', 3.4) + ln(33, 116) + tx(21, 41.2, 'Kelas', 3.4) + ln(42, 80);
  if (o.nama) s += tx(38, 31.8, o.nama, 4, fit(o.nama, 4, 76)); if (o.kelas) s += tx(38, 40.8, o.kelas, 4, fit(o.kelas, 4, 40));
  s += tx(127, 27, 'No. Urut', 3, ' text-anchor="end" font-weight="700"');
  for (let d = 0; d < 10; d++) s += tx(idXY(0, d)[0], 27, d, 2.4, ' text-anchor="middle"');
  const pad = o.no != null && +o.no >= 0 && +o.no <= 999 ? String(Math.round(+o.no)).padStart(3, '0') : null;
  ['×100', '×10', '×1'].forEach((t, c) => { s += tx(T.idX - 4.5, T.idY[c] + 0.8, t, 2.2, ' text-anchor="end"'); for (let d = 0; d < 10; d++) s += cir(idXY(c, d)[0], T.idY[c], pad !== null && +pad[c] === d); });
  // petunjuk + contoh
  s += tx(21, 48.4, 'Pensil 2B / bolpoin hitam. Hitamkan SATU bulatan sampai penuh. Jangan menutup 4 kotak hitam di sudut.', 2.3, fit('x'.repeat(100), 2.3, 112));
  s += tx(137, 48.4, 'Benar', 2.3) + `<circle cx="147" cy="47.6" r="1.5" fill="#000" stroke="#000" stroke-width=".25"/>` + tx(154, 48.4, 'Salah', 2.3)
    + `<circle cx="165" cy="47.6" r="1.5" fill="#fff" stroke="#000" stroke-width=".25"/><path d="M163.8 47.7l.8.8 1.6-1.8" fill="none" stroke="#000" stroke-width=".3"/>`
    + `<circle cx="171" cy="47.6" r="1.5" fill="#fff" stroke="#000" stroke-width=".25"/><circle cx="171" cy="47.6" r=".5" fill="#000"/>`
    + `<circle cx="177" cy="47.6" r="1.5" fill="#fff" stroke="#000" stroke-width=".25"/><path d="M175.7 46.3l2.6 2.6M178.3 46.3l-2.6 2.6" stroke="#000" stroke-width=".3"/>`;
  s += `<line x1="${T.L}" y1="51" x2="${T.Rt}" y2="51" stroke="#000" stroke-width=".3"/>`;
  const hint = { PG: 'Hitamkan satu bulatan.', Isian: 'Tulis jawaban pada garis. Guru menghitamkan bulatan SKOR.', Uraian: 'Tulis jawaban pada kotak. Guru menghitamkan bulatan SKOR (+½ = tambah 0,5).' }, ttl = { PG: 'PILIHAN GANDA', Isian: 'ISIAN SINGKAT', Uraian: 'URAIAN' };
  P.els.forEach(el => {
    if (el.t === 'pg') {
      const y0 = el.y; if (el.first) s += tx(T.L, y0 + 3.8, L.letter.PG + '. ' + ttl.PG, 3.4, ' font-weight="700"') + tx(T.L + 38, y0 + 3.8, hint.PG, 2.3, ' fill="#555"');
      const cols = Math.ceil(el.cnt / T.pgCol);
      for (let c = 0; c < cols; c++) OPT.forEach((l, j) => s += tx(T.L + c * T.pgPitch + T.pgOx + j * T.pgDx, y0 + el.head + 3.4, l, 3, ' text-anchor="middle" font-weight="700"'));
      for (let k = 0; k < el.cnt; k++) {
        const p = pgXY(el, k, 0), x0 = T.L + Math.floor(k / T.pgCol) * T.pgPitch;
        s += tx(x0 + 5.4, p[1] + 1.1, el.base + k + 1, 3.2, ' text-anchor="end"');
        for (let j = 0; j < 5; j++) s += cir(pgXY(el, k, j)[0], p[1], false);
        if (k % T.pgCol === 4 && k < el.cnt - 1) s += `<line x1="${x0}" y1="${p[1] + 3}" x2="${x0 + 30}" y2="${p[1] + 3}" stroke="#aaa" stroke-width=".15"/>`;
      }
    } else if (el.t === 'sh') {
      s += tx(T.L, el.y + 4, el.ltr + '. ' + ttl[el.kind] + (el.cont ? ' (lanjutan)' : ''), 3.4, ' font-weight="700"') + tx(T.L + 42, el.y + 4, hint[el.kind], 2.3, ' fill="#555"');
      scPos(el.geo, el.geo.M, el.y + 9).forEach(p => s += tx(p.x, el.y + 9, p.half ? '+½' : p.v, 2.1, ' text-anchor="middle"'));
    } else {
      const lb = noLabel(el.no); s += tx(T.L, el.yc + 1.1, lb, 3.2, ' font-weight="700"');
      scPos(el.geo, el.max, el.yc).forEach(p => s += cir(p.x, p.y, false));
      if (el.kind === 'Isian') s += `<line x1="${T.L + 9}" y1="${el.yc + 2.4}" x2="${el.geo.xs - 3}" y2="${el.yc + 2.4}" stroke="#000" stroke-width=".25"/>`;
      else s += tx(T.L + 9, el.yc + 1, 'skor maks ' + (+el.max), 2.3, ' fill="#555"') + `<rect x="${T.L}" y="${el.y + 6}" width="${T.Rt - T.L}" height="${el.hb}" fill="none" stroke="#000" stroke-width=".3"/>`;
    }
  });
  const ft = 'Smart Analisa Baguyo • ' + (o.id || '') + ' • ' + L.spec.pg + ' PG, ' + L.spec.isi.length + ' isian, ' + L.spec.ura.length + ' uraian' + (np > 1 ? ' • hal. ' + (pi + 1) + '/' + np : '');
  return s + tx(105, 276, ft, 2.6, ' text-anchor="middle" fill="#444"') + '</svg>';
}

/** Gambar hasil baca di atas lembar kanonik: hijau = jelas, kuning = ragu, merah = ganda; "!" = perlu dicek. */
function paintRead(cx, spec, r) {
  const L = ljkLayout(spec), P = TPL.PX, R = TPL.R * P; cx.lineWidth = 3; cx.font = 'bold 22px sans-serif';
  const dot = (x, y, col) => { cx.fillStyle = col; cx.beginPath(); cx.arc(x * P, y * P, R, 0, 7); cx.fill(); };
  const mark = (x, y, st) => { cx.fillStyle = st === 'kosong' ? '#7A5C54' : st === 'ragu' ? '#C77700' : '#ba1a1a'; cx.fillText(st === 'kosong' ? '∅' : '!', x * P, y * P + 8); };
  L.pages[r.page - 1].els.forEach(el => {
    if (el.t === 'pg') for (let k = 0; k < el.cnt; k++) { const q = r.q[el.base + k + 1]; if (!q) continue;
      OPT.forEach((l, j) => { const p = pgXY(el, k, j); if (q.a === l) dot(p[0], p[1], q.st === 'ok' ? 'rgba(52,179,138,.55)' : 'rgba(245,185,78,.7)');
        if (q.st === 'ganda' && q.f[j] >= MARK) { cx.strokeStyle = '#ba1a1a'; cx.beginPath(); cx.arc(p[0] * P, p[1] * P, R + 2, 0, 7); cx.stroke(); } });
      if (q.st !== 'ok') mark(pgXY(el, k, 4)[0] + 6, pgXY(el, k, 4)[1], q.st); }
    else if (el.t === 's' && r.s[el.no]) { const q = r.s[el.no], pts = scPos(el.geo, el.max, el.yc), v = q.v;
      if (v !== null) { const w = el.geo.groups.length, ten = Math.floor(v / 10) * 10, rest = v - ten;
        pts.forEach(p => { const on = p.half ? v % 1 === 0.5 : w === 1 ? p.v === Math.floor(v) : p.g === 0 ? p.v === ten : p.v === Math.floor(rest); if (on) dot(p.x, p.y, q.st === 'ok' ? 'rgba(52,179,138,.55)' : 'rgba(245,185,78,.7)'); }); }
      if (q.st !== 'ok') mark(el.geo.xs - 7, el.yc, q.st); }
  });
}
