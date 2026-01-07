/**
 * Admin Authentication Controller
 * Phase 2: Admin Mode Implementation
 *
 * Handles admin login, logout, and session management
 */
const sessionService = require('../../services/session-service');
const { COOKIE_NAME } = require('../../middleware/admin-auth');

/**
 * Login handler
 * POST /api/admin/auth
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function login(req, res, next) {
  try {
    const { apiKey } = req.body;
    const config = req.app.locals.config;
    const logger = req.app.locals.logger;

    // Validate input
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_KEY',
          message: 'API key is required'
        }
      });
    }

    // Create session
    const session = sessionService.createSession(apiKey, config);
    if (!session) {
      if (logger) {
        logger.warn('Admin login failed: invalid API key');
      }
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_KEY',
          message: 'Invalid API key'
        }
      });
    }

    // Set cookie options
    const cookieOptions = {
      httpOnly: true,
      secure: config.ssl?.enabled || false,
      sameSite: 'strict',
      maxAge: config.admin?.sessionTimeout || 3600000,
      path: '/'
    };

    // Set cookie
    res.cookie(COOKIE_NAME, session.token, cookieOptions);

    if (logger) {
      logger.info(`Admin login successful: ${session.name}`);
    }

    // Return session info (include token for API clients)
    res.json({
      success: true,
      session: {
        token: session.token,
        name: session.name,
        permissions: session.permissions,
        expiresAt: session.expiresAt
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Logout handler
 * POST /api/admin/logout
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function logout(req, res, next) {
  try {
    const logger = req.app.locals.logger;

    // Get token from session (set by adminAuth middleware)
    if (req.adminSession) {
      sessionService.invalidateSession(req.adminSession.token);

      if (logger) {
        logger.info(`Admin logout: ${req.adminSession.name}`);
      }
    }

    // Clear cookie
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: req.app.locals.config?.ssl?.enabled || false,
      sameSite: 'strict',
      path: '/'
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current session info
 * GET /api/admin/session
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function getSession(req, res, next) {
  try {
    const session = req.adminSession;

    // Return session info (without token for security)
    res.json({
      success: true,
      session: {
        name: session.name,
        permissions: session.permissions,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        lastAccessedAt: session.lastAccessedAt
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Refresh session (extend expiry)
 * POST /api/admin/session/refresh
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function refreshSession(req, res, next) {
  try {
    const session = req.adminSession;
    const config = req.app.locals.config;

    // Update cookie with new expiry
    const cookieOptions = {
      httpOnly: true,
      secure: config.ssl?.enabled || false,
      sameSite: 'strict',
      maxAge: config.admin?.sessionTimeout || 3600000,
      path: '/'
    };

    res.cookie(COOKIE_NAME, session.token, cookieOptions);

    res.json({
      success: true,
      session: {
        name: session.name,
        permissions: session.permissions,
        expiresAt: session.expiresAt,
        lastAccessedAt: session.lastAccessedAt
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  logout,
  getSession,
  refreshSession
};
