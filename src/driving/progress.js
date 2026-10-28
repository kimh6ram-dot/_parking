/* 도로주행 — 진행상황 저장 (localStorage, 주차게임과 키 절대 공유하지 않음) */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;
  const KEY = 'drivingProgressV1';

  /* 2026-09-28: STAGE 10개 → 5개 축소(§50) 이전에 저장된 기록(unlocked가 6 이상)이 남아있는
   * 브라우저가 있을 수 있다 — 그런 값을 그대로 쓰면 존재하지 않는 STAGE 6 화면으로 진입을
   * 시도하게 되므로, 읽어올 때 항상 현재 스테이지 수로 clamp한다(저장값 자체는 덮어쓰지
   * 않고 읽을 때만 보정 — 그래야 나중에 스테이지가 늘어나도 원래 기록이 남아있다). */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { unlocked: 1, best: {} };
      const d = JSON.parse(raw);
      const unlocked = Math.min(DRIVING.STAGES.length, Math.max(1, d.unlocked || 1));
      return { unlocked, best: d.best || {} };
    } catch (_) { return { unlocked: 1, best: {} }; }
  }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) { /* 저장 불가 환경 무시 */ }
  }

  function isUnlocked(stageId) { return stageId <= load().unlocked; }

  /* 2026-10-02: 기록을 "스테이지"만이 아니라 "스테이지+차종" 단위로 따로 저장한다(요청 —
   * "기록은 차종과 난이도가 같은 조건끼리 비교한다". 난이도 선택 자체는 이번에 추가하지
   * 않으므로 차종만 키에 더한다). 기존 d.best[stageId](숫자) 형식으로 저장된 구버전 기록이
   * 남아있을 수 있어, 읽을 때 숫자면 '레거시' 차종 키로 한 번 변환해 보존한다(그냥 버리지
   * 않음 — 이전 세션 기록이 사라지면 안 됨). */
  function bestKey(stageId, vehicleId) { return stageId + ':' + (vehicleId || 'sedan'); }
  function bestScore(stageId, vehicleId) {
    const d = load();
    const legacy = d.best[stageId];
    const v = d.best[bestKey(stageId, vehicleId)];
    if (v != null) return v;
    return typeof legacy === 'number' ? legacy : null; // 차종별 기록이 아직 없으면 구버전 기록을 참고용으로 보여줌
  }

  /* 클리어(목적지 도착) 시 다음 스테이지 해금, 점수는 스테이지+차종 조합별 최고점만 갱신.
   * 점수 컷 없음(§23). 반환값에 isNewRecord를 포함해 결과 화면이 "신기록" 표시를 할 수 있게 한다. */
  function recordResult(stageId, score, arrived, vehicleId) {
    const d = load();
    if (arrived && stageId + 1 > d.unlocked) d.unlocked = Math.min(DRIVING.STAGES.length, stageId + 1);
    const key = bestKey(stageId, vehicleId);
    const prevBest = d.best[key] != null ? d.best[key] : null;
    const isNewRecord = prevBest == null || score > prevBest;
    if (isNewRecord) d.best[key] = score;
    save(d);
    return Object.assign({}, d, { isNewRecord, prevBest });
  }

  DRIVING.progress = { load, isUnlocked, bestScore, recordResult };
})();
