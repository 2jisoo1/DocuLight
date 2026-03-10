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
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          json: () => JSON.parse(data)
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runTests() {
  const result = await app.start();
  if (!result.success) {
    console.log('❌ Server start failed:', result.error);
    process.exit(1);
  }
  console.log('✅ Server started');

  const port = app.locals.config.port;
  const base = 'http://localhost:' + port;
  let passed = 0;
  let failed = 0;

  function check(name, condition) {
    if (condition) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ ${name}`);
      failed++;
    }
  }

  try {
    // Test 1: Setup guard redirect
    const r1 = await fetch(base + '/admin');
    check('Setup guard redirects to /setup', r1.status === 302 && r1.headers.location === '/setup');

    // Test 2: Setup page accessible
    const r2 = await fetch(base + '/setup');
    check('Setup page renders', r2.status === 200 && r2.body.includes('setup-form'));

    // Test 3: Setup API — create superuser
    const r3 = await fetch(base + '/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!', passwordConfirm: 'TestPass123!' })
    });
    const d3 = r3.json();
    check('Setup creates superuser (201)', r3.status === 201 && d3.success === true);

    // Test 4: Setup API — should fail on second call
    const r4 = await fetch(base + '/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin2@test.com', password: 'TestPass123!', passwordConfirm: 'TestPass123!' })
    });
    check('Setup rejects second call (403)', r4.status === 403);

    // Test 5: Login with wrong password
    const r5 = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'wrong' })
    });
    check('Wrong password returns 401', r5.status === 401 && r5.json().error.code === 'INVALID_CREDENTIALS');

    // Test 6: Login with correct password
    const r6 = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!' })
    });
    const d6 = r6.json();
    check('Correct login returns 200 + session', r6.status === 200 && d6.success && d6.session.permissions.includes('superuser'));

    // Extract session cookie
    const cookies = r6.headers['set-cookie'];
    const sessionCookie = cookies ? cookies[0].split(';')[0] : '';
    check('Session cookie is set', sessionCookie.includes('doclight_admin_session'));

    // Test 7: Session check
    const r7 = await fetch(base + '/api/auth/session', {
      headers: { 'Cookie': sessionCookie }
    });
    const d7 = r7.json();
    check('Session check returns user info', r7.status === 200 && d7.session.email === 'admin@test.com');

    // Test 8: Login page after setup
    const r8 = await fetch(base + '/login');
    check('Login page accessible after setup', r8.status === 200 && r8.body.includes('login-form'));

    // Test 9: Session refresh
    const r9 = await fetch(base + '/api/auth/session/refresh', {
      method: 'POST',
      headers: { 'Cookie': sessionCookie }
    });
    check('Session refresh works', r9.status === 200 && r9.json().success);

    // Test 10: Logout
    const r10 = await fetch(base + '/api/auth/logout', {
      method: 'POST',
      headers: { 'Cookie': sessionCookie }
    });
    check('Logout returns success', r10.status === 200);

    // Test 11: Session invalid after logout
    const r11 = await fetch(base + '/api/auth/session', {
      headers: { 'Cookie': sessionCookie }
    });
    check('Session invalid after logout', r11.status === 401);

    // Test 12: Non-existent email login
    const r12 = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@test.com', password: 'TestPass123!' })
    });
    check('Non-existent email returns 401', r12.status === 401);

    // Test 13: Existing API still works (regression)
    const r13 = await fetch(base + '/api/tree?path=/');
    check('Existing /api/tree still works', r13.status === 200);

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
      console.log('✅ All Phase 2 tests passed!');
    }
  } catch(e) {
    console.error('❌ Test error:', e);
  }

  // Clean up test data
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
