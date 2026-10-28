/* 주차하기 베타 — 진행상황 저장 (localStorage, 기존 주차게임·도로주행과 키 절대 공유하지 않음) */
(function () {
  'use strict';

  const PB = (window.PB = window.PB || {});
  const KEY = 'parkingBetaProgressV1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { unlocked: 1, best: {} };
      const d = JSON.parse(raw);
      const unlocked = Math.min(PB.STAGES.length, Math.max(1, d.unlocked || 1));
      return { unlocked, best: d.best || {} };
    } catch (_) { return { unlocked: 1, best: {} }; }
  }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) { /* 저장 불가 환경 무시 */ }
  }

  function isUnlocked(stageId) { return stageId <= load().unlocked; }

  /* 기록은 스테이지+차종 조합별로 따로 저장(차종이 다르면 난이도 체감이 달라 직접 비교가
   * 공정하지 않음 — 도로주행 progress.js와 같은 기준). */
  function bestKey(stageId, vehicleId) { return stageId + ':' + (vehicleId || 'sedan'); }
  function bestScore(stageId, vehicleId) {
    const d = load();
    const v = d.best[bestKey(stageId, vehicleId)];
    return v != null ? v : null;
  }

  /* 주차 성공 시 다음 스테이지 해금, 점수는 스테이지+차종 조합별 최고점만 갱신.
   * isNewRecord를 반환해 결과 화면이 "신기록" 표시를 할 수 있게 한다. */
  function recordResult(stageId, score, parked, vehicleId) {
    const d = load();
    if (parked && stageId + 1 > d.unlocked) d.unlocked = Math.min(PB.STAGES.length, stageId + 1);
    const key = bestKey(stageId, vehicleId);
    const prevBest = d.best[key] != null ? d.best[key] : null;
    const isNewRecord = prevBest == null || score > prevBest;
    if (isNewRecord) d.best[key] = score;
    save(d);
    return Object.assign({}, d, { isNewRecord, prevBest });
  }

  PB.progress = { load, isUnlocked, bestScore, recordResult };
})();
