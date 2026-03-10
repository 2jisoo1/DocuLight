/**
 * Authentication middleware (Step 17: User Management)
 * Validates user-key (X-API-Key or Authorization Bearer) via SHA-256 hash lookup.
 * Falls back to legacy apiKey comparison for backward compatibility.
 */
const crypto = require('crypto');

function authMiddleware() {
  return (req, res, next) => {
    const providedKey = req.header('X-API-Key') || extractBearer(req);
    const stores = req.app.locals.stores;
    const config = req.app.locals.config || {};

    if (!providedKey) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'X-API-Key header is required' }
      });
    }

    // New user-key authentication (Step 17)
    if (stores && stores.userStore && stores.userStore.getUserCount() > 0) {
      const hash = crypto.createHash('sha256').update(providedKey).digest('hex');
      const user = stores.userStore.findByUserKeyHash(hash);

      if (!user) {
        // Fallback: try legacy apiKey for backward compat
        if (config.apiKey === providedKey || config.apiKeys?.some(k => k.key === providedKey)) {
          return legacyAuth(req, res, next, providedKey, config);
        }
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Invalid API key' }
        });
      }

      if (user.status === 'disabled') {
        return res.status(401).json({
          error: { code: 'ACCOUNT_DISABLED', message: 'Account is disabled' }
        });
      }

      // Get permissions from group
      const group = stores.groupStore.findById(user.groupId);
      req.apiUser = {
        userId: user.id,
        email: user.email,
        groupId: user.groupId,
        permissions: group ? group.permissions : ['read']
      };

      return next();
    }

    // Legacy apiKey authentication (no user management set up yet)
    if (config.apiKey === providedKey || config.apiKeys?.some(k => k.key === providedKey)) {
      return legacyAuth(req, res, next, providedKey, config);
    }

    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' }
    });
  };
}

function legacyAuth(req, res, next, providedKey, config) {
  // Find matching key config for permissions
  const keyConfig = config.apiKeys?.find(k => k.key === providedKey);
  req.apiUser = {
    userId: null,
    email: null,
    groupId: null,
    permissions: keyConfig ? keyConfig.permissions : ['read', 'write', 'delete']
  };
  return next();
}

/**
 * Permission checking middleware for API routes.
 * Must be used after authMiddleware().
 */
function requireApiPermission(permission) {
  return (req, res, next) => {
    if (!req.apiUser) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' }
      });
    }

    if (hasPermission(req.apiUser.permissions, permission)) {
      return next();
    }

    return res.status(403).json({
      error: { code: 'INSUFFICIENT_PERMISSION', message: `Permission "${permission}" required` }
    });
  };
}

function hasPermission(permissions, required) {
  if (permissions.includes('superuser')) return true;
  if (required === 'write' && permissions.includes('write')) return true;
  if (required === 'read' && (permissions.includes('read') || permissions.includes('write'))) return true;
  if (required === 'delete' && permissions.includes('write')) return true;
  return false;
}

function extractBearer(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

module.exports = authMiddleware;
module.exports.requireApiPermission = requireApiPermission;
module.exports.hasPermission = hasPermission;
