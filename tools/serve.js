/* 의존성 없는 최소 정적 파일 서버 — 호스팅 전 같은 와이파이의 폰으로 테스트할 때 사용.
 * 사용법: node tools/serve.js  →  http://<PC-IP>:8080 를 폰에서 접속 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..'); // tools/ 밖의 프로젝트 루트(index.html이 있는 곳)를 서빙
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const full = path.join(ROOT, p);
  if (!full.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8080, '0.0.0.0', () => console.log('serving on 0.0.0.0:8080'));
