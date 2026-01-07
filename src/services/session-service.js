/**
 * Session Service for Admin Mode
 * Manages session creation, validation, and cleanup
 * Phase 1: Admin Mode Implementation
 */
const crypto = require('crypto');

// In-memory session storage
const sessions = new Map();

// Cleanup timer reference
let cleanupTimer = null;

/**
 * Generate a secure random token
 * @returns {string} 64-character hex string
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Find API key configuration by key value
 * @param {string} apiKey - The API key to find
 * @param {Object} config - Application configuration
 * @returns {Object|null} API key configuration or null if not found
 */
function findApiKeyConfig(apiKey, config) {
  if (!config.apiKeys || !Array.isArray(config.apiKeys)) {
    return null;
  }
  return config.apiKeys.find(k => k.key === apiKey) || null;
}

/**
 * Create a new session for the given API key
 * @param {string} apiKey - The API key to authenticate
 * @param {Object} config - Application configuration
 * @returns {Object|null} Session object or null if API key is invalid
 */
function createSession(apiKey, config) {
  const keyConfig = findApiKeyConfig(apiKey, config);
  if (!keyConfig) {
    return null;
  }

  const now = Date.now();
  const timeout = config.admin?.sessionTimeout || 3600000; // Default 1 hour

  const session = {
    token: generateToken(),
    name: keyConfig.name || 'Unknown',
    permissions: keyConfig.permissions || ['read'],
    createdAt: now,
    expiresAt: now + timeout,
    lastAccessedAt: now
  };

  sessions.set(session.token, session);
  return session;
}

/**
 * Validate a session token and refresh its access time
 * @param {string} token - The session token to validate
 * @returns {Object|null} Session object or null if invalid/expired
 */
function validateSession(token) {
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  // Check if session has expired
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  // Update last accessed time
  session.lastAccessedAt = Date.now();
  return session;
}

/**
 * Get session without updating last accessed time
 * @param {string} token - The session token
 * @returns {Object|null} Session object or null if not found
 */
function getSession(token) {
  return sessions.get(token) || null;
}

/**
 * Invalidate (delete) a session
 * @param {string} token - The session token to invalidate
 * @returns {boolean} True if session was deleted, false if not found
 */
function invalidateSession(token) {
  return sessions.delete(token);
}

/**
 * Clean up expired sessions
 * @returns {number} Number of sessions cleaned up
 */
function cleanup() {
  const now = Date.now();
  let count = 0;

  for (const [token, session] of sessions) {
    if (session.expiresAt < now) {
      sessions.delete(token);
      count++;
    }
  }

  return count;
}

/**
 * Start the automatic cleanup timer
 * @param {number} intervalMs - Cleanup interval in milliseconds (default: 60000 = 1 minute)
 */
function startCleanupTimer(intervalMs = 60000) {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }
  cleanupTimer = setInterval(() => {
    const cleaned = cleanup();
    if (cleaned > 0) {
      console.log(`[SessionService] Cleaned up ${cleaned} expired session(s)`);
    }
  }, intervalMs);

  // Prevent timer from keeping Node.js alive
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Stop the automatic cleanup timer
 */
function stopCleanupTimer() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Check if a session has a specific permission
 * @param {string} token - The session token
 * @param {string} permission - The permission to check ('read', 'write', 'delete')
 * @returns {boolean} True if session has the permission
 */
function hasPermission(token, permission) {
  const session = validateSession(token);
  if (!session) {
    return false;
  }
  return session.permissions.includes(permission);
}

/**
 * Get all active sessions (for monitoring/debugging)
 * @returns {Array} Array of session info (without sensitive token data)
 */
function getActiveSessions() {
  const result = [];
  const now = Date.now();

  for (const [token, session] of sessions) {
    if (session.expiresAt >= now) {
      result.push({
        name: session.name,
        permissions: session.permissions,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastAccessedAt: session.lastAccessedAt,
        tokenPrefix: token.substring(0, 8) + '...'  // Show only prefix for identification
      });
    }
  }

  return result;
}

// Test/Debug utility functions (prefixed with underscore)

/**
 * Get the current session count (for testing)
 * @returns {number} Number of active sessions
 */
function _getSessionCount() {
  return sessions.size;
}

/**
 * Clear all sessions (for testing)
 */
function _clearAllSessions() {
  sessions.clear();
}

/**
 * Get a session by token without validation (for testing)
 * @param {string} token - The session token
 * @returns {Object|null} Raw session object
 */
function _getRawSession(token) {
  return sessions.get(token) || null;
}

module.exports = {
  // Core functions
  createSession,
  validateSession,
  getSession,
  invalidateSession,
  hasPermission,

  // Cleanup functions
  cleanup,
  startCleanupTimer,
  stopCleanupTimer,

  // Monitoring functions
  getActiveSessions,

  // Test utilities
  _getSessionCount,
  _clearAllSessions,
  _getRawSession
};
