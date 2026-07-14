#!/usr/bin/env node
// Local dev proxy — serves the API tester page and forwards calls to the runner,
// bypassing browser CORS restrictions entirely.
//
// Usage:  node devtools/api-proxy.js <base-url> [port]
// e.g.:   node devtools/api-proxy.js https://api-dev.your-domain.example
//
// Then open http://localhost:3001 in your browser.
// No npm install needed — uses only Node.js built-ins.
'use strict';

const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const { URL } = require('url');

const UPSTREAM = process.argv[2];
const PORT     = parseInt(process.argv[3] ?? '3001', 10);

if (!UPSTREAM) {
  console.error('\nUsage: node devtools/api-proxy.js <base-url> [port]');
  console.error('  e.g. node devtools/api-proxy.js https://api-dev.your-domain.example\n');
  process.exit(1);
}

// Strip any trailing /api the user may have included — we always append it ourselves.
const BASE = UPSTREAM.replace(/\/api\/?$/, '').replace(/\/$/, '');

const HTML = fs.readFileSync(path.join(__dirname, 'api-tester.html'), 'utf8');

function forward(body, cb) {
  const u = new URL(BASE);
  const isHttps = u.protocol === 'https:';
  const opts = {
    hostname: u.hostname,
    port:     u.port || (isHttps ? 443 : 80),
    path:     '/api',
    method:   'POST',
    headers:  { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
  };
  const req = (isHttps ? https : http).request(opts, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => cb(null, data));
  });
  req.on('error', cb);
  req.write(body);
  req.end();
}

http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      forward(body, (err, data) => {
        if (err) {
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: err.message } }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(data);
      });
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');

}).listen(PORT, '127.0.0.1', () => {
  const line = '─'.repeat(50);
  console.log('\nBGaming API Proxy');
  console.log(line);
  console.log(`  Open in browser :  http://localhost:${PORT}`);
  console.log(`  Forwarding to   :  ${BASE}/api`);
  console.log(line + '\n');
});
