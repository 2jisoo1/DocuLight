/**
 * Authentication middleware
 * Validates X-API-Key header for protected routes
 */
function authMiddleware(config) {
  return (req, res, next) => {
    const providedKey = req.header('X-API-Key');

    if (!providedKey) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'X-API-Key header is required'
        }
      });
    }

    if (providedKey !== config.apiKey) {
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
