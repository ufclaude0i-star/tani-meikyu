/* 「もどす」の回数制限が本当に効いているかを実ブラウザで確認する。
   使い切っても「やり直し」で復帰できること（＝誰も詰まないこと）まで確かめる。 */
const { chromium } = require('playwright');
const path = require('path');

const F = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const MOVE = { '上': [0, -1], '下': [0, 1], '左': [-1, 0], '右': [1, 0] };
const ok = [], ng = [];
const T = (name, cond, detail) => (cond ? ok : ng).push(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(F);

  const open = async id => {
    await p.evaluate(() => {
      document.getElementById('modal-clear').classList.add('hidden');
      const s = document.getElementById('screen-select');
      if (s.classList.contains('hidden')) document.getElementById('btn-start').click();
    });
    await p.waitForSelector('#stagelist .card');
    await p.click(`#stagelist .card[data-id="${id}"]`);
    await p.waitForTimeout(400);
  };
  const stepOnce = async () => {
    const d = await p.evaluate(() => {
      const st = __DBG.stage(), G = __DBG.state();
      const s = solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited });
      return s && s.length ? s[0] : null;
    });
    if (!d) return false;
    await p.evaluate(([a, c]) => __DBG.move(a, c), MOVE[d]);
    await p.waitForTimeout(160);
    return true;
  };
  const left = () => p.evaluate(() => __DBG.state().undoLeft);
  const btn = () => p.evaluate(() => ({
    disabled: document.getElementById('btn-undo').disabled,
    label: document.getElementById('undo-left').textContent
  }));
  const clickUndo = async () => { await p.evaluate(() => document.getElementById('btn-undo').click()); await p.waitForTimeout(200); };

  /* ---- 章ごとの配布数 ---- */
  for (const [id, want] of [['1-1', 5], ['2-2', 3], ['3-5', 2]]) {
    await open(id);
    const n = await left();
    T(`${id} の持ち回数が ${want} 回`, n === want, '実際 ' + n);
  }

  /* ---- 使うと減る／使い切ると押せなくなる ---- */
  await open('2-2');
  for (let i = 0; i < 4; i++) await stepOnce();
  let before = await left();
  await clickUndo();
  T('もどすと残りが1減る', (await left()) === before - 1, before + ' → ' + (await left()));

  await clickUndo(); await clickUndo();
  const zero = await left(), st0 = await btn();
  T('使い切ると残り0', zero === 0, '実際 ' + zero);
  T('使い切るとボタンが押せない', st0.disabled === true);
  T('残り回数がボタンに出ている', st0.label === '0', '表示 "' + st0.label + '"');

  // ボタンは disabled なのでクリックしても何も起きない（＝それが正しい）。
  // キーの Z はボタンを介さず undo() を直接呼ぶので、拒否の経路はこちらで確かめる。
  const stepsBefore = await p.evaluate(() => __DBG.state().steps);
  await p.keyboard.press('z');
  await p.waitForTimeout(250);
  T('使い切った後は Z キーでも もどせない（手数が変わらない）',
    (await p.evaluate(() => __DBG.state().steps)) === stepsBefore);
  const msg = await p.evaluate(() => document.getElementById('msg').textContent);
  T('使い切ったことを知らせる', /使い切/.test(msg), msg.slice(0, 40));

  /* ---- やり直しで復帰できる（＝詰まない） ---- */
  await p.evaluate(() => document.getElementById('btn-reset').click());
  await p.waitForTimeout(300);
  T('やり直すと持ち回数が戻る', (await left()) === 3, '実際 ' + (await left()));
  T('やり直すとスタート位置に戻る', (await p.evaluate(() => __DBG.state().steps)) === 0);

  /* ---- 設定で制限を外せる ---- */
  await p.evaluate(() => document.getElementById('btn-tomenu').click());
  await p.waitForTimeout(200);
  await p.evaluate(() => { const c = document.getElementById('undolimit'); c.checked = false; c.onchange(); });
  await open('3-5');
  const inf = await p.evaluate(() => __DBG.state().undoLeft === Infinity);
  T('設定を切ると無制限になる', inf);
  await p.evaluate(() => document.getElementById('btn-reset').click());
  await p.waitForTimeout(200);
  const st1 = await btn();
  T('無制限のときは残り回数を出さない', st1.label === '', '表示 "' + st1.label + '"');

  /* ---- 設定が保存される ---- */
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('tanimeikyu_v2')).undoLimit);
  T('設定が保存される', saved === false, 'undoLimit=' + saved);
  await p.reload(); await p.waitForTimeout(400);
  await p.click('#btn-start'); await p.waitForSelector('#stagelist .card');
  T('リロードしても設定が残る', (await p.evaluate(() => document.getElementById('undolimit').checked)) === false);

  console.log([...ok, ...ng].join('\n'));
  console.log(errs.length ? '\n❌ JSエラー: ' + errs.join(' / ') : '\n✅ JSエラーなし');
  await b.close();
  if (ng.length) process.exit(1);
})();
