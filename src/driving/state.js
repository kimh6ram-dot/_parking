/* 도로주행 — 상태 머신 (독립: 주차게임 PK.state/.screen과 절대 공유하지 않는다)
 * INTRO → SELECT_TYPE → SELECT_COLOR → TUTORIAL → PLAYING → SETTLING → RESULT
 * [+ CHALLENGE / BATTLE_RESULT]. 화면 섹션은 .screen이 아닌 .driving-screen 클래스로 관리해서
 * 주차게임 state.js의 querySelectorAll('.screen')이 이 화면들을 절대 건드리지 못하게 한다. */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;

  /* 2026-09-28: STAGE_SELECT(스테이지 직접 선택 화면) 제거(§3 — "직접 Stage를 고르는 리스트/
   * grid/selector/dropdown/카드는 만들지 않는다"). 진행은 항상 INTRO → SELECT_TYPE 순서뿐이다. */
  DRIVING.STATE = {
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
    intro: 'intro', 'select-type': 'select-type', 'select-color': 'select-color',
    tutorial: 'tutorial', play: 'play', settling: 'play', result: 'result', challenge: 'challenge', 'battle-result': 'battle-result',
  };

  let current = null;
  const handlers = Object.create(null);

  function set(next, payload) {
    const prev = current;
    current = next;
    const screen = SCREEN_OF[next];
    document.querySelectorAll('.driving-screen').forEach(s => {
      const active = s.id === 'driving-screen-' + screen;
      const wasActive = s.classList.contains('active');
      s.classList.toggle('active', active);
      if (active && s.classList.contains('scrollable')) s.scrollTop = 0;
      if (active && !wasActive) {
        s.classList.add('entering');
        void s.offsetHeight;
        requestAnimationFrame(() => s.classList.remove('entering'));
      }
    });
    (handlers[next] || []).forEach(fn => fn(payload, prev));
  }
  function on(name, fn) {
    (handlers[name] = handlers[name] || []).push(fn);
  }

  DRIVING.state = { set, on, get current() { return current; } };
})();
