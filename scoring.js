/**
 * scoring.js — 점수·정확도 (순수 함수)
 *
 * PRD는 점수 공식을 세 군데에서 서로 다르게 정의한다 (개발 계획서 0.1(2)).
 * §10.6과 PDF p.10이 일치하므로 그쪽을 채택하고 §10.3(난이도를 덧셈으로 두는
 * 판본)은 버렸다.
 *
 *   맵 점수 = (1000 + 남은 발사 횟수 × 100 + 정확도 보너스 + 분석 보너스) × 난이도 배율
 *   총점    = 맵 점수 합계 + 연속 클리어 보너스
 */

var Scoring = (function () {
  'use strict';

  var BASE = 1000;
  var PER_SHOT_LEFT = 100;
  var STREAK_BONUS = 2000; // 5개 맵 연속 클리어 (PRD 10.2)
  var ANALYSIS_BONUS = 200;

  // ─── 정확도 (개발 계획서 0.1(3)) ──────────────────────────
  //
  // PRD 10.4는 정확도를 4단계 구간으로, PRD 16.1은 백분율(92)로 쓴다.
  // 물리 코어가 연속값(0~1)을 내고, 점수만 여기서 구간으로 환산한다.
  // 그래서 두 정의를 다 만족한다.

  var BANDS = [
    { min: 0.8, bonus: 500, name: '중심 명중' },
    { min: 0.4, bonus: 300, name: '안쪽 명중' },
    { min: 0.0001, bonus: 100, name: '가장자리 명중' },
    { min: -1, bonus: 0, name: '빗나감' }
  ];

  function band(accuracy) {
    for (var i = 0; i < BANDS.length; i++) {
      if (accuracy >= BANDS[i].min) return BANDS[i];
    }
    return BANDS[BANDS.length - 1];
  }

  function accuracyBonus(accuracy) {
    return band(accuracy).bonus;
  }

  function accuracyPercent(accuracy) {
    return Math.round(accuracy * 100);
  }

  // ─── 분석 보너스 (개발 계획서 5절 의사결정 2) ───────────────
  //
  // PRD 10.2는 요소로 들지만 §10.6 공식에도 PDF p.10에도 빠져 있다.
  // 채택한 이유: PRD 24.2의 게임 성공 기준("무작위가 아니라 조건을 조절하며
  // 재도전한다")을 점수로 보상하는 장치가 이것뿐이다.
  //
  // 직전 실패와 비교해 조건을 딱 하나만 바꿔 성공했을 때 준다. 변인 통제
  // 그 자체를 보상하는 것이지, 단순히 재시도했다고 주는 게 아니다.

  function countChanges(a, b) {
    if (!a || !b) return -1;
    var n = 0;
    if (a.angle !== b.angle) n++;
    if (a.power !== b.power) n++;
    if (a.projectileId !== b.projectileId) n++;
    return n;
  }

  function analysisBonus(prevShot, thisShot) {
    return countChanges(prevShot, thisShot) === 1 ? ANALYSIS_BONUS : 0;
  }

  // ─── 맵 점수 ───────────────────────────────────────────

  /**
   * opts = { shotsLeft, accuracy, level, analysis(bool) }
   * 실패로 맵을 끝냈으면 0점이다.
   */
  function mapScore(opts) {
    var mult = Maps.getDifficulty(opts.level).scoreMult;
    var sub =
      BASE +
      Math.max(0, opts.shotsLeft) * PER_SHOT_LEFT +
      accuracyBonus(opts.accuracy) +
      (opts.analysis ? ANALYSIS_BONUS : 0);
    return Math.round(sub * mult);
  }

  /** 맵 점수를 요소별로 쪼개 보여준다. 결과 화면(PRD 13.3)이 쓴다. */
  function breakdown(opts) {
    var diff = Maps.getDifficulty(opts.level);
    var rows = [
      { label: '기본 점수', value: BASE },
      { label: '남은 발사 횟수 ' + Math.max(0, opts.shotsLeft) + '회', value: Math.max(0, opts.shotsLeft) * PER_SHOT_LEFT },
      { label: band(opts.accuracy).name, value: accuracyBonus(opts.accuracy) }
    ];
    if (opts.analysis) {
      rows.push({ label: '분석 보너스 (조건을 하나만 바꿔 성공)', value: ANALYSIS_BONUS });
    }
    var sub = 0;
    for (var i = 0; i < rows.length; i++) sub += rows[i].value;
    return {
      rows: rows,
      subtotal: sub,
      multiplier: diff.scoreMult,
      total: Math.round(sub * diff.scoreMult)
    };
  }

  // ─── 총점 ─────────────────────────────────────────────

  /** scores = 맵별 점수 배열 (실패한 맵은 0). */
  function total(scores, clearedAll) {
    var sum = 0;
    for (var i = 0; i < scores.length; i++) sum += scores[i];
    return sum + (clearedAll ? STREAK_BONUS : 0);
  }

  return {
    BASE: BASE,
    PER_SHOT_LEFT: PER_SHOT_LEFT,
    STREAK_BONUS: STREAK_BONUS,
    ANALYSIS_BONUS: ANALYSIS_BONUS,
    band: band,
    accuracyBonus: accuracyBonus,
    accuracyPercent: accuracyPercent,
    countChanges: countChanges,
    analysisBonus: analysisBonus,
    mapScore: mapScore,
    breakdown: breakdown,
    total: total
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Scoring;
