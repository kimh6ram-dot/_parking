/* 주차하기 — 설정 (차량 4종 · 색상 4종 · 주차장 레이아웃 · 물리 상수)
 * 모든 길이 단위는 "월드 유닛". 렌더러가 스테이지 크기에 맞춰 배율을 정한다. */
(function () {
  'use strict';

  const PK = (window.PK = window.PK || {});

  /* ---------- 차량 4종 ----------
   * width/length: 차체 크기 (충돌 박스 = 차체 사각형 그대로)
   * wheelBase: 앞바퀴축~뒷바퀴축 거리, rearOverhang: 뒷범퍼~뒷바퀴축
   * maxSteer: 최대 조향각(rad), steerTime: 0→최대까지 걸리는 시간(s), returnTime: 최대→0 복귀 시간(s)
   * maxFwd/maxRev: 최고속도(u/s), accel/revAccel: 가속도(u/s²), brake: 반대 방향 키로 제동 시 감속(u/s²)
   * worldScale: 긴 차량일수록 넓은 주차장 (화면상 실제 크기 차이는 유지)
   */
  PK.VEHICLES = {
    sedan: {
      id: 'sedan', label: '승용차',
      width: 35, length: 72, wheelBase: 46, rearOverhang: 11, // 폭은 assets/승용차.png 실측 비율
      maxSteer: 33 * Math.PI / 180, steerTime: 0.38, returnTime: 0.32,
      maxFwd: 96, maxRev: 76, accel: 105, revAccel: 90, brake: 210,
      worldScale: 1.0,
    },
    compact: {
      id: 'compact', label: '소형차',
      width: 34, length: 58, wheelBase: 36, rearOverhang: 9, // 폭은 assets/소형차.png 실측 비율
      maxSteer: 36 * Math.PI / 180, steerTime: 0.32, returnTime: 0.28,
      maxFwd: 92, maxRev: 74, accel: 120, revAccel: 100, brake: 220,
      worldScale: 1.0,
    },
    truck: {
      id: 'truck', label: '트럭',
      width: 38, length: 96, wheelBase: 60, rearOverhang: 16, // 폭은 assets/트럭.png 실측 비율
      maxSteer: 31 * Math.PI / 180, steerTime: 0.46, returnTime: 0.38,
      maxFwd: 88, maxRev: 68, accel: 85, revAccel: 75, brake: 190,
      worldScale: 1.15,
    },
    bus: {
      id: 'bus', label: '버스',
      width: 49, length: 124, wheelBase: 76, rearOverhang: 22, // 폭은 assets/버스.png 실측 비율
      maxSteer: 29 * Math.PI / 180, steerTime: 0.52, returnTime: 0.42,
      maxFwd: 84, maxRev: 64, accel: 72, revAccel: 64, brake: 170,
      worldScale: 1.25,
      startRel: { x: 0.26, y: 0.62 }, // 회전 반경이 커서 조금 더 아래·왼쪽에서 출발
    },
  };
  PK.VEHICLE_ORDER = ['sedan', 'compact', 'truck', 'bus'];

  /* ---------- 차량 색상 4종 (게임 오브젝트에만 사용, UI에는 절대 사용하지 않음) ---------- */
  PK.COLORS = {
    blue:   { id: 'blue',   label: '파랑', body: '#3B6FE0' },
    red:    { id: 'red',    label: '빨강', body: '#E24B4B' },
    yellow: { id: 'yellow', label: '노랑', body: '#F5C542' },
    white:  { id: 'white',  label: '흰색', body: '#FFFFFF' },
  };
  PK.COLOR_ORDER = ['blue', 'red', 'yellow', 'white'];

  /* ---------- 공통 팔레트 (오브젝트) ---------- */
  PK.PALETTE = {
    floor: '#F7F7F7',
    lotBorder: '#000000',
    bayLine: '#555555',
    curb: '#333333',
    outline: '#000000',
    glass: '#3A3A3A',
    wheel: '#222222',
    neighborBody: '#E4E4E4',
    neighborGlass: '#4A4A4A',
    headlight: '#FFF4B8',
    taillight: '#D93025',
    reverseLight: '#FFFFFF',
  };

  /* ---------- 주차 모드 (첫 버전은 reverse만 사용, 구조만 확장 가능하게) ---------- */
  PK.PARKING_MODES = {
    reverse: {
      id: 'reverse',
      bayWidthRatio: 1.55,   // 주차칸 폭 = 차량 폭 × 1.55
      bayLengthRatio: 1.3,   // 주차칸 길이 = 차량 길이 × 1.3
      targetHeading: Math.PI / 2, // 완료 시 차량 앞머리가 아래(통로)를 향함 = 후면주차
    },
    parallel: null,
    front: null,
  };

  /* ---------- 월드 / 플레이 ---------- */
  PK.WORLD = {
    baseW: 360,
    baseH: 500,
    topMargin: 24,          // 주차칸 뒤 벽(연석)까지의 여백
    startRel: { x: 0.29, y: 0.56 }, // 사용자 차량 시작 위치 (월드 비율)
    startHeading: -0.35,    // 동쪽(오른쪽)을 보며 살짝 위로 향하는 대각선
  };

  PK.PHYSICS = {
    rollDecel: 150,         // 키를 뗐을 때 굴러가다 멈추는 감속(u/s²)
    dragCoef: 0.6,          // 속도 비례 저항
    stopEpsilon: 2.0,       // 이 속도 이하면 정지로 처리
    gearPause: 0.14,        // 제동으로 0이 된 뒤 후진이 시작되기까지의 잠깐의 멈춤(s)
    restitution: 0.35,      // 충돌 반동 비율
    maxBounce: 24,          // 반동 최대 속도(u/s)
    countThreshold: 4,      // 이 속도 이상으로 부딪혀야 충돌 1회로 기록
    strongRatio: 0.45,      // 최고속도 대비 이 비율 이상이면 '세게 충돌'
    hitCooldown: 0.6,       // 같은 대상 재충돌 기록 최소 간격(s)
    substeps: 3,
  };

  PK.PLAY = {
    timeLimit: 30,          // 제한시간(s)
    stillSpeed: 1.5,        // 정차로 보는 속도(u/s)
    stillHold: 0.65,        // 주차 영역 안에서 이 시간 동안 정차하면 자동 완료(s)
    settleTime: 0.7,        // 완료 후 최종 상태를 보여주는 시간(s)
    hintTime: 2.5,          // "방향키로 운전하세요" 표시 시간(s)
  };

  /* ---------- 점수 배점 ---------- */
  PK.SCORE_MAX = {
    center: 25, angle: 25, gap: 20, collision: 15, time: 10, finish: 5,
  };
  PK.SCORE_LABELS = [
    ['center', '중앙 정렬'],
    ['angle', '각도'],
    ['gap', '좌우 간격'],
    ['collision', '충돌'],
    ['time', '주차 시간'],
    ['finish', '마무리'],
  ];

  /* ---------- 결과 등급 / 문구 (2026-09-19, 사용자 최종본) ----------
   * 점수 구간은 기존 5단계 그대로. 등급 제목과 코멘트 모두 사용자가 준 문구 그대로 사용 —
   * 임의로 맞춤법·존댓말 통일하지 않는다(예: "깊다 깊어"는 의도적으로 반말 유지). */
  const COMMENTS_GOOD = ['혹시... 차세요?', '깊다 깊어', '계속해, 재능 있네요', '솔직히 좀 섹시했어요'];
  const COMMENTS_MID = ['감각이 좀 있으시네요', '소질 있네요', '제법이시네요', '좀 치시네요'];
  const COMMENTS_BAD = ['제법... 아니예요', '면허가 없으시네요', '차가 좀 놀란 것 같아요', '자신감은 좋으셨어요'];
  PK.GRADES = [
    { min: 95, title: '주차 장인', comments: COMMENTS_GOOD },
    { min: 85, title: '제법 장인', comments: COMMENTS_GOOD },
    { min: 70, title: '들어가긴 했음', comments: COMMENTS_MID },
    { min: 50, title: '한 번만 더 기회드릴게요', comments: COMMENTS_MID },
    { min: 0,  title: '주차 다시 배우세요', comments: COMMENTS_BAD },
  ];

  /* 주차장 레이아웃 계산: 선택 차량에 맞춰 월드/주차칸/이웃 차량/시작 위치를 만든다 */
  PK.buildLayout = function (vehicle, modeId) {
    const mode = PK.PARKING_MODES[modeId || 'reverse'];
    const W = Math.round(PK.WORLD.baseW * vehicle.worldScale);
    const H = Math.round(PK.WORLD.baseH * vehicle.worldScale);
    const bayW = Math.round(vehicle.width * mode.bayWidthRatio);
    const bayL = Math.round(vehicle.length * mode.bayLengthRatio);
    const top = PK.WORLD.topMargin;
    const left = Math.round(W / 2 - bayW * 1.5);
    const bays = [0, 1, 2].map(i => ({
      x: left + i * bayW, y: top, w: bayW, h: bayL,
      cx: left + i * bayW + bayW / 2, cy: top + bayL / 2,
    }));
    const target = bays[1];
    const neighbors = [bays[0], bays[2]].map(b => ({
      x: b.cx, y: b.cy, heading: mode.targetHeading, vehicle,
    }));
    // 충돌 대상: 이웃 차량 2대 + 주차장 4면 벽(위쪽 벽은 연석 위치)
    const T = 200;
    const walls = [
      { id: 'wall-top',    x: -T, y: top - T, w: W + 2 * T, h: T },
      { id: 'wall-bottom', x: -T, y: H,       w: W + 2 * T, h: T },
      { id: 'wall-left',   x: -T, y: -T,      w: T, h: H + 2 * T },
      { id: 'wall-right',  x: W,  y: -T,      w: T, h: H + 2 * T },
    ];
    // 시작 위치: 긴 차량은 회전 반경이 커서 차종별로 다른 위치에서 출발 (vehicle.startRel 우선)
    const rel = vehicle.startRel || PK.WORLD.startRel;
    const start = {
      x: Math.round(W * rel.x),
      y: Math.round(H * rel.y),
      heading: vehicle.startHeading != null ? vehicle.startHeading : PK.WORLD.startHeading,
    };
    return { W, H, top, bays, target, neighbors, walls, start, mode };
  };
})();
