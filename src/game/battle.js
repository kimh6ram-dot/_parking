/* 주차하기 — 친구 도전장 (기록을 링크 해시에 직접 담는다. 서버 없음)
 * 토큰: v1.<base64url JSON> — { n: 닉네임, s: 총점, b: [세부 6], v: 차종, c: 색상, p: [dx*10, dy*10, heading°*10], k: [약, 강] }
 * p는 주차칸 중심 기준 상대 위치라 상대 기기에서도 같은 최종 주차 모습을 다시 그릴 수 있다. */
(function () {
  'use strict';

  const PK = window.PK;

  function b64uEncode(obj) {
    const b = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(str) {
    let b = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  }

  /* rec: {nickname, total, parts, vehicleId, colorId, pose:{dx,dy,hdeg}, hits:{weak,strong}} */
  function makeToken(rec) {
    const payload = {
      n: (rec.nickname || '').slice(0, 12),
      s: rec.total,
      b: PK.SCORE_LABELS.map(([k]) => rec.parts[k]),
      v: rec.vehicleId,
      c: rec.colorId,
      p: [Math.round(rec.pose.dx * 10), Math.round(rec.pose.dy * 10), Math.round(rec.pose.hdeg * 10)],
      k: [rec.hits.weak, rec.hits.strong],
    };
    return 'v1.' + b64uEncode(payload);
  }

  function parseToken(token) {
    try {
      if (!token || token.indexOf('v1.') !== 0) return null;
      const d = b64uDecode(token.slice(3));
      if (typeof d.s !== 'number' || !PK.VEHICLES[d.v] || !PK.COLORS[d.c]) return null;
      const parts = {};
      PK.SCORE_LABELS.forEach(([k], i) => { parts[k] = Number(d.b && d.b[i]) || 0; });
      return {
        nickname: d.n || '친구',
        total: d.s,
        parts,
        vehicleId: d.v,
        colorId: d.c,
        pose: { dx: d.p[0] / 10, dy: d.p[1] / 10, hdeg: d.p[2] / 10 },
        hits: { weak: (d.k && d.k[0]) || 0, strong: (d.k && d.k[1]) || 0 },
      };
    } catch (_) {
      return null;
    }
  }

  function buildUrl(token) {
    return location.href.split('#')[0] + '#battle/' + token;
  }
  function parseHash() {
    const m = location.hash.match(/^#battle\/(.+)$/);
    return m ? m[1] : null;
  }

  /* 도전장 기록의 최종 주차 모습을 다시 그린 캔버스 */
  function snapshotOf(rec, px, aspect) {
    const v = PK.VEHICLES[rec.vehicleId];
    const layout = PK.buildLayout(v, 'reverse');
    const car = PK.physics.createCar(v, {
      x: layout.target.cx + rec.pose.dx,
      y: layout.target.cy + rec.pose.dy,
      heading: rec.pose.hdeg * Math.PI / 180,
    });
    return PK.renderer.snapshot(layout, car, PK.COLORS[rec.colorId].body, px || 480, aspect || 1);
  }

  PK.battle = { makeToken, parseToken, buildUrl, parseHash, snapshotOf };
})();
