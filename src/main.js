/* 주차하기 — 화면 흐름 (INTRO → 차 종류 → 차 색상 → TUTORIAL → PLAY → RESULT) */
(function () {
  'use strict';

  const PK = window.PK;
  const S = PK.STATE;
  const $ = id => document.getElementById(id);

  const app = {
    vehicleId: 'sedan',
    colorId: 'blue',
    challenge: null, // 도전장으로 진입한 경우 상대 기록
    last: null,      // 마지막 플레이 결과 {vehicleId, colorId, result, snapshot, pose, hits}
  };
  PK.app = app;

  /* ---------- 터치 기기 판별 (방향 버튼 표시) ---------- */
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (coarse) document.body.classList.add('touch');
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

  function applyTouchLabels() {
    const touch = document.body.classList.contains('touch');
    const map = touch ? { up: '▲', down: '▼', left: '◀', right: '▶' } : { up: '↑', down: '↓', left: '←', right: '→' };
    document.querySelectorAll('.tut-lines .key').forEach(k => { k.textContent = map[k.dataset.k]; });
    $('hint').textContent = touch ? '버튼으로 운전하세요' : '방향키로 운전하세요';
  }

  /* ---------- 인트로 / 선택 화면 그리기 (모두 같은 비주얼 슬롯 크기에 맞춤) ---------- */
  function slotSize(canvas) {
    const box = canvas.parentElement;
    return { w: Math.max(80, box.clientWidth), h: Math.max(60, box.clientHeight) };
  }
  function drawIntro() {
    const c = $('intro-canvas'); const s = slotSize(c);
    PK.renderer.renderIntro(c, s.w, s.h);
  }
  /* 3×2 차량 그리드 아이콘: 고정 scale(이전 0.68)을 쓰면 짧은 차(소형차)는 프레임의 41%만
   * 채우고 긴 차(버스)는 88%를 채워 "같은 카드인데 크기가 다르다"는 인상을 준다.
   * scale 없이 padX/padY만 주면 renderPreview가 차종마다 프레임에 맞춰 adaptive fit한다(섹션 6).
   * 아이콘 폭은 버튼 폭에서 계산한다 — 3열이라 320px 폭 화면에서는 버튼이 76px까지 좁아진다. */
  function drawTypeIcons() {
    const short = window.matchMedia && matchMedia('(max-height: 640px)').matches;
    const h = short ? 30 : 46, padX = 5, padY = short ? 3 : 4;
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.type === app.vehicleId);
      const w = Math.max(48, btn.clientWidth - 12);
      PK.renderer.renderPreview(btn.querySelector('canvas'), PK.VEHICLES[btn.dataset.type], '#FFFFFF', { w, h, padX, padY });
    });
  }
  function drawTypePreview() {
    const c = $('type-preview'); const s = slotSize(c);
    PK.renderer.renderPreview(c, PK.VEHICLES[app.vehicleId], '#FFFFFF', { w: s.w, h: s.h, padX: 34, padY: 46 });
  }
  function drawPreview() {
    const c = $('preview-canvas'); const s = slotSize(c);
    PK.renderer.renderPreview(c, PK.VEHICLES[app.vehicleId], PK.COLORS[app.colorId].body, { w: s.w, h: s.h, padX: 34, padY: 46 });
    document.querySelectorAll('.color-btn').forEach(b => b.classList.toggle('selected', b.dataset.color === app.colorId));
  }

  /* ---------- 상태별 진입 처리 ---------- */
  PK.state.on(S.INTRO, drawIntro);
  PK.state.on(S.SELECT_TYPE, () => { drawTypeIcons(); drawTypePreview(); });
  PK.state.on(S.SELECT_COLOR, drawPreview);
  PK.state.on(S.TUTORIAL, applyTouchLabels);
  PK.state.on(S.PLAYING, () => {
    PK.play.start(app.vehicleId, app.colorId, {
      stage: $('stage'), canvas: $('game-canvas'),
      timer: $('timer'), status: $('play-status'), gear: $('gear'), hint: $('hint'),
    }, onPlayDone);
  });

  function track(name) {
    if (window.SiteAnalytics) window.SiteAnalytics.track(name);
  }

  function onPlayDone(out) {
    track('game_complete');
    app.last = out;
    PK.state.set(S.RESULT, out);
  }

  /* ---------- 버튼 ---------- */
  $('btn-start').addEventListener('click', () => {
    track('flow_start');
    PK.state.set(S.SELECT_TYPE);
  });

  $('type-grid').addEventListener('click', e => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    app.vehicleId = btn.dataset.type;
    drawTypeIcons();
    drawTypePreview(); // 탭 = 선택(미리보기 즉시 반영), [다음] = 진행 — 색상 화면과 같은 조작
  });
  $('btn-type-next').addEventListener('click', () => PK.state.set(S.SELECT_COLOR));

  $('color-list').addEventListener('click', e => {
    const btn = e.target.closest('.color-btn');
    if (!btn) return;
    app.colorId = btn.dataset.color;
    drawPreview(); // 즉시 미리보기 반영
  });
  $('btn-color-next').addEventListener('click', () => PK.state.set(S.TUTORIAL));
  $('btn-play').addEventListener('click', () => {
    track('game_start');
    PK.state.set(S.PLAYING);
  });

  $('btn-retry').addEventListener('click', () => {
    track('replay');
    PK.state.set(S.PLAYING);
  });       // 같은 차·색으로 바로 재도전
  $('btn-change-car').addEventListener('click', () => PK.state.set(S.SELECT_TYPE));
  $('btn-challenge-start').addEventListener('click', () => {
    track('challenge_start');
    PK.state.set(S.SELECT_TYPE);
  });
  $('btn-rematch').addEventListener('click', () => {
    track('replay');
    PK.state.set(S.PLAYING);
  });
  $('btn-vs-detail').addEventListener('click', () => PK.state.set(S.RESULT, app.last));
  $('btn-battle-result').addEventListener('click', () => PK.state.set(S.BATTLE_RESULT));

  PK.input.attachDpad($('dpad'));
  window.addEventListener('resize', () => {
    PK.play.resize();
    if (PK.state.current === S.INTRO) drawIntro();
    if (PK.state.current === S.SELECT_TYPE) { drawTypeIcons(); drawTypePreview(); } // 아이콘 폭이 버튼 폭에 따라 바뀜
    if (PK.state.current === S.SELECT_COLOR) drawPreview();
  });

  /* ---------- 스프라이트(에셋) 로드가 끝나면 현재 화면을 다시 그린다 ---------- */
  PK.sprites.onReady(() => {
    const s = PK.state.current;
    if (s === S.INTRO) drawIntro();
    else if (s === S.SELECT_TYPE) { drawTypeIcons(); drawTypePreview(); }
    else if (s === S.SELECT_COLOR) drawPreview();
    else if (s === S.CHALLENGE || s === S.RESULT || s === S.BATTLE_RESULT) PK.state.set(s, app.last);
    PK.play.resize();
  });
  PK.sprites.load();

  /* ---------- 시작: 도전장 링크면 CHALLENGE, 아니면 INTRO ---------- */
  const token = PK.battle.parseHash();
  const rec = token && PK.battle.parseToken(token);
  if (rec) {
    app.challenge = rec;
    PK.state.set(S.CHALLENGE); // 화면 내용은 result-ui.js의 CHALLENGE 핸들러가 그린다
  } else {
    PK.state.set(S.INTRO);
  }
})();
