/* 주차하기 베타 — 결과 이미지 + 공유 (기존 src/game/share.js와 그리기 구조는 동일하지만
 * "주차하기"/"한 번에 주차하세요" 같은 문구가 캔버스에 직접 그려져 있어(코드 안에 박혀
 * 있는 텍스트라 인자로 뺄 수 없음) 그대로 재사용하면 베타 결과 이미지에 원래 게임 이름이
 * 나온다 — 그 문구만 "주차하기 베타"/스테이지 번호로 바꾼 버전이 필요해 새로 둔다.
 * download는 완전히 범용(캔버스+파일명만 받음)이라 그대로 가져다 썼다. */
(function () {
  'use strict';

  const PK = window.PK;
  const PB = (window.PB = window.PB || {});

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

  /* result: {total, parts, grade, comment}, snapshot: canvas, vehicleLabel, stageId */
  function buildImage(result, snapshot, vehicleLabel, stageId) {
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
    ctx.font = '800 60px ' + FONT;
    ctx.fillText('주차하기 베타 · STAGE ' + stageId, W / 2, 150);

    const box = 680, bx = (W - box) / 2, by = 226;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(bx, by, box, box);
    if (snapshot) ctx.drawImage(snapshot, bx, by, box, box);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx + 1.5, by + 1.5, box - 3, box - 3);

    ctx.fillStyle = '#777777';
    ctx.font = '600 34px ' + FONT;
    ctx.fillText(vehicleLabel || '', W / 2, by + box + 62);

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
    ctx.font = '900 76px ' + FONT;
    ctx.fillText('단계별로 더 어려워지는 주차', W / 2, 1760);
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

  async function shareImage(result, canvas, stageId) {
    const name = '주차하기베타_STAGE' + stageId + '_' + result.total + '점.png';
    const blob = await toBlob(canvas);
    if (!blob) throw new Error('이미지 생성 실패');
    const file = new File([blob], name, { type: 'image/png' });
    const text = '주차하기 베타 STAGE ' + stageId + ' · ' + result.total + '점 · ' + result.grade;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '주차하기 베타', text });
      return 'shared';
    }
    download(canvas, name);
    return 'saved';
  }

  /* 도전장 링크 공유 — src/game/share.js의 shareLink와 로직은 동일(제목 문구만 "주차하기
   * 베타"로 다름). 'shared' | 'copied' | 'aborted' | 'failed' */
  async function shareLink(url, text) {
    const isTouch = document.body.classList.contains('touch');
    if (isTouch && navigator.share) {
      try { await navigator.share({ title: '주차하기 베타', text, url }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'aborted'; }
    }
    try { await navigator.clipboard.writeText(url); return 'copied'; }
    catch (_) { return 'failed'; }
  }

  PB.share = { buildImage, download, shareImage, shareLink };
})();
