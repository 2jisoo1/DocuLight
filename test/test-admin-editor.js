/**
 * Phase 6 Test: Admin Editor
 *
 * 테스트 항목:
 * - TC-601: 파일 내용 조회 API
 * - TC-602: 파일 저장 API
 * - TC-603: 동시 편집 충돌 감지
 * - TC-604: 빈 파일 생성 후 편집
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// Test configuration
const PORT = 3096;
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

// Session cookie storage
let sessionCookie = null;

// Generate unique names to avoid conflicts
const timestamp = Date.now();
const uniqueName = (base) => `${base}-${timestamp}`;

// ============================================================
// Test Cases
// ============================================================

const tests = [
  // Setup: Login
  test('Setup: Login', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/auth',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { apiKey: API_KEY });

    assertEqual(res.statusCode, 200, 'Login status');
    assert(res.body.success, 'Login should succeed');
    const cookies = res.headers['set-cookie'];
    assert(cookies && cookies.length > 0, 'Should set session cookie');
    sessionCookie = cookies[0].split(';')[0];
  }),

  // TC-601: Get file content
  test('TC-601: Should get file content with metadata', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/content?path=/test.md',
      method: 'GET',
      headers: {
        'Cookie': sessionCookie
      }
    });

    assertEqual(res.statusCode, 200, 'Get content status');
    assert(res.body.success, 'Should succeed');
    assert(typeof res.body.content === 'string', 'Should have content');
    assert(res.body.modifiedAt, 'Should have modifiedAt');
  }),

  // TC-602: Save file content
  test('TC-602: Should save file content', async () => {
    const fileName = uniqueName('editor-test') + '.md';
    const testContent = '# Test Content\n\nThis is a test.';
    const updatedContent = '# Updated Content\n\nThis was updated.';

    // Create file first
    const createRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + fileName, type: 'file' });

    assertEqual(createRes.statusCode, 201, 'Create status');

    // Get initial content
    const getRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/api/admin/content?path=/${fileName}`,
      method: 'GET',
      headers: { 'Cookie': sessionCookie }
    });

    assertEqual(getRes.statusCode, 200, 'Get content status');
    const originalModifiedAt = getRes.body.modifiedAt;

    // Save new content
    const saveRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/content',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + fileName, content: updatedContent, originalModifiedAt });

    assertEqual(saveRes.statusCode, 200, 'Save status');
    assert(saveRes.body.success, 'Save should succeed');
    assert(saveRes.body.modifiedAt, 'Should return new modifiedAt');

    // Verify saved content
    const verifyRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/api/admin/content?path=/${fileName}`,
      method: 'GET',
      headers: { 'Cookie': sessionCookie }
    });

    assertEqual(verifyRes.body.content, updatedContent, 'Content should be updated');

    // Cleanup
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/entry',
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { paths: ['/' + fileName] });
  }),

  // TC-603: Concurrent edit conflict detection
  test('TC-603: Should detect concurrent edit conflict', async () => {
    const fileName = uniqueName('conflict-test') + '.md';

    // Create file
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + fileName, type: 'file' });

    // Get initial modifiedAt
    const getRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/api/admin/content?path=/${fileName}`,
      method: 'GET',
      headers: { 'Cookie': sessionCookie }
    });

    const originalModifiedAt = getRes.body.modifiedAt;

    // First save (should succeed)
    const firstSaveRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/content',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + fileName, content: 'First edit', originalModifiedAt });

    assertEqual(firstSaveRes.statusCode, 200, 'First save status');

    // Wait a bit to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 100));

    // Second save with OLD modifiedAt (should conflict)
    const secondSaveRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/content',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + fileName, content: 'Second edit', originalModifiedAt });

    assertEqual(secondSaveRes.statusCode, 409, 'Should return 409 CONFLICT');
    assertEqual(secondSaveRes.body.error?.code, 'CONFLICT', 'Error code should be CONFLICT');

    // Cleanup
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/entry',
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { paths: ['/' + fileName] });
  }),

  // TC-604: Create and edit new file
  test('TC-604: Should create and edit new file', async () => {
    const fileName = uniqueName('new-file') + '.md';
    const content = '# New File\n\nCreated and edited in one flow.';

    // Create file
    const createRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + fileName, type: 'file' });

    assertEqual(createRes.statusCode, 201, 'Create status');

    // Save content (no originalModifiedAt for new file)
    const saveRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/content',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + fileName, content });

    assertEqual(saveRes.statusCode, 200, 'Save status');
    assert(saveRes.body.success, 'Save should succeed');

    // Verify
    const getRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/api/admin/content?path=/${fileName}`,
      method: 'GET',
      headers: { 'Cookie': sessionCookie }
    });

    assertEqual(getRes.body.content, content, 'Content should match');

    // Cleanup
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/entry',
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { paths: ['/' + fileName] });
  }),

  // TC-605: Save without originalModifiedAt (force overwrite)
  test('TC-605: Should allow force overwrite without modifiedAt', async () => {
    const fileName = uniqueName('force-save') + '.md';

    // Create file
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + fileName, type: 'file' });

    // Save without originalModifiedAt (force overwrite)
    const saveRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/content',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + fileName, content: 'Force saved content' });

    assertEqual(saveRes.statusCode, 200, 'Force save status');
    assert(saveRes.body.success, 'Force save should succeed');

    // Cleanup
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/entry',
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { paths: ['/' + fileName] });
  })
];

// ============================================================
// Main
// ============================================================

async function setupTestConfig() {
  const configPath = path.join(process.cwd(), 'config.json5');
  const testDocsPath = path.join(process.cwd(), 'test-source');

  // Ensure test-source directory exists
  if (!fs.existsSync(testDocsPath)) {
    fs.mkdirSync(testDocsPath, { recursive: true });
  }

  // Always ensure test.md exists for TC-601
  const testFilePath = path.join(testDocsPath, 'test.md');
  if (!fs.existsSync(testFilePath)) {
    fs.writeFileSync(testFilePath, '# Test Document\n\nThis is a test.');
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
  console.log(`\n${colors.cyan}=== Phase 6 Test: Admin Editor ===${colors.reset}\n`);

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
    console.log(`${colors.cyan}--- Setup ---${colors.reset}`);
    await tests[0](); // Setup: Login

    console.log(`\n${colors.cyan}--- Content API Tests ---${colors.reset}`);
    await tests[1](); // TC-601: Get content
    await tests[2](); // TC-602: Save content
    await tests[3](); // TC-603: Conflict detection
    await tests[4](); // TC-604: Create and edit
    await tests[5](); // TC-605: Force overwrite

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
    console.log(`\n${colors.green}✓ All editor tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}✗ Some tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

main();
