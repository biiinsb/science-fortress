# 테스트

Node 없이 헤드리스 Chrome/Edge 하나로 순수 로직을 검증한다. `physics`·`scoring`·
`diagnose`가 DOM을 모르는 순수 함수라 가능하다.

```powershell
py ../tools/run.py physics.test.html   # 물리 코어 — 결정론·진공 포물선·띄운 목표물·탄환 2종 (61)
py ../tools/run.py logic.test.html     # 점수·정확도·반사실 진단·리스폰 랜덤화·금지어 검사 (42)
py ../tools/run.py smoke.test.html     # 실제 앱 부팅·발사·랭킹·내보내기 (16)
```

브라우저에서 각 `*.html`을 직접 열어도 결과가 화면에 뜬다.

| 파일 | 검증 대상 |
| :--- | :--- |
| `physics.test.html` | 같은 입력 100회 → 궤적 비트 단위 동일. 진공 사거리·최고점이 해석해와 1~2px 이내. PRD 2.4의 교육적 단조성(힘↑→거리↑ 등). 탄환 3종의 변인 분리. 지형·장애물·절벽 판정 |
| `logic.test.html` | PRD 10.6 점수 공식·10.4 정확도 구간. 분석 보너스. 반사실 진단이 바람·저항·힘을 각각 옳게 지목. 학생 문구에 교육과정 금지어 없음 |
| `smoke.test.html` | 모든 모듈이 오류 없이 초기화. 스테이지 시작→발사→점수→로그→랭킹 등록→내보내기가 실제 DOM에서 동작. 닉네임 위험 문자 제거. 모드별 랭킹 분리 |
| `harness.js` | 의존성 없는 초소형 테스트 러너 (`describe`/`ok`/`eq`/`near`/`report`) |

`../tools/calibrate.html`은 테스트가 아니라 맵 밸런싱 도구다 — 25조합 클리어 가능성 실측.
