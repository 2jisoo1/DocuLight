/**
 * Request logging middleware
 * Logs all incoming HTTP requests
 */
function requestLogger(logger) {
  return (req, res, next) => {
    const start = Date.now();

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        path: req.path,
        query: req.query,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip || req.connection.remoteAddress
      };

      // Log at appropriate level based on status code
      if (res.statusCode >= 500) {
        logger.error('Request completed with server error', logData);
      } else if (res.statusCode >= 400) {
        logger.warn('Request completed with client error', logData);
      } else {
        logger.info('Request completed', logData);
      }
    });

    next();
  };
}

module.exports = requestLogger;
