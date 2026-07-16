/**
 * maps.js — 맵 5종 · 지형 · 탄환 3종 · 난이도 5단계 (데이터)
 *
 * PRD 22의 맵 데이터를 그대로 쓰지 못한 이유는 개발 계획서 3절에 적었다.
 *   - 지형(terrain)이 없다. Map 2는 "언덕 뒤", Map 3은 "절벽 건너편"인데
 *     obstacles의 사각형 하나로는 지면 형상을 표현할 수 없다. → 폴리라인 추가
 *   - friction이 맵당 스칼라 하나뿐인데 PRD 6.2는 얼음·흙·모래를 요구한다.
 *     → 지형 세그먼트마다 surface를 붙였다
 *   - wind가 스칼라라 상승·하강 기류를 표현할 수 없다. → {x, y} 벡터
 *
 * 좌표는 PRD 22의 값을 참고하되 tools/calibrate.html의 실측으로 다시 잡았다.
 * 개발 계획서 4.3 Phase 2의 완료 기준이 "25조합 전부 클리어 가능"이다.
 */

var Maps = (function () {
  'use strict';

  var GROUND = 470;
  var LAUNCH = { x: 86, y: 452 };

  // 목표물을 지면에서 띄우는 높이(px). 짧게 쏴서 굴러 들어가는 것을 막는다.
  // 굴러가는 탄환의 중심은 지면에서 반지름(약 7px)만큼 위인데, 목표물 중심을
  // 이보다 훨씬 높이 두면(중심 간 거리 > 반지름 26px) 굴러서는 닿을 수 없다.
  // 반드시 포물선으로 띄워 넣어야 명중한다.
  var TARGET_LIFT = 62;
  var TARGET_R = 26;

  // ─── 탄환 ─────────────────────────────────────────────
  //
  // 둥근·무거운 두 종만 둔다. 둘은 모양(항력)이 같고 질량만 다르므로, 탄환을
  // 바꿔 보는 것만으로 "같은 힘을 줘도 무거우면 덜 나가고, 대신 바람·공기 저항에
  // 덜 흔들린다"는 질량의 효과를 변인 통제로 관찰할 수 있다. (넓적한 탄환은
  // 모양-항력 축을 하나 더 얹었지만 학습 초점을 흐려 뺐다.)
  var PROJECTILES = [
    {
      id: 'round',
      name: '둥근 탄환',
      short: 'ROUND',
      mass: 2,
      drag: 0.3,
      desc: '가벼워서 같은 힘으로 더 멀리 날아가지만, 바람에 잘 흔들린다.'
    },
    {
      id: 'heavy',
      name: '무거운 탄환',
      short: 'HEAVY',
      mass: 3,
      drag: 0.3,
      desc: '같은 힘을 주어도 느리게 나가지만, 바람과 공기 저항에 덜 흔들린다.'
    }
  ];

  // ─── 난이도 (개발 계획서 0.1(1)) ──────────────────────────
  //
  // PRD 6의 Level은 맵과 같은 변수를 두 번 정의한다 (Level 3은 "공기 저항 없음",
  // Map 4는 "공기 저항 있음" — 스테이지 모드에서 정면 충돌한다). 두 축을
  // 직교시켰다: 맵이 어떤 변인을 켤지 정하고, 난이도는 그 세기와 발사 횟수만
  // 정한다. PRD 6의 Level 이름 5개(진공 훈련장 등)는 맵 이름과 중복이라 폐기했다.
  var DIFFICULTIES = [
    { level: 1, name: '입문', envScale: 0.5, shotBonus: 2, scoreMult: 1.0, desc: '바람과 저항이 약하게 작용한다. 발사 기회 2회 추가.' },
    { level: 2, name: '초급', envScale: 0.75, shotBonus: 1, scoreMult: 1.1, desc: '조건이 조금 강해진다. 발사 기회 1회 추가.' },
    { level: 3, name: '중급', envScale: 1.0, shotBonus: 0, scoreMult: 1.2, desc: '맵이 설계된 그대로의 조건.' },
    { level: 4, name: '상급', envScale: 1.25, shotBonus: 0, scoreMult: 1.3, desc: '바람과 저항이 강해진다.' },
    { level: 5, name: '최상급', envScale: 1.5, shotBonus: -1, scoreMult: 1.5, desc: '조건이 가장 강하고, 발사 기회가 1회 줄어든다.' }
  ];

  // ─── 맵 ────────────────────────────────────────────────

  var MAPS = [
    {
      id: 1,
      name: '훈련 평원',
      subtitle: '힘의 크기와 방향',
      concept: '발사 힘과 각도가 운동 경로를 어떻게 바꾸는지 살펴본다.',
      lesson:
        '이번 미션에는 방해하는 힘이 거의 없었습니다. ' +
        '발사 힘이 클수록 탄환은 더 멀리 날아가고, 각도가 너무 낮으면 빨리 떨어지며 ' +
        '너무 높으면 위로만 올라가 멀리 가지 못합니다.',
      gravity: 9.8,
      wind: { x: 0, y: 0 },
      airResistance: 0,
      maxShots: 5,
      launch: { x: LAUNCH.x, y: LAUNCH.y },
      terrain: [
        { x: -100, y: GROUND, surface: 'plain' },
        { x: 1100, y: GROUND, surface: 'plain' }
      ],
      obstacles: [],
      target: { x: 742, y: GROUND - TARGET_LIFT, r: TARGET_R },
      // 리스폰마다 바뀌는 초기 조건 (개발 계획서 8.6). 바람이 없는 맵이라
      // 목표물 거리만 흔든다 — 그래도 각도·힘을 매번 새로 잡아야 한다.
      rand: { targetX: [560, 830], groundY: GROUND, wind: null }
    },

    {
      id: 2,
      name: '모래 협곡',
      subtitle: '마찰력',
      concept: '땅에 닿은 뒤 굴러가는 거리는 지면 상태에 따라 달라진다.',
      lesson:
        '이번 미션에서는 마찰력이 중요한 역할을 했습니다. ' +
        '마찰이 큰 모래 지면에서는 탄환이 땅에 닿은 뒤 금방 멈춥니다. ' +
        '언덕 너머까지 굴러가게 하려면 더 큰 힘이나 다른 각도가 필요합니다.',
      gravity: 9.8,
      wind: { x: 0, y: 0 },
      airResistance: 0,
      maxShots: 6,
      launch: { x: LAUNCH.x, y: LAUNCH.y },
      // 앞마당은 얼음, 언덕 너머는 모래다. 같은 힘으로 쏴도 어디에 떨어지느냐에
      // 따라 굴러가는 거리가 달라진다 — 한 화면에서 마찰을 비교할 수 있다.
      terrain: [
        { x: -100, y: GROUND, surface: 'ice' },
        { x: 340, y: GROUND, surface: 'ice' },
        { x: 424, y: 398, surface: 'dirt' },
        { x: 508, y: 398, surface: 'sand' },
        { x: 592, y: GROUND, surface: 'sand' },
        { x: 1100, y: GROUND, surface: 'sand' }
      ],
      obstacles: [],
      target: { x: 726, y: GROUND - TARGET_LIFT, r: TARGET_R },
      rand: { targetX: [648, 850], groundY: GROUND, wind: null }
    },

    {
      id: 3,
      name: '바람 절벽',
      subtitle: '바람에 의한 운동 변화',
      concept: '바람은 날아가는 탄환을 밀어 경로를 바꾼다.',
      lesson:
        '이번 미션에서는 바람이 탄환을 옆으로 밀었습니다. ' +
        '같은 힘과 같은 각도로 쏘아도 바람의 방향과 세기에 따라 탄환이 도착하는 ' +
        '곳이 달라집니다. 발사 전에 바람을 확인하고 조건을 조절해야 합니다.',
      gravity: 9.8,
      // 우풍. 공기 저항은 0인데 바람은 분다 — PRD 22 Map 3의 조합이다.
      // 바람을 항력의 일부로 모델링했다면 이 맵에서 바람이 통째로 사라졌을 것이다.
      wind: { x: 1.4, y: 0 },
      airResistance: 0,
      maxShots: 6,
      launch: { x: LAUNCH.x, y: LAUNCH.y },
      terrain: [
        { x: -100, y: GROUND, surface: 'rock' },
        { x: 396, y: GROUND, surface: 'rock' },
        { x: 428, y: 980, surface: 'rock' },
        { x: 612, y: 980, surface: 'rock' },
        { x: 644, y: 388, surface: 'rock' },
        { x: 1100, y: 388, surface: 'rock' }
      ],
      obstacles: [],
      target: { x: 806, y: 388 - TARGET_LIFT, r: TARGET_R },
      // 바람 방향(좌/우)과 세기가 리스폰마다 바뀐다. 학생은 매번 바람을 보고
      // 조준을 새로 잡아야 한다 — 각도·힘만 외워서는 클리어할 수 없다.
      rand: { targetX: [700, 930], groundY: 388, wind: { xMin: 0.9, xMax: 1.9, bidir: true, yAmp: 0.3 } }
    },

    {
      id: 4,
      name: '저항의 숲',
      subtitle: '공기 저항',
      concept: '공기 저항은 날아가는 동안 속력을 줄인다. 탄환의 질량에 따라 다르다.',
      lesson:
        '이번 미션에서는 공기 저항이 탄환의 속력을 줄였습니다. ' +
        '가벼운 둥근 탄환은 공기 저항에 더 많이 느려지고, ' +
        '무거운 탄환은 같은 저항에도 속력이 덜 줄어 더 안정적으로 날아갑니다. ' +
        '물체의 질량에 따라 공기 저항의 영향이 달라집니다.',
      gravity: 9.8,
      wind: { x: 0.4, y: 0 },
      airResistance: 0.02,
      maxShots: 7,
      launch: { x: LAUNCH.x, y: LAUNCH.y },
      terrain: [
        { x: -100, y: GROUND, surface: 'dirt' },
        { x: 1100, y: GROUND, surface: 'dirt' }
      ],
      obstacles: [
        { x: 396, y: 296, w: 34, h: 174, type: 'tree' },
        { x: 534, y: 336, w: 34, h: 134, type: 'tree' }
      ],
      target: { x: 802, y: GROUND - TARGET_LIFT, r: TARGET_R },
      rand: { targetX: [706, 880], groundY: GROUND, wind: { xMin: 0.2, xMax: 0.7, bidir: true, yAmp: 0 } }
    },

    {
      id: 5,
      name: '최종 요새',
      subtitle: '종합 적용',
      concept: '마찰·바람·공기 저항·장애물이 함께 작용한다.',
      lesson:
        '이번 미션에서는 여러 조건이 함께 작용했습니다. ' +
        '역풍이 탄환을 밀어내고, 공기 저항이 속력을 줄이며, 방어벽이 낮은 경로를 ' +
        '막았습니다. 조건이 여럿일 때는 하나씩 바꿔 보며 원인을 찾아야 합니다.',
      gravity: 9.8,
      wind: { x: -1.0, y: -0.35 },
      airResistance: 0.018,
      maxShots: 8,
      launch: { x: LAUNCH.x, y: LAUNCH.y },
      terrain: [
        { x: -100, y: GROUND, surface: 'dirt' },
        { x: 268, y: GROUND, surface: 'dirt' },
        { x: 348, y: 424, surface: 'dirt' },
        { x: 432, y: GROUND, surface: 'sand' },
        { x: 1100, y: GROUND, surface: 'sand' }
      ],
      // PRD 6.5의 "목표물이 보호막 뒤에 있음". 방어벽이 낮은 경로를 막으므로
      // 높은 각도로 넘겨야 한다 (§7.5 "직접 맞히기보다 높은 각도 필요").
      obstacles: [{ x: 606, y: 290, w: 44, h: 180, type: 'wall' }],
      target: { x: 812, y: GROUND - TARGET_LIFT, r: TARGET_R },
      rand: { targetX: [724, 892], groundY: GROUND, wind: { xMin: 0.8, xMax: 1.5, bidir: true, yMin: -0.5, yMax: 0.1 } }
    }
  ];

  // ─── 조건 조립 ─────────────────────────────────────────

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  function getMap(id) {
    return byId(MAPS, id);
  }

  function getProjectile(id) {
    return byId(PROJECTILES, id);
  }

  function getDifficulty(level) {
    for (var i = 0; i < DIFFICULTIES.length; i++) {
      if (DIFFICULTIES[i].level === level) return DIFFICULTIES[i];
    }
    return DIFFICULTIES[2];
  }

  /** 난이도를 반영한 발사 횟수. 최소 3회는 보장한다. */
  function shotsFor(map, level) {
    return Math.max(3, map.maxShots + getDifficulty(level).shotBonus);
  }

  /**
   * physics.simulate()에 넘길 조건을 만든다.
   *
   * 맵(어떤 변인) × 난이도(얼마나 세게) × 탄환 × 학생 입력(각도·힘)이
   * 여기서 하나로 합쳐진다. env로 교사 시연 모드가 개별 변인을 덮어쓴다.
   */
  function buildCondition(opts) {
    var map = getMap(opts.mapId);
    var diff = getDifficulty(opts.level);
    var proj = getProjectile(opts.projectileId);
    var env = opts.env || {};
    var s = diff.envScale;

    // 바람의 출처는 세 가지다. env.wind(교사·챌린지, 이미 최종값) > opts.windBase
    // (리스폰 랜덤화, 난이도 배율 적용 전) > map.wind(맵 기본).
    var baseWind = opts.windBase || map.wind;
    var wind = env.wind || { x: baseWind.x * s, y: baseWind.y * s };
    var air = env.airResistance == null ? map.airResistance * s : env.airResistance;
    var fric = env.frictionScale == null ? s : env.frictionScale;

    return {
      launch: { x: map.launch.x, y: map.launch.y },
      angle: opts.angle,
      power: opts.power,
      projectile: { mass: proj.mass, drag: proj.drag },
      gravity: env.gravity == null ? map.gravity : env.gravity,
      wind: { x: wind.x, y: wind.y },
      airResistance: air,
      frictionScale: fric,
      terrain: map.terrain,
      obstacles: map.obstacles,
      target: opts.target || map.target
    };
  }

  /**
   * 맵 리스폰마다 초기 조건을 흔든다 (수정사항 4). 목표물 거리는 모든 맵에서,
   * 바람은 바람 있는 맵에서 매번 바뀐다. 같은 seed면 같은 결과가 나와 재현·검증
   * 가능하다 (Math.random을 쓰지 않는다 — 개발 계획서 4.1 원칙 2와 같은 이유).
   *
   * 반환하는 wind는 난이도 배율 적용 전의 기본값이다. buildCondition이 배율을
   * 곱한다. → { windBase, target }
   */
  function rollConditions(mapId, rng) {
    var map = getMap(mapId);
    var r = map.rand;
    var tx, ty;
    if (r) {
      tx = Math.round(r.targetX[0] + rng() * (r.targetX[1] - r.targetX[0]));
      ty = r.groundY - TARGET_LIFT;
    } else {
      tx = map.target.x;
      ty = map.target.y;
    }
    var wind = { x: 0, y: 0 };
    if (r && r.wind) {
      var wc = r.wind;
      if (wc.xMin != null) {
        var mag = wc.xMin + rng() * (wc.xMax - wc.xMin);
        var sign = wc.bidir ? (rng() < 0.5 ? -1 : 1) : 1;
        wind.x = Math.round(sign * mag * 10) / 10;
      } else if (wc.xAmp != null) {
        wind.x = Math.round((rng() * 2 - 1) * wc.xAmp * 10) / 10;
      }
      if (wc.yMin != null) {
        wind.y = Math.round((wc.yMin + rng() * (wc.yMax - wc.yMin)) * 10) / 10;
      } else if (wc.yAmp) {
        wind.y = Math.round((rng() * 2 - 1) * wc.yAmp * 10) / 10;
      }
    }
    return { windBase: wind, target: { x: tx, y: ty, r: TARGET_R } };
  }

  // ─── 학생에게 보여줄 표현 (PRD 8.2) ───────────────────────
  //
  // 숫자로 보여줄 수 있는 값은 각도·힘·남은 횟수·점수뿐이다. 바람·마찰·공기
  // 저항은 "약함/보통/강함" 같은 말로만 제시한다. 가속도·속도 벡터·성분·
  // 삼각함수 값은 어떤 화면에도 내보내지 않는다 (PRD 2.3).

  function windLabel(wind) {
    var mag = Math.sqrt(wind.x * wind.x + wind.y * wind.y);
    if (mag < 0.05) return { strength: '없음', dir: '', arrow: '·', magnitude: 0, level: 0 };
    var strength = mag < 0.8 ? '약함' : mag < 1.6 ? '보통' : '강함';
    // 수정사항 4: 풍속을 숫자로도 보여준다. 단, m/s 같은 물리 단위가 아니라
    // 게임 세기 1~5다 (PRD 2.3의 금지 단위를 피한다).
    var level = Math.max(1, Math.min(5, Math.round(mag / 0.45)));
    var dir;
    var arrow;
    if (Math.abs(wind.x) >= Math.abs(wind.y)) {
      dir = wind.x > 0 ? '오른쪽' : '왼쪽';
      arrow = wind.x > 0 ? '→' : '←';
    } else {
      dir = wind.y < 0 ? '위쪽(상승기류)' : '아래쪽(하강기류)';
      arrow = wind.y < 0 ? '↑' : '↓';
    }
    return { strength: strength, dir: dir, arrow: arrow, magnitude: mag, level: level };
  }

  function airLabel(air) {
    if (air < 0.004) return '없음';
    if (air < 0.018) return '작음';
    return '큼';
  }

  /** 맵의 지면들을 훑어 대표 마찰 정도를 말로 만든다. */
  function frictionLabel(map, level) {
    var s = getDifficulty(level).envScale;
    var seen = {};
    var names = [];
    for (var i = 0; i < map.terrain.length - 1; i++) {
      var surf = Physics.SURFACES[map.terrain[i].surface];
      if (!surf) continue;
      var mu = surf.mu * s;
      var lv = mu < 0.16 ? '작음' : mu < 0.5 ? '보통' : '큼';
      if (!seen[lv]) {
        seen[lv] = true;
        names.push(lv);
      }
    }
    return names.join('·') || '보통';
  }

  /** 챌린지 모드용 시드 난수. Math.random을 쓰면 기록을 재현할 수 없다. */
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * 챌린지 모드: 맵의 조건을 시드로 흔든다. PRD 5.3의 "바람·마찰·공기 저항이
   * 랜덤 또는 복합적으로 작용". 시드를 기록에 남기므로 같은 판을 다시 볼 수 있다.
   */
  function challengeEnv(mapId, rng) {
    var map = getMap(mapId);
    var wx = (rng() * 2 - 1) * 2.4;
    var wy = (rng() * 2 - 1) * 0.8;
    var air = rng() * 0.035;
    var fric = 0.7 + rng() * 1.1;
    return {
      wind: { x: Math.round(wx * 10) / 10, y: Math.round(wy * 10) / 10 },
      airResistance: Math.round(air * 1000) / 1000,
      frictionScale: Math.round(fric * 100) / 100,
      gravity: map.gravity
    };
  }

  return {
    GROUND: GROUND,
    TARGET_LIFT: TARGET_LIFT,
    TARGET_R: TARGET_R,
    MAPS: MAPS,
    PROJECTILES: PROJECTILES,
    DIFFICULTIES: DIFFICULTIES,
    getMap: getMap,
    getProjectile: getProjectile,
    getDifficulty: getDifficulty,
    shotsFor: shotsFor,
    buildCondition: buildCondition,
    rollConditions: rollConditions,
    windLabel: windLabel,
    airLabel: airLabel,
    frictionLabel: frictionLabel,
    makeRng: makeRng,
    challengeEnv: challengeEnv
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Maps;
