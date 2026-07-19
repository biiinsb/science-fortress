/**
 * cloud.js — 전체 공유 랭킹 (Firebase Firestore)
 *
 * firebase-config.js에 설정이 채워져 있으면 Firebase에 연결해 window.Cloud를
 * 노출한다. 없거나 실패하면 window.Cloud.enabled = false로 두고, 앱은
 * localStorage(이 기기) 랭킹으로 자연히 되돌아간다. 게임 자체는 Firebase와
 * 무관하게 돌아간다 — 공유 랭킹은 인터넷이 필요한 온라인 기능일 뿐이다.
 *
 * 이 파일만 <script type="module">이다. 나머지는 오프라인망을 위해 CDN을 부르지
 * 않지만, 공유 랭킹은 본질적으로 온라인이므로 여기서만 Firebase CDN을 쓴다.
 */

(function () {
  'use strict';
  var cfg = window.SF_FIREBASE;

  function configured(c) {
    return c && typeof c.apiKey === 'string' && c.apiKey.indexOf('여기에') === -1 &&
      typeof c.projectId === 'string' && c.projectId.indexOf('여기에') === -1;
  }

  if (!configured(cfg)) {
    // 설정 전 — 로컬 랭킹으로만 동작한다.
    window.Cloud = { enabled: false, reason: 'unconfigured' };
    return;
  }

  var VER = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var COL = 'rankings';

  // 동적 import로 Firebase 모듈을 불러온다. 실패해도(오프라인 등) 앱은 계속된다.
  Promise.all([
    import(VER + 'firebase-app.js'),
    import(VER + 'firebase-firestore.js')
  ]).then(function (mods) {
    var appMod = mods[0];
    var fs = mods[1];
    var app = appMod.initializeApp(cfg);
    var db = fs.getFirestore(app);

    window.Cloud = {
      enabled: true,

      submit: function (r) {
        return fs.addDoc(fs.collection(db, COL), {
          nickname: String(r.nickname || '').slice(0, 12),
          mode: r.mode || 'stage',
          difficulty: r.difficulty || 1,
          totalScore: Math.round(r.totalScore || 0),
          clearedMaps: r.clearedMaps || 0,
          totalShots: r.totalShots || 0,
          bestAccuracy: r.bestAccuracy || 0,
          date: r.date || '',
          ts: Date.now()
        });
      },

      // 상위 점수를 받아 모드별로 걸러 돌려준다. 모드별 서버 인덱스를 따로 만들지
      // 않으려고, 전체 상위 300건을 받아 클라이언트에서 거른다 (학급 규모엔 충분).
      list: function (mode, max) {
        var q = fs.query(
          fs.collection(db, COL),
          fs.orderBy('totalScore', 'desc'),
          fs.limit(300)
        );
        return fs.getDocs(q).then(function (snap) {
          var rows = [];
          snap.forEach(function (d) { rows.push(d.data()); });
          if (mode && mode !== 'all') {
            rows = rows.filter(function (x) { return x.mode === mode; });
          }
          return rows.slice(0, max || 50);
        });
      }
    };
    window.dispatchEvent(new Event('sf-cloud-ready'));
  }).catch(function (e) {
    window.Cloud = { enabled: false, reason: 'error', error: String(e) };
    window.dispatchEvent(new Event('sf-cloud-ready'));
  });
})();
