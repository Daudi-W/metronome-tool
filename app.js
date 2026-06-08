'use strict';

// ---------- 取得元素 ----------
const $ = id => document.getElementById(id);
const video = $('video'), overlay = $('overlay'), octx = overlay.getContext('2d');

// ---------- 狀態 ----------
const S = {
  bpm: 120,
  downbeat: null,      // 第1拍在影片時間軸的秒數(任一個「1」)
  beatsPerBar: 4,
  dotSize: 34, dotY: 85,
  colNormal: '#a8e84f', colAccent: '#ffffff',
  showDim: true,
  clickOn: true, accentSound: true,
  clickVol: 0.7, songVol: 1.0,
};
const period = () => 60 / S.bpm;
const pmod = (n, m) => ((n % m) + m) % m;

// ---------- Web Audio ----------
let ac, songGain, clickGain, mediaSrc, exportDest = null;
function initAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  mediaSrc = ac.createMediaElementSource(video);
  songGain = ac.createGain(); songGain.gain.value = S.songVol;
  clickGain = ac.createGain(); clickGain.gain.value = S.clickVol;
  mediaSrc.connect(songGain).connect(ac.destination);
  clickGain.connect(ac.destination);
}
// 合成 click：短促的衰減正弦(重拍頻率高、較大聲)
function playClick(when, accent) {
  if (!S.clickOn) return;
  const osc = ac.createOscillator(), g = ac.createGain();
  const f = accent ? 1600 : 1000, peak = accent ? 1.0 : 0.6;
  osc.type = 'sine'; osc.frequency.value = f;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
  osc.connect(g).connect(clickGain);
  if (exportDest) g.connect(exportDest);   // 錄製時也送進輸出
  osc.start(when); osc.stop(when + 0.1);
}

// ---------- 排程器(lookahead,與影片時間同步) ----------
let nextBeatVT = 0;          // 下一拍的「影片時間」
const LOOKAHEAD = 0.12;      // 提前排程(影片秒)
let schedTimer = null;
function resetScheduler() {
  if (S.downbeat == null) return;
  const p = period(), t = video.currentTime;
  const k = Math.ceil((t - S.downbeat) / p - 1e-6);
  nextBeatVT = S.downbeat + k * p;
}
function scheduler() {
  if (S.downbeat == null || video.paused) return;
  const p = period(), r = video.playbackRate || 1;
  while (nextBeatVT < video.currentTime + LOOKAHEAD) {
    const idx = Math.round((nextBeatVT - S.downbeat) / p);
    const accent = pmod(idx, S.beatsPerBar) === 0;
    const when = ac.currentTime + (nextBeatVT - video.currentTime) / r;
    playClick(Math.max(when, ac.currentTime), accent && S.accentSound);
    nextBeatVT += p;
  }
}
function startScheduler() {
  stopScheduler(); resetScheduler();
  schedTimer = setInterval(scheduler, 25);
}
function stopScheduler() { if (schedTimer) clearInterval(schedTimer); schedTimer = null; }

// ---------- 畫點 ----------
function litIndex(t) {
  if (S.downbeat == null) return -1;
  const idx = Math.floor((t - S.downbeat) / period());
  return pmod(idx, S.beatsPerBar);
}
function drawDots(ctx, W, H, lit) {
  ctx.clearRect(0, 0, W, H);
  const n = S.beatsPerBar;
  const r = S.dotSize / 720 * H;                 // 依高度等比
  const gap = Math.min(W / (n + 1), r * 4.2);
  const totalW = gap * (n - 1);
  const x0 = W / 2 - totalW / 2;
  const y = H * S.dotY / 100;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * gap;
    const isLit = i === lit;
    const isAccent = i === 0;
    if (!isLit) {
      if (!S.showDim) continue;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#5f7837';
      circle(ctx, x, y, r * 0.78);
      ctx.globalAlpha = 1;
    } else {
      const col = isAccent ? S.colAccent : S.colNormal;
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = r * 1.1;
      ctx.fillStyle = col;
      circle(ctx, x, y, r * (isAccent ? 1.18 : 1));
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }

// ---------- 主迴圈(畫面) ----------
function fmt(t) { t = Math.max(0, t | 0); return (t / 60 | 0) + ':' + String(t % 60).padStart(2, '0'); }
function loop() {
  if (video.readyState >= 2) {
    drawDots(octx, overlay.width, overlay.height, litIndex(video.currentTime));
    $('timeLabel').textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
    const li = litIndex(video.currentTime);
    if (li >= 0) {
      const bar = Math.floor((video.currentTime - S.downbeat) / period() / S.beatsPerBar);
      $('beatReadout').textContent = `拍：${li + 1} / ${S.beatsPerBar}　小節：${bar + 1}`;
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- 載入檔案 ----------
let lastFile = null;
$('fileInput').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  lastFile = f; _analysis = null;   // 換檔清掉分析快取
  video.src = URL.createObjectURL(f);
  video.addEventListener('loadedmetadata', () => {
    overlay.width = video.videoWidth || 1280;
    overlay.height = video.videoHeight || 720;
    ['stage', 'step-tempo', 'step-style', 'step-export'].forEach(id => $(id).classList.remove('hidden'));
  }, { once: true });
});

// ---------- 播放 ----------
$('playBtn').addEventListener('click', async () => {
  initAudio(); if (ac.state === 'suspended') await ac.resume();
  if (video.paused) { await video.play(); } else { video.pause(); }
});
video.addEventListener('play', () => { $('playBtn').textContent = '⏸ 暫停'; startScheduler(); });
video.addEventListener('pause', () => { $('playBtn').textContent = '▶︎ 播放'; stopScheduler(); });
video.addEventListener('seeked', () => { if (!video.paused) startScheduler(); });
$('rate').addEventListener('change', e => { video.playbackRate = parseFloat(e.target.value); if (!video.paused) startScheduler(); });

// ---------- 敲拍抓 BPM ----------
let taps = [];
$('tapTempoBtn').addEventListener('click', () => {
  flash('tapTempoBtn');
  const now = performance.now() / 1000;
  taps.push(now); taps = taps.filter(t => now - t < 3);   // 只看近3秒
  if (taps.length >= 2) {
    const intervals = []; for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1]);
    const avg = intervals.reduce((a, b) => a + b) / intervals.length;
    setBpm(60 / avg);
  }
});

// ---------- 音訊分析(解碼一次,給 BPM + 鼓點 onset) ----------
let _analysis = null;
async function analyzeAudio() {
  if (_analysis) return _analysis;
  const buf = await lastFile.arrayBuffer();
  const tmp = new (window.AudioContext || window.webkitAudioContext)();
  const audio = await tmp.decodeAudioData(buf.slice(0)); tmp.close();
  const oac = new OfflineAudioContext(1, audio.length, audio.sampleRate);
  const src = oac.createBufferSource(); src.buffer = audio;
  const lp = oac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150;
  const hp = oac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
  src.connect(lp).connect(hp).connect(oac.destination); src.start(0);
  const data = (await oac.startRendering()).getChannelData(0);
  const sr = audio.sampleRate;
  const { bpm, firstPeak } = analyzeTempo(data, sr);
  _analysis = { bpm, firstPeak, onsets: detectOnsets(data, sr), sr };
  return _analysis;
}
// 細緻鼓點 onset(5ms 包絡 + 不應期)
function detectOnsets(data, sr) {
  const hop = Math.floor(sr * 0.005), env = [];
  for (let i = 0; i < data.length; i += hop) { let m = 0; for (let j = i; j < i + hop && j < data.length; j++) { const a = Math.abs(data[j]); if (a > m) m = a; } env.push(m); }
  let mx = 0; for (const v of env) if (v > mx) mx = v; const thr = mx * 0.25;
  const on = []; let last = -1e9;
  for (let i = 1; i < env.length - 1; i++) { const t = i * 0.005; if (env[i] > thr && env[i] >= env[i - 1] && env[i] > env[i + 1] && t - last > 0.12) { on.push(t); last = t; } }
  return on;
}
// onset 對某 period 的「鎖相度」R(0~1,越高代表這速度越貼合全曲)
function lockScore(p) {
  if (!_analysis || !_analysis.onsets.length) return 0;
  let s = 0, c = 0, n = _analysis.onsets.length;
  for (const t of _analysis.onsets) { const a = 2 * Math.PI * (t / p); s += Math.sin(a); c += Math.cos(a); }
  return Math.sqrt(s * s + c * c) / n;
}
// 精修 BPM:在偵測值的 1×/2×/½× 三個窄帶各找 lockScore 峰,取最高,四捨五入整數
// (錄音室通常整數;鎖相峰會落在精確整數如 152.00 → 消除估計誤差造成的假漂移)
function refineBpm(rough) {
  const centers = [rough, rough * 2, rough / 2].filter(b => b >= 50 && b <= 210);
  let best = rough, bestR = -1;
  for (const center of centers) {
    for (let b = center - 1.5; b <= center + 1.5; b += 0.05) {
      if (b < 40 || b > 300) continue;
      const R = lockScore(60 / b);
      if (R > bestR) { bestR = R; best = b; }
    }
  }
  return Math.round(best);   // 一律取整數(錄音室假設);不穩的歌由漂移警示把關,使用者可 ÷2/×2 或手動調
}
// 全曲格線相位(onset 對 period 取圓平均,離群搶拍不影響多數)
function gridPhase(p) {
  if (!_analysis || !_analysis.onsets.length) return null;
  let s = 0, c = 0; for (const t of _analysis.onsets) { const a = 2 * Math.PI * ((t % p) / p); s += Math.sin(a); c += Math.cos(a); }
  let phi = Math.atan2(s, c) * p / (2 * Math.PI); if (phi < 0) phi += p; return phi;
}
// 把時間吸附到「全曲擬合的穩定格線」(相位由 tap 決定哪條線)
function snapToGrid(t) {
  const p = period(), phi = gridPhase(p);
  if (phi == null) return null;
  return phi + Math.round((t - phi) / p) * p;
}
// 估計固定格線到歌尾的累積漂移(秒)
function driftEstimate() {
  if (!_analysis || !_analysis.onsets.length) return 0;
  const p = period(), phi = gridPhase(p), pts = [];
  for (const t of _analysis.onsets) { let r = ((t - phi) % p + p) % p; if (r > p / 2) r -= p; if (Math.abs(r) < p * 0.25) pts.push([t, r]); }
  if (pts.length < 8) return 0;
  let n = pts.length, st = 0, sr = 0, stt = 0, srt = 0;
  for (const [t, r] of pts) { st += t; sr += r; stt += t * t; srt += t * r; }
  const b = (n * srt - st * sr) / (n * stt - st * st);
  return Math.abs(b) * (video.duration || 0);
}
function showDrift() {
  const el = $('driftStatus'); if (!el || !_analysis) return;
  const d = driftEstimate();
  el.textContent = d > 0.1
    ? `⚠️ 這首速度會漂移,固定節拍器到歌尾約差 ${Math.round(d * 1000)}ms — 之後可用多錨點對齊`
    : `✓ 速度穩定(預估整首漂移約 ${Math.round(d * 1000)}ms,固定節拍器對得住)`;
}

// ---------- 自動偵測 BPM ----------
$('autoBpmBtn').addEventListener('click', autoDetect);
async function autoDetect() {
  if (!lastFile) { alert('請先載入歌曲'); return; }
  const status = $('detectStatus'); status.textContent = '分析中…';
  try {
    const a = await analyzeAudio();
    if (!a.bpm) { status.textContent = '偵測失敗,請改用敲拍'; return; }
    setBpm(refineBpm(a.bpm));   // 精修到最鎖相的整數(錄音室通常整數)
    if (S.downbeat == null && a.firstPeak != null) { const s = snapToGrid(a.firstPeak); S.downbeat = s != null ? s : a.firstPeak; updateDownbeatLabel(); resetScheduler(); }
    showDrift();
    status.textContent = `偵測:${S.bpm} BPM(已取整數;太快/慢按 ÷2、×2,非整數可手動微調);第1拍播放後點「標記」自動吸附`;
  } catch (err) { status.textContent = '無法解碼此檔的音訊:' + err.message; }
}
// 峰值間隔直方圖估 BPM(折疊到 70–180)
function analyzeTempo(data, sr) {
  const part = Math.floor(sr * 0.25), parts = Math.floor(data.length / part), peaks = [];
  for (let i = 0; i < parts; i++) {
    let max = 0, pos = 0;
    for (let j = i * part; j < (i + 1) * part; j++) { const v = Math.abs(data[j]); if (v > max) { max = v; pos = j; } }
    peaks.push({ pos, vol: max });
  }
  const byVol = peaks.slice().sort((a, b) => b.vol - a.vol);
  const top = byVol.slice(0, Math.max(8, Math.floor(peaks.length * 0.4))).sort((a, b) => a.pos - b.pos);
  const groups = [];
  top.forEach((peak, idx) => {
    for (let i = 1; i < 10 && idx + i < top.length; i++) {
      let bpm = 60 / ((top[idx + i].pos - peak.pos) / sr);
      if (!isFinite(bpm) || bpm <= 0) continue;
      while (bpm < 70) bpm *= 2; while (bpm > 180) bpm /= 2;
      const g = groups.find(g => Math.abs(g.bpm - bpm) < 0.6);
      if (g) { g.count++; g.bpm = (g.bpm * (g.count - 1) + bpm) / g.count; } else groups.push({ bpm, count: 1 });
    }
  });
  groups.sort((a, b) => b.count - a.count);
  if (!groups.length) return { bpm: null };
  const bpm = Math.round(groups[0].bpm * 100) / 100;
  return { bpm, firstPeak: top.length ? top[0].pos / sr : null };
}

// ---------- 標記第1拍(自動吸附到拍) ----------
$('markDownbeatBtn').addEventListener('click', async () => {
  flash('markDownbeatBtn');
  const t = video.currentTime;
  if ($('snapBeat').checked && lastFile) {
    try { await analyzeAudio(); const s = snapToGrid(t); if (s != null) { S.downbeat = s; updateDownbeatLabel(Math.round((s - t) * 1000)); resetScheduler(); showDrift(); return; } } catch (e) { }
  }
  S.downbeat = t; updateDownbeatLabel(); resetScheduler();
});
$('snapNowBtn').addEventListener('click', async () => {
  if (S.downbeat == null) { alert('請先標記第1拍'); return; }
  if (!lastFile) return;
  try { await analyzeAudio(); const s = snapToGrid(S.downbeat); if (s != null) { const corr = Math.round((s - S.downbeat) * 1000); S.downbeat = s; updateDownbeatLabel(corr); resetScheduler(); showDrift(); } } catch (e) { }
});
function updateDownbeatLabel(corr) {
  let s = S.downbeat == null ? '第1拍：未設定' : '第1拍：' + S.downbeat.toFixed(3) + 's';
  if (corr != null && S.downbeat != null) s += `(已吸附,修正 ${corr >= 0 ? '+' : ''}${corr}ms)`;
  $('downbeatLabel').textContent = s;
}

// ---------- BPM 控制 ----------
function setBpm(v) {
  S.bpm = Math.min(300, Math.max(20, Math.round(v * 100) / 100));
  $('bpmInput').value = S.bpm; resetScheduler();
}
$('bpmInput').addEventListener('input', e => { S.bpm = parseFloat(e.target.value) || S.bpm; resetScheduler(); });
document.querySelectorAll('[data-bpm]').forEach(b =>
  b.addEventListener('click', () => setBpm(S.bpm + parseFloat(b.dataset.bpm))));
$('halveBpm').addEventListener('click', () => setBpm(S.bpm / 2));
$('doubleBpm').addEventListener('click', () => setBpm(S.bpm * 2));
document.querySelectorAll('[data-nudge]').forEach(b =>
  b.addEventListener('click', () => { if (S.downbeat != null) { S.downbeat += parseFloat(b.dataset.nudge); updateDownbeatLabel(); resetScheduler(); } }));

// ---------- 外觀/聲音綁定 ----------
const bind = (id, key, fn = v => v) => $(id).addEventListener('input', e =>
  S[key] = fn(e.target.type === 'checkbox' ? e.target.checked : e.target.value));
bind('beatsPerBar', 'beatsPerBar', v => Math.max(1, parseInt(v) || 4));
bind('dotSize', 'dotSize', v => +v);
bind('dotY', 'dotY', v => +v);
bind('colNormal', 'colNormal'); bind('colAccent', 'colAccent');
bind('showDim', 'showDim'); bind('accentSound', 'accentSound'); bind('clickOn', 'clickOn');
$('clickVol').addEventListener('input', e => { S.clickVol = e.target.value / 100; if (clickGain) clickGain.gain.value = S.clickVol; });
$('songVol').addEventListener('input', e => { S.songVol = e.target.value / 100; if (songGain) songGain.gain.value = S.songVol; });
$('beatsPerBar').addEventListener('input', resetScheduler);

function flash(id) { const el = $(id); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 90); }

// ========== 直接輸出 MP4(ffmpeg.wasm,非錄製) ==========
let ffmpegInst = null, ffUtil = null;
async function getUtil() { if (!ffUtil) ffUtil = await import('./vendor/util/index.js'); return ffUtil; }
async function loadFFmpeg(onLog) {
  if (ffmpegInst) return ffmpegInst;
  const { FFmpeg } = await import('./vendor/ffmpeg/index.js');   // 本地同源,Worker 不被擋
  const abs = p => new URL(p, location.href).href;
  const ff = new FFmpeg();
  window.__ffLog = [];
  ff.on('log', ({ message }) => { window.__ffLog.push(message); if (window.__ffLog.length > 60) window.__ffLog.shift(); });
  ff.on('progress', ({ progress }) => onLog && onLog(progress));
  await ff.load({
    coreURL: abs('vendor/core/ffmpeg-core.js'),
    wasmURL: abs('vendor/core/ffmpeg-core.wasm'),
  });
  ffmpegInst = ff; return ff;
}

// 合成 click 軌 → 16-bit PCM WAV (Uint8Array)
function synthClickWav(dur, sr = 44100) {
  const N = Math.ceil(dur * sr) + sr, buf = new Float32Array(N);
  const p = period(), bpb = S.beatsPerBar, t0 = S.downbeat;
  const add = (tc, accent) => {
    if (tc < -0.001 || tc >= dur) return;
    const f = accent ? 1600 : 1000, peak = accent ? 1.0 : 0.6, len = Math.floor(0.09 * sr), s = Math.floor(tc * sr);
    for (let j = 0; j < len && s + j < N; j++) { const tt = j / sr, env = Math.exp(-tt * 38); buf[s + j] += Math.sin(2 * Math.PI * f * tt) * env * peak; }
  };
  if (S.clickOn) { let n = Math.floor((0 - t0) / p) - 1; for (; ;) { const tc = t0 + n * p; if (tc >= dur) break; add(tc, pmod(n, bpb) === 0 && S.accentSound); n++; } }
  // WAV header + PCM
  const bytes = N * 2, ab = new ArrayBuffer(44 + bytes), dv = new DataView(ab);
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); dv.setUint32(4, 36 + bytes, true); wstr(8, 'WAVE'); wstr(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  wstr(36, 'data'); dv.setUint32(40, bytes, true);
  for (let i = 0; i < N; i++) { let v = Math.max(-1, Math.min(1, buf[i])); dv.setInt16(44 + i * 2, v * 32767, true); }
  return new Uint8Array(ab);
}

// 產生圓點 PNG (Uint8Array) + 尺寸
function makeDotPNG(r, fill, glow) {
  const s = Math.ceil(2 * (r + glow) + 8), c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d'), m = s / 2;
  if (glow > 0) { x.shadowColor = fill; x.shadowBlur = glow; }
  x.fillStyle = fill; x.beginPath(); x.arc(m, m, r, 0, 7); x.fill();
  return new Promise(res => c.toBlob(b => b.arrayBuffer().then(a => res({ data: new Uint8Array(a), size: s })), 'image/png'));
}

$('exportMp4Btn').addEventListener('click', exportMp4);
async function exportMp4() {
  if (S.downbeat == null) { alert('請先標記第1拍'); return; }
  if (!lastFile) { alert('請先載入歌曲'); return; }
  const btn = $('exportMp4Btn'), status = $('exportStatus'), prog = $('exportProgress'), bar = $('exportBar');
  btn.disabled = true; prog.classList.remove('hidden'); bar.style.width = '0%';
  try {
    status.textContent = '載入 ffmpeg 引擎(首次約 30MB)…';
    const ff = await loadFFmpeg(pr => { bar.style.width = Math.round(pr * 100) + '%'; status.textContent = '合成中… ' + Math.round(pr * 100) + '%'; });
    const { fetchFile } = await getUtil();

    // 輸出尺寸
    const outH = parseInt($('exportQuality').value);
    const H = Math.min(video.videoHeight, outH);
    const W = Math.round(video.videoWidth * H / video.videoHeight / 2) * 2;
    const dur = video.duration;

    // 幾何
    const n = S.beatsPerBar, r = S.dotSize / 720 * H;
    const gap = Math.min(W / (n + 1), r * 4.2), x0 = W / 2 - gap * (n - 1) / 2, yc = H * S.dotY / 100;
    const T0 = S.downbeat, QP = period(), BAR = period() * n;

    // 素材
    status.textContent = '準備素材…';
    const dim = await makeDotPNG(r * 0.78, 'rgba(95,120,55,0.5)', 0);
    const lit = await makeDotPNG(r, S.colNormal, r * 1.1);
    const acc = await makeDotPNG(r * 1.18, S.colAccent, r * 1.1);
    await ff.writeFile('in', await fetchFile(lastFile));
    await ff.writeFile('click.wav', synthClickWav(dur));
    await ff.writeFile('dim.png', dim.data);
    await ff.writeFile('lit.png', lit.data);
    await ff.writeFile('acc.png', acc.data);

    // filter_complex
    const px = i => Math.round(x0 + i * gap), pos = (cx, sz) => `${Math.round(cx - sz / 2)}:${Math.round(yc - sz / 2)}`;
    let fc = `[0:v]scale=${W}:${H}[s]`;
    let cur = 's';
    for (let i = 0; i < n; i++) { const o = `d${i}`; fc += `;[${cur}][2:v]overlay=${pos(px(i), dim.size)}[${o}]`; cur = o; }
    // 大偏移(BAR 的整數倍)讓 mod 在 t<第1拍 時仍為正,使節拍閃爍「整首」都有,不只從標記點開始
    const OFF = BAR * 100000;
    for (let i = 0; i < n; i++) {
      const src = i === 0 ? '4:v' : '3:v', sz = i === 0 ? acc.size : lit.size, o = `b${i}`;
      fc += `;[${cur}][${src}]overlay=${pos(px(i), sz)}:enable='eq(floor(mod(t-${T0}+${OFF}\\,${BAR})/${QP})\\,${i})'[${o}]`;
      cur = o;
    }
    fc += `;[1:a]volume=${S.clickVol}[c];[0:a]volume=${S.songVol}[a0];[a0][c]amix=inputs=2:duration=first:normalize=0[a]`;

    status.textContent = '開始合成(這步最久,請稍候)…';
    await ff.exec([
      '-i', 'in', '-i', 'click.wav', '-loop', '1', '-i', 'dim.png', '-loop', '1', '-i', 'lit.png', '-loop', '1', '-i', 'acc.png',
      '-filter_complex', fc, '-map', `[${cur}]`, '-map', '[a]',
      '-t', String(dur), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-shortest', 'out.mp4'
    ]);

    const out = await ff.readFile('out.mp4');
    if (!out || out.length === 0) throw new Error('影片解碼失敗,通常是 AV1 / HEVC 編碼(瀏覽器版只支援 H.264 影片)。請先把影片轉成 H.264,或改用下方「錄製備援」');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out.buffer], { type: 'video/mp4' }));
    a.download = '節拍器版.mp4'; a.click();
    bar.style.width = '100%'; status.textContent = '完成!已下載 mp4 🎉';
    try { await ff.deleteFile('in'); await ff.deleteFile('out.mp4'); } catch (e) { }
  } catch (err) {
    console.error(err); status.textContent = '失敗:' + (err && err.message || err) + '(檔案太大時可改 720p,或用下方錄製版)';
  } finally { btn.disabled = false; }
}

// ---------- 只下載聲音 MP3 ----------
function downloadBlob(u8, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([u8.buffer], { type })); a.download = name; a.click();
}
$('exportMp3Btn').addEventListener('click', exportAudio);
async function exportAudio() {
  if (S.downbeat == null) { alert('請先標記第1拍'); return; }
  if (!lastFile) { alert('請先載入歌曲'); return; }
  const btn = $('exportMp3Btn'), status = $('exportStatus'), prog = $('exportProgress'), bar = $('exportBar');
  btn.disabled = true; prog.classList.remove('hidden'); bar.style.width = '0%';
  try {
    status.textContent = '載入 ffmpeg 引擎…';
    const ff = await loadFFmpeg(pr => { bar.style.width = Math.round(pr * 100) + '%'; status.textContent = '合成中… ' + Math.round(pr * 100) + '%'; });
    const { fetchFile } = await getUtil();
    const dur = video.duration;
    await ff.writeFile('in', await fetchFile(lastFile));
    await ff.writeFile('click.wav', synthClickWav(dur));
    const fc = `[1:a]volume=${S.clickVol}[c];[0:a]volume=${S.songVol}[a0];[a0][c]amix=inputs=2:duration=first:normalize=0[a]`;
    status.textContent = '合成聲音中…';
    await ff.exec(['-i', 'in', '-i', 'click.wav', '-filter_complex', fc, '-map', '[a]', '-vn', '-c:a', 'libmp3lame', '-q:a', '2', '-t', String(dur), 'out.mp3']);
    let out = await ff.readFile('out.mp3');
    if (out && out.length) { downloadBlob(out, '節拍器版.mp3', 'audio/mpeg'); status.textContent = '完成!已下載 MP3 🎉'; }
    else { // 後援:此 core 無 libmp3lame → 輸出 m4a(aac)
      await ff.exec(['-i', 'in', '-i', 'click.wav', '-filter_complex', fc, '-map', '[a]', '-vn', '-c:a', 'aac', '-b:a', '192k', '-t', String(dur), 'out.m4a']);
      out = await ff.readFile('out.m4a');
      if (!out || !out.length) throw new Error('音訊合成失敗');
      downloadBlob(out, '節拍器版.m4a', 'audio/mp4'); status.textContent = '完成!已下載 m4a(同等音質)🎉';
    }
    bar.style.width = '100%';
  } catch (err) { console.error(err); status.textContent = '失敗:' + (err && err.message || err); }
  finally { btn.disabled = false; }
}

// ---------- 匯出(即時錄製) ----------
$('exportBtn').addEventListener('click', exportVideo);
async function exportVideo() {
  if (S.downbeat == null) { alert('請先標記第1拍'); return; }
  initAudio(); if (ac.state === 'suspended') await ac.resume();
  const btn = $('exportBtn'), status = $('exportStatus');
  btn.disabled = true;

  // 錄製用畫布:影片 + 點
  const rc = document.createElement('canvas');
  rc.width = video.videoWidth; rc.height = video.videoHeight;
  const rctx = rc.getContext('2d');

  // 音訊輸出節點
  exportDest = ac.createMediaStreamDestination();
  songGain.connect(exportDest);

  const stream = rc.captureStream(30);
  exportDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    songGain.disconnect(exportDest); exportDest = null;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '節拍器版.webm'; a.click();
    status.textContent = '完成!已下載'; btn.disabled = false;
  };

  // 從頭播一遍
  video.pause(); video.currentTime = 0; video.playbackRate = 1;
  await new Promise(r => video.addEventListener('seeked', r, { once: true }));
  rec.start(); await video.play(); startScheduler();
  let drawing = true;
  (function drawRec() {
    if (!drawing) return;
    rctx.drawImage(video, 0, 0, rc.width, rc.height);
    drawDots(rctx, rc.width, rc.height, litIndex(video.currentTime));
    requestAnimationFrame(drawRec);
  })();
  const tick = setInterval(() => { status.textContent = '錄製中… ' + fmt(video.currentTime) + ' / ' + fmt(video.duration); }, 300);
  video.addEventListener('ended', () => { drawing = false; clearInterval(tick); stopScheduler(); rec.stop(); }, { once: true });
}
