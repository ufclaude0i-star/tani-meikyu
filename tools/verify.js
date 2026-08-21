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
}
console.log(bad === 0 ? '\n全ステージ OK' : '\n問題あり: ' + bad + ' 件');
