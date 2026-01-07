/**
 * Phase 5 Test: Admin File Management
 *
 * 테스트 항목:
 * - TC-501: 파일 이름 변경 API
 * - TC-502: 파일 삭제 API
 * - TC-503: 파일 생성 API
 * - TC-504: 폴더 생성 API
 * - TC-505: 파일 이동 API
 * - TC-506: 권한 없는 요청 거부
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// Test configuration
const PORT = 3097;
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

  // TC-501: Rename file
  test('TC-501: Should rename file', async () => {
    const fileName = uniqueName('rename-test') + '.md';
    const newFileName = uniqueName('renamed-file') + '.md';

    // First create a file to rename
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

    // Rename the file
    const renameRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/rename',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { oldPath: '/' + fileName, newName: newFileName });

    assertEqual(renameRes.statusCode, 200, 'Rename status');
    assert(renameRes.body.success, 'Rename should succeed');
    assert(renameRes.body.newPath, 'Should return new path');

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
    }, { paths: ['/' + newFileName] });
  }),

  // TC-502: Delete file
  test('TC-502: Should delete file', async () => {
    const fileName = uniqueName('delete-test') + '.md';

    // First create a file to delete
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

    // Delete the file
    const deleteRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/entry',
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { paths: ['/' + fileName] });

    assertEqual(deleteRes.statusCode, 200, 'Delete status');
    assert(deleteRes.body.success, 'Delete should succeed');
    assert(deleteRes.body.deleted, 'Should return deleted paths');
  }),

  // TC-503: Create file
  test('TC-503: Should create file', async () => {
    const fileName = uniqueName('new-test-file') + '.md';

    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + fileName, type: 'file' });

    assertEqual(res.statusCode, 201, 'Create status');
    assert(res.body.success, 'Create should succeed');
    assert(res.body.path, 'Should return created path');

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

  // TC-504: Create folder
  test('TC-504: Should create folder', async () => {
    const folderName = uniqueName('new-test-folder');

    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + folderName, type: 'directory' });

    assertEqual(res.statusCode, 201, 'Create status');
    assert(res.body.success, 'Create should succeed');

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
    }, { paths: ['/' + folderName] });
  }),

  // TC-505: Move file
  test('TC-505: Should move file to folder', async () => {
    const folderName = uniqueName('move-target');
    const fileName = uniqueName('move-source') + '.md';

    // Create folder
    const folderRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + folderName, type: 'directory' });

    assertEqual(folderRes.statusCode, 201, 'Folder create status');

    // Create file
    const fileRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { path: '/' + fileName, type: 'file' });

    assertEqual(fileRes.statusCode, 201, 'File create status');

    // Move file to folder
    const moveRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/move',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { sourcePaths: ['/' + fileName], targetDirectory: '/' + folderName });

    assertEqual(moveRes.statusCode, 200, 'Move status');
    assert(moveRes.body.success, 'Move should succeed');
    assert(moveRes.body.moved, 'Should return moved items');

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
    }, { paths: ['/' + folderName] });
  }),

  // TC-506: Reject without permission
  test('TC-506: Should reject request without session', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/create',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { path: '/test.md', type: 'file' });

    assertEqual(res.statusCode, 401, 'Should be unauthorized');
  }),

  // TC-507: Invalid rename (empty name)
  test('TC-507: Should reject rename with empty name', async () => {
    const fileName = uniqueName('invalid-rename-test') + '.md';

    // Create file first
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

    // Try to rename with empty name
    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/rename',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { oldPath: '/' + fileName, newName: '' });

    assertEqual(res.statusCode, 400, 'Should reject empty name');

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

  // TC-508: Multiple delete
  test('TC-508: Should delete multiple files', async () => {
    const file1 = uniqueName('multi-delete-1') + '.md';
    const file2 = uniqueName('multi-delete-2') + '.md';

    // Create multiple files
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

    // Delete both files
    const res = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/admin/entry',
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    }, { paths: ['/' + file1, '/' + file2] });

    assertEqual(res.statusCode, 200, 'Delete status');
    assert(res.body.success, 'Delete should succeed');
    assertEqual(res.body.deleted.length, 2, 'Should delete 2 files');
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
  console.log(`\n${colors.cyan}=== Phase 5 Test: Admin File Management ===${colors.reset}\n`);

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

    console.log(`\n${colors.cyan}--- File Operations Tests ---${colors.reset}`);
    await tests[1](); // TC-501: Rename
    await tests[2](); // TC-502: Delete
    await tests[3](); // TC-503: Create file
    await tests[4](); // TC-504: Create folder
    await tests[5](); // TC-505: Move

    console.log(`\n${colors.cyan}--- Permission Tests ---${colors.reset}`);
    await tests[6](); // TC-506: No session

    console.log(`\n${colors.cyan}--- Validation Tests ---${colors.reset}`);
    await tests[7](); // TC-507: Invalid rename
    await tests[8](); // TC-508: Multiple delete

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
    console.log(`\n${colors.green}✓ All file management tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}✗ Some tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

main();
