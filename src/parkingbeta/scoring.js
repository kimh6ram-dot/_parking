/* 주차하기 베타 — 채점 (src/game/scoring.js를 건드리지 않고 복제 + 일반화)
 * 기존 채점은 "주차칸이 항상 세로(아래가 통로)"라는 가정이 깔려 있어 center/gap 계산이
 * 월드 x축=폭, y축=길이로 고정돼 있다. 평행주차(가로 방향 주차칸)에서 그대로 쓰면 엉뚱한
 * 축을 기준으로 채점해 부당하게 낮은 점수가 나온다. 그래서 world x/y 대신 주차칸의 방향
 * 벡터(layout.mode.targetHeading에서 유도한 along/across 축)에 투영해서 계산하도록
 * 일반화했다 — targetHeading이 기존처럼 π/2(세로)이면 along=(0,1)/across=(-1,0)이 되어
 * 기존 공식과 동일한 결과가 나온다(정확히 동일함을 회귀 테스트로 확인). 점수 배점·충돌·
 * 시간·마무리 로직은 원본과 완전히 동일(방향에 무관한 값들이라 그대로 가져옴). */
(function () {
  'use strict';

  const PK = window.PK;
  const PB = (window.PB = window.PB || {});
  const MAX = PK.SCORE_MAX;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ramp = (e, dead, range) => clamp((e - dead) / range, 0, 1);

  function wrapDeg(d) {
    while (d > 180) d -= 360;
    while (d <= -180) d += 360;
    return d;
  }

  function evaluate(ctx) {
    const { car, layout } = ctx;
    const v = car.vehicle;
    const t = layout.target;
    const c = PK.physics.center(car);
    const inside = c.x >= t.x && c.x <= t.x + t.w && c.y >= t.y && c.y <= t.y + t.h;
    const parts = { center: 0, angle: 0, gap: 0, collision: 0, time: 0, finish: 0 };
    const flags = { inside, noseIn: false, timedOut: !!ctx.timedOut, parked: !!ctx.parked };

    const hits = PK.physics.hitCounts(car);
    parts.collision = clamp(MAX.collision - hits.weak * 4 - hits.strong * 7, 0, MAX.collision);

    const targetHeading = layout.mode.targetHeading;
    // along = 주차칸 "길이" 축(제대로 주차됐을 때 차 앞머리가 향하는 방향), across = 그 수직(="폭" 축)
    const along = { x: Math.cos(targetHeading), y: Math.sin(targetHeading) };
    const across = { x: -Math.sin(targetHeading), y: Math.cos(targetHeading) };

    if (inside) {
      const dx = c.x - t.cx, dy = c.y - t.cy;
      const errAlong = dx * along.x + dy * along.y;
      const errAcross = dx * across.x + dy * across.y;
      const ex = Math.abs(errAcross) / v.width;
      const ey = Math.abs(errAlong) / v.length;
      const centerErr = 0.75 * ramp(ex, 0.06, 0.32) + 0.25 * ramp(ey, 0.06, 0.45);
      parts.center = Math.round(MAX.center * (1 - clamp(centerErr, 0, 1)));

      const err = Math.abs(wrapDeg((car.heading - targetHeading) * 180 / Math.PI));
      flags.noseIn = err > 90;
      flags.angleErr = err;
      parts.angle = flags.noseIn ? 0
        : Math.round(MAX.angle * Math.pow(1 - ramp(err, 1, 16), 1.15));

      // 좌우(across축) 간격: 차체 모서리를 across축에 투영해 주차칸 across폭과 비교
      const pts = PK.physics.corners(PK.physics.obbOf(car));
      let minA = Infinity, maxA = -Infinity;
      pts.forEach(p => {
        const a = (p.x - t.cx) * across.x + (p.y - t.cy) * across.y;
        if (a < minA) minA = a;
        if (a > maxA) maxA = a;
      });
      const halfAcross = (t.w / 2) * Math.abs(across.x) + (t.h / 2) * Math.abs(across.y);
      const gapA = minA + halfAcross, gapB = halfAcross - maxA;
      const diff = Math.abs(gapA - gapB) / v.width;
      const minGap = Math.min(gapA, gapB) / v.width;
      const crossPen = clamp(-minGap / 0.25, 0, 1) * 10;
      parts.gap = Math.round(clamp(MAX.gap * (1 - ramp(diff, 0.12, 0.45)) - crossPen, 0, MAX.gap));
      flags.gapL = gapA; flags.gapR = gapB;
    }

    if (flags.parked && !flags.timedOut) {
      const s = ctx.parkedAt;
      parts.time = s <= 10 ? MAX.time : Math.round(clamp(MAX.time - (s - 10) * 0.4, 2, MAX.time));

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
      const pen4 = steerRev >= 3 ? 1 : 0;
      parts.finish = Math.round(clamp(MAX.finish - pen1 - pen2 - pen3 - pen4, 0, MAX.finish));
      flags.finishPeak = peak; flags.flips = flips;
    }

    const total = parts.center + parts.angle + parts.gap + parts.collision + parts.time + parts.finish;
    const grade = PK.GRADES.find(g => total >= g.min) || PK.GRADES[PK.GRADES.length - 1];
    const comment = grade.comments[(total + hits.total) % grade.comments.length];

    const notes = [];
    const timeLimit = ctx.timeLimit || 30;
    if (flags.timedOut) notes.push(inside ? '시간 초과. 정차하기 전에 시간이 끝났습니다.' : '시간 초과. 제한 시간 안에 빈칸에 넣어야 합니다.');
    else if (!inside) notes.push('차량 중심이 주차칸 밖입니다.');
    if (flags.noseIn) notes.push('방향이 반대입니다. 주차칸 방향에 맞춰 넣어야 합니다.');
    if (hits.total === 1) notes.push('문콕 1회. 옆 차주에게 연락드리세요.');
    else if (hits.total >= 2) notes.push('주차는 했는데 흔적을 남겼습니다. (' + hits.total + '회)');

    return { total, parts, grade: grade.title, comment, notes, flags, hits };
  }

  PB.scoring = { evaluate, wrapDeg };
})();
