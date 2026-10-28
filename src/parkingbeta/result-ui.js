/* 주차하기 베타 — 결과 화면 (기존 src/game/result-ui.js와 src/driving/result-ui.js를 섞은
 * 패턴: 점수/등급/코멘트 표시는 주차하기 쪽(PK.scoring의 실제 필드명 center/angle/gap/
 * collision/time/finish 기준), "다음 스테이지" 진행·최고기록 표시는 도로주행 쪽 패턴을
 * 그대로 가져왔다. document.getElementById로 고정 ID를 쓰는 구조라(파라미터화 불가 확인됨)
 * 새 ID 세트로 복제했다 — 기존 두 result-ui.js 파일은 전혀 건드리지 않음. */
(function () {
  'use strict';

  const PK = window.PK;
  const PB = window.PB;
  const S = PB.STATE;
  const $ = id => document.getElementById(id);
  const COLOR_WORD = { blue: '파란색', red: '빨간색', yellow: '노란색', white: '흰색' };

  let toastTimer = 0;
  function toast(msg) {
    const el = $('parkingbeta-toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }
  function vehicleLabel(out) { return COLOR_WORD[out.colorId] + ' ' + PK.VEHICLES[out.vehicleId].label; }

  /* 잘한 점 한 줄(§ 도로주행에서 쓴 것과 같은 아이디어) — PK.scoring.js는 건드리지 않고
   * 여기서 parts/MAX 비율만으로 계산한다. 만점에 가까운(99%+) 항목이 없으면 null. */
  const BEST_ASPECT_LABEL = {
    center: '중앙 정렬 우수', angle: '각도 정확', gap: '좌우 간격 균형',
    collision: '무충돌', time: '빠른 주차', finish: '깔끔한 마무리',
  };
  function bestAspect(parts) {
    const MAX = PK.SCORE_MAX;
    let bestKey = null, bestRatio = -1;
    PK.SCORE_LABELS.forEach(([key]) => {
      const ratio = MAX[key] > 0 ? parts[key] / MAX[key] : 0;
      if (ratio > bestRatio) { bestRatio = ratio; bestKey = key; }
    });
    return bestRatio >= 0.99 ? BEST_ASPECT_LABEL[bestKey] : null;
  }

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
    drawInto($('parkingbeta-result-canvas'), out.snapshotWide || out.snapshot);
    $('parkingbeta-result-stage').textContent = PB.STAGES[out.stageId - 1].label;
    $('parkingbeta-result-score').innerHTML = r.total + '<span class="unit">점</span>';
    $('parkingbeta-result-grade').textContent = r.grade;
    $('parkingbeta-result-comment').textContent = r.notes.length ? r.notes[0] : r.comment;
    $('parkingbeta-result-vehicle').textContent = vehicleLabel(out);
    const rows = PK.SCORE_LABELS.map(([key, label]) =>
      '<div class="subscore-row"><span class="label">' + label + '</span>' +
      '<span class="value">' + r.parts[key] + ' / ' + PK.SCORE_MAX[key] + '</span></div>').join('');
    $('parkingbeta-subscores').innerHTML = rows;

    const chips = (r.notes || []).slice(0, 1).map(t => '<span class="parkingbeta-record">' + t + '</span>');
    const ba = bestAspect(r.parts);
    if (ba) chips.push('<span class="parkingbeta-record parkingbeta-record--good">' + ba + '</span>');
    $('parkingbeta-records').innerHTML = chips.join('');

    $('parkingbeta-result-newrecord').classList.toggle('hidden', !(out.isNewRecord && out.prevBest != null));
    const bestEl = $('parkingbeta-result-best');
    if (out.isNewRecord) {
      bestEl.textContent = out.prevBest != null ? '이전 최고 ' + out.prevBest + '점 경신' : '첫 기록';
      bestEl.classList.remove('hidden');
    } else if (out.prevBest != null) {
      bestEl.textContent = '최고 기록 ' + out.prevBest + '점';
      bestEl.classList.remove('hidden');
    } else {
      bestEl.classList.add('hidden');
    }

    // "다음 스테이지"는 주차에 성공했고(parked) 마지막 스테이지가 아닐 때만 최우선 액션.
    // 실패(시간 초과 등)했으면 같은 스테이지를 "다시 하기"로 재도전— 다음 스테이지로 못 넘어감.
    const isLastStage = out.stageId >= PB.STAGES.length;
    const canNext = out.parked && !isLastStage;
    const allClear = out.parked && isLastStage;
    $('btn-parkingbeta-next-stage').classList.toggle('hidden', !canNext);
    $('btn-parkingbeta-result-home').classList.toggle('hidden', !allClear);
    $('parkingbeta-result-allclear').classList.toggle('hidden', !allClear);
    const retryPrimary = !canNext && !allClear;
    $('btn-parkingbeta-retry').classList.toggle('cta', retryPrimary);
    $('btn-parkingbeta-retry').classList.toggle('btn-secondary', !retryPrimary);
    $('btn-parkingbeta-battle-result').classList.toggle('hidden', !PB.app.challenge);
  }
  PB.state.on(S.RESULT, out => renderResult(out || PB.app.last));

  /* ---------- 도전장 (닉네임 → 링크) — 기존 src/game/result-ui.js의 askNickname과 같은
   * 구조지만, 전용 모달(#parkingbeta-modal)을 따로 쓴다(공용 #modal은 beta.html 독립 페이지엔
   * 아예 없다 — index.html/beta.html 두 경로 모두에서 동작하려면 이 모듈이 자기 모달을
   * 들고 있어야 한다). ---------- */
  function askNickname() {
    return new Promise(resolve => {
      const modal = $('parkingbeta-modal'), input = $('parkingbeta-modal-input');
      modal.classList.remove('hidden');
      input.value = '';
      setTimeout(() => input.focus(), 50);
      const done = val => {
        modal.classList.add('hidden');
        $('parkingbeta-modal-ok').removeEventListener('click', ok);
        $('parkingbeta-modal-cancel').removeEventListener('click', cancel);
        input.removeEventListener('keydown', key);
        resolve(val);
      };
      const ok = () => done((input.value || '').trim() || '친구');
      const cancel = () => done(null);
      const key = e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cancel(); };
      $('parkingbeta-modal-ok').addEventListener('click', ok);
      $('parkingbeta-modal-cancel').addEventListener('click', cancel);
      input.addEventListener('keydown', key);
    });
  }

  $('btn-parkingbeta-challenge').addEventListener('click', async () => {
    const out = PB.app.last;
    if (!out) return;
    const nickname = await askNickname();
    if (nickname == null) return;
    const token = PB.battle.makeToken({
      nickname, stageId: out.stageId, total: out.result.total, parts: out.result.parts,
      vehicleId: out.vehicleId, colorId: out.colorId, pose: out.pose, hits: out.hits,
    });
    const url = PB.battle.buildUrl(token);
    const text = '내 주차하기 베타 ' + PB.STAGES[out.stageId - 1].label + ' 기록 ' + out.result.total + '점. 이길 수 있으면 해보세요.';
    const how = await PB.share.shareLink(url, text);
    if (how === 'copied') toast('도전장 링크를 복사했습니다');
    else if (how === 'failed') { window.prompt('도전장 링크를 복사하세요', url); }
  });

  /* ---------- 도전장 화면: 상대의 최종 주차 모습 + 기록 ---------- */
  PB.state.on(S.CHALLENGE, () => {
    const a = PB.app.challenge;
    if (!a) { PB.state.set(S.INTRO); return; }
    drawInto($('parkingbeta-challenge-canvas'), PB.battle.snapshotOf(a, 640, 1.6));
    $('parkingbeta-challenge-name').textContent = a.nickname + '의 주차 기록';
    $('parkingbeta-challenge-stage').textContent = PB.STAGES[a.stageId - 1].label;
    $('parkingbeta-challenge-score').innerHTML = a.total + '<span class="unit">점</span>';
  });

  /* ---------- 대결 결과 ---------- */
  PB.state.on(S.BATTLE_RESULT, () => {
    const a = PB.app.challenge, b = PB.app.last;
    if (!a || !b) { PB.state.set(S.RESULT, b); return; }
    drawInto($('parkingbeta-vs-a-canvas'), PB.battle.snapshotOf(a, 640, 1.3));
    drawInto($('parkingbeta-vs-b-canvas'), PB.battle.snapshotOf({ stageId: a.stageId, vehicleId: b.vehicleId, colorId: b.colorId, pose: b.pose }, 640, 1.3));
    $('parkingbeta-vs-a-name').textContent = a.nickname;
    $('parkingbeta-vs-b-name').textContent = '나';
    $('parkingbeta-vs-a-score').textContent = a.total;
    $('parkingbeta-vs-b-score').textContent = b.result.total;
    const diff = b.result.total - a.total;
    $('parkingbeta-vs-winner').textContent = diff > 0 ? '이겼습니다. ' + diff + '점 차이.'
      : diff < 0 ? '졌습니다. ' + (-diff) + '점 부족.' : '무승부. 한 번 더.';
  });

  PB.resultUI = { toast, renderResult, vehicleLabel };
})();
