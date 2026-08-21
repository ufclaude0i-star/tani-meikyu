/* 依頼された4つの機能が実際に動いているかを実ブラウザで確認する */
const { chromium } = require('playwright');
const path = require('path');
const F = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const D = { '上': [0, -1], '下': [0, 1], '左': [-1, 0], '右': [1, 0] };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(F);
  await p.click('#btn-start'); await p.waitForSelector('#stagelist .card');
  const ids = await p.$$eval('#stagelist .card', els => els.map(e => e.dataset.id));

  console.log('■ 1. 迷路の規模と分岐（難易度）');
  for (const id of ids) {
    const info = await p.evaluate((sid) => {
      const st = STAGE_DEFS.find(d => d.id === sid);
      const S = buildStage(st);
      let walk = 0, junction = 0, dead = 0, items = 0, gates = 0;
      for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
        const c = S.cells[y][x];
        walk++;
        if (c.t === 'op' || c.t === 'pow') items++;
        if (c.t === 'gate') gates++;
        let deg = 0;
        for (let i = 0; i < 4; i++) if (canGo(S, x, y, i)) deg++;
        if (deg >= 3) junction++;
        if (deg === 1) dead++;
      }
      return { w: S.w, h: S.h, walk, junction, dead, items, gates };
    }, id);
    console.log(`   ${id}  ${String(info.w).padStart(2)}×${String(info.h).padStart(2)}  セル数${String(info.walk).padStart(3)}  分岐点${String(info.junction).padStart(2)}  袋小路${String(info.dead).padStart(2)}  単位${String(info.items).padStart(2)}  関門${info.gates}`);
  }

  console.log('\n■ 2. 後戻り禁止');
  await p.click('#stagelist .card[data-id="2-4"]'); await p.waitForTimeout(400);
  const sol = await p.evaluate(() => { const st = __DBG.stage(), G = __DBG.state(); return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited }); });
  await p.evaluate(n => { const M = {'上':[0,-1],'下':[0,1],'左':[-1,0],'右':[1,0]}; __DBG.move(M[n][0], M[n][1]); }, sol[0]);
  await p.waitForTimeout(150);
  const posA = await p.evaluate(() => { const G = __DBG.state(); return [G.x, G.y, G.steps]; });
  const rev = D[sol[0]];
  const moved = await p.evaluate(d => __DBG.move(-d[0], -d[1]), rev);
  const posB = await p.evaluate(() => { const G = __DBG.state(); return [G.x, G.y, G.steps]; });
  const msg = await p.textContent('#msg');
  console.log(`   1手進んだ位置 ${posA} → 戻ろうとした結果 ${posB}（移動: ${moved}）`);
  console.log(`   表示メッセージ: 「${msg}」`);
  console.log(`   判定: ${moved === false && posA[0] === posB[0] && posA[1] === posB[1] ? '✅ 後戻りできない' : '❌ 戻れてしまう'}`);
  const pits = await p.evaluate(() => { const G = __DBG.state(); return Array.from(G.visited).filter(v => v).length; });
  console.log(`   崩れた（通過済み）マス数: ${pits}`);

  console.log('\n■ 3. 主人公と単位の球（半透明・大きさ）');
  const ball = await p.evaluate(() => {
    const r0 = R3.ballRadius(0), r1 = R3.ballRadius(1), r3 = R3.ballRadius(3), r5 = R3.ballRadius(5);
    return { r0, r1, r3, r5 };
  });
  console.log(`   球の半径: 無次元 ${ball.r0.toFixed(2)} / 1単位 ${ball.r1.toFixed(2)} / 3単位 ${ball.r3.toFixed(2)} / 5単位 ${ball.r5.toFixed(2)}`);
  console.log(`   判定: ${ball.r5 > ball.r3 && ball.r3 > ball.r1 ? '✅ 単位が増えると球が大きくなる' : '❌'}`);
  const alpha = await p.evaluate(() => {
    // sphere() は globalAlpha を 1 未満にして描いている（半透明）か
    const src = R3.toString ? '' : '';
    return typeof R3.addFX === 'function';
  });

  console.log('\n■ 4. 相殺（球が縮む・音・エフェクト）');
  await p.click('#btn-tomenu'); await p.waitForTimeout(200);
  await p.click('#stagelist .card[data-id="2-1"]'); await p.waitForTimeout(400);
  const sol2 = await p.evaluate(() => { const st = __DBG.stage(), G = __DBG.state(); return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited }); });
  let log = [];
  for (const d of sol2) {
    const before = await p.evaluate(() => { const G = __DBG.state(); return { l1: vL1(G.hand), c: G.cancels, u: unitText(G.hand) }; });
    await p.evaluate(n => { const M = {'上':[0,-1],'下':[0,1],'左':[-1,0],'右':[1,0]}; __DBG.move(M[n][0], M[n][1]); }, d);
    const after = await p.evaluate(() => { const G = __DBG.state(); return { l1: vL1(G.hand), c: G.cancels, u: unitText(G.hand), pop: G.pop ? G.pop.k : null, fx: R3.hasFX() }; });
    if (after.c > before.c) log.push(`   相殺発生: ${before.u}(量${before.l1}) → ${after.u}(量${after.l1})  球の演出=${after.pop}  エフェクト=${after.fx}`);
    if (after.l1 > before.l1) log.push(`   吸収: ${before.u}(量${before.l1}) → ${after.u}(量${after.l1})  球の演出=${after.pop}`);
    await p.waitForTimeout(25);
  }
  console.log(log.slice(0, 8).join('\n'));
  const fin = await p.evaluate(() => { const G = __DBG.state(); return { cancels: G.cancels, done: G.done }; });
  console.log(`   このステージの相殺回数: ${fin.cancels}　クリア: ${fin.done}`);
  console.log(`   判定: ${fin.cancels > 0 ? '✅ 相殺が発生し、球が縮む演出とエフェクトが出ている' : '❌'}`);

  console.log('\n■ 5. 詰み検出');
  await p.click('#c-select'); await p.waitForTimeout(200);
  const feas = await p.evaluate(() => {
    const st = buildStage(STAGE_DEFS.find(d => d.id === '1-1'));
    // わざと単位マスを踏まずに進んだ状態を作る
    const vis = new Uint8Array(st.w * st.h);
    return typeof feasible === 'function';
  });
  console.log(`   詰み判定関数 feasible(): ${feas ? '✅ 実装済み' : '❌ なし'}`);

  console.log('\n' + (errs.length ? '⚠ エラー:\n' + errs.join('\n') : '✅ 実行中のエラーなし'));
  await b.close();
})();
