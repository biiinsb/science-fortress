/**
 * physics.js — 과학 포트리스 물리 코어
 *
 * 개발 계획서 4.1 원칙 1·2:
 *   - DOM을 모르는 순수 함수만 둔다. 브라우저 없이 단독 실행된다.
 *   - 같은 입력은 반드시 같은 궤적을 낳는다. 고정 타임스텝으로 적분하고
 *     Math.random()을 쓰지 않는다. 이 성질이 깨지면 변인 통제(PRD 2.2)와
 *     시연 모드(PRD 5.4)가 성립하지 않는다.
 *
 * simulate()는 프레임을 모른다. 궤적 전체를 한 번에 계산해 배열로 돌려주고,
 * 렌더러가 그 배열을 재생한다. 물리가 프레임레이트에서 분리되므로 크롬북에서
 * 프레임이 떨어져도 궤적은 같다.
 *
 * 좌표계: 화면 좌표. x 오른쪽 +, y 아래쪽 +. 따라서 중력은 +y, 상승기류는 -y다.
 */

var Physics = (function () {
  'use strict';

  var WORLD = { w: 960, h: 540 };

  var DT = 1 / 240;
  var MAX_TIME = 20;
  var SAMPLE_EVERY = 4; // 4스텝마다 궤적 기록 → 60Hz

  var PX_PER_M = 40; // gravity 9.8 → 392 px/s²

  // 발사는 용수철이 저장한 에너지를 탄환에 준다 (PDF p.7 질량 패널의 그림).
  // E = ½mv² 이므로 v0 ∝ 1/√m. 같은 힘을 줘도 무거운 탄환은 느리게 나간다.
  //
  // 10.4는 진공 최대 사거리를 1378px로 만든다. 가장 먼 목표물이 726px이니
  // 거의 두 배다. 이 여유가 있어야 항력과 역풍이 사거리를 깎고도 목표물에
  // 닿는다. 최대 사거리를 목표물에 맞춰 잡았더니 Map 4·5가 통째로 클리어
  // 불가능해졌다 (tools/calibrate.html이 이를 잡아냈다).
  var POWER_SCALE = 10.4;

  // 55는 PRD 9.3이 정한 airResistance 범위(0~0.05)를 쓸 만하게 만든다.
  // Map 4의 0.02에서 둥근 탄환은 사거리를 4분의 1쯤 잃고, 무거운 탄환은 질량이
  // 커서 그보다 덜 잃는다. 더 크게 잡으면 PRD가 "보통"으로 상정한 값에서
  // 어떤 탄환도 목표물에 닿지 못한다.
  var DRAG_SCALE = 55;

  var WIND_SCALE = 220;

  var BOUNCE_MIN = 45; // px/s. 이보다 느리게 부딪히면 튀지 않고 얹힌다
  var STOP_SPEED = 10; // px/s

  // PRD 6.2의 얼음길·흙길·모래길. mu는 실제 물리값이 아니라 960px 세계에
  // 맞춘 값이다. 교과서적인 얼음 마찰계수(0.03)를 쓰면 탄환이 1km를 굴러
  // 화면 밖으로 나가버려서, "얼음길은 멀리 구른다"를 오히려 볼 수 없다.
  var SURFACES = {
    plain: { mu: 0.18, restitution: 0.28, label: '평평한 땅', level: '작음' },
    ice: { mu: 0.10, restitution: 0.32, label: '얼음길', level: '작음' },
    dirt: { mu: 0.35, restitution: 0.25, label: '흙길', level: '보통' },
    sand: { mu: 0.85, restitution: 0.08, label: '모래길', level: '큼' },
    rock: { mu: 0.45, restitution: 0.38, label: '바위', level: '보통' }
  };

  // ─── 기하 ───────────────────────────────────────────────

  function hypot(dx, dy) {
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 지형 폴리라인에서 x 위치의 지면 정보를 얻는다. */
  function groundAt(terrain, x) {
    var i = 0;
    if (x <= terrain[0].x) i = 0;
    else if (x >= terrain[terrain.length - 1].x) i = terrain.length - 2;
    else {
      for (var k = 0; k < terrain.length - 1; k++) {
        if (x >= terrain[k].x && x <= terrain[k + 1].x) {
          i = k;
          break;
        }
      }
    }
    var p1 = terrain[i];
    var p2 = terrain[i + 1];
    var dx = p2.x - p1.x;
    var dy = p2.y - p1.y;
    var len = hypot(dx, dy) || 1;
    var s = dx === 0 ? 0 : (x - p1.x) / dx;
    if (s < 0) s = 0;
    if (s > 1) s = 1;
    return {
      y: p1.y + dy * s,
      // 접선(진행 방향)과 법선(위쪽). 평지에서 t=(1,0), n=(0,-1)이다.
      t: { x: dx / len, y: dy / len },
      n: { x: dy / len, y: -dx / len },
      surface: p1.surface || 'dirt'
    };
  }

  function pointInRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  /**
   * a(공중)와 b(지면 아래) 사이에서 지면을 뚫고 지나간 지점을 찾는다.
   *
   * 스텝이 끝난 위치를 그냥 착지점으로 쓰면 최대 3px까지 파고든 채로 기록된다.
   * 그 오차는 44°와 45°의 사거리 차이(0.2px)보다 훨씬 커서, "진공에서 최대
   * 사거리는 45°"라는 기본 성질조차 측정으로 확인할 수 없게 만든다.
   */
  function groundCrossing(terrain, a, b) {
    var lo = 0;
    var hi = 1;
    for (var i = 0; i < 24; i++) {
      var m = (lo + hi) / 2;
      var x = a.x + (b.x - a.x) * m;
      var y = a.y + (b.y - a.y) * m;
      if (y - groundAt(terrain, x).y < 0) lo = m;
      else hi = m;
    }
    return {
      x: a.x + (b.x - a.x) * hi,
      y: a.y + (b.y - a.y) * hi
    };
  }

  /** 점 c와 선분 a-b 사이의 최단 거리. 한 스텝 사이를 탄환이 건너뛰어도 놓치지 않는다. */
  function distToSegment(c, a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var l2 = dx * dx + dy * dy;
    if (l2 === 0) return { d: hypot(c.x - a.x, c.y - a.y), p: { x: a.x, y: a.y } };
    var t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var px = a.x + t * dx;
    var py = a.y + t * dy;
    return { d: hypot(c.x - px, c.y - py), p: { x: px, y: py } };
  }

  // ─── 시뮬레이션 ──────────────────────────────────────────

  /**
   * 발사 하나를 끝까지 굴린다.
   *
   * cond = {
   *   launch: {x, y}, angle(도), power(1~100),
   *   projectile: {mass, drag},
   *   gravity: 9.8,
   *   wind: {x, y},          // y 음수 = 상승기류
   *   airResistance: 0~0.05,
   *   frictionScale: 1,      // 난이도 배율
   *   terrain: [{x, y, surface}],
   *   obstacles: [{x, y, w, h, type}],
   *   target: {x, y, r}
   * }
   */
  function simulate(cond) {
    var proj = cond.projectile;
    var g = cond.gravity * PX_PER_M;

    // 항력·바람 모두 (모양 ÷ 질량)에 비례한다. 그래서 가벼운 둥근 탄환은 더 많이
    // 밀리고 더 빨리 느려지며, 질량이 큰 무거운 탄환은 둘 다 덜 겪는다.
    var kDrag = (DRAG_SCALE * cond.airResistance * proj.drag) / proj.mass;
    var aWind = {
      x: (WIND_SCALE * cond.wind.x * proj.drag) / proj.mass,
      y: (WIND_SCALE * cond.wind.y * proj.drag) / proj.mass
    };
    var frictionScale = cond.frictionScale == null ? 1 : cond.frictionScale;

    var rad = (cond.angle * Math.PI) / 180;
    var v0 = (POWER_SCALE * cond.power) / Math.sqrt(proj.mass);

    var pos = { x: cond.launch.x, y: cond.launch.y };
    var vel = { x: Math.cos(rad) * v0, y: -Math.sin(rad) * v0 };

    var path = [{ x: pos.x, y: pos.y }];
    var t = 0;
    var step = 0;
    var grounded = false;
    var outcome = 'timeout';
    var landing = null;
    var stop = null;
    var obstacleHit = null;
    var bestDist = Infinity;
    var bestPt = null;
    var enteredTarget = false;
    var bounces = 0;

    function accelAt(v) {
      return {
        x: aWind.x - kDrag * v.x,
        y: g + aWind.y - kDrag * v.y
      };
    }

    while (t < MAX_TIME) {
      var prev = { x: pos.x, y: pos.y };

      if (!grounded) {
        // pos += v·dt + ½a·dt². 가속도가 일정할 때(= 진공) 오차가 0이다.
        // v를 먼저 갱신하고 pos += v·dt 하면 매 스텝 ½a·dt²씩 앞질러,
        // 2초 비행에 2px 가까이 어긋난다.
        var a = accelAt(vel);
        pos.x += vel.x * DT + 0.5 * a.x * DT * DT;
        pos.y += vel.y * DT + 0.5 * a.y * DT * DT;
        vel.x += a.x * DT;
        vel.y += a.y * DT;
      } else {
        // 구르는 중. 법선 방향은 지면이 받치므로 접선 성분만 적분한다.
        var gr = groundAt(cond.terrain, pos.x);
        var surf = SURFACES[gr.surface] || SURFACES.dirt;
        var ar = accelAt(vel);
        var at = ar.x * gr.t.x + ar.y * gr.t.y;
        var an = Math.abs(ar.x * gr.n.x + ar.y * gr.n.y);
        var vt = vel.x * gr.t.x + vel.y * gr.t.y;
        var mu = surf.mu * frictionScale;
        var fric = mu * an;

        vt += at * DT;
        var fdv = fric * DT;
        if (Math.abs(vt) <= fdv) vt = 0;
        else vt -= (vt > 0 ? 1 : -1) * fdv;

        vel.x = vt * gr.t.x;
        vel.y = vt * gr.t.y;
        pos.x += vel.x * DT;
        pos.y += vel.y * DT;

        var gr2 = groundAt(cond.terrain, pos.x);
        if (pos.y < gr2.y - 3) {
          grounded = false; // 지형이 꺼졌다. 다시 자유낙하
        } else {
          pos.y = gr2.y;
        }

        // 정지 판정: 느리고, 경사가 정지마찰을 못 이기면 멈춘다
        if (grounded && Math.abs(vt) < STOP_SPEED && Math.abs(at) <= fric) {
          stop = { x: pos.x, y: pos.y };
          outcome = 'stopped';
          path.push({ x: pos.x, y: pos.y });
          break;
        }
      }

      t += DT;
      step++;

      // 목표물 — 최근접 거리를 추적한다. 첫 접촉점으로 정확도를 재면
      // 언제나 가장자리 판정이 나온다.
      var seg = distToSegment(cond.target, prev, pos);
      if (seg.d < bestDist) {
        bestDist = seg.d;
        bestPt = seg.p;
      }
      if (seg.d <= cond.target.r) enteredTarget = true;
      if (enteredTarget && seg.d > bestDist + 0.5) {
        outcome = 'hit';
        path.push({ x: bestPt.x, y: bestPt.y });
        break;
      }

      // 장애물
      var stopped = false;
      for (var i = 0; i < cond.obstacles.length; i++) {
        if (pointInRect(pos, cond.obstacles[i])) {
          obstacleHit = cond.obstacles[i];
          outcome = 'obstacle';
          stopped = true;
          break;
        }
      }
      if (stopped) {
        path.push({ x: pos.x, y: pos.y });
        break;
      }

      // 화면 밖 / 절벽 아래
      if (pos.y > WORLD.h) {
        outcome = 'fell';
        path.push({ x: pos.x, y: pos.y });
        break;
      }
      if (pos.x < -20 || pos.x > WORLD.w + 20) {
        outcome = 'out';
        path.push({ x: pos.x, y: pos.y });
        break;
      }

      // 지면 충돌
      if (!grounded) {
        var gc = groundAt(cond.terrain, pos.x);
        if (pos.y >= gc.y) {
          var cross = groundCrossing(cond.terrain, prev, pos);
          pos.x = cross.x;
          pos.y = cross.y;
          gc = groundAt(cond.terrain, pos.x);
          pos.y = gc.y;
          if (!landing) landing = { x: pos.x, y: pos.y };
          var surf2 = SURFACES[gc.surface] || SURFACES.dirt;
          var vn = vel.x * gc.n.x + vel.y * gc.n.y;
          var vtan = vel.x * gc.t.x + vel.y * gc.t.y;
          vtan *= 1 - Math.min(0.9, surf2.mu * frictionScale * 0.25);
          if (vn < -BOUNCE_MIN) {
            vn = -vn * surf2.restitution;
            vel.x = vtan * gc.t.x + vn * gc.n.x;
            vel.y = vtan * gc.t.y + vn * gc.n.y;
            bounces++;
          } else {
            vel.x = vtan * gc.t.x;
            vel.y = vtan * gc.t.y;
            grounded = true;
          }
        }
      }

      if (step % SAMPLE_EVERY === 0) path.push({ x: pos.x, y: pos.y });
    }

    if (outcome === 'timeout' && !stop) stop = { x: pos.x, y: pos.y };

    // 어떤 식으로 끝났든 목표물 반지름 안을 지났으면 명중이다
    var hit = bestDist <= cond.target.r;
    if (hit) outcome = 'hit';

    var impact = hit && bestPt ? bestPt : { x: pos.x, y: pos.y };

    return {
      path: path,
      outcome: outcome,
      hit: hit,
      // PRD 16.1은 정확도를 백분율로, 10.4는 4단계 구간으로 쓴다.
      // 여기서는 연속값만 낸다. 구간 환산은 scoring.js가 한다.
      accuracy: hit ? Math.max(0, 1 - bestDist / cond.target.r) : 0,
      missDistance: bestDist,
      impact: impact,
      landing: landing,
      stop: stop,
      obstacle: obstacleHit,
      bounces: bounces,
      rolled: landing && stop ? hypot(stop.x - landing.x, stop.y - landing.y) : 0,
      flightTime: t
    };
  }

  /**
   * 발사 전 조준 가이드. 발사대 부근의 짧은 직선만 준다.
   * 개발 계획서 0.1(6): 완전한 예측선은 정답을 그려주는 것이라 학습이 사라진다.
   * 전체 예측선은 연습 모드에서 predictPath()로만 허용한다.
   */
  function aimGuide(cond, length) {
    var rad = (cond.angle * Math.PI) / 180;
    var len = (length || 60) * (0.4 + (cond.power / 100) * 0.6);
    return {
      x: cond.launch.x + Math.cos(rad) * len,
      y: cond.launch.y - Math.sin(rad) * len
    };
  }

  /** 연습 모드 전용 전체 예측선. simulate와 같은 코드를 쓰므로 정확히 일치한다. */
  function predictPath(cond) {
    return simulate(cond).path;
  }

  return {
    WORLD: WORLD,
    SURFACES: SURFACES,
    PX_PER_M: PX_PER_M,
    POWER_SCALE: POWER_SCALE,
    DRAG_SCALE: DRAG_SCALE,
    WIND_SCALE: WIND_SCALE,
    simulate: simulate,
    aimGuide: aimGuide,
    predictPath: predictPath,
    groundAt: groundAt,
    distToSegment: distToSegment
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Physics;
