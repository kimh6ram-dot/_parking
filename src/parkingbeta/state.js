/* 주차하기 베타 — 상태 머신 (기존 PK.state를 재사용하지 않고 완전히 독립된 모듈로 둔다 —
 * 도로주행의 DRIVING.state와 같은 이유: 같은 .screen/#screen-* 전환 로직을 공유하면 세
 * 게임이 서로의 화면 전환에 영향을 줄 수 있어서 안전하지 않다. 클래스/ID 접두사만 다르게
 * 한 거의 동일한 코드 — 기존 src/game/state.js 구조 그대로 재사용(복제), 로직 자체는
 * 바꾸지 않았다. */
(function () {
  'use strict';

  const PB = (window.PB = window.PB || {});

  PB.STATE = {
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
    document.querySelectorAll('.parkingbeta-screen').forEach(s => {
      const active = s.id === 'parkingbeta-screen-' + screen;
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

  PB.state = { set, on, get current() { return current; } };
})();
