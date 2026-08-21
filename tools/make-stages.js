const fs = require('fs'), path = require('path');
const { generate } = require('./gen.js');
const specs = require('./specs.js');
const core = require('../src/core.js');

const out = [];
let fail = 0;
for (const spec of specs) {
  const t0 = Date.now();
  const d = generate(spec);
  if (!d) { console.log('❌ ' + spec.id + ' 生成失敗'); fail++; continue; }
  const st = core.buildStage(d);
  console.log(`✅ ${d.id.padEnd(4)} ${d.title.padEnd(11)} ${st.w}x${st.h}  ` +
    `${core.unitText(st.startV).padEnd(9)} → ${core.unitText(st.goalV).padEnd(14)} ` +
    `最短 ${String(d.__par).padStart(3)}手  分岐点 ${String(d.__junction).padStart(2)}  袋小路 ${String(d.__dead).padStart(2)}  seed=${d.__seed} (${Date.now() - t0}ms)`);
  out.push(d);
}
if (fail) { console.log('\n生成に失敗したステージがある'); process.exit(1); }

const body = out.map(d => {
  const legend = Object.keys(d.legend).map(k => `    ${/^[A-Za-z]$/.test(k) ? k : "'" + k + "'"}: ${JSON.stringify(d.legend[k])}`).join(',\n');
  return `{
  id: ${JSON.stringify(d.id)}, chapter: ${JSON.stringify(d.chapter)}, title: ${JSON.stringify(d.title)},
  story: ${JSON.stringify(d.story)},
  start: ${JSON.stringify(d.start)}, goal: ${JSON.stringify(d.goal)}, par: ${d.__par},
  grid: [
${d.grid.map(r => '    ' + JSON.stringify(r)).join(',\n')}
  ],
  legend: {
${legend}
  },
  tip: ${JSON.stringify(d.tip)},
  formula: ${JSON.stringify(d.formula)},
  quiz: ${JSON.stringify(d.quiz)}
}`;
}).join(',\n');

const src = `/* ============================================================
   単位迷宮 — ステージデータ
   tools/make-stages.js が tools/specs.js（教育的な中身）と
   tools/gen.js（迷路生成）から自動生成したもの。手で書き換えないこと。
   すべてのステージは「後戻り禁止」ソルバで解けることを確認済み。
   ============================================================ */
var STAGE_DEFS = [
${body}
];

if (typeof module !== 'undefined' && module.exports) module.exports = STAGE_DEFS;
`;
fs.writeFileSync(path.join(__dirname, '..', 'src', 'stages.js'), src, 'utf8');
console.log('\nsrc/stages.js を書き出した（' + out.length + 'ステージ）');
