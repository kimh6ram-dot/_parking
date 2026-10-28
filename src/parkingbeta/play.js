/* 주차하기 베타 — 플레이 세션 (루프 · 타이머 · 자동 주차 완료 · settling · 채점 호출)
 * 기존 src/game/play.js와 구조가 거의 동일하다(같은 리듬: play → settle → finish) — 다른 점은
 * 딱 하나, createSession이 'reverse' 고정 대신 PB.STAGES[stageId-1]의 modeId/timeLimit을
 * 쓴다는 것뿐이다. 물리(PK.physics)·채점(PK.scoring)·렌더링(PK.renderer)·레이아웃 생성
 * (PK.buildLayout)은 전부 기존 주차게임 함수를 그대로 재사용한다(읽기 전용 호출만, 그 쪽
 * 파일은 한 줄도 수정하지 않음) — 새 스테이지가 "같은 주차 손맛, 더 좁은 칸"이 되게 하는
 * 핵심이 바로 이 재사용이다. stillSpeed/stillHold/settleTime/hintTime처럼 주차칸 크기와
 * 무관한 상수는 기존 PK.PLAY 값을 그대로 읽는다(timeLimit만 스테이지별로 다름). */
(function () {
  'use strict';

  const PK = window.PK;
  const PB = window.PB;
  const P = PK.PLAY; // stillSpeed/stillHold/settleTime/hintTime — 주차칸 크기와 무관, 읽기 전용 재사용
  const NO_INPUT = { up: false, down: false, left: false, right: false };

  let session = null;
  let rafId = 0;

  function createSession(stageId, vehicleId, colorId, els, onDone) {
    const stage = PB.STAGES[stageId - 1];
    const vehicle = PK.VEHICLES[vehicleId];
    const layout = PB.buildStageLayout(stage, vehicle);
    return {
      stageId, stage, vehicleId, colorId, vehicle,
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

  function layoutCanvas(s) {
    const rect = s.els.stage.getBoundingClientRect();
    const availW = Math.max(120, rect.width - 24);
    const availH = Math.max(160, rect.height - 20);
    const scale = Math.min(availW / s.layout.W, availH / s.layout.H);
    s.cssW = Math.floor(s.layout.W * scale);
    s.cssH = Math.floor(s.layout.H * scale);
    s.els.hint.style.top = Math.min(10 + s.cssH + 12, rect.height - 30) + 'px';
  }

  function start(stageId, vehicleId, colorId, els, onDone) {
    stop();
    session = createSession(stageId, vehicleId, colorId, els, onDone);
    layoutCanvas(session);
    PB.input.reset();
    PB.input.setEnabled(true);
    els.timer.textContent = '00:' + String(session.stage.timeLimit).padStart(2, '0');
    els.timer.classList.remove('urgent');
    els.status.textContent = session.stage.label; // 완료/시간초과 시 enterSettle()이 덮어씀
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
    PB.input.setEnabled(false);
  }

  function enterSettle(s, label) {
    s.phase = 'settle';
    s.settleTimer = 0;
    PB.input.setEnabled(false);
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
      PK.physics.step(s.car, PB.input.state, dt, s.colliders, s.elapsed);

      const hitNow = s.car.hits.length > s.hitCountSeen;
      s.hitCountSeen = s.car.hits.length;
      s.history.push({ t: s.elapsed, speed: s.car.speed, steer: s.car.steer, hit: hitNow });
      while (s.history.length && s.history[0].t < s.elapsed - 3.5) s.history.shift();

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
      } else if (s.elapsed >= s.stage.timeLimit) {
        s.timedOut = true;
        enterSettle(s, '시간 초과');
      }

      const remain = Math.max(0, Math.ceil(s.stage.timeLimit - s.elapsed));
      s.els.timer.textContent = '00:' + String(remain).padStart(2, '0');
      s.els.timer.classList.toggle('urgent', remain <= 10);
      s.els.gear.classList.toggle('on', s.car.reversing);
      if (s.elapsed > P.hintTime) s.els.hint.classList.add('hidden');
    } else if (s.phase === 'settle') {
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
    PB.renderer.renderStage(s.els.canvas, s.cssW, s.cssH, s.layout, s.car, s.colorHex, s.elapsed);
  }

  function finish(s) {
    const result = PB.scoring.evaluate({
      car: s.car, layout: s.layout,
      parked: s.parked, timedOut: s.timedOut,
      parkedAt: s.parkedAt, restAt: s.restAt, elapsed: s.elapsed,
      history: s.history, timeLimit: s.stage.timeLimit,
    });
    const snapshot = PB.renderer.snapshot(s.layout, s.car, s.colorHex, 720);
    const snapshotWide = PB.renderer.snapshot(s.layout, s.car, s.colorHex, 720, 1.6);
    const c = PK.physics.center(s.car);
    const t = s.layout.target;
    const pose = { dx: c.x - t.cx, dy: c.y - t.cy, hdeg: s.car.heading * 180 / Math.PI };
    const done = s.onDone;
    const stageId = s.stageId;
    rafId = 0;
    session = null;
    PB.input.setEnabled(false);
    done({ stageId, vehicleId: s.vehicleId, colorId: s.colorId, result, snapshot, snapshotWide, pose, hits: result.hits, elapsed: s.elapsed, parked: s.parked });
  }

  function resize() {
    if (!session) return;
    layoutCanvas(session);
    render(session);
  }

  PB.play = { start, stop, resize, getSession: () => session };
})();
