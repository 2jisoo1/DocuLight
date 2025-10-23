/**
 * Error handler middleware
 * Converts errors to standardized JSON responses
 */
function errorHandler(logger) {
  return (err, req, res, next) => {
    // Default error details
    let statusCode = 500;
    let errorCode = 'INTERNAL';
    let message = 'An internal server error occurred';

    // Map common error codes to HTTP status codes
    const errorMap = {
      PATH_TRAVERSAL: { status: 400, message: 'Access outside docsRoot is not allowed' },
      UNAUTHORIZED: { status: 401, message: 'Authentication required' },
      PERMISSION_DENIED: { status: 403, message: 'Permission denied' },
      EXCLUDED: { status: 403, message: 'File matches exclude rules' },
      NOT_FOUND: { status: 404, message: 'Resource not found' },
      CONFLICT: { status: 409, message: 'Resource conflict' },
      FILE_BUSY: { status: 409, message: 'File is busy, please try again' },
      LOCK_TIMEOUT: { status: 409, message: 'Resource is locked, please try again' },
      PAYLOAD_TOO_LARGE: { status: 413, message: 'File size exceeds limit' },
      UNSUPPORTED_TYPE: { status: 415, message: 'Unsupported file type' }
    };

    // Check if error has a known code
    if (err.code && errorMap[err.code]) {
      const mapped = errorMap[err.code];
      statusCode = mapped.status;
      errorCode = err.code;
      message = err.message || mapped.message;
    } else if (err.message) {
      // Try to extract error code from message
      const match = err.message.match(/^([A-Z_]+):/);
      if (match && errorMap[match[1]]) {
        errorCode = match[1];
        const mapped = errorMap[errorCode];
        statusCode = mapped.status;
        message = err.message.substring(match[0].length).trim() || mapped.message;
      } else {
        message = err.message;
      }
    }

    // Handle specific Node.js error codes
    if (err.code === 'ENOENT') {
      statusCode = 404;
      errorCode = 'NOT_FOUND';
      message = 'File or directory not found';
    } else if (err.code === 'EACCES' || err.code === 'EPERM') {
      statusCode = 403;
      errorCode = 'PERMISSION_DENIED';
      message = 'Permission denied';
    } else if (err.code === 'LIMIT_FILE_SIZE') {
      statusCode = 413;
      errorCode = 'PAYLOAD_TOO_LARGE';
      message = 'File size exceeds the maximum allowed limit';
    }

    // Log error details
    logger.error('Request error', {
      errorCode,
      statusCode,
      message,
      path: req.path,
      method: req.method,
      stack: err.stack
    });

    // Send error response
    res.status(statusCode).json({
      error: {
        code: errorCode,
        message: message
      }
    });
  };
}

module.exports = errorHandler;
