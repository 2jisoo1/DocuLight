/**
 * Admin Authentication Controller
 * Phase 2: Admin Mode Implementation
 *
 * Handles admin login, logout, and session management.
 * Note: Legacy apiKey login has been removed. Use user-based authentication.
 */
const sessionService = require('../../services/session-service');
const { COOKIE_NAME } = require('../../middleware/admin-auth');

/**
 * Login handler (deprecated - returns 410 Gone)
 * POST /api/admin/auth
 */
async function login(req, res, next) {
  try {
    const logger = req.app.locals.logger;

    if (logger) {
      logger.warn('Admin login attempted via deprecated apiKey endpoint');
    }
    return res.status(410).json({
      success: false,
      error: {
        code: 'DEPRECATED',
        message: 'API key login is no longer supported. Use user-based authentication (/api/auth/login).'
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Logout handler
 * POST /api/admin/logout
 */
async function logout(req, res, next) {
  try {
    const logger = req.app.locals.logger;

    if (req.adminSession) {
      sessionService.invalidateSession(req.adminSession.token);

      if (logger) {
        logger.info(`Admin logout: ${req.adminSession.name}`);
      }
    }

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
 */
async function getSession(req, res, next) {
  try {
    const session = req.adminSession;

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
 */
async function refreshSession(req, res, next) {
  try {
    const session = req.adminSession;
    const config = req.app.locals.config;

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
