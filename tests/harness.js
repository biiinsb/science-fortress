/**
 * harness.js — 의존성 없는 초소형 테스트 러너.
 *
 * 브라우저에서 열면 결과가 화면에 뜨고, 헤드리스 Chrome의 --dump-dom으로도
 * 같은 DOM을 읽을 수 있다. 그래서 CI 없이도 `tools/run-tests.sh` 한 줄로 돈다.
 */
var T = (function () {
  'use strict';
  var passed = 0;
  var failed = 0;
  var lines = [];
  var group = '';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function describe(name) {
    group = name;
    lines.push('<h2>' + esc(name) + '</h2>');
  }

  function ok(cond, msg) {
    if (cond) {
      passed++;
    } else {
      failed++;
      lines.push('<p class="fail">✘ ' + esc(group) + ' — ' + esc(msg) + '</p>');
    }
  }

  function eq(actual, expected, msg) {
    ok(actual === expected, msg + ' — 기대 ' + expected + ', 실제 ' + actual);
  }

  function near(actual, expected, tol, msg) {
    var d = Math.abs(actual - expected);
    ok(
      d <= tol,
      msg + ' — 기대 ' + expected + ' ±' + tol + ', 실제 ' + actual + ' (오차 ' + d.toFixed(4) + ')'
    );
  }

  function report() {
    var el = document.getElementById('out');
    var head =
      '<h1 id="summary" class="' +
      (failed === 0 ? 'pass' : 'fail') +
      '">' +
      (failed === 0 ? 'PASS' : 'FAIL') +
      ' — 단언 ' +
      (passed + failed) +
      '개 중 ' +
      passed +
      '개 통과, ' +
      failed +
      '개 실패</h1>';
    el.innerHTML = head + lines.join('\n');
    document.title = (failed === 0 ? 'PASS' : 'FAIL') + ' ' + passed + '/' + (passed + failed);
  }

  return { describe: describe, ok: ok, eq: eq, near: near, report: report };
})();
