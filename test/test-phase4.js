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
    console.log('Server start failed:', result.error);
    process.exit(1);
  }

  const port = app.locals.config.port;
  const base = 'http://localhost:' + port;
  let passed = 0;
  let failed = 0;

  function check(name, condition) {
    if (condition) {
      console.log(`  PASS ${name}`);
      passed++;
    } else {
      console.log(`  FAIL ${name}`);
      failed++;
    }
  }

  function adminFetch(path, opts = {}) {
    return fetch(base + path, {
      ...opts,
      headers: { ...opts.headers, 'Cookie': sessionCookie, 'Content-Type': 'application/json' }
    });
  }

  let sessionCookie = '';

  try {
    // === Setup: Create superuser ===
    const r0 = await fetch(base + '/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!', passwordConfirm: 'TestPass123!' })
    });
    check('Setup OK', r0.status === 201);

    // Login
    const r1 = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!' })
    });
    const cookies = r1.headers['set-cookie'];
    sessionCookie = cookies ? cookies[0].split(';')[0] : '';
    check('Login OK', r1.status === 200);

    // =====================
    // GROUP MANAGEMENT TESTS
    // =====================

    // List default groups
    const r2 = await adminFetch('/api/admin/groups');
    const d2 = r2.json();
    check('List groups returns 3 defaults', d2.success && d2.groups.length === 3);

    // Create custom group
    const r3 = await adminFetch('/api/admin/groups', {
      method: 'POST',
      body: JSON.stringify({ name: 'Tester', permissions: ['read'] })
    });
    const d3 = r3.json();
    check('Create group succeeds', r3.status === 201 && d3.group.name === 'Tester');
    const testerGroupId = d3.group.id;

    // Create duplicate group name
    const r4 = await adminFetch('/api/admin/groups', {
      method: 'POST',
      body: JSON.stringify({ name: 'Tester', permissions: ['read'] })
    });
    check('Duplicate group name fails (409)', r4.status === 409);

    // Update custom group
    const r5 = await adminFetch('/api/admin/groups/' + testerGroupId, {
      method: 'PUT',
      body: JSON.stringify({ permissions: ['write', 'read'] })
    });
    check('Update group succeeds', r5.status === 200 && r5.json().group.permissions.includes('write'));

    // Try update system group permissions
    const sysGroups = d2.groups.filter(g => g.isSystem);
    const superuserGroup = sysGroups.find(g => g.permissions.includes('superuser'));
    const r6 = await adminFetch('/api/admin/groups/' + superuserGroup.id, {
      method: 'PUT',
      body: JSON.stringify({ permissions: ['read'] })
    });
    check('Cannot change system group permissions (403)', r6.status === 403);

    // Delete custom group (no members)
    const r7 = await adminFetch('/api/admin/groups/' + testerGroupId, { method: 'DELETE' });
    check('Delete empty group succeeds', r7.status === 200);

    // Delete system group
    const r8 = await adminFetch('/api/admin/groups/' + superuserGroup.id, { method: 'DELETE' });
    check('Cannot delete system group (403)', r8.status === 403);

    // Invalid permissions
    const r9 = await adminFetch('/api/admin/groups', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bad', permissions: ['admin'] })
    });
    check('Invalid permission rejected (400)', r9.status === 400);

    // =====================
    // USER MANAGEMENT TESTS
    // =====================

    // List users
    const ru1 = await adminFetch('/api/admin/users');
    const du1 = ru1.json();
    check('List users shows 1 user', du1.success && du1.users.length === 1);

    // Create user
    const editorGroup = d2.groups.find(g => g.name === 'Editor');
    const ru2 = await adminFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: 'user1@test.com', password: 'UserPass123!', groupId: editorGroup.id })
    });
    const du2 = ru2.json();
    check('Create user succeeds', ru2.status === 201 && du2.user.email === 'user1@test.com');
    check('Create user returns userKey', typeof du2.userKey === 'string' && du2.userKey.length === 64);
    const user1Id = du2.user.id;

    // Create duplicate email
    const ru3 = await adminFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: 'user1@test.com', password: 'AnotherPass1!', groupId: editorGroup.id })
    });
    check('Duplicate email fails (409)', ru3.status === 409);

    // Update user group
    const viewerGroup = d2.groups.find(g => g.name === 'Viewer');
    const ru4 = await adminFetch('/api/admin/users/' + user1Id, {
      method: 'PUT',
      body: JSON.stringify({ groupId: viewerGroup.id })
    });
    check('Update user group succeeds', ru4.status === 200);

    // Cannot delete self
    const adminUser = du1.users[0];
    const ru5 = await adminFetch('/api/admin/users/' + adminUser.id, { method: 'DELETE' });
    check('Cannot delete self (403)', ru5.status === 403);

    // Last superuser protection — demotion
    const ru6 = await adminFetch('/api/admin/users/' + adminUser.id, {
      method: 'PUT',
      body: JSON.stringify({ groupId: editorGroup.id })
    });
    check('Cannot demote last superuser (403)', ru6.status === 403);

    // Last superuser protection — disable
    const ru7 = await adminFetch('/api/admin/users/' + adminUser.id, {
      method: 'PUT',
      body: JSON.stringify({ status: 'disabled' })
    });
    check('Cannot disable last superuser (403)', ru7.status === 403);

    // Reset password
    const ru8 = await adminFetch('/api/admin/users/' + user1Id + '/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword: 'NewPass456!' })
    });
    check('Reset password succeeds', ru8.status === 200);

    // Verify new password works
    const ru9 = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user1@test.com', password: 'NewPass456!' })
    });
    check('Login with new password works', ru9.status === 200);

    // Unlock user
    const ru10 = await adminFetch('/api/admin/users/' + user1Id + '/unlock', {
      method: 'POST'
    });
    check('Unlock user succeeds', ru10.status === 200);

    // Disable user → session invalidated
    const ru11 = await adminFetch('/api/admin/users/' + user1Id, {
      method: 'PUT',
      body: JSON.stringify({ status: 'disabled' })
    });
    check('Disable user succeeds', ru11.status === 200);

    // Delete user
    await adminFetch('/api/admin/users/' + user1Id, {
      method: 'PUT',
      body: JSON.stringify({ status: 'active' })
    });
    const ru12 = await adminFetch('/api/admin/users/' + user1Id, { method: 'DELETE' });
    check('Delete user succeeds', ru12.status === 200);

    // Group with members cannot be deleted
    const ru13 = await adminFetch('/api/admin/groups', {
      method: 'POST',
      body: JSON.stringify({ name: 'TestGroup', permissions: ['read'] })
    });
    const testGroupId = ru13.json().group.id;
    await adminFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: 'user2@test.com', password: 'UserPass123!', groupId: testGroupId })
    });
    const ru14 = await adminFetch('/api/admin/groups/' + testGroupId, { method: 'DELETE' });
    check('Cannot delete group with members (409)', ru14.status === 409);

    // =====================
    // NON-SUPERUSER ACCESS TEST
    // =====================

    // Login as non-superuser (use user2 which is in read-only TestGroup)
    const ru15 = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user2@test.com', password: 'UserPass123!' })
    });
    const du15 = ru15.json();
    const user2Cookie = ru15.headers['set-cookie'] ? ru15.headers['set-cookie'][0].split(';')[0] : '';

    const ru16 = await fetch(base + '/api/admin/users', {
      headers: { 'Cookie': user2Cookie }
    });
    check('Non-superuser cannot access user management (403)', ru16.status === 403);

    // =====================
    // REGRESSION
    // =====================

    const rr1 = await fetch(base + '/api/tree?path=/');
    check('Regression: /api/tree still works', rr1.status === 200);

    const rr2 = await adminFetch('/api/admin/tree?path=/');
    check('Regression: /api/admin/tree still works', rr2.status === 200);

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
      console.log('All Phase 4 tests passed!');
    }
  } catch(e) {
    console.error('Test error:', e);
  }

  // Clean up
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
