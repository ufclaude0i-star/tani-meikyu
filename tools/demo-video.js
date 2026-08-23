/* 応募用の1分デモ動画を撮る。
   審査員は何十本も見るので、説明より先に動いている画面を出す。
   ナレーションの代わりにテロップを焼き込む（音声なし）。
   出力: demo/ に webm。倍速にはしない（何が起きているか読めなくなるため）。 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const F = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const OUT = path.join(__dirname, '..', 'demo');
const MOVE = { '上': [0, -1], '下': [0, 1], '左': [-1, 0], '右': [1, 0] };

const CSS = `
#__cap{position:fixed;left:0;right:0;bottom:0;z-index:99999;pointer-events:none;
  background:linear-gradient(180deg,rgba(20,19,18,0) 0%,rgba(20,19,18,.90) 42%,rgba(20,19,18,.94) 100%);
  color:#fff;font:700 27px/1.55 system-ui,"Segoe UI","Yu Gothic UI",sans-serif;
  padding:54px 64px 30px;text-align:center;opacity:0;transition:opacity .3s;
  letter-spacing:.01em;text-shadow:0 2px 8px rgba(0,0,0,.45)}
#__cap.on{opacity:1}
#__cap em{font-style:normal;color:#7FE3C8}
#__badge{position:fixed;top:16px;left:20px;z-index:99999;pointer-events:none;
  font:600 12.5px system-ui,"Yu Gothic UI",sans-serif;color:#A8A29E;letter-spacing:.12em;
  opacity:0;transition:opacity .3s}
#__badge.on{opacity:1}
#__end{position:fixed;inset:0;z-index:99998;pointer-events:none;background:#FAFAF9;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  opacity:0;transition:opacity .45s}
#__end.on{opacity:1}
#__end .t{font:700 62px system-ui,"Yu Gothic UI",sans-serif;letter-spacing:.16em;color:#1C1917}
#__end .s{font:600 14px system-ui;letter-spacing:.3em;color:#A8A29E}
#__end .u{font:600 19px system-ui,"Yu Gothic UI",sans-serif;color:#1B7A67;margin-top:12px}
#__end .c{font:500 15px system-ui,"Yu Gothic UI",sans-serif;color:#78716C}
#__end .url{font:600 17px ui-monospace,Consolas,monospace;color:#1C1917;margin-top:18px;
  border:1px solid #E7E5E4;background:#fff;border-radius:10px;padding:10px 20px}
#__end .c2{font:500 12.5px system-ui,"Yu Gothic UI",sans-serif;color:#A8A29E}
#__end .credit{position:fixed;bottom:18px;left:0;right:0;text-align:center;
  font:500 12px system-ui,"Yu Gothic UI",sans-serif;color:#C0BBB4;letter-spacing:.04em}
`;

const INIT = () => {
  const d = document;
  const cap = d.createElement('div'); cap.id = '__cap'; d.body.appendChild(cap);
  const bad = d.createElement('div'); bad.id = '__badge';
  bad.textContent = '単位迷宮 — DIMENSION LABYRINTH'; d.body.appendChild(bad);
  const end = d.createElement('div'); end.id = '__end';
  end.innerHTML = '<div class="t">単位迷宮</div><div class="s">DIMENSION LABYRINTH</div>' +
    '<div class="u">公式を覚えるのではなく、単位から組み立てる。</div>' +
    '<div class="c">第7回 学力向上アプリコンテスト 応募作品</div>' +
    '<div class="url">https://ufclaude0i-star.github.io/tani-meikyu/</div>' +
    '<div class="c2">index.html をダブルクリックするだけでも動きます（インストール・通信 不要）</div>' +
    '<div class="credit">ナレーション音声 VOICEVOX：ずんだもん</div>';
  d.body.appendChild(end);
  window.__cap = t => { const e = d.getElementById('__cap'); if (t) { e.innerHTML = t; e.classList.add('on'); } else e.classList.remove('on'); };
  window.__badge = on => d.getElementById('__badge').classList.toggle('on', !!on);
  window.__end = on => d.getElementById('__end').classList.toggle('on', !!on);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) {   // フォルダ（frames）は消さない
    const q = path.join(OUT, f);
    if (fs.statSync(q).isFile()) fs.unlinkSync(q);
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } }
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  const wait = ms => p.waitForTimeout(ms);
  const cap = (t) => p.evaluate(t => window.__cap(t), t);
  const t0 = Date.now();
  const mark = s => console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${s}`);
  const timeline = {};
  // ナレーションの読み始め位置。動画を撮り直しても原稿の位置がズレないようにする
  const cue = k => { timeline[k] = Date.now() - t0; };

  // 盤面までを1画面に収める（下のルール欄は動画では読めないので映さない）
  await p.goto(F);
  await p.addStyleTag({ content: CSS });
  await p.evaluate(INIT);
  await p.evaluate(() => { window.__badge(true); });

  // 進む手順は毎回ソルバに解かせる。手で座標を書くとステージを直したとき壊れるため
  const solvePath = () => p.evaluate(() => {
    const st = __DBG.stage(), G = __DBG.state();
    return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited });
  });
  const step = async (name, ms) => { await p.evaluate(([a, b]) => __DBG.move(a, b), MOVE[name]); await wait(ms || 470); };
  const openStage = async (id) => {
    await p.evaluate(() => {
      document.getElementById('modal-clear').classList.add('hidden');
      document.getElementById('modal-howto').classList.add('hidden');
      const s = document.getElementById('screen-select');
      if (s.classList.contains('hidden')) document.getElementById('btn-start').click();
    });
    await p.waitForSelector('#stagelist .card');
    await p.click(`#stagelist .card[data-id="${id}"]`);
    await wait(700);
  };
  const hand = () => p.evaluate(() => R3.uniStr(__DBG.state().hand));
  const cancels = () => p.evaluate(() => __DBG.state().cancels);

  /* ============ 1. 単位を持ち歩く（0:00–0:11） ============ */
  mark('scene1 単位を持ち歩く');
  cue('n1');
  await openStage('1-3');                       // kg → N
  await cap('主人公の球が持っているのは、物理の<em>単位</em>');
  await wait(3200);
  await cap('道に浮かぶ球を通ると、手持ちの単位が掛け算・割り算される');
  let pathA = await solvePath();
  for (const n of pathA.slice(0, 4)) await step(n, 560);
  mark('  手持ち = ' + (await hand()));
  await wait(900);

  /* ============ 2. 道が崩れる（0:11–0:21） ============ */
  mark('scene2 道が崩れる');
  cue('n2');
  await cap('一度通った道は<em>崩れて、二度と通れない</em>');
  for (const n of pathA.slice(4, 7)) await step(n, 560);
  await wait(2100);
  await cap('だから分かれ道の選択が、そのまま「どの演算を使うか」の決定になる');
  for (const n of pathA.slice(7, 10)) await step(n, 560);
  await wait(2500);

  /* ============ 3. EXITに単位を合わせる（0:21–0:34） ============ */
  mark('scene3 EXIT');
  cue('n3');
  await cap('EXIT が要求する単位に、<em>ぴったり</em>合わせたときだけ扉が開く');
  for (const n of pathA.slice(10)) await step(n, 560);
  await p.waitForSelector('#modal-clear:not(.hidden)');
  await wait(700);
  mark('  クリア画面');
  await cap('遊び終わってから、それが<em>本物の公式</em>だったと分かる');
  await wait(5400);

  /* ============ 4. 相殺（0:34–0:46） ============ */
  mark('scene4 相殺');
  cue('n4');
  await p.evaluate(() => document.getElementById('c-select').click());
  await wait(400);
  await cap('');
  await openStage('2-1');                       // 相殺のコツ J → W
  await cap('同じ単位で割ると<em>相殺</em>して、球が縮む');
  const pathB = await solvePath();
  let before = await cancels(), shown = 0;
  for (const n of pathB.slice(0, pathB.length - 1)) {   // 最後の1手は踏まない＝クリアさせない
    await step(n, 460);
    const c = await cancels();
    if (c > before) {                            // 相殺が起きた瞬間で少し止めて見せる
      before = c; shown++;
      await wait(1900);
      if (shown === 1) await cap('相殺した瞬間だけ、金のリングが弾ける');
      if (shown >= 2) break;
    }
  }
  await wait(1500);
  cue('n5');
  await cap('この「割って消す」感覚が、次元解析そのもの');
  await wait(4700);

  /* ============ 5. 関門（0:46–0:53） ============ */
  mark('scene5 関門');
  cue('n6');
  await cap('');
  await openStage('2-2');                       // 圧力の迷宮（関門つき）
  await cap('関門は<em>条件を満たす単位のとき</em>しか通れない。拾う順番が問われる');
  const pathC = await solvePath();
  for (const n of pathC.slice(0, 7)) await step(n, 470);
  await wait(2900);

  /* ============ 6. 全13ステージ（0:53–0:58） ============ */
  mark('scene6 ステージ一覧');
  cue('n7');
  await cap('');
  await p.click('#btn-tomenu'); await wait(500);
  await cap('力学・電気・熱をあつかう全13ステージ');
  await p.evaluate(() => new Promise(res => {
    const top = document.documentElement.scrollHeight - innerHeight;
    let y = 0;
    (function tick() { y += 7; scrollTo(0, Math.min(y, top)); y < top ? requestAnimationFrame(tick) : res(); })();
  }));
  await wait(2600);

  /* ============ 7. タイトル（0:58–1:04） ============ */
  mark('scene7 タイトル');
  cue('n8');
  await p.evaluate(() => scrollTo(0, 0));
  await cap('');
  await p.evaluate(() => { window.__badge(false); window.__end(true); });
  await wait(6800);

  mark('撮影終了');
  await ctx.close();          // ここで動画が書き出される
  await browser.close();

  timeline.__end = Date.now() - t0;
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2), 'utf8');
  console.log('ナレーションの位置: ' + Object.keys(timeline).map(k => k + '=' + (timeline[k]/1000).toFixed(1) + 's').join('  '));

  const file = fs.readdirSync(OUT).find(f => f.endsWith('.webm'));
  const dst = path.join(OUT, 'tani-meikyu-demo.webm');
  if (file && path.join(OUT, file) !== dst) fs.renameSync(path.join(OUT, file), dst);
  const mb = (fs.statSync(dst).size / 1024 / 1024).toFixed(2);
  console.log(`\n出力: ${dst}  (${mb} MB)`);
  console.log(errs.length ? 'JSエラー: ' + errs.join(' / ') : 'JSエラーなし');
})();
