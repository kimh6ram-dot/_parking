/* 주차하기 — 입력 (PC 방향키 + 모바일 흑백 방향 버튼, 멀티터치 동시 입력)
 * 결과: PK.input.state = { up, down, left, right } */
(function () {
  'use strict';

  const PK = window.PK;

  const state = { up: false, down: false, left: false, right: false };
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  let enabled = false;
  const held = { up: 0, down: 0, left: 0, right: 0 }; // 버튼별 누르고 있는 포인터 수
  const keyDown = { up: false, down: false, left: false, right: false };
  let dpadEl = null;

  function sync() {
    for (const k in state) state[k] = keyDown[k] || held[k] > 0;
  }

  function reset() {
    for (const k in state) { keyDown[k] = false; held[k] = 0; state[k] = false; }
    if (dpadEl) dpadEl.querySelectorAll('.dpad-btn.on').forEach(b => b.classList.remove('on'));
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) reset();
  }

  window.addEventListener('keydown', e => {
    const dir = KEYS[e.key];
    if (!dir) return;
    if (!enabled) return;
    e.preventDefault();
    if (e.repeat) return;
    keyDown[dir] = true;
    sync();
  });
  window.addEventListener('keyup', e => {
    const dir = KEYS[e.key];
    if (!dir) return;
    keyDown[dir] = false;
    sync();
  });
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });

  /* 모바일 방향 버튼: Pointer Events + 포인터 캡처 → 버튼마다 독립적으로 눌림/뗌 (동시 입력) */
  function attachDpad(el) {
    dpadEl = el;
    el.querySelectorAll('.dpad-btn').forEach(btn => {
      const dir = btn.dataset.dir;
      const pointers = new Set();
      const press = e => {
        if (!enabled) return;
        e.preventDefault();
        if (pointers.has(e.pointerId)) return;
        pointers.add(e.pointerId);
        try { btn.setPointerCapture(e.pointerId); } catch (_) { /* 미지원 무시 */ }
        held[dir]++;
        btn.classList.add('on');
        sync();
      };
      const release = e => {
        if (!pointers.has(e.pointerId)) return;
        pointers.delete(e.pointerId);
        held[dir] = Math.max(0, held[dir] - 1);
        if (held[dir] === 0) btn.classList.remove('on');
        sync();
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
  }

  PK.input = { state, reset, setEnabled, attachDpad };
})();
