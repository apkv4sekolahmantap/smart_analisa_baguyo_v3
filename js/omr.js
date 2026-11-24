/* Smart Analisa Baguyo — Mesin OMR + template cetak LJK.
   SATU sumber kebenaran: dipakai index.html, scanner.html, dan cetak LJK, sehingga
   geometri kertas yang dicetak SELALU sama dengan geometri yang dibaca pemindai. */
/* ═════════ MESIN OMR — JS murni, berjalan di browser HP (server tidak memproses gambar) ═════════
   Alur: foto → abu-abu → cari 4 kotak hitam sudut → homografi (koreksi miring/perspektif/putar) →
         lembar kanonik 840×1188 → ukur kegelapan tiap bulatan relatif terhadap baris → jawaban + status. */
const TPL = { W: 210, H: 297, PX: 4, R: 1.9, perCol: 20, colX: [20, 80, 140], y0: 100, dy: 8, ox: 8, dx: 7, idX: [150, 160, 170], idY: 36, idDy: 5,
  mk: [{ x: 15, y: 15, s: 12 }, { x: 195, y: 15, s: 7 }, { x: 195, y: 282, s: 7 }, { x: 15, y: 282, s: 7 }] }; // TL lebih besar = penanda orientasi
const OPT = ['A', 'B', 'C', 'D', 'E'], MAXQ = TPL.perCol * TPL.colX.length, MARK = 0.30, WEAK = 0.15;
const qXY = (k, j) => [TPL.colX[Math.floor(k / TPL.perCol)] + TPL.ox + j * TPL.dx, TPL.y0 + (k % TPL.perCol) * TPL.dy];
const idXY = (c, d) => [TPL.idX[c], TPL.idY + d * TPL.idDy];

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
function readSheet(wg, n) {
  const P = TPL.PX, C = (X, Y) => [X * P - 0.5, Y * P - 0.5], rs = TPL.R * 0.58 * P;
  const ink = TPL.mk.map(m => { const c = C(m.x, m.y); return disc(wg, c[0], c[1], Math.min(m.s / 2 - 1.2, 2.5) * P); }).reduce((a, b) => a + b, 0) / 4;
  const smp = []; for (let i = 0; i < wg.d.length; i += 37) smp.push(wg.d[i]); smp.sort((a, b) => a - b);
  const paper = smp[Math.floor(smp.length * 0.6)], range = Math.max(40, paper - ink);
  const fill = pts => { const s = pts.map(p => disc(wg, p[0], p[1], rs)), base = median(s); return s.map(v => Math.max(0, (base - v) / range)); };
  const q = []; for (let k = 0; k < Math.min(n, MAXQ); k++) q.push(decide(fill(OPT.map((_, j) => C.apply(null, qXY(k, j))))));
  const dg = []; for (let c = 0; c < 3; c++) { const f = fill([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => C.apply(null, idXY(c, d)))), ix = f.map((v, i) => i).sort((p, r) => f[r] - f[p]);
    dg.push(f[ix[0]] >= MARK && f[ix[1]] < 0.5 * f[ix[0]] ? ix[0] : null); }
  return { q: q, noUrut: dg.every(v => v !== null) ? dg[0] * 100 + dg[1] * 10 + dg[2] : null, paper: paper, ink: ink, lowContrast: paper - ink < 60 };
}
/** Satu panggilan: gambar abu-abu → hasil baca. */
function scanGray(g, n) {
  const det = findMarkers(g, 900); if (!det) return { ok: false, why: 'LJK tidak terdeteksi. Pastikan 4 kotak hitam di sudut kertas terlihat jelas dan foto tidak terpotong.' };
  const H = homog(TPL.mk.map(m => ({ x: m.x, y: m.y })), det.pts), wg = warp(g, H), r = readSheet(wg, n); r.ok = true; r.wg = wg; return r;
}

/* ═════════ TEMPLATE CETAK LJK (A4, mm) — memakai TPL di atas ═════════ */
const xmlEsc_ = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
function ljkSvg(o) {
  const T = TPL, n = Math.min(MAXQ, Math.max(1, Math.round(+o.n) || 1)), r = T.R, X = xmlEsc_;
  const cir = (x, y, f) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f ? '#000' : '#fff'}" stroke="#000" stroke-width=".3"/>`;
  const fit = (t, size, max) => String(t).length * size * 0.56 > max ? ` textLength="${max}" lengthAdjust="spacingAndGlyphs"` : '';
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T.W} ${T.H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block" font-family="Arial,Helvetica,sans-serif" fill="#000"><rect width="${T.W}" height="${T.H}" fill="#fff"/>`;
  T.mk.forEach(m => s += `<rect x="${m.x - m.s / 2}" y="${m.y - m.s / 2}" width="${m.s}" height="${m.s}"/>`);
  // judul
  const sub = (o.judul || '') + (o.mapel ? ' • ' + o.mapel : '');
  s += `<text x="105" y="15" text-anchor="middle" font-size="5" font-weight="700">LEMBAR JAWAB KOMPUTER</text><text x="105" y="21.5" text-anchor="middle" font-size="3.2"${fit(sub, 3.2, 140)}>${X(sub)}</text>`;
  // identitas
  const fld = (lb, y, x2) => `<text x="20" y="${y - 1}" font-size="3.2">${lb}</text><line x1="36" y1="${y}" x2="${x2}" y2="${y}" stroke="#000" stroke-width=".25"/>`;
  s += fld('Nama', 44, 132) + fld('Kelas', 54, 92) + fld('Tanggal', 64, 92);
  s += `<text x="98" y="53" font-size="3.2">No. Urut</text><line x1="114" y1="54" x2="132" y2="54" stroke="#000" stroke-width=".25"/>`;
  if (o.nama) s += `<text x="38" y="42.8" font-size="4"${fit(o.nama, 4, 92)}>${X(o.nama)}</text>`;
  if (o.kelas) s += `<text x="38" y="52.8" font-size="4"${fit(o.kelas, 4, 52)}>${X(o.kelas)}</text>`;
  if (o.no != null) s += `<text x="116" y="52.8" font-size="4">${X(o.no)}</text>`;
  // petunjuk + contoh pengisian
  s += `<text x="20" y="72" font-size="2.8" font-weight="700">PETUNJUK</text>`
    + `<text x="20" y="76" font-size="2.4"${fit('Gunakan pensil 2B atau bolpoin hitam. Hitamkan SATU bulatan per nomor sampai penuh.', 2.4, 112)}>Gunakan pensil 2B atau bolpoin hitam. Hitamkan SATU bulatan per nomor sampai penuh.</text>`
    + `<text x="20" y="80" font-size="2.4"${fit('Jangan dilipat, dicoret, atau menutupi 4 kotak hitam di sudut kertas.', 2.4, 112)}>Jangan dilipat, dicoret, atau menutupi 4 kotak hitam di sudut kertas.</text>`
    + `<text x="20" y="84.6" font-size="2.4">Benar</text>` + `<circle cx="32" cy="83.7" r="1.5" fill="#000" stroke="#000" stroke-width=".25"/>`
    + `<text x="40" y="84.6" font-size="2.4">Salah</text>`
    + `<circle cx="52" cy="83.7" r="1.5" fill="#fff" stroke="#000" stroke-width=".25"/><path d="M50.8 83.8l.8.8 1.6-1.8" fill="none" stroke="#000" stroke-width=".3"/>`
    + `<circle cx="58" cy="83.7" r="1.5" fill="#fff" stroke="#000" stroke-width=".25"/><circle cx="58" cy="83.7" r=".5" fill="#000"/>`
    + `<circle cx="64" cy="83.7" r="1.5" fill="#fff" stroke="#000" stroke-width=".25"/><path d="M62.7 82.4l2.6 2.6M65.3 82.4l-2.6 2.6" stroke="#000" stroke-width=".3"/>`;
  // kotak No. Urut
  s += `<rect x="139" y="25" width="40" height="60" rx="2" fill="none" stroke="#000" stroke-width=".3"/><text x="159" y="29.6" text-anchor="middle" font-size="3.2" font-weight="700">No. Urut</text>`;
  ['×100', '×10', '×1'].forEach((t, c) => s += `<text x="${T.idX[c]}" y="33.2" text-anchor="middle" font-size="2.2">${t}</text>`);
  const pad = o.no != null && +o.no >= 0 && +o.no <= 999 ? String(Math.round(+o.no)).padStart(3, '0') : null;
  for (let d = 0; d < 10; d++) s += `<text x="145" y="${T.idY + d * T.idDy + 0.9}" text-anchor="end" font-size="2.6">${d}</text>`;
  for (let c = 0; c < 3; c++) for (let d = 0; d < 10; d++) s += cir(T.idX[c], T.idY + d * T.idDy, pad !== null && +pad[c] === d);
  // lembar jawaban
  s += `<line x1="20" y1="91" x2="190" y2="91" stroke="#000" stroke-width=".3"/>`;
  const cols = Math.ceil(n / T.perCol);
  for (let c = 0; c < cols; c++) OPT.forEach((l, j) => s += `<text x="${T.colX[c] + T.ox + j * T.dx}" y="${T.y0 - 4.5}" text-anchor="middle" font-size="3" font-weight="700">${l}</text>`);
  for (let k = 0; k < n; k++) {
    const p = qXY(k, 0), x0 = T.colX[Math.floor(k / T.perCol)];
    s += `<text x="${x0 + 5}" y="${p[1] + 1.1}" text-anchor="end" font-size="3.2">${k + 1}</text>`;
    for (let j = 0; j < 5; j++) s += cir(qXY(k, j)[0], p[1], false);
    if ((k + 1) % 5 === 0 && (k + 1) % T.perCol !== 0 && k < n - 1) s += `<line x1="${x0}" y1="${p[1] + 4}" x2="${x0 + 40}" y2="${p[1] + 4}" stroke="#999" stroke-width=".15"/>`;
  }
  const ft = 'Smart Analisa Baguyo • ' + (o.id || '') + ' • ' + n + ' soal PG';
  return s + `<text x="105" y="273" text-anchor="middle" font-size="2.6" fill="#444">${X(ft)}</text></svg>`;
}
