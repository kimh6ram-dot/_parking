/* 주차하기 베타 — "단계마다 다른 운전 기술을 요구하는" 5단계 코스 (2026-10-28 전면 개편)
 * 기존 주차게임(src/game/*.js)은 절대 수정하지 않는다 — PK.physics/PK.VEHICLES/PK.COLORS/
 * PK.PALETTE/PK.GRADES/PK.SCORE_MAX 등은 전부 읽기 전용으로 그대로 재사용한다. 주차칸
 * 크기만 단계마다 줄이던 이전 버전과 달리, 이번엔 단계마다 "시작 위치·진입 각도·주차칸
 * 위치/방향(후면주차 vs 평행주차)·장애물·확보해야 하는 공간"을 다르게 조합한다. 실제
 * 레이아웃 계산은 src/parkingbeta/layout.js(PB.buildStageLayout)가 담당 — 1~3단계는 기존
 * PK.buildLayout(후면주차 행 배치)을 재사용하고, 4~5단계(평행주차)는 거기 없던 새 기하를
 * layout.js에 새로 만들었다(PK.PARKING_MODES는 1~3단계용 키만 추가, 평행주차는 아예
 * PK.buildLayout을 거치지 않아 건드릴 PK 전역 자체가 없다). */
(function () {
  'use strict';

  const PK = window.PK;
  const PB = (window.PB = window.PB || {});

  PK.PARKING_MODES = PK.PARKING_MODES || {};

  const STAGE_DEFS = [
    {
      // STAGE 1 — 기본 후면주차. 기존 1단계 조작감 그대로, 넉넉한 칸 + 기본 시작 위치.
      n: 1, label: 'STAGE 1', timeLimit: 32, layoutType: 'row',
      row: { bayWidthRatio: 1.60, bayLengthRatio: 1.35 },
    },
    {
      // STAGE 2 — 같은 크기 칸이지만 시작 위치/각도가 어긋나 있어, 먼저 위치·각도를 만들고
      // 나서 후진해야 한다(바로 후진만으론 안 들어감). 시작 위치는 기존(검증된) 1단계
      // 시작 위치·각도를 주차칸 중심 기준으로 좌우 대칭 이동한 값 — 물리는 좌우 대칭이라
      // 등 난이도가 보장되면서도 반대쪽에서 접근하는 다른 느낌을 준다.
      n: 2, label: 'STAGE 2', timeLimit: 34, layoutType: 'row',
      row: { bayWidthRatio: 1.52, bayLengthRatio: 1.30 },
      rowOpts: { start: { x: 1 - 0.29, y: 0.56, heading: -(Math.PI - 0.35) } },
    },
    {
      // STAGE 3 — 진입로에 쇼핑카트 장애물(고정, 움직이지 않음). 충돌해도 즉시 실패는
      // 아니지만(감점) 직선 접근은 막혀 있어 돌아서 들어가야 한다. r은 충돌 판정용 반경
      // (실제 카트 몸체+바퀴 기준, PNG 전체 사각형보다 작게) — 렌더링 크기는
      // src/parkingbeta/renderer.js의 CART_DISPLAY_W로 따로 관리한다(2026-10-28: 카트가
      // 커 보이도록 확대 요청 — r도 같은 비율로 함께 키움. 2026-10-28 2차: 표시 크기가
      // 다시 200%로 커진 만큼 r도 같은 비율(13→26)로 동반 확대. 2026-10-28 4차: 표시 크기가
      // 절반(76→38)으로 줄어든 만큼 r도 같은 비율로 동반 축소(26→13)).
      n: 3, label: 'STAGE 3', timeLimit: 34, layoutType: 'row',
      row: { bayWidthRatio: 1.50, bayLengthRatio: 1.28 },
      rowOpts: { obstacles: [{ xRel: 0.30, yRel: 0.57, r: 13 }] },
    },
    {
      // STAGE 4 — 평행주차(왼쪽). 1~3단계와 같은 세로형 월드를 그대로 쓴다(공통 프레임) —
      // 화면 왼쪽에 세로로 주차된 차량 2대, 그 사이 빈 칸에 후진으로 들어간다. 넉넉한 도로 폭.
      n: 4, label: 'STAGE 4', timeLimit: 36, layoutType: 'parallel',
      parallel: {
        side: 'left', roadWidth: 150,
        bayLengthRatio: 1.38, bayWidthRatio: 1.32,
      },
    },
    {
      // STAGE 5 — 좁은 도로 평행주차(왼쪽). 오른쪽에 벽(반대편 연석/고정 장애물)이 있어
      // 크게 돌 수 없다 — 전진·후진을 여러 번 섞어야 들어간다.
      n: 5, label: 'STAGE 5', timeLimit: 40, layoutType: 'parallel',
      parallel: {
        side: 'left', roadWidth: 95, opposingWall: 16,
        bayLengthRatio: 1.32, bayWidthRatio: 1.28,
      },
    },
  ];

  PB.STAGES = STAGE_DEFS.map(d => {
    const stage = {
      id: d.n, label: d.label, timeLimit: d.timeLimit, layoutType: d.layoutType,
      rowOpts: d.rowOpts,
      parallel: d.parallel,
    };
    if (d.layoutType === 'row') {
      const modeId = 'betaStage' + d.n;
      // 'reverse' 키는 절대 건드리지 않고 새 키만 추가(기존 코드 어디도 PARKING_MODES를
      // 순회하거나 리터럴 'reverse' 외의 modeId를 넘기지 않음을 확인했다 — 안전).
      PK.PARKING_MODES[modeId] = {
        id: modeId, bayWidthRatio: d.row.bayWidthRatio, bayLengthRatio: d.row.bayLengthRatio,
        targetHeading: Math.PI / 2,
      };
      stage.modeId = modeId;
    }
    return stage;
  });

  /* 정차 판정(stillSpeed/stillHold)·settle 시간은 주차칸 크기와 무관한 상수라 기존 PK.PLAY
   * 값을 그대로 읽어 쓴다(읽기 전용 참조, play.js에서 직접 참조) — timeLimit만 스테이지별로
   * PB.STAGES[i].timeLimit을 쓴다. */
})();
