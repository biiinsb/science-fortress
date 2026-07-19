/**
 * diagnose.js — 실패 원인 진단 (순수 함수)
 *
 * 개발 계획서 4.3 "Phase 5를 따로 설명하는 이유":
 *   §23의 피드백은 "힘이 약해서"인지 "공기 저항 때문에"인지 판정해야 하는데
 *   착탄점 하나로는 알 수 없다. 두 원인 모두 "짧게 떨어짐"으로 나타난다.
 *
 * 반사실 시뮬레이션으로 각 변인의 기여도를 실측한다. 물리 코어가 순수 함수라
 * 같은 발사를 조건만 바꿔 다시 굴릴 수 있다 — 이것이 계획서 4.2에서 Matter.js
 * 대신 자체 엔진을 택한 실질적 이유다.
 *
 * 개발 계획서 6절 리스크 대응: 여러 변인이 비슷하게 기여해 애매할 때는 변인을
 * 지목하지 않고 힘/각도 문구로 후퇴한다. 틀린 과학 설명을 하느니 두루뭉술한
 * 게 낫다.
 */

var Diagnose = (function () {
  'use strict';

  // 변인이 착탄점을 이만큼(px) 넘게 밀어냈을 때만 그 변인을 지목한다.
  var BLAME_THRESHOLD = 45;

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** 발사가 도달한 마지막 지점. 명중은 최근접점, 그 외는 정지·착탄점. */
  function endpoint(result) {
    if (result.hit) return result.impact;
    if (result.stop) return result.stop;
    if (result.landing) return result.landing;
    return result.impact;
  }

  /**
   * cond = 이번 발사에 쓴 조건 (Maps.buildCondition의 반환값)
   * result = Physics.simulate(cond)의 반환값
   *
   * { code, blame } 을 돌려준다. code는 feedback.js의 키다.
   */
  function diagnose(cond, result) {
    if (result.hit) {
      return { code: result.accuracy >= 0.8 ? 'successCenter' : 'success', blame: null };
    }

    // 화면 밖으로 나간 발사. 무조건 "힘이 너무 커서 넘어갔다"로 보면 안 된다.
    // 힘이 모자라 과녁 앞·아래에 떨어진 뒤, 미끄러운 지면을 굴러 화면 밖으로
    // 나가는 경우가 있다 — 이때 "힘을 줄이라"는 정반대 조언이다.
    //
    // 기준은 "공중에서 과녁을 넘겼는가"다. 탄환이 땅에 처음 닿은 곳(landing)이
    // 과녁의 먼쪽 끝(target.x + r)을 지나쳤다면 진짜로 넘어간 것(힘 과다)이고,
    // 그 안쪽이면 공중에서 과녁에 못 미쳐 굴러 지나간 것이다. 공중을 계속 날아
    // 나가 착지 자체가 없으면(landing 없음) 넘어간 것으로 본다.
    if (result.outcome === 'out') {
      var overshot = !result.landing || result.landing.x > cond.target.x + cond.target.r;
      return { code: overshot ? 'outOfBounds' : 'rolledPast', blame: null };
    }
    if (result.outcome === 'fell') return { code: 'fell', blame: null };
    if (result.outcome === 'obstacle') {
      // 장애물을 낮게 맞았으면 각도를, 그 외는 일반 장애물 문구를.
      var oy = result.obstacle ? result.obstacle.y : 0;
      var low = result.impact.y > oy + (result.obstacle ? result.obstacle.h * 0.4 : 0);
      return { code: low ? 'obstacleLow' : 'obstacle', blame: null };
    }

    var target = cond.target;
    var actualEnd = endpoint(result);
    var actualMiss = dist(actualEnd, target);

    // ── 반사실: 환경 변인을 하나씩 꺼서 다시 끝까지 굴린다 ──
    //
    // 핵심은 착탄점이 "움직였는가"가 아니라 "목표에 가까워졌는가"다. 약한
    // 발사는 마찰을 꺼도 착탄점이 앞으로 밀리지만 여전히 한참 짧다 — 그건
    // 마찰 탓이 아니라 힘 탓이다. 그래서 변인 제거가 목표까지의 거리를 얼마나
    // 줄이는지(improvement)를 재고, 그 값이 실제로 명중권에 들어올 때만 지목한다.
    function reEval(over) {
      var c = {};
      for (var k in cond) c[k] = cond[k];
      for (var j in over) c[j] = over[j];
      var r = Physics.simulate(c);
      return { miss: r.hit ? 0 : dist(endpoint(r), target), hit: r.hit };
    }

    var blame = { wind: 0, drag: 0, friction: 0 };
    var counterMiss = { wind: actualMiss, drag: actualMiss, friction: actualMiss };
    var hasWind = Math.abs(cond.wind.x) > 0.01 || Math.abs(cond.wind.y) > 0.01;
    var hasDrag = cond.airResistance > 0.0001;

    // 마찰은 착지한 뒤에만 작동한다. 탄환이 목표 근처까지 날아가 착지했는데
    // 굴러가다 멈춰 빗났을 때만 마찰 탓이다. 착지 자체가 한참 짧았다면(비행
    // 거리가 목표까지의 60%도 안 되면) 그건 마찰이 아니라 힘·각도 문제다 —
    // 마찰을 꺼서 지면을 굴려 목표에 닿게 하는 건 학생에게 줄 조언이 아니다.
    var flightSpan = result.landing ? result.landing.x - cond.launch.x : 0;
    var targetSpan = target.x - cond.launch.x;
    var landedNear = targetSpan > 0 && flightSpan / targetSpan >= 0.6;
    var hasFric = cond.frictionScale > 0 && result.rolled > 5 && landedNear;

    if (hasWind) { var w = reEval({ wind: { x: 0, y: 0 } }); counterMiss.wind = w.miss; blame.wind = actualMiss - w.miss; }
    if (hasDrag) { var g = reEval({ airResistance: 0 }); counterMiss.drag = g.miss; blame.drag = actualMiss - g.miss; }
    if (hasFric) { var f = reEval({ frictionScale: 0 }); counterMiss.friction = f.miss; blame.friction = actualMiss - f.miss; }

    // 목표: 변인을 제거하면 명중권(반지름의 1.2배) 안으로 들어오면서, 개선량이
    // 임계값을 넘는 변인. 그런 변인이 여럿이면 개선량이 가장 큰 것을 고른다.
    var near = target.r * 1.2;
    var top = null;
    var topVal = BLAME_THRESHOLD;
    ['wind', 'drag', 'friction'].forEach(function (key) {
      if (blame[key] > topVal && counterMiss[key] <= near) {
        topVal = blame[key];
        top = key;
      }
    });

    // 환경 변인이 진범이면 그것을 원인으로 지목한다
    if (top === 'wind') {
      var code;
      if (Math.abs(cond.wind.x) >= Math.abs(cond.wind.y)) {
        code = cond.wind.x < 0 ? 'windLeft' : 'windRight';
      } else {
        code = cond.wind.y < 0 ? 'windUp' : 'windDown';
      }
      return { code: code, blame: blame };
    }
    if (top === 'drag') return { code: 'highAirResistance', blame: blame };
    if (top === 'friction') return { code: 'highFriction', blame: blame };

    // ── 환경으로 설명되지 않으면 그제서야 힘/각도 문제로 귀결한다 ──
    // (계획서: "아무것도 넘지 않으면 그때 비로소 힘/각도 문제로")
    var shortOfTarget = actualEnd.x < target.x;
    var missX = Math.abs(actualEnd.x - target.x);

    if (shortOfTarget && missX > 20) {
      // 짧다. 각도가 극단이면 각도를, 아니면 힘을 탓한다.
      if (cond.angle >= 70) return { code: 'angleTooHigh', blame: blame };
      return { code: 'tooWeak', blame: blame };
    }
    if (!shortOfTarget && missX > 20) {
      if (cond.angle <= 20) return { code: 'angleTooLow', blame: blame };
      return { code: 'tooStrong', blame: blame };
    }

    // 좌우로는 거의 맞았는데 높이로 빗났다 — 각도 문제로 본다
    if (actualEnd.y > target.y) return { code: 'angleTooLow', blame: blame };
    return { code: 'angleTooHigh', blame: blame };
  }

  return {
    BLAME_THRESHOLD: BLAME_THRESHOLD,
    diagnose: diagnose,
    endpoint: endpoint
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Diagnose;
