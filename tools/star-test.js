/* ★の条件表示を検査する。
   いちばん大事なのは「プレイ中に出している★」と「クリア画面で実際にもらえる★」が
   一致していること。ここがズレると、プレイヤーに嘘をついたことになる。 */
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
  // 表示されている★の数（消えている★を引く）
  const shownStars = () => p.evaluate(() =>
    3 - document.querySelectorAll('#star-mark .off').length);
  const condText = () => p.evaluate(() => document.getElementById('star-cond').textContent);
  const stepOnce = async () => {
    const d = await p.evaluate(() => {
      const st = __DBG.stage(), G = __DBG.state();
      const s = solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited });
      return s && s.length ? s[0] : null;
    });
    if (!d) return false;
    await p.evaluate(([a, c]) => __DBG.move(a, c), MOVE[d]);
    await p.waitForTimeout(140);
    return true;
  };
  const undoOnce = async () => { await p.evaluate(() => document.getElementById('btn-undo').click()); await p.waitForTimeout(180); };
  const hintOnce = async () => { await p.evaluate(() => document.getElementById('btn-hint').click()); await p.waitForTimeout(180); };

  /* ---- 初期表示 ---- */
  await open('1-3');
  T('最初は★3が表示される', (await shownStars()) === 3, '実際 ' + (await shownStars()));
  T('条件が数字で見えている', /ヒント 0\/0/.test(await condText()) && /もどす 0\/2/.test(await condText()),
    '"' + (await condText()) + '"');

  /* ---- もどすと表示が変わる ---- */
  for (let i = 0; i < 4; i++) await stepOnce();
  await undoOnce(); await undoOnce();
  T('もどす2回までは★3のまま', (await shownStars()) === 3, '実際 ' + (await shownStars()));
  T('もどした回数が数えられている', /もどす 2\/2/.test(await condText()), '"' + (await condText()) + '"');
  await undoOnce();
  T('もどす3回で★が減る', (await shownStars()) < 3, '実際 ' + (await shownStars()));
  T('条件を外れたら色が変わる',
    (await p.evaluate(() => document.getElementById('hud-star').className)).includes('lost'));

  /* ---- ヒントでも減る ---- */
  await open('1-4');
  T('ステージを変えると★3に戻る', (await shownStars()) === 3);
  await hintOnce();
  T('ヒントを1回使うと★が減る', (await shownStars()) < 3, '実際 ' + (await shownStars()));

  /* ---- プレイ中の表示とクリア画面の★が一致する ---- */
  const cases = [
    { id: '2-1', undos: 0, hints: 0, want: 3 },
    { id: '2-3', undos: 3, hints: 0, want: 2 },
    { id: '3-1', undos: 0, hints: 2, want: 1 }
  ];
  for (const c of cases) {
    await open(c.id);
    for (let i = 0; i < 4; i++) await stepOnce();
    for (let i = 0; i < c.undos; i++) await undoOnce();
    for (let i = 0; i < c.hints; i++) await hintOnce();
    const beforeClear = await shownStars();
    T(`${c.id} プレイ中の表示が★${c.want}`, beforeClear === c.want, '実際 ' + beforeClear);
    // クリアまで進める
    for (let i = 0; i < 60; i++) { if (!(await stepOnce())) break; }
    await p.waitForTimeout(700);
    const got = await p.evaluate(() => 3 - document.querySelectorAll('.stars-big .off').length);
    T(`${c.id} クリア画面の★が表示と一致`, got === beforeClear, '表示 ' + beforeClear + ' / 実際 ' + got);
    const rule = await p.evaluate(() => {
      const e = document.querySelector('.star-rule'); return e ? e.textContent : '';
    });
    T(`${c.id} クリア画面に★3の条件が出ている`, /★★★/.test(rule), '"' + rule.slice(0, 46) + '"');
  }

  console.log([...ok, ...ng].join('\n'));
  console.log(errs.length ? '\n❌ JSエラー: ' + errs.join(' / ') : '\n✅ JSエラーなし');
  await b.close();
  if (ng.length) process.exit(1);
})();
