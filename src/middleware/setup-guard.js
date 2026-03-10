/**
 * Setup Guard Middleware (Step 17)
 * Redirects all requests to /setup when no users exist.
 */

let setupComplete = false;

function createSetupGuard(userStore) {
  return (req, res, next) => {
    // Once setup is complete, never check again
    if (setupComplete) return next();

    // Check if users exist
    if (userStore.getUserCount() > 0) {
      setupComplete = true;
      return next();
    }

    // Allow setup-related paths through
    const allowedPaths = ['/setup', '/api/auth/setup'];
    const reqPath = req.path;

    if (allowedPaths.some(p => reqPath === p || reqPath.startsWith(p))) {
      return next();
    }

    // Allow static files
    if (reqPath.startsWith('/css/') || reqPath.startsWith('/js/') ||
        reqPath.startsWith('/images/') || reqPath.startsWith('/fonts/')) {
      return next();
    }

    // Redirect everything else to /setup
    const basePath = req.app.locals.config?.basePath || '';
    return res.redirect(302, basePath + '/setup');
  };
}

// Reset flag (for testing or server restart)
function resetSetupFlag() {
  setupComplete = false;
}

module.exports = { createSetupGuard, resetSetupFlag };
