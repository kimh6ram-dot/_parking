/* 도로주행 — 동적 장애물(NPC) 스크립트 엔진
 * 5가지 kind만으로 스펙의 모든 돌발상황을 표현한다. 전부 "플레이어 접근 거리(reactDistance)"
 * 또는 "자기 자신의 진행 거리(weave)"로만 트리거되는 결정론적 상태머신 — Math.random 없음,
 * 순간이동 없음(전부 phaseT 기반 보간으로 이동). */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const SIGNAL_LEAD_DIST = 90; // laneChange 깜빡이가 drift보다 먼저 켜지는 거리(§1~2, world unit)

  /* 횡단보도 이벤트 타이밍 상수(§4 — "보행 시간 고정", 랜덤 금지). RED_LEAD: RED로 바뀐 뒤
   * 보행자가 실제로 발을 떼기까지의 대기(§ "약 0.5초 뒤 보행 시작"). CLEAR_MARGIN: 보행자가
   * 다 건넌 뒤 GREEN이 되기까지의 안전 여유. MAX_CROSSING: fail-safe — 이 시간이 지나면
   * 무슨 일이 있어도 강제로 반대편까지 이동시키고 CLEARED 처리(§5, 무한 대기 절대 금지). */
  const CROSSWALK_RED_LEAD = 0.5;
  const CROSSWALK_CLEAR_MARGIN = 0.5;
  /* 2026-10-02: 횡단보도를 도로 폭 전체(양쪽 경계 바깥까지)로 넓히면서 자연 소요시간이
   * 늘어나(약 6초대) 기존 7초 failsafe와 거의 붙어있었다 — 정상 완주가 failsafe에 걸리지
   * 않도록 여유를 더 둔다(§3 "보행자가 완전히 건널 시간을 확보"). */
  const CROSSWALK_MAX_CROSSING = 9;

  function pathXAt(path, y) {
    if (y <= path[0].y) return path[0].x;
    const last = path[path.length - 1];
    if (y >= last.y) return last.x;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      if (y >= a.y && y <= b.y) return lerp(a.x, b.x, smooth((y - a.y) / (b.y - a.y)));
    }
    return last.x;
  }

  /* 도로 중심선 기준 헬퍼(§14 — 커브 구간에서도 NPC가 차선을 따라가게 하기 위한 공통 기반).
   * 권위 있는 좌표는 항상 "그 y에서의 실제 도로 중심(offset)"이고, 기존 x0/holdX/path.x 같은
   * 절대 좌표는 전부 스폰 시점에 offset으로 환산해 저장한다 — 이러면 stages.js의 이벤트 데이터를
   * 한 글자도 바꾸지 않아도(전부 이미 cxAt(road,y)+offset 형태로 작성돼 있었으므로) 모든 스테이지의
   * 이동 NPC가 자동으로 커브를 따라가게 된다. */
  function roadCxAt(stage, y) { return DRIVING.roadAt(stage, y).cx; }
  function toOffset(stage, y, x) { return x - roadCxAt(stage, y); }

  /* 도로 접선 각도(라디안). forward=false면 반대 방향(오는 차)으로 향한 기준 각(π)에서
   * 커브만큼 기운다. 실제 프레임 이동량이 아니라 도로 형상 자체의 기울기로 계산해서
   * 정지 상태에서도, 저속에서도 흔들리지 않는다. */
  function roadHeadingAt(stage, y, forward) {
    const d = 3;
    const a = roadCxAt(stage, y - d), b = roadCxAt(stage, y + d);
    const slope = (b - a) / (2 * d);
    const tangent = clamp(Math.atan(slope), -0.5, 0.5);
    return forward ? tangent : Math.PI - tangent;
  }

  /* stage.events → 런타임 상태를 가진 객체 배열 */
  function createRuntime(stage) {
    return stage.events.map(ev => {
      const base = { ev, id: ev.id, kind: ev.kind, phase: 'init', phaseT: 0, heading: 0, gone: false, encounter: null };
      if (ev.kind === 'brakeStop') {
        base.phase = ev.mergeFirst ? 'merge' : 'cruise';
        base.y = ev.spawnY;
        base.offX0 = toOffset(stage, ev.spawnY, ev.x0);
        base.offMergeFrom = ev.mergeFirst ? toOffset(stage, ev.spawnY, ev.mergeFrom) : base.offX0;
        base.x = ev.mergeFirst ? ev.mergeFrom : ev.x0;
        base.speed = ev.cruiseSpeed;
        base.vehicleId = ev.vehicleId; base.colorId = ev.colorId;
        base.heading = roadHeadingAt(stage, base.y, true);
      } else if (ev.kind === 'laneChange') {
        base.phase = 'cruise';
        base.y = ev.spawnY;
        base.offX0 = toOffset(stage, ev.spawnY, ev.x0);
        base.offHoldX = toOffset(stage, ev.spawnY, ev.holdX);
        base.x = ev.x0;
        base.vehicleId = ev.vehicleId; base.colorId = ev.colorId;
        base.heading = roadHeadingAt(stage, base.y, ev.cruiseSpeed >= 0);
        base.blinkT = 0; // 깜빡이 점멸 타이머(§1 — signal/drift 구간 내내 끊기지 않고 계속 흐름)
      } else if (ev.kind === 'weave') {
        base.phase = 'move';
        base.offPath = ev.path.map(p => ({ y: p.y, x: toOffset(stage, p.y, p.x) }));
        base.x = ev.path[0].x; base.y = ev.spawnY;
        base.vehicleId = ev.vehicleId; base.colorId = ev.colorId;
        base.heading = roadHeadingAt(stage, base.y, ev.cruiseSpeed >= 0);
      } else if (ev.kind === 'dash') {
        base.phase = 'hidden';
        base.x = ev.x0; base.y = ev.y;
      } else if (ev.kind === 'crosswalkPedestrian') {
        // 2026-09-28 전면 재설계(§1~9) — 차량 신호(RED/GREEN) + 보행자(WAITING/CROSSING/CLEARED)를
        // 하나의 결정론적 상태머신으로 묶는다. 트리거는 기존과 동일하게 reactDistance 기반(위치
        // 결정론)이고, 그 이후 단계 길이는 전부 고정 시간 상수라 "언제 끝날지 모르는" 무한 대기가
        // 생길 수 없다(§4,§14 — 랜덤 대기시간 금지와도 일치).
        base.phase = 'WAITING';
        base.light = 'GREEN'; // 차량 신호. 트리거 전까지는 GREEN(평상시)
        base.x = ev.x0; base.y = ev.y;
        base.heading = 0;
        // 신호등을 그릴 고정 위치(정지선 쪽, 도로 가장자리) — 이벤트에 명시돼 있으면 그걸 쓰고,
        // 없으면 횡단보도 끝(더 큰 쪽) 옆에 합리적인 기본 위치를 잡는다.
        base.lightX = ev.lightX != null ? ev.lightX : Math.max(ev.x0, ev.x1) + 22;
        base.lightY = ev.lightY != null ? ev.lightY : ev.y - 10;
      }
      return base;
    });
  }

  function approaching(car, y, reactDistance) {
    return reactDistance > 0 && car.y < y && (y - car.y) <= reactDistance;
  }

  /* 실제 이동량(prevX/prevY→x/y)으로부터 heading을 구한다 — 도로 접선 성분과 NPC 자신의
   * 차선변경/회피 성분이 합쳐진 진짜 이동 방향이 그대로 나온다(정지 중이면 이전 heading 유지).
   * 2026-09-28: weave 경로처럼 몇 개 안 되는 웨이포인트를 잇는 경우, 웨이포인트 경계에서 프레임
   * 하나 사이에 순간 이동 각도가 크게 튀어(실측: "이유 없이 비스듬하게 움직인다" 원인) 부자연스러워
   * 보였다 — 목표 heading으로 초당 최대 회전각(MAX_TURN_RATE)까지만 부드럽게 근접시킨다. 일반
   * 커브 추종(도로 접선 변화)은 이보다 훨씬 느리게 바뀌므로 체감상 전혀 다르지 않고, 급격한
   * 프레임 단위 스냅만 걸러진다. */
  const MAX_TURN_RATE = 3.2; // rad/s
  function headingFromDelta(o, prevX, prevY, dt) {
    const dx = o.x - prevX, dy = o.y - prevY;
    if (Math.abs(dx) < 1e-5 && Math.abs(dy) < 1e-5) return;
    const target = Math.atan2(-dx, Math.abs(dy) > 1e-5 ? dy : (dy >= 0 ? 1e-5 : -1e-5));
    if (o.heading == null || !dt) { o.heading = target; return; }
    let diff = target - o.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxStep = MAX_TURN_RATE * dt;
    o.heading += clamp(diff, -maxStep, maxStep);
  }

  function update(list, car, dt, stage) {
    for (const o of list) {
      const ev = o.ev;
      if (o.kind === 'brakeStop') {
        const prevX = o.x, prevY = o.y;
        if (o.phase === 'merge') {
          o.phaseT += dt;
          const t = clamp(o.phaseT / ev.mergeTime, 0, 1);
          o.y += ev.cruiseSpeed * dt;
          o.x = roadCxAt(stage, o.y) + lerp(o.offMergeFrom, o.offX0, smooth(t));
          if (t >= 1) { o.phase = 'cruise'; }
        } else if (o.phase === 'cruise') {
          o.y += ev.cruiseSpeed * dt;
          o.x = roadCxAt(stage, o.y) + o.offX0;
          if (approaching(car, o.y, ev.reactDistance)) { o.phase = 'brake'; o.phaseT = 0; o.speed = ev.cruiseSpeed; }
        } else if (o.phase === 'brake') {
          o.phaseT += dt;
          o.speed = Math.max(0, ev.cruiseSpeed * (1 - o.phaseT / ev.brakeTime));
          o.y += o.speed * dt;
          o.x = roadCxAt(stage, o.y) + o.offX0;
          if (o.speed <= 0.05) { o.phase = 'stopped'; o.speed = 0; }
        }
        headingFromDelta(o, prevX, prevY, dt);
        o.brakeLight = o.phase === 'brake' || o.phase === 'stopped';
      } else if (o.kind === 'laneChange') {
        const prevX = o.x, prevY = o.y;
        if (o.phase === 'cruise') {
          o.y += ev.cruiseSpeed * dt;
          o.x = roadCxAt(stage, o.y) + o.offX0;
          // 실제 차선 변경(drift) 시작보다 SIGNAL_LEAD_DIST만큼 먼저 깜빡이부터 켠다(§1~2 —
          // 전형적인 순항 속도(약 90u/s) 기준 약 1초 앞서 신호를 주는 셈).
          if (ev.driftTime > 0 && approaching(car, o.y, ev.reactDistance + SIGNAL_LEAD_DIST)) { o.phase = 'signal'; o.phaseT = 0; }
        } else if (o.phase === 'signal') {
          o.blinkT += dt;
          o.y += ev.cruiseSpeed * dt;
          o.x = roadCxAt(stage, o.y) + o.offX0;
          if (approaching(car, o.y, ev.reactDistance)) { o.phase = 'drift'; o.phaseT = 0; }
        } else if (o.phase === 'drift') {
          o.blinkT += dt;
          o.phaseT += dt;
          const t = clamp(o.phaseT / ev.driftTime, 0, 1);
          o.y += ev.cruiseSpeed * dt;
          o.x = roadCxAt(stage, o.y) + lerp(o.offX0, o.offHoldX, smooth(t));
          if (t >= 1) { o.phase = 'hold'; }
        } else if (o.phase === 'hold') {
          o.y += ev.cruiseSpeed * dt;
          o.x = roadCxAt(stage, o.y) + o.offHoldX;
        }
        headingFromDelta(o, prevX, prevY, dt);
        o.brakeLight = false;
      } else if (o.kind === 'weave') {
        const prevX = o.x, prevY = o.y;
        o.y += ev.cruiseSpeed * dt;
        o.x = roadCxAt(stage, o.y) + pathXAt(o.offPath, o.y);
        headingFromDelta(o, prevX, prevY, dt);
        if (o.y >= ev.path[ev.path.length - 1].y) o.gone = true;
      } else if (o.kind === 'dash') {
        if (o.phase === 'hidden') {
          if (approaching(car, o.y, ev.reactDistance)) { o.phase = 'telegraph'; o.phaseT = 0; }
        } else if (o.phase === 'telegraph') {
          o.phaseT += dt;
          if (o.phaseT >= 0.35) { o.phase = 'dashing'; o.phaseT = 0; }
        } else if (o.phase === 'dashing') {
          o.phaseT += dt;
          const t = clamp(o.phaseT / ev.dashTime, 0, 1);
          o.x = lerp(ev.x0, ev.xTarget, t);
          if (t >= 1) { o.phase = 'gone'; o.gone = true; }
        }
      } else if (o.kind === 'crosswalkPedestrian') {
        // WAITING(신호 트리거 전: GREEN) → WAITING(RED_LEAD 대기: RED) → CROSSING(RED) →
        // CLEAR_MARGIN(RED 유지) → CLEARED(GREEN). 한 번 CROSSING에 들어가면 절대 WAITING으로
        // 돌아가지 않고, 속도가 0이 되는 일도 없다(§3 핵심 요구사항) — fail-safe(§5)까지 포함해
        // 반드시 끝난다.
        const dir = ev.x1 > ev.x0 ? 1 : -1;
        if (o.phase === 'WAITING') {
          if (o.light === 'GREEN') {
            if (approaching(car, o.y, ev.reactDistance)) { o.light = 'RED'; o.phaseT = 0; }
          } else {
            o.phaseT += dt;
            if (o.phaseT >= CROSSWALK_RED_LEAD) { o.phase = 'CROSSING'; o.phaseT = 0; }
          }
        } else if (o.phase === 'CROSSING') {
          o.phaseT += dt;
          o.x += dir * (ev.walkSpeed || 22) * dt;
          o.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2; // 걷는 방향에 맞춰(§13)
          const reached = (dir > 0 && o.x >= ev.x1) || (dir < 0 && o.x <= ev.x1);
          const failSafe = o.phaseT >= CROSSWALK_MAX_CROSSING; // §5 — 버그가 있어도 영원히 못 막음
          if (reached || failSafe) { o.x = ev.x1; o.phase = 'CLEAR_MARGIN'; o.phaseT = 0; }
        } else if (o.phase === 'CLEAR_MARGIN') {
          o.phaseT += dt;
          if (o.phaseT >= CROSSWALK_CLEAR_MARGIN) { o.phase = 'CLEARED'; o.light = 'GREEN'; }
        }
        // CLEARED: 완료 상태 유지, 재초기화 없음(§15) — 아무 것도 하지 않는다.
      }

      // 충돌 시각 jolt(§2 "상대 차량도 약간 밀리거나 흔들리면 더 좋음") — 결정론적 이동 계산이
      // 끝난 뒤 순수 덧셈으로만 얹고 빠르게 감쇠시킨다. 실제 시뮬레이션(스코어/도전장에 쓰이는
      // 위치)은 건드리지 않고 화면에 보이는 좌표만 잠깐 흔든다.
      if (o.hitJoltT > 0) {
        o.hitJoltT = Math.max(0, o.hitJoltT - dt);
        const decay = o.hitJoltT / 0.35;
        o.x += (o.hitJoltX || 0) * decay;
        o.hitJoltX *= Math.max(0, 1 - dt * 9);
        o.hitJoltHeading = (o.hitJoltHeading || 0) * Math.max(0, 1 - dt * 9);
        if (o.heading != null) o.heading += o.hitJoltHeading * decay;
      }
    }
  }

  /* 충돌 판정에 쓸 OBB. 사람/킥보드는 작은 사각형, 차량류는 실제 vehicle 치수 재사용 */
  function obbOf(o) {
    if (o.kind === 'dash') return DRIVING.physics.obbOf(o.x, o.y, 0, 20, 34);
    // 2026-10-02: person.png 시각 크기를 크게 키운 만큼(renderer.js PERSON_TARGET_H) 충돌
    // 판정도 비례해서 키워 시각 크기와 크게 어긋나지 않게 한다(16×16 → 26×28).
    if (o.kind === 'crosswalkPedestrian') return DRIVING.physics.obbOf(o.x, o.y, 0, 26, 28);
    const v = window.PK.VEHICLES[o.vehicleId];
    return DRIVING.physics.obbOf(o.x, o.y, o.heading || 0, v.width, v.length);
  }
  /* 렌더러가 "지금 화면에 그릴 필요가 있는지" 판단 */
  function isVisible(o) {
    if (o.kind === 'dash') return o.phase !== 'hidden' && o.phase !== 'gone';
    if (o.kind === 'weave') return !o.gone;
    return true;
  }
  function isSolid(o) {
    if (o.kind === 'dash') return o.phase === 'telegraph' || o.phase === 'dashing';
    if (o.kind === 'crosswalkPedestrian') return o.phase !== 'CLEARED';
    return true;
  }

  DRIVING.obstacles = { createRuntime, update, obbOf, isVisible, isSolid };
})();
