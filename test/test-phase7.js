const app = require('../src/app');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

  let sessionCookie = '';
  function adminFetch(p, opts = {}) {
    return fetch(base + p, {
      ...opts,
      headers: { ...opts.headers, 'Cookie': sessionCookie, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Setup
    await fetch(base + '/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!', passwordConfirm: 'TestPass123!' })
    });

    const loginRes = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!' })
    });
    sessionCookie = loginRes.headers['set-cookie'][0].split(';')[0];

    // Enable signup
    await adminFetch('/api/admin/auth-settings', {
      method: 'PUT',
      body: JSON.stringify({ allowSignup: true })
    });

    console.log('\n--- Phase 7: Signup Workflow ---');

    // Test 1: Signup request
    const s1 = await fetch(base + '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'newuser@test.com',
        password: 'NewUser123!',
        passwordConfirm: 'NewUser123!',
        message: 'Please let me join!'
      })
    });
    check('Signup request succeeds (201)', s1.status === 201);

    // Test 2: Duplicate email signup
    const s2 = await fetch(base + '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'newuser@test.com',
        password: 'NewUser123!',
        passwordConfirm: 'NewUser123!',
        message: 'Please!'
      })
    });
    check('Duplicate email rejected (409)', s2.status === 409);

    // Test 3: Domain restriction
    await adminFetch('/api/admin/auth-settings', {
      method: 'PUT',
      body: JSON.stringify({ allowedEmailDomains: ['company.com'] })
    });

    const s3 = await fetch(base + '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@other.com',
        password: 'NewUser123!',
        passwordConfirm: 'NewUser123!',
        message: 'Please'
      })
    });
    check('Domain restriction works (400)', s3.status === 400 && s3.json().error.code === 'EMAIL_DOMAIN_NOT_ALLOWED');

    // Reset domain restriction
    await adminFetch('/api/admin/auth-settings', {
      method: 'PUT',
      body: JSON.stringify({ allowedEmailDomains: [] })
    });

    // Test 4: Signup disabled
    await adminFetch('/api/admin/auth-settings', {
      method: 'PUT',
      body: JSON.stringify({ allowSignup: false })
    });

    const s4 = await fetch(base + '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'other@test.com',
        password: 'Pass1234!',
        passwordConfirm: 'Pass1234!',
        message: 'Please'
      })
    });
    check('Signup disabled returns 403', s4.status === 403);

    // Re-enable
    await adminFetch('/api/admin/auth-settings', {
      method: 'PUT',
      body: JSON.stringify({ allowSignup: true })
    });

    // Test 5: Verify email token
    // Get registration from store directly
    const store = app.locals.stores.registrationStore;
    const reg = store.registrations.find(r => r.email === 'newuser@test.com');
    check('Registration exists in store', !!reg);

    // We need the raw token — since we can't get it from the store (only hash stored),
    // we'll create a new signup to capture the token
    // Actually, let's find the token hash and verify via API
    // But the raw token was only returned in the create result, which went to the email...
    // For testing, we'll access the store directly to get tokenHash, then forge verification
    // Actually, we can test by calling the API with the hash directly

    // Let's do a new signup and capture the token from the store
    const s5 = await fetch(base + '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'verifytest@test.com',
        password: 'VerifyPass1!',
        passwordConfirm: 'VerifyPass1!',
        message: 'Verify test'
      })
    });
    check('Second signup succeeds', s5.status === 201);

    // Find the registration and extract the verification token hash
    // Since we can't get raw token, let's modify the store to test verification
    // We'll use a workaround: create a known token manually
    const testToken = crypto.randomBytes(32).toString('hex');
    const testHash = crypto.createHash('sha256').update(testToken).digest('hex');
    const testReg = store.registrations.find(r => r.email === 'verifytest@test.com');
    testReg.verificationToken = testHash;

    const s6 = await fetch(base + '/api/auth/verify/' + testToken);
    const ds6 = s6.json();
    check('Email verification succeeds', ds6.success === true);

    // Verify status changed to pending_approval
    check('Status is pending_approval', testReg.status === 'pending_approval');

    // Test 6: Invalid token
    const s7 = await fetch(base + '/api/auth/verify/invalidtoken123');
    check('Invalid token returns 404', s7.status === 404);

    // Test 7: List pending registrations (admin)
    const s8 = await adminFetch('/api/admin/registrations');
    const ds8 = s8.json();
    check('List pending shows 1 registration', ds8.registrations.length === 1);

    // Test 8: Approve registration
    const editorGroup = app.locals.stores.groupStore.findAll().find(g => g.name === 'Editor');
    const pendingId = ds8.registrations[0].id;
    const s9 = await adminFetch('/api/admin/registrations/' + pendingId + '/approve', {
      method: 'POST',
      body: JSON.stringify({ groupId: editorGroup.id })
    });
    const ds9 = s9.json();
    check('Approve registration succeeds', ds9.success && ds9.user.email === 'verifytest@test.com');
    check('Approve returns userKey', typeof ds9.userKey === 'string' && ds9.userKey.length === 64);

    // Test 9: Approved user can login
    const s10 = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'verifytest@test.com', password: 'VerifyPass1!' })
    });
    check('Approved user can login', s10.status === 200);

    // Test 10: Test reject workflow
    const s11 = await fetch(base + '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'rejectme@test.com',
        password: 'RejectPass1!',
        passwordConfirm: 'RejectPass1!',
        message: 'Reject test'
      })
    });
    check('Reject test signup succeeds', s11.status === 201);

    // Verify it
    const rejectReg = store.registrations.find(r => r.email === 'rejectme@test.com');
    const rejectToken = crypto.randomBytes(32).toString('hex');
    const rejectHash = crypto.createHash('sha256').update(rejectToken).digest('hex');
    rejectReg.verificationToken = rejectHash;
    await fetch(base + '/api/auth/verify/' + rejectToken);

    // Reject it
    const s12 = await adminFetch('/api/admin/registrations/' + rejectReg.id + '/reject', {
      method: 'POST'
    });
    check('Reject registration succeeds', s12.status === 200);

    // Rejected user cannot login (no account created)
    const s13 = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rejectme@test.com', password: 'RejectPass1!' })
    });
    check('Rejected user cannot login', s13.status === 401);

    // Existing user email during signup
    const s14 = await fetch(base + '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@test.com',
        password: 'TestPass123!',
        passwordConfirm: 'TestPass123!',
        message: 'test'
      })
    });
    check('Existing user email rejected (409)', s14.status === 409 && s14.json().error.code === 'EMAIL_ALREADY_REGISTERED');

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed === 0) console.log('All Phase 7 tests passed!');
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
