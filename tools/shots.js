const { chromium } = require('playwright');
const path = require('path');
const F = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const KEY = { '上': 'ArrowUp', '下': 'ArrowDown', '左': 'ArrowLeft', '右': 'ArrowRight' };
(async () => {
  const b = await chromium.launch();
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto(F);
  await m.click('#btn-start'); await m.waitForSelector('#stagelist .card');
  // 2-4 を数手進めてから撮る（穴・球・相殺が見える状態）
  await m.click('#stagelist .card[data-id="2-4"]'); await m.waitForTimeout(500);
  await m.screenshot({ path: 'shot-start.png', fullPage: true });
  const p = await m.evaluate(() => { const st = __DBG.stage(), G = __DBG.state(); return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited }); });
  for (const d of p.slice(0, 14)) { await m.evaluate(n => { const M = {'上':[0,-1],'下':[0,1],'左':[-1,0],'右':[1,0]}; __DBG.move(M[n][0], M[n][1]); }, d); await m.waitForTimeout(60); }
  await m.waitForTimeout(200);
  await m.screenshot({ path: 'shot-mid.png', fullPage: true });
  await m.click('#btn-tomenu'); await m.waitForTimeout(200);
  await m.click('#stagelist .card[data-id="3-5"]'); await m.waitForTimeout(500);
  await m.screenshot({ path: 'shot-3-5.png', fullPage: true });
  const d2 = await b.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 2 });
  await d2.goto(F); await d2.click('#btn-start'); await d2.waitForSelector('#stagelist .card');
  await d2.click('#stagelist .card[data-id="2-2"]'); await d2.waitForTimeout(500);
  await d2.screenshot({ path: 'shot-desktop.png', fullPage: true });
  await b.close(); console.log('done');
})();
