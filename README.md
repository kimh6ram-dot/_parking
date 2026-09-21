# 주차하기 — 후면주차 미니게임

`MINIGAME_SYSTEM.md`(시리즈 공통 규칙) + `GAME_SPEC_PARKING.md`(후면주차 전용 명세) 기준으로 만든 첫 버전.
빌드·서버 없이 `index.html`을 브라우저에서 열면 바로 실행된다.

## 실행

- PC: `index.html` 더블클릭 → 방향키(↑ ↓ ← →)로 조작
- 모바일: 같은 파일을 폰 브라우저에서 열면 하단에 ▲ ◀ ▶ ▼ 터치 버튼(멀티터치 지원)
- 도전장 링크는 `index.html#battle/v1.…` 형태. 서버 없이 기록이 링크 안에 들어 있다.

## 화면 흐름

INTRO → 차 종류 선택(승용차·소형차·트럭·버스·오토바이·자전거) → 차 색상 선택(파랑·빨강·노랑·흰색) → TUTORIAL → PLAY(30초) → RESULT
(도전장으로 진입하면 CHALLENGE → … → RESULT → 대결 결과)

## 구조

```
index.html
src/main.js               화면 흐름·버튼 연결
src/game/config.js        차량 6종 제원(크기·wheelBase·조향·속도), 색상, 주차장 레이아웃(칸 수 포함), 물리 상수, 배점, 등급
src/game/physics.js       bicycle model(speed·heading·steer·wheelBase) + 조향/가속 easing + OBB(SAT) 충돌
src/game/sprites.js       에셋 스프라이트 로드 + 차체 착색
src/game/sprites-data.js  assets/*.png 내장 데이터(자동 생성)
src/game/renderer.js      주차장·차량 그리기(스프라이트 우선, 벡터 실루엣 fallback), 스냅샷, 미리보기
tools/build-sprites.js    assets/*.png → sprites-data.js 빌드(의존성 없음)
tools/bump-version.js     index.html의 CSS/JS 주소에 ?v=<시각>을 갱신(배포 전 실행 — 아래 "배포" 참고)
tools/serve.js            같은 와이파이의 폰에서 테스트하는 정적 서버(0.0.0.0:8080)
src/game/input.js         방향키 + 터치 방향 버튼(Pointer Events, 멀티터치)
src/game/play.js          플레이 루프, 타이머, 자동 주차 완료(정차 0.65s), settling(0.7s)
src/game/scoring.js       실제 최종 위치·각도·여백·충돌·시간·정차 상태로 100점 채점
src/game/share.js         1080×1920 결과 이미지, Web Share / 저장 fallback
src/game/battle.js        도전장 토큰(링크 해시) 인코딩·디코딩, 상대 최종 주차 모습 재현
src/game/result-ui.js     결과 화면, 저장/공유/도전장/대결 결과
src/game/state.js         상태 머신(화면 전환)
src/styles/main.css       흑백 UI
```

## 화면 규격 — 공통 디자인 토큰 시스템

모든 화면(INTRO·차량 선택·색상 선택·튜토리얼·RESULT·CHALLENGE·BATTLE)이 같은 AppShell 안에서
같은 세로 리듬으로 이어진다. 화면마다 width/margin/preview 크기를 따로 잡지 않고
`main.css` 상단의 토큰만 쓴다(`:root`, PLAY 제외):

```
--app-max-width: 430px      화면 전체 프레임(#app)
--content-width: 320px      preview/title/body/CTA가 공유하는 폭
--preview-width / --preview-height: 320×200  모든 화면이 같은 값 하나를 공유

--screen-top: 32px          화면 상단 → 비주얼 슬롯
--gap-preview-title: 22px   비주얼 슬롯 → 타이틀
--gap-title-content: 20px   타이틀 → 본문
--gap-content-cta: 28px     마지막 콘텐츠(본문 없으면 타이틀) → CTA
--screen-bottom: 28px       CTA → 화면 하단

--button-height: 48px         .cta
--button-height-secondary: 44px  .btn-secondary
```

세로 640px 이하 화면(예: 320×568)에서는 같은 구조를 비례 축소한 값으로 같은 변수를 재정의한다
(`@media (max-height:640px)`: preview 150px, 간격 12~20px, 버튼 42/40px) — 화면마다 다른 값을
새로 만들지 않고 토큰만 갈아끼운다.

- **CTA는 항상 마지막 콘텐츠 바로 아래.** `position:fixed`, `margin-top:auto`,
  `justify-content:space-between`, `height:100vh` 안에서 위아래 강제 분리 — 전부 금지.
- `--preview-width/height`를 170×106 같은 작은 아이콘이 아니라 `--content-width`와 같은
  320×200으로 잡은 이유: INTRO/RESULT/CHALLENGE/BATTLE는 "차량 1대"가 아니라 "주차장 장면
  (차량 3대)"을 보여줘야 해서, 선택 화면도 같은 프레임을 그대로 공유해야 화면이 안 끊긴다.
- 차량 미리보기(그리드 아이콘·큰 preview)는 **고정 scale을 쓰지 않는다.** 차종마다 `padX/padY`만
  주고 `renderPreview`가 프레임에 맞춰 adaptive fit하게 둔다 — 그래야 소형차가 작아 보이는 건
  실제 크기 차이만큼만이고, "같은 카드인데 왜 크기가 다르지" 같은 인상이 안 생긴다
  (`src/main.js`의 `drawTypeIcons`).
- 화면 전환은 슬라이드 없이 opacity + translateY(4px), 160ms fade만(`state.js`가 진입 순간
  `.entering`을 붙였다 다음 프레임에 뗀다). 레이아웃 위치 자체는 전혀 바뀌지 않는다.
- PLAY는 유일한 예외다: `#screen-play`는 `--content-width`가 아니라 앱 프레임 폭을 거의 그대로
  써서(스테이지 좌우 여백만 12/10px) 게임 공간을 넓게 잡는다. 상단 18px → 타이머(30px) → 12px →
  스테이지 순서는 유지한다. 캔버스가 커져도 물리는 월드 좌표 기준이라 히트박스는 전혀 안 바뀐다.
- 차 종류·색상 화면은 같은 자리의 미리보기 + 탭=선택 / [다음]=진행으로 조작을 통일
- 결과 화면은 가로형 결과 이미지 + 세부 점수 2열 + 버튼 2열로 한 화면에 들어옴(320×568까지 확인)
- 플레이 타이머는 상단 가운데 30px, 마지막 10초는 빨강(CSS `.timer.urgent`)

**세 개의 명시적 예외 (사용자 요청, 2026-09-19):**
- **INTRO·TUTORIAL**(1·4컷)은 화면 상단에 고정하지 않고 전체를 띄운다. "고르는 화면"인
  2·3컷과 달리 이 둘은 본문(slot-body) 없이 비주얼+타이틀+CTA뿐인 "보여주는 화면"이라 같은
  그룹으로 묶는다. 완전한 50/50 중앙은 아래로 처져 보인다는 피드백으로, 위:아래 여백 1:2
  비율(`#screen-intro,#screen-tutorial ::before{flex:1}`, `::after{flex:2}`)로 중앙보다
  살짝 위에 둔다. 비주얼·타이틀·CTA 사이 간격 토큰은 2·3컷과 완전히 같다 — 묶음 전체가
  위치만 이동할 뿐이다. 화면 바닥에는 붙지 않는다. INTRO 제목은 `.main`(28px)이라
  TUTORIAL 제목(22px)보다 높아서, `.slot-title`에 공통 `min-height:37px`을 줘 두 화면의
  비주얼·CTA가 정확히 같은 y(오차 0px)에 오도록 맞췄다.
- **차량 선택·색상 선택**은 본문 높이를 `--select-body-height`(200px, 짧은 화면 184px)로
  강제 통일해 두 화면을 오갈 때 [다음] 버튼이 같은 y좌표에서 움직이지 않는다. 2×2 그리드(164px)는
  색상 리스트(200px)보다 짧아서, 그 차이만큼 `.slot-body` 안에서 세로 중앙 정렬된다.
- 결과 등급 제목·코멘트는 사용자가 준 최종 문구 그대로(`config.js`의 `PK.GRADES`/`COMMENTS_GOOD/MID/BAD`,
  2026-09-19). 등급 제목: 주차 장인(95~100) · 제법 장인(85~94) · 들어가긴 했음(70~84) ·
  한 번만 더 기회드릴게요(50~69) · 주차 다시 배우세요(0~49). 코멘트는 등급별로 맞춤법·
  존댓말을 임의로 통일하지 않고 준 그대로 사용(예: "깊다 깊어"는 의도적으로 반말 유지).

## 차량 에셋 (assets/*.png)

- `assets/승용차.png · 소형차.png · 트럭.png · 버스.png · 오토바이.png · 자전거.png` — 흰 차체 픽셀아트 탑뷰(투명 배경). 트럭만 앞이 오른쪽이고 나머지 5종은 앞(헤드라이트·핸들)이 위. 방향이 바뀌면 `tools/build-sprites.js`의 SPRITES 목록에서 `front`(up/right)를 고친다. **새 차종을 추가할 때** SPRITES 목록에 한 줄 + `config.js`의 `PK.VEHICLES`/`VEHICLE_ORDER` + `index.html`의 `.type-btn` 한 줄이 필요하다
- 실행 시 `src/game/sprites.js`가 밝은 무채색 픽셀(최소 채널 120 이상, 차체·범퍼·이음선)을 선택 색으로 착색한다. 밝기 비율을 유지해 트림은 같은 색의 어두운 톤이 되고, 외곽선·유리·헤드라이트·테일램프·순백(번호판·반짝임·미러)은 그대로. 이웃 차량은 연회색으로 착색
- `index.html`을 file://로 열어도 캔버스 오염 없이 착색·이미지 저장이 되도록, PNG는 `src/game/sprites-data.js`에 base64로 내장돼 있다(여백 제거 + 2배 축소, 6종 약 840KB)
- **PNG를 바꾸면** `node tools/build-sprites.js` 를 한 번 실행해 내장 파일을 다시 만든다(외부 패키지 불필요). `--analyze`를 붙이면 바운딩박스·색 분포만 출력
- 차량 폭(`config.js`의 `width`)은 스프라이트 실측 비율에 맞춰 두었다. 길이만 바꾸면 그림 비율이 따라가고, 충돌 박스는 폭×길이 사각형
- 스프라이트가 없거나 로드 전이면 `renderer.js`의 벡터 실루엣으로 대신 그린다

## 배포 (GitHub Pages)

**푸시 전에 `node tools/bump-version.js`를 실행한다.** GitHub Pages는 모든 파일에 10분 캐시(`max-age=600`)를 붙이는데, `index.html`의 CSS/JS 주소가 그대로면 배포 직후 폰에서 새로고침했을 때 HTML만 새 버전이고 CSS/JS는 캐시된 옛 버전이 섞인다. 실제로 오토바이·자전거를 추가한 직후 차 선택창이 이렇게 깨졌다(2열 그리드로 표시, 버튼이 화면 밖으로 밀림, 아이콘·미리보기 빔, 콘솔 에러). 스크립트가 주소 뒤에 `?v=<시각>`을 붙여 배포마다 새 파일을 받게 한다. 이미 옛 버전이 캐시된 폰은 새로고침하거나 10분 뒤에 열면 정상으로 돌아온다. 배포 후 확인은 `https://<계정>.github.io/_parking/`를 모바일 프로필로 열어 본다.

## 오토바이 · 자전거 (2륜, 2026-09-21 추가)

자동차 4종과 같은 물리(bicycle model)·채점·도전장을 그대로 쓰고, 2륜이라 달라지는 부분만 차종 속성으로 처리한다.

- **주차칸이 좁아서 목표 칸 양옆에 이웃 칸을 3개씩**(`sideBays: 3` → 칸 7개, 자동차는 기본 1 → 3칸). 이웃 오토바이/자전거는 모두 충돌 대상이다. `buildLayout()`이 `bays`·`targetIndex`·`neighbors`를 칸 수에 맞춰 만들고, 주차선·연석 그리기는 `bays.length` 기준이다
- **결과·공유·도전장 그림은 목표 칸 양옆 `viewSide: 2`칸 + 여백까지**(칸이 7개여도 차가 작아 보이지 않게). 자동차는 기본 1 = 3칸 전체 (`renderer.snapshot`)
- **충돌 박스 폭 = 핸들 끝까지 포함한 실루엣 폭**(오토바이 16 / 자전거 16, 길이 대비 0.38 / 0.45). 몸통 폭만 쓰면 옆 칸 이웃의 핸들과 그림이 겹쳐 보여서다. 자동차는 종전대로 몸통 폭(사이드미러 제외)
- **`twoWheel: true`**: 자동차식 4륜 바퀴 사각형과 후진등을 그리지 않는다 (그림에 앞뒤 바퀴가 이미 있음). 그림이 로드되기 전에는 `drawTwoWheelFallback`의 단순 벡터로 대신 그린다. 앞바퀴만 따로 꺾이는 표시는 없다 — 방향은 차체 회전으로 보인다
- `wheelBase`는 그림의 앞뒤 바퀴 축 간격 실측 비율(길이의 0.81 / 0.78). 최대 조향 회전 반경은 오토바이 47 · 자전거 36 (소형차 50)
- 착색은 자동차와 같은 규칙이라 **밝은 무채색 부분만** 색이 바뀐다. 오토바이는 차체·시트, 자전거는 프레임·페달·핸들 파이프 정도이고 타이어는 그대로 검정이다
- 차종 선택 화면은 **3열 × 2행**(행 수가 4종 때와 같은 164px)이라 색상 화면과 [다음] 버튼 y가 그대로 같다. 아이콘 캔버스 폭은 버튼 폭에서 계산한다(`drawTypeIcons`). 선택된 버튼은 검정 배경이라 검은 그림(자전거)이 묻히지 않도록 아이콘에만 흰 바탕을 깐다

## 튜닝 포인트 (config.js)

- `PK.VEHICLES.*` : 차량별 `maxSteer`(최대 조향각), `steerTime`(0→최대 시간), `maxFwd/maxRev`, `accel`, `worldScale`(주차장 크기), `startRel`(시작 위치), `sideBays`(한쪽 이웃 칸 수)·`viewSide`(결과 그림에 보일 이웃 칸 수)·`twoWheel`
- `PK.PHYSICS.rollDecel` : 키를 뗐을 때 굴러가는 정도
- `PK.PLAY.stillHold` : 주차칸 안에서 정차 후 자동 완료까지의 시간
- `PK.PARKING_MODES.reverse.bayWidthRatio / bayLengthRatio` : 주차칸 여유

## 첫 버전에 없는 것 (의도적으로 제외)

평행주차·전면주차·스테이지·코인·랭킹·업그레이드·상점·속도계·미니맵. 후면주차 하나만 구현.
