/* スマホで操作系（スティック・もどす・やり直し・ヒント）が
   1画面目に収まっているかを全ステージで検査する。

   ここが画面外に落ちても、見た目は何も壊れないので気づけない。
   実際、説明文が2行になるステージでは長いあいだ画面外に落ちたままだった。
   説明文を1文字増やすだけで再発しうるので、テストで押さえる。 */
const { chromium } = require('playwright');
const path = require('path');

const F = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const IDS = ['1-1','1-2','1-3','1-4','2-1','2-2','2-3','2-4','3-1','3-2','3-3','3-4','3-5'];
// 収まっていてほしい画面。iPhone 14 相当と、小さめのAndroid
const SCREENS = [
  { w: 390, h: 844, name: 'iPhone 14 相当 390x844', must: true },
  { w: 360, h: 740, name: '小さめAndroid 360x740', must: true },
  { w: 360, h: 640, name: '古い小型機 360x640', must: false }
];
const ng = [], warn = [];
let okCount = 0;

(async () => {
  const b = await chromium.launch();
  for (const S of SCREENS) {
    const p = await b.newPage({ viewport: { width: S.w, height: S.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(F);
    await p.click('#btn-start');
    await p.waitForSelector('#stagelist .card');
    let worst = null;
    for (const id of IDS) {
      await p.evaluate(() => {
        const s = document.getElementById('screen-select');
        if (s.classList.contains('hidden')) document.getElementById('btn-tomenu').click();
      });
      await p.waitForSelector('#stagelist .card');
      await p.click(`#stagelist .card[data-id="${id}"]`);
      await p.waitForTimeout(260);
      const r = await p.evaluate(() => {
        const bot = el => Math.round(document.getElementById(el).getBoundingClientRect().bottom);
        return { joy: bot('joy'), undo: bot('btn-undo'), hint: bot('btn-hint'), vh: innerHeight };
      });
      const over = Math.max(r.joy, r.undo, r.hint) - r.vh;
      if (over > 0 && (!worst || over > worst.over)) worst = { id, over };
    }
    if (!worst) { okCount++; console.log(`✅ ${S.name}  全13ステージで操作系が1画面目に収まっている`); }
    else if (S.must) { ng.push(`❌ ${S.name}  ${worst.id} で ${worst.over}px はみ出している`); }
    else { warn.push(`⚠ ${S.name}  ${worst.id} で ${worst.over}px はみ出し（この画面は必須ではない）`); }
    if (errs.length) ng.push('❌ ' + S.name + ' でJSエラー: ' + errs.join(' / '));
    await p.close();
  }
  await b.close();

  [...ng, ...warn].forEach(x => console.log(x));
  console.log(ng.length ? `\n❌ 必須の画面で ${ng.length} 件はみ出している` : `\n✅ 必須の画面はすべて収まっている（${okCount}/${SCREENS.length} 画面がOK）`);
  if (ng.length) process.exit(1);
})();
