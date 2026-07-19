/**
 * firebase-config.js — 전체 공유 랭킹(명예의 전당)을 켜는 설정
 *
 * databaseURL 하나만 채우면, 접속한 모든 사람이 같은 랭킹을 보게 됩니다.
 * 비워 두면 게임은 그대로 돌아가되 랭킹은 이 기기에만 저장됩니다.
 *
 * ── 켜는 방법 (무료, 결제 없음) ───────────────────────────
 * Firestore가 아니라 "Realtime Database"를 씁니다. (Firestore는 결제 계정을
 * 요구하는 경우가 있지만, Realtime Database는 무료로 결제 없이 됩니다.)
 *
 *  1. https://console.firebase.google.com → 프로젝트(science fortress) 선택
 *  2. 왼쪽 "데이터베이스 및 스토리지 → Realtime Database" → "데이터베이스 만들기"
 *     → 위치 선택(싱가포르 등) → "잠금 모드로 시작" → 사용 설정
 *  3. 만들어지면 화면 위에 이런 주소가 보인다 (이게 databaseURL):
 *       https://science-fortress-default-rtdb.asia-southeast1.firebasedatabase.app
 *     (지역에 따라 …firebaseio.com 형태일 수도 있다.) 이 주소를 아래에 붙여넣는다.
 *  4. "규칙(Rules)" 탭에 아래를 붙여넣고 "게시":
 *
 *       {
 *         "rules": {
 *           "rankings": {
 *             ".read": true,
 *             "$id": {
 *               ".write": "!data.exists()",
 *               ".validate": "newData.hasChildren(['nickname','totalScore','mode','difficulty']) && newData.child('nickname').isString() && newData.child('nickname').val().length <= 12 && newData.child('totalScore').isNumber() && newData.child('totalScore').val() >= 0 && newData.child('totalScore').val() <= 1000000"
 *             }
 *           }
 *         }
 *       }
 *
 *     (누구나 읽고 새 점수를 추가할 수 있지만, 남의 기록을 고치거나 지울 수는 없다.)
 *  5. 아래 databaseURL을 채우고 커밋 → 푸시하면 끝. (이 주소는 비밀이 아니라
 *     공개해도 안전하다. 보안은 위 규칙이 담당한다.)
 *
 * 채우기 전까지는 랭킹이 로컬(이 기기)로만 동작한다.
 */
window.SF_FIREBASE = {
  databaseURL: 'https://science-fortress-default-rtdb.asia-southeast1.firebasedatabase.app'
};
