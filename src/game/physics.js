/* 주차하기 — 차량 물리 (bicycle model) + 조향 easing + OBB(SAT) 충돌
 *
 * 상태값은 뒷바퀴축 중심(x, y) 기준. 차체 중심은 heading 방향으로 (length/2 - rearOverhang)만큼 앞.
 * 화면 좌표계(y 아래로 증가) 기준:
 *   heading  : 차량 앞머리 방향(rad). 0 = 오른쪽(동), +π/2 = 아래(남), -π/2 = 위(북)
 *   steer    : 조향각(rad). +면 오른쪽(시계 방향), -면 왼쪽
 *   speed    : 앞으로 +, 후진 -
 *   heading += (speed / wheelBase) * tan(steer) * dt
 *   → speed가 0이면 회전 없음, 후진(speed<0)이면 자연히 반대 궤적
 */
(function () {
  'use strict';

  const PK = window.PK;
  const P = PK.PHYSICS;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function wrap(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a <= -Math.PI) a += Math.PI * 2;
    return a;
  }

  /* 차체 중심 기준 시작 pose → 뒷축 기준 상태로 변환 */
  function createCar(vehicle, start) {
    const d = vehicle.length / 2 - vehicle.rearOverhang;
    return {
      vehicle,
      x: start.x - Math.cos(start.heading) * d,
      y: start.y - Math.sin(start.heading) * d,
      heading: start.heading,
      speed: 0,
      steer: 0,
      gearPause: 0,
      reversing: false,
      throttle: 0,          // -1 후진 입력, 0 없음, +1 전진 입력
      hits: [],             // { t, strong, x, y }
      lastHit: Object.create(null),
      lastHitInfo: null,
    };
  }

  function center(car) {
    const v = car.vehicle;
    const d = v.length / 2 - v.rearOverhang;
    return { x: car.x + Math.cos(car.heading) * d, y: car.y + Math.sin(car.heading) * d };
  }

  function obbOf(car) {
    const c = center(car);
    return { cx: c.x, cy: c.y, hl: car.vehicle.length / 2, hw: car.vehicle.width / 2, heading: car.heading };
  }

  /* 이웃 차량/벽을 OBB로 */
  function obbOfVehicle(pose, vehicle) {
    return { cx: pose.x, cy: pose.y, hl: vehicle.length / 2, hw: vehicle.width / 2, heading: pose.heading };
  }
  function obbOfRect(r) {
    return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, hl: r.w / 2, hw: r.h / 2, heading: 0 };
  }

  function corners(o) {
    const c = Math.cos(o.heading), s = Math.sin(o.heading);
    const ux = c * o.hl, uy = s * o.hl;
    const vx = -s * o.hw, vy = c * o.hw;
    return [
      { x: o.cx + ux + vx, y: o.cy + uy + vy },
      { x: o.cx + ux - vx, y: o.cy + uy - vy },
      { x: o.cx - ux - vx, y: o.cy - uy - vy },
      { x: o.cx - ux + vx, y: o.cy - uy + vy },
    ];
  }
  function axesOf(o) {
    const c = Math.cos(o.heading), s = Math.sin(o.heading);
    return [{ x: c, y: s }, { x: -s, y: c }];
  }
  function project(pts, ax) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = pts[i].x * ax.x + pts[i].y * ax.y;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return { min, max };
  }

  /* SAT: a를 b 밖으로 밀어내는 최소 이동 벡터 {depth, nx, ny} 또는 null */
  function satOBB(a, b) {
    const pa = corners(a), pb = corners(b);
    const axes = axesOf(a).concat(axesOf(b));
    let best = null;
    for (let i = 0; i < axes.length; i++) {
      const ax = axes[i];
      const ra = project(pa, ax), rb = project(pb, ax);
      const overlap = Math.min(ra.max, rb.max) - Math.max(ra.min, rb.min);
      if (overlap <= 0) return null;
      if (!best || overlap < best.depth) {
        const dir = ((a.cx - b.cx) * ax.x + (a.cy - b.cy) * ax.y) < 0 ? -1 : 1;
        best = { depth: overlap, nx: ax.x * dir, ny: ax.y * dir };
      }
    }
    return best;
  }

  /* 충돌 처리: 통과 금지(밀어내기) + 작은 반동 + 기록 */
  function resolveCollisions(car, colliders, now) {
    const v = car.vehicle;
    for (let i = 0; i < colliders.length; i++) {
      const col = colliders[i];
      const mtv = satOBB(obbOf(car), col);
      if (!mtv) continue;
      car.x += mtv.nx * (mtv.depth + 0.01);
      car.y += mtv.ny * (mtv.depth + 0.01);

      const fx = Math.cos(car.heading), fy = Math.sin(car.heading);
      const vn = (fx * mtv.nx + fy * mtv.ny) * car.speed; // 법선 방향 속도 (양수 = 멀어지는 중)
      if (vn >= 0) continue;
      const impact = -vn;
      const bounce = Math.min(impact * P.restitution, P.maxBounce);
      car.speed = -Math.sign(car.speed) * bounce;

      if (impact >= P.countThreshold) {
        const last = col.id in car.lastHit ? car.lastHit[col.id] : -Infinity;
        if (now - last >= P.hitCooldown) {
          car.lastHit[col.id] = now;
          const strong = impact >= v.maxFwd * P.strongRatio;
          const c = center(car);
          const ext = Math.abs(fx * mtv.nx + fy * mtv.ny) * v.length / 2
                    + Math.abs(-fy * mtv.nx + fx * mtv.ny) * v.width / 2;
          const hit = { t: now, strong, x: c.x - mtv.nx * ext, y: c.y - mtv.ny * ext, impact };
          car.hits.push(hit);
          car.lastHitInfo = hit;
        }
      }
    }
  }

  /* 한 프레임 진행. input: {up, down, left, right}, now: 플레이 경과 시간(s) */
  function step(car, input, dt, colliders, now) {
    const v = car.vehicle;

    // ---- 조향: 즉시 최대가 아니라 서서히 꺾이고, 놓으면 서서히 복귀 ----
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) {
      const rate = v.maxSteer / v.steerTime;
      car.steer = clamp(car.steer + dir * rate * dt, -v.maxSteer, v.maxSteer);
    } else if (car.steer !== 0) {
      const rate = v.maxSteer / v.returnTime;
      const s = Math.sign(car.steer);
      car.steer -= s * rate * dt;
      if (Math.sign(car.steer) !== s) car.steer = 0;
    }

    // ---- 가감속: 전진 중 ↓ = 브레이크 → 정지 → 잠깐 멈춤 → 후진 ----
    const up = input.up && !input.down;
    const down = input.down && !input.up;
    car.throttle = up ? 1 : down ? -1 : 0;
    if (up) {
      if (car.speed < 0) {
        car.speed = Math.min(0, car.speed + v.brake * dt);
        if (car.speed === 0) car.gearPause = P.gearPause;
      } else if (car.gearPause > 0) {
        car.gearPause -= dt;
      } else {
        car.speed = Math.min(v.maxFwd, car.speed + v.accel * dt);
      }
    } else if (down) {
      if (car.speed > 0) {
        car.speed = Math.max(0, car.speed - v.brake * dt);
        if (car.speed === 0) car.gearPause = P.gearPause;
      } else if (car.gearPause > 0) {
        car.gearPause -= dt;
      } else {
        car.speed = Math.max(-v.maxRev, car.speed - v.revAccel * dt);
      }
    } else {
      // 키를 뗌: 아주 조금 굴러가다 멈춤 (빙판 아님)
      car.gearPause = 0;
      if (car.speed !== 0) {
        const s = Math.sign(car.speed);
        const dec = P.rollDecel + Math.abs(car.speed) * P.dragCoef;
        car.speed -= s * dec * dt;
        if (Math.sign(car.speed) !== s || Math.abs(car.speed) < P.stopEpsilon) car.speed = 0;
      }
    }
    car.reversing = car.speed < 0 || (down && car.speed === 0);

    // ---- 이동: 현재 heading 방향으로, speed·steer에 따라 회전 (서브스텝 + 충돌) ----
    const n = P.substeps;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      if (car.speed !== 0) {
        car.heading = wrap(car.heading + (car.speed / v.wheelBase) * Math.tan(car.steer) * h);
        car.x += Math.cos(car.heading) * car.speed * h;
        car.y += Math.sin(car.heading) * car.speed * h;
      }
      resolveCollisions(car, colliders, now);
    }
  }

  /* 레이아웃의 충돌 대상 목록(OBB) */
  function buildColliders(layout) {
    const list = [];
    layout.neighbors.forEach((nb, i) => {
      const o = obbOfVehicle(nb, nb.vehicle);
      o.id = 'neighbor-' + i;
      list.push(o);
    });
    layout.walls.forEach(w => {
      const o = obbOfRect(w);
      o.id = w.id;
      list.push(o);
    });
    return list;
  }

  function hitCounts(car) {
    let weak = 0, strong = 0;
    for (const h of car.hits) (h.strong ? strong++ : weak++);
    return { weak, strong, total: weak + strong };
  }

  PK.physics = { createCar, center, obbOf, corners, satOBB, step, buildColliders, hitCounts, wrap, clamp };
})();
