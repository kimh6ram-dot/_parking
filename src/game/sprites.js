/* 주차하기 — 차량 스프라이트 (assets/*.png → sprites-data.js 내장) 로드 + 색상 착색
 * 밝은 무채색 픽셀(차체)만 선택 색으로 바꾸고, 외곽선·유리·헤드라이트·테일램프는 그대로 둔다. */
(function () {
  'use strict';

  const PK = window.PK;
  const DATA = window.PK_SPRITES || {};
  const images = Object.create(null);
  const cache = new Map();
  const listeners = [];
  let ready = false;

  function load() {
    const ids = Object.keys(DATA);
    return Promise.all(ids.map(id => new Promise(resolve => {
      const img = new Image();
      img.onload = () => { images[id] = img; resolve(); };
      img.onerror = () => resolve();
      img.src = DATA[id].src;
    }))).then(() => {
      ready = Object.keys(images).length > 0;
      listeners.splice(0).forEach(fn => fn());
    });
  }
  function onReady(fn) { if (ready) fn(); else listeners.push(fn); }

  function parseHex(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* 착색 규칙: 알파 > 0, 최소 채널 ≥ 120, 채널 차 ≤ 24 → 차체·밝은 트림.
   * 밝기 비율(값/240)을 유지해 이음선·범퍼·해치는 같은 색의 어두운 톤이 된다.
   * 외곽선(≤48)·유리(64~112)는 120 미만이라 그대로. (임계값이 트림 밝기 근처면 얼룩이 생기므로 넉넉히 아래에 둔다) */
  function tinted(id, colorHex) {
    const key = id + '|' + colorHex;
    if (cache.has(key)) return cache.get(key);
    const img = images[id], meta = DATA[id];
    if (!img || !meta) return null;
    const cnv = document.createElement('canvas');
    cnv.width = meta.w; cnv.height = meta.h;
    const ctx = cnv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const [tr, tg, tb] = parseHex(colorHex);
    const im = ctx.getImageData(0, 0, meta.w, meta.h);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mn >= 250) continue; // 순백(번호판·헤드라이트 반짝임·사이드미러)은 그대로
      if (mn >= 120 && mx - mn <= 24) {
        const f = mx / 240;
        d[i] = Math.min(255, Math.round(tr * f));
        d[i + 1] = Math.min(255, Math.round(tg * f));
        d[i + 2] = Math.min(255, Math.round(tb * f));
      }
    }
    ctx.putImageData(im, 0, 0);
    cache.set(key, cnv);
    return cnv;
  }

  PK.sprites = {
    load, onReady,
    get: (id, colorHex) => (ready ? tinted(id, colorHex) : null),
    meta: id => DATA[id],
    get ready() { return ready; },
  };
})();
