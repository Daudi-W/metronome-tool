# 🥁 節拍器疊片工具 (Metronome Overlay Tool)

把任何一首歌(影片/音樂)即時疊上**節拍點 + 節拍器聲音**,給敬拜團跟拍練習用。
**純前端、零伺服器**,整個在瀏覽器執行,檔案不會上傳。

## 🌐 上線網址
**https://daudi-w.github.io/metronome-tool/**(GitHub Pages,repo 公開)

## 用法
1. 開網頁 → **載入歌曲**(拖一個 mp4 / mp3 / m4a)
2. **敲拍抓 BPM**:跟著歌點「🥢」4 下以上,自動算出 BPM(也可手動輸入、÷2 ×2)
3. **標記第1拍**:播放中,在你數「1」的瞬間點「🎯」→ 格線鎖定(可 ±10/50ms 微調)
4. **調外觀/聲音**:每小節幾拍、點大小/位置/顏色、第1拍重音、節拍器與原曲音量
5. (選配)**匯出影片**:
   - **直接輸出 MP4(免錄製)**:瀏覽器內用 ffmpeg.wasm 直接合成,不用播一遍。首次載入約 30MB 引擎,3 分半的歌約數分鐘。**僅支援 H.264 影片**(AV1/HEVC 解不了)。
   - **錄製備援**:即時錄製整首成 `.webm`(任何能播的影片都行,但要播一遍)。

> 第1拍那顆預設用不同顏色(白),其餘拍用萊姆綠,一眼看出「1」。

## 設計重點
- **抓第1拍 = 用敲的,不用猜**:自動偵測重拍最不準,改成人耳敲拍即時定位。
- BPM 鎖死後,只要一個正確的「1」,整首格線就全對(歌速通常很穩)。
- click 用 Web Audio 即時合成並 **lookahead 排程**,與影片時間同步;畫面用 Canvas 疊點。

## 技術
- 單頁 `index.html` + `style.css` + `app.js`,無建置步驟、無相依套件。
- 可直接部署 GitHub Pages / Firebase Hosting。
- 本機預覽:`python3 -m http.server 5610`(注意:http.server 不支援 Range,測試時無法 seek;實際用 Blob URL 不受影響)。

## ffmpeg.wasm 本地化
為避免跨來源 Worker 被擋,`@ffmpeg/ffmpeg`、`@ffmpeg/util`、`@ffmpeg/core`(含 32MB wasm)
都 vendor 在 `vendor/`(同源、離線可用、不依賴 CDN)。core 為單執行緒版,不需 COOP/COEP 標頭,
可直接上 GitHub Pages。

## 待辦 / 第二階段
- [ ] **貼 YouTube 連結**輸入:需後端 `yt-dlp`(純前端因 CORS 無法直接抓 YouTube)。可掛一支小後端或本機橋接。
- [ ] AV1/HEVC 影片的瀏覽器端支援(目前 mp4 直出僅 H.264;其餘請用錄製備援或先轉檔)。
- [ ] 記住上次設定(localStorage)。

## 命令列備援(原始做法)
`../../drafts/metronome-mv/` 內有 `cand3.py` + `render_final3.sh`:用 ffmpeg + librosa
直接把 YouTube 影片燒上節拍器輸出 mp4(需手動給「1」的位置)。網頁版是它的互動化升級。
