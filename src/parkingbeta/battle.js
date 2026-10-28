/* 주차하기 베타 — 친구 도전장 (기록을 링크 해시에 직접 담는다. 서버 없음)
 * 기존 src/game/battle.js(#battle/...)·src/driving/battle.js(#driving-battle/...)와 절대
 * 섞이지 않도록 완전히 다른 prefix(#pbbattle/)를 쓴다 — 그 두 파일은 전혀 건드리지 않는다.
 * 토큰: v1.<base64url JSON> — { n:닉네임, st:스테이지, s:총점, b:[세부6], v:차종, c:색상,
 * p:[목적지 중심 기준 dx*10, dy*10, heading°*10], k:[약, 강] }
 * st(스테이지)가 있어야 상대 기기에서 같은 레이아웃(PB.buildStageLayout)을 다시 만들어
 * 같은 최종 주차 모습을 재현할 수 있다 — config.js가 결정론적이라(랜덤 없음) 같은
 * (스테이지, 차종)이면 항상 같은 레이아웃이 나오는 것을 전제로 한다. */
(function () {
  'use strict';

  const PK = window.PK;
  const PB = (window.PB = window.PB || {});

  function b64uEncode(obj) {
    const b = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(str) {
    let b = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  }

  /* rec: {nickname, stageId, total, parts, vehicleId, colorId, pose:{dx,dy,hdeg}, hits:{weak,strong}} */
  function makeToken(rec) {
    const payload = {
      n: (rec.nickname || '').slice(0, 12),
      st: rec.stageId,
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
      if (typeof d.s !== 'number' || !PK.VEHICLES[d.v] || !PK.COLORS[d.c] || !PB.STAGES[d.st - 1]) return null;
      const parts = {};
      PK.SCORE_LABELS.forEach(([k], i) => { parts[k] = Number(d.b && d.b[i]) || 0; });
      return {
        nickname: d.n || '친구',
        stageId: d.st,
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
    return location.href.split('#')[0] + '#pbbattle/' + token;
  }
  function parseHash() {
    const m = location.hash.match(/^#pbbattle\/(.+)$/);
    return m ? m[1] : null;
  }

  /* 도전장 기록의 최종 주차 모습을 다시 그린 캔버스 — 보낸 사람과 같은 (스테이지, 차종)으로
   * 레이아웃을 다시 만들고, 그 목표 칸 중심 기준 상대 위치(pose)에 차를 그대로 재배치한다. */
  function snapshotOf(rec, px, aspect) {
    const stage = PB.STAGES[rec.stageId - 1];
    const v = PK.VEHICLES[rec.vehicleId];
    const layout = PB.buildStageLayout(stage, v);
    const car = PK.physics.createCar(v, {
      x: layout.target.cx + rec.pose.dx,
      y: layout.target.cy + rec.pose.dy,
      heading: rec.pose.hdeg * Math.PI / 180,
    });
    return PB.renderer.snapshot(layout, car, PK.COLORS[rec.colorId].body, px || 480, aspect || 1);
  }

  PB.battle = { makeToken, parseToken, buildUrl, parseHash, snapshotOf };
})();
