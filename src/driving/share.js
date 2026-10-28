/* 도로주행 — 결과 이미지(1080×1920, 흰 배경·검은 글씨) + Web Share / 저장 fallback
 * 주차게임 share.js와 같은 시리즈로 보이도록 동일한 레이아웃 문법을 쓰되, 파일을 공유하지
 * 않고 새로 작성한다(주차게임 share.js는 수정하지 않음). */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;

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

  function buildImage(stageId, result, snapshot, vehicleLabel) {
    const W = 1080, H = 1920;
    const FONT = window.PK.FONT;
    const cnv = document.createElement('canvas');
    cnv.width = W; cnv.height = H;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#000000';
    ctx.font = '800 60px ' + FONT;
    ctx.fillText('도로주행', W / 2, 144);
    ctx.font = '700 36px ' + FONT;
    ctx.fillStyle = '#777777';
    ctx.fillText('STAGE ' + stageId, W / 2, 196);

    const box = 680, bx = (W - box) / 2, by = 240;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(bx, by, box, box);
    if (snapshot) ctx.drawImage(snapshot, bx, by, box, box);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 3;
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
    const sy = 1146, sx = W / 2 - (sw + uw + 8) / 2;
    ctx.textAlign = 'left';
    ctx.font = scoreFont; ctx.fillText(scoreText, sx, sy);
    ctx.font = unitFont; ctx.fillText('점', sx + sw + 8, sy);
    ctx.textAlign = 'center';

    ctx.font = '700 60px ' + FONT;
    ctx.fillText(result.grade, W / 2, 1246);

    ctx.fillStyle = '#777777';
    ctx.font = '500 42px ' + FONT;
    wrapLines(ctx, result.notes.length ? result.notes[0] : result.comment, 880).forEach((line, i) => ctx.fillText(line, W / 2, 1316 + i * 56));

    const gridW = 680, colW = (gridW - 56) / 2, gx = (W - gridW) / 2, rowH = 58, gy = 1430;
    DRIVING.SCORE_LABELS.forEach(([key, label], i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = gx + col * (colW + 56), y = gy + row * rowH;
      ctx.textAlign = 'left'; ctx.fillStyle = '#777777'; ctx.font = '600 26px ' + FONT;
      ctx.fillText(label, x, y + 34);
      ctx.textAlign = 'right'; ctx.fillStyle = '#000000'; ctx.font = '700 26px ' + FONT;
      ctx.fillText(result.parts[key] + ' / ' + DRIVING.SCORE_MAX[key], x + colW, y + 34);
      ctx.strokeStyle = '#DDDDDD'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y + rowH - 8); ctx.lineTo(x + colW, y + rowH - 8); ctx.stroke();
    });
    ctx.textAlign = 'center';

    ctx.fillStyle = '#000000';
    ctx.font = '900 74px ' + FONT;
    ctx.fillText('안전하게 도착하세요', W / 2, 1780);
    return cnv;
  }

  const toBlob = canvas => new Promise(res => canvas.toBlob(res, 'image/png'));

  function download(canvas, name) {
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  }

  async function shareImage(stageId, result, canvas) {
    const name = '도로주행_STAGE' + stageId + '_' + result.total + '점.png';
    const blob = await toBlob(canvas);
    if (!blob) throw new Error('이미지 생성 실패');
    const file = new File([blob], name, { type: 'image/png' });
    const text = '도로주행 STAGE ' + stageId + ' · ' + result.total + '점 · ' + result.grade + '\n안전하게 도착하세요';
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '도로주행', text });
      return 'shared';
    }
    download(canvas, name);
    return 'saved';
  }

  async function shareLink(url, text) {
    const isTouch = document.body.classList.contains('touch');
    if (isTouch && navigator.share) {
      try { await navigator.share({ title: '도로주행', text, url }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'aborted'; }
    }
    try { await navigator.clipboard.writeText(url); return 'copied'; }
    catch (_) { return 'failed'; }
  }

  DRIVING.share = { buildImage, download, shareImage, shareLink };
})();
