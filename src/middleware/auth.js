/**
 * Authentication middleware
 * Validates X-API-Key header for protected routes
 */
function authMiddleware(config) {
  // Return middleware that reads API key from runtime config (req.app.locals.config)
  return (req, res, next) => {
    const providedKey = req.header('X-API-Key');
    const runtimeConfig = (req && req.app && req.app.locals && req.app.locals.config) || config || {};

    if (!providedKey) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'X-API-Key header is required'
        }
      });
    }

    if (providedKey !== runtimeConfig.apiKey) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key'
        }
      });
    }

    next();
  };
}

module.exports = authMiddleware;
