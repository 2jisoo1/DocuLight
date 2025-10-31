const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const fs = require('fs');
const path = require('path');

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
    logLevel: config.logLevel || 'info',
    maxDays: config.log?.maxDays || 30
  });

  // Setup log cleanup if maxDays is configured
  const maxDays = config.log?.maxDays || 30;
  if (maxDays > 0) {
    setupLogCleanup(config.logDir, maxDays, logger);
  }

  return logger;
}

/**
 * Setup periodic log cleanup
 * @param {string} logDir - Log directory path
 * @param {number} maxDays - Maximum days to keep logs
 * @param {winston.Logger} logger - Logger instance
 */
function setupLogCleanup(logDir, maxDays, logger) {
  // Run cleanup immediately on startup
  deleteOldLogs(logDir, maxDays, logger);

  // Run cleanup every hour
  setInterval(() => {
    deleteOldLogs(logDir, maxDays, logger);
  }, 1000 * 60 * 60); // 1 hour
}

/**
 * Delete log files older than maxDays
 * @param {string} logDir - Log directory path
 * @param {number} maxDays - Maximum days to keep logs
 * @param {winston.Logger} logger - Logger instance
 */
function deleteOldLogs(logDir, maxDays, logger) {
  try {
    if (!fs.existsSync(logDir)) {
      return;
    }

    const files = fs.readdirSync(logDir);
    const now = Date.now();
    const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    files.forEach(file => {
      try {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);

        // Only process log files
        if (file.endsWith('.log') && stats.isFile()) {
          const age = now - stats.mtime.getTime();

          if (age > maxAgeMs) {
            fs.unlinkSync(filePath);
            deletedCount++;
            if (logger) {
              logger.debug(`Deleted old log file: ${file} (${Math.floor(age / (24 * 60 * 60 * 1000))} days old)`);
            }
          }
        }
      } catch (err) {
        // Skip files that cannot be accessed
        if (logger) {
          logger.warn(`Failed to process log file ${file}: ${err.message}`);
        }
      }
    });

    if (deletedCount > 0 && logger) {
      logger.info(`Log cleanup completed: ${deletedCount} old log file(s) deleted (retention: ${maxDays} days)`);
    }
  } catch (error) {
    if (logger) {
      logger.error(`Log cleanup error: ${error.message}`);
    }
  }
}

module.exports = { createLogger };
