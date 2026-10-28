/* 주차하기 — GAME SELECT (상위 진입 레이어)
 * 기존 주차게임(#app, PK.*)과 도로주행(#driving-root, DRIVING.*)에는 절대 관여하지 않는다.
 * 이 파일이 하는 일은: 세 루트(#menu-root/#app/#driving-root) 중 무엇을 보여줄지 토글하는 것과,
 * GAME SELECT 화면 자체의 차량 미리보기(PK.renderer 호출)뿐이다.
 * 두 게임 모두 항상 그대로 부팅되어 background에서 INTRO 상태로 준비돼 있고(도로주행은
 * lazy-boot — 처음 진입할 때만 DRIVING.boot() 호출, §17 참고), 여기서는 그 위에 씌워둔
 * #menu-root를 벗기기만 한다. */
(function () {
  'use strict';

  const PK = window.PK;
  const DRIVING = window.DRIVING;
  const $ = id => document.getElementById(id);
  const root = $('menu-root');
  const app = $('app');
  const drivingRoot = $('driving-root');
  const select = $('menu-select');
  let drivingBooted = false;

  /* 2026-09-28: GAME SELECT 카드가 이제 각 게임의 INTRO(비주얼+메인카피) 역할을 흡수했다
   * (index.html 참고) — 카드를 누르면 그 게임의 INTRO 화면을 다시 보여주지 않고, INTRO의
   * "시작하기"가 원래 하던 전환(→ 차종 선택)으로 바로 건너뛴다. 각 게임의 INTRO 화면 자체
   * (마크업/상태)는 지우지 않고 그대로 둔다 — 도전장 등 다른 경로가 여전히 참조할 수 있고,
   * "내부 로직은 건드리지 말라"는 요구와도 맞는다.
   *
   * #app/#driving-root가 display:none인 동안 각 게임의 main.js가 부팅하면서 화면을 미리
   * 그려두면, 그 시점엔 .slot-visual의 clientWidth/clientHeight가 0이라 아주 작은
   * 폴백 크기로 캔버스가 그려진다(그 크기가 인라인 style로 굳어버림). 보여준 뒤 resize
   * 이벤트를 한 번 흘려보내 각 게임의 기존 resize 핸들러가 지금의 실제 크기로 다시
   * 그리게 한다 — 두 게임 파일은 건드리지 않고 이미 있는 공개 동작만 이용한다. */
  function enterApp() {
    root.classList.add('hidden');
    app.classList.remove('hidden');
    window.dispatchEvent(new Event('resize'));
    if (PK.app && PK.app.challenge && PK.state.current === PK.STATE.CHALLENGE) {
      PK.state.set(PK.STATE.CHALLENGE, PK.app.challenge);
    } else {
      PK.state.set(PK.STATE.SELECT_TYPE); // btn-start가 원래 하던 전환과 동일(src/main.js)
    }
  }
  /* 도로주행은 처음 보여줄 때만 부팅한다(§17) — 미리 부팅해두면 #driving-root가 숨겨진
   * 채로 첫 화면이 그려져 주차게임 인트로와 같은 크기-0 버그가 재현되므로, 아예 "보여준
   * 뒤에 부팅"해서 그 버그 자체가 생길 수 없게 한다. */
  function enterDriving(challengeToken) {
    root.classList.add('hidden');
    drivingRoot.classList.remove('hidden');
    if (!drivingBooted) { drivingBooted = true; DRIVING.boot(challengeToken || null); }
    if (challengeToken) {
      const rec = DRIVING.battle.parseToken(challengeToken);
      if (rec) { DRIVING.app.challenge = rec; DRIVING.app.stageId = rec.stageId; DRIVING.state.set(DRIVING.STATE.CHALLENGE); }
    } else {
      DRIVING.app.stageId = 1; // btn-driving-intro-start가 원래 하던 전환과 동일(main.js)
      DRIVING.state.set(DRIVING.STATE.SELECT_TYPE);
    }
    window.dispatchEvent(new Event('resize'));
  }
  function showMenu() {
    app.classList.add('hidden');
    drivingRoot.classList.add('hidden');
    root.classList.remove('hidden');
    select.classList.add('active');
  }

  document.querySelectorAll('.game-select__card').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.target === 'parking') enterApp();
      else enterDriving();
    });
  });
  $('btn-driving-intro-back').addEventListener('click', showMenu);

  /* ---------- GAME SELECT 카드의 preview: 각 카드를 눌렀을 때 원래 보여주던 INTRO 화면의
   * 비주얼(§1~2 — 축약 썸네일이 아니라 그 화면 자체)을 그대로 재사용한다. 새 그림을 만들지
   * 않고 PK.renderer.renderIntro / DRIVING.renderer.renderIntroPreview를 카드 안 .game-select__visual
   * 크기(150px 높이, 기존 INTRO의 200px에 가깝게)에 맞춰 다시 그리기만 한다. */
  function drawIcons() {
    const pc = $('icon-parking'), dc = $('icon-driving');
    PK.renderer.renderIntro(pc, pc.clientWidth || 320, pc.clientHeight || 150);
    DRIVING.renderer.renderIntroPreview(dc, dc.clientWidth || 320, dc.clientHeight || 150, 'sedan', PK.COLORS.red.body);
  }
  drawIcons();
  PK.sprites.onReady(drawIcons);
  window.addEventListener('resize', () => { if (!root.classList.contains('hidden')) drawIcons(); });

  /* ---------- 도전장 링크 라우팅: 주차 #battle/...와 도로주행 #driving-battle/...가
   * 서로 절대 섞이지 않도록 prefix로만 분기한다 ---------- */
  if (PK.battle && PK.battle.parseHash()) {
    enterApp(); // 기존 주차게임이 이미 CHALLENGE 화면을 준비해뒀으므로 GAME SELECT를 건너뛰고 곧장 진입
  } else if (DRIVING.battle && DRIVING.battle.parseHash()) {
    enterDriving(DRIVING.battle.parseHash());
  }
})();
