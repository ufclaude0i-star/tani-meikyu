/* ============================================================
   単位迷宮 — 画面まわり
   ============================================================ */
(function () {
  'use strict';

  var STAGES = STAGE_DEFS.map(function (d) { return buildStage(d); });
  var byId = {};
  STAGES.forEach(function (s) { byId[s.id] = s; });

  /* ---------- セーブデータ ---------- */
  var MEM = {};
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return MEM[k]; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { MEM[k] = v; } }
  };
  var save = (function () { try { return JSON.parse(store.get('tanimeikyu_v2') || '{}'); } catch (e) { return {}; } })();
  if (!save.clear) save.clear = {};
  function persist() { store.set('tanimeikyu_v2', JSON.stringify(save)); }

  /* ---------- 効果音（WebAudio合成／音声ファイル不要） ---------- */
  var actx = null, muted = !!save.muted;
  function tone(freq, dur, type, vol, delay, slideTo) {
    if (muted) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      var t0 = actx.currentTime + (delay || 0);
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(vol === undefined ? 0.06 : vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }
  var SE = {
    step:   function () { tone(280, 0.05, 'sine', 0.025); },
    absorb: function () { tone(300, 0.14, 'triangle', 0.07, 0, 480); },
    cancel: function (n) {                       // 相殺：きらきらと消える音
      var base = [880, 1175, 1568, 2093];
      for (var i = 0; i < 3; i++) tone(base[Math.min(3, i + (n || 1) - 1)], 0.16, 'triangle', 0.075, i * 0.055);
      tone(2600, 0.25, 'sine', 0.03, 0.02);
    },
    closer: function () { tone(660, 0.12, 'sine', 0.05, 0, 880); },
    farther:function () { tone(200, 0.13, 'square', 0.035); },
    gate:   function () { tone(520, 0.16, 'sine', 0.07, 0, 1040); },
    ng:     function () { tone(150, 0.12, 'square', 0.05); },
    stuck:  function () { tone(180, 0.3, 'sawtooth', 0.05, 0, 90); },
    clear:  function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.24, 'triangle', 0.08, i * 0.1); }); }
  };

  var $ = function (id) { return document.getElementById(id); };
  function show(name) {
    ['title', 'select', 'game'].forEach(function (n) { $('screen-' + n).classList.toggle('hidden', n !== name); });
    window.scrollTo(0, 0);
    if (name === 'game') startLoop();
  }

  /* ---------- ステージ選択 ---------- */
  function starsHTML(n) {
    var s = '';
    for (var i = 0; i < 3; i++) s += i < n ? '★' : '<span class="off">★</span>';
    return s;
  }
  function renderSelect() {
    var chapters = [];
    STAGES.forEach(function (s) {
      var c = chapters.filter(function (x) { return x.name === s.chapter; })[0];
      if (!c) { c = { name: s.chapter, list: [] }; chapters.push(c); }
      c.list.push(s);
    });
    var done = Object.keys(save.clear).length;
    var html = '<div class="progress-line">クリア済み <b>' + done + ' / ' + STAGES.length + '</b>' +
      (done > 0 && done < STAGES.length ? '　— あと ' + (STAGES.length - done) + ' ステージでコンプリート' : '') + '</div>';
    chapters.forEach(function (c) {
      html += '<div class="chapter"><h3>' + c.name + '</h3><div class="cards">';
      c.list.forEach(function (s) {
        var rec = save.clear[s.id];
        html += '<button class="card" data-id="' + s.id + '">' +
          '<div class="cid">LEVEL ' + s.id + '</div>' +
          '<div class="cname">' + s.title + '</div>' +
          '<div class="cflow">' + unitHTML(s.startV) + '<span class="ar">→</span>' + unitHTML(s.goalV) + '</div>' +
          '<div class="stars">' + (rec ? starsHTML(rec.stars) + (rec.masked ? ' 🧠' : '') : '<span class="off">★★★</span>') + '</div>' +
          '</button>';
      });
      html += '</div></div>';
    });
    $('stagelist').innerHTML = html;
    Array.prototype.forEach.call($('stagelist').querySelectorAll('.card'), function (b) {
      b.onclick = function () { startStage(b.dataset.id); };
    });
  }

  /* ---------- ゲーム状態 ---------- */
  var G = null;

  function startStage(id) {
    var st = byId[id];
    var vis = new Uint8Array(st.w * st.h);
    vis[st.start.y * st.w + st.start.x] = 1;
    G = {
      stage: st, x: st.start.x, y: st.start.y, px: st.start.x, py: st.start.y,
      hand: vnew(st.startV), visited: vis,
      steps: 0, hints: 0, undos: 0, combo: 0, cancels: 0,
      history: [], done: false, anim: null, pop: null, bump: null,
      masked: !!save.maskMode
    };
    if (st.par === null || st.par === undefined) {
      var p = solve(st, { x: st.start.x, y: st.start.y, hand: st.startV, visited: null });
      st.par = p ? p.length : 999;
    }
    toast('');
    show('game');
    $('level-pill').textContent = 'Level ' + st.id + '　' + st.title;
    $('stage-story').textContent = st.story;
    R3.resize(); R3.setupCamera(st);
    update('', '');
  }

  /* ---------- 描画ループ ---------- */
  var rafId = null;
  function reachMap() {
    var st = G.stage, m = new Uint8Array(st.w * st.h);
    [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
      var nx = G.x + d[0], ny = G.y + d[1], c = cellAt(st, nx, ny);
      if (!c || c.t === 'wall') return;
      if (G.visited[ny * st.w + nx]) return;
      if (canEnter(G.hand, c, st.goalV).ok) m[ny * st.w + nx] = 1;
    });
    return m;
  }
  function popScale() {
    if (!G.pop) return 1;
    var t = (performance.now() - G.pop.t0) / G.pop.dur;
    if (t >= 1) { G.pop = null; return 1; }
    var e = Math.sin(Math.PI * t);
    return G.pop.k === 'grow' ? 1 + 0.34 * e : 1 - 0.42 * e;
  }
  function bumpOffset() {
    if (!G.bump) return [0, 0];
    var t = (performance.now() - G.bump.t0) / G.bump.dur;
    if (t >= 1) { G.bump = null; return [0, 0]; }
    var e = Math.sin(Math.PI * t) * 0.22;
    return [G.bump.dx * e, G.bump.dy * e];
  }
  function paint() {
    if (!G) return;
    var bo = bumpOffset();
    R3.draw(G.stage, {
      hand: G.hand, px: G.px + bo[0], py: G.py + bo[1], cx: G.x, cy: G.y,
      visited: G.visited, reach: reachMap(), masked: G.masked, pop: popScale()
    });
  }
  function loop() {
    if ($('screen-game').classList.contains('hidden')) { rafId = null; return; }
    if (G && G.anim) {
      var a = G.anim, t = (performance.now() - a.t0) / a.dur;
      if (t >= 1) { G.px = a.tx; G.py = a.ty; G.anim = null; }
      else {
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        G.px = a.fx + (a.tx - a.fx) * e; G.py = a.fy + (a.ty - a.fy) * e;
      }
    }
    paint();
    rafId = requestAnimationFrame(loop);
  }
  function startLoop() { if (!rafId) rafId = requestAnimationFrame(loop); }
  function startAnim(fx, fy, tx, ty) { G.anim = { fx: fx, fy: fy, tx: tx, ty: ty, t0: performance.now(), dur: 120 }; }

  /* ---------- HUD ---------- */
  var toastTimer = null;
  function toast(text, kind, ms) {
    var el = $('msg');
    if (!text) { el.classList.remove('on'); return; }
    el.textContent = text;
    el.className = 'toast on ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); }, ms || 2400);
  }
  function update(msg, kind) {
    var st = G.stage;
    var q = quantityName(G.hand);
    $('u-now').innerHTML = unitHTML(G.hand);
    $('u-now').classList.toggle('masked', G.masked);
    $('u-now-q').textContent = q ? '＝ ' + q : '';
    $('u-now-q').classList.toggle('masked', G.masked);
    $('u-goal').innerHTML = unitHTML(st.goalV);
    var gq = quantityName(st.goalV);
    $('u-goal-q').textContent = gq ? '＝ ' + gq : '';
    var d = vdist(G.hand, st.goalV), d0 = Math.max(1, vdist(st.startV, st.goalV));
    $('dist-fill').style.width = Math.max(0, Math.min(100, Math.round((1 - d / d0) * 100))) + '%';
    $('dist-num').textContent = d === 0 ? 'ぴったり！' : 'あと ' + d;
    $('steps').textContent = G.steps;
    $('par').textContent = st.par;
    $('btn-undo').disabled = G.history.length === 0;
    if (msg) toast(msg, kind);
  }

  /* ---------- 移動 ---------- */
  /** 進めなかったことを音なしでも分かるように見せる */
  function bump(dx, dy, nx, ny) {
    SE.ng();
    G.bump = { dx: dx, dy: dy, t0: performance.now(), dur: 220 };
    var st = G.stage;
    if (nx >= 0 && ny >= 0 && nx < st.w && ny < st.h) {
      var w = R3.world(st, nx, ny, 0.35);
      R3.addFX({ k: 'ring', X: w.X, Y: 0.3, Z: w.Z, color: '#FF6B6B', r0: 0.5, r1: 0.15, dur: 280 });
    }
  }
  function tryMove(dx, dy) {
    if (!G || G.done) return false;
    var st = G.stage, nx = G.x + dx, ny = G.y + dy;
    var c = cellAt(st, nx, ny);
    if (!c || c.t === 'wall') { bump(dx, dy, nx, ny); return false; }
    if (G.visited[ny * st.w + nx]) { bump(dx, dy, nx, ny); toast('一度通った道は崩れている。後戻りはできない。', ''); return false; }
    var ce = canEnter(G.hand, c, st.goalV);
    if (!ce.ok) { bump(dx, dy, nx, ny); toast(ce.why, ''); return false; }

    G.history.push({ x: G.x, y: G.y, hand: vnew(G.hand), visited: G.visited.slice(), steps: G.steps, combo: G.combo });
    var before = G.hand, fx0 = G.px, fy0 = G.py;
    G.x = nx; G.y = ny; G.steps++;
    G.visited[ny * st.w + nx] = 1;
    startAnim(fx0, fy0, nx, ny);

    var msg = '', kind = '';
    if (c.t === 'op' || c.t === 'pow') {
      G.hand = applyCell(G.hand, c);
      var l1b = vL1(before), l1a = vL1(G.hand);
      var db = vdist(before, st.goalV), da = vdist(G.hand, st.goalV);
      var w = R3.world(st, nx, ny, 0.5);
      if (l1a < l1b) {                                   // ★相殺
        G.combo++; G.cancels++;
        SE.cancel(G.combo);
        G.pop = { t0: performance.now(), dur: 340, k: 'shrink' };
        R3.addFX({ k: 'ring', X: w.X, Y: 0.35, Z: w.Z, color: '#ffffff', r0: 0.15, r1: 1.25, dur: 520 });
        R3.addFX({ k: 'burst', X: w.X, Y: 0.45, Z: w.Z, color: '#FFF3B0', n: 12, seed: 0.3, dur: 620 });
        R3.addFX({ k: 'text', X: w.X, Y: 0.9, Z: w.Z, s: G.combo > 1 ? '相殺！ ×' + G.combo : '相殺！', color: '#FFE96B', dur: 900 });
      } else {
        G.combo = 0;
        SE.absorb();
        G.pop = { t0: performance.now(), dur: 300, k: 'grow' };
        R3.addFX({ k: 'ring', X: w.X, Y: 0.35, Z: w.Z, color: 'rgba(255,255,255,.8)', r0: 0.5, r1: 0.1, dur: 260 });
      }
      if (da < db) {
        SE.closer();
        R3.addFX({ k: 'ring', X: w.X, Y: 0.06, Z: w.Z, color: '#7BEF7B', r0: 0.2, r1: 1.0, dur: 480 });
      } else if (da > db) {
        SE.farther();
        R3.addFX({ k: 'ring', X: w.X, Y: 0.06, Z: w.Z, color: '#FF8A8A', r0: 0.2, r1: 0.9, dur: 420 });
      }
      var label = c.t === 'op' ? (c.op === '*' ? '×' : '÷') + c.u : (c.k === 0.5 ? '√' : '2乗');
      msg = R3.uniStr(before) + '　' + label + '　→　' + R3.uniStr(G.hand);
      kind = l1a < l1b ? 'good' : 'info';
    } else if (c.t === 'gate') {
      SE.gate(); msg = '関門「' + condLabel(c.cond) + '」を通過！'; kind = 'good';
    } else if (c.t !== 'goal') SE.step();

    if (nx === st.goal.x && ny === st.goal.y) { update(msg, kind); setTimeout(doClear, 260); return true; }
    update(msg, kind);
    setTimeout(checkStuck, 260);
    return true;
  }
  function checkStuck() {
    if (!G || G.done) return;
    var m = reachMap(), any = false;
    for (var i = 0; i < m.length; i++) if (m[i]) { any = true; break; }
    if (!any) { SE.stuck(); toast('行き止まり！「もどす」か「やり直し」を。', '', 5000); return; }
    // まだ動けるが、もう単位が作れない／EXITに行けない場合も早めに知らせる
    if (!feasible(G.stage, { x: G.x, y: G.y, hand: G.hand, visited: G.visited })) {
      SE.stuck(); toast('この先ではもうクリアできない。「もどす」で戻ろう。', '', 5000);
    }
  }
  function undo() {
    if (!G.history.length) return;
    var h = G.history.pop();
    var fx0 = G.px, fy0 = G.py;
    G.x = h.x; G.y = h.y; G.hand = h.hand; G.visited = h.visited; G.steps = h.steps; G.combo = h.combo;
    G.undos++;
    startAnim(fx0, fy0, G.x, G.y);
    update('1手もどした（' + G.undos + '回目）', '');
  }
  function reset() {
    var st = G.stage;
    G.x = st.start.x; G.y = st.start.y; G.px = G.x; G.py = G.y;
    G.hand = vnew(st.startV);
    G.visited = new Uint8Array(st.w * st.h); G.visited[G.y * st.w + G.x] = 1;
    G.steps = 0; G.history = []; G.anim = null; G.combo = 0; G.undos++;
    update('やり直し', '');
  }

  /* ---------- ヒント ---------- */
  function hint() {
    G.hints++;
    var st = G.stage;
    if (G.hints === 1) {
      var need = [], extra = [];
      BASE.forEach(function (d) {
        var diff = st.goalV[d] - G.hand[d];
        if (diff > 0) need.push('×' + d + (diff > 1 ? '×' + diff + '回' : ''));
        if (diff < 0) extra.push('÷' + d + (diff < -1 ? '×' + (-diff) + '回' : ''));
      });
      var t = (need.length ? '足りない: ' + need.join('、') : '') + (need.length && extra.length ? '　/　' : '') +
              (extra.length ? '多すぎる: ' + extra.join('、') : '');
      toast(t || 'もう単位は合っている。EXITへ！', 'info', 5000);
    } else {
      var p = solve(st, { x: G.x, y: G.y, hand: G.hand, visited: G.visited });
      if (!p) { toast('この状態からはもうクリアできない。「もどす」か「やり直し」を。', '', 5000); return; }
      if (G.hints === 2) toast('ここからクリアまで最短 ' + p.length + ' 手。まだ間に合う。', 'info', 4000);
      else toast('次の一手は「' + screenName(p[0]) + '」', 'info', 4000);
    }
  }

  /* ---------- クリア ---------- */
  function doClear() {
    G.done = true;
    SE.clear();
    var st = G.stage;
    var stars = 1;
    if (G.hints === 0 && G.undos <= 2) stars = 3;
    else if (G.hints <= 1 && G.undos <= 10) stars = 2;
    var prev = save.clear[st.id];
    if (!prev || prev.stars < stars) save.clear[st.id] = { stars: stars, steps: G.steps, masked: G.masked };
    else if (G.masked) save.clear[st.id].masked = true;
    persist();

    var idx = STAGES.indexOf(st), next = STAGES[idx + 1];
    var qz = st.quiz;
    $('modal-clear').classList.remove('hidden');
    $('clear-body').innerHTML =
      '<h3>CLEAR！　' + st.title + '</h3>' +
      '<div class="stars-big">' + starsHTML(stars) + '</div>' +
      '<div style="text-align:center;color:var(--dim);font-size:13px;font-weight:700">' +
      G.steps + ' 手（最短 ' + st.par + ' 手）／相殺 ' + G.cancels + ' 回' +
      (G.undos ? '／もどす ' + G.undos + ' 回' : '') + (G.hints ? '／ヒント ' + G.hints + ' 回' : '') +
      (G.masked ? '／🧠記憶モード' : '') + '</div>' +
      '<div class="formula">' + st.formula + '</div>' +
      '<div class="quiz" id="quizbox"><div class="q">' + qz.q + '</div>' +
      qz.choices.map(function (c, i) { return '<button class="ch" data-i="' + i + '">' + c + '</button>'; }).join('') +
      '<div class="exp hidden" id="quizexp">' + qz.exp + '</div></div>' +
      '<div class="row">' +
      '<button class="btn" id="c-retry">もう一度</button>' +
      '<button class="btn" id="c-select">ステージ選択</button>' +
      (next ? '<button class="btn primary" id="c-next">つぎへ</button>' : '') +
      '</div>';

    var answered = false;
    Array.prototype.forEach.call($('quizbox').querySelectorAll('.ch'), function (b) {
      b.onclick = function () {
        if (answered) return; answered = true;
        var i = +b.dataset.i;
        b.classList.add(i === qz.ans ? 'ok' : 'ng');
        if (i !== qz.ans) $('quizbox').querySelectorAll('.ch')[qz.ans].classList.add('ok');
        $('quizexp').classList.remove('hidden');
        tone(i === qz.ans ? 880 : 200, 0.15, 'triangle', 0.06);
      };
    });
    $('c-retry').onclick = function () { $('modal-clear').classList.add('hidden'); startStage(st.id); };
    $('c-select').onclick = function () { $('modal-clear').classList.add('hidden'); renderSelect(); show('select'); };
    if (next) $('c-next').onclick = function () { $('modal-clear').classList.add('hidden'); startStage(next.id); };
  }

  /** 画面上の方向で動く（盤面が回転していても直感どおりに動く） */
  function move(sdx, sdy) { var d = R3.mapDir(sdx, sdy); return tryMove(d[0], d[1]); }
  var DIRNAME = { '上': [0, -1], '下': [0, 1], '左': [-1, 0], '右': [1, 0] };
  function screenName(gridName) {
    var g = DIRNAME[gridName]; if (!g) return gridName;
    var sd = R3.mapDir(g[0], g[1]);
    for (var k in DIRNAME) if (DIRNAME[k][0] === sd[0] && DIRNAME[k][1] === sd[1]) return k;
    return gridName;
  }

  /* ---------- 入力 ---------- */
  document.addEventListener('keydown', function (e) {
    if ($('screen-game').classList.contains('hidden')) return;
    if (!$('modal-clear').classList.contains('hidden')) return;
    var map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
                w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] };
    if (map[e.key]) { e.preventDefault(); move(map[e.key][0], map[e.key][1]); }
    else if (e.key === 'z' || e.key === 'Z') undo();
    else if (e.key === 'r' || e.key === 'R') reset();
  });

  var joy = { on: false, cx: 0, cy: 0, dir: null, timer: null };
  function joyDir(dx, dy) {
    if (Math.abs(dx) + Math.abs(dy) < 16) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? [1, 0] : [-1, 0]) : (dy > 0 ? [0, 1] : [0, -1]);
  }
  function joySet(dx, dy) {
    var lim = 30, len = Math.hypot(dx, dy);
    if (len > lim) { dx = dx / len * lim; dy = dy / len * lim; }
    $('knob').style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  function joyStart(e) {
    var r = $('joy').getBoundingClientRect();
    joy.on = true; joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2;
    joyMove(e); e.preventDefault();
  }
  function joyMove(e) {
    if (!joy.on) return;
    var t = e.touches ? e.touches[0] : e;
    var dx = t.clientX - joy.cx, dy = t.clientY - joy.cy;
    joySet(dx, dy);
    var d = joyDir(dx, dy), key = d ? d.join(',') : null;
    if (key !== joy.dir) {
      joy.dir = key;
      clearInterval(joy.timer); joy.timer = null;
      if (d) { move(d[0], d[1]); joy.timer = setInterval(function () { move(d[0], d[1]); }, 220); }
    }
    if (e.cancelable) e.preventDefault();
  }
  function joyEnd() {
    joy.on = false; joy.dir = null;
    clearInterval(joy.timer); joy.timer = null;
    $('knob').style.transform = 'translate(0,0)';
  }

  var sw = { x: 0, y: 0 };
  function boardDown(e) { var t = e.touches ? e.touches[0] : e; sw.x = t.clientX; sw.y = t.clientY; }
  function boardUp(e) {
    if (!G) return;
    var t = e.changedTouches ? e.changedTouches[0] : e;
    var dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (Math.abs(dx) > 26 || Math.abs(dy) > 26) {
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0); else move(0, dy > 0 ? 1 : -1);
      return;
    }
    var r = $('cv').getBoundingClientRect();
    var hit = R3.pick(t.clientX - r.left, t.clientY - r.top);
    if (hit && Math.abs(hit.col - G.x) + Math.abs(hit.row - G.y) === 1) tryMove(hit.col - G.x, hit.row - G.y);
  }

  window.__DBG = { stage: function () { return G.stage; }, state: function () { return G; }, move: tryMove };

  /* ---------- 起動 ---------- */
  window.addEventListener('DOMContentLoaded', function () {
    R3.setCanvas($('cv'));
    $('btn-start').onclick = function () { renderSelect(); show('select'); };
    $('btn-howto').onclick = function () { $('modal-howto').classList.remove('hidden'); };
    $('btn-howto2').onclick = function () { $('modal-howto').classList.remove('hidden'); };
    $('howto-close').onclick = function () { $('modal-howto').classList.add('hidden'); };
    $('btn-back').onclick = function () { show('title'); };
    $('btn-tomenu').onclick = function () { renderSelect(); show('select'); };
    $('btn-undo').onclick = undo;
    $('btn-reset').onclick = reset;
    $('btn-hint').onclick = hint;
    $('btn-tip').onclick = function () { toast('💡 ' + G.stage.tip, 'info', 7000); };

    var j = $('joy');
    j.addEventListener('touchstart', joyStart, { passive: false });
    j.addEventListener('touchmove', joyMove, { passive: false });
    j.addEventListener('touchend', joyEnd);
    j.addEventListener('touchcancel', joyEnd);
    j.addEventListener('mousedown', joyStart);
    window.addEventListener('mousemove', joyMove);
    window.addEventListener('mouseup', joyEnd);

    var cvEl = $('cv');
    cvEl.addEventListener('touchstart', boardDown, { passive: true });
    cvEl.addEventListener('touchend', boardUp, { passive: true });
    cvEl.addEventListener('mousedown', boardDown);
    cvEl.addEventListener('mouseup', boardUp);

    var mm = $('maskmode');
    mm.checked = !!save.maskMode;
    mm.onchange = function () { save.maskMode = mm.checked; persist(); if (G) { G.masked = mm.checked; update('', ''); } };
    var mu = $('mute');
    mu.checked = !muted;
    mu.onchange = function () { muted = !mu.checked; save.muted = muted; persist(); };

    window.addEventListener('resize', function () { if (!G) return; R3.resize(); R3.setupCamera(G.stage); });
  });
})();
