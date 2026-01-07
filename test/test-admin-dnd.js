/**
 * Phase 7 Test: Drag and Drop
 *
 * 테스트 항목:
 * - TC-701: 파일 드래그 이동 (API 기반)
 * - TC-702: 폴더 드래그 이동 (API 기반)
 * - TC-703: 자기 하위로 이동 방지 검증
 * - TC-704: 다중 파일 이동 (API 기반)
 * - TC-705: 루트로 이동 (API 기반)
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// Test configuration
const PORT = 3095;
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

  // TC-701: Move file by drag (API simulation)
  test('TC-701: Should move file to different folder', async () => {
    const sourceFile = uniqueName('dnd-source-file') + '.md';
    const targetFolder = uniqueName('dnd-target-folder');

    // Create source file
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + sourceFile, type: 'file' });

    // Create target folder
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + targetFolder, type: 'directory' });

    // Move file to folder (simulates drag and drop)
    const moveRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/move',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { sourcePaths: ['/' + sourceFile], targetDirectory: '/' + targetFolder });

    assertEqual(moveRes.statusCode, 200, 'Move status');
    assert(moveRes.body.success, 'Move should succeed');
    assert(moveRes.body.moved?.length === 1, 'Should have moved 1 item');
    assertEqual(moveRes.body.moved[0].to, '/' + targetFolder + '/' + sourceFile, 'New path should be correct');

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
    }, { paths: ['/' + targetFolder] });
  }),

  // TC-702: Move folder to different folder
  test('TC-702: Should move folder to different folder', async () => {
    const sourceFolder = uniqueName('dnd-source-folder');
    const targetFolder = uniqueName('dnd-target-folder2');

    // Create source folder
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + sourceFolder, type: 'directory' });

    // Create target folder
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + targetFolder, type: 'directory' });

    // Move folder
    const moveRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/move',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { sourcePaths: ['/' + sourceFolder], targetDirectory: '/' + targetFolder });

    assertEqual(moveRes.statusCode, 200, 'Move status');
    assert(moveRes.body.success, 'Move should succeed');
    assertEqual(moveRes.body.moved[0].to, '/' + targetFolder + '/' + sourceFolder, 'New path should be correct');

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
    }, { paths: ['/' + targetFolder] });
  }),

  // TC-703: Prevent moving into self
  test('TC-703: Should prevent moving folder into itself', async () => {
    const folder = uniqueName('self-move-folder');
    const subFolder = folder + '/sub';

    // Create folder with subfolder
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + folder, type: 'directory' });

    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + subFolder, type: 'directory' });

    // Try to move folder into its own subfolder (should fail)
    const moveRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/move',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { sourcePaths: ['/' + folder], targetDirectory: '/' + subFolder });

    // Should have error for invalid move
    assert(moveRes.body.errors?.length > 0 || !moveRes.body.success || moveRes.body.moved?.length === 0,
      'Should reject moving folder into itself');

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
    }, { paths: ['/' + folder] });
  }),

  // TC-704: Move multiple files
  test('TC-704: Should move multiple files at once', async () => {
    const file1 = uniqueName('multi-file1') + '.md';
    const file2 = uniqueName('multi-file2') + '.md';
    const targetFolder = uniqueName('multi-target');

    // Create files and folder
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + file1, type: 'file' });

    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + file2, type: 'file' });

    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + targetFolder, type: 'directory' });

    // Move both files
    const moveRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/move',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { sourcePaths: ['/' + file1, '/' + file2], targetDirectory: '/' + targetFolder });

    assertEqual(moveRes.statusCode, 200, 'Move status');
    assert(moveRes.body.success, 'Move should succeed');
    assertEqual(moveRes.body.moved?.length, 2, 'Should have moved 2 items');

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
    }, { paths: ['/' + targetFolder] });
  }),

  // TC-705: Move to root
  test('TC-705: Should move file to root', async () => {
    const folder = uniqueName('root-move-folder');
    const file = 'file.md';

    // Create folder with file inside
    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + folder, type: 'directory' });

    await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + folder + '/' + file, type: 'file' });

    // Move file to root
    const moveRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/move',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { sourcePaths: ['/' + folder + '/' + file], targetDirectory: '/' });

    assertEqual(moveRes.statusCode, 200, 'Move status');
    assert(moveRes.body.success, 'Move should succeed');

    // Verify file is now at root
    const movedPath = '/' + file;
    const getRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/api/admin/content?path=${encodeURIComponent(movedPath)}`,
      method: 'GET',
      headers: { 'Cookie': sessionCookie }
    });

    assertEqual(getRes.statusCode, 200, 'File should exist at root');

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
    }, { paths: ['/' + folder, movedPath] });
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
  console.log(`\n${colors.cyan}=== Phase 7 Test: Drag and Drop ===${colors.reset}\n`);

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

    console.log(`\n${colors.cyan}--- Drag and Drop API Tests ---${colors.reset}`);
    await tests[1](); // TC-701: Move file
    await tests[2](); // TC-702: Move folder
    await tests[3](); // TC-703: Prevent self-move
    await tests[4](); // TC-704: Multi-file move
    await tests[5](); // TC-705: Move to root

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
    console.log(`\n${colors.green}✓ All drag and drop tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}✗ Some tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

main();
