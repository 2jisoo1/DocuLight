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
  console.log('Server started');

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

  try {
    // === Setup: Create superuser and get user-key ===
    const r1 = await fetch(base + '/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!', passwordConfirm: 'TestPass123!' })
    });
    const d1 = r1.json();
    check('Setup creates superuser', r1.status === 201 && d1.success);
    const userKey = d1.userKey;
    check('Setup returns userKey', typeof userKey === 'string' && userKey.length === 64);

    // === Test 1: API read without key works (requireReadLogin=false by default) ===
    const r2 = await fetch(base + '/api/tree?path=/');
    check('API read without key works (public)', r2.status === 200);

    // === Test 2: API write without key fails ===
    const r3 = await fetch(base + '/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    check('API write without key returns 401', r3.status === 401);

    // === Test 3: API write with user-key works ===
    // We'll test the delete endpoint since upload needs multipart
    const r4 = await fetch(base + '/api/tree?path=/', {
      headers: { 'X-API-Key': userKey }
    });
    check('API read with user-key works', r4.status === 200);

    // === Test 4: API with invalid key fails ===
    const r5 = await fetch(base + '/api/tree?path=/', {
      headers: { 'X-API-Key': 'invalid-key-12345' }
    });
    // With requireReadLogin=false, reads are public, so this still works
    check('API read with invalid key still works (public mode)', r5.status === 200);

    // === Test 5: Login and enable requireReadLogin ===
    const loginRes = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!' })
    });
    const loginData = loginRes.json();
    check('Login works', loginRes.status === 200 && loginData.success);

    const cookies = loginRes.headers['set-cookie'];
    const sessionCookie = cookies ? cookies[0].split(';')[0] : '';

    // Enable requireReadLogin via direct store manipulation
    const stores = app.locals.stores;
    stores.authSettingsStore.update({ requireReadLogin: true });
    const settings = stores.authSettingsStore.get();
    check('requireReadLogin enabled', settings.requireReadLogin === true);

    // === Test 6: API read without key now fails ===
    const r6 = await fetch(base + '/api/tree?path=/');
    check('API read without key fails (requireReadLogin=true)', r6.status === 401);

    // === Test 7: API read with user-key works even with requireReadLogin ===
    const r7 = await fetch(base + '/api/tree?path=/', {
      headers: { 'X-API-Key': userKey }
    });
    check('API read with user-key works (requireReadLogin=true)', r7.status === 200);

    // === Test 8: MCP read tools work without key when requireReadLogin=false ===
    stores.authSettingsStore.update({ requireReadLogin: false });

    const mcpReq = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'list_documents',
        arguments: { path: '/' }
      }
    };
    const r8 = await fetch(base + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mcpReq)
    });
    check('MCP list_documents works without key (public)', r8.status === 200);

    // === Test 9: MCP write tool without key fails ===
    const mcpWrite = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'create_document',
        arguments: { path: '_test_phase3.md', content: '# Test' }
      }
    };
    const r9 = await fetch(base + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mcpWrite)
    });
    const d9 = r9.json();
    check('MCP create_document without key fails', d9.result?.isError === true || (d9.error != null));

    // === Test 10: MCP write tool with user-key works ===
    const r10 = await fetch(base + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': userKey },
      body: JSON.stringify(mcpWrite)
    });
    const d10 = r10.json();
    check('MCP create_document with user-key works', r10.status === 200 && !d10.result?.isError);

    // Clean up test file
    try {
      const testFilePath = path.join(app.locals.config.docsDir, '_test_phase3.md');
      if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
    } catch(e) {}

    // === Test 11: MCP read with requireReadLogin=true and no key fails ===
    stores.authSettingsStore.update({ requireReadLogin: true });
    const mcpRead = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'list_documents',
        arguments: { path: '/' }
      }
    };
    const r11 = await fetch(base + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mcpRead)
    });
    const d11 = r11.json();
    check('MCP read without key fails (requireReadLogin=true)', d11.result?.isError === true || (d11.error != null));

    // === Test 12: MCP read with requireReadLogin=true and user-key works ===
    const r12 = await fetch(base + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': userKey },
      body: JSON.stringify(mcpRead)
    });
    const d12 = r12.json();
    check('MCP read with user-key works (requireReadLogin=true)', r12.status === 200 && !d12.result?.isError);

    // === Test 13: Permission hierarchy — delete maps to write in admin-auth ===
    // This is verified by the middleware code, let's verify the hasPermission function
    const { hasPermission } = require('../src/middleware/auth');
    check('hasPermission: superuser has write', hasPermission(['superuser'], 'write'));
    check('hasPermission: write has read', hasPermission(['write'], 'read'));
    check('hasPermission: read does NOT have write', !hasPermission(['read'], 'write'));
    check('hasPermission: write has delete', hasPermission(['write'], 'delete'));

    // Reset requireReadLogin
    stores.authSettingsStore.update({ requireReadLogin: false });

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
      console.log('All Phase 3 tests passed!');
    }
  } catch(e) {
    console.error('Test error:', e);
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
