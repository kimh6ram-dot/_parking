/* 도로주행 — 친구 도전장 (기록을 링크 해시에 직접 담는다. 서버 없음)
 * 주차게임의 #battle/... 와 절대 충돌하지 않도록 완전히 다른 prefix(#driving-battle/)를 쓴다.
 * 토큰: v1.<base64url JSON> — { n:닉네임, st:스테이지, s:총점, b:[세부6], v:차종, c:색상,
 * p:[목적지 중심 기준 dx*10, heading°*10] } */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;

  function b64uEncode(obj) {
    const b = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(str) {
    let b = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  }

  /* rec: {nickname, stageId, total, parts, vehicleId, colorId, pose:{dx,hdeg}} */
  function makeToken(rec) {
    const payload = {
      n: (rec.nickname || '').slice(0, 12),
      st: rec.stageId,
      s: rec.total,
      b: DRIVING.SCORE_LABELS.map(([k]) => rec.parts[k]),
      v: rec.vehicleId,
      c: rec.colorId,
      p: [Math.round(rec.pose.dx * 10), Math.round(rec.pose.hdeg * 10)],
    };
    return 'v1.' + b64uEncode(payload);
  }

  function parseToken(token) {
    try {
      if (!token || token.indexOf('v1.') !== 0) return null;
      const d = b64uDecode(token.slice(3));
      if (typeof d.s !== 'number' || !window.PK.VEHICLES[d.v] || !window.PK.COLORS[d.c] || !DRIVING.STAGES[d.st - 1]) return null;
      const parts = {};
      DRIVING.SCORE_LABELS.forEach(([k], i) => { parts[k] = Number(d.b && d.b[i]) || 0; });
      return {
        nickname: d.n || '친구', stageId: d.st, total: d.s, parts,
        vehicleId: d.v, colorId: d.c,
        pose: { dx: d.p[0] / 10, hdeg: d.p[1] / 10 },
      };
    } catch (_) { return null; }
  }

  function buildUrl(token) { return location.href.split('#')[0] + '#driving-battle/' + token; }
  function parseHash() {
    const m = location.hash.match(/^#driving-battle\/(.+)$/);
    return m ? m[1] : null;
  }

  /* 도전장 기록의 최종 위치를 다시 그린 캔버스(목적지 부근에 pose.dx만큼 어긋난 채로) */
  function snapshotOf(rec, px, aspect) {
    const stage = DRIVING.STAGES[rec.stageId - 1];
    const v = window.PK.VEHICLES[rec.vehicleId];
    const d = stage.destination;
    const car = DRIVING.physics.createCar(rec.vehicleId, d.cx + rec.pose.dx, d.y1 - 10, rec.pose.hdeg * Math.PI / 180);
    car.vehicle = v;
    return DRIVING.renderer.snapshot(stage, car, window.PK.COLORS[rec.colorId].body, [], px || 480, aspect || 1);
  }

  DRIVING.battle = { makeToken, parseToken, buildUrl, parseHash, snapshotOf };
})();
