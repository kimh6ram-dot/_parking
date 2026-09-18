/* 주차하기 — 결과 화면 · 이미지 저장 · 공유 · 도전장 · 대결 결과 */
(function () {
  'use strict';

  const PK = window.PK;
  const S = PK.STATE;
  const $ = id => document.getElementById(id);
  const COLOR_WORD = { blue: '파란색', red: '빨간색', yellow: '노란색', white: '흰색' };

  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function vehicleLabel(out) {
    return COLOR_WORD[out.colorId] + ' ' + PK.VEHICLES[out.vehicleId].label;
  }

  /* 슬롯(부모 박스) 크기에 맞춰 캔버스를 잡고, 소스를 비율 유지(contain)로 가운데 그린다 */
  function drawInto(canvas, source) {
    const box = canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let cw = box.clientWidth, ch = box.clientHeight;
    if (canvas.classList.contains('fit-width') || !ch) { cw = cw || 300; ch = Math.round(cw * source.height / source.width); }
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cw, ch);
    const s = Math.min(cw / source.width, ch / source.height);
    const dw = source.width * s, dh = source.height * s;
    ctx.drawImage(source, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  /* ---------- 결과 화면 ---------- */
  function renderResult(out) {
    const r = out.result;
    drawInto($('result-canvas'), out.snapshotWide || out.snapshot);
    $('result-score').innerHTML = r.total + '<span class="unit">점</span>';
    $('result-grade').textContent = r.grade;
    // 등급 제목 아래는 한 줄만: 충돌/시간초과 같은 특이사항이 있으면 그걸 먼저 보여주고
    // (숫자는 이미 세부 점수에 나와 있어 더 설명할 필요 없음), 없으면 평소 코멘트만.
    // 코멘트+특이사항을 같이 쌓아 보여주던 3줄 구성이 "너무 말이 많다"는 피드백으로 정리.
    $('result-comment').textContent = r.notes.length ? r.notes[0] : r.comment;
    $('result-notes').textContent = '';
    $('result-vehicle').textContent = vehicleLabel(out);
    // 2열 3줄 (공유 이미지와 같은 배치) — 한 화면에 들어오도록
    const rows = PK.SCORE_LABELS.map(([key, label]) =>
      '<div class="subscore-row"><span class="label">' + label + '</span>' +
      '<span class="value">' + r.parts[key] + ' / ' + PK.SCORE_MAX[key] + '</span></div>').join('');
    $('subscores').innerHTML = rows;
    $('btn-battle-result').classList.toggle('hidden', !PK.app.challenge);
  }
  PK.state.on(S.RESULT, out => renderResult(out || PK.app.last));

  /* ---------- 이미지 저장 / 공유 ---------- */
  $('btn-save-img').addEventListener('click', () => {
    const out = PK.app.last;
    if (!out) return;
    const img = PK.share.buildImage(out.result, out.snapshot, vehicleLabel(out));
    PK.share.download(img, '주차하기_' + out.result.total + '점.png');
    toast('이미지를 저장했습니다');
  });
  $('btn-share').addEventListener('click', async () => {
    const out = PK.app.last;
    if (!out) return;
    try {
      const img = PK.share.buildImage(out.result, out.snapshot, vehicleLabel(out));
      const how = await PK.share.shareImage(out.result, img);
      if (how === 'saved') toast('공유가 지원되지 않아 이미지를 저장했습니다');
    } catch (e) {
      if (!e || e.name !== 'AbortError') toast('공유에 실패했습니다');
    }
  });

  /* ---------- 도전장 (닉네임 → 링크) ---------- */
  function askNickname() {
    return new Promise(resolve => {
      const modal = $('modal'), input = $('modal-input');
      modal.classList.remove('hidden');
      input.value = '';
      setTimeout(() => input.focus(), 50);
      const done = val => {
        modal.classList.add('hidden');
        $('modal-ok').removeEventListener('click', ok);
        $('modal-cancel').removeEventListener('click', cancel);
        input.removeEventListener('keydown', key);
        resolve(val);
      };
      const ok = () => done((input.value || '').trim() || '친구');
      const cancel = () => done(null);
      const key = e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cancel(); };
      $('modal-ok').addEventListener('click', ok);
      $('modal-cancel').addEventListener('click', cancel);
      input.addEventListener('keydown', key);
    });
  }

  $('btn-challenge').addEventListener('click', async () => {
    const out = PK.app.last;
    if (!out) return;
    const nickname = await askNickname();
    if (nickname == null) return;
    const token = PK.battle.makeToken({
      nickname, total: out.result.total, parts: out.result.parts,
      vehicleId: out.vehicleId, colorId: out.colorId, pose: out.pose, hits: out.hits,
    });
    const url = PK.battle.buildUrl(token);
    const text = '내 후면주차 기록 ' + out.result.total + '점. 이길 수 있으면 해보세요.';
    const how = await PK.share.shareLink(url, text);
    if (how === 'copied') toast('도전장 링크를 복사했습니다');
    else if (how === 'failed') { window.prompt('도전장 링크를 복사하세요', url); }
  });

  /* ---------- 도전장 화면: 상대의 최종 주차 모습 + 기록 ---------- */
  PK.state.on(S.CHALLENGE, () => {
    const a = PK.app.challenge;
    if (!a) { PK.state.set(S.INTRO); return; }
    drawInto($('challenge-canvas'), PK.battle.snapshotOf(a, 640, 1.6));
    $('challenge-name').textContent = a.nickname + '의 후면주차 기록';
    $('challenge-score').innerHTML = a.total + '<span class="unit">점</span>';
  });

  /* ---------- 대결 결과 ---------- */
  PK.state.on(S.BATTLE_RESULT, () => {
    const a = PK.app.challenge, b = PK.app.last;
    if (!a || !b) { PK.state.set(S.RESULT, b); return; }
    // 두 사람 모두 같은 비율(1.3:1)로 다시 그려 나란히 비교
    drawInto($('vs-a-canvas'), PK.battle.snapshotOf(a, 640, 1.3));
    drawInto($('vs-b-canvas'), PK.battle.snapshotOf({ vehicleId: b.vehicleId, colorId: b.colorId, pose: b.pose }, 640, 1.3));
    $('vs-a-name').textContent = a.nickname;
    $('vs-b-name').textContent = '나';
    $('vs-a-score').textContent = a.total;
    $('vs-b-score').textContent = b.result.total;
    const diff = b.result.total - a.total;
    $('vs-winner').textContent = diff > 0 ? '이겼습니다. ' + diff + '점 차이.'
      : diff < 0 ? '졌습니다. ' + (-diff) + '점 부족.' : '무승부. 한 번 더.';
  });

  PK.resultUI = { toast, renderResult, vehicleLabel };
})();
