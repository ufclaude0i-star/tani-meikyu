/* 表彰式で流す動画を撮る（音声なし・テロップなし・30秒〜1分）。

   応募用の demo-video.js とは目的が違う。
   あちらは「動画だけで伝わること」が要るのでテロップを焼き込んでいるが、
   こちらは本人が口頭で話している横で流すので、文字は邪魔になる。
   画面に出るのはゲームそのものだけにして、説明は話し手に任せる。

   出力: demo/ceremony/tanimeikyu_ceremony.mp4（無音・H.264） */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { execFileSync } = require('child_process');

const F = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const OUT = path.join(__dirname, '..', 'demo', 'ceremony');
const MOVE = { '上': [0, -1], '下': [0, 1], '左': [-1, 0], '右': [1, 0] };

const ffmpeg = (() => {
  const L = process.env.LOCALAPPDATA || '';
  for (const c of ['ffmpeg',
    L + '\\Microsoft\\WinGet\\Links\\ffmpeg.exe',
    L + '\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin\\ffmpeg.exe']) {
    try { execFileSync(c, ['-version'], { stdio: 'ignore' }); return c; } catch (e) { }
  }
  return null;
})();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) {
    const q = path.join(OUT, f);
    if (fs.statSync(q).isFile()) fs.unlinkSync(q);
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } }
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  const wait = ms => p.waitForTimeout(ms);
  const t0 = Date.now();
  const mark = s => console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${s}`);

  await p.goto(F);
  // 下のルール欄は話し手が説明するので映さない。盤面を大きく見せる
  await p.addStyleTag({ content: '.legendbox{display:none}' });

  const solvePath = () => p.evaluate(() => {
    const st = __DBG.stage(), G = __DBG.state();
    return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited });
  });
  const step = async (name, ms) => {
    await p.evaluate(([a, b]) => __DBG.move(a, b), MOVE[name]);
    await wait(ms || 430);
  };
  const openStage = async (id) => {
    await p.evaluate(() => {
      document.getElementById('modal-clear').classList.add('hidden');
      const s = document.getElementById('screen-select');
      if (s.classList.contains('hidden')) document.getElementById('btn-start').click();
    });
    await p.waitForSelector('#stagelist .card');
    await p.click(`#stagelist .card[data-id="${id}"]`);
    await wait(650);
  };
  const cancels = () => p.evaluate(() => __DBG.state().cancels);

  /* --- 1. 単位を持って歩き、拾って組み立てる（約14秒） --- */
  mark('単位を拾って組み立てる');
  await openStage('1-3');                      // kg → N
  await wait(3000);
  const pathA = await solvePath();
  for (const n of pathA.slice(0, pathA.length - 1)) await step(n, 560);
  await wait(900);

  /* --- 2. EXITに合わせてクリア、公式が出る（約9秒） --- */
  mark('EXITに合わせてクリア');
  await step(pathA[pathA.length - 1], 300);
  await p.waitForSelector('#modal-clear:not(.hidden)');
  await wait(7000);                            // 公式を読む時間をとる

  /* --- 3. 相殺の瞬間（約12秒） --- */
  mark('相殺');
  await p.evaluate(() => document.getElementById('c-select').click());
  await wait(300);
  await openStage('2-1');                      // 相殺のコツ
  const pathB = await solvePath();
  let before = await cancels(), shown = 0;
  for (const n of pathB.slice(0, pathB.length - 1)) {
    await step(n, 420);
    const c = await cancels();
    if (c > before) { before = c; shown++; await wait(2300); if (shown >= 2) break; }
  }
  await wait(900);

  /* --- 4. 関門と、崩れた道（約8秒） --- */
  mark('関門');
  await openStage('2-2');                      // 圧力の迷宮（関門つき）
  const pathC = await solvePath();
  for (const n of pathC.slice(0, 12)) await step(n, 470);
  await wait(2200);

  /* --- 5. ステージ一覧（約6秒） --- */
  mark('ステージ一覧');
  await p.click('#btn-tomenu');
  await wait(600);
  await p.evaluate(() => new Promise(res => {
    const top = document.documentElement.scrollHeight - innerHeight;
    let y = 0;
    (function tick() { y += 4; scrollTo(0, Math.min(y, top)); y < top ? requestAnimationFrame(tick) : res(); })();
  }));
  await wait(2600);

  mark('撮影終了');
  await ctx.close();
  await browser.close();

  const webm = fs.readdirSync(OUT).find(f => f.endsWith('.webm'));
  const src = path.join(OUT, webm);
  console.log(errs.length ? 'JSエラー: ' + errs.join(' / ') : 'JSエラーなし');

  if (!ffmpeg) { console.log('ffmpeg が無いので webm のまま: ' + src); return; }
  const dst = path.join(OUT, 'tanimeikyu_ceremony.mp4');
  // -an で音声トラックを一切入れない（「音声なし」の指定を満たすため）
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-an', dst],
    { stdio: 'inherit' });
  console.log('出力: ' + dst + '  (' + (fs.statSync(dst).size / 1024 / 1024).toFixed(2) + ' MB)');
})();
