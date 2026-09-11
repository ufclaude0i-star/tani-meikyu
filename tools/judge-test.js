/* 審査員と同じ手順で動くかを確認する。
   提出用zipを展開し、その中の index.html を file:// で開いてプレイする。
   ネットは完全に遮断する（審査員のPCがオフラインでも動くことを保証するため）。

   使い方: node tools/judge-test.js <zipを展開したフォルダ> */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { pathToFileURL } = require('url');

const dir = process.argv[2];
const file = path.join(dir, 'tani-meikyu', 'index.html');
if (!fs.existsSync(file)) { console.error('❌ 展開先に tani-meikyu/index.html が無い: ' + file); process.exit(1); }
const MOVE = { '上': [0, -1], '下': [0, 1], '左': [-1, 0], '右': [1, 0] };
const IDS = ['1-1','1-2','1-3','1-4','2-1','2-2','2-3','2-4','3-1','3-2','3-3','3-4','3-5'];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, offline: true });
  const p = await ctx.newPage();
  const errs = [], reqs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:')) reqs.push(u); });
  await p.goto(pathToFileURL(file).href);
  const title = await p.title();
  await p.click('#btn-start');
  await p.waitForSelector('#stagelist .card');

  let cleared = 0;
  for (const id of IDS) {
    await p.evaluate(() => {
      document.getElementById('modal-clear').classList.add('hidden');
      const s = document.getElementById('screen-select');
      if (s.classList.contains('hidden')) document.getElementById('btn-tomenu').click();
    });
    await p.waitForSelector('#stagelist .card');
    await p.click(`#stagelist .card[data-id="${id}"]`);
    await p.waitForTimeout(300);
    const sol = await p.evaluate(() => {
      const st = __DBG.stage(), G = __DBG.state();
      return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited });
    });
    for (const n of sol) { await p.evaluate(([a, c]) => __DBG.move(a, c), MOVE[n]); await p.waitForTimeout(30); }
    await p.waitForTimeout(450);
    if (!(await p.evaluate(() => document.getElementById('modal-clear').classList.contains('hidden')))) cleared++;
  }
  await b.close();

  console.log('開いたファイル: ' + path.relative(dir, file));
  console.log('ページタイトル: ' + title);
  console.log('ネットを遮断した状態で全ステージをクリア: ' + cleared + ' / ' + IDS.length);
  console.log('外部への通信: ' + (reqs.length ? reqs.length + ' 件 ' + reqs.join(' ') : '0 件'));
  console.log(errs.length ? '❌ JSエラー: ' + errs.join(' / ') : '✅ JSエラーなし');
  if (cleared !== IDS.length || errs.length || reqs.length) process.exit(1);
})();
