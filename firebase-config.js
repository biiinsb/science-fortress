/**
 * firebase-config.js — 전체 공유 랭킹(명예의 전당)을 켜는 설정
 *
 * 이 파일에 Firebase 웹 설정을 채우면, 접속한 모든 사람이 같은 랭킹을 보게
 * 됩니다. 비워 두면 게임은 그대로 돌아가되 랭킹은 이 기기에만 저장됩니다.
 *
 * ── 켜는 방법 (약 10분, 무료) ─────────────────────────────
 *  1. https://console.firebase.google.com 에서 프로젝트를 만든다.
 *  2. 왼쪽 "빌드 → Firestore Database" → "데이터베이스 만들기"
 *     → 위치 아무거나 → "프로덕션 모드"로 시작.
 *  3. Firestore의 "규칙(Rules)" 탭에 아래 규칙을 붙여넣고 게시:
 *
 *       rules_version = '2';
 *       service cloud.firestore {
 *         match /databases/{database}/documents {
 *           match /rankings/{doc} {
 *             allow read: if true;
 *             allow create: if request.resource.data.nickname is string
 *               && request.resource.data.nickname.size() <= 12
 *               && request.resource.data.totalScore is number
 *               && request.resource.data.totalScore >= 0
 *               && request.resource.data.totalScore <= 1000000;
 *             allow update, delete: if false;
 *           }
 *         }
 *       }
 *
 *     (누구나 읽고 점수를 추가할 수 있지만, 남의 기록을 고치거나 지울 수는 없다.)
 *  4. 프로젝트 설정(톱니바퀴) → "내 앱"에서 웹 앱(</>)을 추가하면 아래 같은
 *     설정 객체를 준다. 그 값을 이 파일 window.SF_FIREBASE에 그대로 붙여넣는다.
 *  5. 커밋 → 푸시하면 끝. (이 apiKey 등은 비밀이 아니라 공개해도 안전하다.
 *     보안은 위 Firestore 규칙이 담당한다.)
 *
 * 설정을 채우기 전까지는 아래 값이 그대로라, 랭킹은 로컬(이 기기)로만 동작한다.
 */
window.SF_FIREBASE = {
  apiKey: '여기에_apiKey',
  authDomain: '여기에_authDomain',
  projectId: '여기에_projectId',
  storageBucket: '여기에_storageBucket',
  messagingSenderId: '여기에_messagingSenderId',
  appId: '여기에_appId'
};
