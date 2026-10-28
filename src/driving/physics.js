/* 도로주행 — 차량 물리 (bicycle model, 전방 스크롤 월드 좌표)
 * 주차게임 physics.js를 복사/재사용하지 않고 새로 구현한다. 단, 차종별 조작감(최고속도·
 * 가속·조향각·휠베이스)은 PK.VEHICLES를 읽기 전용으로 참조해서 "같은 차는 같은 느낌"을 유지한다.
 * 좌표계: y = 진행 방향(목적지 쪽으로 증가), x = 좌우. heading 0 = +y(전진) 방향을 바라봄,
 * heading이 커질수록 오른쪽으로 도는 방향(시계 방향 양수). 제자리 회전 없음 — 반드시
 * 전진/후진 이동과 함께 heading이 바뀐다(스펙 §19 요구사항). */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;
  const P = DRIVING.PHYSICS;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function createCar(vehicleId, x, y, heading) {
    const vehicle = window.PK.VEHICLES[vehicleId];
    return {
      vehicleId, vehicle,
      x, y, heading: heading || 0,
      speed: 0, steer: 0,
      reversing: false,
      gearPause: 0,
      lastHitAt: -10,
      lastHitInfo: null,
      stunTimer: 0, // 충돌 직후 잠깐 조향 둔화(§2 권장사항 — 0.15~0.35초)
    };
  }

  /* 도로주행 전용 최고속도 보정(§ config.js VEHICLE_TUNING) — PK.VEHICLES 자체는 주차게임과
   * 공유하는 읽기 전용 데이터라 건드리지 않고, 여기서 배율만 곱해 쓴다. */
  function tunedFwd(v, vehicleId) {
    const mul = (DRIVING.VEHICLE_TUNING[vehicleId] || {}).fwdMul || 1;
    return { maxFwd: v.maxFwd * mul, accel: v.accel * mul, brake: v.brake * mul };
  }

  /* input: {up,down,left,right}. gripMul/brakeMul(<=1): 빗길용 보정(기본 1) */
  function stepCar(car, input, dt, gripMul, brakeMul) {
    const v = car.vehicle;
    const tuned = tunedFwd(v, car.vehicleId);
    gripMul = gripMul == null ? 1 : gripMul;
    brakeMul = brakeMul == null ? 1 : brakeMul;

    // 조향: 입력 방향으로 최대각까지 ramp, 손 떼면 steerTime/returnTime 그대로 재사용해 중앙
    // 복귀 — 주차게임 physics.js의 조향 로직과 동일 기준(최고속도와 무관하게 항상 같은
    // maxSteer까지 ramp). 2026-10-01: 이전에 있던 "고속일수록 목표 조향각 자체를 줄이는"
    // 보정은 주차게임에는 없는, 도로주행에서만 임의로 추가했던 조작 방식이라 걷어냈다(사용자
    // 요청 — "기존 주차 게임의 조작감을 기준으로 복원", "임의로 새로운 조작 방식을 만들지
    // 마"). 고속에서 "조금 더 신중해야 하는" 느낌은 bicycle model 자체에서 이미 자연히
    // 나온다 — 같은 조향각이라도 속도가 빠르면 같은 회전 반경을 훨씬 짧은 시간에 통과하게
    // 되어(반경 자체는 wheelBase/tan(steer)로 속도와 무관) 반응 여유가 줄어든다.
    // 충돌 직후 stunTimer가 남아있으면 조향을 크게 둔화(§2 "0.15~0.35초 제어 둔화") — 곧바로
    // 다시 정상 조작되면 충돌감이 약해지므로, 완전히 막지는 않되(공황 상태에서도 최소한의 회피는
    // 가능해야 함) 절반 이하로 줄인다.
    if (car.stunTimer > 0) { car.stunTimer = Math.max(0, car.stunTimer - dt); }
    const stunMul = car.stunTimer > 0 ? 0.35 : 1;
    const steerDir = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const targetSteer = steerDir * v.maxSteer * gripMul * stunMul;
    const rate = (steerDir !== 0 ? v.maxSteer / v.steerTime : v.maxSteer / v.returnTime) * gripMul;
    if (car.steer < targetSteer) car.steer = Math.min(targetSteer, car.steer + rate * dt);
    else if (car.steer > targetSteer) car.steer = Math.max(targetSteer, car.steer - rate * dt);

    // 가감속: 전진/브레이크/후진 — 주차게임 physics.js의 step()과 동일 구조(제동으로 0이 된
    // 뒤 gearPause만큼 멈췄다가 반대 방향 가속 시작, 키를 떼면 rollDecel+dragCoef로 굴러서
    // 정지). maxFwd/accel/brake만 tunedFwd()로 늘린 값을 쓴다(차종별 배율, §VEHICLE_TUNING).
    let speed = car.speed;
    const up = input.up && !input.down;
    const down = input.down && !input.up;
    if (up) {
      if (speed < 0) {
        speed = Math.min(0, speed + tuned.brake * brakeMul * dt);
        if (speed === 0) car.gearPause = P.gearPause;
      } else if (car.gearPause > 0) {
        car.gearPause -= dt;
      } else {
        speed = Math.min(tuned.maxFwd, speed + tuned.accel * dt);
      }
    } else if (down) {
      if (speed > 0) {
        speed = Math.max(0, speed - tuned.brake * brakeMul * dt);
        if (speed === 0) car.gearPause = P.gearPause;
      } else if (car.gearPause > 0) {
        car.gearPause -= dt;
      } else {
        speed = Math.max(-v.maxRev, speed - v.revAccel * dt);
      }
    } else {
      car.gearPause = 0;
      const decel = P.rollDecel * dt + Math.abs(speed) * P.dragCoef * dt;
      speed = speed > 0 ? Math.max(0, speed - decel) : speed < 0 ? Math.min(0, speed + decel) : 0;
    }
    car.speed = speed;
    car.reversing = speed < -P.stopEpsilon;

    // bicycle model: heading 변화율은 속도에 비례(정지 상태에서는 제자리 회전 없음)
    if (Math.abs(speed) > 0.01) {
      const headingRate = (speed / v.wheelBase) * Math.tan(car.steer);
      car.heading += headingRate * dt;
    }
    car.x += Math.sin(car.heading) * speed * dt;
    car.y += Math.cos(car.heading) * speed * dt;
  }

  /* OBB: 차량 로컬 +y = 전진, +x = 오른쪽(주차게임과 축이 다름에 주의) */
  function obbOf(x, y, heading, width, length) {
    return { cx: x, cy: y, heading, halfW: width / 2, halfL: length / 2 };
  }
  function corners(obb) {
    const s = Math.sin(obb.heading), c = Math.cos(obb.heading);
    const pts = [
      { x: -obb.halfW, y: -obb.halfL }, { x: obb.halfW, y: -obb.halfL },
      { x: obb.halfW, y: obb.halfL }, { x: -obb.halfW, y: obb.halfL },
    ];
    return pts.map(p => ({ x: obb.cx + p.x * c + p.y * s, y: obb.cy - p.x * s + p.y * c }));
  }
  function axesOf(obb) {
    const s = Math.sin(obb.heading), c = Math.cos(obb.heading);
    return [{ x: c, y: -s }, { x: s, y: c }];
  }
  function project(pts, axis) {
    let min = Infinity, max = -Infinity;
    pts.forEach(p => { const d = p.x * axis.x + p.y * axis.y; if (d < min) min = d; if (d > max) max = d; });
    return [min, max];
  }
  /* SAT 기반 OBB 충돌 판정. 겹치면 { hit:true, overlap, axis } (가장 얕은 축=푸시아웃 방향) */
  function obbOverlap(a, b) {
    const ca = corners(a), cb = corners(b);
    const axes = axesOf(a).concat(axesOf(b));
    let minOverlap = Infinity, minAxis = null;
    for (const axis of axes) {
      const [aMin, aMax] = project(ca, axis);
      const [bMin, bMax] = project(cb, axis);
      const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
      if (overlap <= 0) return { hit: false };
      if (overlap < minOverlap) { minOverlap = overlap; minAxis = axis; }
    }
    // 축 방향을 a→b 기준으로 정렬
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    if (dx * minAxis.x + dy * minAxis.y < 0) minAxis = { x: -minAxis.x, y: -minAxis.y };
    return { hit: true, overlap: minOverlap, axis: minAxis };
  }

  /* 차량 OBB 한 번에 뽑기(길이/폭은 vehicle 정의 재사용) */
  function carObb(car) {
    return obbOf(car.x, car.y, car.heading, car.vehicle.width, car.vehicle.length);
  }

  DRIVING.physics = { createCar, stepCar, obbOf, corners, obbOverlap, carObb };
})();
