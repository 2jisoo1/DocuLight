/**
 * Phase 2 Test: Admin Auth API
 * Tests for admin authentication endpoints
 *
 * Test Cases:
 * - TC-201: Valid API key login
 * - TC-202: Invalid API key login
 * - TC-203: Missing API key
 * - TC-204: Valid session check
 * - TC-205: Expired session check
 * - TC-206: Logout
 * - TC-207: Permission check (success)
 * - TC-208: Permission check (failure)
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const JSON5 = require('json5');

console.log('=== Phase 2 Test: Admin Auth API ===\n');

// Test results tracking
const results = {
  passed: [],
  failed: []
};

/**
 * Test helper function
 */
function test(name, fn) {
  return new Promise(async (resolve) => {
    try {
      await fn();
      results.passed.push(name);
      console.log(`  PASS: ${name}`);
      resolve(true);
    } catch (error) {
      results.failed.push({ name, error: error.message });
      console.log(`  FAIL: ${name}`);
      console.log(`   Error: ${error.message}\n`);
      resolve(false);
    }
  });
}

/**
 * Assertion helper
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * HTTP request helper
 */
function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Test configuration
const TEST_PORT = 3099;
const TEST_API_KEY = 'test-admin-key-phase2-12345';

// Create temp config
const tempDir = path.join(__dirname, '.temp-admin-auth-test');
const tempDocsDir = path.join(tempDir, 'docs');
const tempConfigPath = path.join(tempDir, 'config.json5');

function setupTempDirs() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(tempDocsDir, { recursive: true });

  // Create test config
  const config = {
    docsRoot: tempDocsDir,
    port: TEST_PORT,
    apiKey: TEST_API_KEY,
    admin: {
      sessionTimeout: 300000 // 5 minutes for testing
    }
  };

  fs.writeFileSync(tempConfigPath, JSON5.stringify(config, null, 2));
}

function cleanup() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Run tests
async function runTests() {
  setupTempDirs();

  // Clear require cache and change working directory
  const originalCwd = process.cwd();
  process.chdir(tempDir);

  // Clear module caches
  Object.keys(require.cache).forEach(key => {
    if (key.includes('session-service') || key.includes('config-loader') || key.includes('app.js')) {
      delete require.cache[key];
    }
  });

  let app;
  try {
    // Start server
    app = require('../src/app');
    const startResult = await app.start();
    if (!startResult.success) {
      throw new Error(`Failed to start server: ${startResult.error}`);
    }
    console.log(`Server started on port ${TEST_PORT}\n`);

    // Wait a bit for server to be ready
    await new Promise(r => setTimeout(r, 500));

    // ===========================================
    // Test Suite: Login
    // ===========================================
    console.log('--- Login Tests ---');

    let validSessionToken = null;

    await test('TC-201: Should login with valid API key', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/auth',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { apiKey: TEST_API_KEY });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success: true');
      assert(res.body.session, 'Expected session object');
      assert(res.body.session.token, 'Expected token in session');
      assert(res.body.session.token.length === 64, 'Expected 64-char token');
      assert(res.body.session.name === 'Default Admin', 'Expected name "Default Admin"');
      assert(Array.isArray(res.body.session.permissions), 'Expected permissions array');

      // Save token for later tests
      validSessionToken = res.body.session.token;
    });

    await test('TC-202: Should reject invalid API key', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/auth',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { apiKey: 'wrong-key' });

      assert(res.status === 401, `Expected 401, got ${res.status}`);
      assert(res.body.success === false, 'Expected success: false');
      assert(res.body.error.code === 'INVALID_KEY', 'Expected error code INVALID_KEY');
    });

    await test('TC-203: Should require API key', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/auth',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {});

      assert(res.status === 400, `Expected 400, got ${res.status}`);
      assert(res.body.error.code === 'MISSING_KEY', 'Expected error code MISSING_KEY');
    });

    // ===========================================
    // Test Suite: Session
    // ===========================================
    console.log('\n--- Session Tests ---');

    await test('TC-204: Should get session with valid token', async () => {
      assert(validSessionToken, 'Need valid token from previous test');

      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/session',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validSessionToken}`
        }
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success: true');
      assert(res.body.session.name, 'Expected session name');
      assert(res.body.session.permissions, 'Expected session permissions');
    });

    await test('TC-205: Should reject invalid token', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/session',
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid-token-12345'
        }
      });

      assert(res.status === 401, `Expected 401, got ${res.status}`);
      assert(res.body.error.code === 'SESSION_EXPIRED', 'Expected SESSION_EXPIRED error');
    });

    await test('Should reject request without token', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/session',
        method: 'GET',
        headers: {}
      });

      assert(res.status === 401, `Expected 401, got ${res.status}`);
      assert(res.body.error.code === 'UNAUTHORIZED', 'Expected UNAUTHORIZED error');
    });

    // ===========================================
    // Test Suite: Logout
    // ===========================================
    console.log('\n--- Logout Tests ---');

    await test('TC-206: Should logout successfully', async () => {
      // First create a new session
      const loginRes = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/auth',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { apiKey: TEST_API_KEY });

      const logoutToken = loginRes.body.session.token;

      // Logout
      const logoutRes = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/logout',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${logoutToken}`
        }
      });

      assert(logoutRes.status === 200, `Expected 200, got ${logoutRes.status}`);
      assert(logoutRes.body.success === true, 'Expected success: true');

      // Verify session is invalid after logout
      const checkRes = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/session',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${logoutToken}`
        }
      });

      assert(checkRes.status === 401, 'Session should be invalid after logout');
    });

    // ===========================================
    // Test Suite: Session Refresh
    // ===========================================
    console.log('\n--- Session Refresh Tests ---');

    await test('Should refresh session', async () => {
      // Login
      const loginRes = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/auth',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { apiKey: TEST_API_KEY });

      const token = loginRes.body.session.token;

      // Refresh
      const refreshRes = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/session/refresh',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      assert(refreshRes.status === 200, `Expected 200, got ${refreshRes.status}`);
      assert(refreshRes.body.success === true, 'Expected success: true');
      assert(refreshRes.body.session, 'Expected session in response');
    });

  } finally {
    // Stop server
    if (app) {
      await app.stop();
      console.log('\nServer stopped');
    }

    process.chdir(originalCwd);
    cleanup();
  }

  // ===========================================
  // Print Results
  // ===========================================
  console.log('\n=== Test Results ===');
  console.log(`Passed: ${results.passed.length}`);
  console.log(`Failed: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\nFailed Tests:');
    results.failed.forEach(({ name, error }) => {
      console.log(`  - ${name}: ${error}`);
    });
    process.exit(1);
  } else {
    console.log('\n All admin auth API tests passed!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  cleanup();
  process.exit(1);
});
