/**
 * feedback.js — 학생 화면에 나가는 모든 문구 (데이터)
 *
 * 개발 계획서 6절 리스크: PRD 2.3의 금지 범위(포물선 공식·삼각함수·벡터 분해·
 * 가속도 방정식·속도 벡터·성분)를 UI가 침범하면 교육과정을 벗어난다. 그래서
 * 학생에게 보이는 문자열을 여기 한 곳에 모았다. 검토도 여기만 보면 된다.
 *
 * 표현은 PRD 2.4의 "학생 언어"를 따른다. 숫자로 말해도 되는 것은 각도·힘·남은
 * 횟수·점수뿐이고(PRD 8.2), 힘·거리는 "더 세게/약하게", "더 멀리/짧게" 같은
 * 비교 표현으로만 쓴다.
 */

var Feedback = (function () {
  'use strict';

  // PRD 23의 피드백 문구. diagnose.js가 원인 코드를 정하면 여기서 문장을 찾는다.
  var MESSAGES = {
    success: '목표물을 맞혔습니다! 조건을 잘 조절했습니다.',
    successCenter: '목표물 중심을 정확히 맞혔습니다! 완벽한 조준입니다.',

    tooWeak: '힘이 약해서 목표물에 도달하지 못했습니다.',
    tooStrong: '힘이 너무 커서 목표물을 지나쳤습니다.',
    angleTooLow: '각도가 낮아 목표물 앞에 떨어졌습니다.',
    angleTooHigh: '각도가 높아 위로만 올라가고 멀리 가지 못했습니다.',

    windLeft: '바람이 왼쪽으로 불어 탄환이 밀렸습니다.',
    windRight: '바람이 오른쪽으로 불어 탄환이 밀렸습니다.',
    windUp: '상승기류가 탄환을 위로 밀어 예상보다 멀리 갔습니다.',
    windDown: '하강기류가 탄환을 눌러 예상보다 일찍 떨어졌습니다.',

    highFriction: '마찰이 커서 땅에 닿은 뒤 멀리 굴러가지 못했습니다.',
    highAirResistance: '공기 저항 때문에 날아가는 동안 속력이 줄어 짧게 이동했습니다.',

    obstacle: '탄환이 장애물에 부딪혔습니다.',
    obstacleLow: '각도가 낮아 장애물에 부딪혔습니다. 더 높이 넘겨 보세요.',
    fell: '탄환이 절벽 아래로 떨어졌습니다.',
    outOfBounds: '탄환이 화면 밖으로 날아갔습니다. 힘을 조금 줄여 보세요.',
    // 과녁 앞에 떨어져 그 아래로 굴러 지나간 경우. 과녁은 공중에 떠 있으므로
    // 굴러서는 맞힐 수 없다 — 포물선으로 띄워 넣어야 한다.
    rolledPast: '탄환이 과녁 아래로 굴러 지나갔습니다. 과녁은 공중에 떠 있으니 포물선으로 띄워 맞혀 보세요.'
  };

  // PRD 12.3: 3회 이상 실패하면 힌트를 준다. 원인 코드별로 다음에 무엇을
  // 바꿀지 콕 짚어 준다 (PDF p.11: "발사 힘을 조금 키워 보세요").
  var HINTS = {
    tooWeak: '발사 힘을 조금 키워 보세요.',
    tooStrong: '발사 힘을 조금 줄여 보세요.',
    angleTooLow: '발사 각도를 조금 높여 보세요.',
    angleTooHigh: '발사 각도를 조금 낮춰 보세요.',
    windLeft: '바람이 왼쪽으로 부니, 조금 더 오른쪽을 노려 보세요.',
    windRight: '바람이 오른쪽으로 부니, 조금 더 왼쪽을 노려 보세요.',
    windUp: '상승기류가 있으니 힘을 조금 줄여도 됩니다.',
    windDown: '하강기류가 있으니 힘을 조금 키워 보세요.',
    highFriction: '마찰이 크니 목표물에 더 가까이 떨어지도록 조준해 보세요.',
    highAirResistance: '공기 저항이 크니 둥근 탄환을 쓰거나 힘을 키워 보세요.',
    obstacleLow: '각도를 높여 장애물을 넘겨 보세요.',
    fell: '절벽을 건너도록 힘과 각도를 함께 키워 보세요.',
    outOfBounds: '힘을 조금 줄여 보세요.',
    rolledPast: '각도를 높이거나 힘을 조절해, 탄환이 과녁 높이에서 떨어지도록 해 보세요.',
    generic: '실패한 궤적을 보고, 조건을 하나씩만 바꿔 다시 시도해 보세요.'
  };

  function message(code) {
    return MESSAGES[code] || MESSAGES.success;
  }

  function hint(code) {
    return HINTS[code] || HINTS.generic;
  }

  return { MESSAGES: MESSAGES, HINTS: HINTS, message: message, hint: hint };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Feedback;
