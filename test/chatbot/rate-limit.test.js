'use strict';

/**
 * TASK-P3-007 rate-limit.test.js
 * chatbot-rate-limiter 테스트:
 *   - 비로그인 익명 사용자: anonMax 초과 시 429 + 응답 body 검증
 *   - 인증 사용자: 별도 limiter, authedMax 미만에서 200
 *   - 인증 사용자: authedMax 초과 시 429
 */

const http = require('http');
const express = require('express');
const { createChatbotRateLimiter } = require('../../src/middleware/chatbot-rate-limiter');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

function makeRequest(port, headers = {}) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/test', method: 'GET', headers },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', () => resolve({ status: -1, body: '' }));
    req.end();
  });
}

async function run() {
  const app = express();

  // anonMax=2 so the 3rd anonymous request triggers 429; authedMax=2 to test authed limit too
  const limiter = createChatbotRateLimiter({ anonMax: 2, authedMax: 2, windowMs: 60000 });

  app.use((req, res, next) => {
    if (req.headers['x-test-user']) {
      req.apiUser = { userId: req.headers['x-test-user'] };
    }
    next();
  });

  app.get('/test', limiter, (req, res) => res.json({ ok: true }));

  const server = await new Promise((resolve) => {
    const s = http.createServer(app);
    s.listen(0, '127.0.0.1', () => resolve(s));
  });

  const { port } = server.address();

  try {
    // Anonymous user: 1st and 2nd requests allowed
    const r1 = await makeRequest(port);
    assert(r1.status === 200, `anon req 1: expected 200, got ${r1.status}`);

    const r2 = await makeRequest(port);
    assert(r2.status === 200, `anon req 2: expected 200, got ${r2.status}`);

    // 3rd anonymous request exceeds limit → 429
    const r3 = await makeRequest(port);
    assert(r3.status === 429, `anon req 3: expected 429, got ${r3.status}`);

    // Verify 429 response body shape
    let parsed;
    try { parsed = JSON.parse(r3.body); } catch (_) { parsed = null; }
    assert(parsed && parsed.error && parsed.error.code === 'TOO_MANY_REQUESTS',
      `anon 429 body: expected {error:{code:"TOO_MANY_REQUESTS"}}, got ${r3.body}`);

    if (r3.status === 429) {
      console.log('429 anonymous rate-limit OK');
    }

    // Authenticated user: separate limiter, first request allowed
    const r4 = await makeRequest(port, { 'x-test-user': 'user-1' });
    assert(r4.status === 200, `authed req 1: expected 200, got ${r4.status}`);

    const r5 = await makeRequest(port, { 'x-test-user': 'user-1' });
    assert(r5.status === 200, `authed req 2: expected 200, got ${r5.status}`);

    // Authenticated user also hits 429 after authedMax
    const r6 = await makeRequest(port, { 'x-test-user': 'user-1' });
    assert(r6.status === 429, `authed req 3: expected 429, got ${r6.status}`);

    if (r6.status === 429) {
      console.log('429 authenticated rate-limit OK');
    }
  } finally {
    server.close();
  }

  if (failed === 0) {
    console.log('PASS');
    process.exit(0);
  } else {
    console.error(`${failed} test(s) FAILED`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
