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

  // Auto-extend session on each access (sliding expiration)
  const now = Date.now();
  session.lastAccessedAt = now;
  if (session.timeout) {
    session.expiresAt = now + session.timeout;
  }
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

/**
 * Create a new session for a user (Step 17: User Management)
 * @param {Object} user - User object { id, email, groupId }
 * @param {Array} permissions - User permissions array
 * @param {Object} authSettings - Auth settings { sessionTimeout }
 * @returns {Object} Session object
 */
function createSessionForUser(user, permissions, authSettings) {
  const now = Date.now();
  const timeout = (authSettings && authSettings.sessionTimeout) || 3600000;

  const session = {
    token: generateToken(),
    userId: user.id,
    email: user.email,
    groupId: user.groupId,
    name: user.email,
    permissions: permissions || ['read'],
    createdAt: now,
    expiresAt: now + timeout,
    timeout: timeout,
    lastAccessedAt: now
  };

  sessions.set(session.token, session);
  return session;
}

/**
 * Invalidate all sessions for a specific user
 * @param {string} userId - User ID
 * @returns {number} Number of sessions invalidated
 */
function invalidateByUserId(userId) {
  let count = 0;
  for (const [token, session] of sessions) {
    if (session.userId === userId) {
      sessions.delete(token);
      count++;
    }
  }
  return count;
}

/**
 * Refresh session expiration
 * @param {string} token - Session token
 * @param {Object} authSettings - Auth settings { sessionTimeout }
 * @returns {Object|null} Updated session or null
 */
function refreshSession(token, authSettings) {
  const session = validateSession(token);
  if (!session) return null;

  const timeout = (authSettings && authSettings.sessionTimeout) || 3600000;
  session.expiresAt = Date.now() + timeout;
  return session;
}

module.exports = {
  // Core functions
  validateSession,
  getSession,
  invalidateSession,
  hasPermission,

  // Step 17: User-based session functions
  createSessionForUser,
  invalidateByUserId,
  refreshSession,

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
