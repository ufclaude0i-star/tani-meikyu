/* 全13ステージを通しでプレイし、途中の盤面を撮って目視確認できるようにする。
   自動テストが通っていても「見た目のおかしさ」は数字に出ないので、画像を残す。 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const ROOT = 'C:/Users/s20ji/OneDrive/デスクトップ/ドキュメント/プログラム/アプリ/単位迷宮/tani-meikyu';
const F = 'file://' + path.join(ROOT, 'dist', 'index.html');
const OUT = path.join(ROOT, 'shots', 'play');
const IDS = ['1-1','1-2','1-3','1-4','2-1','2-2','2-3','2-4','3-1','3-2','3-3','3-4','3-5'];
const MOVE = { '上':[0,-1], '下':[0,1], '左':[-1,0], '右':[1,0] };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(F);
  await p.click('#btn-start');
  await p.waitForSelector('#stagelist .card');

  const rows = [];
  for (const id of IDS) {
    await p.evaluate(() => {
      document.getElementById('modal-clear').classList.add('hidden');
      const s = document.getElementById('screen-select');
      if (s.classList.contains('hidden')) document.getElementById('btn-tomenu').click();
    });
    await p.waitForSelector('#stagelist .card');
    await p.click(`#stagelist .card[data-id="${id}"]`);
    await p.waitForTimeout(450);

    const info = await p.evaluate(() => {
      const st = __DBG.stage(), G = __DBG.state();
      return { story: st.story, tip: st.tip, meaning: st.meaning,
               start: R3.uniStr(st.startV), goal: R3.uniStr(st.goalV),
               par: st.par, undoLeft: G.undoLeft };
    });
    // 解の半分だけ進めて、途中の盤面（穴・拾った球・相殺の跡）を撮る
    const p1 = await p.evaluate(() => {
      const st = __DBG.stage(), G = __DBG.state();
      return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited });
    });
    const half = Math.max(1, Math.floor(p1.length / 2));
    for (const n of p1.slice(0, half)) {
      await p.evaluate(([a, c]) => __DBG.move(a, c), MOVE[n]);
      await p.waitForTimeout(80);
    }
    await p.waitForTimeout(400);
    const clip = await p.$eval('#stage3d', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await p.screenshot({ path: path.join(OUT, id + '.png'), clip });

    // 残りを進めてクリアし、クリア画面も確認
    const p2 = await p.evaluate(() => {
      const st = __DBG.stage(), G = __DBG.state();
      return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited });
    });
    for (const n of p2) { await p.evaluate(([a, c]) => __DBG.move(a, c), MOVE[n]); await p.waitForTimeout(60); }
    await p.waitForTimeout(600);
    const clear = await p.evaluate(() => {
      const box = document.querySelector('.stars-big');
      return {
        開いた: !document.getElementById('modal-clear').classList.contains('hidden'),
        星: box ? (box.textContent.match(/★/g) || []).length - box.querySelectorAll('.off').length : -1,
        意味: (document.querySelector('.meaning') || {}).textContent || '',
        公式: (document.querySelector('.formula') || {}).textContent || '',
        条件: (document.querySelector('.star-rule') || {}).textContent || '',
        クイズ選択肢: document.querySelectorAll('.quiz .ch').length
      };
    });
    rows.push({ id, ...info, ...clear });
  }
  await b.close();

  console.log('ID   出発→目標          最短 もどす 星 クイズ  意味（クリア画面）');
  for (const r of rows) {
    const ng = [];
    if (!r.開いた) ng.push('クリア画面が出ない');
    if (r.星 !== 3) ng.push('星が3でない(' + r.星 + ')');
    if (r.クイズ選択肢 !== 4) ng.push('選択肢が4個でない(' + r.クイズ選択肢 + ')');
    if (!r.意味) ng.push('意味の行がない');
    if (!r.公式) ng.push('公式がない');
    if (/=|→/.test(r.story)) ng.push('説明文に式が残っている');
    console.log(`${r.id}  ${(r.start + ' → ' + r.goal).padEnd(20)} ${String(r.par).padStart(3)} ${String(r.undoLeft).padStart(4)} ${r.星}   ${r.クイズ選択肢}    ${r.意味}` + (ng.length ? '   ❌ ' + ng.join(' / ') : ''));
  }
  console.log(errs.length ? '\n❌ エラー: ' + errs.join(' / ') : '\n✅ JSエラー・コンソールエラーなし');
  console.log('盤面の画像: ' + OUT);
})();
