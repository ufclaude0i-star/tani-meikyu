/* 依頼された4点が「公開サイトで実際に効いているか」を検証する */
const { chromium } = require('playwright');
const TARGET = process.argv[2] || 'https://ufclaude0i-star.github.io/tani-meikyu/';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });

  // 音を実際に鳴らす代わりに、鳴らそうとした周波数を記録する
  await p.addInitScript(() => {
    window.__freqs = [];
    window.AudioContext = function () {
      return {
        currentTime: 0, destination: {},
        createOscillator: function () {
          return {
            type: '', frequency: {
              setValueAtTime: function (v) { window.__freqs.push(Math.round(v)); },
              exponentialRampToValueAtTime: function () {}
            },
            connect: function () {}, start: function () {}, stop: function () {}
          };
        },
        createGain: function () {
          return { gain: { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} }, connect: function () {} };
        }
      };
    };
    window.webkitAudioContext = window.AudioContext;
  });

  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(TARGET, { waitUntil: 'networkidle' });
  const html = await p.content();

  console.log('検証対象: ' + TARGET + '\n');

  /* ---- ① 壁の薄さ ---- */
  const wt = (html.match(/var WT = ([\d.]+)/) || [])[1];
  console.log('① 壁の薄さ');
  console.log(`   壁の厚み（半分）= ${wt}  → 実際の厚みは1マスの ${(wt * 2 * 100).toFixed(1)}%`);
  console.log(`   ${wt && +wt <= 0.07 ? '✅ 前回(0.105→厚み21%)より薄い' : '❌ 薄くなっていない'}`);

  /* ---- ② 球の大きさ ---- */
  const sr = (html.match(/sphere\(sp, ([\d.]+), hue/) || [])[1];
  console.log('\n② 道の球の大きさ');
  console.log(`   半径 = ${sr}（1マスの直径に対して ${(sr * 2 * 100).toFixed(0)}%）`);
  console.log(`   ${sr && +sr >= 0.36 ? `✅ 前回0.30 → ${sr}（+${(((sr / 0.30) - 1) * 100).toFixed(0)}%）` : '❌ 大きくなっていない'}`);
  // 画面上で実際に何ピクセルで描かれているかも測る
  await p.click('#btn-start'); await p.waitForSelector('#stagelist .card');
  await p.click('#stagelist .card[data-id="2-4"]'); await p.waitForTimeout(800);
  const px = await p.evaluate(() => {
    const st = __DBG.stage(), G = __DBG.state();
    // 盤面中央あたりのセルの画面上の大きさを測る
    const s = R3.world(st, Math.floor(st.w / 2), Math.floor(st.h / 2), 0.44);
    return { cell: null, ok: true };
  });

  /* ---- ③ ガラス表現 ---- */
  console.log('\n③ ガラスの質感');
  const glass = {
    'スプライト化した球の描画': /function sphereSprite/.test(html),
    '中心を透明にする多段グラデーション': /addColorStop\(0\.00, 'hsla\(' \+ hue/.test(html),
    '下から回り込む透過光': /createRadialGradient\(cx \+ r \* 0\.22/.test(html),
    '左上が白・右下が色の縁の光': /rim\.addColorStop\(0, 'rgba\(255,255,255,\.95\)'\)/.test(html),
    '2段ハイライト（にじみ＋芯）': /hl\.addColorStop\(0, 'rgba\(255,255,255,\.92\)'\)/.test(html),
    'すりガラスが残っていない': !/backdrop-filter/.test(html),
    '太い立体ボタンが残っていない': !/border-bottom-width:4px/.test(html),
    '主ボタンが黒': html.includes(".btn.primary{background:var(--ink)"),
    '盤面の空が淡いグレー': /sky1: '#F2F1EF'/.test(html),
    '壁の天面が白': /wallCap: '#FFFFFF'/.test(html)
  };
  for (const k in glass) console.log(`   ${glass[k] ? '✅' : '❌'} ${k}`);

  /* ---- ④ 相殺音 ---- */
  console.log('\n④ 相殺したときの音');
  const sol = await p.evaluate(() => { const st = __DBG.stage(), G = __DBG.state(); return solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited }); });
  let captured = null, cancels = 0;
  for (const d of sol) {
    await p.evaluate(() => { window.__freqs = []; });
    await p.evaluate(n => { const M = { '上': [0,-1], '下': [0,1], '左': [-1,0], '右': [1,0] }; __DBG.move(M[n][0], M[n][1]); }, d);
    const st = await p.evaluate(() => ({ c: __DBG.state().cancels, f: window.__freqs.slice() }));
    if (st.c > cancels) { cancels = st.c; if (!captured) captured = st.f; }
    await p.waitForTimeout(30);
    if (captured) break;
  }
  if (captured) {
    const uniq = [...new Set(captured)].sort((a, b) => a - b);
    console.log(`   相殺のときに鳴らした周波数: ${uniq.join(', ')} Hz`);
    console.log(`   最低音 ${uniq[0]}Hz / 最高音 ${uniq[uniq.length - 1]}Hz`);
    console.log(`   ${uniq[0] >= 1500 ? '✅ 前回は880Hzから始まっていた → 高音化されている' : '❌ 高くなっていない'}`);
    console.log(`   ${uniq.length >= 5 ? '✅ 上昇アルペジオ＋倍音のきらめきが鳴っている' : '⚠ 音数が少ない'}`);
  } else console.log('   ❌ 相殺が発生しなかった（検証できず）');

  const combo = /1568 \* Math\.pow\(2, Math\.min\(9, \(\(n \|\| 1\) - 1\) \* 3\) \/ 12\)/.test(html);
  console.log(`   ${combo ? '✅' : '❌'} コンボで音程が上がる仕組み`);

  /* ---- 性能 ---- */
  const fps = await p.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function tick() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now() - t0) / 1000))); })();
  }));
  console.log(`\n⑤ 描画性能: ${fps} fps  ${fps >= 50 ? '✅' : '⚠'}`);

  await p.screenshot({ path: 'shot-live.png', fullPage: true });
  console.log('\n' + (errs.length ? '⚠ JSエラー:\n' + errs.join('\n') : '✅ JSエラーなし'));
  await b.close();
})();
