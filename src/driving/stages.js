/* 도로주행 — STAGE 1~5 데이터 (전부 결정론적: Math.random 없음)
 * 2026-10-01: 전 스테이지를 단순 평면(flat) 디자인(map-renderer.js)으로 통일했다 — PNG
 * 배경/보도/연석/나무/건물/강물·암벽 같은 장식 배경은 전부 걷어내고, 흰 화면 위 밝은 회색
 * 도로 + 가는 경계선 + 가는 차선만 남긴다. STAGE 1~3은 2026-09-29~30에 만든 모듈형 코스
 * 생성(road-segments.js의 buildCourseFromSegments, 직선/커브 조합)을 그대로 재사용하고,
 * STAGE 4~5는 road-template.js의 실측 PATH 코스(buildImageCourse)를 그대로 재사용한다 —
 * 둘 다 "코스 생성/판정 로직"은 전혀 새로 만들지 않고, 결과물인 stage.road([{y,cx,half}])만
 * map-renderer.js가 공통으로 그린다.
 *
 * 2026-10-02: 코스 길이·물리·배경·중앙선·조작은 전부 그대로 두고, "스테이지별 운전 과제"와
 * "교통 배치"만 다시 짰다(§1~2) — 각 스테이지가 서로 다른 판단을 요구하게:
 *   STAGE 1 커브 따라가기(장애물 없음, 조향 자체가 과제) → STAGE 2 느린 앞차 추월하기 →
 *   STAGE 3 커브+회피 조합(큰 차량은 공간을 더 차지) → STAGE 4 속도 조절+신호 →
 *   STAGE 5 종합(커브+추월+감속을 짧게 다시 섞음). 모든 새 이벤트 간격은 "약 3~5초마다
 *   판단 상황"을 코스상의 거리로 환산해 배치했다(세단 기준 순항 약 105~115유닛/초 →
 *   350~550유닛 간격). 차량 속도 기준값은 DRIVING.DIFFICULTY(config.js)에 모아뒀다.
 *
 * theme: URBAN | RESIDENTIAL | RIVERSIDE | PARK | MOUNTAIN — 결과화면 라벨 용도로만 쓰인다.
 * destination: {y0,y1,cx,half}. static.parkedCar에 illegalParked:true를 주면 "불법 주차중"
 * 라벨이 뜬다. 유저에게는 stage.label(STAGE n)만 보여준다. */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;
  const DIFF = DRIVING.DIFFICULTY;

  /* 도로가 실제로 곡선이라 절대 x로 정적/이벤트 좌표를 잡으면 커브 구간에서 차선 밖에
   * 놓이는 버그가 난다 — 반드시 "그 y에서의 실제 도로 중심"을 기준으로 offset을 더해 배치한다. */
  function cxAt(road, y) { return DRIVING.roadAt({ road: road }, y).cx; }
  function halfAt(road, y) { return DRIVING.roadAt({ road: road }, y).half; } // 횡단보도 등 "도로 폭 전체"가 필요한 요소용

  /* STAGE 4~5는 계속 같은 실사 코스(road-template.js PATH, worldH≈911)를 공유한다(코스
   * 좌표/판정 로직 그대로 재사용). widthMul만 스테이지별로 달라 도로 폭으로 난이도를 표현한다. */
  const img4 = DRIVING.buildImageCourse('park', 120, 0.90);
  const img5 = DRIVING.buildImageCourse('mountain', 120, 0.85);

  /* STAGE 1 — "커브 따라가기". 짧은 시작 직선(startStraight, 약 1.5~2초) 뒤 좌-우-좌로
   * 방향이 바뀌는 S자. 가운데 커브를 rightSharp로 올려 "완만한 커브 + 감속하면 편한 더
   * 강한 커브"를 섞는다(요청사항) — 나머지 둘은 Soft로 "최고속 가속만으로는 부담스럽지만
   * 조향만 적절히 하면 초보자도 통과 가능"한 수준을 유지한다. 장애물은 두지 않는다 —
   * "장애물보다 조향 자체에 집중"이 이 스테이지의 과제이기 때문이다.
   * 참고: 직선/곡선 커브 자체만으로는(완만하든 급하든) checkRoadEdge()의 초당 70유닛 보정이
   * 항상 앞질러서, "조향 전혀 안 하면 도로 밖으로 나간다"는 완전히는 만들 수 없다(2026-10-01
   * 실측 확인, 충돌판정 쪽 문제라 이번에도 범위 밖). rightSharp로 가운데 커브를 올린 것은
   * 그 한계 안에서 "조향 안 하면 적어도 경계 접촉·감속은 확실히 겪는다"를 더 강하게
   * 만들기 위함이다(급커브는 완만한 커브보다 경계 접촉이 훨씬 일찍, 크게 발생). */
  const TEST_COURSE_1 = ['startStraight', 'leftSoft', 'rightSharp', 'leftSoft', 'straight'];
  const seg1 = DRIVING.buildCourseFromSegments(TEST_COURSE_1, 0, 120);

  /* STAGE 2 — "앞차 추월하기". 코스 형태(좌우 완만 커브)는 그대로 두고 이벤트만 다시 짰다. */
  const TEST_COURSE_2 = ['straight', 'leftSoft', 'rightSoft', 'straight'];
  const seg2 = DRIVING.buildCourseFromSegments(TEST_COURSE_2, 0, 120);

  /* STAGE 3 — "커브와 회피 조합". 코스 형태(급커브 좌우 연속)는 그대로 두고 이벤트만 다시 짰다. */
  const TEST_COURSE_3 = ['straight', 'leftSharp', 'rightSharp', 'straight'];
  const seg3 = DRIVING.buildCourseFromSegments(TEST_COURSE_3, 0, 120);

  DRIVING.STAGES = [
    {
      id: 1, label: 'STAGE 1', theme: 'URBAN', timeLimit: 50, speedLimit: 112,
      mapMode: 'segments',
      road: seg1.road, destination: seg1.destination, roadSegments: seg1.segments,
      static: [],
      events: [],
    },
    {
      /* STAGE 2 — "느린 앞차"(laneChange, driftTime=0·reactDistance=0 → 차선변경 없이 그
       * 자리에서 계속 낮은 속도로 직진만 함 — 그대로 두면 반드시 따라잡히는 '앞차' 역할)를
       * 초반·중반·후반에 하나씩 나눠 추월 기회를 만든다. 사이에 오는 차(오프셋을 줘 중앙에
       * 겹치지 않게)를 하나 섞어 "추월 중 반대 차선까지 과하게 넘지 않기"도 요구한다.
       * 기존 불법주차 차량(정적 장애물)은 그대로 유지 — 추월 대상과는 400유닛 이상 띄워
       * "바로 옆에 다른 차량을 더 만들어 탈출 불가"가 되지 않게 했다. */
      id: 2, label: 'STAGE 2', theme: 'RESIDENTIAL', timeLimit: 40, speedLimit: 106,
      mapMode: 'segments',
      road: seg2.road, destination: seg2.destination, roadSegments: seg2.segments,
      static: [
        { type: 'parkedCar', vehicleId: 'sedan', colorId: 'red', x: cxAt(seg2.road, 300) + 46, y: 300, heading: 0, illegalParked: true },
      ],
      events: [
        { id: 'slow2a', kind: 'laneChange', vehicleId: 'compact', colorId: 'blue',
          spawnY: 700, x0: cxAt(seg2.road, 700), cruiseSpeed: DIFF.trafficSlowSpeed, reactDistance: 0, driftTime: 0, holdX: cxAt(seg2.road, 700) },
        { id: 'oncoming2', kind: 'laneChange', vehicleId: 'compact', colorId: 'red',
          spawnY: 1200, x0: cxAt(seg2.road, 1200) - 40, cruiseSpeed: -DIFF.oncomingSpeed, reactDistance: 0, driftTime: 0, holdX: cxAt(seg2.road, 1200) - 40 },
        { id: 'slow2b', kind: 'laneChange', vehicleId: 'truck', colorId: 'yellow',
          spawnY: 1650, x0: cxAt(seg2.road, 1650) - 6, cruiseSpeed: DIFF.trafficSlowSpeed - 2, reactDistance: 0, driftTime: 0, holdX: cxAt(seg2.road, 1650) - 6 },
      ],
    },
    {
      /* STAGE 3 — "커브와 회피 조합". 급커브(leftSharp) 구간 한가운데 큰 차량(bus, "공간을
       * 더 차지")을 느린 laneChange로 세워 커브 조향 + 회피를 동시에 요구한다. 두 번째 급커브
       * (rightSharp) 중간에는 끼어드는 택시를 둬 다른 대응(반응 거리 기반 회피)을 요구한다.
       * 첫 직선(브레이크 대응)과 마지막 직선(장애물 없는 순수 회복 구간)은 "어려운 구간 뒤
       * 정리할 수 있는 쉬운 구간"으로 비워둔다. STAGE 2와 차량 종류만 다른 동일 코스가
       * 되지 않도록, 추월이 아니라 "정적에 가까운 장애물 회피(커브 중)"로 과제 성격을 바꿨다. */
      id: 3, label: 'STAGE 3', theme: 'RIVERSIDE', timeLimit: 40, speedLimit: 100,
      mapMode: 'segments',
      road: seg3.road, destination: seg3.destination, roadSegments: seg3.segments,
      static: [],
      events: [
        { id: 'brake3', kind: 'brakeStop', vehicleId: 'truck', colorId: 'blue',
          spawnY: 300, x0: cxAt(seg3.road, 300) - 16, cruiseSpeed: 40, reactDistance: 160, brakeTime: 1.1 },
        { id: 'bus3', kind: 'laneChange', vehicleId: 'bus', colorId: 'white',
          spawnY: 800, x0: cxAt(seg3.road, 800) - 15, cruiseSpeed: DIFF.trafficSlowSpeed - 5, reactDistance: 0, driftTime: 0, holdX: cxAt(seg3.road, 800) - 15 },
        { id: 'taxi3', kind: 'laneChange', vehicleId: 'sedan', colorId: 'yellow',
          spawnY: 1300, x0: cxAt(seg3.road, 1300) + 46, cruiseSpeed: 38, reactDistance: 120, driftTime: 1.0, holdX: cxAt(seg3.road, 1300) + 6 },
      ],
    },
    {
      /* STAGE 4 — 공원/학교 보호구역. 30km/h 구간을 sign(시작 예고, 구간 시작 160유닛 전)과
       * crosswalk(구간 끝과 위치 일치 — 시각적으로 "여기서 제한이 끝난다"는 표시를 겸함)로
       * 시작·종료를 표시한다. 신호(RED)는 정지선 150유닛 전에 트리거돼 감속할 거리를 충분히
       * 준다. 적색 판정은 scoring.js가 이미 "정지선 통과 시점"에만 매기고(차량 신호등 자체가
       * 먼 거리에서 보인다고 감점하는 로직 없음), 제한속도 감점도 DRIVING.speedLimitAt()이
       * 해당 y구간에서만 limit을 돌려주므로 구간 밖에서는 적용되지 않는다(기존 로직 확인,
       * 변경 없음). 횡단보도 폭을 100→76유닛으로 줄여 보행 대기시간을 전체 플레이 시간의
       * 큰 비중을 차지하지 않게 했다(약 5.5초 → 약 4초, 코스 총 길이 911유닛 기준). */
      id: 4, label: 'STAGE 4', theme: 'PARK', timeLimit: 30, speedLimit: 105,
      mapMode: 'segments',
      road: img4.road, destination: img4.destination,
      speedZones: [{ y0: 560, y1: 700, limit: 30 }],
      /* 2026-10-02: 횡단보도가 도로 일부에만 걸쳐 보이던 버그 — x0/x1이 도로 폭과 무관한
       * 고정 오프셋(center-80~+80, 실제 반폭보다 좁고 비대칭)이었다. 이제 그 y에서의 실제
       * 도로 경계(cx±half, halfAt() 신규 헬퍼)를 그대로 써서 "왼쪽 경계~오른쪽 경계"를
       * 정확히 덮는다. 보행자(kid4)도 경계 바로 바깥(±14)에서 출발·도착하도록 맞췄다 —
       * "도로 한쪽 경계 바깥 대기 → 반대쪽 경계 밖 도착"을 실제 도로 폭 기준으로 만족시킨다. */
      static: [
        { type: 'sign', x: cxAt(img4.road, 400) + 74, y: 400, text: '30' },
        { type: 'stopLine', y: 680, x0: cxAt(img4.road, 680) - 80, x1: cxAt(img4.road, 680) },
        { type: 'crosswalk', y: 700, x0: cxAt(img4.road, 700) - halfAt(img4.road, 700), x1: cxAt(img4.road, 700) + halfAt(img4.road, 700) },
      ],
      events: [
        { id: 'oncoming4', kind: 'laneChange', vehicleId: 'compact', colorId: 'red',
          spawnY: 260, x0: cxAt(img4.road, 260) + 38, cruiseSpeed: -DIFF.oncomingSpeed, reactDistance: 0, driftTime: 0, holdX: cxAt(img4.road, 260) + 38 },
        { id: 'kid4', kind: 'crosswalkPedestrian',
          x0: cxAt(img4.road, 700) - halfAt(img4.road, 700) - 14, x1: cxAt(img4.road, 700) + halfAt(img4.road, 700) + 14,
          y: 700, reactDistance: 150, walkSpeed: 34 },
      ],
    },
    {
      /* STAGE 5 — "종합 운전". 산길 코스(실사 PATH, 자체적으로 계속 굽어 있어 커브 과제는
       * 코스 형태 자체가 이미 제공) 위에 STAGE 2~3에서 익힌 추월(택시)·회피(오토바이 weave)·
       * 감속(오는 차)을 짧게 한 번씩 다시 배치한다 — 동시에 겹치지 않도록 간격을 벌리고
       * (기존 140~220유닛 간격 → 약 230~270유닛, 코스 길이가 911로 짧아 완전한 3~5초
       * 간격까지는 못 벌림, 보고서에 명시), 마지막 100여 유닛은 장애물 없는 결승 접근
       * 구간으로 비워 "갑자기 몰아치다 끝나는" 느낌을 줄였다. */
      id: 5, label: 'STAGE 5', theme: 'MOUNTAIN', timeLimit: 28, speedLimit: 95,
      mapMode: 'segments',
      road: img5.road, destination: img5.destination,
      static: [],
      events: [
        { id: 'taxi5', kind: 'laneChange', vehicleId: 'sedan', colorId: 'yellow',
          spawnY: 220, x0: cxAt(img5.road, 220) + 42, cruiseSpeed: 38, reactDistance: 110, driftTime: 1.0, holdX: cxAt(img5.road, 220) + 4 },
        { id: 'moto5', kind: 'weave', vehicleId: 'moto', colorId: 'red',
          spawnY: 480, cruiseSpeed: 44,
          path: [
            { y: 480, x: cxAt(img5.road, 480) + 24 },
            { y: 560, x: cxAt(img5.road, 560) - 14 },
            { y: 640, x: cxAt(img5.road, 640) + 16 },
          ] },
        { id: 'oncoming5', kind: 'laneChange', vehicleId: 'compact', colorId: 'blue',
          spawnY: 800, x0: cxAt(img5.road, 800) + 34, cruiseSpeed: -DIFF.oncomingSpeed, reactDistance: 0, driftTime: 0, holdX: cxAt(img5.road, 800) + 34 },
      ],
    },
  ];

  /* 각 스테이지의 고정 카메라 X(스테이지 시작~끝까지 절대 변경되지 않는 한 값). */
  DRIVING.STAGES.forEach(s => { s.camX = DRIVING.computeStageCamX(s); });
})();
