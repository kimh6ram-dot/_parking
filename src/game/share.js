/* 주차하기 — 결과 이미지(1080×1920, 흰 배경·검은 글씨·결과 오브젝트만 컬러) + Web Share / 저장 fallback */
(function () {
  'use strict';

  const PK = window.PK;

  function wrapLines(ctx, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /* result: {total, parts, grade, comment}, snapshot: canvas, vehicleLabel: '노란색 버스' */
  function buildImage(result, snapshot, vehicleLabel) {
    const W = 1080, H = 1920;
    const FONT = PK.FONT;
    const cnv = document.createElement('canvas');
    cnv.width = W; cnv.height = H;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#000000';
    ctx.font = '800 66px ' + FONT;
    ctx.fillText('주차하기', W / 2, 164);

    // 최종 주차 상태 — 1px 검정 프레임
    const box = 680, bx = (W - box) / 2, by = 226;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(bx, by, box, box);
    if (snapshot) ctx.drawImage(snapshot, bx, by, box, box);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx + 1.5, by + 1.5, box - 3, box - 3);

    // 차량 라벨 (회색)
    ctx.fillStyle = '#777777';
    ctx.font = '600 34px ' + FONT;
    ctx.fillText(vehicleLabel || '', W / 2, by + box + 62);

    // 점수
    ctx.fillStyle = '#000000';
    const scoreText = String(result.total);
    const scoreFont = '800 140px ' + FONT, unitFont = '700 60px ' + FONT;
    ctx.font = scoreFont;
    const sw = ctx.measureText(scoreText).width;
    ctx.font = unitFont;
    const uw = ctx.measureText('점').width;
    const sy = 1132, sx = W / 2 - (sw + uw + 8) / 2;
    ctx.textAlign = 'left';
    ctx.font = scoreFont; ctx.fillText(scoreText, sx, sy);
    ctx.font = unitFont; ctx.fillText('점', sx + sw + 8, sy);
    ctx.textAlign = 'center';

    ctx.font = '700 60px ' + FONT;
    ctx.fillText(result.grade, W / 2, 1232);

    ctx.fillStyle = '#777777';
    ctx.font = '500 42px ' + FONT;
    wrapLines(ctx, result.comment, 880).forEach((line, i) => ctx.fillText(line, W / 2, 1302 + i * 56));

    // 세부 점수 2열
    const gridW = 680, colW = (gridW - 56) / 2, gx = (W - gridW) / 2, rowH = 58, gy = 1420;
    PK.SCORE_LABELS.forEach(([key, label], i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = gx + col * (colW + 56), y = gy + row * rowH;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#777777';
      ctx.font = '600 26px ' + FONT;
      ctx.fillText(label, x, y + 34);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#000000';
      ctx.font = '700 26px ' + FONT;
      ctx.fillText(result.parts[key] + ' / ' + PK.SCORE_MAX[key], x + colW, y + 34);
      ctx.strokeStyle = '#DDDDDD';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y + rowH - 8); ctx.lineTo(x + colW, y + rowH - 8); ctx.stroke();
    });
    ctx.textAlign = 'center';

    ctx.fillStyle = '#000000';
    ctx.font = '900 80px ' + FONT;
    ctx.fillText('한 번에 주차하세요', W / 2, 1760);
    return cnv;
  }

  const toBlob = canvas => new Promise(res => canvas.toBlob(res, 'image/png'));

  function download(canvas, name) {
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  }

  /* 이미지 파일 공유 → 미지원 시 저장. 'shared' | 'saved' */
  async function shareImage(result, canvas) {
    const name = '주차하기_' + result.total + '점.png';
    const blob = await toBlob(canvas);
    if (!blob) throw new Error('이미지 생성 실패');
    const file = new File([blob], name, { type: 'image/png' });
    const text = '주차하기 ' + result.total + '점 · ' + result.grade + '\n한 번에 주차하세요';
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '주차하기', text });
      return 'shared';
    }
    download(canvas, name);
    return 'saved';
  }

  /* 링크 공유 → 미지원/실패 시 클립보드 복사. 'shared' | 'copied' | 'aborted' | 'failed'
   * 데스크톱(마우스)에서는 navigator.share가 있어도 건너뛴다 — 있어도 OS 공유 패널이
   * 뜰 뿐이고(대부분 보낼 곳이 마땅치 않아 취소하게 됨), 그러면 화면엔 아무 피드백도
   * 없어서 "안 된다"로 느껴진다. 데스크톱은 항상 클립보드 복사 + 토스트로 확실히 알려준다.
   * 터치 기기는 메시지 앱으로 바로 보낼 수 있는 네이티브 공유가 더 편해서 우선 시도하되,
   * 사용자가 취소한 게 아닌 다른 이유로 실패하면 복사로 폴백한다. */
  async function shareLink(url, text) {
    const isTouch = document.body.classList.contains('touch');
    if (isTouch && navigator.share) {
      try { await navigator.share({ title: '주차하기', text, url }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'aborted'; }
    }
    try { await navigator.clipboard.writeText(url); return 'copied'; }
    catch (_) { return 'failed'; }
  }

  PK.share = { buildImage, download, shareImage, shareLink };
})();
