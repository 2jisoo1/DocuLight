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
  if (!result.success) { console.log('Server start failed:', result.error); process.exit(1); }

  const port = app.locals.config.port;
  const base = 'http://localhost:' + port;
  let passed = 0, failed = 0;

  function check(name, condition) {
    if (condition) { console.log(`  PASS ${name}`); passed++; }
    else { console.log(`  FAIL ${name}`); failed++; }
  }

  let sessionCookie = '';

  function adminFetch(p, opts = {}) {
    return fetch(base + p, {
      ...opts,
      headers: { ...opts.headers, 'Cookie': sessionCookie, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Setup superuser
    await fetch(base + '/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!', passwordConfirm: 'TestPass123!' })
    });

    // Login
    const loginRes = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!' })
    });
    const cookies = loginRes.headers['set-cookie'];
    sessionCookie = cookies ? cookies[0].split(';')[0] : '';

    // =====================
    // PHASE 5: AUTH SETTINGS
    // =====================

    console.log('\n--- Phase 5: Auth Settings ---');

    // Get settings
    const s1 = await adminFetch('/api/admin/auth-settings');
    const ds1 = s1.json();
    check('Get auth settings', ds1.success && ds1.settings.requireReadLogin === false);

    // Update requireReadLogin
    const s2 = await adminFetch('/api/admin/auth-settings', {
      method: 'PUT',
      body: JSON.stringify({ requireReadLogin: true })
    });
    check('Update requireReadLogin=true', s2.status === 200);

    // Verify immediate effect
    const s3 = await fetch(base + '/api/tree?path=/');
    check('requireReadLogin=true blocks unauthenticated reads', s3.status === 401);

    // Revert
    await adminFetch('/api/admin/auth-settings', {
      method: 'PUT',
      body: JSON.stringify({ requireReadLogin: false })
    });

    // Invalid session timeout
    const s4 = await adminFetch('/api/admin/auth-settings', {
      method: 'PUT',
      body: JSON.stringify({ sessionTimeout: 0 })
    });
    check('Invalid sessionTimeout rejected (400)', s4.status === 400);

    // Valid session timeout
    const s5 = await adminFetch('/api/admin/auth-settings', {
      method: 'PUT',
      body: JSON.stringify({ sessionTimeout: 1800000 })
    });
    check('Update sessionTimeout to 30min', s5.status === 200);

    // Update allowedEmailDomains
    const s6 = await adminFetch('/api/admin/auth-settings', {
      method: 'PUT',
      body: JSON.stringify({ allowedEmailDomains: ['company.com', '', 'partner.co.kr'] })
    });
    const ds6 = s6.json();
    check('Update allowedEmailDomains (empty strings filtered)', ds6.settings.allowedEmailDomains.length === 2);

    // Reset
    await adminFetch('/api/admin/auth-settings', {
      method: 'PUT',
      body: JSON.stringify({ sessionTimeout: 3600000, allowedEmailDomains: [] })
    });

    // Non-superuser cannot access
    // Create an editor user
    const editorGroup = app.locals.stores.groupStore.findAll().find(g => g.name === 'Editor');
    await adminFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: 'editor@test.com', password: 'EditorPass1!', groupId: editorGroup.id })
    });

    const edLogin = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'editor@test.com', password: 'EditorPass1!' })
    });
    const edCookie = edLogin.headers['set-cookie'] ? edLogin.headers['set-cookie'][0].split(';')[0] : '';

    const s7 = await fetch(base + '/api/admin/auth-settings', {
      headers: { 'Cookie': edCookie }
    });
    check('Non-superuser cannot access auth settings (403)', s7.status === 403);

    // =====================
    // PHASE 6: MY PROFILE
    // =====================

    console.log('\n--- Phase 6: My Profile ---');

    // Get me
    const m1 = await adminFetch('/api/auth/me');
    const dm1 = m1.json();
    check('Get my profile', dm1.success && dm1.user.email === 'admin@test.com');
    check('Profile includes groupName', dm1.user.groupName === 'Superuser');

    // Editor can also see their profile
    const m2 = await fetch(base + '/api/auth/me', {
      headers: { 'Cookie': edCookie }
    });
    const dm2 = m2.json();
    check('Editor can view own profile', dm2.success && dm2.user.email === 'editor@test.com');

    // Change password
    const m3 = await adminFetch('/api/auth/me/password', {
      method: 'PUT',
      body: JSON.stringify({
        currentPassword: 'TestPass123!',
        newPassword: 'NewAdmin456!',
        newPasswordConfirm: 'NewAdmin456!'
      })
    });
    check('Change password succeeds', m3.status === 200);

    // Session still valid after password change
    const m4 = await adminFetch('/api/auth/me');
    check('Session persists after password change', m4.status === 200);

    // Verify new password works
    const m5 = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'NewAdmin456!' })
    });
    check('Login with new password works', m5.status === 200);

    // Wrong current password
    const m6 = await adminFetch('/api/auth/me/password', {
      method: 'PUT',
      body: JSON.stringify({
        currentPassword: 'WrongOld123!',
        newPassword: 'Another789!',
        newPasswordConfirm: 'Another789!'
      })
    });
    check('Wrong current password rejected (401)', m6.status === 401);

    // Weak new password
    const m7 = await adminFetch('/api/auth/me/password', {
      method: 'PUT',
      body: JSON.stringify({
        currentPassword: 'NewAdmin456!',
        newPassword: 'short',
        newPasswordConfirm: 'short'
      })
    });
    check('Weak password rejected (400)', m7.status === 400);

    // Regenerate key
    const m8 = await adminFetch('/api/auth/me/regenerate-key', { method: 'POST' });
    const dm8 = m8.json();
    check('Regenerate key succeeds', dm8.success && typeof dm8.userKey === 'string');
    check('New key is 64 hex chars', dm8.userKey.length === 64);

    // New key works for API
    const m9 = await fetch(base + '/api/tree?path=/', {
      headers: { 'X-API-Key': dm8.userKey }
    });
    check('New user-key works for API', m9.status === 200);

    // =====================
    // REGRESSION
    // =====================

    console.log('\n--- Regression ---');
    const rr1 = await fetch(base + '/api/tree?path=/');
    check('Public API still works', rr1.status === 200);

    const rr2 = await adminFetch('/api/admin/tree?path=/');
    check('Admin tree still works', rr2.status === 200);

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed === 0) console.log('All Phase 5+6 tests passed!');
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
