/** Smart Analisa Baguyo — Frontend. Semua halaman ada di DOM: navigasi 0 ms, URL tidak pernah berubah. */
const $ = i => document.getElementById(i), LET = ['A', 'B', 'C', 'D', 'E'], LS_C = 'sab:v3:c';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const S = { t: null, user: null, ujian: [], siswa: [], kunci: [], jaw: {}, an: {}, cur: null, sid: null, draft: {}, kd: [], foto: null, page: 'dashboard', q: '', fs: '', st: {}, scanFor: null, pending: false, auto: true, ovUrl: '', bootT: 0, h: '', pw: 0 };
const NAV = [['dashboard', 'Dashboard', 'dashboard'], ['ujian', 'Ujian & Kunci', 'key'], ['scan', 'Input & Scan', 'document_scanner'], ['rekap', 'Rekap Nilai', 'format_list_numbered'], ['analisis', 'Analisis Soal', 'analytics'], ['siswa', 'Data Siswa', 'groups'], ['laporan', 'Laporan', 'print'], ['pengguna', 'Pengguna', 'admin_panel_settings']];
const ROLE = { Operator: ['dashboard', 'rekap', 'analisis', 'laporan'], Guru: ['dashboard', 'ujian', 'scan', 'rekap', 'analisis', 'siswa', 'laporan'] };   // Admin & Superadmin: semua menu
let tm, stream;

// ── Util ──
function toast(m, e) { const t = $('toast'); t.textContent = m; t.className = 'on' + (e ? ' err' : ''); clearTimeout(tm); tm = setTimeout(() => t.className = '', 2600); }
// ── Pemanggilan API (fetch → GAS REST). Aksi tulis: reqId idempoten otomatis, tidak dobel saat diulang ──
function run(action, data, ok, fail) {
  const w = !READ_RE.test(action); if (w) S.pw++;
  api(action, data).then(r => {
    if (w) S.pw--;
    try {
      if (r.success) return ok && ok(r.data);
      if (r.code === 'AUTH') return logout(true);
      toast(r.message || 'Gagal memproses.', 1); fail && fail(r);
    } catch (e) { toast('Galat tampilan: ' + e.message, 1); }
  });
}
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h + ':' + s.length; }
function setTok(t) { S.t = t || null; Auth.token = t || ''; try { if (t) localStorage.setItem('sab_t', t); else localStorage.removeItem('sab_t'); } catch (e) {} }
function persist() { try { localStorage.setItem(LS_C, JSON.stringify({ h: S.h, user: S.user, ujian: S.ujian, siswa: S.siswa, kunci: S.kunci, jaw: S.jaw, an: S.an, cur: S.cur })); } catch (e) {} }
function show(v) { ['landing', 'login', 'reg', 'app'].forEach(x => $('v-' + x).hidden = x !== v); scrollTo(0, 0); }
function theme() { const h = document.documentElement, n = h.dataset.theme === 'dark' ? 'light' : 'dark'; h.dataset.theme = n; try { localStorage.setItem('sab_th', n); } catch (e) {} }
const empty = m => `<div class="card empty"><span class="ms">inbox</span><p>${m}</p></div>`;

// ── Data helpers (semua lokal → instan) ──
const U = id => S.ujian.find(x => x.ID === id);
const KS = id => S.kunci.filter(k => k.IDUjian === id && k.Tipe === 'PG').sort((a, b) => a.No - b.No);
const SIS = id => { const u = U(id); return S.siswa.filter(s => u && s.Kelas === u.Kelas && s.Status === 'Aktif'); };
function nilai(id, sid) {
  const a = (S.jaw[id] || {})[sid]; if (!a) return null; let v = 0, b = 0;
  KS(id).forEach(k => { if (a[k.No] === k.Kunci) { v += +k.Bobot; b++; } }); return { b: b, n: Math.round(v * 10) / 10 };
}
function rows(id) { const kkm = +(U(id) || {}).KKM || 75; return SIS(id).map(s => { const r = nilai(id, s.ID); return { s: s, r: r, ok: !!r && r.n >= kkm }; }); }
const nmS = id => (S.siswa.find(s => s.ID === id) || {}).Nama || id;

// ── Auth & bootstrap (stale-while-revalidate) ──
function doLogin(e) {
  e.preventDefault(); const b = $('bLogin'); b.disabled = true; b.textContent = 'Memproses…';
  run('login', { username: $('un').value, password: $('pin').value }, d => {
    setTok(d.token); $('pin').value = ''; b.disabled = false; b.textContent = 'Masuk';
    ingest(d.boot); S.bootT = Date.now(); S.h = hashStr(JSON.stringify(d.boot)); if (!U(S.cur)) S.cur = S.ujian[0] && S.ujian[0].ID; persist(); boot(true, true);
  }, () => { b.disabled = false; b.textContent = 'Masuk'; });
  return false;
}
function logout(force) {
  setTok(null); try { localStorage.removeItem(LS_C); } catch (e) {}
  S.cur = null; S.scanFor = null; S.h = ''; S.bootT = 0; stopCam(); show(force ? 'login' : 'landing'); if (force) toast('Sesi berakhir, silakan masuk lagi.', 1);
}
function ingest(d) {
  S.user = d.user; S.ujian = d.ujian; S.siswa = d.siswa; S.kunci = d.kunci; S.an = d.an; S.jaw = {};
  (d.jaw || []).forEach(j => { ((S.jaw[j[0]] = S.jaw[j[0]] || {})[j[1]] = S.jaw[j[0]][j[1]] || {})[j[2]] = j[3]; });
}
function boot(cached, fresh) {
  if (!S.user) S.user = { nama: '…', peran: 'Guru' };
  show('app'); buildNav(); fillSel(); go(S.page === 'scan' && !cached ? 'dashboard' : S.page, true);
  if (!fresh) refresh(true);
}
/** Segarkan data dari server di latar. Layar tidak dibangun ulang bila data tidak berubah. */
function refresh(force) {
  if (!S.t || S.pw > 0) return;
  if (!force && Date.now() - S.bootT < 30000) return;
  run('bootstrap', {}, d => {
    S.bootT = Date.now(); const h = hashStr(JSON.stringify(d)); if (h === S.h) return;
    S.h = h; ingest(d); if (!U(S.cur)) S.cur = S.ujian[0] && S.ujian[0].ID; persist(); buildNav(); fillSel(); renderPage();
  });
}
function buildNav() {
  const ok = ROLE[S.user && S.user.peran] || NAV.map(n => n[0]), items = NAV.filter(n => ok.includes(n[0]));
  const h = items.map(n => `<button class="nl" data-p="${n[0]}" onclick="go('${n[0]}')"><span class="ms">${n[2]}</span>${n[1]}</button>`).join('');
  $('navS').innerHTML = h; $('navB').innerHTML = items.filter(n => n[0] !== 'laporan').map(n => `<button class="nl" data-p="${n[0]}" onclick="go('${n[0]}')"><span class="ms">${n[2]}</span>${n[1].split(' ')[0]}</button>`).join('');
  $('uName').textContent = S.user ? S.user.nama + ' • ' + S.user.peran : '';
}
function fillSel() { $('selUj').innerHTML = S.ujian.map(u => `<option value="${esc(u.ID)}"${u.ID === S.cur ? ' selected' : ''}>${esc(u.Nama)}</option>`).join('') || '<option>Belum ada ujian</option>'; }
function setCur(id) { S.cur = id; S.sid = null; persist(); renderPage(); }

// ── Router SPA: tampil/sembunyi section (tanpa server, tanpa ubah URL) ──
function go(p, nopush) {
  if (ROLE[S.user && S.user.peran] && !ROLE[S.user.peran].includes(p)) p = 'dashboard';
  if (p !== 'scan') stopCam(); S.page = p;
  document.querySelectorAll('.pg').forEach(s => s.classList.toggle('on', s.id === 'p-' + p));
  document.querySelectorAll('.nl[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  renderPage(); scrollTo(0, 0);
  if (!nopush && location.hash !== '#/' + p) history.pushState(null, '', '#/' + p);
}
window.addEventListener('popstate', () => { const p = (location.hash.match(/^#\/(\w+)/) || [])[1]; if (S.user && S.t && p && NAV.some(n => n[0] === p)) go(p, true); });
function renderPage() { ({ siswa: rSiswa, pengguna: rPengguna, dashboard: rDash, ujian: rUjian, scan: rScan, rekap: rRekap, analisis: rAnalisis, laporan: rLaporan })[S.page](); }

// ── Dashboard ──
function rDash() {
  const el = $('p-dashboard'), id = S.cur; if (!id) return el.innerHTML = empty('Belum ada ujian. Buat di menu Ujian & Kunci.');
  const R = rows(id), d = R.filter(x => x.r), avg = d.length ? d.reduce((a, x) => a + x.r.n, 0) / d.length : 0, tun = d.filter(x => x.ok).length, pct = d.length ? tun / d.length * 100 : 0;
  const bk = [0, 0, 0, 0, 0]; d.forEach(x => bk[x.r.n >= 60 ? Math.min(4, Math.floor(x.r.n / 10) - 5) : 0]++);
  const mx = Math.max(1, ...bk), lb = ['Di bawah 60', '60-69', '70-79', '80-89', '90+'], an = S.an[id], ins = [];
  if (an && an.items.length && an.n) { const h = an.items.slice().sort((a, b) => a.p - b.p)[0]; ins.push(`Soal tersulit: nomor ${h.no} (p = ${h.p}).`); ins.push(`${an.items.filter(i => i.kat !== 'Diterima').length} soal perlu revisi atau ditolak.`); }
  if (d.length) ins.push(`${d.length - tun} siswa perlu remedial.`);
  el.innerHTML = `<h2>Selamat datang, ${esc(S.user.nama)}</h2>
  <div class="kpis"><div class="card kpi"><span class="mu">Total Ujian</span><b>${S.ujian.length}</b></div><div class="card kpi"><span class="mu">Siswa Terkoreksi</span><b>${d.length}/${R.length}</b></div>
  <div class="card kpi"><span class="mu">Rata-rata Nilai</span><b>${avg.toFixed(1)}</b></div><div class="card kpi"><span class="mu">Ketuntasan</span><b>${pct.toFixed(0)}%</b></div></div>
  <div class="two"><div class="card"><h3>Sebaran Nilai Siswa</h3><div class="bars">${bk.map((v, i) => `<div class="bar"><b>${v}</b><i style="height:${v / mx * 100}%"></i><span>${lb[i]}</span></div>`).join('')}</div></div>
  <div class="card"><h3>Ketuntasan (KKM ${esc((U(id) || {}).KKM)})</h3><div class="donut" style="background:conic-gradient(var(--gr) ${pct}%,var(--tint) 0)"><b>${pct.toFixed(0)}%</b></div>
  <p class="mu">${ins.map(esc).join('<br>') || 'Belum ada data jawaban.'}</p></div></div>
  <h3>Daftar Ujian</h3><div class="tw"><table><tr><th>Ujian</th><th>Kelas</th><th>Tanggal</th><th>Progres</th></tr>${S.ujian.map(u => { const r = rows(u.ID), n = r.filter(x => x.r).length, p = r.length ? n / r.length * 100 : 0;
    return `<tr class="cl" onclick="setCur('${esc(u.ID)}');fillSel()"><td>${esc(u.Nama)}</td><td>${esc(u.Kelas)}</td><td>${esc(u.Tanggal)}</td><td><div class="prog"><i style="width:${p}%"></i></div>${n}/${r.length}</td></tr>`; }).join('')}</table></div>`;
}

// ── Ujian & Kunci ──
function rUjian() {
  const el = $('p-ujian'), id = S.cur;
  let h = `<h2>Ujian &amp; Kunci</h2><div class="card"><h3>Buat Ujian Baru</h3><div class="row"><input id="nu_n" placeholder="Nama ujian" maxlength="80"><input id="nu_m" placeholder="Mapel"><input id="nu_k" placeholder="Kelas (mis. VIII-A)"><input id="nu_j" type="number" min="5" max="60" value="20" aria-label="Jumlah soal PG"><button class="btn pri" onclick="buatUjian()">Buat</button></div></div>`;
  if (id) { S.kd = KS(id).map(k => k.Kunci);
    h += `<div class="card"><h3>Kunci Pilihan Ganda — ${esc((U(id) || {}).Nama)}</h3><div class="row"><label for="kkm" style="margin:0">KKM</label><input id="kkm" type="number" min="0" max="100" value="${esc((U(id) || {}).KKM)}" style="width:90px">
    <input id="qk" placeholder="Input cepat, mis. BACDEABCDA" style="text-transform:uppercase"><button class="btn gh" onclick="quick()">Terapkan</button></div><div id="kg"></div><div class="row" style="margin-top:12px"><button class="btn pri" onclick="simpanKunci()">Simpan Kunci</button></div></div>`; }
  el.innerHTML = h; if (id) drawKg();
}
function drawKg() { $('kg').innerHTML = S.kd.map((k, i) => `<div class="krow"><b>${i + 1}</b><div class="bub">${LET.map(l => `<button class="b${l === k ? ' on' : ''}" onclick="setK(${i},'${l}',this)" aria-label="No ${i + 1} ${l}">${l}</button>`).join('')}</div></div>`).join(''); }
function setK(i, l, b) { S.kd[i] = l; b.parentNode.querySelectorAll('.b').forEach(x => x.classList.toggle('on', x === b)); }
function quick() { const s = $('qk').value.toUpperCase().replace(/[^A-E]/g, ''); S.kd = S.kd.map((k, i) => s[i] || k); drawKg(); toast('Input cepat diterapkan (belum disimpan).'); }
function simpanKunci() {
  const id = S.cur, kkm = Math.min(100, Math.max(0, +$('kkm').value || 75)), arr = S.kd.slice();
  KS(id).forEach((k, i) => k.Kunci = arr[i]); U(id).KKM = kkm; persist(); toast('Kunci tersimpan.');
  run('saveKunci', { ujian: id, kunci: arr, kkm: kkm }, d => { S.an[id] = d.analisis; persist(); }, () => toast('Belum tersinkron ke server. Simpan ulang.', 1));
}
function buatUjian() {
  const o = { nama: $('nu_n').value.trim(), mapel: $('nu_m').value.trim(), kelas: $('nu_k').value.trim(), jml: $('nu_j').value };
  if (!o.nama || !o.kelas) return toast('Isi nama ujian dan kelas.', 1);
  run('createUjian', o, d => { S.ujian.push(d.ujian); S.kunci = S.kunci.concat(d.kunci); S.cur = d.ujian.ID; S.an[d.ujian.ID] = { items: [], rel: 0, n: 0 }; persist(); fillSel(); renderPage(); toast('Ujian dibuat. Atur kunci di bawah.'); });
}


// ── Input & Scan (OMR otomatis) ──
let loopT = 0, okN = 0, lastC = null, busy = false, cool = 0, lc = null;
function loadDraft() { const J = S.jaw[S.cur] || {}; S.draft = Object.assign({}, J[S.sid] || {}); S.st = {}; S.foto = null; S.pending = false; const sr = $('sr'); if (sr) sr.hidden = true; }
function rScan() {
  const el = $('p-scan'), id = S.cur; if (!id) { stopCam(); S.scanFor = null; return el.innerHTML = empty('Pilih atau buat ujian terlebih dahulu.'); }
  const ss = SIS(id); if (!ss.length) { stopCam(); S.scanFor = null; return el.innerHTML = empty('Belum ada siswa di kelas ' + esc((U(id) || {}).Kelas) + '.'); }
  let fresh = false;
  if (S.scanFor !== id || !$('scanRoot')) { stopCam(); S.scanFor = id; buildScan(); fresh = true; }
  if (!ss.find(s => s.ID === S.sid)) { S.sid = (ss.find(s => !(S.jaw[id] || {})[s.ID]) || ss[0]).ID; fresh = true; }
  if (fresh) loadDraft(); refreshScan();
}
function buildScan() {
  $('p-scan').innerHTML = `<div id="scanRoot"><h2>Input &amp; Scan Jawaban</h2>
  <div class="card"><div class="row"><b id="scCnt"></b></div><div class="prog" style="margin:8px 0 12px"><i id="scBar"></i></div>
    <label for="selSis">Siswa</label><select id="selSis" onchange="pickSis(this.value)" style="width:100%"></select></div>
  <div class="cam"><div class="row" style="margin-bottom:8px">
    <button class="btn am" onclick="camToggle()"><span class="ms">photo_camera</span><span id="bCamT">Buka Kamera</span></button>
    <label class="btn gh camup"><span class="ms">upload</span>Unggah Foto<input type="file" accept="image/*" capture="environment" hidden onchange="pickFile(this)"></label>
    <button class="btn gh camup" onclick="ljkDlg()"><span class="ms">print</span>Cetak LJK</button></div>
    <div class="vw" id="vw" hidden><video id="vid" playsinline muted></video><canvas id="ov"></canvas></div>
    <div class="row camctl" id="camCtl" hidden><span id="camSt" class="camst">Arahkan kamera ke LJK</span><button class="btn pri" onclick="capture()"><span class="ms">camera</span>Ambil</button></div>
    <div id="scLink"></div>
    <label class="chk"><input type="checkbox" id="auto" ${S.auto ? 'checked' : ''} onchange="S.auto=this.checked"> Ambil otomatis saat LJK terdeteksi &amp; stabil</label>
    <small class="camtip">Tips: LJK rata di meja, cahaya cukup, 4 kotak hitam di sudut harus masuk bingkai. Gunakan LJK hasil menu <b>Cetak LJK</b>.</small></div>
  <div class="card" id="sr" hidden></div><div class="card" id="cc"></div></div>`;
}
function scanLink() { return `<a class="btn am" style="margin-top:10px" href="scanner.html#u=${encodeURIComponent(S.cur)}"><span class="ms">qr_code_scanner</span>Scan Kamera Penuh</a>`; }
function refreshScan() {
  const lk = $('scLink'); if (lk && !lk.firstChild) lk.innerHTML = scanLink();
  const id = S.cur, ss = SIS(id), J = S.jaw[id] || {}, done = ss.filter(s => J[s.ID]).length;
  $('scCnt').textContent = `Terkoreksi ${done}/${ss.length}`; $('scBar').style.width = done / ss.length * 100 + '%';
  $('selSis').innerHTML = ss.map((s, i) => `<option value="${esc(s.ID)}"${s.ID === S.sid ? ' selected' : ''}>${J[s.ID] ? '✓ ' : ''}${i + 1}. ${esc(s.Nama)} (${esc(s.NIS)})</option>`).join(''); drawCorr();
}
function pickSis(v) { S.sid = v; loadDraft(); refreshScan(); }
function drawCorr() {
  const id = S.cur, ks = KS(id), bad = ks.filter(k => S.st[k.No] === 'ragu' || S.st[k.No] === 'ganda').length, kos = ks.filter(k => S.st[k.No] === 'kosong').length;
  $('cc').innerHTML = `<h3>Koreksi Jawaban</h3><p class="mu" style="margin-bottom:8px">Ketuk huruf untuk mengubah; ketuk lagi untuk menghapus.${bad ? ` <b class="wc">${bad} nomor perlu dicek (ditandai).</b>` : ''}${kos ? ` ${kos} nomor kosong.` : ''}</p>`
    + ks.map(k => { const s = S.st[k.No] || '', lb = { ragu: 'ragu-ragu', ganda: 'jawaban ganda', kosong: 'kosong' }[s];
      return `<div class="krow ${s}" id="kr${k.No}"><b>${k.No}</b><div class="bub">${LET.map(l => `<button class="b${S.draft[k.No] === l ? ' on' : ''}" onclick="setA(${k.No},'${l}',this)" aria-label="No ${k.No} ${l}">${l}</button>`).join('')}</div>${lb ? `<small class="fl">${lb}</small>` : ''}</div>`; }).join('')
    + `<div class="row" style="margin-top:12px"><button class="btn pri lg" onclick="simpan()">Simpan &amp; Lanjut <span class="ms">arrow_forward</span></button></div>`;
}
function setA(no, l, b) {
  if (S.draft[no] === l) { delete S.draft[no]; b.classList.remove('on'); } else { S.draft[no] = l; b.parentNode.querySelectorAll('.b').forEach(x => x.classList.toggle('on', x === b)); }
  delete S.st[no]; const r = $('kr' + no); if (r) { r.className = 'krow'; const f = r.querySelector('.fl'); if (f) f.remove(); }
}
function simpan() {
  const id = S.cur, sid = S.sid, dr = Object.assign({}, S.draft); if (!Object.keys(dr).length) return toast('Isi minimal satu jawaban.', 1);
  (S.jaw[id] = S.jaw[id] || {})[sid] = dr; const foto = S.foto; persist(); toast('Tersimpan: ' + nmS(sid));   // UI instan
  run('saveJawaban', { ujian: id, sid: sid, ans: dr, sumber: foto ? 'Scan' : 'Manual' }, d => { S.an[id] = d.analisis; persist(); }, () => toast('Belum tersinkron untuk ' + nmS(sid) + '. Simpan ulang siswa ini.', 1));
  if (foto) run('uploadFoto', { ujian: id, sid: sid, b64: foto.split(',')[1] });
  const nx = SIS(id).find(s => !S.jaw[id][s.ID]); S.sid = nx ? nx.ID : sid; loadDraft(); refreshScan(); cool = Date.now() + 2500; okN = 0; scrollTo(0, 0);
}

// ── Kamera: pratinjau hidup + deteksi 4 penanda + ambil otomatis ──
function camToggle() { if (stream) return stopCam(); camOn(); }
async function camOn() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
    const v = $('vid'); v.srcObject = stream; $('vw').hidden = false; $('camCtl').hidden = false; $('bCamT').textContent = 'Tutup Kamera'; await v.play(); okN = 0; camLoop();
  } catch (e) { stream = null; toast('Kamera tidak bisa diakses. Gunakan Unggah Foto.', 1); }
}
function stopCam() {
  clearTimeout(loopT); if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  const a = $('vw'), b = $('camCtl'), c = $('bCamT'); if (a) a.hidden = true; if (b) b.hidden = true; if (c) c.textContent = 'Buka Kamera'; okN = 0;
}
const camSt = (m, c) => { const e = $('camSt'); if (e) { e.textContent = m; e.dataset.k = c || ''; } };
function camLoop() {
  if (!stream) return; const v = $('vid');
  if (v.videoWidth && !busy) {
    const w = 480, h = Math.round(w * v.videoHeight / v.videoWidth); lc = lc || document.createElement('canvas'); lc.width = w; lc.height = h;
    const cx = lc.getContext('2d', { willReadFrequently: true }); cx.drawImage(v, 0, 0, w, h);
    let det = null; try { det = findMarkers(toGray(cx.getImageData(0, 0, w, h)), w); } catch (e) {}
    guide(det, w, h);
    if (!det) { okN = 0; lastC = null; camSt('Arahkan ke LJK — 4 kotak hitam sudut harus terlihat'); }
    else if (det.frac < 0.28) { okN = 0; camSt('Dekatkan kamera sampai LJK memenuhi layar', 'w'); }
    else {
      const c = det.pts.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 }); okN = lastC && Math.hypot(c.x - lastC.x, c.y - lastC.y) < w * 0.02 ? okN + 1 : 1; lastC = c;
      if (S.pending) camSt('Hasil sudah dibaca — periksa & simpan, atau ketuk Ambil untuk ulang', 'o');
      else if (okN >= 5 && S.auto && Date.now() > cool) { camSt('Membaca…', 'o'); return capture(); }
      else camSt(S.auto ? 'LJK terdeteksi — tahan stabil…' : 'LJK terdeteksi — ketuk Ambil', 'o');
    }
  }
  loopT = setTimeout(camLoop, 250);
}
function guide(det, w, h) {
  const o = $('ov'); if (!o) return; o.width = w; o.height = h; const c = o.getContext('2d'); c.clearRect(0, 0, w, h); c.lineWidth = 3;
  if (det) { c.strokeStyle = '#34B38A'; c.fillStyle = 'rgba(52,179,138,.18)'; c.beginPath(); det.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.fill(); c.stroke(); }
  else { const mw = w * 0.7, mh = mw * 1.414 > h * 0.92 ? h * 0.92 : mw * 1.414, bw = mh / 1.414; c.strokeStyle = 'rgba(255,255,255,.7)'; c.setLineDash([10, 8]); c.strokeRect((w - bw) / 2, (h - mh) / 2, bw, mh); }
}
function capture() {
  if (busy) return; const v = $('vid'); if (!stream || !v.videoWidth) return toast('Kamera belum siap.', 1);
  const r = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * r); c.height = Math.round(v.videoHeight * r); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); proses(c);
}
function pickFile(i) {
  const f = i.files[0]; if (!f) return; const im = new Image();
  im.onload = () => { const r = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * r); c.height = Math.round(im.height * r); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(im.src); i.value = ''; proses(c); };
  im.onerror = () => toast('Foto tidak bisa dibuka.', 1); im.src = URL.createObjectURL(f);
}

// ── Proses satu foto → jawaban ──
function proses(c) {
  if (busy) return; busy = true; camSt('Membaca LJK…', 'o'); toast('Membaca LJK…');
  setTimeout(() => {
    try {
      const n = KS(S.cur).length, r = scanGray(toGray(c.getContext('2d').getImageData(0, 0, c.width, c.height)), n);
      if (!r.ok) { toast(r.why, 1); camSt('Gagal membaca — coba lagi', 'w'); } else applyScan(r, n);
    } catch (e) { toast('Gagal memproses foto: ' + e.message, 1); }
    finally { busy = false; }
  }, 30);
}
function applyScan(r, n) {
  const id = S.cur, ss = SIS(id), J = S.jaw[id] || {}; let who = '';
  if (r.noUrut !== null && r.noUrut >= 1 && r.noUrut <= ss.length) { S.sid = ss[r.noUrut - 1].ID; who = `No. Urut ${r.noUrut} → <b>${esc(ss[r.noUrut - 1].Nama)}</b>`; }
  else if (r.noUrut !== null) who = `<span class="wc">No. Urut ${r.noUrut} tidak ada di kelas ini — memakai siswa yang dipilih.</span>`;
  else who = 'No. Urut tidak terisi — memakai siswa yang dipilih: <b>' + esc(nmS(S.sid)) + '</b>';
  S.draft = {}; S.st = {}; r.q.forEach((q, i) => { if (q.a) S.draft[i + 1] = q.a; S.st[i + 1] = q.st; });
  const cnt = k => r.q.filter(q => q.st === k).length, ok = cnt('ok'), ragu = cnt('ragu'), gd = cnt('ganda'), ks = cnt('kosong');
  // gambar hasil: lembar kanonik + lingkaran penanda
  const wg = r.wg, cv = document.createElement('canvas'); cv.width = wg.w; cv.height = wg.h; const cx = cv.getContext('2d'), im = cx.createImageData(wg.w, wg.h);
  for (let i = 0, j = 0; i < wg.d.length; i++, j += 4) { im.data[j] = im.data[j + 1] = im.data[j + 2] = wg.d[i]; im.data[j + 3] = 255; }
  cx.putImageData(im, 0, 0); S.foto = cv.toDataURL('image/jpeg', 0.55);   // arsip: lembar yang sudah diluruskan
  const P = TPL.PX; cx.lineWidth = 3; cx.font = 'bold 22px sans-serif';
  r.q.forEach((q, k) => OPT.forEach((l, j) => { const p = qXY(k, j), on = q.a === l;
    if (on) { cx.fillStyle = q.st === 'ok' ? 'rgba(52,179,138,.55)' : 'rgba(245,185,78,.7)'; cx.beginPath(); cx.arc(p[0] * P, p[1] * P, TPL.R * P, 0, 7); cx.fill(); }
    if (q.st === 'ganda' && q.f[j] >= MARK) { cx.strokeStyle = '#ba1a1a'; cx.beginPath(); cx.arc(p[0] * P, p[1] * P, TPL.R * P + 2, 0, 7); cx.stroke(); } }));
  r.q.forEach((q, k) => { if (q.st === 'ragu' || q.st === 'ganda' || q.st === 'kosong') { const p = qXY(k, 4); cx.fillStyle = q.st === 'kosong' ? '#7A5C54' : q.st === 'ragu' ? '#C77700' : '#ba1a1a'; cx.fillText(q.st === 'kosong' ? '∅' : '!', p[0] * P + 34, p[1] * P + 8); } });
  const url = cv.toDataURL('image/jpeg', 0.7);
  const sr = $('sr'); sr.hidden = false; S.pending = true;
  sr.innerHTML = `<h3>Hasil Pembacaan</h3><p>${who}</p>${J[S.sid] ? '<p class="wc">Siswa ini sudah punya jawaban tersimpan — menyimpan akan menimpa.</p>' : ''}
    <div class="row" style="margin:8px 0"><span class="tg ok">${ok} terbaca</span><span class="tg wr">${ragu + gd} perlu dicek</span><span class="tg">${ks} kosong</span></div>
    ${r.lowContrast ? '<p class="wc">Foto kurang kontras/terlalu gelap — periksa hasil dengan teliti atau foto ulang dengan cahaya lebih terang.</p>' : ''}
    <img src="${url}" alt="Hasil bacaan LJK" class="ovimg" onclick="zoomOv()"><small class="mu">Ketuk gambar untuk memperbesar. Hijau = terbaca jelas, kuning = ragu, merah = ganda.</small>`;
  S.ovUrl = url; refreshScan(); sr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  toast(ragu + gd ? `Terbaca. ${ragu + gd} nomor perlu dicek.` : 'Terbaca semua. Periksa lalu Simpan.');
}
function zoomOv() { openModal('Hasil Bacaan LJK', `<img src="${S.ovUrl}" alt="Hasil bacaan LJK" style="width:100%;border-radius:8px"><div class="row" style="margin-top:12px"><a class="btn pri" download="hasil-scan-${esc(S.sid)}.jpg" href="${S.ovUrl}"><span class="ms">download</span>Unduh</a><button class="btn gh" onclick="closeModal()">Tutup</button></div>`); }
function openModal(t, h) { $('mT').textContent = t; $('mB').innerHTML = h; $('mdl').hidden = false; }
function closeModal() { $('mdl').hidden = true; $('mB').innerHTML = ''; }


// ── Cetak LJK ──
function ljkDlg() {
  const id = S.cur, u = U(id); if (!u) return toast('Pilih ujian dulu.', 1); const n = KS(id).length, ns = SIS(id).length;
  openModal('Cetak LJK', `<p class="mu">LJK memuat 4 kotak hitam di sudut (penanda scan) dan kotak <b>No. Urut</b> (urutan siswa di daftar kelas). ${n} soal pilihan ganda.</p>
  <label for="pj_m">Jenis cetak</label><select id="pj_m" style="width:100%"><option value="siswa">Per siswa — nama &amp; No. Urut tercetak (${ns} lembar) — disarankan</option><option value="blank">Kosong — siswa menghitamkan No. Urut sendiri</option></select>
  <p class="mu" style="margin-top:8px">Cetak ukuran A4, skala 100%, hitam-putih. Boleh difotokopi.</p><div class="row" style="margin-top:12px"><button class="btn pri" onclick="printLjk()"><span class="ms">print</span>Cetak / Simpan PDF</button><button class="btn gh" onclick="closeModal()">Batal</button></div>`);
}
function printLjk() {
  const id = S.cur, u = U(id), n = KS(id).length, per = $('pj_m').value === 'siswa', base = { judul: u.Nama, mapel: u.Mapel, kelas: u.Kelas, n: n, id: id };
  const pages = per ? SIS(id).map((s, i) => ljkSvg(Object.assign({}, base, { nama: s.Nama, no: i + 1 }))) : [ljkSvg(base)];
  $('ljkPrint').innerHTML = pages.map(p => `<div class="sheet">${p}</div>`).join(''); document.body.classList.add('pj'); closeModal();
  const ps = document.createElement('style'); ps.id = 'pjStyle'; ps.textContent = '@page{size:A4;margin:0}'; document.head.appendChild(ps);   // A4 tanpa margin hanya saat cetak LJK
  window.onafterprint = () => { document.body.classList.remove('pj'); $('ljkPrint').innerHTML = ''; const x = $('pjStyle'); if (x) x.remove(); window.onafterprint = null; };
  setTimeout(() => print(), 150);
}
function acctDlg() {
  openModal('Akun', `<p><b>${esc(S.user.nama)}</b><br><span class="mu">${esc(S.user.peran)}</span></p><h3 style="margin-top:12px">Ganti Password</h3>
  <label for="pw0">Password lama</label><input id="pw0" type="password" autocomplete="current-password" style="width:100%"><label for="pw1">Password baru (min. 8 karakter)</label><input id="pw1" type="password" autocomplete="new-password" style="width:100%">
  <div class="row" style="margin-top:12px"><button class="btn pri" onclick="doPw()">Simpan Password</button><button class="btn gh" onclick="theme()"><span class="ms">dark_mode</span>Mode Gelap</button><button class="btn gh" onclick="closeModal();logout()"><span class="ms">logout</span>Keluar</button></div>`);
}
function doPw() {
  const o = $('pw0').value, n = $('pw1').value; if (n.length < 8) return toast('Password baru minimal 8 karakter.', 1);
  run('changePassword', { old: o, neu: n }, d => { setTok(d.token); closeModal(); toast('Password diperbarui.'); });
}

// ── Pendaftaran, Data Siswa (impor massal), Pengguna ──
function doReg(e) {
  e.preventDefault(); const g = i => $(i).value.trim(), b = $('bReg'); b.disabled = true;
  run('register', { nama: g('rg_n'), username: g('rg_u'), email: g('rg_e'), sekolah: g('rg_s'), peran: $('rg_p').value, password: $('rg_w').value },
    () => { b.disabled = false; $('rg_w').value = ''; show('login'); toast('Pendaftaran terkirim. Tunggu persetujuan admin.'); }, () => b.disabled = false);
  return false;
}
let imp = [];
function rSiswa() {
  const ks = [...new Set(S.siswa.map(s => s.Kelas))].sort();
  $('p-siswa').innerHTML = `<h2>Data Siswa</h2><div class="card"><h3>Impor Massal</h3><p class="mu">Tempel dari Excel atau unggah CSV. Kolom: NIS, Nama, Kelas (kelas boleh kosong jika diisi sebagai kelas bawaan). Maks 500 baris per impor.</p>
  <div class="row" style="margin:8px 0"><input id="im_k" placeholder="Kelas bawaan (mis. VIII-A)" oninput="preSis()"><label class="btn gh" style="margin:0;border:1px solid var(--bd)"><span class="ms">upload_file</span>Unggah CSV<input type="file" accept=".csv,.txt" hidden onchange="fileSis(this)"></label><button class="btn gh" onclick="tplSis()"><span class="ms">download</span>Template</button></div>
  <textarea id="im_t" rows="6" aria-label="Data siswa" placeholder="2024001 [tab] Andi Pratama [tab] VIII-A" style="width:100%;border:1px solid var(--bd);border-radius:8px;padding:8px;background:var(--card)" oninput="preSis()"></textarea><div id="im_p"></div></div>
  <div class="row" style="margin-bottom:8px"><input id="sq" placeholder="Cari nama / NIS…" oninput="drawSis()"><select id="sk" onchange="drawSis()" aria-label="Filter kelas"><option value="">Semua kelas</option>${ks.map(k => `<option>${esc(k)}</option>`).join('')}</select></div>
  <div class="tw"><table><thead><tr><th>NIS</th><th>Nama</th><th>Kelas</th></tr></thead><tbody id="sbd"></tbody></table></div><p id="scnt" class="mu"></p>`; drawSis();
}
function drawSis() {
  const q = $('sq').value.toLowerCase(), k = $('sk').value, r = S.siswa.filter(s => (!k || s.Kelas === k) && (String(s.Nama).toLowerCase().includes(q) || String(s.NIS).includes(q)));
  $('sbd').innerHTML = r.slice(0, 200).map(s => `<tr><td>${esc(s.NIS)}</td><td>${esc(s.Nama)}</td><td>${esc(s.Kelas)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Belum ada siswa.</td></tr>';
  $('scnt').textContent = r.length > 200 ? 'Menampilkan 200 dari ' + r.length + ' siswa.' : r.length + ' siswa.';
}
function parseSis(txt, kd) { const NL = String.fromCharCode(10), CR = String.fromCharCode(13), Q = String.fromCharCode(34), sp = new RegExp('[' + String.fromCharCode(9) + ';,]'); return txt.split(NL).map(l => l.split(CR).join('').trim()).filter(Boolean).map(l => { const c = l.split(sp).map(x => { x = x.trim(); return x.charAt(0) === Q && x.charAt(x.length - 1) === Q ? x.slice(1, -1) : x; }); return { nis: c[0], nama: c[1], kelas: c[2] || kd }; }).filter(r => String(r.nis).toLowerCase() !== 'nis'); }
function preSis() {
  const seen = {}; S.siswa.forEach(s => seen[String(s.NIS)] = 1);
  imp = parseSis($('im_t').value, $('im_k').value.trim()).map(r => { let m = ''; if (!r.nis || !r.nama || !r.kelas) m = 'Data kurang'; else if (seen[r.nis]) m = 'NIS ganda'; else seen[r.nis] = 1; r.m = m; return r; });
  const ok = imp.filter(r => !r.m).length;
  $('im_p').innerHTML = imp.length ? `<p><b>${ok}</b> siap diimpor, <b>${imp.length - ok}</b> dilewati.</p><div class="tw" style="max-height:220px;overflow:auto"><table>${imp.slice(0, 100).map(r => `<tr><td>${esc(r.nis)}</td><td>${esc(r.nama)}</td><td>${esc(r.kelas)}</td><td><span class="tg ${r.m ? 'wr' : 'ok'}">${r.m || 'OK'}</span></td></tr>`).join('')}</table></div><button class="btn pri" style="margin-top:8px" ${ok ? '' : 'disabled'} onclick="doImp()">Impor ${Math.min(ok, 500)} siswa</button>` : '';
}
function doImp() {
  const rows = imp.filter(r => !r.m).slice(0, 500).map(r => ({ nis: r.nis, nama: r.nama, kelas: r.kelas }));
  run('importSiswa', { rows: rows }, d => { S.siswa = S.siswa.concat(d.added); persist(); rSiswa(); toast(d.added.length + ' siswa diimpor' + (d.skipped.length ? ', ' + d.skipped.length + ' dilewati.' : '.')); });
}
function fileSis(i) { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('im_t').value = r.result; preSis(); i.value = ''; }; r.readAsText(f); }
function tplSis() { dl('template-siswa.csv', [['NIS', 'Nama', 'Kelas'], ['2024001', 'Andi Pratama', 'VIII-A']]); }
function rPengguna() {
  $('p-pengguna').innerHTML = '<h2>Pengguna</h2><div id="ul" class="card empty">Memuat…</div>';
  run('listUsers', {}, d => { S.users = d; drawU(); });
}
function drawU() {
  const sa = S.user.peran === 'Superadmin', ops = sa ? ['Guru', 'Operator', 'Admin'] : ['Guru', 'Operator'], o = { Menunggu: 0, Aktif: 1, Nonaktif: 2, Ditolak: 3 };
  const btn = (id, s, t, c) => `<button class="btn ${c}" style="min-height:36px;padding:0 14px" onclick="setU('${id}','${s}')">${t}</button>`;
  $('ul').className = 'card'; $('ul').innerHTML = `<div class="tw"><table><tr><th>Pengguna</th><th>Peran</th><th>Status</th><th>Aksi</th></tr>${S.users.slice().sort((a, b) => o[a.status] - o[b.status]).map(u => {
    const lock = u.peran === 'Superadmin' || (!sa && u.peran === 'Admin');
    return `<tr><td><b>${esc(u.nama)}</b><br><small class="mu">@${esc(u.username)} • ${esc(u.sekolah || '-')}</small></td><td>${lock ? esc(u.peran) : `<select id="pr_${esc(u.id)}" aria-label="Peran">${ops.map(p => `<option${p === u.peran ? ' selected' : ''}>${p}</option>`).join('')}</select>`}</td>
    <td><span class="tg ${u.status === 'Aktif' ? 'ok' : u.status === 'Menunggu' ? 'wr' : ''}">${esc(u.status)}</span></td><td>${lock ? '' : u.status === 'Menunggu' ? btn(u.id, 'Aktif', 'Setujui', 'pri') + ' ' + btn(u.id, 'Ditolak', 'Tolak', 'gh') : u.status === 'Aktif' ? btn(u.id, 'Nonaktif', 'Nonaktifkan', 'gh') : btn(u.id, 'Aktif', 'Aktifkan', 'pri')}</td></tr>`; }).join('')}</table></div>`;
}
function setU(id, status) {
  const p = $('pr_' + id); run('setUser', { id: id, status: status, peran: p ? p.value : '' }, () => { const x = S.users.find(y => y.id === id); x.status = status; if (p) x.peran = p.value; drawU(); toast('Akun diperbarui.'); });
}

// ── Rekap Nilai ──
function rRekap() {
  const el = $('p-rekap'); if (!S.cur) return el.innerHTML = empty('Belum ada ujian.');
  el.innerHTML = `<h2>Rekap Nilai</h2><div class="row" style="margin-bottom:12px"><input id="rq" placeholder="Cari nama siswa…" value="${esc(S.q)}" oninput="deb(this.value)" aria-label="Cari siswa"><select id="rf" onchange="S.fs=this.value;drawRekap()" aria-label="Filter status"><option value="">Semua status</option><option value="T">Tuntas</option><option value="R">Remedial</option><option value="B">Belum</option></select></div>
  <div class="tw"><table><thead><tr><th>Siswa</th><th>Benar</th><th>Nilai</th><th>Status</th></tr></thead><tbody id="rb"></tbody></table></div>`;
  $('rf').value = S.fs; drawRekap();
}
let dt; function deb(v) { clearTimeout(dt); dt = setTimeout(() => { S.q = v; drawRekap(); }, 200); }
function drawRekap() {
  const q = S.q.toLowerCase(), f = S.fs, r = rows(S.cur).filter(x => x.s.Nama.toLowerCase().includes(q) && (!f || (f === 'B' ? !x.r : f === 'T' ? x.ok : x.r && !x.ok))).sort((a, b) => (b.r ? b.r.n : -1) - (a.r ? a.r.n : -1));
  $('rb').innerHTML = r.map(x => `<tr><td>${esc(x.s.Nama)}<br><small class="mu">${esc(x.s.NIS)}</small></td><td>${x.r ? x.r.b : '–'}</td><td><b>${x.r ? x.r.n : '–'}</b></td><td><span class="tg ${x.r ? (x.ok ? 'ok' : 'wr') : ''}">${x.r ? (x.ok ? 'Tuntas' : 'Remedial') : 'Belum'}</span></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Tidak ada data.</td></tr>';
}

// ── Analisis Butir Soal ──
function rAnalisis() {
  const el = $('p-analisis'), a = S.an[S.cur]; if (!a || !a.n) return el.innerHTML = '<h2>Analisis Butir Soal</h2>' + empty('Belum ada jawaban siswa untuk dianalisis.');
  const c = k => a.items.filter(i => i.kat === k).length;
  el.innerHTML = `<h2>Analisis Butir Soal</h2><div class="kpis"><div class="card kpi"><span class="mu">Diterima</span><b>${c('Diterima')}</b></div><div class="card kpi"><span class="mu">Direvisi</span><b>${c('Direvisi')}</b></div><div class="card kpi"><span class="mu">Ditolak</span><b>${c('Ditolak')}</b></div><div class="card kpi"><span class="mu">Reliabilitas (KR-20)</span><b>${a.rel}</b></div></div>
  <div class="two"><div class="tw"><table><tr><th>No</th><th>Kunci</th><th>Kesukaran (p)</th><th>Daya Pembeda (D)</th><th>Status</th></tr>${a.items.map(i => `<tr class="cl" onclick="detail(${i.no})"><td>${i.no}</td><td><b>${i.kunci}</b></td><td>${i.p} <small class="mu">${i.p < .3 ? 'Sukar' : i.p > .7 ? 'Mudah' : 'Sedang'}</small></td><td>${i.d}</td><td><span class="tg ${i.kat === 'Diterima' ? 'ok' : i.kat === 'Direvisi' ? 'wr' : ''}">${i.kat}</span></td></tr>`).join('')}</table></div>
  <div class="card" id="det"><h3>Sebaran Pengecoh</h3><p class="mu">Ketuk satu baris soal.</p></div></div>`;
}
function detail(no) {
  const i = S.an[S.cur].items.find(x => x.no === no), tot = Math.max(1, S.an[S.cur].n);
  $('det').innerHTML = `<h3>Soal ${no} — kunci ${i.kunci}</h3>` + LET.map(l => `<div class="pp"><span>${l}</span><div><i class="${l === i.kunci ? 'k' : ''}" style="width:${i.cnt[l] / tot * 100}%"></i></div><small>${i.cnt[l]}</small></div>`).join('')
    + `<p class="mu">${i.kat === 'Diterima' ? 'Butir baik.' : i.d < .2 ? 'Daya pembeda rendah: periksa kunci atau redaksi soal.' : 'Tingkat kesukaran ekstrem: pertimbangkan revisi.'}</p>`;
}

// ── Laporan ──
function rLaporan() {
  $('p-laporan').innerHTML = `<h2>Laporan</h2><div class="card"><div class="row"><button class="btn pri" onclick="csvRekap()"><span class="ms">download</span>Rekap Nilai (CSV/Excel)</button><button class="btn pri" onclick="csvAn()"><span class="ms">download</span>Analisis Soal (CSV/Excel)</button><button class="btn am" onclick="print()"><span class="ms">picture_as_pdf</span>Cetak / Simpan PDF</button></div></div>
  <h3>Pratinjau Rekap</h3><div class="tw"><table><tr><th>Siswa</th><th>Nilai</th><th>Status</th></tr>${rows(S.cur).map(x => `<tr><td>${esc(x.s.Nama)}</td><td>${x.r ? x.r.n : '–'}</td><td>${x.r ? (x.ok ? 'Tuntas' : 'Remedial') : 'Belum'}</td></tr>`).join('')}</table></div>`;
}
function dl(n, r) { const Q = String.fromCharCode(34), NL = String.fromCharCode(10), b = new Blob([String.fromCharCode(65279) + r.map(x => x.map(c => Q + String(c).split(Q).join(Q + Q) + Q).join(',')).join(NL)], { type: 'text/csv' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = n; document.body.appendChild(a); a.click(); a.remove(); }
function csvRekap() { dl('rekap-nilai.csv', [['NIS', 'Nama', 'Benar', 'Nilai', 'Status']].concat(rows(S.cur).map(x => [x.s.NIS, x.s.Nama, x.r ? x.r.b : '', x.r ? x.r.n : '', x.r ? (x.ok ? 'Tuntas' : 'Remedial') : 'Belum']))); }
function csvAn() { const a = S.an[S.cur]; if (!a || !a.n) return toast('Belum ada data analisis.', 1); dl('analisis-butir.csv', [['No', 'Kunci', 'P', 'D', 'Status']].concat(a.items.map(i => [i.no, i.kunci, i.p, i.d, i.kat]))); }
function pingSys() {
  const b = $('sysBar'); if (!API_OK) { b.textContent = 'API_URL belum diisi: edit js/config.js dengan URL Web App (/exec) dari Apps Script.'; b.hidden = false; return; }
  warmUp().then(d => { if (d && d.ready === false) { b.textContent = d.pesan; b.hidden = false; } });   // sekaligus memanaskan server
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.t) refresh(false); });   // segarkan setelah kembali dari scanner / tab lain
// ── Init: tema → sesi tersimpan → tampil langsung dari cache lokal ──
(function () {
  try { document.documentElement.dataset.theme = localStorage.getItem('sab_th') || 'light'; S.t = localStorage.getItem('sab_t') || null; Auth.token = S.t || ''; } catch (e) {}
  const hp = (location.hash.match(/^#\/(\w+)/) || [])[1]; if (hp && NAV.some(n => n[0] === hp)) S.page = hp;
  const c = (() => { try { return JSON.parse(localStorage.getItem(LS_C)); } catch (e) { return null; } })();
  if (S.t && c && c.user) { Object.assign(S, { h: c.h || '', user: c.user, ujian: c.ujian, siswa: c.siswa, kunci: c.kunci, jaw: c.jaw, an: c.an, cur: c.cur }); boot(true); }
  else if (S.t) { S.user = { nama: '…', peran: 'Guru' }; boot(false); }
})();
pingSys();
