/**
 * Phase 1 Test: Config Loader - API Keys
 * Tests for apiKeys normalization and validation in config-loader.js
 *
 * Test Cases:
 * - TC-101: apiKeys normalization (backward compatibility)
 * - TC-102: apiKeys direct configuration
 * - TC-103: Invalid apiKeys validation
 */

const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');

console.log('=== Phase 1 Test: Config Loader - API Keys ===\n');

// Test results tracking
const results = {
  passed: [],
  failed: []
};

/**
 * Test helper function
 */
function test(name, fn) {
  try {
    fn();
    results.passed.push(name);
    console.log(`  PASS: ${name}`);
  } catch (error) {
    results.failed.push({ name, error: error.message });
    console.log(`  FAIL: ${name}`);
    console.log(`   Error: ${error.message}\n`);
  }
}

/**
 * Assertion helper
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Create temp directory for test configs
const tempDir = path.join(__dirname, '.temp-apikeys-test');
const tempDocsDir = path.join(tempDir, 'docs');

function setupTempDirs() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(tempDocsDir, { recursive: true });
}

function cleanup() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Write config and load it
 * @param {Object} config - Config object to test
 * @returns {Object} Loaded config
 */
function testConfigLoad(config) {
  // Clear require cache
  const configLoaderPath = require.resolve('../src/utils/config-loader');
  delete require.cache[configLoaderPath];

  // Write temp config
  const configPath = path.join(tempDir, 'config.json5');
  fs.writeFileSync(configPath, JSON5.stringify(config, null, 2));

  // Change working directory temporarily
  const originalCwd = process.cwd();
  process.chdir(tempDir);

  try {
    const { loadConfig } = require('../src/utils/config-loader');
    return loadConfig();
  } finally {
    process.chdir(originalCwd);
  }
}

/**
 * Test that config loading throws expected error
 */
function testConfigError(config, expectedError) {
  try {
    testConfigLoad(config);
    throw new Error('Expected error was not thrown');
  } catch (error) {
    if (!error.message.includes(expectedError)) {
      throw new Error(`Expected error containing "${expectedError}", got: "${error.message}"`);
    }
  }
}

// Setup
setupTempDirs();

// ==========================================
// Test Suite: API Keys Normalization
// ==========================================

console.log('\n--- API Keys Normalization Tests ---');

test('TC-101: Should normalize single apiKey to apiKeys array', () => {
  const config = testConfigLoad({
    docsRoot: tempDocsDir,
    apiKey: 'test-secure-key-12345'
  });

  assert(Array.isArray(config.apiKeys), 'apiKeys should be an array');
  assert(config.apiKeys.length === 1, 'apiKeys should have 1 entry');
  assert(config.apiKeys[0].key === 'test-secure-key-12345', 'Key should match original apiKey');
  assert(config.apiKeys[0].name === 'Default Admin', 'Name should be "Default Admin"');
  assert(config.apiKeys[0].permissions.length === 3, 'Should have 3 permissions');
  assert(config.apiKeys[0].permissions.includes('read'), 'Should have read permission');
  assert(config.apiKeys[0].permissions.includes('write'), 'Should have write permission');
  assert(config.apiKeys[0].permissions.includes('delete'), 'Should have delete permission');
});

test('TC-102: Should keep apiKeys array as-is when provided', () => {
  const config = testConfigLoad({
    docsRoot: tempDocsDir,
    apiKey: 'ignored-key',  // Should be ignored
    apiKeys: [
      { key: 'admin-key-123', name: 'Admin', permissions: ['read', 'write', 'delete'] },
      { key: 'reader-key-456', name: 'Reader', permissions: ['read'] }
    ]
  });

  assert(Array.isArray(config.apiKeys), 'apiKeys should be an array');
  assert(config.apiKeys.length === 2, 'apiKeys should have 2 entries');
  assert(config.apiKeys[0].key === 'admin-key-123', 'First key should be admin-key');
  assert(config.apiKeys[1].key === 'reader-key-456', 'Second key should be reader-key');
});

test('Should set default name if not provided', () => {
  const config = testConfigLoad({
    docsRoot: tempDocsDir,
    apiKeys: [
      { key: 'key-without-name' }
    ]
  });

  assert(config.apiKeys[0].name === 'API Key 1', 'Name should be auto-generated');
});

test('Should set default permissions if not provided', () => {
  const config = testConfigLoad({
    docsRoot: tempDocsDir,
    apiKeys: [
      { key: 'key-without-permissions', name: 'Test' }
    ]
  });

  assert(config.apiKeys[0].permissions.length === 3, 'Should have all 3 default permissions');
});

// ==========================================
// Test Suite: API Keys Validation
// ==========================================

console.log('\n--- API Keys Validation Tests ---');

test('TC-103a: Should reject empty key', () => {
  testConfigError({
    docsRoot: tempDocsDir,
    apiKeys: [
      { key: '', name: 'Empty Key' }
    ]
  }, 'must be a non-empty string');
});

test('TC-103b: Should reject whitespace-only key', () => {
  testConfigError({
    docsRoot: tempDocsDir,
    apiKeys: [
      { key: '   ', name: 'Whitespace Key' }
    ]
  }, 'must be a non-empty string');
});

test('TC-103c: Should reject default placeholder key', () => {
  testConfigError({
    docsRoot: tempDocsDir,
    apiKeys: [
      { key: 'CHANGE_THIS_TO_SECURE_KEY', name: 'Default' }
    ]
  }, 'must be changed from default value');
});

test('TC-103d: Should reject duplicate keys', () => {
  testConfigError({
    docsRoot: tempDocsDir,
    apiKeys: [
      { key: 'same-key', name: 'First' },
      { key: 'same-key', name: 'Second' }
    ]
  }, 'Duplicate API key');
});

test('TC-103e: Should reject invalid permissions', () => {
  testConfigError({
    docsRoot: tempDocsDir,
    apiKeys: [
      { key: 'valid-key', name: 'Test', permissions: ['read', 'invalid'] }
    ]
  }, 'Invalid permission');
});

test('TC-103f: Should reject empty apiKeys array', () => {
  testConfigError({
    docsRoot: tempDocsDir,
    apiKeys: []
  }, 'At least one API key required');
});

test('Should reject non-array permissions', () => {
  testConfigError({
    docsRoot: tempDocsDir,
    apiKeys: [
      { key: 'valid-key', name: 'Test', permissions: 'read' }
    ]
  }, 'permissions must be an array');
});

// ==========================================
// Test Suite: Admin Settings
// ==========================================

console.log('\n--- Admin Settings Tests ---');

test('Should set admin defaults', () => {
  const config = testConfigLoad({
    docsRoot: tempDocsDir,
    apiKey: 'test-key-12345'
  });

  assert(config.admin !== undefined, 'admin should be defined');
  assert(config.admin.sessionTimeout === 3600000, 'Default sessionTimeout should be 1 hour');
  assert(config.admin.allowUpload === true, 'Default allowUpload should be true');
  assert(config.admin.allowDelete === true, 'Default allowDelete should be true');
  assert(config.admin.maxEditableSize === 1048576, 'Default maxEditableSize should be 1MB');
  assert(Array.isArray(config.admin.editableExtensions), 'editableExtensions should be array');
});

test('Should allow admin settings override', () => {
  const config = testConfigLoad({
    docsRoot: tempDocsDir,
    apiKey: 'test-key-12345',
    admin: {
      sessionTimeout: 7200000,  // 2 hours
      allowUpload: false,
      allowDelete: false
    }
  });

  assert(config.admin.sessionTimeout === 7200000, 'sessionTimeout should be overridden');
  assert(config.admin.allowUpload === false, 'allowUpload should be overridden');
  assert(config.admin.allowDelete === false, 'allowDelete should be overridden');
});

test('Should enforce minimum sessionTimeout', () => {
  // Capture console.warn
  const originalWarn = console.warn;
  let warnCalled = false;
  console.warn = () => { warnCalled = true; };

  const config = testConfigLoad({
    docsRoot: tempDocsDir,
    apiKey: 'test-key-12345',
    admin: {
      sessionTimeout: 1000  // Too short
    }
  });

  console.warn = originalWarn;

  assert(warnCalled, 'Should warn about invalid sessionTimeout');
  assert(config.admin.sessionTimeout === 3600000, 'Should use default sessionTimeout');
});

// Cleanup
cleanup();

// ==========================================
// Print Results
// ==========================================

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
  console.log('\n All config API keys tests passed!');
  process.exit(0);
}
