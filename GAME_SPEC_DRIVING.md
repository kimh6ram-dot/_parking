# GAME_SPEC_DRIVING.md

> 이 문서는 `MINIGAME_SYSTEM.md`와 함께 사용하는 **도로주행 게임 전용 명세서**다.
> `GAME_SPEC_PARKING.md`(주차하기)와는 완전히 독립된 게임이며, 같은 사이트(GAME SELECT)
> 안에서 나란히 존재한다. 두 게임은 디자인 언어와 차량 에셋만 공유하고, 코드/상태/
> localStorage는 전혀 공유하지 않는다.

---

# 1. 게임 개요

## 게임명
도로주행

## 한 줄 목표
**안전하게 목적지까지 도착하세요.**

## 핵심 콘셉트
주차하기와 같은 탑뷰 3인칭 차량 조작으로, 화면 아래에서 위쪽 목적지를 향해
전방으로 스크롤되는 세로형 도로주행 미니게임이다. 1인칭도 레이싱게임도 아니다.
차량이 world 좌표를 이동하고 카메라가 차량을 따라가며(플레이어는 항상 화면
하단 35~45% 구역에 고정), 도로·장애물이 상대적으로 아래로 흘러가는 것처럼 보인다.

---

# 2. 전체 디자인 방향

`MINIGAME_SYSTEM.md`와 `GAME_SPEC_PARKING.md`의 공통 디자인을 그대로 따른다.
새로운 디자인 시스템을 만들지 않는다 — `src/styles/main.css`의 디자인 토큰과
`.slot-visual/.slot-title/.slot-body/.slot-actions/.cta/.btn-secondary/.type-grid/
.type-btn/.color-list/.color-btn/.tut-lines/.topbar/.dpad-grid/.dpad-btn/.hint/
.result-*/.challenge-*/.vs-*/.modal*/.toast` 클래스를 전부 그대로 재사용한다.
`src/styles/driving.css`는 그 컴포넌트로 표현 안 되는 것(화면 프레임 `.driving-screen`,
스테이지 목록 `.stage-row`, 결과 기록 칩 `.driving-record`)만 최소로 추가한다.

차량은 새로 그리지 않고 주차게임과 동일한 `PK.VEHICLES`/`PK.COLORS`/`PK.sprites`/
`PK.renderer.drawVehicle`(실제 차량 PNG)를 읽기 전용으로 재사용한다.

---

# 3. 독립 구조

- 네임스페이스: `window.DRIVING` (주차게임의 `window.PK`와 별개)
- 상태 머신: `src/driving/state.js`의 `DRIVING.state`/`DRIVING.STATE` — `.screen`이 아닌
  `.driving-screen` 클래스로 화면을 관리해 주차게임 `state.js`와 절대 충돌하지 않는다.
- 진행 저장: `localStorage['drivingProgressV1']` (주차게임과 키 공유 없음)
- 도전장 해시: `#driving-battle/...` (주차게임의 `#battle/...`와 절대 충돌하지 않음)
- 상위 라우팅: `src/menu/game-select.js`가 `#app`/`#menu-root`/`#driving-root` 세 루트
  중 무엇을 보여줄지만 전담한다. 도로주행은 **lazy-boot**(`DRIVING.boot()`가 `#driving-root`를
  처음 보여줄 때 한 번만 호출됨) — 숨겨진 채로 미리 그리다가 크기 0 버그가 나는 것을
  원천 차단하기 위함(주차게임에서 실제로 겪은 버그, 메모리 기록 참고).

---

# 4. 파일 구성

```
src/driving/
  config.js      물리 상수 · 점수 배점 · 등급/코멘트 · 도로 보간(roadAt) · km/h 변환
  state.js       상태 머신(.driving-screen)
  stages.js      STAGE 1~10 데이터(도로 웨이포인트 · 정적 오브젝트 · 이벤트 스크립트)
  physics.js     bicycle model 차량 물리 + OBB 충돌(SAT) — 새 구현, 주차 physics.js 복사 아님
  obstacles.js   동적 NPC 상태머신(brakeStop/laneChange/weave/dash/crosswalkPedestrian)
  renderer.js    도로/장애물/차량 렌더러(카메라 스크롤) — 차량은 PK.renderer.drawVehicle 호출
  scoring.js     채점 + notes 우선순위 + records(최대 3개)
  progress.js    localStorage 진행상황(해금 · 최고점)
  battle.js      도전장 토큰(#driving-battle/...)
  share.js       결과 공유 이미지(1080×1920)
  input.js       키보드 + 방향 버튼(Pointer Events, 멀티터치) — 주차 input.js와 독립된 사본
  play.js        플레이 세션 루프(rAF · 충돌 · 목적지 판정 · 채점 호출)
  result-ui.js   결과/도전장/대결 화면 렌더링
  main.js        화면 흐름(INTRO→STAGE_SELECT→SELECT_TYPE→SELECT_COLOR→TUTORIAL→PLAY→RESULT)

src/styles/driving.css   전용 스타일(위 3번 참고)
```

---

# 5. 좌표계 / 물리

- `y` = 진행 방향(목적지 쪽 증가), `x` = 좌우 절대 world 좌표.
- `heading` 0 = +y(전진, 화면 위쪽) 방향. 양수는 시계 방향(오른쪽 회전).
- bicycle model: `headingRate = (speed / wheelBase) * tan(steer)` — 속도가 0에 가까우면
  헤딩이 거의 바뀌지 않는다(제자리 회전 없음, §19 요구사항).
- 차종별 조작감(`maxSteer`/`wheelBase`/`accel`/`maxFwd`/`brake` 등)은 `PK.VEHICLES`를
  그대로 읽어 재사용 — 주차게임과 "같은 차는 같은 느낌"을 자동으로 보장한다.
- 내부 속도(unit/s) → 화면 표시 km/h 변환 계수: `DRIVING.KMH_PER_UNIT = 0.85`
  (세단 최고속도 96u/s ≈ 82km/h가 되도록 튜닝).
- 빗길(STAGE 9): `gripMul`/`brakeMul` < 1 적용(조향 반응·제동 둔화).

---

# 6. 도로 / 카메라

- `stage.road = [{y, cx, half}]` 웨이포인트를 smoothstep으로 보간(`DRIVING.roadAt`).
- 카메라: `carScreenYFrac = 0.62`(차량은 항상 화면 62% 지점에 고정), world→screen 변환은
  `DRIVING.renderer.worldToScreen`.
- **목적지 도착 판정(2026-09-22 확정)**: `stage.destination = {y0,y1,cx,half}`의 `y1`을
  체크무늬 결승선으로 그리고, 차량 중심이 `y >= y1`이면서 `|x - cx| <= half`(결승선 폭 안)일
  때 즉시 도착 완료로 처리한다. 감속·정차 요구 없음 — 실제 플레이에서 "결승선을 넘겼는데
  왜 실패냐"는 혼동이 있어 정차 요구를 제거하고 단순 통과 판정으로 바꿨다(이전엔 구역 안에서
  0.5초 정차해야 했음). "마무리" 5점은 결승선 통과 직전(120 유닛 이내) 충돌 여부만 본다.
- 도로는 canvas primitive로 직접 그린다(아스팔트/갓길선/중앙 점선/횡단보도/정지선/표지판/콘).

---

# 7. 장애물 스크립트 (5종, 전부 결정론적 — Math.random 없음)

| kind | 용도 | 트리거 |
|---|---|---|
| `brakeStop` | 택시 급정차 | 플레이어가 `reactDistance` 안으로 접근하면 브레이크등 → 정차 |
| `laneChange` | 끼어들기/합류/오토바이 편입 | 접근 시 `driftTime` 동안 옆 차선으로 부드럽게 이동 |
| `weave` | 배달 오토바이 지그재그 | 자기 자신의 진행 거리에 따라 `path` 웨이포인트를 스스로 따라감 |
| `dash` | 전동킥보드 돌발 횡단 | 접근 시 짧은 전조(0.35s) 후 `dashTime` 동안 도로 횡단 |
| `crosswalkPedestrian` | 횡단보도 보행자 | 처음부터 보이는 상태로 대기, 접근 시 걷기 시작 |

모든 트리거는 "플레이어와의 상대 거리"(정적 임계값) 또는 "자기 진행 거리"로만 결정되어
Math.random을 쓰지 않는다 — 같은 스테이지는 항상 같은 규칙으로 반응하므로 도전장 점수
경쟁이 공정하다.

---

# 8. 점수 (100점)

| 항목 | 배점 |
|---|---|
| 안전 운전 | 30 |
| 차선 유지 | 20 |
| 신호 준수 | 20 |
| 속도 조절 | 15 |
| 돌발 대처 | 10 |
| 마무리 | 5 |

- 해당 스테이지에 신호/정지선이 없으면 신호 준수는 기본 만점.
- 돌발 이벤트가 없는 스테이지(STAGE 1/5)는 돌발 대처 기본 만점.
- 미완주(시간 초과)는 총점 최대 69점.
- 등급 5단계 + 코멘트(GOOD/MID/BAD 각 5개, `(총점+충돌수)%길이`로 결정론적 선택).
- notes 우선순위: 보행자/킥보드 위험 → 충돌(구체 이벤트 우선) → 신호 위반 → 보호구역
  과속 → 스크립트 이벤트 결과(성공 케이스 포함) → 차선 → 과속 → 빗길, 아무것도 없으면
  일반 코멘트.
- records: 최대 3개(신호위반/보호구역과속/콘접촉/급정거/아슬아슬/차선이탈/충돌 중
  스테이지에 실제 존재하는 요소만 후보, 값이 큰 순).

---

# 9. STAGE 1~10 (유저에게는 "STAGE n"만 노출, 내부 구성은 절대 노출 금지)

1. 기본 적응 — 넓은 도로, 완만한 커브, 주차 차량 몇 대, 돌발 없음
2. 좁은 골목길 — 도로 폭 감소 + 불법주차 + 마주오는 차량
3. 택시 급정차 — 전조(브레이크등) 후 정차
4. 배달 오토바이 — 차선 사이 weave
5. 공사 구간 — 콘 + S자 커브 + 작업 차량
6. 어린이보호구역 — 제한 30 + 횡단보도 + 정지선 + 보행자
7. 전동킥보드 — 짧은 전조 후 돌발 횡단
8. 흰색 세단 끼어들기 — 급차선변경 2회
9. 비 오는 퇴근길 — grip/brake 저하 + 택시·오토바이·합류 혼합
10. 종합 — 좁은길→택시→공사→보호구역→킥보드→끼어들기 순차 결합(최장/최고 시간제한)

각 스테이지 정확한 좌표·타이밍은 `src/driving/stages.js` 데이터가 정본이다.

---

# 10. 스테이지 해금 / 진행 저장

- STAGE 1만 처음부터 열려 있음. 목적지 도착(클리어) 시 다음 스테이지 해금 — 점수 컷 없음.
- `localStorage['drivingProgressV1'] = { unlocked, best: { [stageId]: score } }`
- RESULT → "다음 스테이지" 버튼은 차량/색상을 유지한 채 PLAYING으로 직행(차량 재선택 없음).
  "차 바꾸기"를 눌렀을 때만 차종 선택으로 이동.

---

# 11. 검증 방법론

1. **헤드리스 물리 시뮬레이터**(Node `vm`으로 실제 프로덕션 코드 로드, 브라우저 불필요) —
   10 스테이지 × 6 차종 = 60개 조합을 간단한 휴리스틱 오토파일럿으로 완주 검증.
   최종 60/60 도착 성공.
2. **실제 브라우저 종단 검증**(Playwright + 실제 Chrome, 실제 키보드 이벤트) — GAME SELECT
   진입부터 STAGE 1 완주 → RESULT → 다음 스테이지 → localStorage 반영까지 전 구간을
   실제 rAF 루프로 확인.
3. 회귀 테스트: 주차게임 전체 플로우가 이번 작업 전후 동일한지 매번 재확인.
