/**
 * cloud.js — 전체 공유 랭킹 (Firebase Realtime Database, REST)
 *
 * firebase-config.js의 databaseURL이 채워져 있으면 그 데이터베이스에 fetch로
 * 읽고 쓴다. 없으면 window.Cloud.enabled = false로 두고, 앱은 localStorage(이
 * 기기) 랭킹으로 자연히 되돌아간다. 게임 자체는 이와 무관하게 돌아간다.
 *
 * Firestore가 아니라 Realtime Database를 쓰는 이유: Firestore는 최근 결제 계정을
 * 요구하는 경우가 있는데, Realtime Database는 무료(Spark)로 결제 없이 된다.
 * 게다가 REST(주소로 GET/POST)라 SDK도 CDN도 필요 없다 — 오프라인망 정신에도
 * 더 맞는다(공유 랭킹 자체는 온라인이지만, 외부 스크립트를 부르지 않는다).
 */

(function () {
  'use strict';
  var cfg = window.SF_FIREBASE || {};
  var url = cfg.databaseURL;

  function configured(u) {
    return typeof u === 'string' && /^https:\/\/.+/.test(u) && u.indexOf('여기에') === -1;
  }

  if (!configured(url)) {
    window.Cloud = { enabled: false, reason: 'unconfigured' };
    return;
  }

  var base = url.replace(/\/+$/, '') + '/rankings';

  window.Cloud = {
    enabled: true,

    submit: function (r) {
      var body = {
        nickname: String(r.nickname || '').slice(0, 12),
        mode: r.mode || 'stage',
        difficulty: r.difficulty || 1,
        totalScore: Math.round(r.totalScore || 0),
        clearedMaps: r.clearedMaps || 0,
        totalShots: r.totalShots || 0,
        bestAccuracy: r.bestAccuracy || 0,
        date: r.date || '',
        ts: Date.now()
      };
      // POST면 Realtime Database가 고유 키(push id)를 만들어 항목을 추가한다.
      return fetch(base + '.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
    },

    // 전체를 받아 점수 내림차순 정렬 후 모드로 걸러 상위 N개를 준다.
    // 학급 규모에선 전체를 받아 클라이언트에서 정렬해도 충분하다.
    list: function (mode, max) {
      return fetch(base + '.json').then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (obj) {
        var rows = [];
        if (obj) {
          for (var k in obj) if (obj.hasOwnProperty(k)) rows.push(obj[k]);
        }
        rows.sort(function (a, b) { return (b.totalScore || 0) - (a.totalScore || 0); });
        if (mode && mode !== 'all') {
          rows = rows.filter(function (x) { return x.mode === mode; });
        }
        return rows.slice(0, max || 50);
      });
    }
  };
})();
