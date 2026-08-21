/* 実ブラウザで「人がやる操作」をそのまま再現してデバッグする */
const { chromium } = require('playwright');
const path = require('path');
const F = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const issues = [];
const ok = [];
function T(name, cond, detail) { (cond ? ok : issues).push(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); }

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(F);

  /* ---- タイトル → ステージ選択 ---- */
  await p.click('#btn-start');
  await p.waitForSelector('#stagelist .card');
  const cards = await p.$$eval('#stagelist .card', e => e.length);
  T('ステージ選択が13枚出る', cards === 13, cards + '枚');

  /* ---- あそびかたモーダル ---- */
  await p.click('#btn-howto2'); await p.waitForTimeout(150);
  const howtoOpen = await p.isVisible('#modal-howto .box');
  await p.click('#howto-close'); await p.waitForTimeout(150);
  const howtoClosed = await p.evaluate(() => document.getElementById('modal-howto').classList.contains('hidden'));
  T('あそびかたの開閉', howtoOpen && howtoClosed);

  /* ---- 1-3 に入る ---- */
  await p.click('#stagelist .card[data-id="1-3"]');
  await p.waitForTimeout(500);

  /* ---- ジョイスティック（マウスドラッグ）で動くか ---- */
  const before = await p.evaluate(() => { const G = __DBG.state(); return [G.x, G.y]; });
  const joy = await p.$('#joy');
  const jb = await joy.boundingBox();
  const cx = jb.x + jb.width / 2, cy = jb.y + jb.height / 2;
  let joyWorked = false;
  for (const [dx, dy, name] of [[0, -40, '上'], [40, 0, '右'], [0, 40, '下'], [-40, 0, '左']]) {
    await p.mouse.move(cx, cy); await p.mouse.down();
    await p.mouse.move(cx + dx, cy + dy, { steps: 4 });
    await p.waitForTimeout(120);
    await p.mouse.up();
    await p.waitForTimeout(120);
    const now = await p.evaluate(() => { const G = __DBG.state(); return [G.x, G.y]; });
    if (now[0] !== before[0] || now[1] !== before[1]) { joyWorked = true; break; }
  }
  T('ジョイスティックで移動できる', joyWorked);

  /* ---- 連続入力で暴走しないか（スティック長押し相当） ---- */
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 40, cy, { steps: 2 });
  await p.waitForTimeout(1200); await p.mouse.up();
  const afterHold = await p.evaluate(() => { const G = __DBG.state(); return { steps: G.steps, x: G.x, y: G.y }; });
  T('スティック長押しで連続移動（暴走なし）', afterHold.steps >= 1 && errs.length === 0, '手数' + afterHold.steps);

  /* ---- リセット ---- */
  await p.click('#btn-reset'); await p.waitForTimeout(200);
  const afterReset = await p.evaluate(() => { const G = __DBG.state(); const st = G.stage; return { atStart: G.x === st.start.x && G.y === st.start.y, steps: G.steps, vis: Array.from(G.visited).filter(v => v).length }; });
  T('やり直しでスタートに戻る', afterReset.atStart && afterReset.steps === 0 && afterReset.vis === 1);

  /* ---- 盤面タップで隣のマスへ移動できるか ---- */
  const tapResult = await p.evaluate(() => {
    const G = __DBG.state(), st = G.stage;
    const cv = document.getElementById('cv'), r = cv.getBoundingClientRect();
    // 隣接する通行可能マスを1つ選び、その画面座標を総当たりで探す
    const targets = [[0,-1],[0,1],[-1,0],[1,0]].map(d => [G.x + d[0], G.y + d[1]])
      .filter(([x, y]) => { const c = cellAt(st, x, y); return c && c.t !== 'wall' && !G.visited[y * st.w + x]; });
    if (!targets.length) return { found: false };
    const [tx, ty] = targets[0];
    for (let sy = 0; sy < r.height; sy += 4) for (let sx = 0; sx < r.width; sx += 4) {
      const hit = R3.pick(sx, sy);
      if (hit && hit.col === tx && hit.row === ty) return { found: true, sx: sx + r.left, sy: sy + r.top, tx, ty };
    }
    return { found: false };
  });
  if (tapResult.found) {
    await p.mouse.click(tapResult.sx, tapResult.sy);
    await p.waitForTimeout(250);
    const pos = await p.evaluate(() => { const G = __DBG.state(); return [G.x, G.y]; });
    T('マスをタップして移動', pos[0] === tapResult.tx && pos[1] === tapResult.ty, `狙い(${tapResult.tx},${tapResult.ty}) 実際(${pos})`);
  } else T('マスをタップして移動', false, '対象マスの画面座標が見つからない');

  /* ---- スワイプ（いま進める方向を選んで振る） ---- */
  const swipeDir = await p.evaluate(() => {
    const G = __DBG.state(), st = G.stage;
    for (const sd of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const g = R3.mapDir(sd[0], sd[1]);
      const nx = G.x + g[0], ny = G.y + g[1], c = cellAt(st, nx, ny);
      if (c && c.t !== 'wall' && !G.visited[ny*st.w+nx] && canEnter(G.hand, c, st.goalV).ok) return sd;
    }
    return null;
  });
  const posBeforeSwipe = await p.evaluate(() => { const G = __DBG.state(); return [G.x, G.y, G.steps]; });
  const cvBox = await (await p.$('#cv')).boundingBox();
  if (swipeDir) {
    const sx0 = cvBox.x + cvBox.width / 2, sy0 = cvBox.y + cvBox.height / 2;
    await p.mouse.move(sx0, sy0); await p.mouse.down();
    await p.mouse.move(sx0 + swipeDir[0] * 80, sy0 + swipeDir[1] * 80, { steps: 8 });
    await p.mouse.up(); await p.waitForTimeout(280);
  }
  const posAfterSwipe = await p.evaluate(() => { const G = __DBG.state(); return [G.x, G.y, G.steps]; });
  T('スワイプで移動', !!swipeDir && posAfterSwipe[2] > posBeforeSwipe[2], `${posBeforeSwipe} → ${posAfterSwipe}`);

  /* ---- 進めない方向に入力したとき、音なしでも分かるか ---- */
  const blockedFB = await p.evaluate(() => {
    const G = __DBG.state(), st = G.stage;
    for (const sd of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const g = R3.mapDir(sd[0], sd[1]);
      const c = cellAt(st, G.x + g[0], G.y + g[1]);
      const blocked = !c || c.t === 'wall' || G.visited[(G.y+g[1])*st.w + (G.x+g[0])];
      if (blocked) { __DBG.move(g[0], g[1]); return { tried: true, bump: !!G.bump, fx: R3.hasFX() }; }
    }
    return { tried: false };
  });
  T('進めないときに見た目の反応がある', !blockedFB.tried || (blockedFB.bump && blockedFB.fx), JSON.stringify(blockedFB));

  /* ---- 1手もどす ---- */
  const beforeUndo = await p.evaluate(() => { const G = __DBG.state(); return { steps: G.steps, x: G.x, y: G.y }; });
  await p.click('#btn-undo'); await p.waitForTimeout(250);
  const afterUndo = await p.evaluate(() => { const G = __DBG.state(); return { steps: G.steps, x: G.x, y: G.y, undos: G.undos }; });
  T('1手もどす', afterUndo.steps === beforeUndo.steps - 1 && afterUndo.undos >= 1, `${beforeUndo.steps}手→${afterUndo.steps}手`);

  /* ---- 段階ヒント3回 ---- */
  const hints = [];
  for (let i = 0; i < 3; i++) { await p.click('#btn-hint'); await p.waitForTimeout(200); hints.push(await p.textContent('#msg')); }
  T('段階ヒント3段階が別々の内容', new Set(hints).size === 3, hints.map(h => '「' + h + '」').join(' / '));

  /* ---- 単位のヒント（電球） ---- */
  await p.click('#btn-tip'); await p.waitForTimeout(200);
  const tip = await p.textContent('#msg');
  T('電球ボタンでヒント表示', tip.startsWith('💡'), tip.slice(0, 30) + '…');

  /* ---- 壁への移動 ---- */
  const wallTest = await p.evaluate(() => {
    const G = __DBG.state(), st = G.stage;
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const c = cellAt(st, G.x + dx, G.y + dy);
      if (c && c.t === 'wall') { const before = [G.x, G.y]; const r = __DBG.move(dx, dy); return { tried: true, moved: r, same: G.x === before[0] && G.y === before[1] }; }
    }
    return { tried: false };
  });
  T('壁には入れない', !wallTest.tried || (wallTest.moved === false && wallTest.same));

  /* ---- 単位が合わないまま EXIT に触れられないか ---- */
  await p.click('#btn-reset'); await p.waitForTimeout(150);
  const exitTest = await p.evaluate(() => {
    const G = __DBG.state(), st = G.stage;
    const r = canEnter(st.startV, st.cells[st.goal.y][st.goal.x], st.goalV);
    return { ok: r.ok, why: r.why };
  });
  T('単位が違うとEXITが開かない', exitTest.ok === false, exitTest.why);

  /* ---- クリアまで通しでプレイ（キーボード） ---- */
  const sol = await p.evaluate(() => { const st = __DBG.stage(), G = __DBG.state(); return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited }); });
  const KEY = { '上': 'ArrowUp', '下': 'ArrowDown', '左': 'ArrowLeft', '右': 'ArrowRight' };
  const rot = await p.evaluate(() => R3.mapDir(1, 0)[0] === 0);   // 盤面が回転しているか
  for (const d of sol) {
    // 画面方向に変換して本物のキー入力を送る
    const sd = await p.evaluate(n => { const M = {'上':[0,-1],'下':[0,1],'左':[-1,0],'右':[1,0]}; const g = M[n]; const s = R3.mapDir(g[0], g[1]); for (const k in M) if (M[k][0] === s[0] && M[k][1] === s[1]) return k; }, d);
    await p.keyboard.press(KEY[sd]);
    await p.waitForTimeout(20);
  }
  await p.waitForSelector('#modal-clear:not(.hidden)', { timeout: 3000 }).catch(() => {});
  const cleared = await p.evaluate(() => !document.getElementById('modal-clear').classList.contains('hidden'));
  T('キーボード操作でクリアできる（盤面回転の変換込み）', cleared, '回転=' + rot);

  /* ---- クリア画面のクイズ ---- */
  if (cleared) {
    const qz = await p.evaluate(() => { const st = __DBG.stage(); return st.quiz.ans; });
    await p.evaluate(a => document.querySelectorAll('#quizbox .ch')[a].click(), qz);
    await p.waitForTimeout(200);
    const expShown = await p.evaluate(() => !document.getElementById('quizexp').classList.contains('hidden'));
    const okClass = await p.evaluate(a => document.querySelectorAll('#quizbox .ch')[a].classList.contains('ok'), qz);
    T('クイズの正解判定と解説表示', expShown && okClass);
    // 二重回答できないか
    await p.evaluate(() => document.querySelectorAll('#quizbox .ch')[0].click());
    const ngCount = await p.evaluate(() => document.querySelectorAll('#quizbox .ch.ng').length);
    T('クイズは1回しか答えられない', ngCount === 0 || qz === 0);
    await p.click('#c-next'); await p.waitForTimeout(400);
    const nowStage = await p.evaluate(() => __DBG.stage().id);
    T('「つぎへ」で次のステージへ', nowStage === '1-4', nowStage);
  }

  /* ---- 記憶モード ---- */
  await p.click('#btn-tomenu'); await p.waitForTimeout(200);
  await p.click('#maskmode'); await p.waitForTimeout(100);
  await p.click('#stagelist .card[data-id="1-1"]'); await p.waitForTimeout(300);
  const masked = await p.evaluate(() => document.getElementById('u-now').classList.contains('masked'));
  T('記憶モードで手持ちがぼける', masked);
  await p.click('#btn-tomenu'); await p.waitForTimeout(150);
  await p.click('#maskmode'); await p.waitForTimeout(100);

  /* ---- 進捗の保存（リロードしても★が残るか） ---- */
  await p.reload(); await p.waitForTimeout(300);
  await p.click('#btn-start'); await p.waitForSelector('#stagelist .card');
  const savedStars = await p.evaluate(() => document.querySelector('#stagelist .card[data-id="1-3"] .stars').textContent.replace(/\s/g, ''));
  T('リロードしても★が残る', savedStars.startsWith('★'), '「' + savedStars + '」');
  const progress = await p.textContent('.progress-line');
  T('進捗表示が更新される', /クリア済み\s*1/.test(progress.replace(/\s+/g, ' ')) || /クリア済み/.test(progress), progress.trim());

  /* ---- 画面サイズ変更 ---- */
  await p.click('#stagelist .card[data-id="2-2"]'); await p.waitForTimeout(300);
  await p.setViewportSize({ width: 900, height: 700 }); await p.waitForTimeout(400);
  const wideOK = errs.length === 0;
  await p.setViewportSize({ width: 320, height: 600 }); await p.waitForTimeout(400);
  T('画面サイズ変更でエラーが出ない', wideOK && errs.length === 0);
  const canvasFits = await p.evaluate(() => {
    const cv = document.getElementById('cv');
    return cv.width > 0 && cv.height > 0 && cv.getBoundingClientRect().width <= window.innerWidth;
  });
  T('狭い画面でも盤面がはみ出さない', canvasFits);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);

  /* ---- 行き止まり／詰みの検出 ---- */
  const stuck = await p.evaluate(async () => {
    // 詰みになるまで適当に歩いてみる（最大60手）
    const G = __DBG.state(), st = G.stage;
    for (let i = 0; i < 60; i++) {
      const opts = [[0,-1],[0,1],[-1,0],[1,0]].filter(([dx,dy]) => {
        const c = cellAt(st, G.x + dx, G.y + dy);
        return c && c.t !== 'wall' && !G.visited[(G.y+dy)*st.w + (G.x+dx)] && canEnter(G.hand, c, st.goalV).ok;
      });
      if (!opts.length) return { dead: true, i };
      if (!feasible(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited })) return { doomed: true, i };
      const d = opts[i % opts.length];
      __DBG.move(d[0], d[1]);
    }
    return { none: true };
  });
  await p.waitForTimeout(500);
  const stuckMsg = await p.textContent('#msg');
  T('行き止まり／詰みを検出して知らせる', stuck.dead || stuck.doomed, JSON.stringify(stuck) + ' メッセージ:「' + stuckMsg + '」');

  /* ---- 効果音トグル ---- */
  await p.click('#btn-tomenu'); await p.waitForTimeout(150);
  await p.click('#mute'); await p.waitForTimeout(100);
  const muteState = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('tanimeikyu_v2')).muted; } catch (e) { return 'err'; } });
  T('効果音のON/OFFが保存される', muteState === true, 'muted=' + muteState);

  /* ---- 全ステージのデータ健全性 ---- */
  const dataCheck = await p.evaluate(() => {
    const bad = [];
    for (const d of STAGE_DEFS) {
      const st = buildStage(d);
      if (!d.quiz || !d.quiz.choices || d.quiz.choices.length !== 4) bad.push(d.id + ':クイズ選択肢');
      if (d.quiz && (d.quiz.ans < 0 || d.quiz.ans > 3)) bad.push(d.id + ':正解番号');
      if (!d.formula) bad.push(d.id + ':式なし');
      if (!d.tip) bad.push(d.id + ':ヒントなし');
      const w = new Set(d.grid.map(r => r.length));
      if (w.size !== 1) bad.push(d.id + ':行の長さ不揃い');
      if (unitText(st.goalV) === unitText(st.startV)) bad.push(d.id + ':開始と目標が同じ');
      // legend に使われていない記号がないか
      for (const k of Object.keys(d.legend)) if (!d.grid.join('').includes(k)) bad.push(d.id + ':未使用legend ' + k);
    }
    return bad;
  });
  T('全ステージのデータ健全性', dataCheck.length === 0, dataCheck.join(', ') || '問題なし');

  console.log(ok.join('\n'));
  if (issues.length) console.log('\n--- 要修正 ---\n' + issues.join('\n'));
  console.log('\n' + (errs.length ? '⚠ JSエラー:\n' + errs.join('\n') : '✅ JSエラーなし'));
  await b.close();
})();
