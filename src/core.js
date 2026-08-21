/* ============================================================
   単位迷宮 (Dimension Labyrinth) — コアエンジン
   次元ベクトル演算 / 単位パーサ / 表示 / ゲート判定 / 最短手ソルバ
   ブラウザとNode.jsの両方で動くように書いてある
   ============================================================ */

/** 基本次元（このゲームで扱う5つ） */
var BASE = ['kg', 'm', 's', 'A', 'K'];

/** 次元ベクトル（各基本次元の指数）を作る */
function vnew(o) {
  var v = { kg: 0, m: 0, s: 0, A: 0, K: 0 };
  if (o) for (var i = 0; i < BASE.length; i++) { var d = BASE[i]; if (o[d]) v[d] = o[d]; }
  return v;
}
function vclone(a) { return vnew(a); }
/** a * (b^k) */
function vmul(a, b, k) {
  var r = vclone(a);
  for (var i = 0; i < BASE.length; i++) { var d = BASE[i]; r[d] += b[d] * k; }
  return r;
}
/** a^k （k=2 なら2乗、k=0.5 なら平方根） */
function vpow(a, k) {
  var r = vnew();
  for (var i = 0; i < BASE.length; i++) { var d = BASE[i]; r[d] = a[d] * k; }
  return r;
}
function veq(a, b) { for (var i = 0; i < BASE.length; i++) { if (a[BASE[i]] !== b[BASE[i]]) return false; } return true; }
function vzero(a) { for (var i = 0; i < BASE.length; i++) { if (a[BASE[i]] !== 0) return false; } return true; }
/** 次元距離：目標までの「あとどれだけズレているか」(L1距離) */
function vdist(a, b) { var s = 0; for (var i = 0; i < BASE.length; i++) { var d = BASE[i]; s += Math.abs(a[d] - b[d]); } return s; }
function vkey(a) { var t = []; for (var i = 0; i < BASE.length; i++) t.push(a[BASE[i]]); return t.join(','); }
/** 手持ちの「量」。指数の絶対値の合計。球の大きさに使う */
function vL1(a) { var t = 0; for (var i = 0; i < BASE.length; i++) t += Math.abs(a[BASE[i]]); return t; }
function vAllEven(a) { for (var i = 0; i < BASE.length; i++) { if (a[BASE[i]] % 2 !== 0) return false; } return true; }

/** 単位テーブル：記号 -> 次元ベクトル */
var UNITS = {
  '1':  vnew({}),
  kg:   vnew({ kg: 1 }),
  m:    vnew({ m: 1 }),
  s:    vnew({ s: 1 }),
  A:    vnew({ A: 1 }),
  K:    vnew({ K: 1 }),
  N:    vnew({ kg: 1, m: 1, s: -2 }),
  J:    vnew({ kg: 1, m: 2, s: -2 }),
  W:    vnew({ kg: 1, m: 2, s: -3 }),
  Pa:   vnew({ kg: 1, m: -1, s: -2 }),
  Hz:   vnew({ s: -1 }),
  C:    vnew({ A: 1, s: 1 }),
  V:    vnew({ kg: 1, m: 2, s: -3, A: -1 }),
  'Ω':  vnew({ kg: 1, m: 2, s: -3, A: -2 }),
  ohm:  vnew({ kg: 1, m: 2, s: -3, A: -2 }),
  F:    vnew({ kg: -1, m: -2, s: 4, A: 2 }),
  T:    vnew({ kg: 1, s: -2, A: -1 }),
  Wb:   vnew({ kg: 1, m: 2, s: -2, A: -1 }),
  H:    vnew({ kg: 1, m: 2, s: -2, A: -2 })
};

/** 表示に使う「組立単位の記号」（重複はしない順で先勝ち） */
var NAMED_ORDER = ['N', 'J', 'W', 'Pa', 'Hz', 'C', 'V', 'Ω', 'F', 'T', 'Wb', 'H'];
var NAMED_BY_KEY = {};
(function () {
  for (var i = 0; i < NAMED_ORDER.length; i++) {
    var sym = NAMED_ORDER[i];
    var k = vkey(UNITS[sym]);
    if (!NAMED_BY_KEY[k]) NAMED_BY_KEY[k] = sym;
  }
})();

/**
 * 単位文字列をパースする。例: "kg*m/s^2", "m/s", "J/(kg*K)" は "J/kg/K" と書く
 */
function parseUnit(str) {
  if (str === undefined || str === null || str === '') return vnew();
  if (typeof str === 'object') return vnew(str);
  var s = String(str).replace(/\s+/g, '').replace(/·/g, '*').replace(/[()]/g, '');
  var parts = s.split(/([*\/])/);
  var v = vnew();
  var op = '*';
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (p === '*' || p === '/') { op = p; continue; }
    if (p === '') continue;
    var mm = p.match(/^([A-Za-zΩ]+|1)(?:\^(-?\d+))?$/);
    if (!mm) throw new Error('単位を解釈できません: ' + p + ' (' + str + ')');
    var base = UNITS[mm[1]];
    if (!base) throw new Error('未知の単位: ' + mm[1]);
    var e = mm[2] ? parseInt(mm[2], 10) : 1;
    v = vmul(v, base, (op === '*' ? 1 : -1) * e);
  }
  return v;
}

/** 物理量の名前（次元キー -> 日本語名） */
var QUANTITY = {};
(function () {
  var tbl = [
    ['1', '無次元'],
    ['m', '長さ'], ['m^2', '面積'], ['m^3', '体積'],
    ['kg', '質量'], ['s', '時間'], ['A', '電流'], ['K', '温度'],
    ['m/s', '速さ'], ['m/s^2', '加速度'],
    ['kg*m/s', '運動量'], ['kg/m^3', '密度'],
    ['N', '力'], ['J', 'エネルギー・仕事'], ['W', '仕事率'],
    ['Pa', '圧力'], ['Hz', '振動数'],
    ['C', '電気量'], ['V', '電圧'], ['Ω', '電気抵抗'],
    ['F', '静電容量'], ['T', '磁束密度'], ['Wb', '磁束'], ['H', 'インダクタンス'],
    ['J/kg/K', '比熱容量'], ['J/K', '熱容量'],
    ['m^3/kg/s^2', '万有引力定数'], ['J*s', '作用（プランク定数）'],
    ['N/m', 'ばね定数・表面張力'], ['kg/s', '質量流量'],
    ['m^2/s^2', '速さの2乗'], ['J/kg', '比エネルギー']
  ];
  for (var i = 0; i < tbl.length; i++) {
    try { QUANTITY[vkey(parseUnit(tbl[i][0]))] = tbl[i][1]; } catch (e) {}
  }
})();

function quantityName(v) { return QUANTITY[vkey(v)] || null; }

/** 次元ベクトル -> 表示用HTML（例: kg·m/s²） */
function unitHTML(v) {
  var k = vkey(v);
  if (NAMED_BY_KEY[k]) return NAMED_BY_KEY[k];
  var num = [], den = [];
  for (var i = 0; i < BASE.length; i++) {
    var d = BASE[i], e = v[d];
    if (e === 0) continue;
    var a = Math.abs(e);
    var t = d + (a === 1 ? '' : '<sup>' + a + '</sup>');
    if (e > 0) num.push(t); else den.push(t);
  }
  return joinFrac(num, den);
}

function joinFrac(num, den) {
  if (num.length === 0 && den.length === 0) return '1';
  var ns = num.length ? num.join('·') : '1';
  if (!den.length) return ns;
  var ds = den.length > 1 ? '(' + den.join('·') + ')' : den[0];
  return ns + '/' + ds;
}

/** 基本単位だけに開いた表示（Nでも kg·m/s² と出す） */
function unitHTMLBase(v) {
  var num = [], den = [];
  for (var i = 0; i < BASE.length; i++) {
    var d = BASE[i], e = v[d];
    if (e === 0) continue;
    var a = Math.abs(e);
    var t = d + (a === 1 ? '' : '<sup>' + a + '</sup>');
    if (e > 0) num.push(t); else den.push(t);
  }
  return joinFrac(num, den);
}

function unitText(v) { return unitHTML(v).replace(/<sup>(-?\d+)<\/sup>/g, '^$1'); }

/* ---------------- マス（セル）の判定ルール ---------------- */

/** ゲート条件を判定する */
function evalCond(hand, c) {
  switch (c.k) {
    case 'has':     return hand[c.d] > 0;                 // 指定次元の指数が正
    case 'neg':     return hand[c.d] < 0;                 // 指定次元の指数が負
    case 'zero':    return hand[c.d] === 0;               // 指定次元を含まない
    case 'dimless': return vzero(hand);                   // 無次元
    case 'eq':      return veq(hand, parseUnit(c.u));     // ちょうどこの単位
    case 'noneg':   return BASE.every(function (d) { return hand[d] >= 0; });
    case 'even':    return vAllEven(hand);                // すべての指数が偶数
    default: return true;
  }
}
function condLabel(c) {
  switch (c.k) {
    case 'has':     return c.d + 'を持つ';
    case 'neg':     return '1/' + c.d + 'を持つ';
    case 'zero':    return c.d + 'を含まない';
    case 'dimless': return '無次元';
    case 'eq':      return 'ちょうど' + c.u;
    case 'noneg':   return '分母なし';
    case 'even':    return '全て偶数乗';
    default: return '?';
  }
}
function condShort(c) {
  switch (c.k) {
    case 'has':     return c.d;
    case 'neg':     return '1/' + c.d;
    case 'zero':    return '¬' + c.d;
    case 'dimless': return '1';
    case 'eq':      return c.u;
    case 'noneg':   return '+';
    case 'even':    return '²';
    default: return '?';
  }
}

/** そのマスに入れるか（goalV を渡すと EXIT は単位一致でのみ通れる） */
function canEnter(hand, cell, goalV) {
  if (!cell) return { ok: false, why: 'ここは盤面の外だ' };
  if (cell.t === 'gate') {
    return evalCond(hand, cell.cond)
      ? { ok: true }
      : { ok: false, why: '関門の条件「' + condLabel(cell.cond) + '」を満たしていない' };
  }
  if (cell.t === 'pow' && cell.k === 0.5) {
    if (!vAllEven(hand)) return { ok: false, why: '√は「すべての指数が偶数」のときしか渡れない' };
  }
  if (cell.t === 'goal' && goalV) {
    if (!veq(hand, goalV)) return { ok: false, why: 'EXIT は単位がぴったり合うまで開かない' };
  }
  return { ok: true };
}

/** そのマスの効果を手持ちに適用する */
function applyCell(hand, cell) {
  if (!cell) return hand;
  if (cell.t === 'op') return vmul(hand, parseUnit(cell.u), cell.op === '*' ? 1 : -1);
  if (cell.t === 'pow') return vpow(hand, cell.k);
  return hand;
}

/** 単位を持っているマスか */
function isItem(cell) { return !!cell && (cell.t === 'op' || cell.t === 'pow'); }

/* ---------------- ステージの読み込み ---------------- */

/**
 * grid（文字列配列）+ legend から、セル配列を組み立てる
 * 既定の記号: '#'=壁 '.'=床 'S'=スタート 'G'=ゴール
 */
function buildStage(def) {
  var rows = def.grid;
  var GH = rows.length, GW = 0;
  for (var i = 0; i < GH; i++) GW = Math.max(GW, rows[i].length);
  var w = (GW - 1) / 2, h = (GH - 1) / 2;      // 論理セルの数
  var at = function (x, y) { return (rows[y] && rows[y][x]) || '#'; };
  var cells = [], start = null, goal = null;
  for (var cy = 0; cy < h; cy++) {
    var row = [];
    for (var cx = 0; cx < w; cx++) {
      var ch = at(2 * cx + 1, 2 * cy + 1);
      var cell;
      if (ch === '.' || ch === '#') cell = { t: 'floor' };
      else if (ch === 'S') { cell = { t: 'start' }; start = { x: cx, y: cy }; }
      else if (ch === 'G') { cell = { t: 'goal' }; goal = { x: cx, y: cy }; }
      else {
        var proto = def.legend && def.legend[ch];
        if (!proto) throw new Error('legendに ' + ch + ' がない (' + def.id + ')');
        cell = JSON.parse(JSON.stringify(proto));
      }
      cell.x = cx; cell.y = cy;
      cell.wall =
        (at(2 * cx + 1, 2 * cy) === '#' ? WN : 0) |
        (at(2 * cx + 2, 2 * cy + 1) === '#' ? WE : 0) |
        (at(2 * cx + 1, 2 * cy + 2) === '#' ? WS : 0) |
        (at(2 * cx, 2 * cy + 1) === '#' ? WW : 0);
      row.push(cell);
    }
    cells.push(row);
  }
  return {
    id: def.id, title: def.title, chapter: def.chapter, story: def.story,
    w: w, h: h, cells: cells, start: start, goal: goal,
    startV: parseUnit(def.start), goalV: parseUnit(def.goal),
    startStr: def.start, goalStr: def.goal,
    tip: def.tip, formula: def.formula, quiz: def.quiz, par: def.par || null
  };
}

function cellAt(stage, x, y) {
  if (x < 0 || y < 0 || x >= stage.w || y >= stage.h) return null;
  return stage.cells[y][x];
}

/* 壁のビット: 北=1 東=2 南=4 西=8 */
var WN = 1, WE = 2, WS = 4, WW = 8;
var DIRS = [
  { dx: 0, dy: -1, n: '上', b: WN },
  { dx: 0, dy: 1, n: '下', b: WS },
  { dx: -1, dy: 0, n: '左', b: WW },
  { dx: 1, dy: 0, n: '右', b: WE }
];
/** (x,y) から DIRS[i] の方向へ壁なしで進めるか */
function canGo(stage, x, y, i) {
  var c = cellAt(stage, x, y);
  if (!c) return false;
  if (c.wall & DIRS[i].b) return false;
  return !!cellAt(stage, x + DIRS[i].dx, y + DIRS[i].dy);
}

/**
 * 後戻り禁止（一度通ったマスには入れない）のもとで、
 * 現在地からクリアまでの最短手順を深さ優先＋枝刈りで探す。
 * state = {x, y, hand, visited:Uint8Array(w*h)}
 * 戻り値: 方向の配列（['右','右','下',...]）／解けないなら null
 */
/**
 * この状態から「まだクリアの可能性があるか」を安く判定する。
 * ゴールに到達できるか＋残っているマスで必要な単位を作れるか、だけを見る（甘めの判定）。
 */
function feasible(stage, state) {
  var w = stage.w, h = stage.h, N = w * h;
  var vis = new Uint8Array(N);
  if (state.visited) vis.set(state.visited);
  var goalI = stage.goal.y * w + stage.goal.x;
  var q = new Int32Array(N), seen = new Uint8Array(N);
  var head = 0, tail = 0, si = state.y * w + state.x;
  q[tail++] = si; seen[si] = 1;
  var plus = { kg: 0, m: 0, s: 0, A: 0, K: 0 }, minus = { kg: 0, m: 0, s: 0, A: 0, K: 0 };
  var goalOK = false, hasPow = false;
  while (head < tail) {
    var i = q[head++], cx = i % w, cy = (i - cx) / w;
    if (i === goalI) goalOK = true;
    var c = stage.cells[cy][cx];
    if (c.t === 'op') {
      var u = parseUnit(c.u), sg = c.op === '*' ? 1 : -1;
      for (var k = 0; k < BASE.length; k++) {
        var d = BASE[k], e = u[d] * sg;
        if (e > 0) plus[d] += e; else if (e < 0) minus[d] += -e;
      }
    } else if (c.t === 'pow') hasPow = true;
    for (var mm = 0; mm < DIRS.length; mm++) {
      if (!canGo(stage, cx, cy, mm)) continue;
      var nx = cx + DIRS[mm].dx, ny = cy + DIRS[mm].dy;
      var ni = ny * w + nx;
      if (seen[ni] || vis[ni]) continue;
      seen[ni] = 1; q[tail++] = ni;
    }
  }
  if (!goalOK) return false;
  if (hasPow) return true;
  for (var j = 0; j < BASE.length; j++) {
    var dd = BASE[j], need = stage.goalV[dd] - state.hand[dd];
    if (need > 0 && need > plus[dd]) return false;
    if (need < 0 && -need > minus[dd]) return false;
  }
  return true;
}

function solve(stage, state, limit) {
  limit = limit || 300000;
  var w = stage.w, h = stage.h, N = w * h;
  var vis = new Uint8Array(N);
  if (state.visited) vis.set(state.visited);
  vis[state.y * w + state.x] = 1;
  var goalI = stage.goal.y * w + stage.goal.x;
  var best = null, nodes = 0, stopped = false;
  var stack = [];
  var q = new Int32Array(N), seen = new Uint8Array(N);

  /** 到達可能性と「残っている単位で目標に届くか」で枝刈り */
  function hopeless(x, y, hand) {
    seen.fill(0);
    var head = 0, tail = 0, si = y * w + x;
    q[tail++] = si; seen[si] = 1;
    var plus = { kg: 0, m: 0, s: 0, A: 0, K: 0 }, minus = { kg: 0, m: 0, s: 0, A: 0, K: 0 };
    var goalOK = false, hasPow = false;
    while (head < tail) {
      var i = q[head++], cx = i % w, cy = (i - cx) / w;
      if (i === goalI) goalOK = true;
      var c = stage.cells[cy][cx];
      if (c.t === 'op') {
        var u = parseUnit(c.u), sg = c.op === '*' ? 1 : -1;
        for (var k = 0; k < BASE.length; k++) {
          var d = BASE[k], e = u[d] * sg;
          if (e > 0) plus[d] += e; else if (e < 0) minus[d] += -e;
        }
      } else if (c.t === 'pow') hasPow = true;
      for (var m = 0; m < DIRS.length; m++) {
        if (!canGo(stage, cx, cy, m)) continue;
        var nx = cx + DIRS[m].dx, ny = cy + DIRS[m].dy;
        var ni = ny * w + nx;
        if (seen[ni] || vis[ni]) continue;
        seen[ni] = 1; q[tail++] = ni;
      }
    }
    if (!goalOK) return true;
    if (!hasPow) {
      for (var j = 0; j < BASE.length; j++) {
        var dd = BASE[j], need = stage.goalV[dd] - hand[dd];
        if (need > 0 && need > plus[dd]) return true;
        if (need < 0 && -need > minus[dd]) return true;
      }
    }
    return false;
  }

  function dfs(x, y, hand) {
    if (stopped) return;
    if (++nodes > limit) { stopped = true; return; }
    if (x === stage.goal.x && y === stage.goal.y) {
      if (veq(hand, stage.goalV) && (!best || stack.length < best.length)) best = stack.slice();
      return;                                  // EXIT に入ったら終わり
    }
    if (best && stack.length + 1 >= best.length) return;
    if (hopeless(x, y, hand)) return;
    for (var i = 0; i < DIRS.length; i++) {
      if (!canGo(stage, x, y, i)) continue;
      var nx = x + DIRS[i].dx, ny = y + DIRS[i].dy;
      var ni = ny * w + nx;
      if (vis[ni]) continue;
      var cell = stage.cells[ny][nx];
      if (!canEnter(hand, cell, stage.goalV).ok) continue;
      vis[ni] = 1; stack.push(DIRS[i].n);
      dfs(nx, ny, applyCell(hand, cell));
      stack.pop(); vis[ni] = 0;
      if (stopped) return;
    }
  }
  dfs(state.x, state.y, state.hand);
  return best;
}

/* Node.js から使えるように */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BASE: BASE, vnew: vnew, vmul: vmul, vpow: vpow, veq: veq, vzero: vzero, vdist: vdist,
    vkey: vkey, parseUnit: parseUnit, unitHTML: unitHTML, unitHTMLBase: unitHTMLBase, unitText: unitText,
    quantityName: quantityName, evalCond: evalCond, condLabel: condLabel, condShort: condShort,
    canEnter: canEnter, applyCell: applyCell, isItem: isItem, vL1: vL1, vAllEven: vAllEven, canGo: canGo,
    buildStage: buildStage, cellAt: cellAt, solve: solve, feasible: feasible, UNITS: UNITS, DIRS: DIRS
  };
}
