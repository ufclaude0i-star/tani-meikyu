/* 見た目を目視で確認するためのスクリーンショット撮影。
   デザインを触ったら必ずこれを実行して shots/ を見る。数値だけでは色の善し悪しは分からない。 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const F = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const OUT = path.join(__dirname, '..', 'shots');
const MOVE = { '上': [0, -1], '下': [0, 1], '左': [-1, 0], '右': [1, 0] };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const shot = (p, name, opt) => p.screenshot(Object.assign({ path: path.join(OUT, name + '.png') }, opt || {}));

  /* ---- PC ---- */
  const d = await b.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
  await d.goto(F);
  await d.waitForTimeout(300);
  await shot(d, '01-title');

  await d.click('#btn-start');
  await d.waitForSelector('#stagelist .card');
  await d.waitForTimeout(200);
  await shot(d, '02-select', { fullPage: true });

  await d.click('#stagelist .card[data-id="2-2"]');
  await d.waitForTimeout(600);
  await shot(d, '03-game', { fullPage: true });
  await shot(d, '04-board', { clip: await d.$eval('#stage3d', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });

  // 数手進めて、穴・拾った球・相殺のある状態を撮る
  const p = await d.evaluate(() => {
    const st = __DBG.stage(), G = __DBG.state();
    return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited });
  });
  for (const n of p.slice(0, 8)) {
    await d.evaluate(([dx, dy]) => __DBG.move(dx, dy), MOVE[n]);
    await d.waitForTimeout(70);
  }
  await d.waitForTimeout(300);
  await shot(d, '05-board-mid', { clip: await d.$eval('#stage3d', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });

  // クリア画面
  await d.click('#btn-tomenu'); await d.waitForTimeout(200);
  await d.click('#stagelist .card[data-id="1-1"]'); await d.waitForTimeout(500);
  const p1 = await d.evaluate(() => {
    const st = __DBG.stage(), G = __DBG.state();
    return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited });
  });
  for (const n of p1) { await d.evaluate(([dx, dy]) => __DBG.move(dx, dy), MOVE[n]); await d.waitForTimeout(90); }
  await d.waitForTimeout(700);
  await shot(d, '06-clear');

  // あそびかた
  await d.evaluate(() => { document.getElementById('modal-clear').classList.add('hidden'); document.getElementById('modal-howto').classList.remove('hidden'); });
  await d.waitForTimeout(200);
  await shot(d, '07-howto');

  /* ---- スマホ ---- */
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto(F); await m.waitForTimeout(300);
  await shot(m, '08-mobile-title');
  await m.click('#btn-start'); await m.waitForSelector('#stagelist .card'); await m.waitForTimeout(200);
  await shot(m, '09-mobile-select');
  await m.click('#stagelist .card[data-id="3-5"]'); await m.waitForTimeout(600);
  await shot(m, '10-mobile-game', { fullPage: true });

  /* ---- 壁の色ちがい ---- */
  // 07 であそびかたを開いたままなので、閉じないとクリックが吸われる
  await d.evaluate(() => document.getElementById('modal-howto').classList.add('hidden'));
  var i = 11;
  for (const id of ['sky', 'lavender', 'apricot', 'rose', 'stone']) {
    await d.click('#btn-tomenu'); await d.waitForTimeout(200);
    await d.click('#wallcolors .sw[data-id="' + id + '"]');
    await d.click('#stagelist .card[data-id="2-2"]'); await d.waitForTimeout(600);
    await shot(d, (i++) + '-wall-' + id, { clip: await d.$eval('#stage3d', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
  }
  await d.click('#btn-tomenu'); await d.waitForTimeout(150);
  await d.click('#wallcolors .sw[data-id="emerald"]');

  await b.close();
  console.log('撮影完了 -> ' + OUT);
  console.log(fs.readdirSync(OUT).join('  '));
})();
