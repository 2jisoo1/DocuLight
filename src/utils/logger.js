const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

/**
 * Create and configure Winston logger
 * @param {Object} config - Configuration object with logDir and logLevel
 * @returns {winston.Logger} Configured logger instance
 */
function createLogger(config) {
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      let log = `[${timestamp}] ${level.toUpperCase()} ${message}`;

      // Add metadata if present
      if (Object.keys(meta).length > 0) {
        // Mask API key in logs
        if (meta.apiKey) {
          meta.apiKey = '***REDACTED***';
        }
        log += ` ${JSON.stringify(meta)}`;
      }

      // Add stack trace if present
      if (stack) {
        log += `\n${stack}`;
      }

      return log;
    })
  );

  // Configure daily rotate file transport
  const fileTransport = new DailyRotateFile({
    filename: 'DocuLight-%DATE%.log',
    dirname: config.logDir,
    datePattern: 'YYYYMMDD',
    maxSize: '10m',
    maxFiles: '30d',
    format: logFormat
  });

  // Create logger
  const logger = winston.createLogger({
    level: config.logLevel || 'info',
    transports: [
      fileTransport,
      // Console transport for development
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          logFormat
        )
      })
    ]
  });

  // Log initialization
  logger.info('Logger initialized', {
    logDir: config.logDir,
    logLevel: config.logLevel || 'info'
  });

  return logger;
}

module.exports = { createLogger };
