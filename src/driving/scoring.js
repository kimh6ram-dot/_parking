/* 도로주행 — 채점 (100점: 안전운전30·차선유지20·신호준수20·속도조절15·돌발대처10·마무리5)
 * play.js가 매 프레임 tracker를 갱신하고, 종료 시 evaluate(tracker)를 한 번 호출한다.
 * Math.random() 사용 금지 — 등급 코멘트는 (총점+충돌수)로 결정론적으로 고른다. */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;
  const MAX = DRIVING.SCORE_MAX;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function createTracker(stage) {
    return {
      stage,
      laneOffTime: 0, laneCrossTime: 0, maxLaneRatio: 0, laneViolationCount: 0, wasOverLane: false,
      speedOverTime: 0, zoneOverTime: 0,
      collisions: [],            // {npcId, kind, hard, y}
      coneHits: 0, hardBrakes: 0, prevSpeed: 0, roadEdgeHitCount: 0,
      stopLineChecks: {},        // stopLine.y -> {done, npcRef}
      stopLineViolations: 0,     // 실제 신호(RED) 위반만 카운트(§8 — 2026-09-28 재설계)
      pedestrianYieldChecks: {}, // npc.id -> true(이미 카운트됨, 중복 방지)
      pedestrianYieldViolations: 0, // 신호와 무관하게 "건너는 사람에게 너무 붙어 지나감"(§9~10)
      npcMinDist: {},            // id -> 최소 접근거리(월드 유닛)
      npcOutcome: {},            // id -> 'hit' | 'close' | 'handled'
      elapsed: 0,
      // 2026-10-02 추가 — 잘한 행동 피드백(§4, play.js가 매 프레임 읽어서 toast로 소비 후 비움)
      pendingToast: null,
      overtakeState: {},         // npc.id -> 'behind' | 'done'(추월 판정용)
      curCurveId: null, curveEntryEdgeHits: 0, // 코너링 안정성 판정용
    };
  }

  /* play.js가 매 프레임 호출 */
  function tick(t, dt, car, road, npcs) {
    t.elapsed += dt;
    const ratio = Math.abs(car.x - road.cx) / road.half;
    t.maxLaneRatio = Math.max(t.maxLaneRatio, ratio);
    if (ratio > 0.95) {
      t.laneCrossTime += dt;
      if (!t.wasOverLane) { t.laneViolationCount++; t.wasOverLane = true; }
    } else {
      if (ratio <= 0.7) t.wasOverLane = false;
      if (ratio > 0.55) t.laneOffTime += dt * (ratio - 0.55) * 2;
    }

    if (t.prevSpeed - car.speed > 18 && t.elapsed - (t.lastBrakeAt || -10) > 0.4) { t.hardBrakes++; t.lastBrakeAt = t.elapsed; }
    t.prevSpeed = car.speed;

    // 안정적인 코너링 피드백(§4) — roadSegments가 있는 스테이지(1~3)에서, 커브 구간을
    // 통과하는 동안 도로 경계 접촉(roadEdgeHitCount)이 한 번도 늘지 않았으면 그 커브를
    // 벗어나는 순간 1회만 표시한다. 레거시 PATH 코스(stage4~5, roadSegments 없음)는 대상에서
    // 제외(곡률 구간을 안정적으로 식별할 방법이 없어 임의로 추정하지 않음).
    if (t.stage.roadSegments) {
      const segs = t.stage.roadSegments;
      const curSeg = segs.find(sg => car.y >= sg.worldY0 && car.y < sg.worldY1);
      const inCurve = curSeg && curSeg.type !== 'straight';
      if (inCurve) {
        if (t.curCurveId !== curSeg.index) { t.curCurveId = curSeg.index; t.curveEntryEdgeHits = t.roadEdgeHitCount; }
      } else if (t.curCurveId != null) {
        if (t.roadEdgeHitCount === t.curveEntryEdgeHits && !t.pendingToast) t.pendingToast = '안정적인 코너링';
        t.curCurveId = null;
      }
    }

    const limit = DRIVING.speedLimitAt(t.stage, car.y);
    const kmh = DRIVING.kmh(Math.abs(car.speed));
    const over = kmh - limit;
    if (over > 0) {
      const weight = clamp(over / 10, 0, 1.6) * dt;
      t.speedOverTime += weight;
      if (limit <= 35) t.zoneOverTime += weight;
    }

    // 신호 위반(§8): "정지선/횡단보도 통과 시 실제 연관 신호가 RED였는가"만 본다 — 속도는 더 이상
    // 판정 기준이 아니다(신호등도 없는데 속도만으로 신호 위반 처리하던 예전 로직이 원인 버그).
    for (const stopLine of (t.stage.static || [])) {
      if (stopLine.type !== 'stopLine') continue;
      const rec = t.stopLineChecks[stopLine.y] || (t.stopLineChecks[stopLine.y] = { done: false, npcRef: undefined, stopToasted: false });
      if (rec.npcRef === undefined) {
        let best = null, bestDist = Infinity;
        npcs.forEach(o => {
          if (o.kind !== 'crosswalkPedestrian') return;
          const d = Math.abs(o.y - stopLine.y);
          if (d < 60 && d < bestDist) { bestDist = d; best = o; }
        });
        rec.npcRef = best; // 없으면 null로 고정 — 신호등 없는 구간(§9)
      }
      // 정지 성공 피드백(§4) — 빨간불일 때 정지선 앞(50유닛 이내)에서 실제로 서면 1회만 표시.
      if (!rec.stopToasted && rec.npcRef && rec.npcRef.light === 'RED' &&
          car.y < stopLine.y && car.y > stopLine.y - 50 && Math.abs(car.speed) <= DRIVING.PLAY.arriveSpeedMax) {
        rec.stopToasted = true;
        if (!t.pendingToast) t.pendingToast = '정지 성공';
      }
      if (!rec.done && car.y > stopLine.y) {
        rec.done = true;
        if (rec.npcRef && rec.npcRef.light === 'RED') t.stopLineViolations++;
      }
    }

    npcs.forEach(o => {
      if (!DRIVING.obstacles.isVisible(o)) return;
      const dx = o.x - car.x, dy = o.y - car.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const prev = t.npcMinDist[o.id];
      if (prev == null || dist < prev) t.npcMinDist[o.id] = dist;
      // 보행자 보호 위반(§9~10): 신호와 무관하게, 아직 다 안 건넌(CROSSING) 사람에게 위험할
      // 만큼 붙어 지나가면 별도로 기록한다. 실제 충돌은 recordCollision이 이미 따로 처리한다.
      if (o.kind === 'crosswalkPedestrian' && o.phase === 'CROSSING' && !t.pedestrianYieldChecks[o.id]) {
        if (dist < 34 && Math.abs(car.y - o.y) < 20) { t.pedestrianYieldChecks[o.id] = true; t.pedestrianYieldViolations++; }
      }
      // 깔끔한 추월 피드백(§4) — 같은 방향(cruiseSpeed>=0)으로 가는 laneChange/brakeStop류
      // NPC를 뒤에서 따라오다 충돌 없이 앞지르면 1회만 표시한다.
      if ((o.kind === 'laneChange' || o.kind === 'brakeStop') && o.ev && o.ev.cruiseSpeed >= 0) {
        const st = t.overtakeState[o.id];
        if (st === undefined) t.overtakeState[o.id] = car.y < o.y ? 'behind' : 'done';
        else if (st === 'behind' && car.y > o.y + 5) {
          t.overtakeState[o.id] = 'done';
          const hitThis = t.collisions.some(c => c.npcId === o.id);
          if (!hitThis && !t.pendingToast) t.pendingToast = '깔끔한 추월';
        }
      }
    });
  }

  function recordCollision(t, npcId, kind, hard, y) {
    t.collisions.push({ npcId, kind, hard, y });
    if (npcId) t.npcOutcome[npcId] = 'hit';
  }

  function finalizeOutcomes(t, npcs) {
    npcs.forEach(o => {
      if (t.npcOutcome[o.id] === 'hit') return;
      const d = t.npcMinDist[o.id];
      if (d == null) return;
      const v = o.kind === 'dash' ? 26 : o.kind === 'crosswalkPedestrian' ? 22 : (window.PK.VEHICLES[o.vehicleId].width + 24);
      t.npcOutcome[o.id] = d < v ? 'close' : 'handled';
    });
  }

  function evaluate(t, ctx) {
    // ctx: { arrived(bool), timedOut(bool), car, stage, distanceToDestination }
    finalizeOutcomes(t, ctx.npcs || []);

    const collisionCount = t.collisions.length;
    const hardHit = t.collisions.some(c => c.hard);
    const parts = { safety: MAX.safety, lane: MAX.lane, signal: MAX.signal, speed: MAX.speed, react: MAX.react, finish: MAX.finish };

    // 안전 운전 30: 충돌 감점(약 -4 / 강 -8), 사람·킥보드 충돌·보행자 보호 위반은 추가 감점
    let safetyPen = 0;
    t.collisions.forEach(c => { safetyPen += c.hard ? 8 : 4; if (c.kind === 'dash' || c.kind === 'crosswalkPedestrian') safetyPen += 6; });
    safetyPen += t.pedestrianYieldViolations * 5;
    parts.safety = clamp(MAX.safety - safetyPen, 0, MAX.safety);

    // 차선 유지 20
    parts.lane = Math.round(clamp(MAX.lane - (t.laneOffTime * 1.2 + t.laneCrossTime * 4), 0, MAX.lane));

    // 신호 준수 20: 실제 차량 신호등이 있는 정지선이 없는 스테이지는 기본 만점(§9 — 신호등 없는
    // 횡단보도에서는 신호 위반 자체가 성립하지 않는다).
    const hasSignal = Object.values(t.stopLineChecks).some(rec => rec.npcRef);
    parts.signal = hasSignal ? clamp(MAX.signal - t.stopLineViolations * 10, 0, MAX.signal) : MAX.signal;

    // 속도 조절 15
    parts.speed = Math.round(clamp(MAX.speed - (t.speedOverTime * 1.0 + t.zoneOverTime * 1.6), 0, MAX.speed));

    // 돌발 대처 10: 스크립트 이벤트가 없으면 기본 만점
    const npcIds = Object.keys(t.npcOutcome);
    if (npcIds.length) {
      let reactPen = 0;
      npcIds.forEach(id => { const o = t.npcOutcome[id]; if (o === 'hit') reactPen += 4; else if (o === 'close') reactPen += 1; });
      parts.react = clamp(MAX.react - reactPen, 0, MAX.react);
    }

    // 마무리 5: 도착 실패면 0, 결승선 직전에 충돌이 있었으면 감점
    // (결승선은 통과 즉시 완료라 "감속해서 멈췄는가"는 더 이상 평가하지 않는다 —
    // 2026-09-22 사용자 확정: 정차 요구 제거, 통과 즉시 종료로 변경)
    if (!ctx.arrived) parts.finish = 0;
    else {
      const finPen = t.collisions.some(c => ctx.car.y - c.y < 120) ? 3 : 0;
      parts.finish = clamp(MAX.finish - finPen, 0, MAX.finish);
    }

    let total = parts.safety + parts.lane + parts.signal + parts.speed + parts.react + parts.finish;
    if (!ctx.arrived) total = Math.min(total, DRIVING.INCOMPLETE_SCORE_CAP);

    const grade = DRIVING.GRADES.find(g => total >= g.min) || DRIVING.GRADES[DRIVING.GRADES.length - 1];
    const comment = grade.comments[(total + collisionCount) % grade.comments.length];

    const notes = buildNotes(t, ctx, collisionCount, hardHit);
    const records = buildRecords(t, collisionCount);
    const bestAspect = buildBestAspect(parts);
    return { total, parts, grade: grade.title, comment, notes, records, collisionCount, bestAspect };
  }

  /* 2026-10-02 — 결과 화면에 "가장 큰 감점 이유"(records[0]/notes[0], 기존)뿐 아니라 "잘한
   * 점"도 함께 보여주기 위한 보조 계산(§5). 배점 대비 만점에 가장 가까운 항목을 고르되,
   * 거의 만점(99% 이상)이 아니면 "특별히 잘했다고 내세울 게 없다"로 보고 null을 반환한다
   * (아무거나 긍정 문구를 억지로 붙이지 않음 — 요청사항 "점수를 임의로 후하게 바꾸지 말고"). */
  const BEST_ASPECT_LABEL = {
    safety: '무사고 운전', lane: '안정적인 차선 유지', signal: '신호 준수',
    speed: '속도 조절 양호', react: '돌발 대처 양호', finish: '깔끔한 마무리',
  };
  function buildBestAspect(parts) {
    let bestKey = null, bestRatio = -1;
    DRIVING.SCORE_LABELS.forEach(([key]) => {
      const ratio = MAX[key] > 0 ? parts[key] / MAX[key] : 0;
      if (ratio > bestRatio) { bestRatio = ratio; bestKey = key; }
    });
    return bestRatio >= 0.99 ? BEST_ASPECT_LABEL[bestKey] : null;
  }

  /* 가장 중요한 특이사항 1개만 고른다(2026-09-28 — §48: "한 판에 모든 경고문을 상단에 다
   * 나열하지 않는다"). 후보를 만들고 심각도(n) 내림차순 정렬한 뒤 맨 앞 하나만 쓴다 — 이
   * 스테이지에 해당 요소 자체가 없으면(신호 없음/콘 없음 등) 애초에 후보에서 제외된다. */
  function buildRecords(t, collisionCount) {
    const hasSignal = Object.values(t.stopLineChecks).some(rec => rec.npcRef);
    const hasCones = (t.stage.static || []).some(s => s.type === 'cone');
    const closeCalls = Object.values(t.npcOutcome).filter(o => o === 'close').length;
    const cand = [];
    if (hasSignal) cand.push({ n: t.stopLineViolations, text: '신호 위반 ' + t.stopLineViolations + '회' });
    if (t.pedestrianYieldViolations > 0) cand.push({ n: t.pedestrianYieldViolations, text: '보행자 미양보 ' + t.pedestrianYieldViolations + '회' });
    if (t.zoneOverTime > 0.05) cand.push({ n: t.zoneOverTime, text: '보호구역 과속 ' + t.zoneOverTime.toFixed(1) + '초' });
    if (hasCones) cand.push({ n: t.coneHits, text: '콘 접촉 ' + t.coneHits + '회' });
    if (t.hardBrakes > 0) cand.push({ n: t.hardBrakes, text: '급정거 ' + t.hardBrakes + '회' });
    if (closeCalls > 0) cand.push({ n: closeCalls, text: '아슬아슬 ' + closeCalls + '회' });
    if (t.roadEdgeHitCount > 0) cand.push({ n: t.roadEdgeHitCount, text: '도로 경계 접촉 ' + t.roadEdgeHitCount + '회' });
    cand.push({ n: t.laneViolationCount, text: '차선 이탈 ' + t.laneViolationCount + '회' });
    cand.push({ n: collisionCount, text: '충돌 ' + collisionCount + '회' });
    cand.sort((a, b) => b.n - a.n);
    return cand.slice(0, 1).map(c => c.text);
  }

  function buildNotes(t, ctx, collisionCount, hardHit) {
    const notes = [];
    if (ctx.timedOut) {
      notes.push(ctx.distanceToDestination < 300 ? '시간 초과. 거의 다 왔는데요.' : '시간 초과. 목적지가 기다리다 갔습니다.');
      return notes;
    }
    // 1) 보행자/킥보드 위험 상황(§11 — 실제 충돌 우선, 그다음 "충돌은 안 했지만 너무 붙어 지나감")
    const pedHit = t.collisions.find(c => c.kind === 'crosswalkPedestrian');
    const kickHit = t.collisions.find(c => c.kind === 'dash');
    if (pedHit) { notes.push('사람이 먼저입니다.'); return notes; }
    if (kickHit) { notes.push('킥라니와 인사하셨습니다.'); return notes; }
    if (t.pedestrianYieldViolations > 0) { notes.push('보행자 먼저 보내주세요.'); return notes; }

    // 2) 충돌(구체 이벤트 우선, 없으면 횟수 기반)
    const taxiHit = t.collisions.find(c => c.kind === 'brakeStop');
    const motoHit = t.collisions.find(c => c.kind === 'weave');
    if (hardHit || collisionCount >= 3) {
      notes.push(collisionCount >= 3 ? '오늘 사고가 조금 많았습니다. (' + collisionCount + '회)' : '목적지보다 보험사가 먼저입니다.');
      return notes;
    }
    if (taxiHit) { notes.push('택시는 멈췄고, 당신은 못 멈췄습니다.'); return notes; }
    if (motoHit) { notes.push('배달은 가야 하는데 같이 가실 필요는 없습니다.'); return notes; }
    if (collisionCount === 2) { notes.push('접촉 2회. 보험사 번호 아시죠?'); return notes; }
    if (collisionCount === 1) { notes.push('접촉 1회. 서로 못 본 걸로 하죠.'); return notes; }

    // 3) 신호/정지선(§8,§11 — 실제 RED 상태에서 통과했을 때만. 신호등 없는 구간은 여기 안 걸림)
    const hasSignal = Object.values(t.stopLineChecks).some(rec => rec.npcRef);
    if (t.stopLineViolations >= 2) { notes.push('빨간불 보셨죠? (' + t.stopLineViolations + '회)'); return notes; }
    if (t.stopLineViolations === 1) { notes.push('빨간불 보셨죠?'); return notes; }
    if (hasSignal) { notes.push('여기서는 모범 운전자였습니다.'); return notes; }

    // 4) 보호구역 과속
    if (t.zoneOverTime > 2.5) { notes.push('어린이보호구역인데 꽤 바쁘셨나 봅니다.'); return notes; }
    if (t.zoneOverTime > 0.6) { notes.push('조금 급하셨네요.'); return notes; }

    // 5) 스크립트 이벤트 결과(성공 케이스도 포함 — 그 스테이지의 시그니처 순간)
    const kickOutcome = findOutcome(t, 'dash');
    if (kickOutcome === 'close') { notes.push('0.5초만 늦었으면 큰일 날 뻔했습니다.'); return notes; }
    if (kickOutcome) { notes.push('갑자기 나와도 잘 피하시네요.'); return notes; }
    const taxiOutcome = findOutcome(t, 'brakeStop');
    if (taxiOutcome === 'handled') { notes.push('택시의 움직임을 읽으셨네요.'); return notes; }
    const motoOutcome = findOutcome(t, 'weave');
    if (motoOutcome === 'handled') { notes.push('오토바이보다 반응이 빨랐습니다.'); return notes; }
    const cutinOutcome = findOutcome(t, 'laneChange');
    if (cutinOutcome === 'close') { notes.push('들어올 것 같긴 했잖아요.'); return notes; }

    // 6) 차선
    if (t.laneCrossTime > 1.2) { notes.push('거기는 당신 차선이 아닙니다.'); return notes; }
    if (t.laneOffTime > 2.5) { notes.push('차선이 마음에 안 드셨나 봅니다.'); return notes; }

    // 7) 일반 과속
    if (t.speedOverTime > 3) { notes.push('목적지가 도망가진 않습니다.'); return notes; }
    if (t.speedOverTime > 1) { notes.push('조금 급하셨네요.'); return notes; }

    // 8) 빗길
    if (t.stage.rain && collisionCount === 0) { notes.push('빗길인데 꽤 안정적이었습니다.'); return notes; }

    return notes; // 비어 있으면 result-ui가 일반 코멘트를 보여준다
  }
  function findOutcome(t, kind) {
    const ids = Object.keys(t.npcOutcome).filter(id => t.stage.events.find(e => e.id === id && e.kind === kind));
    if (!ids.length) return null;
    // 가장 나쁜 결과 우선(hit > close > handled) — hit은 이미 위에서 별도 처리했으므로 close/handled만 온다
    if (ids.some(id => t.npcOutcome[id] === 'close')) return 'close';
    if (ids.some(id => t.npcOutcome[id] === 'handled')) return 'handled';
    return null;
  }

  DRIVING.scoring = { createTracker, tick, recordCollision, evaluate };
})();
