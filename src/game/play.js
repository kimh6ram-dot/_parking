/* 주차하기 — 플레이 세션 (루프 · 타이머 · 자동 주차 완료 · settling · 채점 호출) */
(function () {
  'use strict';

  const PK = window.PK;
  const P = PK.PLAY;
  const NO_INPUT = { up: false, down: false, left: false, right: false };

  let session = null;
  let rafId = 0;

  function createSession(vehicleId, colorId, els, onDone) {
    const vehicle = PK.VEHICLES[vehicleId];
    const layout = PK.buildLayout(vehicle, 'reverse');
    return {
      vehicleId, colorId, vehicle,
      colorHex: PK.COLORS[colorId].body,
      layout,
      car: PK.physics.createCar(vehicle, layout.start),
      colliders: PK.physics.buildColliders(layout),
      elapsed: 0, stillTimer: 0, restAt: null, parkedAt: null,
      parked: false, timedOut: false,
      phase: 'play', settleTimer: 0,
      history: [], hitCountSeen: 0,
      lastFrame: 0, cssW: 0, cssH: 0,
      els, onDone,
    };
  }

  /* 스테이지 영역에 월드 비율을 유지하며 캔버스 크기 결정 */
  function layoutCanvas(s) {
    const rect = s.els.stage.getBoundingClientRect();
    const availW = Math.max(120, rect.width - 24);
    const availH = Math.max(160, rect.height - 20);
    const scale = Math.min(availW / s.layout.W, availH / s.layout.H);
    s.cssW = Math.floor(s.layout.W * scale);
    s.cssH = Math.floor(s.layout.H * scale);
    // 안내 문구는 주차장 바로 아래(공간이 없으면 주차장 안쪽 하단)
    s.els.hint.style.top = Math.min(10 + s.cssH + 12, rect.height - 30) + 'px';
  }

  function start(vehicleId, colorId, els, onDone) {
    stop();
    session = createSession(vehicleId, colorId, els, onDone);
    layoutCanvas(session);
    PK.input.reset();
    PK.input.setEnabled(true);
    els.timer.textContent = '00:' + String(P.timeLimit).padStart(2, '0');
    els.timer.classList.remove('urgent');
    els.status.textContent = '';
    els.gear.classList.remove('on');
    els.hint.classList.remove('hidden');
    render(session);
    session.lastFrame = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    session = null;
    PK.input.setEnabled(false);
  }

  function enterSettle(s, label) {
    s.phase = 'settle';
    s.settleTimer = 0;
    PK.input.setEnabled(false);
    s.els.status.textContent = label;
  }

  function isInside(s) {
    const c = PK.physics.center(s.car);
    const t = s.layout.target;
    return c.x >= t.x && c.x <= t.x + t.w && c.y >= t.y && c.y <= t.y + t.h;
  }

  function frame(ts) {
    const s = session;
    if (!s) return;
    let dt = (ts - s.lastFrame) / 1000;
    s.lastFrame = ts;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;

    if (s.phase === 'play') {
      s.elapsed += dt;
      PK.physics.step(s.car, PK.input.state, dt, s.colliders, s.elapsed);

      const hitNow = s.car.hits.length > s.hitCountSeen;
      s.hitCountSeen = s.car.hits.length;
      s.history.push({ t: s.elapsed, speed: s.car.speed, steer: s.car.steer, hit: hitNow });
      while (s.history.length && s.history[0].t < s.elapsed - 3.5) s.history.shift();

      // 자동 완료: 중심이 주차칸 안 + 속도 거의 0 + 가속 입력 없음 → 일정 시간 유지
      const still = Math.abs(s.car.speed) < P.stillSpeed && s.car.throttle === 0;
      if (isInside(s) && still) {
        if (s.stillTimer === 0) s.restAt = s.elapsed;
        s.stillTimer += dt;
      } else {
        s.stillTimer = 0;
        s.restAt = null;
      }

      if (s.stillTimer >= P.stillHold) {
        s.parked = true;
        s.parkedAt = s.restAt;
        enterSettle(s, '주차 완료');
      } else if (s.elapsed >= P.timeLimit) {
        s.timedOut = true;
        enterSettle(s, '시간 초과');
      }

      const remain = Math.max(0, Math.ceil(P.timeLimit - s.elapsed));
      s.els.timer.textContent = '00:' + String(remain).padStart(2, '0');
      s.els.timer.classList.toggle('urgent', remain <= 10); // 마지막 10초: 빨간색
      s.els.gear.classList.toggle('on', s.car.reversing);
      if (s.elapsed > P.hintTime) s.els.hint.classList.add('hidden');
    } else if (s.phase === 'settle') {
      // 입력 없이 물리만 진행: 핸들이 0으로 돌아오고, 굴러가던 차는 자연히 멈춘다
      s.settleTimer += dt;
      PK.physics.step(s.car, NO_INPUT, dt, s.colliders, s.elapsed);
      s.els.gear.classList.toggle('on', s.car.reversing);
      if (s.settleTimer >= P.settleTime) {
        render(s);
        finish(s);
        return;
      }
    }

    render(s);
    rafId = requestAnimationFrame(frame);
  }

  function render(s) {
    PK.renderer.renderStage(s.els.canvas, s.cssW, s.cssH, s.layout, s.car, s.colorHex, s.elapsed);
  }

  function finish(s) {
    const result = PK.scoring.evaluate({
      car: s.car, layout: s.layout,
      parked: s.parked, timedOut: s.timedOut,
      parkedAt: s.parkedAt, restAt: s.restAt, elapsed: s.elapsed,
      history: s.history,
    });
    const snapshot = PK.renderer.snapshot(s.layout, s.car, s.colorHex, 720);            // 공유 이미지·대결용(정사각)
    const snapshotWide = PK.renderer.snapshot(s.layout, s.car, s.colorHex, 720, 1.6);  // 결과 화면용(가로형)
    const c = PK.physics.center(s.car);
    const t = s.layout.target;
    const pose = { dx: c.x - t.cx, dy: c.y - t.cy, hdeg: s.car.heading * 180 / Math.PI };
    const done = s.onDone;
    rafId = 0;
    session = null;
    PK.input.setEnabled(false);
    done({ vehicleId: s.vehicleId, colorId: s.colorId, result, snapshot, snapshotWide, pose, hits: result.hits, elapsed: s.elapsed });
  }

  function resize() {
    if (!session) return;
    layoutCanvas(session);
    render(session);
  }

  PK.play = { start, stop, resize, getSession: () => session };
})();
