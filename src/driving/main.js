/* 도로주행 — 화면 흐름 (INTRO → 차종 → 색상 → TUTORIAL → PLAY → RESULT, STAGE는 항상 순차 진행)
 * 주차게임 main.js를 복사하지 않고 새로 구현한다. 이 파일은 driving-root 내부의 상태
 * 전환만 다룬다 — 어느 root(#app/#menu-root/#driving-root)를 보여줄지는 game-select.js가
 * 전담한다(§81: 상위 루트 전환은 게임 선택 레이어의 책임, 이 파일은 내부 흐름만). */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;
  const S = DRIVING.STATE;
  const $ = id => document.getElementById(id);

  const app = { stageId: 1, vehicleId: 'sedan', colorId: 'blue', challenge: null, last: null };
  DRIVING.app = app;

  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (coarse) document.body.classList.add('touch');
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

  function applyTouchLabels() {
    const touch = document.body.classList.contains('touch');
    const map = touch ? { up: '▲', down: '▼', left: '◀', right: '▶' } : { up: '↑', down: '↓', left: '←', right: '→' };
    document.querySelectorAll('#driving-screen-tutorial .key').forEach(k => { k.textContent = map[k.dataset.k]; });
    $('driving-hint').textContent = touch ? '버튼으로 운전하세요' : '방향키로 운전하세요';
  }

  function slotSize(canvas) {
    const box = canvas.parentElement;
    return { w: Math.max(80, box.clientWidth), h: Math.max(60, box.clientHeight) };
  }
  function drawIntro() {
    const c = $('driving-intro-canvas'); const s = slotSize(c);
    DRIVING.renderer.renderIntroPreview(c, s.w, s.h, app.vehicleId, window.PK.COLORS[app.colorId].body);
  }
  function drawTypeIcons() {
    const short = window.matchMedia && matchMedia('(max-height: 640px)').matches;
    const h = short ? 30 : 46, padX = 5, padY = short ? 3 : 4;
    document.querySelectorAll('#driving-type-grid .type-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.type === app.vehicleId);
      const w = Math.max(48, btn.clientWidth - 12);
      window.PK.renderer.renderPreview(btn.querySelector('canvas'), window.PK.VEHICLES[btn.dataset.type], '#FFFFFF', { w, h, padX, padY });
    });
  }
  function drawTypePreview() {
    const c = $('driving-type-preview'); const s = slotSize(c);
    window.PK.renderer.renderPreview(c, window.PK.VEHICLES[app.vehicleId], '#FFFFFF', { w: s.w, h: s.h, padX: 34, padY: 46 });
  }
  function drawColorPreview() {
    const c = $('driving-preview-canvas'); const s = slotSize(c);
    window.PK.renderer.renderPreview(c, window.PK.VEHICLES[app.vehicleId], window.PK.COLORS[app.colorId].body, { w: s.w, h: s.h, padX: 34, padY: 46 });
    document.querySelectorAll('#driving-color-list .color-btn').forEach(b => b.classList.toggle('selected', b.dataset.color === app.colorId));
  }

  DRIVING.state.on(S.INTRO, drawIntro);
  DRIVING.state.on(S.SELECT_TYPE, () => { drawTypeIcons(); drawTypePreview(); });
  DRIVING.state.on(S.SELECT_COLOR, drawColorPreview);
  DRIVING.state.on(S.TUTORIAL, applyTouchLabels);
  /* 충돌 시각 피드백(§2, §3 흔들림/텍스트) — 카메라·world transform은 절대 안 건드리고,
   * DOM/CSS 애니메이션만 재실행한다(클래스 제거→강제 리플로우→재추가라야 연속 충돌에도
   * 애니메이션이 매번 다시 재생된다). */
  let hitFlashTimer = 0;
  function onHit(hard) {
    const canvas = $('driving-game-canvas'), flash = $('driving-hit-flash');
    canvas.classList.remove('hit-shake'); void canvas.offsetWidth; canvas.classList.add('hit-shake');
    flash.textContent = hard ? '쾅!!' : '쾅!';
    flash.classList.remove('show', 'hard'); void flash.offsetWidth;
    flash.classList.add('show'); if (hard) flash.classList.add('hard');
    clearTimeout(hitFlashTimer);
    hitFlashTimer = setTimeout(() => flash.classList.remove('show'), hard ? 480 : 320);
  }
  DRIVING.state.on(S.PLAYING, () => {
    DRIVING.play.start(app.stageId, app.vehicleId, app.colorId, {
      stage: $('driving-stage'), canvas: $('driving-game-canvas'),
      timer: $('driving-timer'), status: $('driving-play-status'), speed: $('driving-speed'),
      hint: $('driving-hint'), progressFill: $('driving-progress-fill'), onHit,
    }, onPlayDone);
  });

  function onPlayDone(out) {
    const rec = DRIVING.progress.recordResult(out.stageId, out.result.total, out.arrived, out.vehicleId);
    out.isNewRecord = rec.isNewRecord;
    out.prevBest = rec.prevBest;
    app.last = out;
    DRIVING.state.set(S.RESULT, out);
  }

  /* 2026-09-28: "시작"은 저장된 진행 상황과 무관하게 무조건 STAGE 1부터 시작한다(사용자 확정
   * 사항 — 예전엔 progress.unlocked로 이어하기를 했는데, 그러면 예전에 스테이지를 직접 골라
   * 미리 깨둔 기록이 있는 브라우저에서 "새로 시작"이 저장된 스테이지로 튀어서 혼란스러웠다).
   * 클리어 시 "다음 스테이지" 버튼으로 이어서 진행하는 흐름(app.stageId += 1)과 진행 기록 저장
   * (progress.recordResult)은 그대로 둔다 — 오직 이 시작 진입점만 1로 고정한다. */
  $('btn-driving-intro-start').addEventListener('click', () => {
    app.stageId = 1;
    DRIVING.state.set(S.SELECT_TYPE);
  });
  $('driving-type-grid').addEventListener('click', e => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    app.vehicleId = btn.dataset.type;
    drawTypeIcons(); drawTypePreview();
  });
  $('btn-driving-type-next').addEventListener('click', () => DRIVING.state.set(S.SELECT_COLOR));
  $('driving-color-list').addEventListener('click', e => {
    const btn = e.target.closest('.color-btn');
    if (!btn) return;
    app.colorId = btn.dataset.color;
    drawColorPreview();
  });
  $('btn-driving-color-next').addEventListener('click', () => DRIVING.state.set(S.TUTORIAL));
  $('btn-driving-play').addEventListener('click', () => DRIVING.state.set(S.PLAYING));

  /* §38: 결과 화면에서 다음 스테이지/재시도로 넘어갈 때 화면이 바로 뜨는 대신 "STAGE N" 짧은
   * 텍스트를 0.5~0.8초 보여준다(사용자 확정: 화려한 전환은 불필요, 짧은 라벨이면 충분). */
  function showTransition(cb) {
    const el = $('driving-transition');
    el.textContent = 'STAGE ' + app.stageId;
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); cb(); }, 650);
  }
  $('btn-driving-retry').addEventListener('click', () => showTransition(() => DRIVING.state.set(S.PLAYING)));
  $('btn-driving-next-stage').addEventListener('click', () => { app.stageId += 1; showTransition(() => DRIVING.state.set(S.PLAYING)); });
  $('btn-driving-change-car').addEventListener('click', () => DRIVING.state.set(S.SELECT_TYPE));
  $('btn-driving-challenge-start').addEventListener('click', () => DRIVING.state.set(S.SELECT_TYPE));
  $('btn-driving-rematch').addEventListener('click', () => showTransition(() => DRIVING.state.set(S.PLAYING)));
  $('btn-driving-vs-detail').addEventListener('click', () => DRIVING.state.set(S.RESULT, app.last));
  $('btn-driving-battle-result').addEventListener('click', () => DRIVING.state.set(S.BATTLE_RESULT));
  /* §49: STAGE 5(마지막) 클리어 후 "다음 스테이지" 대신 메인(도로주행 INTRO)으로 돌아간다. */
  $('btn-driving-result-home').addEventListener('click', () => DRIVING.state.set(S.INTRO));

  DRIVING.input.attachDpad($('driving-dpad'));
  window.addEventListener('resize', () => {
    DRIVING.play.resize();
    if (DRIVING.state.current === S.INTRO) drawIntro();
    if (DRIVING.state.current === S.SELECT_TYPE) { drawTypeIcons(); drawTypePreview(); }
    if (DRIVING.state.current === S.SELECT_COLOR) drawColorPreview();
  });

  window.PK.sprites.onReady(() => {
    const s = DRIVING.state.current;
    if (s === S.INTRO) drawIntro();
    else if (s === S.SELECT_TYPE) { drawTypeIcons(); drawTypePreview(); }
    else if (s === S.SELECT_COLOR) drawColorPreview();
    else if (s === S.CHALLENGE || s === S.RESULT || s === S.BATTLE_RESULT) DRIVING.state.set(s, app.last);
    DRIVING.play.resize();
  });

  /* game-select.js가 #driving-root를 처음 보여줄 때 딱 한 번 호출한다.
   * challengeToken이 있으면(도로주행 도전장 링크) CHALLENGE로, 없으면 INTRO로 시작. */
  DRIVING.boot = function (challengeToken) {
    const rec = challengeToken && DRIVING.battle.parseToken(challengeToken);
    if (rec) { app.challenge = rec; app.stageId = rec.stageId; DRIVING.state.set(S.CHALLENGE); }
    else DRIVING.state.set(S.INTRO);
  };
})();
