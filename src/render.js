/* ============================================================
   単位迷宮 — 3D描画エンジン
   外部ライブラリなし。Canvas 2D に自前の透視投影で迷路を描く。
   ============================================================ */
var R3 = (function () {
  'use strict';

  var cv, ctx, W = 0, H = 0, dpr = 1;
  var WALLH = 0.50;
  var P = { sin: 0, cos: 0, C: { x: 0, y: 0, z: 0 }, scale: 1, ox: 0, oy: 0, rot: 0 };
  var quads = [];
  var fx = [];
  // 毎フレーム作ると重いものはキャッシュする（カメラは固定なので使い回せる）
  var gradCache = {}, sphereCache = {}, shadowPath = null;
  function clearCaches() { gradCache = {}; sphereCache = {}; shadowPath = null; }

  var COL = {
    sky1: '#F2F1EF', sky2: '#FAFAF9',
    grass: '#EAE6DF', grass2: '#E3DFD7', grassEdge: '#CEC8BE',
    wallCap: '#FFFFFF', wallS: '#EFECE7', wallN: '#CFCAC2', wallE: '#E2DED7', wallW: '#C5BFB6',
    shadow: 'rgba(72,66,58,.20)',
    pit: '#978F86', pitTop: '#A69E95',
    gateLock: '#C05B45', gateOpen: '#3E9E76',
    goal: '#2E8B72', goalTop: '#63B99F',
    start: '#E4EDF8'
  };

  /* ---------- 壁の色 ----------
     白い模型のままだと背景の白と壁が同化して見づらい。
     色は1つの基準色から5面ぶんの陰影を機械的に作る（手で5色決めると陰影が破綻するため）。
     半透明にしてあるので、壁の向こうの床と通路が透けて見え、迷路全体の形も読み取りやすい。 */
  var WALL_COLORS = [
    { id: 'emerald',  name: 'エメラルド',   hex: '#4FC0A8' },
    { id: 'sky',      name: 'スカイ',       hex: '#6DB3E8' },
    { id: 'lavender', name: 'ラベンダー',   hex: '#A99BE3' },
    { id: 'apricot',  name: 'アプリコット', hex: '#EFB183' },
    { id: 'rose',     name: 'ローズ',       hex: '#E79BAF' },
    { id: 'stone',    name: 'ストーン',     hex: '#C6C2BB' }
  ];
  var WALL_ALPHA = 0.78;
  function shiftHex(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function setWallColor(hex) {
    COL.wallCap = shiftHex(hex, 38);   // 天面がいちばん明るい
    COL.wallS   = shiftHex(hex, 12);   // 手前
    COL.wallE   = shiftHex(hex, -6);
    COL.wallN   = shiftHex(hex, -26);  // 奥
    COL.wallW   = shiftHex(hex, -38);
    clearCaches();
  }
  setWallColor(WALL_COLORS[0].hex);
  // 演算マスの色相（球体の色）
  var HUE = { mul: 268, div: 335, pow: 200 };

  function setCanvas(c) { cv = c; ctx = c.getContext('2d'); }
  function resize() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var r = cv.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clearCaches();
  }

  /* ---------- 投影 ---------- */
  function raw(X, Y, Z) {
    var vx = X - P.C.x, vy = Y - P.C.y, vz = Z - P.C.z;
    var d = -vy * P.sin - vz * P.cos;
    if (d < 0.05) d = 0.05;
    return { x: vx / d, y: -(vy * P.cos - vz * P.sin) / d, d: d };
  }
  function pr(X, Y, Z) {
    var r = raw(X, Y, Z);
    return { x: r.x * P.scale + P.ox, y: r.y * P.scale + P.oy, d: r.d, s: P.scale / r.d };
  }
  // 盤面が縦長画面に収まりやすいよう、必要なら90度回して配置する
  function cellX(st, col, row) { return P.rot ? (row - (st.h - 1) / 2) : (col - (st.w - 1) / 2); }
  function cellZ(st, col, row) { return P.rot ? (col - (st.w - 1) / 2) : (row - (st.h - 1) / 2); }
  function halfX(st) { return P.rot ? st.h / 2 : st.w / 2; }
  function halfZ(st) { return P.rot ? st.w / 2 : st.h / 2; }
  /** 画面方向(dx,dy) → 迷路の(col,row)方向 */
  function mapDir(sdx, sdy) { return P.rot ? [sdy, sdx] : [sdx, sdy]; }

  function fitFor(st, rot) {
    P.rot = rot;
    var hx = halfX(st), hz = halfZ(st);
    var pitch = 56 * Math.PI / 180;
    var D = Math.max(hx, hz) * 2.5 + 4;
    P.sin = Math.sin(pitch); P.cos = Math.cos(pitch);
    P.C = { x: 0, y: D * P.sin, z: 0.3 + D * P.cos };
    P.scale = 1; P.ox = 0; P.oy = 0;
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (var i = 0; i < 8; i++) {
      var q = raw((i & 1) ? hx : -hx, (i & 2) ? WALLH : 0, (i & 4) ? hz : -hz);
      if (q.x < minx) minx = q.x; if (q.x > maxx) maxx = q.x;
      if (q.y < miny) miny = q.y; if (q.y > maxy) maxy = q.y;
    }
    var padX = W * 0.05, padTop = H * 0.08, padBot = H * 0.09;
    var sc = Math.min((W - padX * 2) / (maxx - minx), (H - padTop - padBot) / (maxy - miny));
    return { sc: sc, minx: minx, maxx: maxx, miny: miny, maxy: maxy, padTop: padTop, padBot: padBot, C: P.C, sin: P.sin, cos: P.cos };
  }
  function setupCamera(st) {
    var a = fitFor(st, 0), b = fitFor(st, 1);
    var best = b.sc > a.sc ? b : a;
    P.rot = (best === b) ? 1 : 0;
    P.sin = best.sin; P.cos = best.cos; P.C = best.C; P.scale = best.sc;
    P.ox = W / 2 - (best.minx + best.maxx) / 2 * P.scale;
    P.oy = best.padTop + (H - best.padTop - best.padBot) / 2 - (best.miny + best.maxy) / 2 * P.scale;
    clearCaches();
  }

  /* ---------- 図形 ---------- */
  function quad(a, b, c, d, fill) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  /** 上辺が明るい縦グラデーションで塗る（a,b が上、c,d が下） */
  function quadV(a, b, c, d, colTop, colBot) {
    var x0 = ((a.x + b.x) / 2) | 0, y0 = ((a.y + b.y) / 2) | 0, x1 = ((c.x + d.x) / 2) | 0, y1 = ((c.y + d.y) / 2) | 0;
    var key = x0 + ',' + y0 + ',' + x1 + ',' + y1 + colTop + colBot;
    var g = gradCache[key];
    if (!g) {
      g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, colTop); g.addColorStop(1, colBot);
      gradCache[key] = g;
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  }
  function corners(st, col, row, y, r) {
    var X = cellX(st, col, row), Z = cellZ(st, col, row);
    return { nw: pr(X - r, y, Z - r), ne: pr(X + r, y, Z - r), se: pr(X + r, y, Z + r), sw: pr(X - r, y, Z + r) };
  }
  /** 直方体（薄い壁パネルにも使う） */
  function slab(x0, x1, z0, z1, y1) {
    ctx.save(); ctx.globalAlpha = WALL_ALPHA;
    var b = {
      nw: pr(x0, 0, z0), ne: pr(x1, 0, z0), se: pr(x1, 0, z1), sw: pr(x0, 0, z1)
    }, t = {
      nw: pr(x0, y1, z0), ne: pr(x1, y1, z0), se: pr(x1, y1, z1), sw: pr(x0, y1, z1)
    };
    var faces = [
      { p: [t.sw, t.se, b.se, b.sw], c: COL.wallS, d: (t.sw.d + t.se.d) / 2 },
      { p: [t.ne, t.nw, b.nw, b.ne], c: COL.wallN, d: (t.ne.d + t.nw.d) / 2 },
      { p: [t.se, t.ne, b.ne, b.se], c: COL.wallE, d: (t.se.d + t.ne.d) / 2 },
      { p: [t.nw, t.sw, b.sw, b.nw], c: COL.wallW, d: (t.nw.d + t.sw.d) / 2 }
    ];
    faces.sort(function (a2, b2) { return b2.d - a2.d; });
    for (var i = 0; i < 4; i++) {
      var f = faces[i];
      quadV(f.p[0], f.p[1], f.p[2], f.p[3], shade(f.c, 26), shade(f.c, -10));
    }
    quad(t.nw, t.ne, t.se, t.sw, COL.wallCap);
    // 上端の明るい縁
    ctx.beginPath();
    ctx.moveTo(t.nw.x, t.nw.y); ctx.lineTo(t.ne.x, t.ne.y); ctx.lineTo(t.se.x, t.se.y); ctx.lineTo(t.sw.x, t.sw.y);
    ctx.closePath();
    ctx.lineWidth = Math.max(0.8, t.nw.s * 0.035); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
    ctx.restore();
  }

  /** セルの中心座標（範囲外でも計算できる＝外周の壁に使う） */
  var WT = 0.062;                       // 壁の厚み（半分）
  /** (x,y) と隣（dir）の境目に立つ薄い壁パネルの底面矩形 */
  function edgeRect(st, x, y, i) {
    var X1 = cellX(st, x, y), Z1 = cellZ(st, x, y);
    var X2 = cellX(st, x + DIRS[i].dx, y + DIRS[i].dy), Z2 = cellZ(st, x + DIRS[i].dx, y + DIRS[i].dy);
    var mx = (X1 + X2) / 2, mz = (Z1 + Z2) / 2;
    if (Math.abs(X1 - X2) > 0.5) return { x0: mx - WT, x1: mx + WT, z0: mz - 0.5 - WT, z1: mz + 0.5 + WT };
    return { x0: mx - 0.5 - WT, x1: mx + 0.5 + WT, z0: mz - WT, z1: mz + WT };
  }

  /** 壁が床に落とす影（すべてを1つのパスにまとめて1回で塗る＝重なっても濃くならない） */
  function drawShadows(rects) {
    if (shadowPath) { ctx.save(); ctx.fillStyle = COL.shadow; ctx.fill(shadowPath); ctx.restore(); return; }
    var LX = 0.50, LZ = 0.78;                 // 左上からの光
    var path = (typeof Path2D !== 'undefined') ? new Path2D() : null;
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i], d = WALLH;
      var pts = [
        pr(r.x0, 0.012, r.z0), pr(r.x1, 0.012, r.z0), pr(r.x1, 0.012, r.z1), pr(r.x0, 0.012, r.z1),
        pr(r.x0 + LX * d, 0.012, r.z0 + LZ * d), pr(r.x1 + LX * d, 0.012, r.z0 + LZ * d),
        pr(r.x1 + LX * d, 0.012, r.z1 + LZ * d), pr(r.x0 + LX * d, 0.012, r.z1 + LZ * d)
      ];
      var hull = convexHull(pts);
      var tgt = path || ctx;
      tgt.moveTo(hull[0].x, hull[0].y);
      for (var j = 1; j < hull.length; j++) tgt.lineTo(hull[j].x, hull[j].y);
      tgt.closePath();
    }
    ctx.fillStyle = COL.shadow;
    if (path) { ctx.fill(path); shadowPath = path; } else ctx.fill();
    ctx.restore();
  }
  function convexHull(ps) {
    var p = ps.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    var cross = function (o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); };
    var lo = [], hi = [], i;
    for (i = 0; i < p.length; i++) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) lo.pop(); lo.push(p[i]); }
    for (i = p.length - 1; i >= 0; i--) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p[i]) <= 0) hi.pop(); hi.push(p[i]); }
    lo.pop(); hi.pop();
    return lo.concat(hi);
  }

  function plate(st, col, row, color, inset, y) {
    var c = corners(st, col, row, y === undefined ? 0.02 : y, 0.5 - (inset === undefined ? 0.08 : inset));
    quad(c.nw, c.ne, c.se, c.sw, color);
  }
  /** 通った跡：地面が崩れて穴になる（もう戻れないことを見た目で伝える） */
  function pit(st, col, row) {
    var top = corners(st, col, row, 0, 0.5), bot = corners(st, col, row, -0.17, 0.5);
    quad(top.sw, top.se, bot.se, bot.sw, COL.pit);
    quad(top.se, top.ne, bot.ne, bot.se, '#8B847B');
    quad(top.nw, top.sw, bot.sw, bot.nw, '#8B847B');
    quad(bot.nw, bot.ne, bot.se, bot.sw, '#7C756C');
    ctx.save(); ctx.globalAlpha = .35; ctx.strokeStyle = '#5E574F'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(top.nw.x, top.nw.y); ctx.lineTo(top.ne.x, top.ne.y);
    ctx.lineTo(top.se.x, top.se.y); ctx.lineTo(top.sw.x, top.sw.y); ctx.closePath(); ctx.stroke(); ctx.restore();
  }

  /* ---------- ガラスの球（一度だけ描いてキャッシュし、以降は貼るだけ） ---------- */
  function sphereSprite(hue, S, R) {
    var key = hue + '_' + S + '_' + R;
    var got = sphereCache[key];
    if (got) return got;
    var pad = Math.max(2, Math.round(R * 0.10));
    var D = R * 2 + pad * 2;
    var cv2 = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (!cv2) return null;
    cv2.width = Math.ceil(D * dpr); cv2.height = Math.ceil(D * dpr);
    var c2 = cv2.getContext('2d');
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cx = D / 2, cy = D / 2, r = R;

    var g = c2.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
    g.addColorStop(0.00, 'hsla(' + hue + ',' + S + '%,72%,.22)');
    g.addColorStop(0.55, 'hsla(' + hue + ',' + S + '%,66%,.44)');
    g.addColorStop(0.86, 'hsla(' + hue + ',' + S + '%,58%,.82)');
    g.addColorStop(0.97, 'hsla(' + hue + ',' + (S + 6) + '%,64%,.95)');
    g.addColorStop(1.00, 'hsla(' + hue + ',' + S + '%,52%,.55)');
    c2.beginPath(); c2.arc(cx, cy, r, 0, 6.2832); c2.fillStyle = g; c2.fill();

    var cg = c2.createRadialGradient(cx + r * 0.22, cy + r * 0.42, r * 0.04, cx + r * 0.18, cy + r * 0.34, r * 0.72);
    cg.addColorStop(0, 'hsla(' + hue + ',100%,88%,.75)');
    cg.addColorStop(1, 'hsla(' + hue + ',100%,88%,0)');
    c2.save(); c2.beginPath(); c2.arc(cx, cy, r * 0.99, 0, 6.2832); c2.clip();
    c2.fillStyle = cg; c2.fillRect(0, 0, D, D); c2.restore();

    c2.lineWidth = Math.max(1, r * 0.075);
    var rim = c2.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    rim.addColorStop(0, 'rgba(255,255,255,.95)');
    rim.addColorStop(0.5, 'hsla(' + hue + ',100%,86%,.55)');
    rim.addColorStop(1, 'hsla(' + hue + ',100%,92%,.85)');
    c2.beginPath(); c2.arc(cx, cy, r * 0.985, 0, 6.2832); c2.strokeStyle = rim; c2.stroke();

    var hl = c2.createRadialGradient(cx - r * 0.34, cy - r * 0.40, 0, cx - r * 0.34, cy - r * 0.40, r * 0.52);
    hl.addColorStop(0, 'rgba(255,255,255,.92)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    c2.beginPath(); c2.arc(cx - r * 0.34, cy - r * 0.40, r * 0.52, 0, 6.2832); c2.fillStyle = hl; c2.fill();
    c2.beginPath();
    c2.ellipse(cx - r * 0.36, cy - r * 0.44, r * 0.19, r * 0.12, -0.6, 0, 6.2832);
    c2.fillStyle = 'rgba(255,255,255,.98)'; c2.fill();

    var rec = { cv: cv2, D: D };
    sphereCache[key] = rec;
    return rec;
  }
  function sphere(pt, rWorld, hue, alpha, sat) {
    var r = Math.max(4, pt.s * rWorld);
    var R = Math.max(4, Math.round(r / 1.5) * 1.5);      // 1.5pxごとに丸めてキャッシュ数を抑える
    var spr = sphereSprite(Math.round(hue), sat || 72, R);
    if (!spr) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr.cv, pt.x - spr.D / 2, pt.y - spr.D / 2, spr.D, spr.D);
    ctx.restore();
  }

  function halo(pt, rWorld, color) {
    var r = pt.s * rWorld;
    var g = ctx.createRadialGradient(pt.x, pt.y, r * 0.35, pt.x, pt.y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, 6.2832); ctx.fillStyle = g; ctx.fill(); ctx.restore();
  }
  function groundShadow(pt, rWorld, a) {
    ctx.save(); ctx.globalAlpha = a === undefined ? 0.22 : a; ctx.fillStyle = '#4B443C';
    ctx.beginPath(); ctx.ellipse(pt.x, pt.y, pt.s * rWorld, pt.s * rWorld * 0.5, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  function bigText(x, y, text, fs, fill, outline) {
    ctx.font = '800 ' + fs.toFixed(1) + 'px "Hiragino Kaku Gothic ProN","Yu Gothic UI",system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, fs * 0.2); ctx.strokeStyle = outline || 'rgba(58,53,47,.9)';
    ctx.lineJoin = 'round'; ctx.strokeText(text, x, y);
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
  }

  /* ---------- 単位の文字 ---------- */
  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '-': '⁻' };
  function sup(str) {
    return String(str).replace(/\^(-?\d+)/g, function (m, gg) {
      return gg.split('').map(function (ch) { return SUP[ch] || ch; }).join('');
    });
  }
  function uniStr(v) { return sup(unitText(v)); }
  function tileLabel(c) {
    if (c.t === 'op') return (c.op === '*' ? '×' : '÷') + sup(c.u);
    if (c.t === 'pow') return c.k === 0.5 ? '√' : '²';
    return '';
  }

  /* ---------- エフェクト ---------- */
  function addFX(o) { o.t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now()); fx.push(o); }
  function hasFX() { return fx.length > 0; }
  function drawFX(now) {
    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i], t = (now - f.t0) / f.dur;
      if (t >= 1) { fx.splice(i, 1); continue; }
      var p = pr(f.X, f.Y, f.Z);
      ctx.save();
      if (f.k === 'ring') {
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.lineWidth = Math.max(2, p.s * 0.09 * (1 - t) + 1);
        ctx.strokeStyle = f.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.s * (f.r0 + (f.r1 - f.r0) * t), p.s * (f.r0 + (f.r1 - f.r0) * t) * 0.55, 0, 0, 6.2832);
        ctx.stroke();
      } else if (f.k === 'burst') {
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = f.color;
        for (var j = 0; j < f.n; j++) {
          var a = (j / f.n) * 6.2832 + f.seed;
          var rr = p.s * (0.18 + 0.75 * t);
          var px = p.x + Math.cos(a) * rr, py = p.y + Math.sin(a) * rr * 0.55 - p.s * 0.5 * t;
          var sz = Math.max(1, p.s * 0.09 * (1 - t));
          ctx.beginPath(); ctx.arc(px, py, sz, 0, 6.2832); ctx.fill();
        }
      } else if (f.k === 'text') {
        ctx.globalAlpha = t < 0.75 ? 1 : (1 - t) * 4;
        bigText(p.x, p.y - p.s * 0.9 * t, f.s, Math.max(12, Math.min(30, p.s * 0.36)), f.color, f.outline || 'rgba(255,255,255,.92)');
      }
      ctx.restore();
    }
  }

  /* ---------- メイン描画 ---------- */
  function draw(st, S) {
    if (!ctx) return;
    quads = [];
    var labels = [], blockers = [];
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var bob = Math.sin(now / 420) * 0.045;

    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COL.sky1); g.addColorStop(1, COL.sky2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // 床（1枚の平面）と土台
    var gx = halfX(st), gz = halfZ(st);
    quad(pr(-gx, 0, -gz), pr(gx, 0, -gz), pr(gx, 0, gz), pr(-gx, 0, gz), COL.grass);
    quad(pr(-gx, 0, gz), pr(gx, 0, gz), pr(gx, -0.45, gz), pr(-gx, -0.45, gz), COL.grassEdge);
    quad(pr(gx, 0, -gz), pr(gx, 0, gz), pr(gx, -0.45, gz), pr(gx, -0.45, -gz), shade(COL.grassEdge, -14));
    ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,.055)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gi = -gx + 1; gi < gx; gi++) { var a1 = pr(gi, 0.004, -gz), a2 = pr(gi, 0.004, gz); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); }
    for (gi = -gz + 1; gi < gz; gi++) { var b1 = pr(-gx, 0.004, gi), b2 = pr(gx, 0.004, gi); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); }
    ctx.stroke(); ctx.restore();

    // 壁パネルを列挙 → まとめて影を落とす
    var rows2 = [];
    var allRects = [];
    for (var y = 0; y < st.h; y++) {
      var hN = [], vWE = [];
      for (var x = 0; x < st.w; x++) {
        var c = st.cells[y][x];
        if (c.wall & 1) { var r1 = edgeRect(st, x, y, 0); hN.push(r1); allRects.push(r1); }
        if (c.wall & 8) { var r2 = edgeRect(st, x, y, 2); vWE.push(r2); allRects.push(r2); }
        if (x === st.w - 1 && (c.wall & 2)) { var r3 = edgeRect(st, x, y, 3); vWE.push(r3); allRects.push(r3); }
      }
      rows2.push({ hN: hN, vWE: vWE });
    }
    var southEnd = [];
    for (x = 0; x < st.w; x++) {
      if (st.cells[st.h - 1][x].wall & 4) { var r4 = edgeRect(st, x, st.h - 1, 1); southEnd.push(r4); allRects.push(r4); }
    }
    drawShadows(allRects);

    var ready = veq(S.hand, st.goalV);

    for (y = 0; y < st.h; y++) {
      // 床のしるし
      for (x = 0; x < st.w; x++) {
        var cc = st.cells[y][x];
        var X = cellX(st, x, y), Z = cellZ(st, x, y);
        quads.push({ col: x, row: y, p: [pr(X - .5, 0, Z - .5), pr(X + .5, 0, Z - .5), pr(X + .5, 0, Z + .5), pr(X - .5, 0, Z + .5)] });
        var vI = S.visited[y * st.w + x];
        if (vI && !(x === S.cx && y === S.cy)) { pit(st, x, y); continue; }
        if (S.reach[y * st.w + x]) plate(st, x, y, 'rgba(120,162,212,.20)', 0.14);
        if (cc.t === 'start') plate(st, x, y, COL.start, 0.2);
        if (cc.t === 'goal') plate(st, x, y, ready ? '#7FD3BC' : COL.goalTop, 0.12);
      }
      // 壁パネル（奥→手前）
      for (var k = 0; k < rows2[y].hN.length; k++) { var q1 = rows2[y].hN[k]; slab(q1.x0, q1.x1, q1.z0, q1.z1, WALLH); }
      for (k = 0; k < rows2[y].vWE.length; k++) { var q2 = rows2[y].vWE[k]; slab(q2.x0, q2.x1, q2.z0, q2.z1, WALLH); }
      // セルの中身
      for (x = 0; x < st.w; x++) {
        cc = st.cells[y][x];
        if (S.visited[y * st.w + x]) continue;
        var pX = cellX(st, x, y), pZ = cellZ(st, x, y);
        if (cc.t === 'gate') {
          var ok = evalCond(S.hand, cc.cond);
          var cg = ok ? COL.gateOpen : COL.gateLock;
          ctx.globalAlpha = ok ? 0.32 : 0.6;
          var gt = corners(st, x, y, 0.44, 0.34), gb = corners(st, x, y, 0, 0.34);
          quad(gt.sw, gt.se, gb.se, gb.sw, cg);
          quad(gt.se, gt.ne, gb.ne, gb.se, shade(cg, -18));
          quad(gt.nw, gt.sw, gb.sw, gb.nw, shade(cg, -18));
          quad(gt.nw, gt.ne, gt.se, gt.sw, shade(cg, 26));
          ctx.globalAlpha = 1;
          labels.push({ k: 'chip', p: pr(pX, 0.92, pZ), t: (ok ? '🔓 ' : '🔒 ') + condShort(cc.cond), bg: cg, fg: '#fff', sc: 0.26 });
        } else if (cc.t === 'op' || cc.t === 'pow') {
          var hue = cc.t === 'pow' ? HUE.pow : (cc.op === '*' ? HUE.mul : HUE.div);
          groundShadow(pr(pX, 0.02, pZ), 0.30, 0.15);
          var sp = pr(pX, 0.44 + bob, pZ);
          sphere(sp, 0.385, hue, 0.86);
          bigText(sp.x, sp.y, tileLabel(cc), Math.max(11, Math.min(27, sp.s * 0.32)), '#ffffff', 'rgba(38,18,52,.85)');
          blockers.push({ cx: sp.x, cy: sp.y, w: sp.s * 0.80, h: sp.s * 0.80 });
        } else if (cc.t === 'goal') {
          labels.push({ k: 'chip', p: pr(pX, 1.02, pZ), t: uniStr(st.goalV), bg: ready ? '#2E7D5B' : '#2E8B72', fg: '#fff', sc: 0.26 });
          labels.push({ k: 'text', p: pr(pX, 1.44, pZ), t: 'EXIT', sc: 0.34, fg: ready ? '#2E7D5B' : '#44403C' });
        }
      }
      if (Math.round(S.py) === y) {
        drawBall(st, S);
        // 主人公の球にも、いま持っている単位を出す
        // （短ければ球の上に直接、長ければ球の真上のラベルにする）
        if (!S.masked) {
          var bX = P.rot ? (S.py - (st.h - 1) / 2) : (S.px - (st.w - 1) / 2);
          var bZ = P.rot ? (S.px - (st.w - 1) / 2) : (S.py - (st.h - 1) / 2);
          var brw = ballRadius(vL1(S.hand)) * (S.pop || 1);
          var bp = pr(bX, 0.16 + brw, bZ);
          var btxt = uniStr(S.hand);
          var bfs = Math.max(10, Math.min(25, bp.s * 0.27));
          ctx.font = '800 ' + bfs.toFixed(1) + 'px "Hiragino Kaku Gothic ProN","Yu Gothic UI",system-ui,sans-serif';
          if (ctx.measureText(btxt).width < bp.s * brw * 1.7) {
            bigText(bp.x, bp.y, btxt, bfs, '#ffffff', 'rgba(60,54,45,.92)');
            blockers.push({ cx: bp.x, cy: bp.y, w: bp.s * brw * 2, h: bp.s * brw * 2 });
          } else {
            labels.push({ k: 'chip', p: pr(bX, 0.16 + brw * 2, bZ), t: btxt, bg: '#57514A', fg: '#fff', sc: 0.26, pin: 1 });
            blockers.push({ cx: bp.x, cy: bp.y, w: bp.s * brw * 2, h: bp.s * brw * 2 });
          }
        }
      }
    }
    for (k = 0; k < southEnd.length; k++) { var q3 = southEnd[k]; slab(q3.x0, q3.x1, q3.z0, q3.z1, WALLH); }

    // 主人公の単位ラベルは動かさない（pin）。ほかのラベルがそれを避ける
    labels.sort(function (a2, b2) { return (b2.pin || 0) - (a2.pin || 0) || b2.p.d - a2.p.d; });
    var placed = blockers.slice();
    for (var li = 0; li < labels.length; li++) {
      var L = labels[li];
      var m = L.k === 'chip' ? measureChip(L.t, L.p.s, L.sc) : measureText(L.t, L.p.s, L.sc);
      L.w = m.w; L.h = m.h; L.fs = m.fs;
      L.cx = Math.max(L.w / 2 + 3, Math.min(W - L.w / 2 - 3, L.p.x));
      L.cy = L.p.y;
      for (var tries = 0; tries < (L.pin ? 0 : 14); tries++) {
        var hit = false;
        for (var pi = 0; pi < placed.length; pi++) {
          var qq = placed[pi];
          if (Math.abs(L.cx - qq.cx) < (L.w + qq.w) / 2 - 2 && Math.abs(L.cy - qq.cy) < (L.h + qq.h) / 2 - 1) { hit = true; break; }
        }
        if (!hit) break;
        L.cy -= 5;
      }
      placed.push(L);
      if (L.k === 'chip') chip(L, L.t, L.bg, L.fg); else outlineText(L, L.t, L.fg);
    }
    drawFX(now);
  }

  function measureChip(text, s, scale) {
    var fs = Math.max(9, Math.min(23, s * (scale || 0.3)));
    ctx.font = '700 ' + fs.toFixed(1) + 'px "Hiragino Kaku Gothic ProN","Yu Gothic UI",system-ui,sans-serif';
    return { w: ctx.measureText(text).width + fs * 0.84, h: fs * 1.52, fs: fs };
  }
  function measureText(text, s, scale) {
    var fs = Math.max(11, Math.min(30, s * scale));
    ctx.font = '800 ' + fs.toFixed(1) + 'px "Hiragino Kaku Gothic ProN","Yu Gothic UI",system-ui,sans-serif';
    return { w: ctx.measureText(text).width + 6, h: fs * 1.25, fs: fs };
  }
  function chip(L, text, bg, fg) {
    var fs = L.fs, w = L.w, h = L.h, x = L.cx - w / 2, y = L.cy - h / 2, rr = h / 2;
    ctx.font = '700 ' + fs.toFixed(1) + 'px "Hiragino Kaku Gothic ProN","Yu Gothic UI",system-ui,sans-serif';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, rr);
    else { ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); }
    ctx.closePath();
    ctx.save(); ctx.translate(0, Math.max(1, fs * 0.12)); ctx.fillStyle = 'rgba(0,0,0,.20)'; ctx.fill(); ctx.restore();
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = Math.max(1.5, fs * 0.1); ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, L.cx, L.cy + fs * 0.04);
  }
  function outlineText(L, text, fill) { bigText(L.cx, L.cy, text, L.fs, fill, L.outline || 'rgba(255,255,255,.92)'); }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgb(' + Math.max(0, Math.min(255, (n >> 16) + amt)) + ',' +
      Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)) + ',' +
      Math.max(0, Math.min(255, (n & 255) + amt)) + ')';
  }

  /** 主人公：持っている単位の量で大きさと色が変わる半透明の球 */
  function ballRadius(l1) { return Math.min(0.56, 0.26 + 0.062 * l1); }
  function drawBall(st, S) {
    var X = P.rot ? (S.py - (st.h - 1) / 2) : (S.px - (st.w - 1) / 2);
    var Z = P.rot ? (S.px - (st.w - 1) / 2) : (S.py - (st.h - 1) / 2);
    var l1 = vL1(S.hand);
    var rw = ballRadius(l1) * (S.pop || 1);
    var hue = 50 - Math.min(7, l1) * 3.4;      // 単位が増えるほど金→橙へ
    groundShadow(pr(X, 0.02, Z), rw * 0.85, 0.26);
    var p1 = pr(X, 0.16 + rw, Z);
    if (l1 === 0) {
      // 無次元：ほとんど透明なきらめきだけ
      halo(p1, rw * 1.5, 'rgba(255,255,255,.26)');
      sphere(p1, Math.max(0.12, rw), 55, 0.30, 35);
      return;
    }
    // 光らせすぎない。まわりのにじみは弱く、中心の白い芯は入れない。
    // 主人公だと分かるのは「金色であること」と「地面の影」で足りる
    halo(p1, rw * 1.35, 'hsla(' + hue + ',95%,74%,.16)');
    sphere(p1, rw, hue, 0.82, 72);
  }

  /* ---------- クリック → セル ---------- */
  function pick(mx, my) {
    for (var i = quads.length - 1; i >= 0; i--) if (inPoly(mx, my, quads[i].p)) return { col: quads[i].col, row: quads[i].row };
    return null;
  }
  function inPoly(x, y, p) {
    var inside = false;
    for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
      if (((p[i].y > y) !== (p[j].y > y)) && (x < (p[j].x - p[i].x) * (y - p[i].y) / (p[j].y - p[i].y) + p[i].x)) inside = !inside;
    }
    return inside;
  }

  /** 盤面の座標(col,row) → ワールド座標。エフェクトを置くのに使う */
  function world(st, col, row, y) {
    return { X: cellX(st, col, row), Y: y === undefined ? 0.5 : y, Z: cellZ(st, col, row) };
  }

  return {
    setCanvas: setCanvas, resize: resize, setupCamera: setupCamera, draw: draw, pick: pick,
    uniStr: uniStr, sup: sup, mapDir: mapDir, addFX: addFX, hasFX: hasFX, world: world, ballRadius: ballRadius,
    wallColors: WALL_COLORS, setWallColor: setWallColor
  };
})();
