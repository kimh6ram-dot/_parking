/* 주차하기 베타 — 화면 흐름 (INTRO → 차종 → 색상 → TUTORIAL → PLAY → RESULT, 스테이지는
 * 항상 순차 진행). src/main.js(차종/색상 선택 흐름)와 src/driving/main.js(스테이지 진행·
 * 전환 라벨) 두 패턴을 그대로 섞었다 — 어느 쪽 파일도 수정하지 않았다.
 * 이 파일은 parkingbeta-root 내부의 상태 전환만 다룬다 — 어느 root를 보여줄지는
 * game-select 쪽(§index.html에 직접 붙인 리스너)이 전담한다. */
(function () {
  'use strict';

  const PK = window.PK;
  const PB = window.PB;
  const S = PB.STATE;
  const $ = id => document.getElementById(id);

  const app = { stageId: 1, vehicleId: 'sedan', colorId: 'blue', challenge: null, last: null };
  PB.app = app;

  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (coarse) document.body.classList.add('touch');
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

  function applyTouchLabels() {
    const touch = document.body.classList.contains('touch');
    const map = touch ? { up: '▲', down: '▼', left: '◀', right: '▶' } : { up: '↑', down: '↓', left: '←', right: '→' };
    document.querySelectorAll('#parkingbeta-screen-tutorial .key').forEach(k => { k.textContent = map[k.dataset.k]; });
    $('parkingbeta-hint').textContent = touch ? '버튼으로 운전하세요' : '방향키로 운전하세요';
  }

  function slotSize(canvas) {
    const box = canvas.parentElement;
    return { w: Math.max(80, box.clientWidth), h: Math.max(60, box.clientHeight) };
  }
  function drawIntro() {
    const c = $('parkingbeta-intro-canvas'); const s = slotSize(c);
    PB.renderer.renderIntro(c, s.w, s.h);
  }
  function drawTypeIcons() {
    const short = window.matchMedia && matchMedia('(max-height: 640px)').matches;
    const h = short ? 30 : 46, padX = 5, padY = short ? 3 : 4;
    document.querySelectorAll('#parkingbeta-type-grid .type-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.type === app.vehicleId);
      const w = Math.max(48, btn.clientWidth - 12);
      PK.renderer.renderPreview(btn.querySelector('canvas'), PK.VEHICLES[btn.dataset.type], '#FFFFFF', { w, h, padX, padY });
    });
  }
  function drawTypePreview() {
    const c = $('parkingbeta-type-preview'); const s = slotSize(c);
    PK.renderer.renderPreview(c, PK.VEHICLES[app.vehicleId], '#FFFFFF', { w: s.w, h: s.h, padX: 34, padY: 46 });
  }
  function drawColorPreview() {
    const c = $('parkingbeta-preview-canvas'); const s = slotSize(c);
    PK.renderer.renderPreview(c, PK.VEHICLES[app.vehicleId], PK.COLORS[app.colorId].body, { w: s.w, h: s.h, padX: 34, padY: 46 });
    document.querySelectorAll('#parkingbeta-color-list .color-btn').forEach(b => b.classList.toggle('selected', b.dataset.color === app.colorId));
  }

  PB.state.on(S.INTRO, drawIntro);
  PB.state.on(S.SELECT_TYPE, () => { drawTypeIcons(); drawTypePreview(); });
  PB.state.on(S.SELECT_COLOR, drawColorPreview);
  PB.state.on(S.TUTORIAL, applyTouchLabels);
  PB.state.on(S.PLAYING, () => {
    PB.play.start(app.stageId, app.vehicleId, app.colorId, {
      stage: $('parkingbeta-stage'), canvas: $('parkingbeta-game-canvas'),
      timer: $('parkingbeta-timer'), status: $('parkingbeta-play-status'),
      gear: $('parkingbeta-gear'), hint: $('parkingbeta-hint'),
    }, onPlayDone);
  });

  function onPlayDone(out) {
    const rec = PB.progress.recordResult(out.stageId, out.result.total, out.parked, out.vehicleId);
    out.isNewRecord = rec.isNewRecord;
    out.prevBest = rec.prevBest;
    app.last = out;
    PB.state.set(S.RESULT, out);
  }

  /* "시작"은 항상 1단계부터(도로주행과 같은 확정 사항 — 저장된 진행과 무관하게 새로 시작).
   * "다음 스테이지"로 이어가는 흐름과 진행 기록 저장(progress.recordResult)은 그대로 둔다. */
  $('btn-parkingbeta-intro-start').addEventListener('click', () => {
    app.stageId = 1;
    PB.state.set(S.SELECT_TYPE);
  });
  $('parkingbeta-type-grid').addEventListener('click', e => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    app.vehicleId = btn.dataset.type;
    drawTypeIcons(); drawTypePreview();
  });
  $('btn-parkingbeta-type-next').addEventListener('click', () => PB.state.set(S.SELECT_COLOR));
  $('parkingbeta-color-list').addEventListener('click', e => {
    const btn = e.target.closest('.color-btn');
    if (!btn) return;
    app.colorId = btn.dataset.color;
    drawColorPreview();
  });
  $('btn-parkingbeta-color-next').addEventListener('click', () => PB.state.set(S.TUTORIAL));
  $('btn-parkingbeta-play').addEventListener('click', () => PB.state.set(S.PLAYING));

  /* 스테이지 전환 시 "STAGE N" 짧은 라벨(도로주행과 같은 패턴) */
  function showTransition(cb) {
    const el = $('parkingbeta-transition');
    el.textContent = PB.STAGES[app.stageId - 1].label;
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); cb(); }, 650);
  }
  $('btn-parkingbeta-retry').addEventListener('click', () => showTransition(() => PB.state.set(S.PLAYING)));
  $('btn-parkingbeta-next-stage').addEventListener('click', () => { app.stageId += 1; showTransition(() => PB.state.set(S.PLAYING)); });
  $('btn-parkingbeta-change-car').addEventListener('click', () => PB.state.set(S.SELECT_TYPE));
  /* 마지막 스테이지 클리어 후 "다음 스테이지" 대신 메인(베타 INTRO)으로 돌아간다. */
  $('btn-parkingbeta-result-home').addEventListener('click', () => PB.state.set(S.INTRO));

  /* ---------- 도전장(친구 기록과 대결) ----------
   * app.stageId는 도전장을 받은 시점(아래 라우팅)에 이미 상대와 같은 스테이지로 맞춰져
   * 있다 — "도전 시작"은 그 값을 그대로 둔 채 차종 선택으로만 넘어간다(도로주행의
   * btn-driving-challenge-start와 같은 패턴). */
  $('btn-parkingbeta-challenge-start').addEventListener('click', () => PB.state.set(S.SELECT_TYPE));
  $('btn-parkingbeta-rematch').addEventListener('click', () => showTransition(() => PB.state.set(S.PLAYING)));
  $('btn-parkingbeta-vs-detail').addEventListener('click', () => PB.state.set(S.RESULT, app.last));
  $('btn-parkingbeta-battle-result').addEventListener('click', () => PB.state.set(S.BATTLE_RESULT));

  PB.input.attachDpad($('parkingbeta-dpad'));
  window.addEventListener('resize', () => {
    PB.play.resize();
    if (PB.state.current === S.INTRO) drawIntro();
    if (PB.state.current === S.SELECT_TYPE) { drawTypeIcons(); drawTypePreview(); }
    if (PB.state.current === S.SELECT_COLOR) drawColorPreview();
  });

  PK.sprites.onReady(() => {
    const s = PB.state.current;
    if (s === S.INTRO) drawIntro();
    else if (s === S.SELECT_TYPE) { drawTypeIcons(); drawTypePreview(); }
    else if (s === S.SELECT_COLOR) drawColorPreview();
    else if (s === S.CHALLENGE || s === S.RESULT || s === S.BATTLE_RESULT) PB.state.set(s, app.last);
    PB.play.resize();
  });
  // PK.sprites.load()는 src/main.js가 이미 한 번 호출한다(기존 주차게임 로드 시 항상 실행됨) —
  // 여기서 다시 부르면 이미지를 중복 로드하므로 호출하지 않는다.

  PB.boot = function () { PB.state.set(S.INTRO); };

  /* ---------- 게임 선택 화면과의 연결(index.html에 3카드 메뉴로 내장된 경우에만) ----------
   * src/menu/game-select.js는 건드리지 않는다. 그 파일의 카드 클릭 처리는
   * data-target==='parking'이면 주차게임, 그 외(지금은 'driving' 하나뿐)는 전부 도로주행으로
   * 보내는 이분법 if/else라(코드 확인 완료) 세 번째 카드를 그냥 추가하면 도로주행으로 잘못
   * 넘어간다. game-select.js의 분기를 고치는 대신, 이 카드에만 캡처되지 않는 별도 리스너를
   * 붙이고 e.stopImmediatePropagation()으로 그 쪽 핸들러가 같은 클릭에서 실행되지 않게
   * 막는다(이 스크립트가 game-select.js보다 먼저 로드되므로 리스너도 먼저 등록된다 — 같은
   * 엘리먼트의 리스너는 등록 순서대로 실행되고, stopImmediatePropagation은 그 뒤에 등록된
   * 리스너 실행을 막는다). showMenu도 #parkingbeta-root를 아는 버전이 따로 필요해 여기 둔다
   * (game-select.js의 showMenu는 #app/#driving-root만 안다 — 3번째 루트를 몰라도 되게
   * 독립적으로 처리).
   *
   * beta.html(독립 페이지)에는 #menu-root/#app/#driving-root 자체가 없다 — 그 경우 아래
   * else 분기에서 메뉴 연동 없이 바로 부팅한다(기존 단일 게임 사이트와 같은 동작: 인트로에
   * "돌아가기" 버튼 없이 바로 시작/플레이). 이 파일 하나로 두 컨텍스트 모두 지원해서 로직이
   * 흩어지지 않게 한다. */
  const menuRoot = $('menu-root');
  if (menuRoot) {
    let booted = false;
    function enterParkingBeta() {
      menuRoot.classList.add('hidden');
      $('app').classList.add('hidden');
      $('driving-root').classList.add('hidden');
      $('parkingbeta-root').classList.remove('hidden');
      if (!booted) { booted = true; PB.boot(); }
      app.stageId = 1;
      PB.state.set(S.SELECT_TYPE);
      window.dispatchEvent(new Event('resize'));
    }
    function showMenu() {
      $('app').classList.add('hidden');
      $('driving-root').classList.add('hidden');
      $('parkingbeta-root').classList.add('hidden');
      menuRoot.classList.remove('hidden');
      $('menu-select').classList.add('active');
    }
    const betaCard = document.querySelector('.game-select__card[data-target="parkingbeta"]');
    if (betaCard) betaCard.addEventListener('click', e => { e.stopImmediatePropagation(); enterParkingBeta(); });
    $('btn-parkingbeta-intro-back').addEventListener('click', showMenu);

    /* 게임 선택 카드 썸네일(§game-select.js의 drawIcons와 같은 패턴, 그 함수는 parking/driving
     * 2개만 하드코딩하고 있어 이 카드는 직접 그려야 한다). */
    function drawCardIcon() {
      const ic = $('icon-parkingbeta');
      if (!ic) return;
      PB.renderer.renderIntro(ic, ic.clientWidth || 320, ic.clientHeight || 150);
    }
    drawCardIcon();
    PK.sprites.onReady(drawCardIcon);
    window.addEventListener('resize', () => { if (!menuRoot.classList.contains('hidden')) drawCardIcon(); });

    /* ---------- 도전장 링크 라우팅(§game-select.js 하단의 같은 패턴) — 그 파일은 #battle/...
     * 와 #driving-battle/...만 알아서 #pbbattle/...는 못 알아보고 그냥 지나친다(고쳐 쓰지
     * 않음). 그래서 여기서 직접 감지해, GAME SELECT를 건너뛰고 베타 루트를 곧장 보여준 뒤
     * CHALLENGE 화면으로 들어간다 — enterParkingBeta()는 항상 SELECT_TYPE로 보내 쓸 수 없어
     * 별도로 구성(도로주행의 enterDriving(challengeToken)과 같은 "보이기+부팅+상태진입"
     * 한 번에 처리하는 패턴). */
    const pbToken = PB.battle.parseHash();
    const pbRec = pbToken && PB.battle.parseToken(pbToken);
    if (pbRec) {
      menuRoot.classList.add('hidden');
      $('app').classList.add('hidden');
      $('driving-root').classList.add('hidden');
      $('parkingbeta-root').classList.remove('hidden');
      if (!booted) { booted = true; PB.boot(); }
      app.challenge = pbRec;
      app.stageId = pbRec.stageId;
      PB.state.set(S.CHALLENGE);
      window.dispatchEvent(new Event('resize'));
    }
  } else {
    // 독립 페이지: 돌아갈 메뉴가 없으므로 "돌아가기" 버튼을 숨기고(기존 단일 게임 인트로와
    // 동일하게 [시작하기]만 남김) 바로 부팅한다. PK.sprites.load()도 src/main.js가 없으니
    // 여기서 직접 한 번 호출한다. 도전장 링크로 열렸으면(§src/main.js의 같은 분기) INTRO
    // 대신 CHALLENGE로 바로 들어간다.
    const backBtn = $('btn-parkingbeta-intro-back');
    if (backBtn) backBtn.classList.add('hidden');
    PK.sprites.load();
    const pbToken = PB.battle.parseHash();
    const pbRec = pbToken && PB.battle.parseToken(pbToken);
    if (pbRec) {
      app.challenge = pbRec;
      app.stageId = pbRec.stageId;
      PB.state.set(S.CHALLENGE);
    } else {
      PB.boot();
    }
  }
})();
