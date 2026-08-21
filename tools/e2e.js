const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'dist', 'index.html'));

  await page.click('#btn-start');
  await page.waitForSelector('#stagelist .card');
  const cards = await page.$$eval('#stagelist .card', els => els.map(e => e.dataset.id));
  console.log('ステージ数:', cards.length, cards.join(' '));

  const dirKey = { '上': 'ArrowUp', '下': 'ArrowDown', '左': 'ArrowLeft', '右': 'ArrowRight' };
  for (const id of cards) {
    await page.click(`#stagelist .card[data-id="${id}"]`);
    await page.waitForSelector('#cv');await page.waitForTimeout(60);
    // ページ内のソルバで最短手順を取得
    const pathArr = await page.evaluate(() => {
      const st = window.__DBG.stage(), G = window.__DBG.state();
      return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited });
    });
    if (!pathArr) { errors.push(id + ': ページ内ソルバが解を返さない'); continue; }
    for (const d of pathArr) { await page.evaluate(n => { const M={'上':[0,-1],'下':[0,1],'左':[-1,0],'右':[1,0]}; __DBG.move(M[n][0], M[n][1]); }, d); }
    await page.waitForSelector('#modal-clear:not(.hidden)', { timeout: 3000 }).catch(() => errors.push(id + ': クリアモーダルが出ない'));
    const txt = await page.textContent('#clear-body').catch(() => '');
    const stars = (txt.match(/★/g) || []).length;
    console.log(`  ${id} クリア（${pathArr.length}手） 星表示:${stars}`);
    // クイズを正解して閉じる
    await page.evaluate(() => {
      const chs = document.querySelectorAll('#quizbox .ch');
      if (chs.length) chs[0].click();
    });
    await page.click('#c-select');
    await page.waitForSelector('#stagelist .card');
  }
  // スクリーンショット
  await page.click('#stagelist .card[data-id="2-2"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, '..', 'shot-game.png'), fullPage: true });
  await page.click('#btn-tomenu');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(__dirname, '..', 'shot-select.png'), fullPage: true });
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mob.goto('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
  await mob.click('#btn-start'); await mob.waitForSelector('#stagelist .card');
  await mob.click('#stagelist .card[data-id="1-3"]'); await mob.waitForTimeout(300);
  await mob.screenshot({ path: path.join(__dirname, '..', 'shot-mobile.png'), fullPage: true });

  await browser.close();
  console.log(errors.length ? '\n⚠ エラー:\n' + errors.join('\n') : '\nエラーなし');
})();
