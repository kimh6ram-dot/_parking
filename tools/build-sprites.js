/* assets/*.png → src/game/sprites-data.js
 * 여백 제거 + 2배 축소 + base64 내장 (file://로 열어도 캔버스 오염 없이 착색·이미지 저장 가능)
 * 사용: node tools/build-sprites.js [--analyze] */
'use strict';
const fs = require('fs');
const path = require('path');
const png = require('./png');

const ROOT = path.join(__dirname, '..');
const SPRITES = [
  { id: 'sedan',   file: '승용차.png', front: 'up' },
  { id: 'compact', file: '소형차.png', front: 'up' },
  { id: 'truck',   file: '트럭.png',   front: 'right' },
  { id: 'bus',     file: '버스.png',   front: 'up' },
];
const ALPHA_MIN = 24;

/* 바깥에서 이어진 흰 배경을 투명으로 (배경이 불투명한 PNG 대비) */
function keyOutWhite(img) {
  const { width: w, height: h, data } = img;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = y * w + x; if (seen[i]) return; const o = i * 4; if (data[o + 3] > 0 && (data[o] < 246 || data[o + 1] < 246 || data[o + 2] < 246)) return; seen[i] = 1; stack.push(i); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) { const i = stack.pop(); const x = i % w, y = (i / w) | 0; data[i * 4 + 3] = 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
}

function bbox(img) {
  const { width: w, height: h, data } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const rowWidths = [];
  for (let y = 0; y < h; y++) {
    let rx0 = -1, rx1 = -1;
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] >= ALPHA_MIN) { if (rx0 < 0) rx0 = x; rx1 = x; }
    if (rx0 >= 0) { rowWidths.push(rx1 - rx0 + 1); x0 = Math.min(x0, rx0); x1 = Math.max(x1, rx1); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const colWidths = [];
  for (let x = x0; x <= x1; x++) {
    let cy0 = -1, cy1 = -1;
    for (let y = y0; y <= y1; y++) if (data[(y * w + x) * 4 + 3] >= ALPHA_MIN) { if (cy0 < 0) cy0 = y; cy1 = y; }
    if (cy0 >= 0) colWidths.push(cy1 - cy0 + 1);
  }
  const pct = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, rowW: pct(rowWidths, 0.5), colH: pct(colWidths, 0.5) };
}

/* 2배 축소 (알파 가중 평균) + 크롭 */
function downsampleCrop(img, b, margin) {
  const sx = Math.max(0, b.x - margin), sy = Math.max(0, b.y - margin);
  const ex = Math.min(img.width, b.x + b.w + margin), ey = Math.min(img.height, b.y + b.h + margin);
  const w = Math.floor((ex - sx) / 2), h = Math.floor((ey - sy) / 2);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, bl = 0, a = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const o = ((sy + y * 2 + dy) * img.width + (sx + x * 2 + dx)) * 4;
      const al = img.data[o + 3];
      r += img.data[o] * al; g += img.data[o + 1] * al; bl += img.data[o + 2] * al; a += al;
    }
    const o = (y * w + x) * 4;
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(bl / a); }
    out[o + 3] = Math.round(a / 4);
  }
  return { width: w, height: h, data: out };
}

function colorSummary(img) {
  const m = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < ALPHA_MIN) continue;
    const k = [img.data[i], img.data[i + 1], img.data[i + 2]].map(v => Math.round(v / 16) * 16).join(',');
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => k + ':' + n).join('  ');
}

const analyze = process.argv.includes('--analyze');
const out = {};
for (const s of SPRITES) {
  const img = png.decode(fs.readFileSync(path.join(ROOT, 'assets', s.file)));
  const corner = img.data[3];
  if (corner === 255) keyOutWhite(img);
  const b = bbox(img);
  if (analyze) {
    console.log(s.id, s.file, img.width + 'x' + img.height, 'cornerAlpha=' + corner, 'bbox=', JSON.stringify(b));
    console.log('   colors:', colorSummary(img));
    continue;
  }
  const small = downsampleCrop(img, b, 4);
  const sb = bbox(small);
  const buf = png.encode(small);
  out[s.id] = { front: s.front, w: small.width, h: small.height, bbox: { x: sb.x, y: sb.y, w: sb.w, h: sb.h }, bodyW: s.front === 'up' ? sb.rowW : sb.colH, src: 'data:image/png;base64,' + buf.toString('base64') };
  console.log(s.id, '→', small.width + 'x' + small.height, 'bbox', JSON.stringify(out[s.id].bbox), 'bodyW', out[s.id].bodyW, (buf.length / 1024).toFixed(0) + 'KB');
}
if (!analyze) {
  const js = '/* 자동 생성: node tools/build-sprites.js — assets/*.png를 여백 제거·2배 축소·base64로 내장 */\nwindow.PK_SPRITES = ' + JSON.stringify(out) + ';\n';
  fs.writeFileSync(path.join(ROOT, 'src', 'game', 'sprites-data.js'), js);
  console.log('written src/game/sprites-data.js', (js.length / 1024).toFixed(0) + 'KB');
}
