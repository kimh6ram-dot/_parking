/* 도로주행 — 렌더러 (탑뷰, 전방 스크롤 카메라, 2000년대 탑뷰 웹게임풍 스타일)
 * 차량은 전부 기존 PK.renderer.drawVehicle(주차게임이 쓰는 바로 그 함수)로 그린다 — 새
 * 차량 그림을 만들지 않는다. stage.bgImage가 있으면(§2 — 2026-09-23) 도로 비주얼은 코드로
 * 다시 그리지 않고 road-bg-data.js에 내장된 실제 PNG 템플릿을 그대로 배경으로 스크롤해 그린다
 * (drawBgImage). 없는 스테이지(6~10)는 기존 canvas primitive 드로잉(drawRoad)을 그대로 쓴다.
 * 어느 쪽이든 "판정"은 stage.road(= PNG 스테이지는 road-template.js가 뽑아낸 실측 path/width
 * 데이터)만 쓰고 PNG 픽셀을 런타임에 다시 읽지 않는다 — 장애물/플레이어 차는 항상 별도 레이어로
 * 그 위에 그린다. */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;
  const W = DRIVING.WORLD;

  /* PNG 배경 이미지 프리로드(주차게임 sprites.js와 같은 패턴 — data URI라 tainted canvas 문제 없음,
   * 그래서 결과화면 공유(share.js의 canvas.toBlob)도 그대로 동작한다). */
  const BG_IMAGES = {};
  (function preloadBgImages() {
    const src = window.DRIVING_ROAD_BG || {};
    Object.keys(src).forEach(key => {
      const img = new Image();
      img.src = src[key];
      BG_IMAGES[key] = img;
    });
  })();

  const COLOR = {
    ground: '#DCDDE0', gridLine: '#B9BCC4',
    asphalt: '#585D64', edgeYellow: '#FFC72C', centerWhite: '#FFFFFF', curb: '#3D4046',
    water: '#57B3E3', waterLine: '#8FD6F2',
    rock: '#A9ADB3', rockDark: '#888C92', rockLine: '#6E7278',
    guardrail: '#D3D6DB', guardrailDark: '#9AA0AC',
  };

  /* 2026-10-02: 횡단보도 보행자 PNG(assets/02_도로주행/person.png) — 신호등 미션에서만 쓰는
   * crosswalkPedestrian NPC 전용(다른 NPC 종류는 전부 기존 drawCarAt/drawKickboard 등 그대로,
   * 이 이미지와 무관). 원본 1080×1080, 실측 알파 바운딩박스(여백 제외, tools/png.js로 확인)는
   * x:132~891, y:111~987 — drawImage 소스 crop에 그대로 쓴다. */
  const PERSON_IMG = new Image();
  PERSON_IMG.src = 'assets/02_도로주행/person.png';
  const PERSON_SRC = { sx: 132, sy: 111, sw: 760, sh: 877 };
  const PERSON_TARGET_H = 34; // world unit — 2026-10-02: "너무너무 작아 훨씬 키워줘" 피드백으로
                              // 큰 폭으로 확대(20.4→34, 세단 차폭 35유닛과 비슷한 크기)

  function sizeCanvas(canvas, cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const bw = Math.max(1, Math.round(cssW * dpr)), bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    return dpr;
  }

  /* driving heading(0=+y 전진, 화면상 위쪽)을 PK.renderer.drawVehicle의 로컬 +x=전면 좌표계로
   * 매핑: ctx.rotate(heading - 90deg) 하면 로컬 +x가 정확히 이동 방향(화면 기준)을 향한다.
   * §6 "도로 접지감" — 차체 회전과 무관하게(항상 바로 아래로) 옅은 그림자를 먼저 깔아 차가
   * 배경 위에 얹혀 있는 느낌을 준다. PK.renderer.drawVehicle 자체는 손대지 않는다(주차게임
   * 공용 함수, 읽기 전용). */
  function drawCarShadow(ctx, screenX, screenY, heading, scale, vehicle) {
    ctx.save();
    ctx.translate(screenX, screenY + 2 * scale);
    ctx.rotate(heading - Math.PI / 2);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(20,20,30,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, vehicle.length * 0.52, vehicle.width * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawCarAt(ctx, vehicleId, colorHex, screenX, screenY, heading, scale, opts) {
    const vehicle = window.PK.VEHICLES[vehicleId];
    drawCarShadow(ctx, screenX, screenY, heading, scale, vehicle);
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(heading - Math.PI / 2);
    ctx.scale(scale, scale);
    // 2026-10-01: colorHex를 받아놓고도 PK.renderer.drawVehicle에 opts.body로 전달하지 않아
    // 선택한 색이 실제 플레이에 전혀 반영되지 않던 버그(항상 drawVehicle의 기본값 '#FFFFFF'로
    // 그려짐) — opts.body로 넘긴다(주차게임 renderer.js의 drawVehicleAt/renderPreview와 같은
    // 방식, body는 차체에만 적용되고 창문·타이어·외곽선은 drawVehicle 내부에서 별도 고정색).
    window.PK.renderer.drawVehicle(ctx, vehicle, Object.assign({ lw: 1 / scale, body: colorHex }, opts || {}));
    ctx.restore();
  }

  /* 보행자(횡단보도 신호등 미션 전용) — person.png을 쓴다(§2026-10-02). 차량과 달리 heading만큼
   * 회전시키지 않는다(요청 — "눕거나 회전하지 않게", 항상 서 있는 모습 유지) — 이동 방향에
   * 따라 좌우 반전만 허용한다. 이미지가 아직 로드 전이면(드문 경우) 기존 벡터 placeholder로
   * 폴백해 빈 화면이 뜨지 않게 한다. */
  function drawPedestrian(ctx, sx, sy, scale, walking, heading) {
    if (PERSON_IMG.complete && PERSON_IMG.naturalWidth) {
      ctx.save();
      ctx.translate(sx, sy);
      const dh = PERSON_TARGET_H * scale;
      const dw = dh * (PERSON_SRC.sw / PERSON_SRC.sh);
      if (heading != null && heading < 0) ctx.scale(-1, 1); // 왼쪽으로 이동 중이면 좌우 반전만
      ctx.drawImage(PERSON_IMG, PERSON_SRC.sx, PERSON_SRC.sy, PERSON_SRC.sw, PERSON_SRC.sh, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(sx, sy);
    const r = 6 * scale;
    ctx.fillStyle = '#1A1A2E';
    ctx.beginPath(); ctx.arc(0, -r * 0.7, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = walking ? '#F5C542' : '#8A93A8';
    ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 0.75, r * 1.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  /* 차량용 신호등(§1,§7 — 명확한 RED/GREEN, 최소한의 색상만). 픽셀/미니멀 스타일에 맞춰 작은
   * 검정 하우징 안에 위/아래 두 램프, 켜진 쪽만 발광(글로우)하게 그린다. 화면에서 한눈에 색이
   * 구분돼야 하므로 크게, 대비 확실하게. */
  function drawTrafficLight(ctx, sx, sy, scale, state) {
    ctx.save();
    ctx.translate(sx, sy);
    const w = 7 * scale, h = 15 * scale;
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // 짧은 기둥
    ctx.strokeStyle = '#4A4A55'; ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(0, h / 2 + 6 * scale); ctx.stroke();
    const lampR = 2.6 * scale;
    const drawLamp = (ly, onColor, glowColor, on) => {
      if (on) {
        const g = ctx.createRadialGradient(0, ly, 0, 0, ly, lampR * 2.6);
        g.addColorStop(0, glowColor); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, ly, lampR * 2.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = on ? onColor : '#33333D';
      ctx.beginPath(); ctx.arc(0, ly, lampR, 0, Math.PI * 2); ctx.fill();
    };
    drawLamp(-h * 0.22, '#FF3B3B', 'rgba(255,59,59,0.85)', state === 'RED');
    drawLamp(h * 0.22, '#3BE05C', 'rgba(59,224,92,0.85)', state === 'GREEN');
    ctx.restore();
  }
  /* PLACEHOLDER: 전동킥보드 — 프로젝트에 PNG 없음. 단순 top-down shape(바퀴 2 + 발판) */
  function drawKickboard(ctx, sx, sy, heading, scale) {
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(heading);
    const l = 20 * scale, w = 8 * scale;
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(-l / 2, -w / 2, l, w);
    ctx.fillStyle = '#22C55E';
    ctx.beginPath(); ctx.arc(0, -w * 1.6, Math.max(1.5, w * 0.5), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  /* PLACEHOLDER: 공사 콘 — 단순 원뿔형 원+삼각 */
  function drawCone(ctx, sx, sy, scale) {
    ctx.save(); ctx.translate(sx, sy);
    const r = 5 * scale;
    ctx.fillStyle = '#FF8A00';
    ctx.beginPath(); ctx.moveTo(0, -r * 1.6); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-r * 0.7, -r * 0.1, r * 1.4, r * 0.35);
    ctx.restore();
  }
  function drawSign(ctx, sx, sy, scale, text) {
    ctx.save(); ctx.translate(sx, sy);
    const r = 12 * scale;
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#E5262F'; ctx.lineWidth = Math.max(1.5, 2.4 * scale);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1A1A2E';
    ctx.font = '800 ' + Math.max(9, 13 * scale) + 'px ' + (window.PK.FONT || 'sans-serif');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }
  /* 불법주차 라벨(§16) */
  function drawIllegalLabel(ctx, sx, sy, scale) {
    ctx.save();
    ctx.font = '700 ' + Math.max(9, 10 * scale) + 'px ' + (window.PK.FONT || 'sans-serif');
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const text = '불법 주차중', w = ctx.measureText(text).width + 8;
    const y = sy - 15 * scale;
    ctx.fillStyle = 'rgba(26,26,46,0.82)';
    ctx.fillRect(sx - w / 2, y - 14, w, 16);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, sx, y + 1);
    ctx.restore();
  }

  function worldToScreen(camX, camY, scale, cssW, carScreenY, x, y) {
    return { x: cssW / 2 + (x - camX) * scale, y: carScreenY - (y - camY) * scale };
  }

  /* PNG 배경 도로(2026-09-29 재설계 — §1~5: 실제 제작하신 배경 그림을 "월드 좌표 위에 고정해두고
   * 카메라가 그 일부를 잘라 보여주는" 방식으로 다시 쓴다. road-template.js가 "원본 이미지 아래쪽
   * row일수록 world_y가 작다(=코스 시작에 가깝다)"로 데이터를 뽑아뒀다(world_y = (imgPxH-row)/
   * pxPerUnit) — 세로 방향으로 뒤집지 않고 원본 그대로(top-down 그대로) 그리기만 해도 world_y가
   * 커질수록 화면 위쪽에 온다(나무 등 비대칭 오브젝트가 상하 반전되는 예전 버그의 원인이었던
   * ctx.scale(1,-1) 통째 뒤집기는 쓰지 않는다). */
  function drawMainBg(ctx, img, camX, camY, scale, cssW, cssH, carScreenY, T) {
    const drawScale = scale / T.pxPerUnit;
    const dw = T.imgPxW * drawScale;
    const dh = T.imgPxH * drawScale;
    // row 0(원본 맨 위)은 이 스테이지에서 world_y가 가장 큰 지점(=worldH, 결승에 가장 가까운 점)에 대응한다.
    const origin = worldToScreen(camX, camY, scale, cssW, carScreenY, T.imgOriginWorldX, T.worldH);
    ctx.drawImage(img, origin.x, origin.y, dw, dh);
  }

  /* 출발 전 / 도착 후 버퍼 구간(§5,§11~13,§19 — "도로 본체는 끊기지 않고 계속 이어짐",
   * "선 주변에서 배경 퀄리티가 갑자기 바뀌지 않게"). 예전엔 이 구간을 벡터로 새로 그렸는데(색만
   * PNG에서 뽑아 맞춘 전용 팔레트), 그래도 "그림체가 다르다"는 문제가 남았다 — 근본 원인은
   * "다시 그린 것"이라는 점 자체였다. 이번엔 실제 이미지의 가장자리 한 조각(TILE_WORLD 유닛)을
   * 그대로 잘라(스케일 변경 없이 원래 크기로만) 반복해서 이어붙인다 — 늘이지 않으므로 흐려지지
   * 않고(예전 "60px를 17배 늘여 블러" 버그 재발 방지), 실제 그 그림 그대로라 퀄리티도 100% 동일하다. */
  // 타일을 크게 잡을수록(반복 경계 수가 줄어) 이음매가 덜 보인다 — 대신 방향을 뒤집어
  // 완전히 무이음매로 만들지는 않는다(뒤집으면 나무 등이 위아래 반전되어 보이는 예전 버그가
  // 재발한다, §6). 160유닛 타일 2장이면 320 버퍼를 경계 1개로 덮는다.
  const TILE_WORLD = 160;        // 반복 타일 1장의 세로 길이(world unit)
  const BUFFER_WORLD = 320;      // 출발 전 / 도착 후로 보여줄 버퍼 총 길이(약 0.5~0.6 viewport)
  function drawEdgeTiles(ctx, img, camX, camY, scale, cssW, carScreenY, T, atStart) {
    const drawScale = scale / T.pxPerUnit;
    const tilePx = TILE_WORLD * T.pxPerUnit;
    const reps = Math.ceil(BUFFER_WORLD / TILE_WORLD);
    for (let i = 1; i <= reps; i++) {
      const srcY = atStart ? T.imgPxH - tilePx : 0;
      const dstTopWorld = atStart ? -(i - 1) * TILE_WORLD : T.worldH + i * TILE_WORLD;
      const origin = worldToScreen(camX, camY, scale, cssW, carScreenY, T.imgOriginWorldX, dstTopWorld);
      ctx.drawImage(img, 0, srcY, T.imgPxW, tilePx, origin.x, origin.y, T.imgPxW * drawScale, tilePx * drawScale);
    }
  }

  /* 출발선/도착선(§5,§17~18): 도로 geometry의 일부가 아니라 그 위에 얹는 체커보드 오버레이일
   * 뿐이다 — 이 함수 하나로 시작/도착 둘 다 그린다. 도로 폭(half) 자체는 절대 바꾸지 않는다. */
  function drawCheckerLine(ctx, camX, camY, scale, cssW, carScreenY, y, cx, half) {
    const p = worldToScreen(camX, camY, scale, cssW, carScreenY, 0, y);
    const xL = worldToScreen(camX, camY, scale, cssW, carScreenY, cx - half, y).x;
    const xR = worldToScreen(camX, camY, scale, cssW, carScreenY, cx + half, y).x;
    const bandH = Math.max(4, 8 * scale);
    const sq = Math.max(4, 8 * scale);
    for (let x = xL, i = 0; x < xR; x += sq, i++) {
      ctx.fillStyle = i % 2 === 0 ? '#1A1A2E' : '#FFFFFF';
      ctx.fillRect(x, p.y - bandH, sq, bandH);
    }
    ctx.strokeStyle = '#1A1A2E'; ctx.lineWidth = 1;
    ctx.strokeRect(xL, p.y - bandH, xR - xL, bandH);
  }

  /* 중앙 차선 오버레이(§4 — "간격을 넓혀 더 읽기 쉽게"). 실사 배경 위에도 그대로 얹어서
   * 간격을 코드에서 직접 통제한다(이미지 자체의 점선은 고정이라 간격 조절 불가능). 도로
   * 중심선(roadAt().cx)에 정확히 맞춰 그리므로 실제 이미지의 차선과도 거의 겹친다. */
  function drawCenterLineOverlay(ctx, stage, camX, camY, scale, cssW, cssH, carScreenY) {
    const yBottom = camY - (cssH - carScreenY) / scale - 20;
    const yTop = camY + carScreenY / scale + 20;
    const step = 24;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(2.6, 5 * scale);
    ctx.lineCap = 'round';
    ctx.setLineDash([16 * scale, 58 * scale]); // 기존(스테이지 6~10) 20/42보다 더 성기게
    ctx.beginPath();
    for (let y = yBottom; y <= yTop + step; y += step) {
      const r = DRIVING.roadAt(stage, y);
      const p = worldToScreen(camX, camY, scale, cssW, carScreenY, r.cx, y);
      y === yBottom ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = 'butt';
  }

  function drawBgImage(ctx, stage, camX, camY, scale, cssW, cssH, carScreenY) {
    const img = BG_IMAGES[stage.bgImage];
    if (!img || !img.complete || !img.naturalWidth) return false;
    const T = DRIVING.ROAD_TEMPLATE;
    drawEdgeTiles(ctx, img, camX, camY, scale, cssW, carScreenY, T, true);
    drawMainBg(ctx, img, camX, camY, scale, cssW, cssH, carScreenY, T);
    drawEdgeTiles(ctx, img, camX, camY, scale, cssW, carScreenY, T, false);
    drawCenterLineOverlay(ctx, stage, camX, camY, scale, cssW, cssH, carScreenY);
    return true;
  }

  /* 도로 바깥 인도 폭(world unit) */
  const SIDEWALK_W = 16;
  const FAR = 500; // 화면 밖까지 확실히 덮는 원거리 오프셋(수변/암벽 등 배경 채움용)

  /* 2026-09-22: 이전에 여기 있던 "화면 기준 렌더 거리 clamp"(camY 기준 ±N만 진짜 곡선, 그
   * 밖은 경계값으로 고정 연장)는 제거한다 — camY가 매 프레임 전진하면서 그 "경계값" 자체가
   * 매 프레임 다른 world-y에서 다시 샘플링되기 때문에, 화면 상단부의 고정-연장 구간과 근처의
   * 진짜 커브 구간이 만나는 이음매가 프레임마다 미끄러지며 마치 도로가 실시간으로 휘어지는
   * 것처럼 보이는 원인이었다(실측 확인). 도로는 항상 stage.road(월드 고정 코스)를 그대로
   * 샘플링한다 — 렌더링/충돌 판정이 완전히 같은 값을 본다. */

  /* 0..1 결정론적 해시(시드 고정) — Math.random 대신 사용. 같은 슬롯은 항상 같은 결과를
   * 내야 매 프레임 다시 그려도(캐시 없이) 배경이 떨리지 않는다. */
  function hash01(n) {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  /* 테마별 roadside 구성. special이 있으면 그 side는 인도 대신 물/암벽으로 치환된다(§19~20). */
  const THEMES = {
    URBAN: { decor: ['tree', 'lamp', 'building', 'drain', 'building', 'hedge'], special: null },
    RESIDENTIAL: { decor: ['house', 'fence', 'tree', 'hedge', 'house', 'lamp'], special: null },
    PARK: { decor: ['tree', 'tree', 'bench', 'hedge', 'tree', 'drain'], special: null },
    RIVERSIDE: { decor: ['tree', 'bench', 'lamp', 'hedge', 'drain'], special: { side: -1, kind: 'water' } },
    MOUNTAIN: { decor: ['rock', 'tree', 'rock', 'lamp'], special: { side: 1, kind: 'mountain' } },
  };

  function drawRoad(ctx, stage, camX, camY, scale, cssW, cssH, carScreenY) {
    const theme = THEMES[stage.theme] || THEMES.URBAN;
    // screenY = carScreenY - (y-camY)*scale 이므로: 화면 맨 아래(screenY=cssH)는
    // y=camY-(cssH-carScreenY)/scale(뒤쪽, 적은 구간), 화면 맨 위(screenY=0)는
    // y=camY+carScreenY/scale(앞쪽, carScreenYFrac이 클수록 훨씬 넓은 구간) — 예전 코드는 이 둘이
    // 뒤바뀌어 있었다(화면 위쪽이 실제로는 거의 안 그려져 "위쪽에 빈 회색 공간"으로 보이던
    // 원인). 2026-09-22 수정.
    const yBottom = camY - (cssH - carScreenY) / scale - 20;
    const yTop = camY + carScreenY / scale + 20;
    const step = 24;

    ctx.fillStyle = COLOR.ground;
    ctx.fillRect(0, 0, cssW, cssH);
    // 인도 격자 타일 느낌: world 기준 가로줄+세로줄(도로 그리기 전에 깔아서 차도가 덮게 함).
    // 세로줄까지 있어야 좌우로 조향할 때도 배경이 같이 스크롤되는 느낌이 분명해진다.
    ctx.strokeStyle = COLOR.gridLine; ctx.lineWidth = Math.max(0.6, 0.8 * scale);
    ctx.beginPath();
    for (let y = Math.floor(yBottom / 40) * 40; y <= yTop; y += 40) {
      const p = worldToScreen(camX, camY, scale, cssW, carScreenY, 0, y);
      ctx.moveTo(0, p.y); ctx.lineTo(cssW, p.y);
    }
    const gx0 = Math.floor((camX - W.viewHalfWidth) / 40) * 40;
    const gx1 = camX + W.viewHalfWidth + 40;
    for (let x = gx0; x <= gx1; x += 40) {
      const a = worldToScreen(camX, camY, scale, cssW, carScreenY, x, yBottom);
      const b = worldToScreen(camX, camY, scale, cssW, carScreenY, x, yTop);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    const rightRoad = [], leftRoad = [], rightWalk = [], leftWalk = [], rightFar = [], leftFar = [];
    for (let y = yBottom; y <= yTop + step; y += step) {
      const r = DRIVING.roadAt(stage, y);
      rightRoad.push(worldToScreen(camX, camY, scale, cssW, carScreenY, r.cx + r.half, y));
      leftRoad.push(worldToScreen(camX, camY, scale, cssW, carScreenY, r.cx - r.half, y));
      rightWalk.push(worldToScreen(camX, camY, scale, cssW, carScreenY, r.cx + r.half + SIDEWALK_W, y));
      leftWalk.push(worldToScreen(camX, camY, scale, cssW, carScreenY, r.cx - r.half - SIDEWALK_W, y));
      rightFar.push(worldToScreen(camX, camY, scale, cssW, carScreenY, r.cx + r.half + FAR, y));
      leftFar.push(worldToScreen(camX, camY, scale, cssW, carScreenY, r.cx - r.half - FAR, y));
    }
    const band = (edge, outer) => {
      ctx.beginPath();
      edge.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      for (let i = outer.length - 1; i >= 0; i--) ctx.lineTo(outer[i].x, outer[i].y);
      ctx.closePath(); ctx.fill();
    };

    // 특수 사이드(강변 물 / 산길 암벽) — 인도 대신 바깥쪽 전체를 채운다
    [-1, 1].forEach(side => {
      if (!theme.special || theme.special.side !== side) return;
      const walk = side === 1 ? rightWalk : leftWalk;
      const far = side === 1 ? rightFar : leftFar;
      ctx.fillStyle = theme.special.kind === 'water' ? COLOR.water : COLOR.rock;
      band(walk, far);
      if (theme.special.kind === 'mountain') {
        // 암벽 질감: 등고선 느낌의 옅은 라인 몇 개
        ctx.strokeStyle = COLOR.rockLine; ctx.lineWidth = Math.max(0.8, 1 * scale);
        for (let k = 1; k <= 3; k++) {
          ctx.beginPath();
          walk.forEach((p, i) => {
            const f = far[i];
            const t = k / 4;
            const x = p.x + (f.x - p.x) * t, y = p.y + (f.y - p.y) * t;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          });
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = COLOR.waterLine; ctx.lineWidth = Math.max(0.8, 1 * scale);
        ctx.setLineDash([6 * scale, 10 * scale]);
        ctx.beginPath();
        walk.forEach((p, i) => { const f = far[i]; const x = (p.x + f.x) / 2, y = (p.y + f.y) / 2; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        ctx.stroke(); ctx.setLineDash([]);
      }
    });

    // 인도(일반 사이드) — 격자 라인 위에 옅게 덮어 도로 경계와의 경계를 부드럽게
    ctx.fillStyle = 'rgba(222,223,227,0.9)';
    if (!theme.special || theme.special.side !== 1) band(rightRoad, rightWalk);
    if (!theme.special || theme.special.side !== -1) band(leftRoad, leftWalk);

    // 차도(아스팔트)
    ctx.fillStyle = COLOR.asphalt;
    ctx.beginPath();
    rightRoad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    for (let i = leftRoad.length - 1; i >= 0; i--) ctx.lineTo(leftRoad[i].x, leftRoad[i].y);
    ctx.closePath(); ctx.fill();

    // 노란 차선 경계(도로 안쪽으로 살짝 인셋) + 연석
    const yellowW = Math.max(2.2, 4.5 * scale);
    ctx.strokeStyle = COLOR.edgeYellow; ctx.lineWidth = yellowW;
    ctx.lineJoin = 'round';
    ctx.beginPath(); rightRoad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))); ctx.stroke();
    ctx.beginPath(); leftRoad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))); ctx.stroke();
    // 강변 쪽은 가드레일, 그 외에는 연석선
    ctx.lineWidth = Math.max(1, 1.4 * scale);
    [-1, 1].forEach(side => {
      const pts = side === 1 ? rightWalk : leftWalk;
      if (theme.special && theme.special.side === side) {
        ctx.strokeStyle = COLOR.guardrailDark;
        ctx.beginPath(); pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))); ctx.stroke();
        // 가드레일 포스트(짧은 세로 표시) + 강변이면 다이아몬드 반사판 대신 단순 포스트만
        for (let i = 0; i < pts.length; i += 5) {
          const p = pts[i];
          ctx.fillStyle = COLOR.guardrail;
          ctx.fillRect(p.x - yellowW * 0.4, p.y - yellowW * 0.9, yellowW * 0.8, yellowW * 1.8);
        }
      } else {
        ctx.strokeStyle = COLOR.curb;
        ctx.beginPath(); pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))); ctx.stroke();
      }
    });

    // 중앙 흰색 점선 — 참고 PNG 템플릿처럼 성기게(§1: 대시는 조금 더 길게, 간격은 훨씬 넓게)
    ctx.strokeStyle = COLOR.centerWhite; ctx.lineWidth = Math.max(2.6, 5.2 * scale);
    ctx.lineCap = 'round';
    ctx.setLineDash([20 * scale, 42 * scale]);
    ctx.beginPath();
    for (let y = yBottom; y <= yTop + step; y += step) {
      const r = DRIVING.roadAt(stage, y);
      const p = worldToScreen(camX, camY, scale, cssW, carScreenY, r.cx, y);
      y === yBottom ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = 'butt';
  }

  function drawDecorTree(ctx, sx, sy, scale, dark) {
    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle = '#B9AF9C';
    ctx.fillRect(-0.9 * scale, 0, 1.8 * scale, 5 * scale);
    ctx.fillStyle = dark ? '#6E9A63' : '#93BB86';
    ctx.beginPath(); ctx.arc(0, -2.5 * scale, 6.5 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = Math.max(0.6, 0.8 * scale);
    ctx.stroke();
    ctx.restore();
  }
  function drawDecorLamppost(ctx, sx, sy, scale) {
    ctx.save(); ctx.translate(sx, sy);
    ctx.strokeStyle = '#9AA0AC'; ctx.lineWidth = Math.max(1, 1.4 * scale);
    ctx.beginPath(); ctx.moveTo(0, 9 * scale); ctx.lineTo(0, -5 * scale); ctx.stroke();
    ctx.fillStyle = '#F1D48A';
    ctx.beginPath(); ctx.arc(0, -6.2 * scale, 2 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawDecorBuilding(ctx, sx, sy, scale) {
    ctx.save(); ctx.translate(sx, sy);
    const hw = 10 * scale, hh = 8 * scale;
    ctx.fillStyle = '#E7E8EC'; ctx.strokeStyle = '#C7C9CF'; ctx.lineWidth = Math.max(1, 1.1 * scale);
    ctx.fillRect(-hw, -hh, hw * 2, hh * 2); ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
    ctx.fillStyle = '#8A93A8';
    ctx.fillRect(-hw * 0.55, -hh * 0.5, hw * 0.35, hh * 0.4);
    ctx.fillRect(hw * 0.2, -hh * 0.5, hw * 0.35, hh * 0.4);
    ctx.restore();
  }
  function drawDecorHouse(ctx, sx, sy, scale, roofRed) {
    ctx.save(); ctx.translate(sx, sy);
    const hw = 9 * scale, hh = 8 * scale;
    ctx.fillStyle = roofRed ? '#D96B4E' : '#B7BEC7';
    ctx.fillRect(-hw, -hh, hw * 2, hh * 1.1);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = Math.max(0.6, 0.8 * scale);
    ctx.strokeRect(-hw, -hh, hw * 2, hh * 1.1);
    ctx.fillStyle = '#F1EFE9';
    ctx.fillRect(-hw * 0.75, hh * 0.15, hw * 1.5, hh * 0.75);
    ctx.fillStyle = '#5B5F66';
    ctx.fillRect(-hw * 0.2, hh * 0.35, hw * 0.4, hh * 0.4);
    ctx.restore();
  }
  function drawDecorFence(ctx, sx, sy, scale) {
    ctx.save(); ctx.translate(sx, sy);
    ctx.strokeStyle = '#B9AF9C'; ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.beginPath(); ctx.moveTo(-9 * scale, 0); ctx.lineTo(9 * scale, 0); ctx.stroke();
    for (let x = -8; x <= 8; x += 4) { ctx.beginPath(); ctx.moveTo(x * scale, 3 * scale); ctx.lineTo(x * scale, -3 * scale); ctx.stroke(); }
    ctx.restore();
  }
  function drawDecorHedge(ctx, sx, sy, scale) {
    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle = '#7DAE72'; ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = Math.max(0.6, 0.8 * scale);
    const w = 12 * scale, h = 6 * scale, r = 2.4 * scale;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -h / 2); ctx.lineTo(w / 2 - r, -h / 2); ctx.arcTo(w / 2, -h / 2, w / 2, -h / 2 + r, r);
    ctx.lineTo(w / 2, h / 2 - r); ctx.arcTo(w / 2, h / 2, w / 2 - r, h / 2, r);
    ctx.lineTo(-w / 2 + r, h / 2); ctx.arcTo(-w / 2, h / 2, -w / 2, h / 2 - r, r);
    ctx.lineTo(-w / 2, -h / 2 + r); ctx.arcTo(-w / 2, -h / 2, -w / 2 + r, -h / 2, r);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawDecorBench(ctx, sx, sy, scale) {
    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle = '#A9744F'; ctx.strokeStyle = '#5B5F66'; ctx.lineWidth = Math.max(0.7, 0.9 * scale);
    for (let i = 0; i < 3; i++) {
      const y = (-3 + i * 3) * scale;
      ctx.fillRect(-6 * scale, y, 12 * scale, 1.4 * scale);
      ctx.strokeRect(-6 * scale, y, 12 * scale, 1.4 * scale);
    }
    ctx.restore();
  }
  function drawDecorDrain(ctx, sx, sy, scale) {
    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle = '#B7BEC7'; ctx.strokeStyle = '#8A93A8'; ctx.lineWidth = Math.max(0.6, 0.8 * scale);
    const s = 6 * scale;
    ctx.fillRect(-s / 2, -s / 2, s, s); ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = '#6E7278';
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * s * 0.3, -s / 2); ctx.lineTo(i * s * 0.3, s / 2); ctx.stroke(); }
    ctx.restore();
  }
  function drawDecorRock(ctx, sx, sy, scale, big) {
    ctx.save(); ctx.translate(sx, sy);
    const r = (big ? 7.5 : 5) * scale;
    ctx.fillStyle = COLOR.rock; ctx.strokeStyle = COLOR.rockLine; ctx.lineWidth = Math.max(0.7, 0.9 * scale);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, rr = r * (0.8 + hash01(i * 3.1 + sx * 0.001 + sy * 0.001) * 0.3);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.85;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /* 요소별 크기 배율(§20 — 차량 폭 대비 나무 0.7~1.2배/가로등 0.25~0.4배/벤치 0.5~0.8배 등을
   * 맞추기 위해 draw 함수 자체의 매직넘버 대신 여기서 한 번에 조정한다). */
  const DECOR_SCALE = { tree: 2.2, lamp: 1.5, building: 1.3, house: 1.3, fence: 1.3, hedge: 1.4, bench: 1.5, drain: 1.2, rock: 1.6 };
  const DECOR_DRAW = {
    tree: (ctx, p, s, seed) => drawDecorTree(ctx, p.x, p.y, s * DECOR_SCALE.tree, hash01(seed + 21) < 0.4),
    lamp: (ctx, p, s) => drawDecorLamppost(ctx, p.x, p.y, s * DECOR_SCALE.lamp),
    building: (ctx, p, s) => drawDecorBuilding(ctx, p.x, p.y, s * DECOR_SCALE.building),
    house: (ctx, p, s, seed) => drawDecorHouse(ctx, p.x, p.y, s * DECOR_SCALE.house, hash01(seed + 23) < 0.5),
    fence: (ctx, p, s) => drawDecorFence(ctx, p.x, p.y, s * DECOR_SCALE.fence),
    hedge: (ctx, p, s) => drawDecorHedge(ctx, p.x, p.y, s * DECOR_SCALE.hedge),
    bench: (ctx, p, s) => drawDecorBench(ctx, p.x, p.y, s * DECOR_SCALE.bench),
    drain: (ctx, p, s) => drawDecorDrain(ctx, p.x, p.y, s * DECOR_SCALE.drain),
    rock: (ctx, p, s, seed) => drawDecorRock(ctx, p.x, p.y, s * DECOR_SCALE.rock, hash01(seed + 25) < 0.4),
  };

  /* 도로 바깥 배경 요소 — 월드 좌표에 결정론적으로 배치하고 카메라 기준으로 그리므로 도로/
   * 차선과 완전히 같은 속도로 스크롤된다. §9(패럴랙스)는 구현 복잡도 대비 이득이 적어 생략.
   * 안쪽 줄(인도 바로 옆)과 바깥쪽 줄(뷰포트 가장자리 쪽) 2겹으로 채워서 예전처럼 "인도 바로
   * 옆에만 작은 요소 몇 개, 나머지는 텅 빈 회색"이 되지 않게 한다(§4). */
  const DECOR_SPACING = 64;
  function drawDecorRing(ctx, stage, theme, camX, camY, scale, cssW, cssH, carScreenY, side, distExtra, spacingOffset) {
    const yBottom = camY - (cssH - carScreenY) / scale - 40;
    const yTop = camY + carScreenY / scale + 40;
    const isSpecial = theme.special && theme.special.side === side;
    const i0 = Math.floor(yBottom / DECOR_SPACING) - 1;
    const i1 = Math.floor(yTop / DECOR_SPACING) + 1;
    for (let i = i0; i <= i1; i++) {
      const slotY = i * DECOR_SPACING + DECOR_SPACING / 2;
      if (slotY < yBottom || slotY > yTop) continue;
      const seed = i * 7 + side * 131 + stage.id * 991 + spacingOffset * 4001;
      const h = hash01(seed);
      if (h < 0.08) continue; // 가끔 빈 자리를 둬서 너무 기계적인 반복을 피한다
      const jitterY = (hash01(seed + 3) - 0.5) * 20;
      const jitterX = (hash01(seed + 5) - 0.5) * 8;
      const y = slotY + jitterY;
      const r = DRIVING.roadAt(stage, y);
      const dist = (isSpecial ? SIDEWALK_W + 26 : SIDEWALK_W + 9) + distExtra;
      const baseX = r.cx + side * (r.half + dist) + jitterX;
      const p = worldToScreen(camX, camY, scale, cssW, carScreenY, baseX, y);
      if (isSpecial && theme.special.kind === 'mountain') {
        const kinds = ['rock', 'tree', 'rock'];
        DECOR_DRAW[kinds[Math.floor(h * kinds.length) % kinds.length]](ctx, p, scale, seed);
        continue;
      }
      if (isSpecial) continue; // 강변 쪽(물)은 장식 없음 — 가드레일만
      const list = theme.decor;
      const type = list[Math.floor(h * list.length) % list.length];
      DECOR_DRAW[type](ctx, p, scale, seed);
    }
  }
  function drawRoadsideDecor(ctx, stage, camX, camY, scale, cssW, cssH, carScreenY) {
    const theme = THEMES[stage.theme] || THEMES.URBAN;
    [-1, 1].forEach(side => {
      drawDecorRing(ctx, stage, theme, camX, camY, scale, cssW, cssH, carScreenY, side, 0, 0);
      drawDecorRing(ctx, stage, theme, camX, camY, scale, cssW, cssH, carScreenY, side, 34, 1);
    });
  }

  function drawDestination(ctx, stage, camX, camY, scale, cssW, carScreenY) {
    const d = stage.destination;
    drawCheckerLine(ctx, camX, camY, scale, cssW, carScreenY, d.y1, d.cx, d.half);
  }
  /* 출발선(§5) — drawDestination과 완전히 같은 체커보드 오버레이를 코스 시작(y=0)에 얹는다. */
  function drawStartLine(ctx, stage, camX, camY, scale, cssW, carScreenY) {
    const s = DRIVING.roadAt(stage, 0);
    drawCheckerLine(ctx, camX, camY, scale, cssW, carScreenY, 0, s.cx, s.half);
  }

  function drawStatic(ctx, s, camX, camY, scale, cssW, carScreenY) {
    if (s.type === 'parkedCar' || s.type === 'workVehicle') {
      const p = worldToScreen(camX, camY, scale, cssW, carScreenY, s.x, s.y);
      const colorHex = window.PK.COLORS[s.colorId].body;
      drawCarAt(ctx, s.vehicleId, colorHex, p.x, p.y, s.heading || 0, scale);
      if (s.illegalParked) drawIllegalLabel(ctx, p.x, p.y, scale);
    } else if (s.type === 'cone') {
      const p = worldToScreen(camX, camY, scale, cssW, carScreenY, s.x, s.y);
      drawCone(ctx, p.x, p.y, scale);
    } else if (s.type === 'sign') {
      const p = worldToScreen(camX, camY, scale, cssW, carScreenY, s.x, s.y);
      drawSign(ctx, p.x, p.y, scale, s.text);
    } else if (s.type === 'stopLine') {
      const a = worldToScreen(camX, camY, scale, cssW, carScreenY, s.x0, s.y);
      const b = worldToScreen(camX, camY, scale, cssW, carScreenY, s.x1, s.y);
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(3, 6 * scale);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (s.type === 'crosswalk') {
      const stripeW = 10 * scale, gap = 8 * scale;
      for (let x = s.x0; x < s.x1; x += (stripeW + gap) / scale) {
        const a = worldToScreen(camX, camY, scale, cssW, carScreenY, x, s.y - 9);
        const b = worldToScreen(camX, camY, scale, cssW, carScreenY, x, s.y + 9);
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = stripeW;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  }

  /* 차선변경 NPC 깜빡이(§1 — 시각 강화, 2026-09-23). 실제 차선 변경(drift) 전 신호(signal)
   * 단계부터 켜서 "이제 들어오겠다"가 미리 보이게 한다. 전/후면 둘 다, 점 하나가 아니라
   * 발광(radial gradient) + 밝은 코어로 눈에 띄게 표현하고, 0.4초 주기로 on/off한다. */
  function drawBlinker(ctx, sx, sy, scale, t, dir, vehicleLength) {
    if (Math.floor(t / 0.4) % 2 !== 0) return;
    const half = (vehicleLength || 60) * 0.42;
    [1, -1].forEach(end => {
      const bx = sx + dir * 7.5 * scale;
      const by = sy - end * half * scale;
      ctx.save();
      const glowR = 7 * scale;
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, glowR);
      grad.addColorStop(0, 'rgba(255,178,32,0.95)');
      grad.addColorStop(0.45, 'rgba(255,178,32,0.5)');
      grad.addColorStop(1, 'rgba(255,178,32,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(bx, by, glowR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFC94D';
      ctx.beginPath(); ctx.arc(bx, by, 2.6 * scale, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  function drawNpc(ctx, o, camX, camY, scale, cssW, carScreenY) {
    if (!DRIVING.obstacles.isVisible(o)) return;
    const p = worldToScreen(camX, camY, scale, cssW, carScreenY, o.x, o.y);
    if (o.kind === 'dash') {
      if (o.phase === 'telegraph') { ctx.save(); ctx.globalAlpha = 0.55 + 0.35 * Math.sin(o.phaseT * 40); drawKickboard(ctx, p.x, p.y, 0, scale); ctx.restore(); }
      else drawKickboard(ctx, p.x, p.y, o.phaseHeading || Math.PI / 2, scale);
      return;
    }
    if (o.kind === 'crosswalkPedestrian') {
      const lp = worldToScreen(camX, camY, scale, cssW, carScreenY, o.lightX, o.lightY);
      drawTrafficLight(ctx, lp.x, lp.y, scale, o.light || 'GREEN');
      if (o.phase !== 'CLEARED') drawPedestrian(ctx, p.x, p.y, scale, o.phase === 'CROSSING', o.heading);
      return;
    }
    const colorHex = window.PK.COLORS[o.colorId].body;
    if (o.brakeLight) {
      const back = worldToScreen(camX, camY, scale, cssW, carScreenY, o.x, o.y - window.PK.VEHICLES[o.vehicleId].length * 0.5 - 2);
      ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#E5262F';
      ctx.beginPath(); ctx.arc(back.x, back.y, 7 * scale, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    drawCarAt(ctx, o.vehicleId, colorHex, p.x, p.y, o.heading || 0, scale);
    if (o.kind === 'laneChange' && (o.phase === 'signal' || o.phase === 'drift')) {
      const dir = (o.ev && o.ev.holdX > o.ev.x0) ? 1 : -1;
      drawBlinker(ctx, p.x, p.y, scale, o.blinkT || 0, dir, window.PK.VEHICLES[o.vehicleId].length);
    }
  }

  function drawRain(ctx, cssW, cssH, t) {
    ctx.save();
    ctx.strokeStyle = 'rgba(140,160,200,0.35)';
    ctx.lineWidth = 1;
    const off = (t * 260) % 22;
    for (let x = -40; x < cssW + 40; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x + off, -10);
      ctx.lineTo(x + off - 10, 26);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 2026-09-23 카메라 전면 개편(§1~4,16~18): camX는 더 이상 car.x를 따라가지 않는다 —
   * stage.camX(스테이지 시작 전 한 번만 계산되는 고정값, config.js/stages.js)만 쓴다. camY만
   * car.y를 따라 전진 방향으로 움직인다("Y translation only"). 도로·배경·NPC·정적 오브젝트가
   * 전부 이 하나의 (camX 고정, camY만 전진) 변환 아래서 그려지므로, 플레이어가 조향해도 세상은
   * 좌우로 흔들리지 않고 플레이어 차량 자체만 화면 안에서 실제로 좌우로 움직인다(§17 — 차량은
   * worldToScreen(car.x)로 실제 위치에 그린다, 화면 중앙에 재고정하지 않는다). */
  function renderStage(canvas, cssW, cssH, stage, car, colorHex, npcs, now) {
    const dpr = sizeCanvas(canvas, cssW, cssH);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = cssW / (2 * W.viewHalfWidth);
    const carScreenY = cssH * W.carScreenYFrac;
    const camX = stage.camX || 0;
    if (stage.mapMode === 'segments') {
      // 2026-09-29 신규 모듈형 맵(§17 LAYER 0~3) — road-assets.js/road-segments.js/
      // map-renderer.js. 레거시 두 분기(bgImage/vector)는 절대 건드리지 않는다.
      DRIVING.mapRenderer.renderMap(ctx, stage, camX, car.y, scale, cssW, cssH, carScreenY);
    } else if (stage.bgImage) {
      ctx.fillStyle = COLOR.ground; ctx.fillRect(0, 0, cssW, cssH); // 이미지가 아직 로드 전일 때만 잠깐 보이는 대체 채움(§11~13: 실제 코스 밖 구간은 이제 이미지가 타일링되어 채운다)
      drawBgImage(ctx, stage, camX, car.y, scale, cssW, cssH, carScreenY);
    } else {
      drawRoad(ctx, stage, camX, car.y, scale, cssW, cssH, carScreenY);
      drawRoadsideDecor(ctx, stage, camX, car.y, scale, cssW, cssH, carScreenY);
    }
    drawStartLine(ctx, stage, camX, car.y, scale, cssW, carScreenY);
    drawDestination(ctx, stage, camX, car.y, scale, cssW, carScreenY);
    (stage.static || []).forEach(s => drawStatic(ctx, s, camX, car.y, scale, cssW, carScreenY));
    npcs.forEach(o => drawNpc(ctx, o, camX, car.y, scale, cssW, carScreenY));
    const carScreen = worldToScreen(camX, car.y, scale, cssW, carScreenY, car.x, car.y);
    drawCarAt(ctx, car.vehicleId, colorHex, carScreen.x, carScreen.y, car.heading, scale, { steer: car.steer, reversing: car.reversing });
    if (stage.rain) drawRain(ctx, cssW, cssH, now || 0);
    return scale;
  }

  /* INTRO 미리보기: 밝은 회색 도로 + 중앙 차선 + 하단 차량 PNG + 위로 이어지는 도로 */
  function renderIntroPreview(canvas, cssW, cssH, vehicleId, colorHex) {
    const dpr = sizeCanvas(canvas, cssW, cssH);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLOR.ground; ctx.fillRect(0, 0, cssW, cssH);
    const roadW = cssW * 0.6, x0 = (cssW - roadW) / 2;
    ctx.fillStyle = COLOR.asphalt; ctx.fillRect(x0, 0, roadW, cssH);
    ctx.strokeStyle = COLOR.edgeYellow; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, cssH); ctx.moveTo(x0 + roadW, 0); ctx.lineTo(x0 + roadW, cssH); ctx.stroke();
    ctx.strokeStyle = COLOR.centerWhite; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.setLineDash([20, 40]);
    ctx.beginPath(); ctx.moveTo(cssW / 2, -6); ctx.lineTo(cssW / 2, cssH + 6); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
    const v = window.PK.VEHICLES[vehicleId || 'sedan'];
    const scale = Math.min(roadW * 0.5 / v.width, cssH * 0.32 / v.length);
    drawCarAt(ctx, vehicleId || 'sedan', colorHex || window.PK.COLORS.blue.body, cssW / 2, cssH * 0.74, 0, scale);
  }

  /* 결과/공유용 스냅샷: 최종 위치 주변 도로를 크롭 */
  function snapshot(stage, car, colorHex, npcs, px, aspect) {
    aspect = aspect || 1;
    const size = px || 720, sizeH = Math.round(size / aspect);
    const cnv = document.createElement('canvas');
    cnv.width = size; cnv.height = sizeH;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, size, sizeH);
    const scale = size / (2 * W.viewHalfWidth) * 1.15;
    const carScreenY = sizeH * 0.6;
    if (stage.mapMode === 'segments') {
      DRIVING.mapRenderer.renderMap(ctx, stage, car.x, car.y, scale, size, sizeH, carScreenY);
    } else if (stage.bgImage) {
      drawBgImage(ctx, stage, car.x, car.y, scale, size, sizeH, carScreenY);
    } else {
      drawRoad(ctx, stage, car.x, car.y, scale, size, sizeH, carScreenY);
      drawRoadsideDecor(ctx, stage, car.x, car.y, scale, size, sizeH, carScreenY);
    }
    const d = stage.destination;
    if (car.y > d.y0 - 260) drawDestination(ctx, stage, car.x, car.y, scale, size, carScreenY);
    (npcs || []).forEach(o => drawNpc(ctx, o, car.x, car.y, scale, size, carScreenY));
    drawCarAt(ctx, car.vehicleId, colorHex, size / 2, carScreenY, car.heading, scale, { steer: car.steer });
    return cnv;
  }

  DRIVING.renderer = { renderStage, renderIntroPreview, snapshot, drawCarAt, worldToScreen };
})();
