/* 도로주행 — 플레이 세션 (루프 · 카메라 · 충돌 · 목적지 판정 · 채점 호출)
 * 주차게임 play.js를 복사하지 않고 새로 구현한다. 화면 리듬(타이머 → 상태 문구 → settle →
 * onDone)은 같은 문법을 따르되 도로주행 전용 로직(도로 이탈·NPC·목적지 zone)을 담는다. */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;
  const P = DRIVING.PLAY;
  const NO_INPUT = { up: false, down: false, left: false, right: false };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let session = null;
  let rafId = 0;

  /* 시작 heading은 항상 0이 아니라 실제 도로 접선 각도를 따른다(§15) — 지금은 전 스테이지가
   * STRAIGHT로 시작해 결과적으로 0이지만, 공통 기반이므로 도로 형상에서 직접 구한다. */
  function startHeading(stage) {
    const d = 3;
    const a = DRIVING.roadAt(stage, 0).cx, b = DRIVING.roadAt(stage, d).cx;
    return Math.max(-0.5, Math.min(0.5, Math.atan((b - a) / d)));
  }

  function createSession(stageId, vehicleId, colorId, els, onDone) {
    const stage = DRIVING.STAGES[stageId - 1];
    const startRoad = DRIVING.roadAt(stage, 0);
    return {
      stageId, stage, vehicleId, colorId,
      colorHex: window.PK.COLORS[colorId].body,
      car: DRIVING.physics.createCar(vehicleId, startRoad.cx, 0, startHeading(stage)),
      npcs: DRIVING.obstacles.createRuntime(stage),
      tracker: DRIVING.scoring.createTracker(stage),
      elapsed: 0, arrived: false, timedOut: false,
      phase: 'play', settleTimer: 0,
      contactState: Object.create(null), // key -> 지금 접촉 중인지(진입/지속/해제 구분용)
      lastFrame: 0, cssW: 0, cssH: 0,
      els, onDone,
    };
  }

  function layoutCanvas(s) {
    const rect = s.els.stage.getBoundingClientRect();
    s.cssW = Math.max(120, Math.floor(rect.width));
    s.cssH = Math.max(160, Math.floor(rect.height));
  }

  /* 2026-10-01: 분을 항상 "00:"으로 고정 출력하던 버그 — sec이 59를 넘으면(제한시간 90초 등)
   * '00:90'처럼 분을 못 넘기고 그대로 표시됐다("00:90, 00:88로 나온다" 실제 플레이 피드백).
   * 분/초를 제대로 나눠 MM:SS로 표시한다. */
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function enterSettle(s, label) {
    s.phase = 'settling';
    s.settleTimer = 0;
    s.els.status.textContent = label;
    DRIVING.input.setEnabled(false);
  }

  /* 도로 경계와 차량 충돌(§24~26): 중심점이 아니라 OBB 네 꼭짓점 기준으로 도로 밖으로
   * 나간 정도를 계산한다(회전한 차체까지 고려). 살짝 스친 정도는 가볍게, 차량 중심 자체가
   * 도로 밖이면(심한 이탈) 크게 감속한다. 즉시 GAME OVER 없이 계속 플레이 가능. */
  function checkRoadEdge(s, dt) {
    const road = DRIVING.roadAt(s.stage, s.car.y);
    const corners = DRIVING.physics.corners(DRIVING.physics.carObb(s.car));
    let maxOut = 0, sign = 0;
    corners.forEach(p => {
      const outR = p.x - (road.cx + road.half);
      const outL = (road.cx - road.half) - p.x;
      if (outR > maxOut) { maxOut = outR; sign = 1; }
      if (outL > maxOut) { maxOut = outL; sign = -1; }
    });
    if (maxOut <= 0) { s.roadOutTimer = 0; return; }
    s.roadOutTimer = (s.roadOutTimer || 0) + dt;
    // 매 프레임 안쪽으로 부드럽게 밀어내기(연속) — 감속은 접촉 이벤트당 한 번만(쿨다운,
    // checkCollisions의 hit()과 같은 패턴) 적용해서 지수적으로 폭주하지 않게 한다.
    s.car.x -= sign * Math.min(maxOut, 70 * dt);
    const centerOut = sign > 0 ? s.car.x - (road.cx + road.half) : (road.cx - road.half) - s.car.x;
    const severe = centerOut > 0; // 차량 중심 자체가 도로 밖 = 심한 이탈
    // 쿨다운을 넉넉히 둔다 — 커브에서 살짝살짝 여러 번 스치는 상황이 흔한데, 매번 감속이
    // 곱해지면(0.92 x 여러 번) 결국 "약간 감소"가 아니라 거의 멈추는 수준까지 누적된다
    // (실측: 짧은 시간에 40회 이상 접촉하며 속도가 죽어버리는 현상 확인됨). 짧은 접촉 구간
    // 전체를 한 번의 감속으로 취급하도록 쿨다운을 늘리고 배율도 더 가볍게 조정했다.
    if (s.elapsed - (s.lastEdgeHitAt || -10) > 0.6) {
      s.lastEdgeHitAt = s.elapsed;
      s.car.speed *= severe ? 0.72 : 0.96;
      s.tracker.roadEdgeHitCount++;
    }
  }

  /* 충돌 반응(§2 — 2026-09-28 전면 개편, 2026-10-02 진입/지속/해제 구분 추가). SAT가 준 실제
   * overlap/axis를 x·y 둘 다 반영해 겹친 만큼 확실히 밀어내고, heading을 살짝 틀고, 잠깐
   * 조향을 둔화시키는(physics.js stunTimer) 식으로 "부딪힌 느낌"을 낸다. 종류별로 강도를
   * 다르게 둔다: 콘/보행자/킥보드는 가볍게, 차량류(brakeStop/laneChange)는 더 확실하게.
   *
   * 2026-10-02: "한 번의 실수로 계속 감점되는 느낌"(실제 플레이 피드백) — 예전엔 0.5초
   * 쿨다운만으로 재충돌을 걸러서, 차가 NPC에 붙은 채 몇 초간 안 떨어지면 0.5초마다 계속
   * 새로 감점·반동·jolt가 발생했다(3초간 끼어 있으면 최대 6번). 겹침 자체를 막는 push-out은
   * 접촉이 지속되는 동안 매 프레임 그대로 적용하되(겹친 채 붙어있지 않게), 감점·반동
   * (speed 감소·heading kick·stunTimer·NPC jolt·화면 피드백·scoring 기록)은 "접촉이 막 시작된
   * 순간"(이전 프레임엔 안 닿았다가 이번 프레임에 닿은 진입 엣지)에만 한 번 발생시킨다.
   * s.contactState[key]로 현재 접촉 여부를 기억해 진입/지속/해제를 구분한다 — 완전히
   * 떨어졌다가 다시 닿으면 그건 새 충돌이라 다시 카운트된다(의도된 동작). */
  const KIND_JOLT = { cone: 0.35, crosswalkPedestrian: 0.4, dash: 0.5, weave: 0.7, brakeStop: 1, laneChange: 1.15, static: 0.9 };
  function checkCollisions(s, dt) {
    const carObb = DRIVING.physics.carObb(s.car);
    const hit = (key, otherObb, kind, npcId, npc) => {
      const r = DRIVING.physics.obbOverlap(carObb, otherObb);
      if (!r.hit) { s.contactState[key] = false; return; }

      // 1) 통과 방지 — 접촉이 지속되는 동안에도 매 프레임 적용(겹친 채 붙어있지 않게).
      const pushOut = Math.min(r.overlap, 40);
      s.car.x -= r.axis.x * pushOut;
      s.car.y -= r.axis.y * pushOut;

      const wasInContact = s.contactState[key];
      s.contactState[key] = true;
      if (wasInContact) return; // 이미 접촉 중이던 같은 충돌 — 추가 감점/반동/기록 없음

      const impactSpeed = Math.abs(s.car.speed);
      const hard = impactSpeed > 40;
      const joltScale = KIND_JOLT[kind] != null ? KIND_JOLT[kind] : 1;

      // 2) 감속(반발) — 세게 부딪힐수록, 정면에 가까울수록 더 크게 깎는다.
      s.car.speed *= 1 - DRIVING.PHYSICS.restitution * Math.min(1.4, 0.6 + joltScale * 0.6);

      // 3) heading을 살짝 틀어서 "충격" 느낌(§7 예시: 옆면 충돌 시 각도가 살짝 틀어짐) — 부딪힌
      //    축의 좌우 성분 부호를 따라가되 과하게 돌지 않도록 클램프.
      const headingKick = clamp(-r.axis.x * 0.35 * joltScale, -0.3, 0.3);
      s.car.heading += headingKick;

      // 4) 잠깐 조향 둔화(physics.js stepCar가 읽음)
      s.car.stunTimer = Math.max(s.car.stunTimer || 0, hard ? 0.35 : 0.15 + joltScale * 0.05);

      // 5) 상대 NPC도 살짝 밀리고 흔들리게(§2 권장 — "상대 차량도 약간 밀리거나 흔들리면 더 좋음").
      //    실제 결정론적 이동 로직(obstacles.js)은 건드리지 않고, 그 위에 잠깐 더해지는 시각적
      //    jolt만 남긴다(다음 프레임부터 obstacles.js가 알아서 감쇠시킴).
      if (npc) {
        npc.hitJoltX = (npc.hitJoltX || 0) + r.axis.x * Math.min(8, pushOut) * 0.6;
        npc.hitJoltHeading = (npc.hitJoltHeading || 0) + clamp(r.axis.x * 0.3, -0.25, 0.25);
        npc.hitJoltT = Math.max(npc.hitJoltT || 0, 0.35);
      }

      // 6) 화면 피드백(플래시/흔들림) — 카메라 좌표는 절대 건드리지 않고 DOM 오버레이로만.
      if (s.els.onHit) s.els.onHit(hard);

      if (kind === 'cone') s.tracker.coneHits = (s.tracker.coneHits || 0) + 1;
      else DRIVING.scoring.recordCollision(s.tracker, npcId, kind, hard, s.car.y);
    };
    (s.stage.static || []).forEach((st, i) => {
      if (st.type !== 'parkedCar' && st.type !== 'workVehicle' && st.type !== 'cone') return;
      const obb = st.type === 'cone'
        ? DRIVING.physics.obbOf(st.x, st.y, 0, 10, 10)
        : DRIVING.physics.obbOf(st.x, st.y, st.heading || 0, window.PK.VEHICLES[st.vehicleId].width, window.PK.VEHICLES[st.vehicleId].length);
      hit('static' + i, obb, st.type === 'cone' ? 'cone' : 'static', null, null);
    });
    s.npcs.forEach(o => {
      if (!DRIVING.obstacles.isSolid(o)) return;
      hit('npc' + o.id, DRIVING.obstacles.obbOf(o), o.kind, o.id, o);
    });
  }

  function frame(now) {
    const s = session;
    if (!s) return;
    const dt = Math.min(0.05, s.lastFrame ? (now - s.lastFrame) / 1000 : 0.016);
    s.lastFrame = now;

    if (s.phase === 'play') {
      const input = DRIVING.input.state || NO_INPUT;
      const gripMul = s.stage.rain ? DRIVING.PHYSICS.rainGripMul : 1;
      const brakeMul = s.stage.rain ? DRIVING.PHYSICS.rainBrakeMul : 1;
      DRIVING.physics.stepCar(s.car, input, dt, gripMul, brakeMul);
      checkRoadEdge(s, dt);
      DRIVING.obstacles.update(s.npcs, s.car, dt, s.stage);
      checkCollisions(s, dt);
      const road = DRIVING.roadAt(s.stage, s.car.y);
      DRIVING.scoring.tick(s.tracker, dt, s.car, road, s.npcs);
      // 잘한 행동 피드백(§4) — scoring.tick이 조건 충족을 감지하면 tracker.pendingToast에
      // 문구를 채워둔다(한 구간당 한 번만, scoring.js의 dedup 플래그로 중복 방지). 여기서
      // 기존 toast() 그대로 재사용해 한 번만 띄우고 비운다 — 새 UI를 만들지 않는다.
      if (s.tracker.pendingToast) {
        DRIVING.resultUI.toast(s.tracker.pendingToast);
        s.tracker.pendingToast = null;
      }
      s.elapsed += dt;

      const d = s.stage.destination;
      // 목적지 구역 끝(y1) 결승선을 넘는 순간 바로 완료 — 정차 요구 없음(사용자 확정 사항,
      // 2026-09-22: "선을 넘어가자마자 스테이지 종료"). 결승선 폭(d.half) 안으로 통과해야 함.
      if (s.car.y >= d.y1 && Math.abs(s.car.x - d.cx) <= d.half) {
        s.arrived = true; enterSettle(s, '도착 완료');
      }

      if (!s.arrived && s.elapsed >= s.stage.timeLimit) { s.timedOut = true; enterSettle(s, '시간 초과'); }

      // 2026-10-01: 주 시간 표시를 "남은 시간" 카운트다운에서 "경과 시간" 카운트업으로
      // 바꿨다(사용자 요청 — 00:00부터 올라가길 원함, 제한시간을 그대로 보여주면 시작부터
      // "00:90"처럼 보여 이미 시간이 흐른 느낌을 줬다). 제한시간 자체는 실패 조건으로는
      // 그대로 남아있고, 마지막 6초 경고(urgent)도 내부적으로 남은 시간 기준 그대로 유지한다
      // — 화면에 두 숫자를 더 보여주진 않는다(§7 "화면을 복잡하게 만들지 말라").
      s.els.timer.textContent = fmtTime(s.elapsed);
      s.els.timer.classList.toggle('urgent', s.stage.timeLimit - s.elapsed <= 6);
      s.els.speed.textContent = DRIVING.kmh(Math.abs(s.car.speed)) + ' km/h';
      if (s.elapsed > DRIVING.PLAY.hintTime) s.els.hint.classList.add('hidden');
      // 진행률(§7 "앞으로 얼마나 더 달려야 하는지 알기 어렵다") — 실제 주행 거리(car.y) /
      // 결승선까지 거리(destination.y1) 기준, 얇은 바 하나로만 표시(디자인 단순 유지).
      if (s.els.progressFill) {
        const pct = clamp(s.car.y / s.stage.destination.y1, 0, 1) * 100;
        s.els.progressFill.style.width = pct + '%';
      }
    } else if (s.phase === 'settling') {
      s.settleTimer += dt;
      if (s.settleTimer >= DRIVING.PLAY.settleTime) { finish(s); return; }
    }

    DRIVING.renderer.renderStage(s.els.canvas, s.cssW, s.cssH, s.stage, s.car, s.colorHex, s.npcs, s.elapsed);
    rafId = requestAnimationFrame(frame);
  }

  function finish(s) {
    cancelAnimationFrame(rafId);
    const d = s.stage.destination;
    const result = DRIVING.scoring.evaluate(s.tracker, {
      arrived: s.arrived, timedOut: s.timedOut, car: s.car, stage: s.stage,
      distanceToDestination: Math.max(0, d.y0 - s.car.y), npcs: s.npcs,
    });
    const snapshot = DRIVING.renderer.snapshot(s.stage, s.car, s.colorHex, s.npcs, 720, 1);
    session = null;
    s.onDone({
      stageId: s.stageId, vehicleId: s.vehicleId, colorId: s.colorId,
      result, snapshot, npcs: s.npcs, arrived: s.arrived,
      pose: { dx: s.car.x - d.cx, hdeg: s.car.heading * 180 / Math.PI },
    });
  }

  function start(stageId, vehicleId, colorId, els, onDone) {
    if (rafId) cancelAnimationFrame(rafId);
    session = createSession(stageId, vehicleId, colorId, els, onDone);
    els.status.textContent = 'STAGE ' + stageId;
    els.timer.textContent = fmtTime(0);
    els.timer.classList.remove('urgent');
    els.speed.textContent = '0 km/h';
    els.hint.classList.remove('hidden');
    if (els.progressFill) els.progressFill.style.width = '0%';
    layoutCanvas(session);
    DRIVING.input.setEnabled(true);
    session.lastFrame = 0;
    rafId = requestAnimationFrame(frame);
  }
  function resize() { if (session) layoutCanvas(session); }
  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    DRIVING.input.setEnabled(false);
    session = null;
  }

  DRIVING.play = { start, resize, stop };
})();
