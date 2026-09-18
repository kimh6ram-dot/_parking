/* 주차하기 — 상태 머신 (INTRO → SELECT_TYPE → SELECT_COLOR → TUTORIAL → PLAYING → SETTLING → RESULT [+ CHALLENGE / BATTLE_RESULT])
 * 상태마다 리스너를 새로 만들지 않는다. 화면 섹션(#screen-*) 전환만 담당. */
(function () {
  'use strict';

  const PK = window.PK;

  PK.STATE = {
    INTRO: 'intro',
    SELECT_TYPE: 'select-type',
    SELECT_COLOR: 'select-color',
    TUTORIAL: 'tutorial',
    PLAYING: 'play',
    SETTLING: 'settling',
    RESULT: 'result',
    CHALLENGE: 'challenge',
    BATTLE_RESULT: 'battle-result',
  };
  const SCREEN_OF = {
    intro: 'intro', 'select-type': 'select-type', 'select-color': 'select-color', tutorial: 'tutorial',
    play: 'play', settling: 'play', result: 'result', challenge: 'challenge', 'battle-result': 'battle-result',
  };

  let current = null;
  const handlers = Object.create(null);

  function set(next, payload) {
    const prev = current;
    current = next;
    const screen = SCREEN_OF[next];
    document.querySelectorAll('.screen').forEach(s => {
      const active = s.id === 'screen-' + screen;
      const wasActive = s.classList.contains('active');
      s.classList.toggle('active', active);
      if (active && s.classList.contains('scrollable')) s.scrollTop = 0;
      // 새로 활성화되는 화면에만 짧은 진입 fade를 건다 (PLAY→SETTLING처럼 같은 화면을
      // 유지하는 내부 전환에는 걸지 않는다 — 애초에 다른 화면일 때만 set()이 다시 불린다)
      if (active && !wasActive) {
        s.classList.add('entering');
        void s.offsetHeight; // 강제 리플로우: entering의 시작 상태를 먼저 페인트시킨다
        requestAnimationFrame(() => s.classList.remove('entering'));
      }
    });
    document.body.dataset.state = next;
    (handlers[next] || []).forEach(fn => fn(payload, prev));
  }
  function on(name, fn) {
    (handlers[name] = handlers[name] || []).push(fn);
  }

  PK.state = { set, on, get current() { return current; } };
})();
