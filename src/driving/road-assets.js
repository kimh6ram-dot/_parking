/* 도로주행 — 모듈형 ROAD 에셋 레지스트리 (2026-09-29 신규)
 * assets/02_도로주행/road/road_assets/*.png 9종을 사용한다. 레거시(road-bg-data.js,
 * road-template.js, drawBgImage/drawRoad)와 완전히 분리된 새 파일 — 레거시는 건드리지 않는다.
 * stage.mapMode==='segments'인 스테이지(현재 STAGE 1만)만 이 레지스트리를 쓴다.
 *
 * 실측 방법(§3 — "매 프레임 alpha scan 같은 비효율적인 계산 금지"): tools/png.js 디코더로
 * 9개 PNG의 alpha 경계를 오프라인 스크립트(1회성, 이 코드에 포함되지 않음)로 스캔해 아래
 * 수치를 얻었다. 전부 256×512px, alphaMin=10 기준.
 *
 *   road_straight.png        : road body 154px 폭(51~204), top/bottom 중심 동일(127.5) — 직선.
 *   road_curve_left_soft.png : top(y=0)=127.5 → bottom(y=511)=97.5  (아래로 갈수록 -30, 154px 폭 유지)
 *   road_curve_right_soft.png: top=127.5 → bottom=157.5 (+30)
 *   road_curve_left_sharp.png: top=127.5 → bottom=79.5  (-48)
 *   road_curve_right_sharp.png:top=127.5 → bottom=175.5 (+48)
 *   curb_straight.png        : 172px 폭(42~213), road body 바깥으로 각 9px 확장, 중심 동일
 *   sidewalk_straight.png    : 224px 폭(16~239), curb 바깥으로 각 26px 확장, 중심 동일
 *   road_center_line.png     : 폭 18px, dash 66px / gap 55px(중앙 컬럼 alpha run 실측), 색 #FAFAF8
 *   road_edge_line.png       : 12px 폭 세로 띠 2개가 x=51~62 / x=193~204(=road body 정확히 양끝)에
 *                               고정, 색 #FFD700 — "선 하나"가 아니라 두 edge 위치/색 reference.
 *   커브 4종 모두 세로 중간(y=256)에서도 폭 154px 유지 확인(직선 보간, 워프 아님).
 *
 * *** 중요 — 파일명 left/right는 실제 게임 진행 방향과 반대로 붙어 있음(실측 확인) ***
 * road-segments.js는 "entry(bottom, y=511, 화면 아래=출발 쪽) → exit(top, y=0, 화면 위=도착
 * 쪽)" 순서로 도로를 이어 붙인다(§4). 그런데 road_curve_left_soft.png는 entry(bottom)=97.5,
 * exit(top)=127.5 — entry→exit 방향(=게임에서 실제로 달리는 방향)으로 보면 x가 +30(오른쪽)
 * 이동한다. 즉 이 파일은 "이미지를 위에서 아래로 읽을 때(그림을 그릴 때의 시선 방향)" 왼쪽으로
 * 굽어 보이도록 이름 붙여진 것이지, "차가 그 위를 달릴 때" 왼쪽으로 굽는 게 아니다. 그래서 아래
 * SEGMENT_TYPES는 게임 내 실제 체감 방향(leftSoft = 달리면 실제로 왼쪽으로 굽어 보임)을
 * 기준으로 이름 붙이고, 파일명과 다르게 매핑한다(이미지 자체는 좌우 비대칭 디테일이 없는 순수
 * 도로 형태라 라벨만 바꿔도 안전 — 이미지를 반전(mirror)하지 않음, §6 방향 반전 금지와 무관). */
(function () {
  'use strict';
  const DRIVING = window.DRIVING;

  const BASE = 'assets/02_도로주행/road/road_assets/';
  const FILES = {
    roadStraight: 'road_straight.png',
    roadCurveLeftSoft: 'road_curve_left_soft.png',
    roadCurveRightSoft: 'road_curve_right_soft.png',
    roadCurveLeftSharp: 'road_curve_left_sharp.png',
    roadCurveRightSharp: 'road_curve_right_sharp.png',
    centerLineRef: 'road_center_line.png',
    edgeLineRef: 'road_edge_line.png',
    curbStraight: 'curb_straight.png',
    sidewalkStraight: 'sidewalk_straight.png',
    // 2026-09-30: 커브 보도 경계 4종 추가(사용자가 새로 제공) — road_curve_*.png의 실측
    // 행별(row-by-row) 경계에 맞춰 curb_straight 질감을 재배치해 만든 파일들(별도 오프라인
    // 스크립트 작업, AI 생성 아님). sidewalk_curve_left_sharp.png만 264px가 아니라
    // 270px(왼쪽 14px 패딩) — road_curve_left_sharp.png의 도로 경계가 캔버스 왼쪽 끝에
    // 너무 붙어(로컬 x=3) 표준 폭(256)으로는 밴드가 잘렸던 문제를 해결하려고 캔버스 자체를
    // 넓힌 결과. drawSidewalkTile()이 naturalWidth로 이 차이를 자동 보정한다(하드코딩 없음).
    sidewalkCurveLeftSoft: 'sidewalk_curve_left_soft.png',
    sidewalkCurveRightSoft: 'sidewalk_curve_right_soft.png',
    sidewalkCurveLeftSharp: 'sidewalk_curve_left_sharp.png',
    sidewalkCurveRightSharp: 'sidewalk_curve_right_sharp.png',
  };

  const IMAGES = {};
  Object.keys(FILES).forEach(key => {
    const img = new Image();
    img.src = BASE + FILES[key];
    IMAGES[key] = img;
  });

  const PX_PER_UNIT = 1.0;   // 1 이미지 px = 1 world unit (레거시 road-template.js의 2.0과는 별개 스케일)
  const TILE_W = 256, TILE_H = 512;
  const ROAD_HALF = 77;      // (204-51+1)/2 — 전 타일 공통(커브 포함, 실측 확인)

  /* entryX/exitX: 이미지 로컬 px 좌표(0~256). TOP(y=0)=exit, BOTTOM(y=511)=entry(§4).
   * "leftSoft/rightSoft/leftSharp/rightSharp" = 게임에서 실제로 체감되는 굽는 방향 기준.
   * sidewalkAsset도 asset과 같은 파일 접미사 규칙을 그대로 따른다 — sidewalk_curve_*.png는
   * road_curve_*.png와 1:1로 짝지어(같은 접미사) 그 도로의 실측 경계에 맞춰 재생성됐으므로,
   * "asset이 roadCurveRightSoft면 sidewalkAsset은 sidewalkCurveRightSoft"로 그대로 대응한다. */
  const SEGMENT_TYPES = {
    straight: {
      type: 'straight', asset: 'roadStraight', width: TILE_W, height: TILE_H,
      entryX: 127.5, exitX: 127.5, entryHalf: ROAD_HALF, exitHalf: ROAD_HALF,
    },
    // 2026-10-01: STAGE 1 출발 직선을 "정상 가속 기준 약 1~2초"로 짧게 두기 위한 전용 타입
    // (요청 — 출발하자마자 화면 앞쪽에 첫 커브가 보여야 함). height만 TILE_H(512)보다 훨씬
    // 짧고 나머지(폭·중심·half)는 straight와 동일 — road-segments.js의 buildRoadSegments/
    // segmentsToRoad는 세그먼트 height를 그대로 읽어 쓰므로 TILE_H 고정값이 아니어도 그대로
    // 동작한다(코스 생성 로직 자체는 바꾸지 않음, 길이 숫자만 다른 straight 변형).
    startStraight: {
      type: 'straight', asset: 'roadStraight', width: TILE_W, height: 180,
      entryX: 127.5, exitX: 127.5, entryHalf: ROAD_HALF, exitHalf: ROAD_HALF,
    },
    // road_curve_right_soft.png 실측: entry=157.5 → exit=127.5 (entry→exit 방향 -30, 왼쪽으로 굽음)
    leftSoft: {
      type: 'leftSoft', asset: 'roadCurveRightSoft', sidewalkAsset: 'sidewalkCurveRightSoft', width: TILE_W, height: TILE_H,
      entryX: 157.5, exitX: 127.5, entryHalf: ROAD_HALF, exitHalf: ROAD_HALF,
    },
    // road_curve_left_soft.png 실측: entry=97.5 → exit=127.5 (+30, 오른쪽으로 굽음)
    rightSoft: {
      type: 'rightSoft', asset: 'roadCurveLeftSoft', sidewalkAsset: 'sidewalkCurveLeftSoft', width: TILE_W, height: TILE_H,
      entryX: 97.5, exitX: 127.5, entryHalf: ROAD_HALF, exitHalf: ROAD_HALF,
    },
    leftSharp: {
      type: 'leftSharp', asset: 'roadCurveRightSharp', sidewalkAsset: 'sidewalkCurveRightSharp', width: TILE_W, height: TILE_H,
      entryX: 175.5, exitX: 127.5, entryHalf: ROAD_HALF, exitHalf: ROAD_HALF,
    },
    // road_curve_left_sharp.png 쪽(sidewalkCurveLeftSharp)이 270px(14px 왼쪽 패딩) 버전 —
    // drawSidewalkTile이 naturalWidth로 자동 처리하므로 여기서 별도 표시 불필요.
    rightSharp: {
      type: 'rightSharp', asset: 'roadCurveLeftSharp', sidewalkAsset: 'sidewalkCurveLeftSharp', width: TILE_W, height: TILE_H,
      entryX: 79.5, exitX: 127.5, entryHalf: ROAD_HALF, exitHalf: ROAD_HALF,
    },
  };

  /* road_center_line.png / road_edge_line.png는 실제 렌더에 그대로 스트레치해서 쓰지 않고
   * (§13~15) 색상·두께·dash 비율 reference로만 쓴다 — 실제 마킹은 map-renderer.js가
   * DRIVING.roadAt() 경로를 따라 vector로 그린다. */
  const CENTER_LINE_STYLE = { color: '#FAFAF8', width: 18, dash: 66, gap: 55 };
  const EDGE_LINE_STYLE = { color: '#FFD700', width: 12 };
  const CURB_COLOR = '#7D8489';
  const SIDEWALK_COLOR = '#D7D9DA';
  const ASPHALT_COLOR = '#535C64'; // road_straight body 샘플 색(참고용, 실제 렌더는 PNG 그대로 사용)

  DRIVING.roadAssets = {
    IMAGES, FILES, BASE, PX_PER_UNIT, TILE_W, TILE_H, ROAD_HALF,
    SEGMENT_TYPES, CENTER_LINE_STYLE, EDGE_LINE_STYLE, CURB_COLOR, SIDEWALK_COLOR, ASPHALT_COLOR,
  };
})();
