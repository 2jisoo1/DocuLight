const express = require('express');
const path = require('path');
const { loadConfig } = require('./utils/config-loader');
const { createLogger } = require('./utils/logger');
const requestLogger = require('./middleware/request-logger');
const errorHandler = require('./middleware/error-handler');
const createApiRouter = require('./routes/api');

// Load configuration
let config;
try {
  config = loadConfig();
  console.log('Configuration loaded successfully');
} catch (error) {
  console.error('Failed to load configuration:', error.message);
  process.exit(1);
}

// Create logger
const logger = createLogger(config);

// Create Express app
const app = express();

// Store config and logger in app.locals for access in routes
app.locals.config = config;
app.locals.logger = logger;

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(requestLogger(logger));

// Routes
app.use('/api', createApiRouter(config));

// Main page
app.get('/', (req, res) => {
  res.render('index', {
    title: 'DocLight - Markdown Viewer'
  });
});

// Document viewer route (for clean URLs)
app.get('/doc/*', (req, res) => {
  res.render('index', {
    title: 'DocLight - Markdown Viewer'
  });
});

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found'
    }
  });
});

// Error handler (must be last)
app.use(errorHandler(logger));

// Start server
const PORT = config.port || 3000;
app.listen(PORT, () => {
  logger.info('DocLight server started', {
    port: PORT,
    docsRoot: config.docsRoot,
    env: process.env.NODE_ENV || 'development'
  });
  console.log(`DocLight server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
