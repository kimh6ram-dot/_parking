/* 주차하기 베타 — 스테이지별 레이아웃 생성
 * 1~3단계(후면주차 계열)는 기존 PK.buildLayout(src/game/config.js)을 그대로 재사용하고
 * 시작 위치/장애물만 덧붙인다. 4~5단계(평행주차)는 기존에 없던 완전히 새로운 기하 구조라
 * src/game/config.js를 건드리지 않고 여기서 새로 만든다.
 *
 * 결과 layout 객체는 기존 PK.buildLayout과 같은 필드 모양(W,H,target,neighbors,walls,start,
 * mode.targetHeading)을 맞춰서, PK.physics.buildColliders/PK.physics.step/PK.physics.center 같은
 * 범용 함수를 그대로(읽기 전용) 쓸 수 있게 한다 — 새로 만드는 건 "기하학적 배치"뿐, 물리/충돌은
 * 기존 걸 그대로 신뢰한다. */
(function () {
  'use strict';

  const PK = window.PK;
  const PB = (window.PB = window.PB || {});

  // ---------- 1~3단계: 기존 행(row) 레이아웃 재사용 + 시작위치/장애물만 추가 ----------
  function buildRowLayout(vehicle, modeId, rowOpts) {
    const layout = PK.buildLayout(vehicle, modeId);
    layout.type = 'row';
    if (rowOpts && rowOpts.start) {
      const s = rowOpts.start;
      layout.start = {
        x: Math.round(layout.W * s.x),
        y: Math.round(layout.H * s.y),
        heading: s.heading,
      };
    }
    if (rowOpts && rowOpts.obstacles) {
      const list = rowOpts.obstacles.map((o, i) => {
        const cx = Math.round(layout.W * o.xRel), cy = Math.round(layout.H * o.yRel);
        return { id: 'obstacle-' + i, cx, cy, r: o.r, x: cx - o.r, y: cy - o.r, w: o.r * 2, h: o.r * 2 };
      });
      layout.obstacles = list;
      layout.walls = layout.walls.concat(list.map(o => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h })));
    }
    return layout;
  }

  // ---------- 4~5단계: 평행주차 — 1~3단계와 같은 세로형 월드(PK.WORLD.baseW/baseH)를 그대로
  // 쓴다(화면 프레임을 통일하기 위해 가로형 전용 치수를 따로 두지 않음). 연석을 화면 왼쪽(기본)
  // 또는 오른쪽에 세로로 두고, 그 앞에 세로로 주차된 차량 2대 사이 빈 칸에 후진으로 들어간다.
  // PB.scoring의 along/across 일반화 공식은 targetHeading 값 자체(부호 포함)에 무관하게
  // 성립하므로, 아래 PARK_HEADING을 바꾸는 것만으로 전체 진행 방향(이웃차 방향·시작 위치·
  // 목표 정렬 각도)이 일관되게 같이 뒤집힌다. side/roadWidth 등은 전부 opts로 받아, 오른쪽
  // 배치로 바꾸고 싶으면 호출부(config.js) 데이터만 바꾸면 되고 여기 좌표 계산 자체는 좌우
  // 모두 지원한다.
  // 2026-10-28: 이웃 차량이 "아래"를 보고 있다는 피드백 — π/2(아래)에서 -π/2(위)로 전환.
  // 차체 자체의 스프라이트 회전 로직(src/game/renderer.js, 읽기 전용)은 그대로 두고, 여기
  // 데이터(heading/시작 위치)만 "위로 진입해 위를 보고 주차"하는 동선으로 일관되게 뒤집었다
  // (CSS flip 같은 시각 트릭이 아니라 실제 월드 좌표/각도 자체를 바꾼 것).
  const PARK_HEADING = -Math.PI / 2; // 평행주차 전용 "제대로 주차된" 방향(이웃차·목표 모두 이 각도)
  function buildParallelLayout(vehicle, opts) {
    const side = opts.side || 'left';
    const W = Math.round(PK.WORLD.baseW * vehicle.worldScale);
    const H = Math.round(PK.WORLD.baseH * vehicle.worldScale);
    const margin = Math.round(24 * vehicle.worldScale); // 연석까지 여백(행 타입 topMargin과 같은 역할)
    const roadWidth = Math.round(opts.roadWidth * vehicle.worldScale);

    const bayW = Math.round(vehicle.width * opts.bayWidthRatio);   // 연석 쪽(좁은) 축
    const bayH = Math.round(vehicle.length * opts.bayLengthRatio); // 도로를 따라가는(긴) 축
    const curbX = side === 'left' ? margin : W - margin;
    const bayX = side === 'left' ? curbX : curbX - bayW;
    const bayY = Math.round(H / 2 - bayH / 2);
    const target = { x: bayX, y: bayY, w: bayW, h: bayH, cx: bayX + bayW / 2, cy: bayY + bayH / 2 };

    const gap = Math.round(vehicle.length * 0.06) + 4;
    const nbX = side === 'left' ? curbX + vehicle.width / 2 : curbX - vehicle.width / 2;
    const neighbors = [
      { x: nbX, y: target.y - gap - vehicle.length / 2, heading: PARK_HEADING, vehicle },
      { x: nbX, y: target.y + target.h + gap + vehicle.length / 2, heading: PARK_HEADING, vehicle },
    ];

    const T = 200;
    const walls = [
      { id: 'wall-top', x: -T, y: -T, w: W + 2 * T, h: T },
      { id: 'wall-bottom', x: -T, y: H, w: W + 2 * T, h: T },
    ];
    const roadFar = side === 'left' ? curbX + roadWidth : curbX - roadWidth; // 도로 반대쪽 경계
    const oppT = opts.opposingWall ? Math.round(opts.opposingWall * vehicle.worldScale) : 0;
    if (side === 'left') {
      walls.push({ id: 'wall-curb', x: -T, y: -T, w: T + curbX, h: H + 2 * T }); // x<curbX 막음
      walls.push({ id: 'wall-right', x: W, y: -T, w: T, h: H + 2 * T });
      if (oppT) walls.push({ id: 'wall-opposite', x: roadFar, y: -T, w: oppT, h: H + 2 * T });
    } else {
      walls.push({ id: 'wall-curb', x: curbX, y: -T, w: T + (W - curbX), h: H + 2 * T }); // x>curbX 막음
      walls.push({ id: 'wall-left', x: -T, y: -T, w: T, h: H + 2 * T });
      if (oppT) walls.push({ id: 'wall-opposite', x: roadFar - oppT, y: -T, w: oppT, h: H + 2 * T });
    }

    // 시작 위치: 주차칸보다 진행 방향(=PARK_HEADING, 위쪽) 반대편(아래) — 도로를 따라
    // 올라오다 칸을 지나친 뒤 후진으로 들어오는 전형적인 평행주차 진입 동선을 만든다.
    // vehicle.length는 이미 그 차종의 실제 크기(월드 유닛)라 worldScale을 또 곱하지 않는다 —
    // 곱하면 길이가 긴 차량(버스 등)에서 시작 y가 세계 밖으로 밀려나는 버그가 있었다.
    const alongOffset = opts.startAlongOffset != null ? opts.startAlongOffset * vehicle.worldScale : vehicle.length * 2.2;
    const start = {
      x: Math.round(side === 'left' ? curbX + roadWidth * 0.5 : curbX - roadWidth * 0.5),
      y: Math.round(target.cy + alongOffset),
      heading: PARK_HEADING,
    };

    return {
      type: 'parallel', W, H, side, curbX, roadWidth,
      target, neighbors, walls, start,
      viewSide: 1,
      mode: { targetHeading: PARK_HEADING },
    };
  }

  PB.buildStageLayout = function (stage, vehicle) {
    if (stage.layoutType === 'parallel') return buildParallelLayout(vehicle, stage.parallel);
    return buildRowLayout(vehicle, stage.modeId, stage.rowOpts);
  };
})();
