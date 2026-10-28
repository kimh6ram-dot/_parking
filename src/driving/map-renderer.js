/* 도로주행 — 단순 평면(flat) 배경/도로 렌더러 (2026-10-01 전면 교체)
 * 2026-09-29~09-30에 만들었던 PNG 타일 기반 ROAD/sidewalk 시스템(세그먼트별 이미지,
 * entry/exit anchor 연결, curb/sidewalk 정합성 보정 등)은 전부 걷어낸다 — 그 PNG 드로잉
 * 코드는 원본 그대로 map-renderer.PNG_BACKUP_20261001.js에 백업해뒀다(복구용, 실제
 * 렌더링에는 더 이상 쓰이지 않음). road-assets.js/road-segments.js는 지우지 않는다 —
 * SEGMENT_TYPES의 폭/길이/entry·exit 좌표 같은 "코스 형태(곡률) 생성용 숫자"는 여전히
 * STAGE 1~3의 buildCourseFromSegments()가 그대로 쓰고 있고(코스 생성 로직 재사용 — 사용자
 * 요청), 그 결과인 stage.road([{y,cx,half},...] 웨이포인트 배열)만 이 파일이 읽는다. PNG
 * 관련 필드(asset/sidewalkAsset/IMAGES)는 더 이상 참조하지 않는다.
 *
 * 디자인: 흰 화면 위에 밝은 회색 도로 + 가는 진회색 경계선 + 가는 회색 점선 차선 하나,
 * 전부 단색 벡터(이미지 없음). 도로/경계선/차선이 전부 같은 DRIVING.roadAt(stage,y) 경로
 * 하나로만 그려지므로(판정에 쓰는 함수와 완전히 동일) 레이어끼리 어긋나거나, 코스 끝(결승선
 * 부근)에서 "타일은 끝났는데 선만 계속 그려지는" 종류의 불일치가 구조적으로 없다 —
 * roadAt()은 마지막 웨이포인트를 넘어가면 그 좌표를 그대로 유지(clamp)하므로 road/경계선/
 * 차선이 전부 "같은 끝 지점에서 같이 직선으로 계속 이어지는" 모양이 되어 자연스럽다.
 *
 * STAGE 1~5 전부 이 함수 하나(renderMap)만 쓴다(stages.js가 전 스테이지에 mapMode:'segments'
 * 지정) — stage.road만 있으면 되므로 신규 모듈형 코스(buildCourseFromSegments)든 레거시
 * 실사 PATH 코스(road-template.js의 buildImageCourse)든 똑같이 그릴 수 있다. */
(function () {
  'use strict';
  const DRIVING = window.DRIVING;

  function worldToScreen(camX, camY, scale, cssW, carScreenY, x, y) {
    return { x: cssW / 2 + (x - camX) * scale, y: carScreenY - (y - camY) * scale };
  }

  /* 참고 디자인 색상 그대로. 도로/차선 색은 흰 배경 위에서 또렷이 보이도록 쓰고, 차량·UI
   * 가독성 때문에 톤을 살짝 조절하진 않았다(원안 그대로도 대비가 충분히 뚜렷함). */
  const COLOR = {
    ground: '#EEEEEE', // 도로 바깥 영역
    road: '#5F6670',   // 플레이 영역(도로) — 2026-10-02: "실제 도로 느낌이 아니라 너무 연하고
                        // 흐리다"는 피드백으로 밝은 회색(#F7F7F7)에서 진한 아스팔트 회색으로
                        // 변경(요청 예시 톤 #5f6670~#6a7078 범위).
    border: '#444444', // 도로 좌우 경계선
    lane: '#F7F7F5',   // 중앙 차선(점선) — 2026-10-02: 진해진 도로 바닥과 대비되도록 흐린
                        // 회색(#888888)에서 선명한 흰색 계열로 변경(요청 예시 톤
                        // #f7f7f5~#ffffff 범위, 톤다운 화이트 선택).
  };

  const STEP = 16; // world unit 샘플 간격 — 커브도 매끈히 보이도록 촘촘히(roadAt과 동일 해상도)

  function renderMap(ctx, stage, camX, camY, scale, cssW, cssH, carScreenY) {
    ctx.fillStyle = COLOR.ground;
    ctx.fillRect(0, 0, cssW, cssH);

    const yBottom = camY - (cssH - carScreenY) / scale - 20;
    const yTop = camY + carScreenY / scale + 20;

    const left = [], right = [];
    for (let y = yBottom; y <= yTop + STEP; y += STEP) {
      const r = DRIVING.roadAt(stage, y);
      left.push(worldToScreen(camX, camY, scale, cssW, carScreenY, r.cx - r.half, y));
      right.push(worldToScreen(camX, camY, scale, cssW, carScreenY, r.cx + r.half, y));
    }

    // 도로 면 — 좌/우 경계 폴리라인을 하나의 폐곡선으로 채운다(이미지 타일 이어붙이기 없음 —
    // 매 프레임 좌표로 직접 계산하므로 구간 연결부에 틈이나 폭 튐이 생길 수 없다).
    ctx.fillStyle = COLOR.road;
    ctx.beginPath();
    right.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    for (let i = left.length - 1; i >= 0; i--) ctx.lineTo(left[i].x, left[i].y);
    ctx.closePath();
    ctx.fill();

    // 좌우 경계선 — 가늘고 또렷한 단색 실선
    ctx.strokeStyle = COLOR.border;
    ctx.lineWidth = Math.max(1.5, 2.2 * scale);
    ctx.lineJoin = 'round';
    ctx.beginPath(); right.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))); ctx.stroke();
    ctx.beginPath(); left.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))); ctx.stroke();

    // 중앙 차선 — 두껍고 각진(끝이 네모난) 점선. 2026-10-02: "훨씬 크고 간격이 넓었으면"
    // 피드백으로 두께(화면 폭의 1%→1.5%)·점선 길이(두께의 7배→9배)·간격(점선 길이의
    // 1배→1.7배)을 전부 키웠다 — 결승선 체커보드보다는 여전히 가늘게 유지한다.
    //
    // 2026-10-01 재수정: ctx.setLineDash()+lineDashOffset 방식은 두 번이나 방향이 틀렸다
    // (1차: 아예 안 흐름, 2차: 반대 방향/차량과 같이 움직이는 느낌 — lineDashOffset을
    // "-yBottom*scale"로 계산했는데, yBottom=camY-상수라 이 식의 camY 계수 부호가 실제
    // 필요한 부호와 반대였다: s(y,t)=(y-yBottom)*scale=y*scale-camY*scale+상수이므로 camY
    // 의존성을 상쇄하려면 offset이 "+camY*scale" 방향이어야 하는데 "-yBottom*scale"은
    // "-camY*scale" 방향이라 부호가 뒤집혀 있었다 — 그 결과 점선이 차량 속도의 2배로
    // 역방향(화면 위, 결승선 쪽)으로 흐르는 것처럼 보였다). canvas의 dash offset 부호/합성
    // 규칙에 더 이상 의존하지 않도록 아예 setLineDash를 쓰지 않고, "각 점선 칸의 시작·끝을
    // 월드 Y 좌표로 직접 계산해서" 출발선/결승선과 완전히 동일한 worldToScreen() 변환 하나로
    // 매 칸을 그린다(§2 요청 — "누적 길이에 따라 고정된 월드 위치에 배치, 공통 카메라
    // 변환으로"). 이러면 점선 위치는 순수하게 "그 칸의 월드 y값"에만 의존하고 camY/시간에는
    // 전혀 의존하지 않아, 방향이 거꾸로 될 여지 자체가 없다(출발선·결승선과 동일한 원리).
    const laneWidth = Math.max(2.5, cssW * 0.015);
    const laneDashW = (laneWidth * 9) / scale;   // world unit으로 환산(두께 비율은 화면에서 그대로 유지)
    const laneGapW = laneDashW * 1.7;
    const cycleW = laneDashW + laneGapW;
    const fineStep = 8; // 커브에서도 칸 내부가 매끈하도록 STEP보다 촘촘히 샘플링

    ctx.strokeStyle = COLOR.lane;
    ctx.lineWidth = laneWidth;
    ctx.lineCap = 'butt';   // 둥근 끝 금지(§1 "각진 점선") — 그림자/블러도 쓰지 않음
    ctx.lineJoin = 'miter';

    // 횡단보도 구간에서는 중앙선을 끊는다(2026-10-02, §1 "중앙선은 횡단보도 안에서 끊어서
    // 겹쳐 보이지 않게") — renderer.js의 crosswalk 렌더(y±9 띠)와 같은 y 범위를 그대로 써서
    // 겹침 판정이 시각적으로 정확히 일치하게 한다.
    const crosswalkBands = (stage.static || []).filter(s => s.type === 'crosswalk').map(s => [s.y - 9, s.y + 9]);
    const inCrosswalkBand = (y0, y1) => crosswalkBands.some(b => y1 > b[0] && y0 < b[1]);

    const dashIndexStart = Math.floor(yBottom / cycleW);
    for (let i = dashIndexStart; ; i++) {
      const dashY0 = i * cycleW;
      const dashY1 = dashY0 + laneDashW;
      if (dashY0 > yTop) break;
      const onY0 = Math.max(dashY0, yBottom), onY1 = Math.min(dashY1, yTop);
      if (onY1 <= onY0) continue;
      if (inCrosswalkBand(onY0, onY1)) continue;
      ctx.beginPath();
      let first = true;
      for (let y = onY0; y < onY1; y += fineStep) {
        const r = DRIVING.roadAt(stage, y);
        const p = worldToScreen(camX, camY, scale, cssW, carScreenY, r.cx, y);
        if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
      }
      const rEnd = DRIVING.roadAt(stage, onY1);
      const pEnd = worldToScreen(camX, camY, scale, cssW, carScreenY, rEnd.cx, onY1);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.stroke();
    }
  }

  DRIVING.mapRenderer = { renderMap };
})();
