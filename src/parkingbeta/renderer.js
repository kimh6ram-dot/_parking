/* 주차하기 베타 — 렌더러 (src/game/renderer.js는 건드리지 않는다)
 * PK.renderer.drawScene은 "가로로 늘어선 세로 주차칸 한 줄" 모양을 하드코딩하고 있어
 * (칸 구분선을 항상 세로로, 연석을 항상 맨 위 가로줄로 그림) 평행주차처럼 아예 다른 모양의
 * 레이아웃에는 그대로 쓸 수 없다. 그래서 장면 그리기(drawSceneBeta)는 새로 만들고,
 * 차량 1대를 그리는 PK.renderer.drawVehicleAt/fitView/sizeCanvas처럼 모양에 무관한 저수준
 * 함수만 그대로(읽기 전용) 재사용한다. */
(function () {
  'use strict';

  const PK = window.PK;
  const PB = (window.PB = window.PB || {});
  const C = PK.PALETTE;

  /* STAGE 3 장애물 에셋(쇼핑카트). assets/01_주차/는 기존 주차게임과 공유하는 에셋 폴더지만
   * 여기선 이 PNG 파일을 읽기 전용으로 로드만 할 뿐, 기존 주차게임 쪽 파일/동작은 전혀
   * 건드리지 않는다. CART_SRC는 투명 여백을 뺀 실제 그림 영역(알파 바운딩 박스, tools/png.js로
   * 실측) — 렌더 크기(CART_DISPLAY_W)와 충돌 반경(obstacles[].r, config.js에서 설정)은 서로
   * 다른 상수로 분리되어 있다 — 렌더링 영역이 충돌 영역보다 커서, 가장자리 얇은 돌출부는
   * 보이지만 실제로 부딪히진 않는다.
   * 2026-10-28: 처음엔 너무 작아 보여(28유닛, 승용차 폭 35의 80%) 확대 — 승용차 보이는
   * 폭(35)의 약 1.1배인 38로. 2026-10-28(2차): 그래도 작다는 피드백 — 당시 실제 표시 크기(38)
   * 기준 가로세로 200%인 76으로 재확대. 2026-10-28(3차): 파일(쇼핑카트.png)이 새 이미지로
   * 교체됨 — 원본 1254×1254 중 알파 바운딩박스 (325,282)~(928,1019)(폭604×높이738, tools/png.js
   * 재실측)로 CART_SRC 갱신. 2026-10-28(4차): 바뀐 이미지가 너무 크다는 피드백 — 76의 절반인
   * 38로 축소(승용차 폭 35와 비슷한 크기, 2차 확대 이전 수준으로 복귀). */
  const CART_IMG = new Image();
  CART_IMG.src = 'assets/01_주차/쇼핑카트.png';
  const CART_SRC = { sx: 325, sy: 282, sw: 604, sh: 738 };
  const CART_DISPLAY_W = 38; // 월드 유닛(가로, 알파 바운딩박스 기준)

  function drawObstacle(ctx, o, lw) {
    if (CART_IMG.complete && CART_IMG.naturalWidth) {
      const dw = CART_DISPLAY_W, dh = CART_DISPLAY_W * (CART_SRC.sh / CART_SRC.sw);
      ctx.save();
      ctx.imageSmoothingEnabled = false; // 픽셀아트 원본 그대로(흐려짐 방지)
      ctx.drawImage(CART_IMG, CART_SRC.sx, CART_SRC.sy, CART_SRC.sw, CART_SRC.sh,
        o.cx - dw / 2, o.cy - dh / 2, dw, dh);
      ctx.restore();
    } else {
      // 로드 전 아주 짧은 순간의 대체 표시(장식 없이 최소한만)
      ctx.beginPath();
      ctx.arc(o.cx, o.cy, o.r, 0, Math.PI * 2);
      ctx.fillStyle = '#DDDDDD';
      ctx.fill();
      ctx.lineWidth = lw * 1.2;
      ctx.strokeStyle = C.outline;
      ctx.stroke();
    }
  }

  function drawRowScene(ctx, layout, lw) {
    const { top, bays } = layout;
    ctx.strokeStyle = C.bayLine;
    ctx.lineWidth = lw * 2;
    ctx.beginPath();
    for (let i = 0; i <= bays.length; i++) {
      const x = bays[0].x + i * bays[0].w;
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + bays[0].h);
    }
    ctx.stroke();
    const lastBay = bays[bays.length - 1];
    ctx.strokeStyle = C.curb;
    ctx.lineWidth = lw * 3;
    ctx.beginPath();
    ctx.moveTo(bays[0].x - lw, top);
    ctx.lineTo(lastBay.x + lastBay.w + lw, top);
    ctx.stroke();
  }

  /* 평행주차 장면 — 1~3단계 주차선 디자인(짧은 구획선 + 뒤쪽 가로선, 도로 전체를 가로지르는
   * 긴 선 없음, 진입하는 쪽은 열려 있음)을 90도 돌려 그대로 적용한다. 행 타입의 "칸 수+1개
   * 세로 구분선 + 맨 위 연석 가로줄"과 정확히 같은 구조: 구분선 4개(위 이웃차 바깥쪽 끝 ·
   * 위 이웃차/목표 칸 경계 · 목표 칸/아래 이웃차 경계 · 아래 이웃차 바깥쪽 끝)가 연석에서
   * 목표 칸 폭만큼만 뻗어나가고(도로까지 안 닿음 = 진입로 쪽은 열려 있음), 연석 자체가
   * "뒤쪽 가로선" 역할을 한다. 장식용 도로 중앙/반대편 선은 그리지 않는다(5단계의 반대편
   * 벽은 장식이 아니라 실제 충돌 벽이라 유지). */
  function drawParallelScene(ctx, layout, lw) {
    const { H, curbX, side, target } = layout;
    const nbN = layout.neighbors[0], nbS = layout.neighbors[1];
    const vLen = nbN.vehicle.length;
    const laneDepth = target.w;
    const farX = side === 'left' ? curbX + laneDepth : curbX - laneDepth;
    const yTop = nbN.y - vLen / 2, yBottom = nbS.y + vLen / 2;

    ctx.strokeStyle = C.bayLine;
    ctx.lineWidth = lw * 2;
    ctx.beginPath();
    [yTop, target.y, target.y + target.h, yBottom].forEach(y => { ctx.moveTo(curbX, y); ctx.lineTo(farX, y); });
    ctx.stroke();

    // 연석(뒤쪽 가로선에 해당) — 화면 전체가 아니라 이 3칸 구간만큼만
    ctx.strokeStyle = C.curb;
    ctx.lineWidth = lw * 3;
    ctx.beginPath();
    ctx.moveTo(curbX, yTop);
    ctx.lineTo(curbX, yBottom);
    ctx.stroke();

    // 맞은편 벽(5단계의 실제 충돌 경계 — 장식이 아니므로 유지)
    const opp = layout.walls.find(w => w.id === 'wall-opposite');
    if (opp) {
      ctx.fillStyle = C.neighborBody;
      ctx.fillRect(opp.x, opp.y < 0 ? 0 : opp.y, opp.w, Math.min(opp.h, H));
      ctx.strokeStyle = C.curb;
      ctx.lineWidth = lw * 2;
      ctx.beginPath();
      const edgeX = side === 'left' ? opp.x : opp.x + opp.w;
      ctx.moveTo(edgeX, 0);
      ctx.lineTo(edgeX, H);
      ctx.stroke();
    }
  }

  /* 주차장/도로 + 이웃 차량 + 장애물 + 사용자 차량. ctx는 월드 좌표로 변환된 상태. */
  function drawSceneBeta(ctx, layout, car, colorHex, lw, now) {
    ctx.fillStyle = C.floor;
    ctx.fillRect(0, 0, layout.W, layout.H);

    if (layout.type === 'parallel') drawParallelScene(ctx, layout, lw);
    else drawRowScene(ctx, layout, lw);

    ctx.strokeStyle = C.lotBorder;
    ctx.lineWidth = lw;
    ctx.strokeRect(lw / 2, lw / 2, layout.W - lw, layout.H - lw);

    (layout.obstacles || []).forEach(o => drawObstacle(ctx, o, lw));

    layout.neighbors.forEach(nb => {
      PK.renderer.drawVehicleAt(ctx, nb.vehicle, nb.x, nb.y, nb.heading, {
        body: C.neighborBody, glass: C.neighborGlass, lw,
      });
    });

    if (car) {
      const c = PK.physics.center(car);
      PK.renderer.drawVehicleAt(ctx, car.vehicle, c.x, c.y, car.heading, {
        body: colorHex, steer: car.steer, reversing: car.reversing, lw,
      });
      const hit = car.lastHitInfo;
      if (hit && now !== undefined && now - hit.t < 0.45) {
        const size = 13 * lw;
        ctx.font = '800 ' + size + 'px ' + PK.FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = lw * 3;
        ctx.strokeStyle = '#FFFFFF';
        ctx.fillStyle = '#000000';
        const label = hit.strong ? '쾅' : '툭';
        ctx.strokeText(label, hit.x, hit.y);
        ctx.fillText(label, hit.x, hit.y);
      }
    }
  }

  function renderStage(canvas, cssW, cssH, layout, car, colorHex, now) {
    const dpr = PK.renderer.sizeCanvas(canvas, cssW, cssH);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const view = { x: 0, y: 0, w: layout.W, h: layout.H };
    const f = PK.renderer.fitView(cssW, cssH, view);
    ctx.setTransform(dpr * f.s, 0, 0, dpr * f.s, dpr * f.ox, dpr * f.oy);
    drawSceneBeta(ctx, layout, car, colorHex, 1 / f.s, now);
    return f;
  }

  /* 결과/공유용 스냅샷 — bays/viewSide 같은 행(row) 전용 필드에 의존하지 않고 target+이웃+
   * 차량의 바운딩 박스로 크롭 범위를 계산한다(행/평행 레이아웃 모두에 동일하게 동작). */
  function snapshot(layout, car, colorHex, px, aspect) {
    aspect = aspect || 1;
    const pad = 22;
    let x0 = layout.target.x - pad, y0 = layout.target.y - pad;
    let x1 = layout.target.x + layout.target.w + pad, y1 = layout.target.y + layout.target.h + pad;
    (layout.neighbors || []).forEach(nb => {
      const r = Math.hypot(nb.vehicle.length / 2, nb.vehicle.width / 2);
      x0 = Math.min(x0, nb.x - r); y0 = Math.min(y0, nb.y - r);
      x1 = Math.max(x1, nb.x + r); y1 = Math.max(y1, nb.y + r);
    });
    if (car) {
      PK.physics.corners(PK.physics.obbOf(car)).forEach(p => {
        x0 = Math.min(x0, p.x - pad); y0 = Math.min(y0, p.y - pad);
        x1 = Math.max(x1, p.x + pad); y1 = Math.max(y1, p.y + pad);
      });
    }
    let vw = x1 - x0, vh = y1 - y0;
    if (vw / vh < aspect) vw = vh * aspect; else vh = vw / aspect;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const view = { x: cx - vw / 2, y: cy - vh / 2, w: vw, h: vh };
    if (vh <= layout.H) view.y = Math.max(0, Math.min(layout.H - vh, view.y));
    if (vw <= layout.W) view.x = Math.max(0, Math.min(layout.W - vw, view.x));
    const size = px || 720;
    const sizeH = Math.round(size / aspect);
    const cnv = document.createElement('canvas');
    cnv.width = size; cnv.height = sizeH;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, sizeH);
    const f = PK.renderer.fitView(size, sizeH, view);
    ctx.setTransform(f.s, 0, 0, f.s, f.ox, f.oy);
    drawSceneBeta(ctx, layout, car, colorHex, 1 / f.s);
    return cnv;
  }

  function renderIntro(canvas, cssW, cssH) {
    const v = PK.VEHICLES.sedan;
    const layout = PB.buildStageLayout(PB.STAGES[0], v); // 1단계(가장 쉬운 칸)로 소개
    const car = PK.physics.createCar(v, {
      x: layout.target.cx + 68, y: layout.top + layout.target.h + 16, heading: Math.PI / 2 + 0.42,
    });
    car.steer = -0.4;
    car.reversing = true;
    const dpr = PK.renderer.sizeCanvas(canvas, cssW, cssH);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const b0 = layout.bays[0], b2 = layout.bays[2];
    const view = { x: b0.x - 56, y: layout.top - 12, w: (b2.x + b2.w) - b0.x + 112, h: 0 };
    view.h = view.w * (cssH / cssW);
    const f = PK.renderer.fitView(cssW, cssH, view);
    ctx.setTransform(dpr * f.s, 0, 0, dpr * f.s, dpr * f.ox, dpr * f.oy);
    drawSceneBeta(ctx, layout, car, PK.COLORS.blue.body, 1 / f.s);
  }

  PB.renderer = { renderStage, snapshot, renderIntro };
})();
