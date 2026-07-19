/**
 * app.js — 상태와 UI를 엮는 컨트롤러
 *
 * 순수 계층(physics·maps·scoring·diagnose)은 여기서 조립만 한다. 이 파일은
 * DOM·이벤트·애니메이션을 맡고, 물리 판단은 절대 직접 하지 않는다.
 *
 * 모드 4종 (PRD 5, PDF p.9):
 *   practice  연습   — 점수 없음, 무제한 발사, 예측선 토글 (개발 계획서 0.1(6))
 *   stage     스테이지 — 5개 맵 순차, 점수 누적, 랭킹 등록
 *   challenge 챌린지  — 시드로 흔든 복합 조건, 최고 기록 도전
 *   teacher   시연   — 교사가 조건을 강제, 같은 각도·힘으로 비교 발사
 */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var scene = new Renderer.Scene($('stage'));

  // ─── 상태 ──────────────────────────────────────────────
  var S = {
    mode: 'stage',
    mapId: 1,
    level: 1,
    projectileId: 'round',
    angle: 45,
    power: 50,

    stageMaps: [1, 2, 3, 4, 5],
    stageIndex: 0,
    mapScores: [],
    totalShotsUsed: 0,
    bestAccuracy: 0,

    shotsLeft: 5,
    attempt: 0,
    lastShot: null,       // 직전 발사 조건 (분석 보너스 판정용)
    lastFailCode: null,
    failStreak: 0,
    clearedThisMap: false,
    analysisEarned: false,

    pastPaths: [],
    showPredict: false,
    seed: 0,
    challengeEnv: null,
    teacherEnv: null,
    roll: null,           // 리스폰마다 흔든 { windBase, target } (수정사항 4)
    respawnCount: 0,      // 랜덤 seed를 바꾸는 카운터

    drag: null,           // 대포 조준 드래그 상태 (수정사항 3)

    animating: false,
    sessionId: 't' + Math.floor(performance.now())
  };

  // ─── 조건 조립 ─────────────────────────────────────────

  function currentEnv() {
    if (S.mode === 'challenge' && S.challengeEnv) return S.challengeEnv;
    if (S.mode === 'teacher' && S.teacherEnv) return S.teacherEnv;
    return null;
  }

  function buildCond() {
    return Maps.buildCondition({
      mapId: S.mapId,
      level: S.level,
      projectileId: S.projectileId,
      angle: S.angle,
      power: S.power,
      env: currentEnv(),
      windBase: S.roll ? S.roll.windBase : null,
      target: S.roll ? S.roll.target : null
    });
  }

  // ─── 화면 전환 ─────────────────────────────────────────

  function showScreen(name) {
    ['menu', 'setup', 'game'].forEach(function (n) {
      $('screen-' + n).classList.toggle('active', n === name);
    });
  }

  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }

  // ─── 렌더 ─────────────────────────────────────────────

  function draw(extra) {
    var map = Maps.getMap(S.mapId);
    var cond = buildCond();
    var s = {
      map: map,
      target: cond.target,
      angle: S.angle,
      power: S.power,
      projectile: Maps.getProjectile(S.projectileId),
      wind: { x: cond.wind.x, y: cond.wind.y },
      windLabel: Maps.windLabel(cond.wind),
      pastPaths: S.pastPaths,
      currentPath: null,
      projectileIndex: 0,
      projectilePos: null,
      aimGuide: Physics.aimGuide(cond, 78),
      drag: S.drag,
      showFullPredict: S.showPredict && S.mode === 'practice',
      predictPath: null,
      burst: null,
      targetFlash: false
    };
    if (s.showFullPredict) s.predictPath = Physics.predictPath(cond);
    if (extra) for (var k in extra) s[k] = extra[k];
    scene.render(s);
  }

  // ─── HUD ──────────────────────────────────────────────

  function updateHud() {
    var map = Maps.getMap(S.mapId);
    $('hud-map').textContent = 'Map ' + map.id + ' · ' + map.name;
    $('hud-score').textContent = stageScoreSoFar();
    $('hud-shots').textContent = S.mode === 'practice' ? '∞' : S.shotsLeft;

    var cond = buildCond();
    var w = Maps.windLabel(cond.wind);
    var parts = [];
    // 수정사항 4: 바람은 방향 화살표 + 세기 숫자로 (풍속 1~5).
    parts.push(w.level ? '바람 ' + w.arrow + ' 풍속 ' + w.level + '(' + w.strength + ')' : '바람 없음');
    parts.push('마찰 ' + Maps.frictionLabel(map, S.level));
    parts.push('공기저항 ' + Maps.airLabel(cond.airResistance));
    $('hud-env').textContent = parts.join('  ·  ');
  }

  function stageScoreSoFar() {
    var sum = 0;
    for (var i = 0; i < S.mapScores.length; i++) sum += S.mapScores[i];
    return sum;
  }

  // ─── 컨트롤 ────────────────────────────────────────────

  function buildProjButtons() {
    var box = $('proj-buttons');
    box.innerHTML = '';
    Maps.PROJECTILES.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'proj-btn' + (p.id === S.projectileId ? ' selected' : '');
      b.textContent = p.short;
      b.setAttribute('aria-label', p.name);
      b.setAttribute('aria-pressed', p.id === S.projectileId);
      b.onclick = function () {
        S.projectileId = p.id;
        Sound.play('button');
        buildProjButtons();
        $('proj-desc').textContent = p.name + ' — ' + p.desc;
        updateHud();
        if (!S.animating) draw();
      };
      box.appendChild(b);
    });
  }

  function syncSliders() {
    $('angle').value = S.angle;
    $('power').value = S.power;
    $('angle-val').textContent = S.angle;
    $('power-val').textContent = S.power;
  }

  // ─── 발사 ─────────────────────────────────────────────

  function fire() {
    if (S.animating) return;
    if (S.mode !== 'practice' && S.shotsLeft <= 0) return;

    Sound.unlock();
    Sound.play('fire');

    var cond = buildCond();
    var result = Physics.simulate(cond);
    S.attempt++;
    if (S.mode !== 'practice') S.shotsLeft--;
    S.totalShotsUsed++;

    var thisShot = { angle: S.angle, power: S.power, projectileId: S.projectileId };

    animateShot(result, function () {
      resolveShot(cond, result, thisShot);
    });
  }

  function animateShot(result, done) {
    S.animating = true;
    var path = result.path;
    var i = 0;
    var stepPerFrame = Math.max(1, Math.round(path.length / 90)); // ~1.5초

    function frame() {
      i += stepPerFrame;
      if (i >= path.length - 1) {
        i = path.length - 1;
        draw({
          currentPath: path, projectileIndex: i,
          projectilePos: path[i], aimGuide: null
        });
        playEndEffect(result, done);
        return;
      }
      draw({
        currentPath: path, projectileIndex: i,
        projectilePos: path[i], aimGuide: null
      });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function playEndEffect(result, done) {
    var pos = result.hit ? result.impact : (result.stop || result.landing || result.impact);
    if (result.hit) Sound.play('hit');
    else if (result.outcome === 'obstacle') Sound.play('obstacle');
    else Sound.play('miss');

    var color = result.hit ? '#ffd23f' : '#c0642a';
    var t = 0;
    function burstFrame() {
      t += 0.08;
      draw({
        currentPath: result.path,
        projectileIndex: result.path.length - 1,
        projectilePos: t < 0.5 && !result.hit ? pos : null,
        aimGuide: null,
        burst: { pos: pos, t: Math.min(1, t), color: color },
        targetFlash: result.hit
      });
      if (t < 1) requestAnimationFrame(burstFrame);
      else {
        S.animating = false;
        done();
      }
    }
    requestAnimationFrame(burstFrame);
  }

  // ─── 발사 결과 처리 ─────────────────────────────────────

  function resolveShot(cond, result, thisShot) {
    // 지난 궤적으로 누적 (PDF p.5)
    S.pastPaths.push(result.path);

    var diag = Diagnose.diagnose(cond, result);

    // 분석 보너스: 직전 실패 대비 조건을 하나만 바꿔 성공 (개발 계획서 5절)
    var analysis = false;
    if (result.hit && S.lastShot) {
      analysis = Scoring.analysisBonus(S.lastShot, thisShot) > 0;
    }

    logShot(cond, result, thisShot, diag);

    if (result.hit) {
      handleHit(result, diag, analysis);
    } else {
      handleMiss(result, diag);
    }

    S.lastShot = thisShot;
    updateHud();
  }

  function handleHit(result, diag, analysis) {
    S.clearedThisMap = true;
    S.analysisEarned = analysis;
    Sound.play('score');
    S.bestAccuracy = Math.max(S.bestAccuracy, Scoring.accuracyPercent(result.accuracy));

    showBubble(Feedback.message(diag.code), 'ok');

    if (S.mode === 'practice') {
      // 연습은 점수·진행이 없다. 축하만 하고 계속 쏠 수 있게 둔다.
      setTimeout(function () { hideBubble(); draw(); }, 1400);
      return;
    }
    // 점수 계산
    var shotsLeftForScore = S.shotsLeft;
    var score = Scoring.mapScore({
      shotsLeft: shotsLeftForScore,
      accuracy: result.accuracy,
      level: S.level,
      analysis: analysis
    });
    S.mapScores[S.stageIndex] = score;
    Sound.play('clear');
    setTimeout(function () { showMapResult(score, result, analysis); }, 900);
  }

  function handleMiss(result, diag) {
    S.failStreak++;
    S.lastFailCode = diag.code;

    var msg = Feedback.message(diag.code);
    // 3회 이상 연속 실패면 힌트를 덧붙인다 (PRD 12.3, PDF p.11).
    // 단, 힌트가 이미 메시지에 들어 있으면 같은 말을 두 번 하지 않는다
    // (예: outOfBounds는 메시지·힌트가 모두 "힘을 줄여 보세요").
    if (S.failStreak >= 3) {
      var hint = Feedback.hint(diag.code);
      if (msg.indexOf(hint) === -1) msg += ' 💡 ' + hint;
    }
    showBubble(msg, 'warn');

    if (S.mode !== 'practice' && S.shotsLeft <= 0) {
      // 발사 횟수 소진 → 맵 실패
      setTimeout(function () { showMapResult(0, result, false); }, 900);
    } else {
      setTimeout(function () { hideBubble(); draw(); }, 1800);
    }
  }

  // ─── 발사 로그 (PRD 16.2) ───────────────────────────────

  function logShot(cond, result, thisShot, diag) {
    var w = Maps.windLabel(cond.wind);
    Ranking.appendLog({
      session: S.sessionId,
      nickname: '',
      mode: S.mode,
      map: S.mapId,
      attempt: S.attempt,
      angle: thisShot.angle,
      power: thisShot.power,
      projectile: thisShot.projectileId,
      wind: w.strength === '없음' ? 'none' : (w.arrow + w.strength),
      friction: Maps.frictionLabel(Maps.getMap(S.mapId), S.level),
      airResistance: Maps.airLabel(cond.airResistance),
      hit: result.hit,
      accuracy: Scoring.accuracyPercent(result.accuracy),
      feedback: Feedback.message(diag.code),
      date: Ranking.todayString()
    });
  }

  // ─── 피드백 말풍선 ─────────────────────────────────────

  function showBubble(text, kind) {
    var b = $('feedback-bubble');
    b.textContent = text;
    b.className = 'feedback-bubble' + (kind ? ' ' + kind : '');
    b.hidden = false;
  }
  function hideBubble() { $('feedback-bubble').hidden = true; }

  // ─── 맵 결과 (§13.3) ────────────────────────────────────

  function showMapResult(score, result, analysis) {
    hideBubble();
    var map = Maps.getMap(S.mapId);
    var cleared = result.hit;

    $('result-title').textContent = cleared ? '🎯 맵 클리어!' : '아쉽게 실패…';
    $('result-score').textContent = cleared ? score + '점' : '0점';

    var rows = $('result-rows');
    rows.innerHTML = '';
    if (cleared) {
      var bd = Scoring.breakdown({
        shotsLeft: S.shotsLeft, accuracy: result.accuracy,
        level: S.level, analysis: analysis
      });
      bd.rows.forEach(function (r) {
        rows.appendChild(rowLi(r.label, r.value + '점'));
      });
      rows.appendChild(rowLi('난이도 배율', '× ' + bd.multiplier));
      var totalLi = rowLi('맵 점수', bd.total + '점');
      totalLi.className = 'total';
      rows.appendChild(totalLi);
    } else {
      rows.appendChild(rowLi('사용한 발사', S.attempt + '회'));
      rows.appendChild(rowLi('결과', Feedback.message(Diagnose.diagnose(buildCond(), result).code)));
    }

    // 적용된 과학 개념 (§13.3 · §12.2)
    $('result-concept').textContent = map.lesson;

    // 다음 행동 버튼
    var actions = $('result-actions');
    actions.innerHTML = '';
    if (cleared && S.mode === 'stage' && S.stageIndex < S.stageMaps.length - 1) {
      addBtn(actions, '다음 맵 →', 'btn-go', nextMap);
    } else if (cleared && S.mode === 'stage') {
      addBtn(actions, '스테이지 완료 →', 'btn-go', finishStage);
    } else if (S.mode === 'stage') {
      // 실패: 남은 맵으로 넘어가되 이 맵은 0점
      if (S.stageIndex < S.stageMaps.length - 1) addBtn(actions, '다음 맵 →', 'btn-go', nextMap);
      else addBtn(actions, '스테이지 완료 →', 'btn-go', finishStage);
      addBtn(actions, '이 맵 다시', 'btn-sub', retryMap);
    } else {
      // challenge / practice 단일 맵
      addBtn(actions, cleared ? '완료' : '다시', 'btn-go', function () {
        closeModal('modal-result');
        if (S.mode === 'challenge') finishStage();
        else retryMap();
      });
    }
    openModal('modal-result');
  }

  function rowLi(label, value) {
    var li = document.createElement('li');
    var a = document.createElement('span'); a.textContent = label;
    var b = document.createElement('span'); b.textContent = value;
    li.appendChild(a); li.appendChild(b);
    return li;
  }

  function addBtn(parent, text, cls, fn) {
    var b = document.createElement('button');
    b.className = 'btn ' + cls;
    b.textContent = text;
    b.onclick = function () { Sound.play('button'); fn(); };
    parent.appendChild(b);
  }

  // ─── 맵 진행 ───────────────────────────────────────────

  function loadMap() {
    var map = Maps.getMap(S.mapId);
    S.shotsLeft = Maps.shotsFor(map, S.level);
    S.attempt = 0;
    S.lastShot = null;
    S.failStreak = 0;
    S.clearedThisMap = false;
    S.pastPaths = [];
    S.angle = 45;
    S.power = 50;
    S.drag = null;

    // 수정사항 4: 리스폰마다 목표물 거리·바람을 새로 굴린다. respawnCount로
    // seed를 바꿔, 같은 맵을 다시 와도 조건이 달라진다. 교사 시연은 변인을
    // 직접 통제하므로 랜덤화하지 않는다(목표물 위치만 맵 기본값 사용).
    S.respawnCount++;
    if (S.mode === 'teacher') {
      S.roll = null;
    } else {
      var seed = (S.mapId * 92821 + S.level * 3307 + S.respawnCount * 65537 + S.seed) >>> 0;
      S.roll = Maps.rollConditions(S.mapId, Maps.makeRng(seed));
    }

    if (S.mode === 'challenge') {
      S.challengeEnv = Maps.challengeEnv(S.mapId, Maps.makeRng(S.seed + S.mapId + S.respawnCount * 131));
    }

    syncSliders();
    buildProjButtons();
    updateHud();
    hideBubble();
    draw();
  }

  function nextMap() {
    closeModal('modal-result');
    S.stageIndex++;
    S.mapId = S.stageMaps[S.stageIndex];
    loadMap();
  }

  function retryMap() {
    closeModal('modal-result');
    // 재도전은 이 맵 점수를 초기화
    if (S.mode === 'stage') S.mapScores[S.stageIndex] = 0;
    loadMap();
  }

  function finishStage() {
    closeModal('modal-result');
    showFinal();
  }

  // ─── 최종 결과 · 랭킹 등록 ──────────────────────────────

  function showFinal() {
    var cleared = 0;
    for (var i = 0; i < S.mapScores.length; i++) if (S.mapScores[i] > 0) cleared++;
    var clearedAll = S.mode === 'stage' && cleared === S.stageMaps.length;
    var total = Scoring.total(S.mapScores, clearedAll);
    S.finalScore = total;
    S.finalCleared = cleared;

    $('final-title').textContent = clearedAll ? '🏆 전 맵 클리어!' : '스테이지 완료';
    $('final-score').textContent = total + '점';
    var summary = cleared + '개 맵 클리어 · 발사 ' + S.totalShotsUsed + '회 · 최고 정확도 ' + S.bestAccuracy + '%';
    if (clearedAll) summary += ' · 연속 클리어 보너스 +' + Scoring.STREAK_BONUS;
    $('final-summary').textContent = summary;

    Sound.play('rank');
    $('nick-input').value = '';
    openModal('modal-final');
  }

  function cloudOn() {
    return window.Cloud && window.Cloud.enabled;
  }

  function register() {
    var record = {
      nickname: $('nick-input').value,
      mode: S.mode,
      difficulty: S.level,
      totalScore: S.finalScore,
      clearedMaps: S.finalCleared,
      totalShots: S.totalShotsUsed,
      bestAccuracy: S.bestAccuracy,
      seed: S.mode === 'challenge' ? S.seed : null
    };
    Ranking.submit(record); // 로컬에도 즉시 저장 (오프라인 대비)
    Sound.play('rank');
    var box = $('rank-register');
    function done(text) { box.innerHTML = '<p style="text-align:center;font-weight:700;color:var(--ok)">' + text + '</p>'; }

    if (cloudOn()) {
      done('전체 랭킹에 등록하는 중…');
      window.Cloud.submit(record)
        .then(function () { done('전체 명예의 전당에 등록되었습니다! 🎉'); })
        .catch(function () { done('이 기기에 저장했습니다. (공유 랭킹 연결에 실패했어요)'); });
    } else {
      done('기록이 저장되었습니다! 🎉');
    }
  }

  // ─── 랭킹 화면 ─────────────────────────────────────────

  var rankTab = 'stage';

  function setRankStatus(text) {
    var el = $('rank-status');
    if (el) el.textContent = text;
  }

  function fillRankRows(rows) {
    var body = $('rank-body');
    body.innerHTML = '';
    $('rank-empty').hidden = rows.length > 0;
    var medals = ['🥇', '🥈', '🥉'];
    rows.forEach(function (r, i) {
      var tr = document.createElement('tr');
      var rank = i < 3 ? '<span class="medal">' + medals[i] + '</span>' : (i + 1);
      var diffName = Maps.getDifficulty(r.difficulty).name;
      tr.innerHTML =
        '<td>' + rank + '</td>' +
        '<td></td>' +
        '<td>' + (r.totalScore || 0).toLocaleString() + '</td>' +
        '<td>Lv.' + r.difficulty + ' ' + diffName + '</td>' +
        '<td>' + r.clearedMaps + '</td>' +
        '<td>' + (r.date || '') + '</td>';
      tr.children[1].textContent = r.nickname; // XSS 방지: textContent로
      body.appendChild(tr);
    });
  }

  function renderRanking() {
    if (cloudOn()) {
      setRankStatus('🌐 전체 공유 랭킹 — 접속한 모두가 함께 봅니다');
      $('rank-body').innerHTML = '';
      $('rank-empty').hidden = true;
      window.Cloud.list(rankTab, 50)
        .then(function (rows) {
          if (rows.length === 0) $('rank-empty').hidden = false;
          fillRankRows(rows);
        })
        .catch(function () {
          setRankStatus('공유 랭킹을 불러오지 못해 이 기기 기록을 보여줍니다.');
          fillRankRows(Ranking.list(rankTab));
        });
    } else {
      setRankStatus('📱 이 기기에만 저장된 기록입니다.');
      fillRankRows(Ranking.list(rankTab));
    }
  }

  // ─── 모드 시작 ─────────────────────────────────────────

  function startMode(mode) {
    S.mode = mode;
    S.mapScores = [];
    S.totalShotsUsed = 0;
    S.bestAccuracy = 0;
    S.stageIndex = 0;
    S.teacherEnv = null;
    S.showPredict = false;
    S.sessionId = 't' + Math.floor(performance.now());

    var titleMap = { stage: '스테이지 모드', practice: '연습 모드', challenge: '챌린지 모드', teacher: '교사용 시연' };
    $('setup-title').textContent = titleMap[mode];

    // 연습·시연은 맵을 고를 수 있고, 스테이지·챌린지는 1번 맵부터 순차
    $('setup-map-group').hidden = (mode === 'stage' || mode === 'challenge');
    buildSetupChips();
    showScreen('setup');
  }

  function buildSetupChips() {
    var mapBox = $('setup-maps');
    mapBox.innerHTML = '';
    Maps.MAPS.forEach(function (m) {
      var c = document.createElement('button');
      c.className = 'chip' + (m.id === S.mapId ? ' selected' : '');
      c.innerHTML = 'Map ' + m.id + ' ' + m.name + '<small>' + m.subtitle + '</small>';
      c.onclick = function () {
        S.mapId = m.id;
        buildSetupChips();
        Sound.play('button');
      };
      mapBox.appendChild(c);
    });

    var diffBox = $('setup-diffs');
    diffBox.innerHTML = '';
    Maps.DIFFICULTIES.forEach(function (d) {
      var c = document.createElement('button');
      c.className = 'chip' + (d.level === S.level ? ' selected' : '');
      c.innerHTML = 'Lv.' + d.level + ' ' + d.name;
      c.onclick = function () {
        S.level = d.level;
        buildSetupChips();
        $('setup-diff-desc').textContent = d.desc;
        Sound.play('button');
      };
      diffBox.appendChild(c);
    });
    $('setup-diff-desc').textContent = Maps.getDifficulty(S.level).desc;
  }

  function startGame() {
    if (S.mode === 'stage' || S.mode === 'challenge') {
      S.stageMaps = [1, 2, 3, 4, 5];
      S.stageIndex = 0;
      S.mapId = 1;
    } else {
      S.stageMaps = [S.mapId];
      S.stageIndex = 0;
    }
    if (S.mode === 'challenge') S.seed = (Date.now() % 100000) | 0;

    $('teacher-panel').hidden = (S.mode !== 'teacher');
    $('btn-predict').hidden = (S.mode !== 'practice');
    $('btn-retry-map').hidden = (S.mode === 'stage');

    showScreen('game');
    scene.resize();
    loadMap();
  }

  // ─── 교사용 시연 조건 (PRD 5.4) ──────────────────────────

  function applyTeacherEnv() {
    var wsel = $('t-wind').value;
    var windMap = {
      '0': { x: 0, y: 0 }, left: { x: -1.6, y: 0 }, right: { x: 1.6, y: 0 },
      up: { x: 0, y: -1.6 }, down: { x: 0, y: 1.6 }
    };
    S.teacherEnv = {
      wind: windMap[wsel],
      frictionScale: parseFloat($('t-fric').value),
      airResistance: parseFloat($('t-air').value),
      gravity: 9.8
    };
    updateHud();
    if (!S.animating) draw();
  }

  // ─── 조준 컨트롤 (재설계: 각도 다이얼 + 뒤쪽 힘 손잡이) ─────
  //
  // 이전의 "대포 근처 = 각도 / 빈 곳 = 힘"은 어디를 잡아야 힘인지 헷갈렸다.
  // 이제 눈에 보이는 손잡이 두 개로 잡는다:
  //   · 대포 앞 곡선 다이얼의 손잡이(↕)를 끌면 → 각도. 놓으면 각도만 고정.
  //   · 대포 뒤 손잡이(힘)를 당기면 → 힘. 당긴 길이가 힘이고, 놓으면 발사.
  // 두 손잡이가 서로 반대편에 떨어져 있어 무엇을 잡는지 분명하다.

  // 손잡이를 잡았다고 볼 반경. 화면이 좁으면(휴대폰) 손잡이가 커지므로 잡는
  // 범위도 같이 키운다 — 안 그러면 손가락으로 도저히 잡을 수 없다.
  var GRAB_R_BASE = 52;
  var MIN_FIRE_POWER = 6;

  function grabR() {
    return GRAB_R_BASE * scene.ui();
  }

  function worldPoint(evt) {
    var canvas = $('stage');
    var rect = canvas.getBoundingClientRect();
    var cx = (evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left;
    var cy = (evt.touches ? evt.touches[0].clientY : evt.clientY) - rect.top;
    return {
      x: (cx / rect.width) * Renderer.WORLD.w,
      y: (cy / rect.height) * Renderer.WORLD.h
    };
  }

  function d2(a, b) {
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
  }

  /** 다이얼 손잡이를 끄는 방향으로 각도를 맞춘다 (위로 끌면 높은 각도). */
  function applyAim(pt) {
    var launch = Maps.getMap(S.mapId).launch;
    var dx = pt.x - launch.x;
    var dy = pt.y - launch.y;
    if (Math.sqrt(dx * dx + dy * dy) < 16) return;
    var angleDeg = Math.round((Math.atan2(-dy, Math.max(dx, 1)) * 180) / Math.PI);
    S.angle = Math.max(10, Math.min(80, angleDeg));
    S.drag = { mode: 'aim' };
  }

  /**
   * 손잡이를 당긴 거리로 힘을 정한다. 각도는 그대로.
   * 방향은 따지지 않고 거리만 본다 — 대포가 화면 왼쪽 아래에 있어 "뒤로"만
   * 허용하면 휴대폰에서 당길 공간이 없다. 뒤쪽 위(하늘)로 당기면 넉넉하다.
   */
  function applyPower(pt) {
    var launch = Maps.getMap(S.mapId).launch;
    // 손잡이 기본 위치를 힘 0으로 잡는다. 위치 계산은 렌더러와 공유해야
    // 그림과 값이 어긋나지 않는다.
    var rest = d2(Renderer.knobPowerRest(launch, S.angle, scene.ui()), launch);
    var pull = d2(pt, launch) - rest;
    S.power = Math.max(1, Math.min(100, Math.round((pull / Renderer.MAX_PULL) * 100)));
    S.drag = { mode: 'power', point: { x: pt.x, y: pt.y } };
  }

  function bindCannonDrag() {
    var canvas = $('stage');
    var mode = null; // 'aim' | 'power'

    function start(evt) {
      if (S.animating) return;
      if (S.mode !== 'practice' && S.shotsLeft <= 0) return;
      Sound.unlock();
      evt.preventDefault();
      var pt = worldPoint(evt);
      var launch = Maps.getMap(S.mapId).launch;
      var ui = scene.ui();
      var G = grabR();
      var aimKnob = Renderer.knobAngle(launch, S.angle, ui);
      var powerKnob = Renderer.knobPowerRest(launch, S.angle, ui);
      var dAim = d2(pt, aimKnob);
      var dPow = d2(pt, powerKnob);
      // 다이얼 호 위를 눌러도 각도를 잡을 수 있게 (더 관대하게)
      var onArc = Math.abs(d2(pt, launch) - Renderer.ARC_R) <= 30 * ui && pt.x > launch.x;

      if (dPow <= G && dPow < dAim) {
        mode = 'power';
        applyPower(pt);
      } else if (dAim <= G || onArc) {
        mode = 'aim';
        applyAim(pt);
      } else {
        mode = null; // 손잡이도 다이얼도 아니면 아무 일 없음
        return;
      }
      syncSliders();
      updateHud();
      draw();
    }
    function move(evt) {
      if (!mode) return;
      evt.preventDefault();
      var pt = worldPoint(evt);
      if (mode === 'aim') applyAim(pt);
      else applyPower(pt);
      syncSliders();
      draw();
    }
    function end(evt) {
      if (!mode) return;
      evt.preventDefault();
      var wasPower = mode === 'power';
      var power = S.power;
      mode = null;
      S.drag = null;
      if (wasPower && power >= MIN_FIRE_POWER) {
        fire();
      } else {
        draw(); // 각도만 맞췄거나 힘이 너무 약하면 발사하지 않는다
      }
    }

    canvas.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
  }

  // ─── 이벤트 배선 ───────────────────────────────────────

  function bind() {
    // 메뉴
    document.querySelectorAll('.btn-mode').forEach(function (b) {
      b.onclick = function () { Sound.unlock(); Sound.play('button'); startMode(b.dataset.mode); };
    });
    $('btn-ranking').onclick = function () {
      Sound.play('button');
      // 공유 랭킹은 개인이 지울 수 없다(규칙상 삭제 금지). 로컬일 때만 지우기 노출.
      $('btn-rank-clear').hidden = cloudOn();
      renderRanking();
      openModal('modal-ranking');
    };
    $('btn-howto').onclick = function () { Sound.play('button'); openModal('modal-howto'); };
    $('btn-howto-close').onclick = function () { closeModal('modal-howto'); };

    $('chk-sound').onchange = function () { Sound.setEnabled(this.checked); };

    // 설정
    document.querySelectorAll('[data-back]').forEach(function (b) {
      b.onclick = function () { Sound.play('button'); showScreen(b.dataset.back); };
    });
    $('btn-start-game').onclick = function () { Sound.play('button'); startGame(); };

    // 슬라이더
    $('angle').oninput = function () {
      S.angle = +this.value; $('angle-val').textContent = S.angle;
      updateHud(); if (!S.animating) draw();
    };
    $('power').oninput = function () {
      S.power = +this.value; $('power-val').textContent = S.power;
      updateHud(); if (!S.animating) draw();
    };

    // 대포 드래그 조준 (수정사항 3) — 포트리스식 슬링샷.
    // 대포를 뒤로 당기면 당긴 방향의 반대로 발사된다: 당긴 방향이 각도를,
    // 당긴 길이가 힘을 정한다. 놓으면 발사. 각도·힘은 대포 옆에 숫자로 뜬다.
    bindCannonDrag();

    // 발사
    $('btn-fire').onclick = fire;
    $('btn-quit').onclick = function () { Sound.play('button'); quitToMenu(); };
    $('btn-retry-map').onclick = function () { Sound.play('button'); retryMap(); };
    $('btn-predict').onclick = function () {
      S.showPredict = !S.showPredict;
      this.textContent = S.showPredict ? '예측선 끄기' : '예측선';
      draw();
    };

    // 교사용
    ['t-wind', 't-fric', 't-air'].forEach(function (id) {
      $(id).onchange = applyTeacherEnv;
    });

    // 결과·최종
    $('btn-register').onclick = register;
    $('btn-final-menu').onclick = function () { closeModal('modal-final'); quitToMenu(); };
    $('btn-export-json').onclick = function () {
      Ranking.download('science-fortress-log.json', Ranking.toJSON(), 'application/json');
    };
    $('btn-export-csv').onclick = function () {
      Ranking.download('science-fortress-log.csv', Ranking.toCSV(), 'text/csv');
    };

    // 랭킹
    document.querySelectorAll('.rank-tab').forEach(function (t) {
      t.onclick = function () {
        rankTab = t.dataset.rk;
        document.querySelectorAll('.rank-tab').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        renderRanking();
      };
    });
    $('btn-rank-close').onclick = function () { closeModal('modal-ranking'); };
    $('btn-rank-clear').onclick = function () {
      if (confirm('모든 랭킹 기록을 지울까요?')) { Ranking.clear(); renderRanking(); }
    };

    // 키보드 (NFR-001)
    document.addEventListener('keydown', function (e) {
      if (!$('screen-game').classList.contains('active')) return;
      if (S.animating) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fire(); }
      else if (e.key === 'ArrowUp') { setAngle(S.angle + 1); }
      else if (e.key === 'ArrowDown') { setAngle(S.angle - 1); }
      else if (e.key === 'ArrowRight') { setPower(S.power + 1); }
      else if (e.key === 'ArrowLeft') { setPower(S.power - 1); }
    });

    window.addEventListener('resize', function () { scene.resize(); if (!S.animating) draw(); });
  }

  function setAngle(v) {
    S.angle = Math.max(10, Math.min(80, v));
    syncSliders(); updateHud(); draw();
  }
  function setPower(v) {
    S.power = Math.max(1, Math.min(100, v));
    syncSliders(); updateHud(); draw();
  }

  function quitToMenu() {
    closeModal('modal-result');
    closeModal('modal-final');
    showScreen('menu');
  }

  // ─── 시작 ─────────────────────────────────────────────
  bind();
  showScreen('menu');

  // 디버그·테스트에서 상태를 들여다볼 수 있게 노출 (앱 동작에는 영향 없음)
  window.__SF = { S: S, buildCond: buildCond, fire: fire, startMode: startMode, startGame: startGame };
})();
