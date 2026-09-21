/* index.html의 src/ 리소스(CSS·JS) 주소에 ?v=<현재 시각>을 붙여 갱신한다. 배포(푸시) 전에 실행.
 * 사용법: node tools/bump-version.js
 *
 * 왜 필요한가: GitHub Pages는 모든 파일에 10분 캐시(max-age=600)를 붙인다. 주소가 그대로면 배포 직후
 * 폰에서 새로고침했을 때 index.html만 새 버전이고 CSS/JS는 캐시된 옛 버전이 섞여 화면이 깨진다
 * (차 선택창 버튼이 화면 밖으로 밀려나고 아이콘이 비는 식). 주소가 바뀌면 브라우저는 새 파일을 받는다. */
'use strict';
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'index.html');
const d = new Date();
const p = n => String(n).padStart(2, '0');
const v = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes());

let count = 0;
const out = fs.readFileSync(file, 'utf8').replace(/((?:src|href)="src\/[^"?]+)(?:\?v=[^"]*)?"/g, (_, url) => {
  count++;
  return url + '?v=' + v + '"';
});
fs.writeFileSync(file, out);
console.log('index.html: 리소스 ' + count + '개 → ?v=' + v);
