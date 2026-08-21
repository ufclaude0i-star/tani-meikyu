/* ============================================================
   単位迷宮 — 3D描画エンジン
   外部ライブラリなし。Canvas 2D に自前の透視投影で迷路を描く。
   ============================================================ */
var R3 = (function () {
  'use strict';

  var cv, ctx, W = 0, H = 0, dpr = 1;
  var WALLH = 0.70;
  var P = { sin: 0, cos: 0, C: { x: 0, y: 0, z: 0 }, scale: 1, ox: 0, oy: 0, rot: 0 };
  var quads = [];
  var fx = [];

  var COL = {
    sky1: '#7FCDF0', sky2: '#CDEEFF',
    grass: '#3FA83F', grassEdge: '#7A5C3A',
    wallTop: '#CE9455', wallS: '#A56B37', wallN: '#8A5730', wallE: '#966032', wallW: '#7E4E2A',
    pit: '#4A3B2C', pitTop: '#5C4A38',
    gateLock: '#E04B4B', gateOpen: '#43A047',
    goal: '#17A398', goalTop: '#26C6BA',
    start: '#EFE2C0'
  };
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
    var padX = W * 0.05, padTop = H * 0.09, padBot = H * 0.18;
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
  }

  /* ---------- 図形 ---------- */
  function quad(a, b, c, d, fill) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function corners(st, col, row, y, r) {
    var X = cellX(st, col, row), Z = cellZ(st, col, row);
    return { nw: pr(X - r, y, Z - r), ne: pr(X + r, y, Z - r), se: pr(X + r, y, Z + r), sw: pr(X - r, y, Z + r) };
  }
  function box(st, col, row, y0, y1, cTop, cS, cN, cE, cW) {
    var b = corners(st, col, row, y0, 0.5), t = corners(st, col, row, y1, 0.5);
    var faces = [
      { p: [t.sw, t.se, b.se, b.sw], c: cS, d: (t.sw.d + t.se.d) / 2 },
      { p: [t.ne, t.nw, b.nw, b.ne], c: cN, d: (t.ne.d + t.nw.d) / 2 },
      { p: [t.se, t.ne, b.ne, b.se], c: cE, d: (t.se.d + t.ne.d) / 2 },
      { p: [t.nw, t.sw, b.sw, b.nw], c: cW, d: (t.nw.d + t.sw.d) / 2 }
    ];
    faces.sort(function (a2, b2) { return b2.d - a2.d; });
    for (var i = 0; i < 4; i++) quad(faces[i].p[0], faces[i].p[1], faces[i].p[2], faces[i].p[3], faces[i].c);
    quad(t.nw, t.ne, t.se, t.sw, cTop);
  }
  function plate(st, col, row, color, inset, y) {
    var c = corners(st, col, row, y === undefined ? 0.02 : y, 0.5 - (inset === undefined ? 0.08 : inset));
    quad(c.nw, c.ne, c.se, c.sw, color);
  }
  /** 通った跡：地面が崩れて穴になる（もう戻れないことを見た目で伝える） */
  function pit(st, col, row) {
    var top = corners(st, col, row, 0, 0.5), bot = corners(st, col, row, -0.34, 0.5);
    quad(top.sw, top.se, bot.se, bot.sw, COL.pit);
    quad(top.se, top.ne, bot.ne, bot.se, '#3E3125');
    quad(top.nw, top.sw, bot.sw, bot.nw, '#3E3125');
    quad(bot.nw, bot.ne, bot.se, bot.sw, '#2E241A');
    ctx.save(); ctx.globalAlpha = .5; ctx.strokeStyle = '#8A6B4A'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(top.nw.x, top.nw.y); ctx.lineTo(top.ne.x, top.ne.y);
    ctx.lineTo(top.se.x, top.se.y); ctx.lineTo(top.sw.x, top.sw.y); ctx.closePath(); ctx.stroke(); ctx.restore();
  }

  /* ---------- 半透明の球 ---------- */
  function sphere(pt, rWorld, hue, alpha, sat) {
    var r = Math.max(3, pt.s * rWorld);
    ctx.save();
    ctx.globalAlpha = alpha;
    var g = ctx.createRadialGradient(pt.x - r * 0.34, pt.y - r * 0.40, r * 0.08, pt.x, pt.y, r);
    g.addColorStop(0, 'hsla(' + hue + ',100%,96%,1)');
    g.addColorStop(0.40, 'hsla(' + hue + ',' + (sat || 88) + '%,72%,.92)');
    g.addColorStop(0.86, 'hsla(' + hue + ',' + (sat || 88) + '%,52%,.62)');
    g.addColorStop(1, 'hsla(' + hue + ',' + (sat || 88) + '%,44%,.30)');
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, 6.2832); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.10);
    ctx.strokeStyle = 'hsla(' + hue + ',100%,90%,.85)'; ctx.stroke();
    ctx.globalAlpha = alpha * 0.95;
    ctx.beginPath();
    ctx.ellipse(pt.x - r * 0.32, pt.y - r * 0.38, r * 0.27, r * 0.17, -0.6, 0, 6.2832);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
    ctx.restore();
  }
  function halo(pt, rWorld, color) {
    var r = pt.s * rWorld;
    var g = ctx.createRadialGradient(pt.x, pt.y, r * 0.35, pt.x, pt.y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, 6.2832); ctx.fillStyle = g; ctx.fill(); ctx.restore();
  }
  function groundShadow(pt, rWorld, a) {
    ctx.save(); ctx.globalAlpha = a === undefined ? 0.22 : a; ctx.fillStyle = '#1b3a1b';
    ctx.beginPath(); ctx.ellipse(pt.x, pt.y, pt.s * rWorld, pt.s * rWorld * 0.5, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  function bigText(x, y, text, fs, fill, outline) {
    ctx.font = '800 ' + fs.toFixed(1) + 'px "Hiragino Kaku Gothic ProN","Yu Gothic UI",system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2.5, fs * 0.3); ctx.strokeStyle = outline || 'rgba(40,50,40,.9)';
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
        bigText(p.x, p.y - p.s * 0.9 * t, f.s, Math.max(12, Math.min(30, p.s * 0.36)), f.color, 'rgba(30,30,30,.85)');
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

    var gx = halfX(st), gz = halfZ(st);
    quad(pr(-gx, 0, -gz), pr(gx, 0, -gz), pr(gx, 0, gz), pr(-gx, 0, gz), COL.grass);
    quad(pr(-gx, 0, gz), pr(gx, 0, gz), pr(gx, -0.55, gz), pr(-gx, -0.55, gz), COL.grassEdge);

    var ready = veq(S.hand, st.goalV);

    for (var row = 0; row < st.h; row++) {
      for (var col = 0; col < st.w; col++) {
        var c = st.cells[row][col];
        if (c.t === 'wall') continue;
        var X = cellX(st, col, row), Z = cellZ(st, col, row);
        quads.push({ col: col, row: row, p: [pr(X - .5, 0, Z - .5), pr(X + .5, 0, Z - .5), pr(X + .5, 0, Z + .5), pr(X - .5, 0, Z + .5)] });
        var vI = S.visited[row * st.w + col];
        if (vI && !(col === S.cx && row === S.cy)) { pit(st, col, row); continue; }
        if (S.reach[row * st.w + col]) plate(st, col, row, 'rgba(255,246,170,.65)', 0.10);
        if (c.t === 'start') plate(st, col, row, COL.start, 0.16);
        if (c.t === 'goal') plate(st, col, row, ready ? '#5FE6D8' : COL.goalTop, 0.06);
      }
      for (col = 0; col < st.w; col++) {
        c = st.cells[row][col];
        if (c.t === 'wall') { box(st, col, row, 0, WALLH, COL.wallTop, COL.wallS, COL.wallN, COL.wallE, COL.wallW); continue; }
        if (S.visited[row * st.w + col]) continue;
        var pX = cellX(st, col, row), pZ = cellZ(st, col, row);
        if (c.t === 'gate') {
          var openNS = walkable(st, col, row - 1) || walkable(st, col, row + 1);
          var openEW = walkable(st, col - 1, row) || walkable(st, col + 1, row);
          var ok = evalCond(S.hand, c.cond);
          var cc = ok ? COL.gateOpen : COL.gateLock;
          var th = 0.12, hh = 0.66;
          var acrossX = P.rot ? !(openNS && !openEW) : (openNS && !openEW);
          var a1 = acrossX ? [-.5, -th] : [-th, -.5], a2 = acrossX ? [.5, th] : [th, .5];
          var x0 = pX + a1[0], z0 = pZ + a1[1], x1 = pX + a2[0], z1 = pZ + a2[1];
          var tnw = pr(x0, hh, z0), tne = pr(x1, hh, z0), tse = pr(x1, hh, z1), tsw = pr(x0, hh, z1);
          var bnw = pr(x0, 0, z0), bne = pr(x1, 0, z0), bse = pr(x1, 0, z1), bsw = pr(x0, 0, z1);
          ctx.globalAlpha = ok ? 0.45 : 0.85;
          quad(tsw, tse, bse, bsw, cc);
          quad(tne, tnw, bnw, bne, shade(cc, -18));
          quad(tnw, tne, tse, tsw, shade(cc, 22));
          ctx.globalAlpha = 1;
          labels.push({ k: 'chip', p: pr(pX, 1.05, pZ), t: (ok ? '🔓 ' : '🔒 ') + condShort(c.cond), bg: cc, fg: '#fff', sc: 0.3 });
        } else if (c.t === 'op' || c.t === 'pow') {
          // 道に落ちている単位も半透明の球
          var hue = c.t === 'pow' ? HUE.pow : (c.op === '*' ? HUE.mul : HUE.div);
          var iy = 0.42 + bob;
          groundShadow(pr(pX, 0.02, pZ), 0.24, 0.18);
          var sp = pr(pX, iy, pZ);
          sphere(sp, 0.355, hue, 0.72);
          blockers.push({ cx: sp.x, cy: sp.y, w: sp.s * 0.72, h: sp.s * 0.72 });
          bigText(sp.x, sp.y, tileLabel(c), Math.max(10, Math.min(24, sp.s * 0.34)), '#ffffff', 'rgba(40,20,55,.92)');
        } else if (c.t === 'goal') {
          labels.push({ k: 'chip', p: pr(pX, 1.24, pZ), t: uniStr(st.goalV), bg: ready ? '#0FA35A' : '#0E8C82', fg: '#fff', sc: 0.32 });
          labels.push({ k: 'text', p: pr(pX, 1.74, pZ), t: 'EXIT', sc: 0.42, fg: ready ? '#DFFFF6' : '#ffffff' });
        }
      }
      if (Math.round(S.py) === row) drawBall(st, S);
    }

    labels.sort(function (a, b) { return b.p.d - a.p.d; });
    var placed = blockers.slice();   // 単位の球と重ならないように逃がす
    for (var li = 0; li < labels.length; li++) {
      var L = labels[li];
      var m = L.k === 'chip' ? measureChip(L.t, L.p.s, L.sc) : measureText(L.t, L.p.s, L.sc);
      L.w = m.w; L.h = m.h; L.fs = m.fs;
      L.cx = Math.max(L.w / 2 + 3, Math.min(W - L.w / 2 - 3, L.p.x));
      L.cy = L.p.y;
      for (var tries = 0; tries < 14; tries++) {
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
  function outlineText(L, text, fill) { bigText(L.cx, L.cy, text, L.fs, fill, 'rgba(40,60,40,.9)'); }

  function walkable(st, col, row) { var c = cellAt(st, col, row); return !!c && c.t !== 'wall'; }
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
      halo(p1, rw * 1.9, 'rgba(255,255,255,.55)');
      sphere(p1, Math.max(0.12, rw), 55, 0.34, 35);
      return;
    }
    halo(p1, rw * 2.0, 'hsla(' + hue + ',100%,72%,.5)');
    sphere(p1, rw, hue, 0.74, 98);
    // 中心の光（主人公だと分かるように）
    ctx.save(); ctx.globalAlpha = 0.85;
    var cr = p1.s * rw * 0.34;
    var cg = ctx.createRadialGradient(p1.x, p1.y, 0, p1.x, p1.y, cr);
    cg.addColorStop(0, 'rgba(255,255,255,.95)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(p1.x, p1.y, cr, 0, 6.2832); ctx.fillStyle = cg; ctx.fill();
    ctx.restore();
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
    uniStr: uniStr, sup: sup, mapDir: mapDir, addFX: addFX, hasFX: hasFX, world: world, ballRadius: ballRadius
  };
})();
