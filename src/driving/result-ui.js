/* 도로주행 — 결과 화면 · 이미지 저장 · 공유 · 도전장 · 대결 결과 (주차게임 result-ui.js와 같은 문법) */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;
  const S = DRIVING.STATE;
  const $ = id => document.getElementById(id);
  const COLOR_WORD = { blue: '파란색', red: '빨간색', yellow: '노란색', white: '흰색' };

  let toastTimer = 0;
  function toast(msg) {
    const el = $('driving-toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }
  function vehicleLabel(out) { return COLOR_WORD[out.colorId] + ' ' + window.PK.VEHICLES[out.vehicleId].label; }

  function drawInto(canvas, source) {
    const box = canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let cw = box.clientWidth, ch = box.clientHeight;
    if (!ch) { cw = cw || 300; ch = Math.round(cw * source.height / source.width); }
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, cw, ch);
    const s = Math.min(cw / source.width, ch / source.height);
    const dw = source.width * s, dh = source.height * s;
    ctx.drawImage(source, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  function renderResult(out) {
    const r = out.result;
    drawInto($('driving-result-canvas'), out.snapshot);
    $('driving-result-stage').textContent = 'STAGE ' + out.stageId;
    $('driving-result-score').innerHTML = r.total + '<span class="unit">점</span>';
    $('driving-result-grade').textContent = r.grade;
    $('driving-result-comment').textContent = r.notes.length ? r.notes[0] : r.comment;
    $('driving-result-vehicle').textContent = vehicleLabel(out);
    const rows = DRIVING.SCORE_LABELS.map(([key, label]) =>
      '<div class="subscore-row"><span class="label">' + label + '</span>' +
      '<span class="value">' + r.parts[key] + ' / ' + DRIVING.SCORE_MAX[key] + '</span></div>').join('');
    $('driving-subscores').innerHTML = rows;
    // §5 — 가장 큰 감점 이유(기존 records[0])에 "잘한 점"(bestAspect) 칩을 하나 더해 보여준다.
    const chips = (r.records || []).map(t => '<span class="driving-record">' + t + '</span>');
    if (r.bestAspect) chips.push('<span class="driving-record driving-record--good">' + r.bestAspect + '</span>');
    $('driving-records').innerHTML = chips.join('');

    // §5 — 스테이지+차종 기준 최고 기록·신기록 표시.
    $('driving-result-newrecord').classList.toggle('hidden', !(out.isNewRecord && out.prevBest != null));
    const bestEl = $('driving-result-best');
    if (out.isNewRecord) {
      bestEl.textContent = out.prevBest != null ? '이전 최고 ' + out.prevBest + '점 경신' : '첫 기록';
      bestEl.classList.remove('hidden');
    } else if (out.prevBest != null) {
      bestEl.textContent = '최고 기록 ' + out.prevBest + '점';
      bestEl.classList.remove('hidden');
    } else {
      bestEl.classList.add('hidden');
    }

    // §24,§49: "다음 스테이지"가 있으면 그것이 최우선 액션(cta). STAGE 5까지 클리어했으면
    // 다음 스테이지 대신 "메인으로"가 그 자리를 대신한다("모든 스테이지 완료" 표시와 함께).
    // 둘 다 아니면(실패, 혹은 원래도 마지막 스테이지가 아니지만 도착 못함) "다시 하기"가
    // 유일한 최우선 액션이 되도록 cta로 격상하고, 있으면 다시 하기는 차 바꾸기와 같은
    // 무게의 보조 버튼으로 낮춘다.
    const isLastStage = out.stageId >= DRIVING.STAGES.length;
    const canNext = out.arrived && !isLastStage;
    const allClear = out.arrived && isLastStage;
    $('btn-driving-next-stage').classList.toggle('hidden', !canNext);
    $('btn-driving-result-home').classList.toggle('hidden', !allClear);
    $('driving-result-allclear').classList.toggle('hidden', !allClear);
    const retryPrimary = !canNext && !allClear;
    $('btn-driving-retry').classList.toggle('cta', retryPrimary);
    $('btn-driving-retry').classList.toggle('btn-secondary', !retryPrimary);
    $('btn-driving-battle-result').classList.toggle('hidden', !DRIVING.app.challenge);
  }
  DRIVING.state.on(S.RESULT, out => renderResult(out || DRIVING.app.last));

  $('btn-driving-save-img').addEventListener('click', () => {
    const out = DRIVING.app.last;
    if (!out) return;
    const img = DRIVING.share.buildImage(out.stageId, out.result, out.snapshot, vehicleLabel(out));
    DRIVING.share.download(img, '도로주행_STAGE' + out.stageId + '_' + out.result.total + '점.png');
    toast('이미지를 저장했습니다');
  });
  $('btn-driving-share').addEventListener('click', async () => {
    const out = DRIVING.app.last;
    if (!out) return;
    try {
      const img = DRIVING.share.buildImage(out.stageId, out.result, out.snapshot, vehicleLabel(out));
      const how = await DRIVING.share.shareImage(out.stageId, out.result, img);
      if (how === 'saved') toast('공유가 지원되지 않아 이미지를 저장했습니다');
    } catch (e) {
      if (!e || e.name !== 'AbortError') toast('공유에 실패했습니다');
    }
  });

  function askNickname() {
    return new Promise(resolve => {
      const modal = $('driving-modal'), input = $('driving-modal-input');
      modal.classList.remove('hidden');
      input.value = '';
      setTimeout(() => input.focus(), 50);
      const done = val => {
        modal.classList.add('hidden');
        $('driving-modal-ok').removeEventListener('click', ok);
        $('driving-modal-cancel').removeEventListener('click', cancel);
        input.removeEventListener('keydown', key);
        resolve(val);
      };
      const ok = () => done((input.value || '').trim() || '친구');
      const cancel = () => done(null);
      const key = e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cancel(); };
      $('driving-modal-ok').addEventListener('click', ok);
      $('driving-modal-cancel').addEventListener('click', cancel);
      input.addEventListener('keydown', key);
    });
  }

  $('btn-driving-challenge').addEventListener('click', async () => {
    const out = DRIVING.app.last;
    if (!out) return;
    const nickname = await askNickname();
    if (nickname == null) return;
    const token = DRIVING.battle.makeToken({
      nickname, stageId: out.stageId, total: out.result.total, parts: out.result.parts,
      vehicleId: out.vehicleId, colorId: out.colorId, pose: out.pose,
    });
    const url = DRIVING.battle.buildUrl(token);
    const text = '내 도로주행 기록\nSTAGE ' + out.stageId + ' · ' + out.result.total + '점\n이길 수 있으면 해보세요.';
    const how = await DRIVING.share.shareLink(url, text);
    if (how === 'copied') toast('도전장 링크를 복사했습니다');
    else if (how === 'failed') window.prompt('도전장 링크를 복사하세요', url);
  });

  DRIVING.state.on(S.CHALLENGE, () => {
    const a = DRIVING.app.challenge;
    if (!a) { DRIVING.state.set(S.INTRO); return; }
    drawInto($('driving-challenge-canvas'), DRIVING.battle.snapshotOf(a, 640, 1.6));
    $('driving-challenge-name').textContent = a.nickname + '의 도로주행 기록';
    $('driving-challenge-stage').textContent = 'STAGE ' + a.stageId;
    $('driving-challenge-score').innerHTML = a.total + '<span class="unit">점</span>';
  });

  DRIVING.state.on(S.BATTLE_RESULT, () => {
    const a = DRIVING.app.challenge, b = DRIVING.app.last;
    if (!a || !b) { DRIVING.state.set(S.RESULT, b); return; }
    drawInto($('driving-vs-a-canvas'), DRIVING.battle.snapshotOf(a, 640, 1.3));
    drawInto($('driving-vs-b-canvas'), DRIVING.renderer.snapshot(DRIVING.STAGES[b.stageId - 1],
      { x: DRIVING.STAGES[b.stageId - 1].destination.cx + b.pose.dx, y: DRIVING.STAGES[b.stageId - 1].destination.y1 - 10, heading: b.pose.hdeg * Math.PI / 180, vehicleId: b.vehicleId, vehicle: window.PK.VEHICLES[b.vehicleId], speed: 0 },
      window.PK.COLORS[b.colorId].body, [], 640, 1.3));
    $('driving-vs-a-name').textContent = a.nickname;
    $('driving-vs-b-name').textContent = '나';
    $('driving-vs-a-score').textContent = a.total;
    $('driving-vs-b-score').textContent = b.result.total;
    const diff = b.result.total - a.total;
    $('driving-vs-winner').textContent = diff > 0 ? '이겼습니다. ' + diff + '점 차이.'
      : diff < 0 ? '졌습니다. ' + (-diff) + '점 부족.' : '무승부. 한 번 더.';
  });

  DRIVING.resultUI = { toast, renderResult, vehicleLabel };
})();
