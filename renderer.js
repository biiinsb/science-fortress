/**
 * renderer.js — Canvas 2D 렌더링과 궤적 애니메이션
 *
 * PDF p.5 "게임 UI 해부도"의 화면을 그린다: 대포(좌) · 목표물(우) · 지형 ·
 * 장애물 · 바람 · 발사 후 점선 궤적. 궤적은 physics.simulate가 미리 계산한
 * 점 배열을 재생만 한다 (물리와 렌더가 분리된다 — 개발 계획서 4.1).
 *
 * 개발 계획서 6절 리스크: 속도 벡터·성분·공식을 그릴 수단 자체를 두지 않는다.
 * 이 파일에는 화살표(바람)와 점선(궤적) 말고 벡터를 그리는 코드가 없다.
 */

var Renderer = (function () {
  'use strict';

  var W = Physics.WORLD.w;
  var H = Physics.WORLD.h;

  var SURFACE_STYLE = {
    plain: { top: '#8fd18f', body: '#5fae5f', hatch: null },
    ice: { top: '#cdeefb', body: '#a5d8ef', hatch: '#e8f7ff' },
    dirt: { top: '#c69a6b', body: '#9c7345', hatch: '#b0855a' },
    sand: { top: '#f0d79a', body: '#dcbd76', hatch: '#e6cd8a' },
    rock: { top: '#b9b6c0', body: '#8b8792', hatch: '#a19da8' }
  };

  function Scene(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.resize();
  }

  Scene.prototype.resize = function () {
    var cssW = this.canvas.clientWidth || W;
    var cssH = this.canvas.clientHeight || H;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.scale = this.canvas.width / W; // 월드 좌표 → 픽셀
  };

  Scene.prototype._begin = function () {
    var ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
  };

  /**
   * UI 확대 배율. 월드는 960px 폭으로 고정이라 화면이 좁을수록 배율이 작아진다
   * (데스크톱 980px → 약 1.0, 휴대폰 390px → 0.41). 그대로 두면 조준 손잡이가
   * 화면에서 4~5px밖에 안 돼 손가락으로 잡을 수 없다. 그래서 캔버스가 작을수록
   * 손잡이·글자를 월드 기준으로 키워, 화면에서의 크기를 비슷하게 유지한다.
   * 물리에 묶인 것(목표물 반지름)은 절대 건드리지 않는다 — 판정과 어긋난다.
   */
  Scene.prototype.ui = function () {
    return Math.max(1, Math.min(2.1, 0.85 / this.scale));
  };

  // ─── 배경 ──────────────────────────────────────────────

  function drawSky(ctx) {
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#dff1ff');
    grad.addColorStop(1, '#f4fbff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 청사진 격자 (PDF 전편의 모눈 배경)
    ctx.strokeStyle = 'rgba(120,170,210,0.15)';
    ctx.lineWidth = 1;
    for (var x = 0; x <= W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (var y = 0; y <= H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  function drawClouds(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    var clouds = [{ x: 260, y: 90, s: 1 }, { x: 620, y: 60, s: 0.8 }, { x: 780, y: 120, s: 1.1 }];
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      ctx.beginPath();
      ctx.arc(c.x, c.y, 22 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x + 26 * c.s, c.y + 4, 18 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x - 24 * c.s, c.y + 6, 16 * c.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ─── 지형 ──────────────────────────────────────────────

  function drawTerrain(ctx, terrain) {
    for (var i = 0; i < terrain.length - 1; i++) {
      var p1 = terrain[i];
      var p2 = terrain[i + 1];
      var style = SURFACE_STYLE[p1.surface] || SURFACE_STYLE.dirt;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p2.x, H);
      ctx.lineTo(p1.x, H);
      ctx.closePath();
      ctx.fillStyle = style.body;
      ctx.fill();

      // 표층 띠
      ctx.strokeStyle = style.top;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // 마찰 큰 지면은 거친 질감(빗금)으로 표시 (PRD 14.3, 색에 의존하지 않음)
      if (style.hatch) {
        ctx.strokeStyle = style.hatch;
        ctx.lineWidth = 1.5;
        var len = p2.x - p1.x;
        var slope = (p2.y - p1.y) / (len || 1);
        for (var hx = p1.x + 8; hx < p2.x; hx += 16) {
          var hy = p1.y + (hx - p1.x) * slope;
          ctx.beginPath();
          ctx.moveTo(hx, hy + 4);
          ctx.lineTo(hx + 6, hy + 12);
          ctx.stroke();
        }
      }
    }
  }

  // ─── 장애물 ────────────────────────────────────────────

  function drawObstacle(ctx, o) {
    if (o.type === 'tree') {
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(o.x + o.w / 2 - 5, o.y + o.h * 0.45, 10, o.h * 0.55);
      ctx.fillStyle = '#3f9d55';
      ctx.beginPath();
      ctx.arc(o.x + o.w / 2, o.y + o.h * 0.4, o.w * 0.95, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.type === 'wall') {
      ctx.fillStyle = '#8a94a6';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#6d7686';
      for (var by = o.y; by < o.y + o.h; by += 20) {
        for (var bx = o.x; bx < o.x + o.w; bx += 22) {
          ctx.fillRect(bx + 1, by + 1, 20, 18);
        }
      }
      ctx.strokeStyle = '#5a6374';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
    } else {
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
  }

  // ─── 목표물 (PDF p.5의 동심원 과녁) ───────────────────────

  function drawTarget(ctx, t, groundY, flash) {
    // 목표물은 지면에서 띄워져 있다(수정사항 1). 지면까지 기둥을 세워 공중에
    // 떠 있음을 분명히 보여준다 — 굴려서는 닿을 수 없다는 것을 시각으로 전한다.
    var footY = groundY == null ? t.y + t.r + 22 : groundY;
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y + t.r * 0.4);
    ctx.lineTo(t.x, footY);
    ctx.stroke();
    ctx.fillStyle = '#5a3f22';
    ctx.fillRect(t.x - 14, footY - 4, 28, 6);

    var rings = [
      { r: t.r, c: '#e8442e' },
      { r: t.r * 0.72, c: '#f5f5f5' },
      { r: t.r * 0.46, c: '#e8442e' },
      { r: t.r * 0.2, c: '#ffffff' }
    ];
    if (flash) {
      ctx.save();
      ctx.shadowColor = '#ffd23f';
      ctx.shadowBlur = 30;
    }
    for (var i = 0; i < rings.length; i++) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, rings[i].r, 0, Math.PI * 2);
      ctx.fillStyle = rings[i].c;
      ctx.fill();
    }
    if (flash) ctx.restore();
  }

  // ─── 대포 ──────────────────────────────────────────────

  function drawCannon(ctx, launch, angle) {
    var rad = (angle * Math.PI) / 180;
    // 포신
    ctx.save();
    ctx.translate(launch.x, launch.y);
    ctx.rotate(-rad);
    ctx.fillStyle = '#5b6b8c';
    ctx.fillRect(-6, -11, 52, 22);
    ctx.fillStyle = '#3f4d6b';
    ctx.fillRect(40, -13, 8, 26);
    ctx.restore();
    // 바퀴·받침
    ctx.fillStyle = '#7a5230';
    ctx.beginPath();
    ctx.arc(launch.x, launch.y + 14, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a3320';
    ctx.beginPath();
    ctx.arc(launch.x, launch.y + 14, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─── 바람 표시 (PDF p.5 좌상단, PRD 14.3 화살표) ─────────

  function drawWind(ctx, wind, label, ui) {
    // 좌상단 바람 표시 상자. 화살표로 방향을, 점 개수/숫자로 세기를 보여준다
    // (수정사항 4). 풍속은 게임 세기 1~5로, m/s 같은 물리 단위는 쓰지 않는다.
    ui = ui || 1;
    var boxX = 16, boxY = 16, boxW = 150 * ui, boxH = 58 * ui;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.strokeStyle = '#2b7fb8';
    ctx.lineWidth = 2 * ui;
    roundRect(ctx, boxX, boxY, boxW, boxH, 10 * ui);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1c3d5a';
    ctx.font = 'bold ' + Math.round(15 * ui) + 'px system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    var mag = Math.sqrt(wind.x * wind.x + wind.y * wind.y);
    if (mag < 0.05) {
      ctx.fillText('바람 없음', boxX + 14 * ui, boxY + boxH / 2);
      ctx.restore();
      return;
    }

    var cx = boxX + 28 * ui, cy = boxY + boxH / 2;
    var ux = wind.x / mag, uy = wind.y / mag;
    var len = 30 * ui;
    ctx.strokeStyle = '#2b7fb8';
    ctx.fillStyle = '#2b7fb8';
    ctx.lineWidth = 4 * ui;
    ctx.beginPath();
    ctx.moveTo(cx - ux * len / 2, cy - uy * len / 2);
    ctx.lineTo(cx + ux * len / 2, cy + uy * len / 2);
    ctx.stroke();
    var hx = cx + ux * len / 2, hy = cy + uy * len / 2;
    var pa = Math.atan2(uy, ux);
    var ah = 11 * ui;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - ah * Math.cos(pa - 0.5), hy - ah * Math.sin(pa - 0.5));
    ctx.lineTo(hx - ah * Math.cos(pa + 0.5), hy - ah * Math.sin(pa + 0.5));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1c3d5a';
    ctx.font = 'bold ' + Math.round(14 * ui) + 'px system-ui, sans-serif';
    var txt = (label && label.strength ? label.strength : '') + ' · 풍속 ' + (label ? label.level : '?');
    ctx.fillText(txt, boxX + 52 * ui, boxY + boxH / 2);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ─── 궤적 ──────────────────────────────────────────────

  function drawPath(ctx, path, color, count, dashed) {
    if (!path || path.length < 2) return;
    var n = count == null ? path.length : Math.min(count, path.length);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    if (dashed) ctx.setLineDash([2, 8]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (var i = 1; i < n; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function drawProjectile(ctx, p, proj) {
    if (!p) return;
    var r = proj && proj.id === 'heavy' ? 9 : 7;
    ctx.fillStyle = proj && proj.id === 'heavy' ? '#7c6a3a' : '#c9a227';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a4a10';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ─── 조준 가이드 (발사 전, 개발 계획서 0.1(6)) ────────────

  function drawAim(ctx, launch, guide) {
    ctx.save();
    ctx.strokeStyle = 'rgba(40,80,120,0.55)';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(launch.x, launch.y);
    ctx.lineTo(guide.x, guide.y);
    ctx.stroke();
    // 방향 화살촉
    var pa = Math.atan2(guide.y - launch.y, guide.x - launch.x);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(40,80,120,0.55)';
    ctx.beginPath();
    ctx.moveTo(guide.x, guide.y);
    ctx.lineTo(guide.x - 12 * Math.cos(pa - 0.4), guide.y - 12 * Math.sin(pa - 0.4));
    ctx.lineTo(guide.x - 12 * Math.cos(pa + 0.4), guide.y - 12 * Math.sin(pa + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ─── 조준 컨트롤 (재설계: 앞쪽 각도 다이얼 + 뒤쪽 힘 손잡이) ──
  //
  // 각도는 대포 입구 앞의 곡선 다이얼 위 손잡이를 끌어 정하고, 힘은 대포 뒤의
  // 손잡이를 당겨 정한다. 두 손잡이가 서로 멀리 떨어져 눈에 보이므로, 무엇을
  // 잡아야 하는지 헷갈리지 않는다.
  var ARC_R = 100;    // 각도 다이얼 반지름
  var MAX_PULL = 220; // (구) 당김 방식에서 쓰던 값. 게이지 전환 후에도 호환용으로 남김

  // ── 힘 게이지 (대포 옆 세로 막대) ───────────────────────
  //
  // 예전에는 대포 뒤 작은 손잡이를 "당기는" 방식이었는데, 처음 보는 사람은 그게
  // 조작할 수 있는 것인 줄 몰랐다. 눈금과 라벨이 있는 세로 게이지로 바꿔, 보자마자
  // 슬라이더임을 알게 했다. 끌어도 되고 원하는 높이를 그냥 눌러도 된다.
  // 타이밍이 아니라 값을 직접 정하므로, 같은 힘을 정확히 다시 낼 수 있다
  // (변인 통제 학습에 필수 — 힘만 그대로 두고 각도만 바꿔 비교할 수 있어야 한다).
  var GAUGE_H = 190;  // 게이지 높이(월드 px)
  var GAUGE_W = 26;   // 게이지 폭

  /** 게이지 사각형 {x, y, w, h}. 대포 왼쪽(뒤)에 세로로 세운다. */
  function powerGauge(launch, ui) {
    var u = ui || 1;
    var w = GAUGE_W * u;
    var h = GAUGE_H * u;
    return { x: launch.x - 52 * u - w, y: launch.y + 6 - h, w: w, h: h };
  }

  /** 게이지 위에서 현재 힘의 손잡이 중심 y. 아래가 0, 위가 100. */
  function powerHandleY(g, power) {
    return g.y + g.h - (power / 100) * g.h;
  }

  /** 화면 y좌표를 힘(1~100)으로 되돌린다. 게이지를 끌거나 누를 때 쓴다. */
  function powerFromY(g, y) {
    var t = (g.y + g.h - y) / g.h;
    return Math.max(1, Math.min(100, Math.round(t * 100)));
  }

  // ui는 작은 화면에서 손잡이를 키우는 배율(Scene.ui). 위치 계산을 app과 공유해야
  // 하므로 여기 한 곳에 둔다.
  function knobAngle(launch, angle, ui) {
    var a = (angle * Math.PI) / 180;
    var r = ARC_R;
    return { x: launch.x + Math.cos(a) * r, y: launch.y - Math.sin(a) * r };
  }
  /** (구) 당김 손잡이 위치. 게이지 방식으로 바뀐 뒤에는 쓰지 않는다. */
  function knobPowerRest(launch, angle, ui) {
    var u = ui || 1;
    return { x: launch.x - 30 * u, y: launch.y - 18 * u };
  }

  /** 대포 앞 곡선 다이얼(10°~80°) + 현재 각도 손잡이. */
  function drawAngleDial(ctx, launch, angle, active, ui) {
    ui = ui || 1;
    ctx.save();
    // 눈금 호
    ctx.strokeStyle = active ? '#2b7fb8' : 'rgba(43,127,184,0.5)';
    ctx.lineWidth = (active ? 4 : 3) * ui;
    ctx.beginPath();
    for (var a = 10; a <= 80; a += 1) {
      var r = (a * Math.PI) / 180;
      var x = launch.x + Math.cos(r) * ARC_R;
      var y = launch.y - Math.sin(r) * ARC_R;
      if (a === 10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 굵은 눈금 (20° 간격)
    var tick = 7 * ui;
    ctx.lineWidth = 2 * ui;
    for (var t = 20; t <= 80; t += 20) {
      var rr = (t * Math.PI) / 180;
      var ix = launch.x + Math.cos(rr) * (ARC_R - tick);
      var iy = launch.y - Math.sin(rr) * (ARC_R - tick);
      var ox = launch.x + Math.cos(rr) * (ARC_R + tick);
      var oy = launch.y - Math.sin(rr) * (ARC_R + tick);
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
    }
    // 손잡이
    var k = knobAngle(launch, angle, ui);
    var kr = (active ? 14 : 11) * ui;
    ctx.fillStyle = active ? '#2b7fb8' : '#5a9fca';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3 * ui;
    ctx.beginPath();
    ctx.arc(k.x, k.y, kr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 위·아래 화살표로 조작 가능함을 암시
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(12 * ui) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↕', k.x, k.y);
    ctx.restore();
  }

  /**
   * 힘 게이지. 항상 보이는 세로 막대 + 눈금 + 손잡이 + '힘' 라벨.
   * 슬라이더처럼 생겨서, 처음 보는 사람도 끌거나 누르면 된다는 걸 안다.
   * active면(조작 중) 손잡이와 테두리를 키워 잡고 있음을 알린다.
   */
  function drawPowerControl(ctx, launch, angle, power, mode, dragPoint, ui) {
    ui = ui || 1;
    var active = mode === 'power';
    var g = powerGauge(launch, ui);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 틀
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = active ? '#e8442e' : '#1c3d5a';
    ctx.lineWidth = (active ? 3.5 : 2.5) * ui;
    roundRect(ctx, g.x, g.y, g.w, g.h, 9 * ui);
    ctx.fill();
    ctx.stroke();

    // 채움 (아래에서 위로)
    var fillH = (power / 100) * (g.h - 6);
    var grad = ctx.createLinearGradient(0, g.y + g.h, 0, g.y);
    grad.addColorStop(0, '#ffd23f');
    grad.addColorStop(1, '#e8442e');
    ctx.fillStyle = grad;
    roundRect(ctx, g.x + 3, g.y + g.h - 3 - fillH, g.w - 6, fillH, 6 * ui);
    ctx.fill();

    // 눈금 (25칸마다)
    ctx.strokeStyle = 'rgba(28,61,90,0.35)';
    ctx.lineWidth = 1.5 * ui;
    for (var v = 25; v <= 75; v += 25) {
      var ty = powerHandleY(g, v);
      ctx.beginPath();
      ctx.moveTo(g.x + 2, ty);
      ctx.lineTo(g.x + g.w * 0.42, ty);
      ctx.stroke();
    }

    // 손잡이 (현재 값 위치) — 끌 수 있음을 알리는 ↕
    var hy = powerHandleY(g, power);
    var hx = g.x + g.w / 2;
    var hr = (active ? 15 : 13) * ui;
    ctx.fillStyle = active ? '#e8442e' : '#c8503a';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3 * ui;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(13 * ui) + 'px system-ui, sans-serif';
    ctx.fillText('↕', hx, hy);

    // '힘' 라벨 (게이지 아래)
    ctx.fillStyle = '#1c3d5a';
    ctx.font = 'bold ' + Math.round(15 * ui) + 'px system-ui, sans-serif';
    ctx.fillText('힘', g.x + g.w / 2, g.y + g.h + 16 * ui);

    ctx.restore();
  }

  /**
   * 각도·힘 숫자 판. 대포 입구를 가리지 않도록 화면 좌상단(바람 상자 아래)에
   * 고정한다 (수정사항: 박스가 대포를 가려 조준이 어려웠던 문제).
   */
  function drawReadout(ctx, angle, power, showPower, mode, ui) {
    ui = ui || 1;
    var x = 16, y = 84 * ui, w = 176 * ui, h = 32 * ui;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(16,35,58,0.9)';
    roundRect(ctx, x, y, w, h, 9 * ui);
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.round(15 * ui) + 'px system-ui, sans-serif';
    ctx.fillStyle = '#ffe08a';
    var txt = '각도 ' + angle + '°   힘 ' + power;
    ctx.fillText(txt, x + 12 * ui, y + h / 2);
    // 현재 조절 중인 축을 작은 점으로 강조
    if (mode) {
      ctx.fillStyle = mode === 'aim' ? '#7fd0ff' : '#ff9a3d';
      ctx.beginPath();
      ctx.arc(x + w - 14 * ui, y + h / 2, 5 * ui, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ─── 폭발·충돌 효과 (PRD 14.3) ───────────────────────────

  function drawBurst(ctx, p, t, color) {
    // t: 0~1 진행. 파티클을 방사형으로 튀긴다 (결정론 불필요, 시각 효과)
    var n = 10;
    ctx.fillStyle = color;
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2;
      var d = t * 34;
      var rr = (1 - t) * 5 + 1;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ─── 전체 장면 렌더 ─────────────────────────────────────

  /**
   * scene = {
   *   map, target, angle, power, projectile, wind, windLabel,
   *   pastPaths, currentPath, projectileIndex, projectilePos,
   *   aimGuide, drag, showFullPredict, predictPath,
   *   burst, targetFlash
   * }
   * target은 리스폰마다 바뀌므로 scene.target으로 넘긴다 (없으면 map.target).
   */
  Scene.prototype.render = function (scene) {
    this._begin();
    var ctx = this.ctx;
    var map = scene.map;
    var target = scene.target || map.target;
    var groundY = Physics.groundAt(map.terrain, target.x).y;

    drawSky(ctx);
    drawClouds(ctx);
    drawTerrain(ctx, map.terrain);
    for (var i = 0; i < map.obstacles.length; i++) drawObstacle(ctx, map.obstacles[i]);
    drawTarget(ctx, target, groundY, scene.targetFlash);

    // 지난 궤적들 (누적, PDF p.5 · §13.2)
    for (var j = 0; j < scene.pastPaths.length; j++) {
      drawPath(ctx, scene.pastPaths[j], 'rgba(200,120,40,0.4)', null, true);
    }

    // 연습 모드 전체 예측선 (토글 시에만)
    if (scene.showFullPredict && scene.predictPath) {
      drawPath(ctx, scene.predictPath, 'rgba(60,140,90,0.55)', null, true);
    }

    // 발사 전 조준 가이드 (드래그 중이 아니어도 현재 각도 방향을 보여준다)
    if (scene.aimGuide && !scene.currentPath) {
      drawAim(ctx, map.launch, scene.aimGuide);
    }

    // 현재 날아가는 궤적 (애니메이션 중)
    if (scene.currentPath) {
      drawPath(ctx, scene.currentPath, '#f4b21a', scene.projectileIndex + 1, true);
    }

    // 화면이 좁을수록(휴대폰) UI를 키워 손가락으로 잡을 수 있게 한다
    var ui = this.ui();

    drawCannon(ctx, map.launch, scene.angle);
    drawWind(ctx, scene.wind, scene.windLabel, ui);

    // 조준 컨트롤: 앞쪽 각도 다이얼 + 뒤쪽 힘 손잡이 (발사 중이 아닐 때)
    var mode = scene.drag ? scene.drag.mode : null;
    if (!scene.currentPath) {
      drawAngleDial(ctx, map.launch, scene.angle, mode === 'aim', ui);
      drawPowerControl(ctx, map.launch, scene.angle, scene.power, mode, scene.drag && scene.drag.point, ui);
      // 각도·힘 숫자 판 — 좌상단 고정 (대포 입구를 가리지 않는다)
      drawReadout(ctx, scene.angle, scene.power, mode === 'power', mode, ui);
    }

    if (scene.projectilePos) drawProjectile(ctx, scene.projectilePos, scene.projectile);
    if (scene.burst) drawBurst(ctx, scene.burst.pos, scene.burst.t, scene.burst.color);
  };

  return {
    Scene: Scene,
    WORLD: { w: W, h: H },
    // 조준 컨트롤의 위치·변환 (app.js가 어디를 잡았는지 판정할 때 쓴다).
    // 그림과 판정이 어긋나지 않도록 계산은 여기 한 곳에만 둔다.
    ARC_R: ARC_R,
    MAX_PULL: MAX_PULL,
    knobAngle: knobAngle,
    knobPowerRest: knobPowerRest,
    powerGauge: powerGauge,
    powerHandleY: powerHandleY,
    powerFromY: powerFromY
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Renderer;
