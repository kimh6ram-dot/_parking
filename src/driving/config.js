/* 도로주행 — 설정 (물리 상수 · 점수 배점 · 등급/코멘트 · 도로 보간)
 * 기존 주차게임(PK.*)의 파일은 읽기 전용으로만 참조한다(PK.VEHICLES/PK.COLORS/PK.sprites/
 * PK.renderer.drawVehicle) — 이 파일과 driving/ 아래 어떤 파일도 game/*.js를 수정하지 않는다.
 * Math.random() 사용 금지(도전장 점수 경쟁을 위해 스테이지 스크립트는 항상 결정론적이어야 함). */
(function () {
  'use strict';

  const DRIVING = (window.DRIVING = window.DRIVING || {});

  /* ---------- 월드 / 카메라 ---------- */
  DRIVING.WORLD = {
    viewHalfWidth: 142,     // 화면 절반 폭에 대응하는 월드 x 범위(px/unit 스케일 계산용).
                             // 값들은 driving-sim2.js(스크래치패드)로 STAGE 1 커브 정점에서
                             // 도로 전체 폭이 캔버스 경계를 넘지 않는지 실측하며 정했다(2026-09-22).
    carScreenYFrac: 0.68,   // 플레이어 차량은 항상 화면 세로 68% 지점에 고정(전방 시야를 줄여
                             // 커브가 화면 밖으로 잘리는 문제를 줄인다)
    aheadMarginUnits: 40,   // 렌더 시 화면 밖 위쪽 여유
    roadHalfScale: 0.83,    // 모든 스테이지의 도로 반폭에 공통으로 곱하는 배율(차량 대비 도로가
                             // 지나치게 넓어 보이던 문제 — buildCourse에서 적용, 스테이지 데이터
                             // 자체(baseHalf 인자)는 건드리지 않는다)
  };

  /* ---------- 물리 상수 ----------
   * 2026-10-01: "방향키 조작감이 기존 주차 게임과 다르다"는 실제 플레이 피드백을 받고
   * 주차게임 PK.PHYSICS(src/game/config.js)와 값을 직접 대조해 맞췄다 — rollDecel/dragCoef/
   * stopEpsilon/gearPause 전부 주차게임과 동일값. substeps는 도로주행 물리(physics.js)가
   * 애초에 서브스텝을 쓰지 않아(충돌을 OBB push-out으로 한 번에 처리) 의미 없는 값이라
   * 그대로 둔다. restitution/maxBounce/hitCooldown은 도로주행 전용 충돌 연출용이라 유지. */
  DRIVING.PHYSICS = {
    rollDecel: 150,         // 키를 뗐을 때 구르다 멈추는 감속(u/s²) — 주차게임과 동일
    dragCoef: 0.6,          // 주차게임과 동일
    stopEpsilon: 2.0,       // 주차게임과 동일
    gearPause: 0.14,        // 제동으로 0이 된 뒤 반대 방향 가속이 시작되기까지의 멈춤(s) — 주차게임과 동일
    restitution: 0.3,
    maxBounce: 30,
    hitCooldown: 0.5,
    substeps: 2,
    rainGripMul: 0.82,      // 빗길: 조향 반응·제동 둔화
    rainBrakeMul: 0.78,
  };

  /* 내부 물리 속도(unit/s) → 화면에 보여줄 km/h. */
  DRIVING.KMH_PER_UNIT = 0.85;
  DRIVING.kmh = uPerSec => Math.round(uPerSec * DRIVING.KMH_PER_UNIT);

  /* ---------- 차종별 주행 모드 전용 속도 보정 ----------
   * 2026-10-01: PK.VEHICLES(주차게임과 공유, 읽기 전용)의 maxFwd는 "주차장 안에서의
   * 저속 기동"을 기준으로 잡힌 값이라(세단 96u/s→약 82km/h) 도로주행에서는 가속해도 금방
   * 상한에 닿아버려 "80km/h 근처에서 체감 가속이 멈춘다"는 피드백을 받았다. PK.VEHICLES는
   * 주차게임과 공유하는 읽기 전용 데이터라 여기서 직접 수정하지 않고, physics.js가 이
   * 배율만 추가로 곱해서 "도로주행 전용 최고속도"를 만든다(차체/조향각/휠베이스 등 나머지
   * 특성은 전부 그대로) — 세단 기준 약 120km/h를 목표로 1.47배(≈120/82)를 잡고, 차종별
   * 체감 차이(트럭·버스가 승용차보다 느림)는 그대로 유지되도록 같은 배율을 공통 차종에
   * 적용한다. 자전거만 예외: 같은 배율을 적용하면 약 70km/h까지 나와(자전거가 승용차급
   * 고속을 내는 건 비현실적) 거의 원래 속도를 유지하도록 훨씬 작은 배율을 쓴다(요청사항 —
   * "자전거 등 모든 차종에 승용차의 최고속도를 일괄 적용하지 마"). accel/brake도 같은
   * 배율로 늘려 "0→최고속 도달 시간" 자체는 그대로 두고(가속하는 '느낌'은 유지) 상한만
   * 늘린다. */
  DRIVING.VEHICLE_TUNING = {
    sedan: { fwdMul: 1.47 },
    compact: { fwdMul: 1.47 },
    truck: { fwdMul: 1.47 },
    bus: { fwdMul: 1.47 },
    moto: { fwdMul: 1.47 },
    bike: { fwdMul: 1.08 },
  };

  DRIVING.PLAY = {
    settleTime: 0.7,
    hintTime: 2.5,
    arriveSpeedMax: 3.2,    // 정지선 등에서 "정차했다"고 볼 속도 기준(§40 신호 준수 판정에 사용)
  };

  /* ---------- 난이도 설정(2026-10-02 — "한곳에서 조정 가능하게") ----------
   * 스테이지별 코스 곡률 자체(어떤 커브를 어떤 순서로)는 stages.js에, 제한속도 구간은
   * 스테이지별 speedLimit/speedZones 필드에, 점수 배점은 SCORE_MAX/scoring.js 감점식에
   * 각각 그대로 둔다(이미 "한 파일/한 필드" 기준으로 충분히 모여 있음) — 이 객체는 여러
   * 스테이지에 걸쳐 반복 등장하는 "교통 차량 속도·간격" 숫자만 모아 매직넘버 중복을 없앤다. */
  DRIVING.DIFFICULTY = {
    trafficSlowSpeed: 50,   // "추월 대상"(앞서가는 느린 차) 순항 속도(u/s)
    trafficMidSpeed: 60,    // 중간 속도(스쳐가는 정도)
    oncomingSpeed: 45,      // 반대 방향 차량 순항 속도(절대값, 실제 부호는 음수로 사용)
  };

  /* ---------- 점수 배점 (총 100점) ---------- */
  DRIVING.SCORE_MAX = { safety: 30, lane: 20, signal: 20, speed: 15, react: 10, finish: 5 };
  DRIVING.SCORE_LABELS = [
    ['safety', '안전 운전'],
    ['lane', '차선 유지'],
    ['signal', '신호 준수'],
    ['speed', '속도 조절'],
    ['react', '돌발 대처'],
    ['finish', '마무리'],
  ];

  /* ---------- 결과 등급 / 코멘트 (사용자 지정 문구, 임의 변경 금지) ---------- */
  const COMMENTS_GOOD = ['운전 좀 하시네요.', '보험료가 편안해 보입니다.', '계속하세요. 재능 있네요.', '옆자리에 타도 되겠습니다.', '도로가 편안해 보였습니다.'];
  const COMMENTS_MID = ['무사히 왔으면 됐습니다.', '몇 번 불안하긴 했습니다.', '도착은 하셨네요.', '큰일 없이 오긴 했습니다.', '생각보다 멀쩡하게 왔습니다.'];
  const COMMENTS_BAD = ['자신감은 좋으셨어요.', '조수석에 브레이크가 필요합니다.', '도로가 좀 놀란 것 같습니다.', '오늘은 여기까지만 운전하시죠.', '차 키는 잠깐 맡아두겠습니다.'];
  DRIVING.GRADES = [
    { min: 95, title: '도로 위 모범생', comments: COMMENTS_GOOD },
    { min: 85, title: '제법 운전함', comments: COMMENTS_GOOD },
    { min: 70, title: '도착은 했음', comments: COMMENTS_MID },
    { min: 50, title: '조수석이 불안합니다', comments: COMMENTS_MID },
    { min: 0, title: '차 키 내려놓으세요', comments: COMMENTS_BAD },
  ];
  /* 미완주(시간 초과 등)는 총점 최대 69점까지만 허용 */
  DRIVING.INCOMPLETE_SCORE_CAP = 69;

  /* ---------- 도로 보간: 웨이포인트 사이를 smoothstep으로 잇는다 ----------
   * stage.road = [{y, cx, half}, ...] (y 오름차순). 반환: 해당 y에서의 도로 중심선/반폭 */
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  DRIVING.roadAt = function (stage, y) {
    const pts = stage.road;
    if (y <= pts[0].y) return { cx: pts[0].cx, half: pts[0].half };
    const last = pts[pts.length - 1];
    if (y >= last.y) return { cx: last.cx, half: last.half };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (y >= a.y && y <= b.y) {
        const t = smoothstep((y - a.y) / (b.y - a.y));
        return { cx: a.cx + (b.cx - a.cx) * t, half: a.half + (b.half - a.half) * t };
      }
    }
    return { cx: last.cx, half: last.half };
  };

  /* 2026-09-23 카메라 전면 개편: cameraX는 더 이상 플레이어나 도로 중심을 매 프레임 따라가지
   * 않는다(그게 좌우 출렁임의 원인이었다 — 아래 renderer.js/play.js 주석 참고). 대신 스테이지
   * 시작부터 끝까지 완전히 고정된 한 값만 쓴다. 이 값은 "그 스테이지 도로 전체(웨이포인트 전부)의
   * 가장 왼쪽 가장자리와 가장 오른쪽 가장자리의 중점" — 코스 전체가 한 고정 뷰포트 안에 들어오게
   * 하는 유일하게 합리적인 고정값이다. smoothstep 보간은 인접 웨이포인트 사이를 벗어나지 않으므로
   * (단조 함수) 웨이포인트만 스캔해도 정확하다. */
  DRIVING.computeStageCamX = function (stage) {
    let minEdge = Infinity, maxEdge = -Infinity;
    stage.road.forEach(p => {
      minEdge = Math.min(minEdge, p.cx - p.half);
      maxEdge = Math.max(maxEdge, p.cx + p.half);
    });
    return (minEdge + maxEdge) / 2;
  };

  /* 해당 y 구간의 제한속도(km/h). stage.speedZones = [{y0,y1,limit}] 우선, 없으면 stage.speedLimit */
  DRIVING.speedLimitAt = function (stage, y) {
    const zones = stage.speedZones || [];
    for (const z of zones) if (y >= z.y0 && y <= z.y1) return z.limit;
    return stage.speedLimit || 70;
  };

  /* ---------- 도로 코스 조각 시스템 ----------
   * stage.road의 sparse waypoint(2~6개)를 손으로 잡던 방식 대신, "세그먼트"를 이어붙여
   * dense waypoint를 자동 생성한다. roadAt()의 smoothstep 보간은 그대로 두되(각 웨이포인트에서
   * 기울기가 0으로 수렴하므로 이어붙여도 각지지 않고 자연스럽게 이어짐 — 별도 Bezier/Catmull-Rom
   * 구현 없이도 "각진 polyline" 문제가 생기지 않는다), 세그먼트 개수를 10~15개로 늘려 스테이지마다
   * 완전히 다른 코스 실루엣을 만들 수 있게 한다.
   *
   * 세그먼트: { type, len, dx?, widthPct? }
   *   type: 아래 CURVE_DX_PER_LEN에 정의된 이름(문서/리포트용 라벨 + 기본 dx 계산에 사용)
   *   len: 이 구간의 진행거리(world y)
   *   dx: 이 구간 동안 도로 중심(cx)이 이동하는 양(world x, 양수=오른쪽). 생략 시 타입별 기본값.
   *   widthPct: 이 구간이 끝나는 지점의 도로 반폭 = baseHalf * widthPct/100. 생략 시 폭 유지.
   * curveRadius 대신 "구간 길이당 이동량 비율"로 곡률을 표현한다 — 차량 heading이 도로 형상과
   * 독립적인(플레이어가 조향하는) 이 게임 구조에서는, 실제로 난이도를 만드는 것은 "얼마나 빨리
   * 옆으로 이동해야 하는가"이지 기하학적 반경 자체가 아니기 때문이다(§27과 일치: 높은 속도로
   * 커브 진입 시 조향 능력 한계 때문에 어려워지는 구조). */
  const CURVE_DX_PER_LEN = {
    STRAIGHT: 0,
    LONG_LEFT: -0.38, LONG_RIGHT: 0.38,
    MEDIUM_LEFT: -0.55, MEDIUM_RIGHT: 0.55,
    SHARP_LEFT: -0.82, SHARP_RIGHT: 0.82,
    S_CURVE_LEFT: -0.6, S_CURVE_RIGHT: 0.6,
    CHICANE_LEFT: -0.9, CHICANE_RIGHT: 0.9,
    HAIRPIN_LEFT: -1.15, HAIRPIN_RIGHT: 1.15,
    LONG_SWEEP_LEFT: -0.3, LONG_SWEEP_RIGHT: 0.3,
    NARROW: 0, WIDEN: 0, NARROW_CURVE_LEFT: -0.7, NARROW_CURVE_RIGHT: 0.7,
  };
  /* 한 세그먼트의 최대 누적 횡이동(world unit). STAGE 1 재설계 때 dx≈76~90 정도면 카메라가
   * carScreenYFrac=0.68로 앞쪽을 넓게 보여줘도 도로 전체 폭이 뷰포트 안전선을 거의 넘지 않는
   * 것을 실측으로 확인했다 — 그 값을 모든 스테이지에 공통 상한으로 적용한다. 이렇게 하면
   * 스테이지 2~10의 긴 커브(LONG_LEFT 520 같은 것)도 데이터(길이)는 그대로 둔 채 실제로 화면에
   * 쓰이는 "얼마나 옆으로 밀리는가"만 안전 범위로 눌러준다(같은 길이 동안 더 완만하게 휘어짐 —
   * 커브가 사라지진 않고 부드러워질 뿐). */
  const MAX_SEG_DX = 90;
  DRIVING.seg = function (type, len, opts) {
    opts = opts || {};
    let dx = opts.dx != null ? opts.dx : (CURVE_DX_PER_LEN[type] || 0) * len;
    dx = Math.max(-MAX_SEG_DX, Math.min(MAX_SEG_DX, dx));
    return { type, len, dx, widthPct: opts.widthPct };
  };
  /* segments를 실제 road waypoint 배열로 펼친다. baseHalf=100% 기준 반폭, startCx=시작 중심선
   * WORLD.roadHalfScale을 여기서 한 번만 곱한다 — 각 스테이지의 course() 호출 인자(baseHalf)는
   * 그대로 두고, 실제로 생성되는 waypoint(half)에만 전역 배율이 적용되게 해서 스테이지 데이터를
   * 건드리지 않고 도로 폭만 공통으로 좁힐 수 있게 한다. */
  /* 누적 중심선 이동 상한 — 세그먼트 하나하나는 MAX_SEG_DX로 눌러도, 같은 방향 커브가 여러 번
   * 이어지면 중심선이 계속 한쪽으로 쌓여 코스 전체가 고정 카메라(WORLD.viewHalfWidth 기준
   * 고정 뷰포트, cameraX가 더는 플레이어/도로를 따라 재중앙화하지 않음) 밖으로 나갈 수 있다
   * (스테이지 10 실측: 절반폭 171 > 뷰포트 142). "중심선 cx"가 아니라 "도로 가장자리
   * (cx±half)"가 안전선을 넘지 않도록 매 웨이포인트에서 직접 클램프한다 — smoothstep 보간은
   * 두 웨이포인트 사이를 절대 벗어나지 않으므로(단조) 이렇게 하면 코스 전체가 한 뷰포트 안에
   * 들어오는 것이 보장된다. */
  DRIVING.buildCourse = function (segments, baseHalf, startCx) {
    baseHalf *= (DRIVING.WORLD.roadHalfScale || 1);
    const safeEdge = DRIVING.WORLD.viewHalfWidth * 0.88;
    const pts = [{ y: 0, cx: startCx || 0, half: baseHalf }];
    let y = 0, cx = startCx || 0, half = baseHalf;
    segments.forEach(s => {
      y += s.len;
      cx += s.dx || 0;
      half = s.widthPct != null ? baseHalf * s.widthPct / 100 : half;
      cx = Math.max(-(safeEdge - half), Math.min(safeEdge - half, cx));
      pts.push({ y, cx, half });
    });
    return pts;
  };
})();
