/* ナレーションをずんだもん（VOICEVOX）に読ませ、デモ動画に合成する。
   使い方:
     1. VOICEVOX を起動しておく（エンジンが http://127.0.0.1:50021 で待ち受ける）
     2. node tools/demo-video.js   → demo/tani-meikyu-demo.webm と timeline.json ができる
     3. node tools/make-voice.js   → demo/tani-meikyu-demo.mp4（音声つき）ができる

   音声の配置は timeline.json の時刻を基準にする。ただし前の行が読み終わっていなければ
   その分うしろにずらす（重なって聞き取れなくなるのを防ぐため）。 */

const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const OUT = path.join(__dirname, '..', 'demo');
const VOICE = path.join(OUT, 'voice');
const API = 'http://127.0.0.1:50021';
const N = require('./narration.js');
const GAP_MS = 220;          // 行と行のあいだの最小の間

const ffmpeg = (() => {
  // winget で入れた ffmpeg は PATH の反映にアプリの再起動が要るので、実体も直接探す
  const L = process.env.LOCALAPPDATA || '';
  const CAND = [
    'ffmpeg',
    L + '\\Microsoft\\WinGet\\Links\\ffmpeg.exe',
    L + '\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe'
  ];
  for (const c of CAND) {
    try { execFileSync(c, ['-version'], { stdio: 'ignore' }); return c; } catch (e) { }
  }
  return null;
})();

/* ---- WAV（16bit PCM モノラル）を読み書きする最小限の処理 ---- */
// ffprobe は ffmpeg と同じフォルダにある
function probeBin() { return ffmpeg.replace(/ffmpeg(\.exe)?$/i, m => m.replace('ffmpeg', 'ffprobe')); }

function readWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('WAVではない');
  let p = 12, fmt = null, data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(p + 10), rate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') data = buf.slice(p + 8, p + 8 + size);
    p += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAVの構造が読めない');
  return { fmt, data };
}
function writeWav(samples, rate) {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + samples.length * 2, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(samples.length * 2, 40);
  const body = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    let v = Math.round(samples[i]);
    body.writeInt16LE(v > 32767 ? 32767 : v < -32768 ? -32768 : v, i * 2);
  }
  return Buffer.concat([head, body]);
}

(async () => {
  fs.mkdirSync(VOICE, { recursive: true });

  /* ---- VOICEVOX が起きているか ---- */
  let ver;
  try { ver = await (await fetch(API + '/version')).text(); }
  catch (e) {
    console.error('VOICEVOX に接続できません。VOICEVOX を起動してから、もう一度実行してください。');
    console.error('（エンジンの待ち受け先: ' + API + '）');
    process.exit(1);
  }
  console.log('VOICEVOX ' + ver.replace(/"/g, '') + ' に接続');

  /* ---- 1行ずつ合成 ---- */
  const wavs = [];
  for (const L of N.lines) {
    const q = await (await fetch(`${API}/audio_query?speaker=${N.speaker}&text=${encodeURIComponent(L.text)}`, { method: 'POST' })).json();
    q.speedScale = N.speedScale; q.pitchScale = N.pitchScale;
    q.intonationScale = N.intonationScale; q.volumeScale = N.volumeScale;
    q.prePhonemeLength = 0.05; q.postPhonemeLength = 0.15;
    const r = await fetch(`${API}/synthesis?speaker=${N.speaker}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q)
    });
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(path.join(VOICE, L.cue + '.wav'), buf);
    const w = readWav(buf);
    const sec = (w.data.length / 2) / w.fmt.rate;
    wavs.push({ cue: L.cue, text: L.text, wav: w, sec });
    console.log(`  ${L.cue}  ${sec.toFixed(1)}秒  ${L.text.length}字  ${L.text.slice(0, 22)}…`);
  }

  /* ---- timeline.json の時刻に置く ---- */
  const tlPath = path.join(OUT, 'timeline.json');
  if (!fs.existsSync(tlPath)) { console.error('demo/timeline.json がありません。先に demo-video.js を実行してください。'); process.exit(1); }
  const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
  const rate = wavs[0].wav.fmt.rate;
  const src = path.join(OUT, 'tani-meikyu-demo.webm');

  // 録画は実時間よりわずかに短く仕上がる（コマ落ちのぶん）。
  // ただしコマ落ちは一様ではないので、実尺で一律に割り戻すと逆にズレる
  // （実測：一律補正すると場面転換より2.7秒early になった）。
  // 位置は実時間のまま使い、足りないぶんは最後の静止画を引き伸ばして補う。
  const wallSec = tl.__end / 1000;
  let videoSec = wallSec;
  if (ffmpeg) {
    try {
      videoSec = parseFloat(execFileSync(probeBin(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).toString().trim());
      console.log(`\n動画の実尺 ${videoSec.toFixed(1)}秒（撮影の実時間 ${wallSec.toFixed(1)}秒）`);
    } catch (e) { console.log('\n（動画の実尺を測れなかった）'); }
  }

  let cursor = 0, layout = [];
  for (const w of wavs) {
    const want = (tl[w.cue] !== undefined ? tl[w.cue] : 0) / 1000;
    const start = Math.max(want, cursor);
    layout.push({ ...w, start, shifted: start - want });
    cursor = start + w.sec + GAP_MS / 1000;
  }

  const totalSec = Math.max(videoSec, cursor);
  const track = new Float64Array(Math.ceil(totalSec * rate));
  for (const L of layout) {
    const off = Math.round(L.start * rate), d = L.wav.data;
    for (let i = 0; i * 2 + 1 < d.length; i++) track[off + i] += d.readInt16LE(i * 2);
  }
  const wavOut = path.join(OUT, 'narration.wav');
  fs.writeFileSync(wavOut, writeWav(track, rate));

  console.log('\n配置（動画は ' + videoSec.toFixed(1) + '秒）');
  for (const L of layout) {
    const end = L.start + L.sec;
    console.log(`  ${L.cue}  ${L.start.toFixed(1)}〜${end.toFixed(1)}秒` +
      (L.shifted > 0.05 ? `  ※前の行が終わらないので ${L.shifted.toFixed(1)}秒 後ろにずらした` : '') +
      (end > videoSec ? '  ⚠ 動画の終わりをはみ出している' : ''));
  }
  // 読み上げが動画より長いぶんは、最後の静止画（タイトル）を複製して伸ばす。
  // -shortest だと最後の一文が途中で切れてしまう。
  const audioEnd = layout[layout.length - 1].start + layout[layout.length - 1].sec;
  const pad = Math.max(0, audioEnd + 0.4 - videoSec);
  if (pad > 0) console.log(`\n最後のタイトル画面を ${pad.toFixed(1)}秒 引き伸ばして、読み上げが切れないようにする`);
  else console.log(`\n✅ ナレーションは動画の中に収まっている（余り ${(videoSec - audioEnd).toFixed(1)}秒）`);

  /* ---- 動画に合成して mp4 にする ---- */
  if (!ffmpeg) { console.log('\nffmpeg が見つからないので合成は省略。' + wavOut + ' を動画編集ソフトで重ねてください。'); return; }
  const dst = path.join(OUT, 'tani-meikyu-demo.mp4');
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-i', wavOut];
  if (pad > 0) args.push('-vf', `tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)}`);
  args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
    // ずんだもんの出力は平均音量が低めなので、配信で標準的な -16 LUFS にそろえる
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-c:a', 'aac', '-b:a', '160k', dst);
  execFileSync(ffmpeg, args, { stdio: 'inherit' });
  console.log('\n出力: ' + dst + '  (' + (fs.statSync(dst).size / 1024 / 1024).toFixed(2) + ' MB)');
})();
