/**
 * Phase 3 Test: Admin API
 * Tests for admin file operations endpoints
 *
 * Test Cases:
 * - TC-301: File tree retrieval (all file types)
 * - TC-302: File content retrieval
 * - TC-303: File save
 * - TC-304: Concurrent edit conflict detection
 * - TC-305: File creation
 * - TC-306: Directory creation
 * - TC-307: Entry rename
 * - TC-308: Entry move
 * - TC-309: Move into self prevention
 * - TC-310: Entry delete
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const JSON5 = require('json5');

console.log('=== Phase 3 Test: Admin API ===\n');

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
    // Prepare body and set Content-Length
    let bodyStr = null;
    if (body) {
      bodyStr = JSON.stringify(body);
      options.headers = options.headers || {};
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

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

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

// Test configuration
const TEST_PORT = 3098;
const TEST_API_KEY = 'test-admin-key-phase3-12345';

// Create temp config
const tempDir = path.join(__dirname, '.temp-admin-api-test');
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

  // Create test files and directories
  fs.mkdirSync(path.join(tempDocsDir, 'folder1'), { recursive: true });
  fs.mkdirSync(path.join(tempDocsDir, 'folder2'), { recursive: true });
  fs.writeFileSync(path.join(tempDocsDir, 'test.md'), '# Test\n\nContent here.');
  fs.writeFileSync(path.join(tempDocsDir, 'test.txt'), 'Plain text file');
  fs.writeFileSync(path.join(tempDocsDir, 'folder1', 'doc.md'), '# Document\n\nIn folder1.');
  fs.writeFileSync(path.join(tempDocsDir, 'folder1', 'image.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47])); // PNG header
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
    if (key.includes('session-service') || key.includes('config-loader') || key.includes('app.js') ||
        key.includes('file-service') || key.includes('tree-service') ||
        key.includes('admin-tree-controller') || key.includes('admin-file-controller') ||
        key.includes('admin-move-controller') || key.includes('admin-api')) {
      delete require.cache[key];
    }
  });

  let app;
  let sessionToken;

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

    // Login first to get session token
    console.log('--- Setup: Login ---');
    const loginRes = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/admin/auth',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { apiKey: TEST_API_KEY });

    if (loginRes.status !== 200) {
      throw new Error('Failed to login');
    }
    sessionToken = loginRes.body.session.token;
    console.log('  Login successful\n');

    // ===========================================
    // Test Suite: Tree API
    // ===========================================
    console.log('--- Tree API Tests ---');

    await test('TC-301: Should get tree with all file types', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/tree?path=/',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success: true');
      assert(res.body.tree, 'Expected tree object');
      assert(res.body.tree.root, 'Expected root in tree');

      // Check that all file types are included
      const files = res.body.tree.root.files;
      const fileNames = files.map(f => f.name);
      assert(fileNames.includes('test.md'), 'Expected test.md in tree');
      assert(fileNames.includes('test.txt'), 'Expected test.txt in tree');

      // Check metadata is included
      const testMd = files.find(f => f.name === 'test.md');
      assert(testMd.size !== undefined, 'Expected size in file metadata');
      assert(testMd.modifiedAt !== undefined, 'Expected modifiedAt in file metadata');
    });

    // ===========================================
    // Test Suite: Content API
    // ===========================================
    console.log('\n--- Content API Tests ---');

    await test('TC-302: Should get file content with metadata', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/content?path=/test.md',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success: true');
      assert(res.body.content.includes('# Test'), 'Expected content to include # Test');
      assert(res.body.modifiedAt, 'Expected modifiedAt');
      assert(res.body.size > 0, 'Expected size > 0');
    });

    await test('TC-303: Should save file content', async () => {
      const newContent = '# Updated\n\nNew content here.';
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/content',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        }
      }, {
        path: '/test.md',
        content: newContent
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success: true');
      assert(res.body.modifiedAt, 'Expected modifiedAt');

      // Verify content was saved
      const savedContent = fs.readFileSync(path.join(tempDocsDir, 'test.md'), 'utf-8');
      assert(savedContent === newContent, 'File content should match');
    });

    await test('TC-304: Should detect concurrent edit conflict', async () => {
      // Get current file info
      const getRes = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/content?path=/test.md',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });
      const originalModifiedAt = getRes.body.modifiedAt;

      // Simulate another user modifying the file
      await new Promise(r => setTimeout(r, 100));
      fs.writeFileSync(path.join(tempDocsDir, 'test.md'), '# Modified by another user');

      // Try to save with old modifiedAt
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/content',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        }
      }, {
        path: '/test.md',
        content: '# My changes',
        originalModifiedAt
      });

      assert(res.status === 409, `Expected 409, got ${res.status}`);
      assert(res.body.error.code === 'CONFLICT', 'Expected CONFLICT error');
      assert(res.body.error.serverModifiedAt, 'Expected serverModifiedAt in error');
    });

    // ===========================================
    // Test Suite: Create API
    // ===========================================
    console.log('\n--- Create API Tests ---');

    await test('TC-305: Should create file', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/create',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        }
      }, {
        path: '/new-file.md',
        type: 'file',
        content: '# New File\n\nCreated via API.'
      });

      assert(res.status === 201, `Expected 201, got ${res.status}`);
      assert(res.body.success === true, 'Expected success: true');
      assert(res.body.type === 'file', 'Expected type: file');

      // Verify file was created
      assert(fs.existsSync(path.join(tempDocsDir, 'new-file.md')), 'File should exist');
    });

    await test('TC-306: Should create directory', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/create',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        }
      }, {
        path: '/new-folder',
        type: 'directory'
      });

      assert(res.status === 201, `Expected 201, got ${res.status}`);
      assert(res.body.success === true, 'Expected success: true');
      assert(res.body.type === 'directory', 'Expected type: directory');

      // Verify directory was created
      assert(fs.existsSync(path.join(tempDocsDir, 'new-folder')), 'Directory should exist');
      assert(fs.statSync(path.join(tempDocsDir, 'new-folder')).isDirectory(), 'Should be a directory');
    });

    // ===========================================
    // Test Suite: Rename API
    // ===========================================
    console.log('\n--- Rename API Tests ---');

    await test('TC-307: Should rename entry', async () => {
      // Create a file to rename
      fs.writeFileSync(path.join(tempDocsDir, 'to-rename.md'), '# To Rename');

      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/rename',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        }
      }, {
        oldPath: '/to-rename.md',
        newName: 'renamed.md'
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success: true');
      assert(res.body.newPath === '/renamed.md', 'Expected newPath: /renamed.md');

      // Verify rename
      assert(!fs.existsSync(path.join(tempDocsDir, 'to-rename.md')), 'Old file should not exist');
      assert(fs.existsSync(path.join(tempDocsDir, 'renamed.md')), 'New file should exist');
    });

    // ===========================================
    // Test Suite: Move API
    // ===========================================
    console.log('\n--- Move API Tests ---');

    await test('TC-308: Should move entries', async () => {
      // Create a file to move
      fs.writeFileSync(path.join(tempDocsDir, 'to-move.md'), '# To Move');

      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/move',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        }
      }, {
        sourcePaths: ['/to-move.md'],
        targetDirectory: '/folder2'
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success: true');
      assert(res.body.moved.length === 1, 'Expected 1 moved entry');
      assert(res.body.moved[0].to === '/folder2/to-move.md', 'Expected correct destination');

      // Verify move
      assert(!fs.existsSync(path.join(tempDocsDir, 'to-move.md')), 'Source should not exist');
      assert(fs.existsSync(path.join(tempDocsDir, 'folder2', 'to-move.md')), 'Destination should exist');
    });

    await test('TC-309: Should prevent moving into self', async () => {
      // Create a nested folder
      fs.mkdirSync(path.join(tempDocsDir, 'folder1', 'sub'), { recursive: true });

      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/move',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        }
      }, {
        sourcePaths: ['/folder1'],
        targetDirectory: '/folder1/sub'
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.errors.length > 0, 'Expected errors');
      assert(res.body.errors[0].error.includes('Cannot move'), 'Expected "Cannot move" in error');
    });

    // ===========================================
    // Test Suite: Delete API
    // ===========================================
    console.log('\n--- Delete API Tests ---');

    await test('TC-310: Should delete entries', async () => {
      // Create files to delete
      fs.writeFileSync(path.join(tempDocsDir, 'to-delete1.md'), '# Delete 1');
      fs.writeFileSync(path.join(tempDocsDir, 'to-delete2.md'), '# Delete 2');

      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/entry',
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        }
      }, {
        paths: ['/to-delete1.md', '/to-delete2.md']
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success: true');
      assert(res.body.deleted.length === 2, 'Expected 2 deleted entries');

      // Verify delete
      assert(!fs.existsSync(path.join(tempDocsDir, 'to-delete1.md')), 'File 1 should be deleted');
      assert(!fs.existsSync(path.join(tempDocsDir, 'to-delete2.md')), 'File 2 should be deleted');
    });

    // ===========================================
    // Test Suite: Permission Tests
    // ===========================================
    console.log('\n--- Permission Tests ---');

    await test('Should reject request without token', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/tree',
        method: 'GET',
        headers: {}
      });

      assert(res.status === 401, `Expected 401, got ${res.status}`);
      assert(res.body.error.code === 'UNAUTHORIZED', 'Expected UNAUTHORIZED');
    });

    await test('Should reject request with invalid token', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/admin/tree',
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid-token-12345'
        }
      });

      assert(res.status === 401, `Expected 401, got ${res.status}`);
      assert(res.body.error.code === 'SESSION_EXPIRED', 'Expected SESSION_EXPIRED');
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
    console.log('\n All admin API tests passed!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  cleanup();
  process.exit(1);
});
