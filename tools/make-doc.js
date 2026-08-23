/* docs/*.html を提出用の PDF にする。
   審査員が確実に開けるように PDF で出す（Word だと環境差でレイアウトが崩れる）。 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const DOCS = path.join(__dirname, '..', 'docs');
const TARGETS = [
  { html: 'overview.html', pdf: '単位迷宮_作品概要と動作方法.pdf' },
  { html: 'pretest.html', pdf: '単位迷宮_事前事後テスト.pdf' }
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const t of TARGETS) {
    const src = path.join(DOCS, t.html);
    if (!fs.existsSync(src)) { console.log('skip ' + t.html); continue; }
    await p.goto('file://' + src, { waitUntil: 'networkidle' });
    const out = path.join(DOCS, t.pdf);
    await p.pdf({ path: out, format: 'A4', printBackground: true });
    const kb = (fs.statSync(out).size / 1024).toFixed(0);
    const pages = await p.evaluate(() => Math.ceil(document.body.scrollHeight / (297 / 25.4 * 96)));
    console.log(`${t.pdf}  ${kb} KB  （おおよそ ${pages} ページ）`);
  }
  await b.close();
})();
