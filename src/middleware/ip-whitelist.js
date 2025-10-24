const { isIpAllowed } = require('../utils/ip-matcher.js');

function createIpWhitelist(config) {
  const allowPatterns = config.security?.allows;

  // allows가 없으면 미들웨어 비활성화
  if (!allowPatterns || allowPatterns.length === 0) {
    return (req, res, next) => next();
  }

  return (req, res, next) => {
    const clientIp = req.ip || req.connection.remoteAddress;

    if (isIpAllowed(clientIp, allowPatterns)) {
      // 허용된 IP
      req.app.locals.logger.debug('IP allowed', { ip: clientIp });
      next();
    } else {
      // 차단된 IP
      req.app.locals.logger.warn('IP blocked', {
        ip: clientIp,
        path: req.path,
        method: req.method
      });

      res.status(403).json({
        error: {
          code: 'IP_BLOCKED',
          message: 'Access denied from your IP address'
        }
      });
    }
  };
}

module.exports = { createIpWhitelist };
