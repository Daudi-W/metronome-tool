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
$('fileInput').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
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

// ---------- 標記第1拍 ----------
$('markDownbeatBtn').addEventListener('click', () => {
  flash('markDownbeatBtn');
  S.downbeat = video.currentTime;
  updateDownbeatLabel(); resetScheduler();
});
function updateDownbeatLabel() {
  $('downbeatLabel').textContent = S.downbeat == null ? '第1拍：未設定'
    : '第1拍：' + S.downbeat.toFixed(3) + 's';
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
