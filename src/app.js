const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const { loadConfig } = require('./utils/config-loader');
const { createLogger } = require('./utils/logger');
const { loadSSLOptions } = require('./utils/ssl-validator');
const { createIpWhitelist } = require('./middleware/ip-whitelist');
const requestLogger = require('./middleware/request-logger');
const errorHandler = require('./middleware/error-handler');
const createApiRouter = require('./routes/api');
const createMcpRouter = require('./routes/mcp');

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

// IP 화이트리스트 미들웨어 (가장 먼저 적용)
app.use(createIpWhitelist(config));

app.use(requestLogger(logger));

// Routes
app.use('/api', createApiRouter(config));
app.use(createMcpRouter());

// Main page
app.get('/', (req, res) => {
  res.render('index', {
    title: 'DocLight - Markdown Viewer',
    uiTitle: config.ui.title,
    uiIcon: config.ui.icon
  });
});

// Document viewer route (for clean URLs)
app.get('/doc/*', (req, res) => {
  res.render('index', {
    title: 'DocLight - Markdown Viewer',
    uiTitle: config.ui.title,
    uiIcon: config.ui.icon
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

let server;

if (config.ssl && config.ssl.enabled) {
  // HTTPS 서버
  const sslOptions = loadSSLOptions(config.ssl);
  server = https.createServer(sslOptions, app);

  server.listen(PORT, () => {
    logger.info('DocLight HTTPS server started', {
      port: PORT,
      docsRoot: config.docsRoot,
      ssl: true
    });

    console.log(`\n✅ DocLight Server Started (HTTPS)`);
    console.log(`   📂 Docs: ${config.docsRoot}`);
    console.log(`   🔒 SSL: Enabled`);
    console.log(`   🌐 URL: https://localhost:${PORT}\n`);
  });
} else {
  // HTTP 서버
  server = http.createServer(app);

  server.listen(PORT, () => {
    logger.info('DocLight HTTP server started', {
      port: PORT,
      docsRoot: config.docsRoot,
      ssl: false
    });

    console.log(`\n✅ DocLight Server Started (HTTP)`);
    console.log(`   📂 Docs: ${config.docsRoot}`);
    console.log(`   ⚠️  SSL: Disabled`);
    console.log(`   🌐 URL: http://localhost:${PORT}\n`);
  });
}

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
