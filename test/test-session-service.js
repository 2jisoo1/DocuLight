/**
 * Phase 1 Test: Session Service
 * Tests for session-service.js (Admin Mode)
 *
 * Test Cases:
 * - TC-104: Session creation with valid API key
 * - TC-105: Session creation with invalid API key
 * - TC-106: Session validation (valid)
 * - TC-107: Session validation (expired)
 * - TC-108: Session invalidation
 * - TC-109: Session cleanup
 */

const sessionService = require('../src/services/session-service');

console.log('=== Phase 1 Test: Session Service ===\n');

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

/**
 * Mock config for testing
 */
function createMockConfig(options = {}) {
  return {
    apiKeys: options.apiKeys || [
      { key: 'test-key-1', name: 'Test Admin', permissions: ['read', 'write', 'delete'] },
      { key: 'test-key-2', name: 'Test Editor', permissions: ['read', 'write'] },
      { key: 'test-key-3', name: 'Test Reader', permissions: ['read'] }
    ],
    admin: {
      sessionTimeout: options.sessionTimeout || 3600000,
      ...options.admin
    }
  };
}

// ==========================================
// Test Suite: createSession
// ==========================================

console.log('\n--- createSession Tests ---');

// Clear sessions before each test group
sessionService._clearAllSessions();

test('TC-104: Should create session for valid API key', () => {
  sessionService._clearAllSessions();
  const config = createMockConfig();

  const session = sessionService.createSession('test-key-1', config);

  assert(session !== null, 'Session should not be null');
  assert(typeof session.token === 'string', 'Token should be a string');
  assert(session.token.length === 64, 'Token should be 64 characters (32 bytes hex)');
  assert(session.name === 'Test Admin', 'Name should match API key config');
  assert(Array.isArray(session.permissions), 'Permissions should be an array');
  assert(session.permissions.includes('read'), 'Should have read permission');
  assert(session.permissions.includes('write'), 'Should have write permission');
  assert(session.permissions.includes('delete'), 'Should have delete permission');
  assert(typeof session.createdAt === 'number', 'createdAt should be a number');
  assert(typeof session.expiresAt === 'number', 'expiresAt should be a number');
  assert(session.expiresAt > session.createdAt, 'expiresAt should be after createdAt');
  assert(sessionService._getSessionCount() === 1, 'Session count should be 1');
});

test('TC-105: Should return null for invalid API key', () => {
  sessionService._clearAllSessions();
  const config = createMockConfig();

  const session = sessionService.createSession('invalid-key', config);

  assert(session === null, 'Session should be null for invalid key');
  assert(sessionService._getSessionCount() === 0, 'Session count should be 0');
});

test('Should create session with correct timeout', () => {
  sessionService._clearAllSessions();
  const config = createMockConfig({ sessionTimeout: 60000 }); // 1 minute

  const session = sessionService.createSession('test-key-1', config);

  assert(session !== null, 'Session should not be null');
  const expectedExpiry = session.createdAt + 60000;
  assert(Math.abs(session.expiresAt - expectedExpiry) < 100, 'Expiry should be 1 minute from creation');
});

test('Should use default permissions if not specified', () => {
  sessionService._clearAllSessions();
  const config = {
    apiKeys: [{ key: 'minimal-key', name: 'Minimal' }],
    admin: { sessionTimeout: 3600000 }
  };

  const session = sessionService.createSession('minimal-key', config);

  assert(session !== null, 'Session should not be null');
  assert(session.permissions.length === 1, 'Should have default read permission');
  assert(session.permissions.includes('read'), 'Should have read permission');
});

// ==========================================
// Test Suite: validateSession
// ==========================================

console.log('\n--- validateSession Tests ---');

test('TC-106: Should validate active session and update lastAccessedAt', () => {
  sessionService._clearAllSessions();
  const config = createMockConfig();

  const session = sessionService.createSession('test-key-1', config);
  const originalLastAccessed = session.lastAccessedAt;

  // Wait a tiny bit to ensure time difference
  const validated = sessionService.validateSession(session.token);

  assert(validated !== null, 'Validated session should not be null');
  assert(validated.token === session.token, 'Token should match');
  assert(validated.name === session.name, 'Name should match');
  assert(validated.lastAccessedAt >= originalLastAccessed, 'lastAccessedAt should be updated');
});

test('TC-107: Should return null for expired session', () => {
  sessionService._clearAllSessions();
  const config = createMockConfig({ sessionTimeout: 1 }); // 1ms timeout

  const session = sessionService.createSession('test-key-1', config);

  // Wait for session to expire
  const start = Date.now();
  while (Date.now() - start < 10) {
    // Busy wait
  }

  const validated = sessionService.validateSession(session.token);

  assert(validated === null, 'Expired session should return null');
  assert(sessionService._getSessionCount() === 0, 'Expired session should be removed');
});

test('Should return null for non-existent token', () => {
  sessionService._clearAllSessions();

  const validated = sessionService.validateSession('non-existent-token');

  assert(validated === null, 'Non-existent token should return null');
});

test('Should return null for null/undefined token', () => {
  assert(sessionService.validateSession(null) === null, 'Null token should return null');
  assert(sessionService.validateSession(undefined) === null, 'Undefined token should return null');
  assert(sessionService.validateSession('') === null, 'Empty token should return null');
});

// ==========================================
// Test Suite: invalidateSession
// ==========================================

console.log('\n--- invalidateSession Tests ---');

test('TC-108: Should invalidate existing session', () => {
  sessionService._clearAllSessions();
  const config = createMockConfig();

  const session = sessionService.createSession('test-key-1', config);
  assert(sessionService._getSessionCount() === 1, 'Should have 1 session');

  const result = sessionService.invalidateSession(session.token);

  assert(result === true, 'Should return true for successful invalidation');
  assert(sessionService._getSessionCount() === 0, 'Session count should be 0 after invalidation');
  assert(sessionService.validateSession(session.token) === null, 'Invalidated session should not validate');
});

test('Should return false for non-existent token', () => {
  sessionService._clearAllSessions();

  const result = sessionService.invalidateSession('non-existent-token');

  assert(result === false, 'Should return false for non-existent token');
});

// ==========================================
// Test Suite: cleanup
// ==========================================

console.log('\n--- cleanup Tests ---');

test('TC-109: Should clean up expired sessions', () => {
  sessionService._clearAllSessions();
  const shortConfig = createMockConfig({ sessionTimeout: 1 }); // 1ms timeout
  const longConfig = createMockConfig({ sessionTimeout: 3600000 }); // 1 hour

  // Create 3 sessions with short timeout (will expire)
  sessionService.createSession('test-key-1', shortConfig);
  sessionService.createSession('test-key-2', shortConfig);
  sessionService.createSession('test-key-3', shortConfig);

  // Create 2 sessions with long timeout (will not expire)
  sessionService.createSession('test-key-1', longConfig);
  sessionService.createSession('test-key-2', longConfig);

  assert(sessionService._getSessionCount() === 5, 'Should have 5 sessions');

  // Wait for short sessions to expire
  const start = Date.now();
  while (Date.now() - start < 10) {
    // Busy wait
  }

  const cleaned = sessionService.cleanup();

  assert(cleaned === 3, 'Should clean up 3 expired sessions');
  assert(sessionService._getSessionCount() === 2, 'Should have 2 sessions remaining');
});

// ==========================================
// Test Suite: hasPermission
// ==========================================

console.log('\n--- hasPermission Tests ---');

test('Should check permissions correctly', () => {
  sessionService._clearAllSessions();
  const config = createMockConfig();

  // Full admin
  const adminSession = sessionService.createSession('test-key-1', config);
  assert(sessionService.hasPermission(adminSession.token, 'read'), 'Admin should have read');
  assert(sessionService.hasPermission(adminSession.token, 'write'), 'Admin should have write');
  assert(sessionService.hasPermission(adminSession.token, 'delete'), 'Admin should have delete');

  // Editor (no delete)
  const editorSession = sessionService.createSession('test-key-2', config);
  assert(sessionService.hasPermission(editorSession.token, 'read'), 'Editor should have read');
  assert(sessionService.hasPermission(editorSession.token, 'write'), 'Editor should have write');
  assert(!sessionService.hasPermission(editorSession.token, 'delete'), 'Editor should NOT have delete');

  // Reader (read only)
  const readerSession = sessionService.createSession('test-key-3', config);
  assert(sessionService.hasPermission(readerSession.token, 'read'), 'Reader should have read');
  assert(!sessionService.hasPermission(readerSession.token, 'write'), 'Reader should NOT have write');
  assert(!sessionService.hasPermission(readerSession.token, 'delete'), 'Reader should NOT have delete');
});

test('Should return false for invalid token', () => {
  assert(!sessionService.hasPermission('invalid-token', 'read'), 'Invalid token should not have permissions');
});

// ==========================================
// Test Suite: getActiveSessions
// ==========================================

console.log('\n--- getActiveSessions Tests ---');

test('Should return list of active sessions', () => {
  sessionService._clearAllSessions();
  const config = createMockConfig();

  sessionService.createSession('test-key-1', config);
  sessionService.createSession('test-key-2', config);

  const activeSessions = sessionService.getActiveSessions();

  assert(Array.isArray(activeSessions), 'Should return an array');
  assert(activeSessions.length === 2, 'Should have 2 active sessions');
  assert(activeSessions[0].name !== undefined, 'Should include name');
  assert(activeSessions[0].tokenPrefix !== undefined, 'Should include token prefix');
  assert(activeSessions[0].tokenPrefix.endsWith('...'), 'Token should be truncated');
});

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
  console.log('\n All session service tests passed!');
  process.exit(0);
}
