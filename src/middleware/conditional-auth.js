/**
 * Conditional Authentication Middleware (Step 17)
 * Applies auth based on requireReadLogin setting.
 * Accepts both session cookies (browser login) and X-API-Key headers.
 */
const authMiddleware = require('./auth');
const sessionService = require('../services/session-service');

function conditionalAuth() {
  return (req, res, next) => {
    const stores = req.app.locals.stores;

    // If no stores initialized, pass through (legacy mode)
    if (!stores || !stores.authSettingsStore) {
      return next();
    }

    const settings = stores.authSettingsStore.get();

    // If requireReadLogin is true, authentication is required for reads
    if (settings.requireReadLogin) {
      // Check session cookie first (browser login)
      const token = req.cookies && req.cookies.doclight_admin_session;
      if (token) {
        const session = sessionService.validateSession(token);
        if (session) {
          req.apiUser = {
            userId: session.userId,
            email: session.email,
            permissions: session.permissions || ['read']
          };
          return next();
        }
      }

      // Fall back to X-API-Key / Bearer token auth
      const auth = authMiddleware();
      return auth(req, res, next);
    }

    // requireReadLogin is false — reads are public
    return next();
  };
}

module.exports = conditionalAuth;
