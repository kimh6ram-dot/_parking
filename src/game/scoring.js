/* 주차하기 — 채점 (100점: 중앙 정렬 25 · 각도 25 · 좌우 간격 20 · 충돌 15 · 주차 시간 10 · 마무리 5)
 * 모든 점수는 실제 최종 위치·heading·주차칸 중심 거리·좌우 여백·충돌 횟수·소요 시간·마지막 정차 상태로 계산한다.
 * Math.random() 사용 금지. */
(function () {
  'use strict';

  const PK = window.PK;
  const MAX = PK.SCORE_MAX;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 데드존(dead)까지는 감점 없음, 그 뒤 range 동안 0→1로 증가
  const ramp = (e, dead, range) => clamp((e - dead) / range, 0, 1);

  function wrapDeg(d) {
    while (d > 180) d -= 360;
    while (d <= -180) d += 360;
    return d;
  }

  /* ctx: { car, layout, parked(bool), timedOut(bool), parkedAt(s), elapsed(s), history: [{t, speed, steer, hit}], restAt(s) } */
  function evaluate(ctx) {
    const { car, layout } = ctx;
    const v = car.vehicle;
    const t = layout.target;
    const c = PK.physics.center(car);
    const inside = c.x >= t.x && c.x <= t.x + t.w && c.y >= t.y && c.y <= t.y + t.h;
    const parts = { center: 0, angle: 0, gap: 0, collision: 0, time: 0, finish: 0 };
    const flags = { inside, noseIn: false, timedOut: !!ctx.timedOut, parked: !!ctx.parked };

    // ---- 충돌 15: 약한 접촉 -4, 세게 충돌 -7 (0 미만 clamp) ----
    const hits = PK.physics.hitCounts(car);
    parts.collision = clamp(MAX.collision - hits.weak * 4 - hits.strong * 7, 0, MAX.collision);

    if (inside) {
      // ---- 중앙 정렬 25: 주차칸 중심과 차량 중심 거리 (좌우 75% · 앞뒤 25%) ----
      const ex = Math.abs(c.x - t.cx) / v.width;
      const ey = Math.abs(c.y - t.cy) / v.length;
      const centerErr = 0.75 * ramp(ex, 0.06, 0.32) + 0.25 * ramp(ey, 0.06, 0.45);
      parts.center = Math.round(MAX.center * (1 - clamp(centerErr, 0, 1)));

      // ---- 각도 25: 주차칸 세로축 vs heading. 앞머리가 통로 쪽(아래)이어야 후면주차 ----
      const err = Math.abs(wrapDeg((car.heading - layout.mode.targetHeading) * 180 / Math.PI));
      flags.noseIn = err > 90;
      flags.angleErr = err;
      parts.angle = flags.noseIn ? 0
        : Math.round(MAX.angle * Math.pow(1 - ramp(err, 1, 16), 1.15));

      // ---- 좌우 간격 20: 차체 좌우 끝과 양쪽 주차선 거리의 차이 + 선 침범 감점 ----
      const pts = PK.physics.corners(PK.physics.obbOf(car));
      let minX = Infinity, maxX = -Infinity;
      pts.forEach(p => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; });
      const gapL = minX - t.x, gapR = (t.x + t.w) - maxX;
      const diff = Math.abs(gapL - gapR) / v.width;
      const minGap = Math.min(gapL, gapR) / v.width;
      const crossPen = clamp(-minGap / 0.25, 0, 1) * 10;
      parts.gap = Math.round(clamp(MAX.gap * (1 - ramp(diff, 0.12, 0.45)) - crossPen, 0, MAX.gap));
      flags.gapL = gapL; flags.gapR = gapR;
    }

    if (flags.parked && !flags.timedOut) {
      // ---- 주차 시간 10: 10초 이내 10 → 30초 2 (선형) ----
      const s = ctx.parkedAt;
      parts.time = s <= 10 ? MAX.time : Math.round(clamp(MAX.time - (s - 10) * 0.4, 2, MAX.time));

      // ---- 마무리 5: 천천히 부드럽게 멈춤 · 마지막 순간 전후진 반복/급조향/충돌 없음 ----
      const hist = ctx.history || [];
      const restAt = ctx.restAt != null ? ctx.restAt : ctx.parkedAt;
      let peak = 0, flips = 0, steerRev = 0, hitNear = false, prevSign = 0, prevSteerSign = 0;
      for (const h of hist) {
        const dt = restAt - h.t;
        if (dt < 0) continue;
        if (dt <= 0.8) peak = Math.max(peak, Math.abs(h.speed));
        if (dt <= 2.5) {
          const sg = Math.sign(h.speed);
          if (sg !== 0 && prevSign !== 0 && sg !== prevSign) flips++;
          if (sg !== 0) prevSign = sg;
        }
        if (dt <= 1.5) {
          const ss = Math.abs(h.steer) > 12 * Math.PI / 180 ? Math.sign(h.steer) : 0;
          if (ss !== 0 && prevSteerSign !== 0 && ss !== prevSteerSign) steerRev++;
          if (ss !== 0) prevSteerSign = ss;
        }
        if (dt <= 1.0 && h.hit) hitNear = true;
      }
      const pen1 = clamp((peak / v.maxRev - 0.4) / 0.6, 0, 1) * 2;
      const pen2 = Math.min(2, flips);
      const pen3 = hitNear ? 2 : 0;
      const pen4 = steerRev >= 3 ? 1 : 0; // 미세 보정은 허용, 마지막에 핸들을 크게 좌우로 흔들면 감점
      parts.finish = Math.round(clamp(MAX.finish - pen1 - pen2 - pen3 - pen4, 0, MAX.finish));
      flags.finishPeak = peak; flags.flips = flips;
    }

    const total = parts.center + parts.angle + parts.gap + parts.collision + parts.time + parts.finish;
    const grade = PK.GRADES.find(g => total >= g.min) || PK.GRADES[PK.GRADES.length - 1];
    const comment = grade.comments[(total + hits.total) % grade.comments.length];

    const notes = [];
    if (flags.timedOut) notes.push(inside ? '시간 초과. 정차하기 전에 30초가 끝났습니다.' : '시간 초과. 30초 안에 빈칸에 넣어야 합니다.');
    else if (!inside) notes.push('차량 중심이 주차칸 밖입니다.');
    if (flags.noseIn) notes.push('전면주차입니다. 후면으로 넣어야 합니다.');
    if (hits.total === 1) notes.push('문콕 1회. 옆 차주에게 연락드리세요.');
    else if (hits.total >= 2) notes.push('주차는 했는데 흔적을 남겼습니다. (' + hits.total + '회)');

    return { total, parts, grade: grade.title, comment, notes, flags, hits };
  }

  PK.scoring = { evaluate, wrapDeg };
})();
