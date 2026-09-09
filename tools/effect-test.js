/* 効果測定テスト（test/index.html）が通しで動くかを確認する。
   受験 → 結果コード → 集計、まで一気に検査する。 */
const { chromium } = require('playwright');
const path = require('path');

const F = 'file://' + path.join(__dirname, '..', 'test', 'index.html');
const ok = [], ng = [];
const T = (name, cond, detail) => (cond ? ok : ng).push(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

// 正解の選択肢（0始まり）。test/index.html の Q と一致していること
const ANS = [1, 1, 1, 1, 0, 2, 1, 1, 0, 2];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(F);

  /* ---- 10問に答える。correct 個だけ正解し、残りは「わからない」 ---- */
  const answer = async (correct) => {
    for (let i = 0; i < 10; i++) {
      const pick = i < correct ? ANS[i] : -1;
      await p.click(`#q-choices .ch[data-i="${pick}"]`);
      await p.waitForTimeout(40);
      // 最終問だけは自動で進まないので、選び終わったらそのまま
    }
  };

  await p.fill('#who', 'TESTER');
  await p.click('#btn-begin');
  await p.waitForSelector('#s-quiz:not(.hidden)');
  T('事前テストが始まる', await p.isVisible('#q-text'));

  await answer(4);                       // 事前は4問正解（問9・10は不正解）
  await p.click('#btn-next');            // → ゲーム画面
  await p.waitForSelector('#s-play:not(.hidden)');
  T('プレイ画面に進む', await p.isVisible('#timer'));
  T('ゲームへのリンクが公開URL', (await p.getAttribute('#s-play a', 'href')) === 'https://ufclaude0i-star.github.io/tani-meikyu/');

  await p.click('#btn-timer');
  await p.waitForTimeout(1200);
  const t = await p.textContent('#timer');
  T('タイマーが動く', /^19:5\d$/.test(t), t);

  await p.fill('#reached', '2-3');
  await p.click('#btn-post');
  await p.waitForSelector('#s-quiz:not(.hidden)');
  T('事後テストに進む', (await p.textContent('#phase-label')).includes('事後'));

  await answer(9);                       // 事後は9問正解（問9まで正解、問10は不正解）
  await p.click('#btn-next');
  await p.waitForSelector('#s-done:not(.hidden)');

  const code = (await p.textContent('#result-code')).trim();
  T('結果コードが出る', /^TM-TESTER-4\/9-0\/1$/.test(code), code);
  const detail = await p.textContent('#result-detail');
  T('点数が表示される', detail.includes('4') && detail.includes('9'), detail.replace(/\s+/g, ' ').slice(0, 50));
  T('到達ステージが残る', detail.includes('2-3'));

  /* ---- 途中で閉じても再開できるか ---- */
  await p.reload();
  await p.waitForTimeout(300);
  T('再開の案内が出る', await p.isVisible('#resume'));

  /* ---- 集計 ---- */
  await p.click('#btn-agg');
  await p.waitForSelector('#s-agg:not(.hidden)');
  await p.fill('#agg-in', ['TM-YI-4/8-0/2', 'TM-KT-5/9-1/2', 'TM-AB-3/7-0/1', 'こわれた行'].join('\n'));
  await p.click('#btn-calc');
  await p.waitForTimeout(300);
  const out = await p.textContent('#agg-out');
  // 事前 (4+5+3)/30 = 40%、事後 (8+9+7)/30 = 80%
  T('全体の正答率を計算する', out.includes('40%') && out.includes('80%'), out.replace(/\s+/g, ' ').slice(0, 90));
  // 転移 事前 (0+1+0)/6 = 17%、事後 (2+2+1)/6 = 83%
  T('転移問題を別に集計する', out.includes('17%') && out.includes('83%'));
  T('読めない行を知らせる', out.includes('こわれた行'));
  const para = await p.inputValue('#para');
  T('作品概要に貼る文章が出る', para.includes('40% → 80%') && para.includes('3名'), para.slice(0, 60).replace(/\n/g, ' '));

  console.log([...ok, ...ng].join('\n'));
  console.log(errs.length ? '\n❌ エラー: ' + errs.join(' / ') : '\n✅ JSエラーなし');
  await b.close();
  if (ng.length) process.exit(1);
})();
