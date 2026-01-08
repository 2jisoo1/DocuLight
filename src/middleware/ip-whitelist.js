const { isIpAllowed } = require('../utils/ip-matcher.js');

function createIpWhitelist(/* config optional - ignored; middleware reads runtime config */) {
  return (req, res, next) => {
    try {
      const cfg = (req && req.app && req.app.locals && req.app.locals.config) || {};
      const allowPatterns = cfg.security && Array.isArray(cfg.security.allows) ? cfg.security.allows : [];

      // allows가 없으면 미들웨어 비활성화
      if (!allowPatterns || allowPatterns.length === 0) return next();

      const clientIp = req.ip || (req.connection && req.connection.remoteAddress);

      if (isIpAllowed(clientIp, allowPatterns)) {
        // 허용된 IP
        req.app && req.app.locals && req.app.locals.logger && req.app.locals.logger.debug && req.app.locals.logger.debug('IP allowed', { ip: clientIp });
        return next();
      }

      // 차단된 IP
      req.app && req.app.locals && req.app.locals.logger && req.app.locals.logger.warn && req.app.locals.logger.warn('IP blocked', {
        ip: clientIp,
        path: req.path,
        method: req.method
      });

      return res.status(403).json({
        error: {
          code: 'IP_BLOCKED',
          message: 'Access denied from your IP address'
        }
      });
    } catch (e) {
      // If anything unexpected happens, allow request to proceed but log
      req.app && req.app.locals && req.app.locals.logger && req.app.locals.logger.warn && req.app.locals.logger.warn('IP whitelist middleware error', e && e.message);
      return next();
    }
  };
}

module.exports = { createIpWhitelist };
