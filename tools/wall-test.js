/* 壁の色の切り替えが本当に効いているかを、canvas の実ピクセルで確認する */
const { chromium } = require('playwright');
const path = require('path');
const F = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');

// 盤面の中で「壁の天面」に当たりそうな点をたくさん拾い、最頻の色を返す
async function wallTone(p) {
  return await p.evaluate(() => {
    const cv = document.getElementById('cv');
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const count = {};
    for (let y = 0; y < cv.height; y += 3) {
      for (let x = 0; x < cv.width; x += 3) {
        const i = (y * cv.width + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max - min < 18) continue;          // 無彩色（床・空・穴）は除く
        if (max < 120) continue;               // 暗い部分は除く
        const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
        count[key] = (count[key] || 0) + 1;
      }
    }
    const top = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    const [r, g, b] = top.split(',').map(v => +v * 16 + 8);
    return { rgb: [r, g, b], px: count[top] };
  });
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));

  await p.goto(F);
  const ids = await p.evaluate(() => R3.wallColors.map(c => c.id + ':' + c.hex));
  console.log('用意した色: ' + ids.join('  '));

  const tones = {};
  for (const id of ['emerald', 'lavender', 'apricot']) {
    await p.evaluate(() => { const s = document.getElementById('screen-select'); if (s.classList.contains('hidden')) document.getElementById('btn-start').click(); });
    await p.waitForSelector('#stagelist .card');
    await p.click(`#wallcolors .sw[data-id="${id}"]`);
    const on = await p.$eval(`#wallcolors .sw[data-id="${id}"]`, e => e.className);
    await p.click('#stagelist .card[data-id="2-2"]');
    await p.waitForTimeout(600);
    tones[id] = await wallTone(p);
    console.log(`  ${id.padEnd(9)} 選択状態="${on}"  盤面の主要な色 rgb(${tones[id].rgb})  ${tones[id].px}点`);
    await p.click('#btn-tomenu');
    await p.waitForTimeout(200);
  }

  // 保存されているか
  await p.click(`#wallcolors .sw[data-id="rose"]`);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('tanimeikyu_v2')).wallColor);
  await p.reload();
  await p.waitForTimeout(400);
  await p.click('#btn-start'); await p.waitForSelector('#stagelist .card');
  const after = await p.$eval('#wallcolors .sw.on', e => e.getAttribute('data-id'));
  console.log(`\n保存された値: ${saved} / リロード後に選択されている色: ${after}`);

  // 床や球の色まで変わっていないか（壁だけ変える約束）
  await p.click('#stagelist .card[data-id="2-2"]'); await p.waitForTimeout(500);
  const fixed = await p.evaluate(() => {
    const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
    const px = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
    return { 左上の空: px(6, 6), 右下の空: px(cv.width - 6, cv.height - 6) };
  });
  console.log('空の色（壁色に影響されないはず）:', JSON.stringify(fixed));

  console.log(errs.length ? '\nJSエラー: ' + errs.join(' / ') : '\nJSエラーなし');
  await b.close();
})();
