const core = require('../src/core.js');
const defs = require('../src/stages.js');
let bad = 0;
for (const def of defs) {
  let st;
  try { st = core.buildStage(def); } catch (e) { console.log('❌ ' + def.id + ' 構築失敗: ' + e.message); bad++; continue; }
  // 幅チェック
  const widths = new Set(def.grid.map(r => r.length));
  if (widths.size > 1) { console.log('⚠️  ' + def.id + ' 行の長さが不揃い: ' + [...widths].join(',')); bad++; }
  if (!st.start || !st.goal) { console.log('❌ ' + def.id + ' S か G がない'); bad++; continue; }
  const t0 = Date.now();
  const path = core.solve(st, { x: st.start.x, y: st.start.y, hand: st.startV, mask: 0 });
  const ms = Date.now() - t0;
  if (!path) { console.log('❌ ' + def.id + ' 「' + def.title + '」 解けない！ (' + ms + 'ms)'); bad++; continue; }
  // 参考: 何もせずゴールに行けてしまわないか（＝パズルとして成立しているか）
  const trivialStage = JSON.parse(JSON.stringify(def));
  console.log('✅ ' + def.id.padEnd(4) + ' ' + def.title.padEnd(12) +
    ' ' + core.unitText(st.startV).padEnd(10) + ' → ' + core.unitText(st.goalV).padEnd(14) +
    ' 最短 ' + String(path.length).padStart(3) + ' 手  (' + ms + 'ms)');
  def.__par = path.length;

  /* 袋小路（次数1のセル）が残っていないか。
     後戻り禁止のゲームでは、何も置かれていない袋小路は「入ったら もどす しかない」
     純粋な罰で、プレイヤーが得るものが何もない。生成器が潰しているはずなので、
     ここで見つかったら生成器の退行を疑うこと。 */
  var dead = [], junction = 0;
  for (var yy = 0; yy < st.h; yy++) for (var xx = 0; xx < st.w; xx++) {
    var deg = 0;
    for (var di = 0; di < 4; di++) if (core.canGo(st, xx, yy, di)) deg++;
    if (deg >= 3) junction++;
    if (deg <= 1) dead.push(xx + ',' + yy);
  }
  if (dead.length) { console.log('   ⚠ ' + def.id + ' に袋小路が ' + dead.length + ' 個ある: ' + dead.join(' ')); bad++; }
  var cells = st.w * st.h;
  if (junction < cells * 0.28) { console.log('   ⚠ ' + def.id + ' は分岐点が少なく単調（' + junction + '/' + cells + '）'); bad++; }
}
console.log(bad === 0 ? '\n全ステージ OK' : '\n問題あり: ' + bad + ' 件');
