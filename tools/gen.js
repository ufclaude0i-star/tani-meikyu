/* ============================================================
   ステージ生成ツール（開発用）
   ループのある迷路を作り、正解ルート上に単位マス・関門を配置し、
   「後戻り禁止」ソルバで解けることを確認してから src/stages.js を書き出す。
   ============================================================ */
const fs = require('fs');
const path = require('path');
const core = require('../src/core.js');
const { parseUnit, vnew, vmul, vpow, veq, vkey, BASE, unitText } = core;

/* ---- 乱数（seed固定＝毎回同じ迷路） ---- */
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
const shuffle = (R, arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

/* ---- 迷路生成（穴掘り法）＋ループ追加 ---- */
function makeMaze(C, R_, R, braid) {
  const W = 2 * C + 1, H = 2 * R_ + 1;
  const g = Array.from({ length: H }, () => Array(W).fill('#'));
  const seen = Array.from({ length: R_ }, () => Array(C).fill(false));
  const stack = [[0, 0]]; seen[0][0] = true; g[1][1] = '.';
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nb = shuffle(R, [[1, 0], [-1, 0], [0, 1], [0, -1]])
      .map(([dx, dy]) => [cx + dx, cy + dy])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < C && y < R_ && !seen[y][x]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny] = nb[0];
    seen[ny][nx] = true;
    g[2 * ny + 1][2 * nx + 1] = '.';
    g[cy + ny + 1][cx + nx + 1] = '.';
    stack.push([nx, ny]);
  }
  // ループを作る（後戻り禁止のゲームでは分岐が命。一本道だと選択肢がなくなる）
  for (let y = 0; y < R_; y++) for (let x = 0; x < C; x++) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= C || ny >= R_) continue;
      const wy = y + ny + 1, wx = x + nx + 1;
      if (g[wy][wx] === '#' && R() < braid) g[wy][wx] = '.';
    }
  }
  return g;
}

/* ---- セル間を移動できるか（間の壁を見る） ---- */
function open_(g, cx, cy, dx, dy) {
  const H = g.length, W = g[0].length;
  const wx = 2 * cx + 1 + dx, wy = 2 * cy + 1 + dy;
  if (wx < 0 || wy < 0 || wx >= W || wy >= H) return false;
  return g[wy][wx] !== '#';
}
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/* ---- 最短のセル経路（チュートリアル用） ---- */
function shortPath(g, C, R_, s, t) {
  const prev = new Map(), q = [s]; prev.set(s[1] * C + s[0], null);
  while (q.length) {
    const [x, y] = q.shift();
    if (x === t[0] && y === t[1]) break;
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= C || ny >= R_) continue;
      if (!open_(g, x, y, dx, dy)) continue;
      if (prev.has(ny * C + nx)) continue;
      prev.set(ny * C + nx, [x, y]); q.push([nx, ny]);
    }
  }
  if (!prev.has(t[1] * C + t[0])) return null;
  const out = []; let cur = t;
  while (cur) { out.push(cur); cur = prev.get(cur[1] * C + cur[0]); }
  return out.reverse();
}

/* ---- なるべく長いセル経路をランダムに探す ---- */
function longPath(g, C, R_, s, t, R, tries, minLen) {
  let best = null;
  for (let k = 0; k < tries; k++) {
    const vis = Array.from({ length: R_ }, () => Array(C).fill(false));
    const p = [];
    let found = null, nodes = 0;
    (function dfs(x, y) {
      if (found || nodes++ > 40000) return;
      vis[y][x] = true; p.push([x, y]);
      if (x === t[0] && y === t[1]) found = p.slice();
      else {
        for (const [dx, dy] of shuffle(R, NB.slice())) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= C || ny >= R_) continue;
          if (vis[ny][nx] || !open_(g, x, y, dx, dy)) continue;
          dfs(nx, ny);
          if (found) break;
        }
      }
      p.pop(); vis[y][x] = false;
    })(s[0], s[1]);
    if (found && (!best || found.length > best.length)) best = found;
    if (best && best.length >= minLen) break;
  }
  return best;
}

/* ---- 「スタート→ゴールの単純経路上に本当に現れるセル」を数える ----
   後戻り禁止なので、行き止まりや、どの経路にも乗らないセルに球を置いても
   プレイヤーは絶対に使えない。そういう場所を候補から外すために使う。 */
function usefulCells(g, C, R_, s, t, R, samples) {
  const seen = new Set();
  for (let k = 0; k < samples; k++) {
    const p = longPath(g, C, R_, s, t, R, 1, 0);
    if (p) for (const [x, y] of p) seen.add(y * C + x);
  }
  return seen;
}
function degreeOf(g, C, R_, x, y) {
  let d = 0;
  for (const [dx, dy] of NB) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= C || ny >= R_) continue;
    if (open_(g, x, y, dx, dy)) d++;
  }
  return d;
}

/* ---- 単位の演算を1つ適用 ---- */
function applyOp(hand, op) {
  if (op === '^0.5') return vpow(hand, 0.5);
  if (op === '^2') return vpow(hand, 2);
  const sign = op[0] === '*' ? 1 : -1;
  return vmul(hand, parseUnit(op.slice(1)), sign);
}
function opCell(op) {
  if (op === '^0.5') return { t: 'pow', k: 0.5 };
  if (op === '^2') return { t: 'pow', k: 2 };
  return { t: 'op', op: op[0], u: op.slice(1) };
}

/* ---- 関門の条件：その時点の手持ちでは真、スタート時は偽になるものを選ぶ ---- */
function makeCond(hand, startHand, R) {
  const cands = [];
  for (const d of BASE) {
    if (hand[d] > 0 && !(startHand[d] > 0)) cands.push({ k: 'has', d });
    if (hand[d] < 0 && !(startHand[d] < 0)) cands.push({ k: 'neg', d });
    if (hand[d] === 0 && startHand[d] !== 0) cands.push({ k: 'zero', d });
  }
  if (BASE.every(d => hand[d] >= 0) && !BASE.every(d => startHand[d] >= 0)) cands.push({ k: 'noneg' });
  if (BASE.every(d => hand[d] === 0) && !BASE.every(d => startHand[d] === 0)) cands.push({ k: 'dimless' });
  if (!cands.length) {
    for (const d of BASE) if (hand[d] > 0) cands.push({ k: 'has', d });
    for (const d of BASE) if (hand[d] < 0) cands.push({ k: 'neg', d });
  }
  return cands.length ? pick(R, cands) : null;
}

const LETTERS = 'abcdefghijklmnopqrtuvwxyzABCDEFHIJKLMNOPQRTUVWXYZ'.split(''); // S,G,s,g除く

/* ---- 1ステージ生成 ---- */
function build(spec, seed) {
  const R = rng(seed);
  const g = makeMaze(spec.C, spec.R, R, spec.braid).map(r => r.split ? r.split('') : r.slice());
  const C = spec.C, R_ = spec.R;
  const s = [0, 0], t = [C - 1, R_ - 1];
  const p = spec.short ? shortPath(g, C, R_, s, t)
                       : longPath(g, C, R_, s, t, R, 60, spec.minLen || Math.floor((C + R_) * 1.3));
  if (!p) return null;

  const startV = parseUnit(spec.start), goalV = parseUnit(spec.goal);
  const ops = spec.ops.slice();
  const nGates = spec.gates || 0;
  const inner = p.slice(1, p.length - 1);
  if (inner.length < ops.length + nGates + 1) return null;

  const slots = [];
  const step = inner.length / (ops.length + nGates + 1);
  for (let i = 1; i <= ops.length + nGates; i++) slots.push(Math.min(inner.length - 1, Math.round(i * step)));
  const uniq = [...new Set(slots)];
  if (uniq.length < ops.length + nGates) return null;

  const gateAt = new Set();
  for (let i = 0; i < nGates; i++) gateAt.add(uniq[Math.min(uniq.length - 1, Math.floor((i + 1) * uniq.length / (nGates + 1)))]);

  const legend = {}, place = {};
  let li = 0, oi = 0, hand = vnew(startV);
  for (const idx of uniq) {
    const [x, y] = inner[idx];
    const key = y * C + x;
    if (gateAt.has(idx)) {
      const cond = makeCond(hand, startV, R);
      if (!cond) return null;
      const ch = LETTERS[li++]; legend[ch] = { t: 'gate', cond }; place[key] = ch;
    } else {
      if (oi >= ops.length) continue;
      const op = ops[oi++];
      const ch = LETTERS[li++]; legend[ch] = opCell(op); place[key] = ch;
      hand = applyOp(hand, op);
    }
  }
  if (oi < ops.length) return null;
  if (!veq(hand, goalV)) return null;

  const onPath = new Set(p.map(([x, y]) => y * C + x));
  // 実際に通り得るセルだけをダミーの置き場所にする
  const useful = usefulCells(g, C, R_, s, t, R, 220);
  const free = [];
  for (let y = 0; y < R_; y++) for (let x = 0; x < C; x++) {
    const i = y * C + x;
    if (onPath.has(i)) continue;
    if (degreeOf(g, C, R_, x, y) <= 1) continue;   // 行き止まりには置かない
    if (!useful.has(i)) continue;                  // どの経路にも乗らない場所にも置かない
    free.push([x, y]);
  }
  shuffle(R, free);
  const pool = spec.decoyPool || ['*kg', '*m', '*s', '/kg', '/m', '/s'];
  const nDecoy = Math.min(spec.decoys || 6, free.length);
  for (let i = 0; i < nDecoy; i++) {
    const [x, y] = free[i];
    const ch = LETTERS[li++];
    legend[ch] = opCell(pick(R, pool));
    place[y * C + x] = ch;
  }

  // 文字グリッドに落とす（壁は '#'、通路は '.'、セルには記号）
  for (let y = 0; y < R_; y++) for (let x = 0; x < C; x++) {
    const gx = 2 * x + 1, gy = 2 * y + 1;
    if (x === s[0] && y === s[1]) g[gy][gx] = 'S';
    else if (x === t[0] && y === t[1]) g[gy][gx] = 'G';
    else if (place[y * C + x]) g[gy][gx] = place[y * C + x];
    else g[gy][gx] = '.';
  }
  const grid = g.map(r => r.join(''));

  const def = {
    id: spec.id, chapter: spec.chapter, title: spec.title, story: spec.story,
    start: spec.start, goal: spec.goal, grid, legend,
    tip: spec.tip, formula: spec.formula, quiz: spec.quiz
  };
  let st;
  try { st = core.buildStage(def); } catch (e) { return null; }
  const sol = core.solve(st, { x: st.start.x, y: st.start.y, hand: st.startV, visited: null });
  if (!sol) return null;
  // 行き止まりに球や関門が残っていたらこのシードは採用しない
  for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
    const c = st.cells[y][x];
    if (c.t !== 'op' && c.t !== 'pow' && c.t !== 'gate') continue;
    let deg = 0;
    for (let i = 0; i < 4; i++) if (core.canGo(st, x, y, i)) deg++;
    if (deg <= 1) return null;
  }
  def.__par = sol.length;
  def.__pathLen = p.length - 1;
  return def;
}

/** 迷路らしさのスコア：分かれ道が多いほど「選択肢のある迷路」になる */
function mazeScore(def) {
  const st = core.buildStage(def);
  let junction = 0, dead = 0;
  for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
    let deg = 0;
    for (let i = 0; i < 4; i++) if (core.canGo(st, x, y, i)) deg++;
    if (deg >= 3) junction++;
    if (deg === 1) dead++;
  }
  return { junction, dead, score: junction * 3 + dead };
}

/** 解けるシードを何通りも試し、いちばん迷路らしいものを採用する */
function generate(spec) {
  const start = spec.seed || 1;
  let best = null, tried = 0;
  for (let seed = start; seed < start + (spec.seedTries || 120) && tried < 40; seed++) {
    const d = build(spec, seed);
    if (!d) continue;
    tried++;
    const m = mazeScore(d);
    d.__seed = seed; d.__junction = m.junction; d.__dead = m.dead; d.__score = m.score;
    if (!best || m.score > best.__score) best = d;
    if (best.__junction >= (spec.wantJunctions || 99)) break;
  }
  return best;
}

module.exports = { generate };
