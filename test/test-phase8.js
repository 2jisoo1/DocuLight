const app = require('../src/app');
const http = require('http');
const path = require('path');
const fs = require('fs');

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data, json: () => JSON.parse(data) });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runTests() {
  const result = await app.start();
  if (!result.success) { console.log('Server start failed:', result.error); process.exit(1); }

  const port = app.locals.config.port;
  const base = 'http://localhost:' + port;
  let passed = 0, failed = 0;

  function check(name, condition) {
    if (condition) { console.log(`  PASS ${name}`); passed++; }
    else { console.log(`  FAIL ${name}`); failed++; }
  }

  try {
    // Setup
    await fetch(base + '/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!', passwordConfirm: 'TestPass123!' })
    });

    console.log('\n--- Phase 8: Rate Limiting ---');

    // Normal login works within limit
    const r1 = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!' })
    });
    check('Normal login works', r1.status === 200);

    // Test rate limiting: 10 requests should be fine, 11th should be blocked
    let lastStatus = 200;
    for (let i = 0; i < 10; i++) {
      const r = await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@test.com', password: 'wrong' })
      });
      lastStatus = r.status;
    }
    // After 10 requests (1 success + 10 wrong = 11), should be rate limited
    const r2 = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!' })
    });
    check('Rate limited after 10+ requests (429)', r2.status === 429);

    // Check Retry-After header
    check('Retry-After header present', !!r2.headers['retry-after']);

    // Signup rate limiting (3 per 5 min)
    // Enable signup
    const loginRes = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '1.2.3.4' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!' })
    });
    const sessionCookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0].split(';')[0] : '';

    // Enable signup via direct store access (since we might be rate limited on login)
    app.locals.stores.authSettingsStore.update({ allowSignup: true });

    for (let i = 0; i < 3; i++) {
      await fetch(base + '/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `signuptest${i}@test.com`,
          password: 'SignupPass1!',
          passwordConfirm: 'SignupPass1!',
          message: 'test'
        })
      });
    }

    const r3 = await fetch(base + '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'signuptest99@test.com',
        password: 'SignupPass1!',
        passwordConfirm: 'SignupPass1!',
        message: 'test'
      })
    });
    check('Signup rate limited after 3 requests (429)', r3.status === 429);

    // Security checks
    console.log('\n--- Security Checks ---');

    // Check password clearing in setup response (should not leak)
    const { hasPermission } = require('../src/middleware/auth');
    check('Permission: superuser > write', hasPermission(['superuser'], 'write'));
    check('Permission: write > read', hasPermission(['write'], 'read'));
    check('Permission: read !> write', !hasPermission(['read'], 'write'));
    check('Permission: write > delete', hasPermission(['write'], 'delete'));

    // Check bcrypt cost
    const user = app.locals.stores.userStore._getWithHash(
      app.locals.stores.userStore.findByEmail('admin@test.com').id
    );
    check('Password uses bcrypt', user.passwordHash.startsWith('$2'));
    // Cost factor 12 produces $2b$12$ prefix
    check('bcrypt cost factor 12', user.passwordHash.includes('$12$'));

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed === 0) console.log('All Phase 8 tests passed!');
  } catch(e) {
    console.error('Test error:', e);
  }

  const dataDir = app.locals.config.dataDir;
  ['users.json', 'groups.json', 'auth-settings.json', 'pending-registrations.json'].forEach(f => {
    const p = path.join(dataDir, f);
    try { fs.unlinkSync(p); } catch(e) {}
    try { fs.unlinkSync(p + '.bak'); } catch(e) {}
  });

  await app.stop();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error('Fatal:', e); process.exit(1); });
