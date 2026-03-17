/**
 * Authentication middleware (Step 17: User Management)
 * Validates user-key (X-API-Key or Authorization Bearer) via SHA-256 hash lookup.
 */
const crypto = require('crypto');

function authMiddleware() {
  return (req, res, next) => {
    const providedKey = req.header('X-API-Key') || extractBearer(req);
    const stores = req.app.locals.stores;

    if (!providedKey) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'X-API-Key header is required' }
      });
    }

    if (!stores || !stores.userStore || stores.userStore.getUserCount() === 0) {
      return res.status(401).json({
        error: { code: 'NO_USERS', message: 'No users configured. Please complete setup first.' }
      });
    }

    const hash = crypto.createHash('sha256').update(providedKey).digest('hex');
    const user = stores.userStore.findByUserKeyHash(hash);

    if (!user) {
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
  };
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
