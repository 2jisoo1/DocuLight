/**
 * Phase 4 Test: Admin Frontend Base
 *
 * 테스트 항목:
 * - TC-401: /admin 라우트 접근 및 admin.ejs 렌더링
 * - TC-402: /admin/* 라우트 접근 (SPA 지원)
 * - TC-403: 정적 파일 서빙 (admin.css, admin.js)
 * - TC-404: 인증 없이 Admin API 호출 시 401 응답
 * - TC-405: 인증 후 Admin API 호출 성공
 * - TC-406: 로그아웃 후 세션 무효화 확인
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// Test configuration
const PORT = 3099;
const API_KEY = 'test-api-key';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// HTTP request helper
function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });
    req.on('error', reject);
    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.setHeader('Content-Length', Buffer.byteLength(bodyStr));
      req.write(bodyStr);
    }
    req.end();
  });
}

// Test runner
function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`  ${colors.green}PASS${colors.reset}: ${name}`);
      results.passed++;
      results.tests.push({ name, passed: true });
    } catch (error) {
      console.log(`  ${colors.red}FAIL${colors.reset}: ${name}`);
      console.log(`       ${colors.yellow}${error.message}${colors.reset}`);
      results.failed++;
      results.tests.push({ name, passed: false, error: error.message });
    }
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertContains(str, substring, message) {
  if (!str.includes(substring)) {
    throw new Error(`${message}: expected to contain "${substring}"`);
  }
}

// ============================================================
// Test Cases
// ============================================================

const tests = [
  // TC-401: /admin 라우트 접근
  test('TC-401: Should render admin page on /admin', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/admin',
      method: 'GET'
    });

    assertEqual(res.statusCode, 200, 'Status code');
    assert(typeof res.body === 'string', 'Should return HTML');
    assertContains(res.body, 'admin.css', 'Should include admin.css');
    assertContains(res.body, 'admin.js', 'Should include admin.js');
    assertContains(res.body, 'auth-modal', 'Should include auth modal');
    assertContains(res.body, 'admin-app', 'Should include admin app');
  }),

  // TC-402: /admin/* 라우트 접근 (SPA 지원)
  test('TC-402: Should render admin page on /admin/some/path', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/admin/docs/test.md',
      method: 'GET'
    });

    assertEqual(res.statusCode, 200, 'Status code');
    assert(typeof res.body === 'string', 'Should return HTML');
    assertContains(res.body, 'admin-app', 'Should include admin app');
  }),

  // TC-403: 정적 파일 서빙
  test('TC-403: Should serve admin.css', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/css/admin.css',
      method: 'GET'
    });

    assertEqual(res.statusCode, 200, 'Status code');
    assert(typeof res.body === 'string', 'Should return CSS');
    assertContains(res.body, ':root', 'Should include CSS variables');
    assertContains(res.body, '#admin-app', 'Should include admin-app styles');
  }),

  test('TC-403b: Should serve admin.js', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/js/admin.js',
      method: 'GET'
    });

    assertEqual(res.statusCode, 200, 'Status code');
    assert(typeof res.body === 'string', 'Should return JavaScript');
    assertContains(res.body, 'AdminState', 'Should include AdminState');
    assertContains(res.body, 'AdminAPI', 'Should include AdminAPI');
    assertContains(res.body, 'AuthModule', 'Should include AuthModule');
    assertContains(res.body, 'TreeModule', 'Should include TreeModule');
  }),

  // TC-404: 인증 없이 Admin API 호출 시 401
  test('TC-404: Should return 401 for unauthenticated admin API request', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/tree',
      method: 'GET'
    });

    assertEqual(res.statusCode, 401, 'Status code');
    assertEqual(res.body.error?.code, 'UNAUTHORIZED', 'Error code');
  }),

  // TC-405: 인증 후 Admin API 호출 성공
  test('TC-405: Should succeed with authenticated admin API request', async () => {
    // 1. Login
    const loginRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/auth',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, { apiKey: API_KEY });

    assertEqual(loginRes.statusCode, 200, 'Login status');
    assert(loginRes.body.success, 'Login should succeed');

    // Extract session cookie
    const cookies = loginRes.headers['set-cookie'];
    assert(cookies && cookies.length > 0, 'Should set session cookie');
    const sessionCookie = cookies[0].split(';')[0];

    // 2. Get tree with session
    const treeRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/tree',
      method: 'GET',
      headers: {
        'Cookie': sessionCookie
      }
    });

    assertEqual(treeRes.statusCode, 200, 'Tree status');
    assert(treeRes.body.success, 'Tree request should succeed');
    assert(treeRes.body.tree, 'Should return tree');
  }),

  // TC-406: 로그아웃 후 세션 무효화
  test('TC-406: Should invalidate session after logout', async () => {
    // 1. Login
    const loginRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/auth',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, { apiKey: API_KEY });

    const cookies = loginRes.headers['set-cookie'];
    const sessionCookie = cookies[0].split(';')[0];

    // 2. Logout
    const logoutRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/logout',
      method: 'POST',
      headers: {
        'Cookie': sessionCookie
      }
    });

    assertEqual(logoutRes.statusCode, 200, 'Logout status');
    assert(logoutRes.body.success, 'Logout should succeed');

    // 3. Try to access tree with old session
    const treeRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/tree',
      method: 'GET',
      headers: {
        'Cookie': sessionCookie
      }
    });

    assertEqual(treeRes.statusCode, 401, 'Should be unauthorized after logout');
  }),

  // TC-407: 세션 확인 API
  test('TC-407: Should return session info for authenticated user', async () => {
    // 1. Login
    const loginRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/auth',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, { apiKey: API_KEY });

    const cookies = loginRes.headers['set-cookie'];
    const sessionCookie = cookies[0].split(';')[0];

    // 2. Check session
    const sessionRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/session',
      method: 'GET',
      headers: {
        'Cookie': sessionCookie
      }
    });

    assertEqual(sessionRes.statusCode, 200, 'Session status');
    assert(sessionRes.body.success, 'Session check should succeed');
    assert(sessionRes.body.session, 'Should return session info');
    assert(sessionRes.body.session.name, 'Should have session name');
  }),

  // TC-408: HTML에 config 정보 포함
  test('TC-408: Should include config in admin page', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/admin',
      method: 'GET'
    });

    assertEqual(res.statusCode, 200, 'Status code');
    // Check for title (from config or default)
    assertContains(res.body, 'Admin', 'Should include Admin in title');
  })
];

// ============================================================
// Main
// ============================================================

async function setupTestConfig() {
  // Create temporary test config
  const configPath = path.join(process.cwd(), 'config.json5');
  const testDocsPath = path.join(process.cwd(), 'test-source');

  // Ensure test-source directory exists
  if (!fs.existsSync(testDocsPath)) {
    fs.mkdirSync(testDocsPath, { recursive: true });
    fs.writeFileSync(path.join(testDocsPath, 'test.md'), '# Test Document\n\nThis is a test.');
  }

  // Backup existing config if present
  let originalConfig = null;
  if (fs.existsSync(configPath)) {
    originalConfig = fs.readFileSync(configPath, 'utf-8');
  }

  // Write test config
  const testConfig = `{
  docsRoot: "${testDocsPath.replace(/\\/g, '\\\\')}",
  port: ${PORT},
  apiKey: "${API_KEY}",
  logLevel: "error",
  excludes: [],
  admin: {
    enabled: true,
    sessionTimeout: 3600000
  },
  ui: {
    title: "DocLight Test",
    icon: "/images/icon.png"
  }
}`;

  fs.writeFileSync(configPath, testConfig);

  return { originalConfig, configPath };
}

async function restoreConfig(originalConfig, configPath) {
  if (originalConfig) {
    fs.writeFileSync(configPath, originalConfig);
  }
}

async function main() {
  console.log(`\n${colors.cyan}=== Phase 4 Test: Admin Frontend Base ===${colors.reset}\n`);

  const { originalConfig, configPath } = await setupTestConfig();

  // Start server
  const app = require('../src/app');

  try {
    const startResult = await app.start();
    if (!startResult.success) {
      console.error(`Failed to start server: ${startResult.error}`);
      process.exit(1);
    }

    console.log(`Server started on port ${PORT}\n`);

    // Run tests
    console.log(`${colors.cyan}--- Admin Route Tests ---${colors.reset}`);
    await tests[0](); // TC-401
    await tests[1](); // TC-402

    console.log(`\n${colors.cyan}--- Static File Tests ---${colors.reset}`);
    await tests[2](); // TC-403
    await tests[3](); // TC-403b

    console.log(`\n${colors.cyan}--- Authentication Tests ---${colors.reset}`);
    await tests[4](); // TC-404
    await tests[5](); // TC-405
    await tests[6](); // TC-406
    await tests[7](); // TC-407

    console.log(`\n${colors.cyan}--- Config Tests ---${colors.reset}`);
    await tests[8](); // TC-408

    // Stop server
    await app.stop();
    console.log('\nServer stopped');

  } catch (error) {
    console.error(`Test error: ${error.message}`);
    try { await app.stop(); } catch (e) { /* ignore */ }
  } finally {
    await restoreConfig(originalConfig, configPath);
  }

  // Print results
  console.log(`\n${colors.cyan}=== Test Results ===${colors.reset}`);
  console.log(`Passed: ${colors.green}${results.passed}${colors.reset}`);
  console.log(`Failed: ${colors.red}${results.failed}${colors.reset}`);

  if (results.failed === 0) {
    console.log(`\n${colors.green}✓ All admin frontend tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}✗ Some tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

main();
