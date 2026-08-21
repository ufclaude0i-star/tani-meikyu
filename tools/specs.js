/* ステージ仕様（教育的な中身は手書き、迷路はここから生成） */
module.exports = [
{
  id: '1-1', chapter: '第1章 力学の単位', title: 'よけいなものを捨てる',
  story: '一度通った道は崩れて戻れない。まずは持っている m を捨てて EXIT へ。',
  start: 'm', goal: '1', ops: ['/m'], gates: 0,
  C: 3, R: 3, braid: 0.34, decoys: 2, seed: 11, short: true, wantJunctions: 2,
  decoyPool: ['*m', '*s', '*kg'],
  tip: '÷m を踏むと m が1つ減る。m ÷ m = 1（無次元）。',
  formula: 'm ÷ m = 1',
  quiz: { q: '「無次元」の量はどれ？', choices: ['速さ', '摩擦係数', '加速度', '力'], ans: 1,
          exp: '摩擦係数 μ は 力÷力 なので単位が消える。無次元量は単位を持たない。' }
},
{
  id: '1-2', chapter: '第1章 力学の単位', title: '速さをつくる',
  story: '速さ = 距離 ÷ 時間。分かれ道はどれも一度きり。選ぶ前に考えよう。',
  start: 'm', goal: 'm/s', ops: ['/s'], gates: 0,
  C: 4, R: 3, braid: 0.36, decoys: 3, seed: 7, short: true, wantJunctions: 4,
  decoyPool: ['*s', '*kg', '/kg', '*m'],
  tip: '「速さ」は m/s。距離を時間で割る、つまり ÷s。',
  formula: 'v = x / t  →  m / s',
  quiz: { q: 'm/s をもう一度「÷s」で割ると何になる？', choices: ['速さ', '加速度', '力', '距離'], ans: 1,
          exp: 'm/s ÷ s = m/s²。これは加速度の単位。' }
},
{
  id: '1-3', chapter: '第1章 力学の単位', title: '力をつくる',
  story: 'F = ma。質量 kg から、力 N をつくれ。N = kg·m/s² だ。',
  start: 'kg', goal: 'N', ops: ['*m', '/s', '/s'], gates: 0,
  C: 5, R: 4, braid: 0.36, decoys: 5, seed: 3, short: true, wantJunctions: 8,
  decoyPool: ['*s', '*kg', '/kg', '/m', '*m'],
  tip: 'N = kg·m/s²。kg に「×m」を1回、「÷s」を2回。',
  formula: 'F = ma  →  N = kg · m/s²',
  quiz: { q: '1 N はどれと同じ？', choices: ['kg·m/s', 'kg·m/s²', 'kg·m²/s²', 'kg/s²'], ans: 1,
          exp: 'F = ma の右辺は kg × m/s² = kg·m/s²。' }
},
{
  id: '1-4', chapter: '第1章 力学の単位', title: '関門をひらく',
  story: '関門（🔒）は条件を満たす単位でないと通れない。速さ m/s から仕事 J をつくれ。',
  start: 'm/s', goal: 'J', ops: ['*kg', '*m', '/s'], gates: 1,
  C: 5, R: 4, braid: 0.36, decoys: 6, seed: 5, wantJunctions: 9,
  decoyPool: ['*s', '/kg', '/m', '*m'],
  tip: 'J = kg·m²/s²。関門の条件を満たす順番で拾おう。',
  formula: 'W = Fx  →  J = N·m = kg·m²/s²',
  quiz: { q: '1 J はどれと同じ？', choices: ['N·m', 'N/m', 'N·s', 'N/s'], ans: 0,
          exp: '仕事 = 力 × 距離 なので J = N·m。' }
},
{
  id: '2-1', chapter: '第2章 相殺と関門', title: '相殺のコツ',
  story: '同じ単位を掛けて割れば、単位は消える（相殺）。J から仕事率 W へ。',
  start: 'J', goal: 'W', ops: ['/kg', '*kg', '/s'], gates: 1,
  C: 5, R: 5, braid: 0.36, decoys: 7, seed: 2, wantJunctions: 11,
  decoyPool: ['*s', '*m', '/m', '*kg'],
  tip: 'W = J/s。途中で kg を手放して関門をくぐり、あとで拾い直す。',
  formula: 'P = W / t  →  W = J/s = kg·m²/s³',
  quiz: { q: '1 W はどれと同じ？', choices: ['J·s', 'J/s', 'N·s', 'N/m'], ans: 1,
          exp: '仕事率 = 仕事 ÷ 時間 なので W = J/s。' }
},
{
  id: '2-2', chapter: '第2章 相殺と関門', title: '圧力の迷宮',
  story: '力 N から圧力 Pa をつくれ。Pa = N/m²。',
  start: 'N', goal: 'Pa', ops: ['/m', '*s', '/m', '/s'], gates: 1,
  C: 6, R: 4, braid: 0.38, decoys: 7, seed: 4, wantJunctions: 11,
  decoyPool: ['*m', '*kg', '/kg', '*s'],
  tip: 'Pa = N/m²。÷m が2回。途中の ×s と ÷s は相殺する。',
  formula: 'p = F / S  →  Pa = N/m² = kg/(m·s²)',
  quiz: { q: '1 Pa はどれと同じ？', choices: ['N·m²', 'N/m²', 'N/m', 'N·m'], ans: 1,
          exp: '圧力 = 力 ÷ 面積 なので Pa = N/m²。' }
},
{
  id: '2-3', chapter: '第2章 相殺と関門', title: '無次元へ帰れ',
  story: '力 N から、すべての単位を消し去れ。球が消えたら勝ちだ。',
  start: 'N', goal: '1', ops: ['/kg', '/m', '*s', '*s'], gates: 1,
  C: 6, R: 4, braid: 0.38, decoys: 7, seed: 9, wantJunctions: 11,
  decoyPool: ['*m', '*kg', '/s', '*s'],
  tip: 'N = kg·m/s²。kg を1つ、m を1つ消し、s を2つ掛ければ無次元。',
  formula: '摩擦係数 μ = F / N → N/N = 1（無次元）',
  quiz: { q: '次のうち無次元でないものは？', choices: ['屈折率', 'ひずみ', 'マッハ数', '運動量'], ans: 3,
          exp: '運動量は kg·m/s。屈折率・ひずみ・マッハ数はどれも「同じ単位どうしの比」で無次元。' }
},
{
  id: '2-4', chapter: '第2章 相殺と関門', title: '長い道のり',
  story: '質量 kg だけを持って出発。関門は2つ。エネルギー J にたどり着け。',
  start: 'kg', goal: 'J', ops: ['*m', '*s', '/s', '*m', '/s', '/s'], gates: 2,
  C: 6, R: 4, braid: 0.38, decoys: 7, seed: 6, wantJunctions: 11,
  decoyPool: ['*kg', '/kg', '/m', '*s'],
  tip: 'J = kg·m²/s²。×m が2回、÷s が2回。途中の ×s と ÷s は相殺する。',
  formula: 'E = ½mv²  →  kg · (m/s)² = kg·m²/s²',
  quiz: { q: '運動エネルギー ½mv² の単位を組み立てると？', choices: ['kg·m/s', 'kg·m²/s²', 'kg·m²/s³', 'kg/(m·s²)'], ans: 1,
          exp: 'kg × (m/s)² = kg·m²/s² = J。' }
},
{
  id: '3-1', chapter: '第3章 電気・熱・累乗', title: '電気量をためる',
  story: '電流 A から電気量 C をつくれ。Q = It。',
  start: 'A', goal: 'C', ops: ['*m', '*s', '/m'], gates: 1,
  C: 5, R: 5, braid: 0.38, decoys: 7, seed: 8, wantJunctions: 12,
  decoyPool: ['*kg', '/s', '/A', '*m'],
  tip: 'C = A·s。途中で拾う ×m と ÷m は相殺するので気にしなくてよい。',
  formula: 'Q = It  →  C = A·s',
  quiz: { q: '1 C はどれと同じ？', choices: ['A/s', 'A·s', 'A·s²', 'A/s²'], ans: 1,
          exp: '電気量 = 電流 × 時間 なので C = A·s。' }
},
{
  id: '3-2', chapter: '第3章 電気・熱・累乗', title: '電圧をつくる',
  story: 'V = J/C。エネルギー J から電圧 V へ。C は A·s だ。',
  start: 'J', goal: 'V', ops: ['/A', '*kg', '/kg', '/s'], gates: 1,
  C: 6, R: 5, braid: 0.38, decoys: 8, seed: 12, wantJunctions: 14,
  decoyPool: ['*A', '*s', '/m', '*m'],
  tip: 'V = J/C = J/(A·s)。÷A と ÷s。×kg と ÷kg は相殺する。',
  formula: 'V = W / Q  →  V = J/C = kg·m²/(s³·A)',
  quiz: { q: '1 V はどれと同じ？', choices: ['J·C', 'J/C', 'C/J', 'J/A'], ans: 1,
          exp: '電圧は「1 C あたりのエネルギー」なので V = J/C。' }
},
{
  id: '3-3', chapter: '第3章 電気・熱・累乗', title: '比熱の谷',
  story: '比熱容量は「1 kg を1 K あげるのに必要なエネルギー」。J から J/(kg·K) へ。',
  start: 'J', goal: 'J/kg/K', ops: ['/kg', '*m', '/m', '/K'], gates: 1,
  C: 6, R: 5, braid: 0.38, decoys: 8, seed: 13, wantJunctions: 14,
  decoyPool: ['*K', '*kg', '*s', '/s'],
  tip: 'J/(kg·K) = m²/(s²·K)。÷kg と ÷K。×m と ÷m は相殺する。',
  formula: 'Q = mcΔT  →  c = Q/(mΔT) = J/(kg·K)',
  quiz: { q: '比熱容量の単位はどれ？', choices: ['J·kg·K', 'J/(kg·K)', 'J/K', 'J·K/kg'], ans: 1,
          exp: 'Q = mcΔT を c について解くと c = Q/(mΔT)。単位は J/(kg·K)。' }
},
{
  id: '3-4', chapter: '第3章 電気・熱・累乗', title: '√の橋',
  story: 'v = √(2gh)。√の橋は、すべての指数が偶数のときしか渡れない。',
  start: 'm/s^2', goal: 'm/s', ops: ['*s', '*m', '/s', '^0.5'], gates: 0,
  C: 6, R: 5, braid: 0.36, decoys: 7, seed: 21, wantJunctions: 13,
  decoyPool: ['*m', '*s', '/m', '*kg'],
  tip: '√ は指数を半分にする。渡る直前に m²/s²（全部偶数乗）にしておくこと。',
  formula: 'v = √(2gh)  →  √(m/s² · m) = √(m²/s²) = m/s',
  quiz: { q: '√(m²/s²) は？', choices: ['m/s', 'm²/s', 'm/s²', 'm'], ans: 0,
          exp: '平方根は指数を半分にする：m² → m、s⁻² → s⁻¹。' }
},
{
  id: '3-5', chapter: '第3章 電気・熱・累乗', title: '万有引力定数',
  story: '最終問題。F = GMm/r² より G = Fr²/(Mm)。力 N から G の単位をつくれ。',
  start: 'N', goal: 'm^3/kg/s^2', ops: ['*m', '/kg', '*s', '/s', '*m', '/kg'], gates: 2,
  C: 6, R: 5, braid: 0.36, decoys: 9, seed: 15, wantJunctions: 14,
  decoyPool: ['*kg', '/m', '*s', '/s'],
  tip: 'G の単位は N·m²/kg² = m³/(kg·s²)。×m を2回、÷kg を2回。',
  formula: 'F = GMm/r²  →  G = N·m²/kg² = m³/(kg·s²)',
  quiz: { q: '万有引力定数 G の単位は？', choices: ['N·m²/kg²', 'N·kg²/m²', 'N·m/kg', 'N/(m²·kg)'], ans: 0,
          exp: 'F = GMm/r² を G について解くと G = Fr²/(Mm) → N·m²/kg²。' }
}
];
