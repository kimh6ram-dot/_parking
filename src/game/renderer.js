/* 주차하기 — 렌더러 (단순 2D 탑뷰 차량 실루엣 4종 · 주차장 · 스냅샷)
 * 차량 로컬 좌표: +x = 앞, +y = 오른쪽. 중심 (0,0). */
(function () {
  'use strict';

  const PK = window.PK;
  const C = PK.PALETTE;

  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /* 사다리꼴 (x0 < x1). w0 = x0 쪽 폭, w1 = x1 쪽 폭 */
  function trap(ctx, x0, x1, w0, w1) {
    ctx.beginPath();
    ctx.moveTo(x0, -w0 / 2);
    ctx.lineTo(x1, -w1 / 2);
    ctx.lineTo(x1, w1 / 2);
    ctx.lineTo(x0, w0 / 2);
    ctx.closePath();
  }

  function wheelSpecs(v) {
    const hl = v.length / 2, hw = v.width / 2;
    const rearAxle = -hl + v.rearOverhang;
    const frontAxle = rearAxle + v.wheelBase;
    const wl = v.width * 0.3, ww = v.width * 0.15;
    const yOut = hw - ww * 0.25;
    const list = [
      { x: frontAxle, y: -yOut, wl, ww, steer: true },
      { x: frontAxle, y: yOut, wl, ww, steer: true },
    ];
    if (v.id === 'truck') {
      const d = wl * 0.62;
      [-d, d].forEach(off => {
        list.push({ x: rearAxle + off, y: -yOut, wl, ww, steer: false });
        list.push({ x: rearAxle + off, y: yOut, wl, ww, steer: false });
      });
    } else {
      const bigger = v.id === 'bus' ? 1.15 : 1;
      list.push({ x: rearAxle, y: -yOut, wl: wl * bigger, ww, steer: false });
      list.push({ x: rearAxle, y: yOut, wl: wl * bigger, ww, steer: false });
    }
    return list;
  }

  function drawWheels(ctx, v, steer) {
    ctx.fillStyle = C.wheel;
    wheelSpecs(v).forEach(w => {
      ctx.save();
      ctx.translate(w.x, w.y);
      if (w.steer) ctx.rotate(steer);
      ctx.fillRect(-w.wl / 2, -w.ww / 2, w.wl, w.ww);
      ctx.restore();
    });
  }

  /* 후진등: 스프라이트 테일램프 안쪽에 흰 점 (살짝 강조) */
  function drawReverseLights(ctx, v, lw) {
    const L = v.length, W = v.width, hl = L / 2, hw = W / 2;
    const rw = Math.max(1.8, L * 0.05), rh = Math.max(2.2, W * 0.12);
    const x = -hl + L * 0.04, yIn = hw - W * 0.38;
    ctx.fillStyle = C.reverseLight;
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = (lw || 1) * 0.75;
    ctx.fillRect(x, -yIn - rh, rw, rh); ctx.strokeRect(x, -yIn - rh, rw, rh);
    ctx.fillRect(x, yIn, rw, rh); ctx.strokeRect(x, yIn, rw, rh);
  }

  /* 차량 1대. ctx는 이미 중심·heading으로 변환된 상태.
   * opts: { body, glass, steer, reversing, lw } */
  function drawVehicle(ctx, v, opts) {
    const L = v.length, W = v.width, hl = L / 2, hw = W / 2;
    const lw = opts.lw || 1;
    const body = opts.body || '#FFFFFF';
    const glass = opts.glass || C.glass;
    const steer = opts.steer || 0;
    ctx.lineWidth = lw;
    ctx.strokeStyle = C.outline;
    ctx.lineJoin = 'round';

    // 바퀴 (차체 아래): 앞바퀴는 조향각만큼 돌아감
    drawWheels(ctx, v, steer);

    // 에셋 스프라이트(assets/*.png, 선택 색으로 착색)가 준비됐으면 그것을 우선 사용
    const sp = PK.sprites && PK.sprites.get(v.id, body);
    if (sp) {
      const meta = PK.sprites.meta(v.id);
      const lenPx = meta.front === 'up' ? meta.bbox.h : meta.bbox.w;
      const s = L / lenPx;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (meta.front === 'up') ctx.rotate(Math.PI / 2); // 스프라이트의 위(앞) → 로컬 +x(앞)
      ctx.scale(s, s);
      ctx.drawImage(sp, -(meta.bbox.x + meta.bbox.w / 2), -(meta.bbox.y + meta.bbox.h / 2));
      ctx.restore();
      if (opts.reversing) drawReverseLights(ctx, v, lw);
      return;
    }

    ctx.fillStyle = body;
    if (v.id === 'sedan') {
      rrect(ctx, -hl, -hw, L, W, W * 0.2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = glass;
      trap(ctx, hl - L * 0.44, hl - L * 0.27, W * 0.8, W * 0.62); ctx.fill();
      trap(ctx, -hl + L * 0.15, -hl + L * 0.28, W * 0.6, W * 0.78); ctx.fill();
      const sx0 = hl - L * 0.44, sx1 = -hl + L * 0.28;
      ctx.fillRect(sx1, -hw + W * 0.08, sx0 - sx1, W * 0.06);
      ctx.fillRect(sx1, hw - W * 0.14, sx0 - sx1, W * 0.06);
    } else if (v.id === 'compact') {
      rrect(ctx, -hl, -hw, L, W, W * 0.3);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = glass;
      trap(ctx, hl - L * 0.52, hl - L * 0.3, W * 0.82, W * 0.62); ctx.fill();
      trap(ctx, -hl + L * 0.1, -hl + L * 0.27, W * 0.7, W * 0.8); ctx.fill();
      const sx0 = hl - L * 0.52, sx1 = -hl + L * 0.27;
      ctx.fillRect(sx1, -hw + W * 0.08, sx0 - sx1, W * 0.06);
      ctx.fillRect(sx1, hw - W * 0.14, sx0 - sx1, W * 0.06);
    } else if (v.id === 'truck') {
      const cabL = L * 0.27, gap = L * 0.025;
      rrect(ctx, -hl, -hw, L - cabL - gap, W, 1.5);
      ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = lw;
      const bx0 = -hl, bx1 = hl - cabL - gap;
      [1 / 3, 2 / 3].forEach(f => {
        const x = bx0 + (bx1 - bx0) * f;
        ctx.beginPath(); ctx.moveTo(x, -hw + 1.5); ctx.lineTo(x, hw - 1.5); ctx.stroke();
      });
      ctx.restore();
      const cw = W * 0.88;
      ctx.fillStyle = body;
      rrect(ctx, hl - cabL, -cw / 2, cabL, cw, W * 0.14);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = glass;
      trap(ctx, hl - cabL * 0.62, hl - cabL * 0.22, cw * 0.82, cw * 0.7); ctx.fill();
    } else if (v.id === 'bus') {
      rrect(ctx, -hl, -hw, L, W, W * 0.16);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = glass;
      trap(ctx, hl - L * 0.1, hl - L * 0.02, W * 0.8, W * 0.74); ctx.fill();
      ctx.fillRect(-hl + L * 0.02, -W * 0.34, L * 0.04, W * 0.68);
      ctx.fillRect(-hl + L * 0.09, -hw + W * 0.07, L * 0.8, W * 0.06);
      ctx.fillRect(-hl + L * 0.09, hw - W * 0.13, L * 0.8, W * 0.06);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      [-L * 0.2, L * 0.16].forEach(x => {
        ctx.fillRect(x - W * 0.17, -W * 0.15, W * 0.34, W * 0.3);
        ctx.strokeRect(x - W * 0.17, -W * 0.15, W * 0.34, W * 0.3);
      });
    }

    // 앞/뒤 구분: 헤드라이트(앞) · 테일램프(뒤, 최소한의 빨강) · 후진등(후진 중)
    const lx = hl - 0.6;
    const lightW = Math.max(1.6, L * 0.045), lightH = Math.max(2.2, W * 0.16);
    const edgeIn = v.id === 'truck' ? W * 0.11 : W * 0.09;
    ctx.lineWidth = lw * 0.75;
    ctx.strokeStyle = C.outline;
    ctx.fillStyle = C.headlight;
    ctx.fillRect(lx - lightW, -hw + edgeIn, lightW, lightH);
    ctx.fillRect(lx - lightW, hw - edgeIn - lightH, lightW, lightH);
    ctx.strokeRect(lx - lightW, -hw + edgeIn, lightW, lightH);
    ctx.strokeRect(lx - lightW, hw - edgeIn - lightH, lightW, lightH);

    const tx = -hl + 0.6;
    ctx.fillStyle = C.taillight;
    ctx.fillRect(tx, -hw + edgeIn, lightW, lightH);
    ctx.fillRect(tx, hw - edgeIn - lightH, lightW, lightH);
    ctx.strokeRect(tx, -hw + edgeIn, lightW, lightH);
    ctx.strokeRect(tx, hw - edgeIn - lightH, lightW, lightH);
    if (opts.reversing) {
      const rx = tx + lightW + 0.8, rw = lightW * 0.9;
      ctx.fillStyle = C.reverseLight;
      ctx.fillRect(rx, -hw + edgeIn, rw, lightH);
      ctx.fillRect(rx, hw - edgeIn - lightH, rw, lightH);
      ctx.strokeRect(rx, -hw + edgeIn, rw, lightH);
      ctx.strokeRect(rx, hw - edgeIn - lightH, rw, lightH);
    }
    ctx.lineWidth = lw;
  }

  function drawVehicleAt(ctx, v, x, y, heading, opts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    drawVehicle(ctx, v, opts);
    ctx.restore();
  }

  /* 주차장 + 이웃 차량 + 사용자 차량. ctx는 월드 좌표로 변환된 상태. lw = 화면 1px에 해당하는 월드 길이 */
  function drawScene(ctx, layout, car, colorHex, lw, now) {
    const { W, H, top, bays } = layout;
    ctx.fillStyle = C.floor;
    ctx.fillRect(0, 0, W, H);
    // 주차선
    ctx.strokeStyle = C.bayLine;
    ctx.lineWidth = lw * 2;
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const x = bays[0].x + i * bays[0].w;
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + bays[0].h);
    }
    ctx.stroke();
    // 연석(뒤 벽)
    ctx.strokeStyle = C.curb;
    ctx.lineWidth = lw * 3;
    ctx.beginPath();
    ctx.moveTo(bays[0].x - lw, top);
    ctx.lineTo(bays[2].x + bays[2].w + lw, top);
    ctx.stroke();
    // 주차장 외곽
    ctx.strokeStyle = C.lotBorder;
    ctx.lineWidth = lw;
    ctx.strokeRect(lw / 2, lw / 2, W - lw, H - lw);

    layout.neighbors.forEach(nb => {
      drawVehicleAt(ctx, nb.vehicle, nb.x, nb.y, nb.heading, {
        body: C.neighborBody, glass: C.neighborGlass, lw,
      });
    });

    if (car) {
      const c = PK.physics.center(car);
      drawVehicleAt(ctx, car.vehicle, c.x, c.y, car.heading, {
        body: colorHex, steer: car.steer, reversing: car.reversing, lw,
      });
      // 충돌 피드백: 짧은 "툭" / "쾅"
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

  /* 캔버스에 view(월드 사각형)를 맞춰 그리기 위한 변환값 */
  function fitView(cssW, cssH, view) {
    const s = Math.min(cssW / view.w, cssH / view.h);
    const ox = (cssW - view.w * s) / 2 - view.x * s;
    const oy = (cssH - view.h * s) / 2 - view.y * s;
    return { s, ox, oy };
  }

  function sizeCanvas(canvas, cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    return dpr;
  }

  /* 플레이 스테이지 렌더 (월드 전체를 캔버스에 맞춤) */
  function renderStage(canvas, cssW, cssH, layout, car, colorHex, now) {
    const dpr = sizeCanvas(canvas, cssW, cssH);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const view = { x: 0, y: 0, w: layout.W, h: layout.H };
    const f = fitView(cssW, cssH, view);
    ctx.setTransform(dpr * f.s, 0, 0, dpr * f.s, dpr * f.ox, dpr * f.oy);
    drawScene(ctx, layout, car, colorHex, 1 / f.s, now);
    return f;
  }

  /* 결과/공유용 스냅샷: 주차칸 줄 + 차량을 포함한 크롭 → 오프스크린 캔버스.
   * aspect = 가로/세로 (기본 1 = 정사각). 결과 화면은 가로형(1.6)으로 높이를 아낀다 */
  function snapshot(layout, car, colorHex, px, aspect) {
    aspect = aspect || 1;
    const pad = 22;
    const b0 = layout.bays[0], b2 = layout.bays[2];
    let x0 = b0.x - pad, y0 = layout.top - pad;
    let x1 = b2.x + b2.w + pad, y1 = layout.top + b0.h + pad * 1.6;
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
    // 크롭이 주차장 밖(흰 여백)으로 나가지 않게 가능한 범위에서 안으로 밀어 넣는다
    if (vh <= layout.H) view.y = Math.max(0, Math.min(layout.H - vh, view.y));
    if (vw <= layout.W) view.x = Math.max(0, Math.min(layout.W - vw, view.x));
    const size = px || 720;
    const sizeH = Math.round(size / aspect);
    const cnv = document.createElement('canvas');
    cnv.width = size; cnv.height = sizeH;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, sizeH);
    const f = fitView(size, sizeH, view);
    ctx.setTransform(f.s, 0, 0, f.s, f.ox, f.oy);
    drawScene(ctx, layout, car, colorHex, 1 / f.s);
    return cnv;
  }

  /* 선택 화면용 미리보기: 차량 1대를 가로(앞이 오른쪽)로 캔버스에 맞춰 */
  function renderPreview(canvas, vehicle, colorHex, opts) {
    opts = opts || {};
    const cssW = opts.w || canvas.clientWidth || 240;
    const cssH = opts.h || canvas.clientHeight || 120;
    const dpr = sizeCanvas(canvas, cssW, cssH);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const padX = opts.padX == null ? 14 : opts.padX;
    const padY = opts.padY == null ? 10 : opts.padY;
    const s = opts.scale || Math.min((cssW - padX * 2) / vehicle.length, (cssH - padY * 2) / vehicle.width);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * cssW / 2, dpr * cssH / 2);
    drawVehicle(ctx, vehicle, { body: colorHex, glass: opts.glass, lw: 1 / s, steer: 0 });
  }

  /* 인트로 대표 비주얼: 주차칸 + 이웃 차량 + 후진 중인 승용차 (게임과 같은 오브젝트) */
  function renderIntro(canvas, cssW, cssH) {
    const v = PK.VEHICLES.sedan;
    const layout = PK.buildLayout(v, 'reverse');
    const car = PK.physics.createCar(v, {
      x: layout.target.cx + 68, y: layout.top + layout.target.h + 16, heading: Math.PI / 2 + 0.42,
    });
    car.steer = -0.4;
    car.reversing = true;
    const dpr = sizeCanvas(canvas, cssW, cssH);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const b0 = layout.bays[0], b2 = layout.bays[2];
    // 가로형 슬롯(1.6:1)에 주차칸 3칸 + 후진 중인 차가 모두 들어오도록 조금 넓게
    const view = { x: b0.x - 56, y: layout.top - 12, w: (b2.x + b2.w) - b0.x + 112, h: 0 };
    view.h = view.w * (cssH / cssW);
    const f = fitView(cssW, cssH, view);
    ctx.setTransform(dpr * f.s, 0, 0, dpr * f.s, dpr * f.ox, dpr * f.oy);
    drawScene(ctx, layout, car, PK.COLORS.blue.body, 1 / f.s);
  }

  PK.FONT = '"Pretendard Variable", Pretendard, -apple-system, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
  PK.renderer = { drawVehicle, drawVehicleAt, drawScene, renderStage, snapshot, renderPreview, renderIntro, fitView, sizeCanvas };
})();
