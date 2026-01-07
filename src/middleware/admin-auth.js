/**
 * Admin Authentication Middleware
 * Phase 2: Admin Mode Implementation
 *
 * Provides session-based authentication for admin routes
 */
const sessionService = require('../services/session-service');

// Cookie name for admin session
const COOKIE_NAME = 'doclight_admin_session';

/**
 * Extract session token from request
 * Priority: Cookie > Authorization header
 * @param {Object} req - Express request object
 * @returns {string|null} Session token or null
 */
function extractToken(req) {
  // Try cookie first
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }

  // Try Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Admin authentication middleware
 * Validates session token and attaches session to request
 * @returns {Function} Express middleware function
 */
function adminAuth() {
  return (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No session token provided'
        }
      });
    }

    const session = sessionService.validateSession(token);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session expired or invalid'
        }
      });
    }

    // Attach session to request for downstream handlers
    req.adminSession = session;
    next();
  };
}

/**
 * Permission checking middleware
 * Must be used after adminAuth()
 * @param {string} permission - Required permission ('read', 'write', 'delete')
 * @returns {Function} Express middleware function
 */
function requirePermission(permission) {
  return (req, res, next) => {
    // Check if adminAuth was called first
    if (!req.adminSession) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated'
        }
      });
    }

    // Check if session has required permission
    if (!req.adminSession.permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Permission "${permission}" required`
        }
      });
    }

    next();
  };
}

/**
 * Optional authentication middleware
 * Attaches session if valid token exists, but doesn't fail if not
 * Useful for routes that work with or without authentication
 * @returns {Function} Express middleware function
 */
function optionalAuth() {
  return (req, res, next) => {
    const token = extractToken(req);

    if (token) {
      const session = sessionService.validateSession(token);
      if (session) {
        req.adminSession = session;
      }
    }

    next();
  };
}

module.exports = {
  adminAuth,
  requirePermission,
  optionalAuth,
  extractToken,
  COOKIE_NAME
};
