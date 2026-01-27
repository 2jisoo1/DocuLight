const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { loadConfig } = require('./utils/config-loader');
const { createLogger } = require('./utils/logger');
const { loadSSLOptions } = require('./utils/ssl-validator');
const { createIpWhitelist } = require('./middleware/ip-whitelist');
const requestLogger = require('./middleware/request-logger');
const errorHandler = require('./middleware/error-handler');
const createApiRouter = require('./routes/api');
const createMcpRouter = require('./routes/mcp');
const createContextMcpRouter = require('./routes/context-mcp');
const adminApiRouter = require('./routes/admin-api');
const chatbotRoutes = require('./routes/chatbot');
const sessionService = require('./services/session-service');
const { getDocumentation } = require('./controllers/doc-controller');
const { getIndexConfig } = require('./controllers/config-controller');
const backupUtils = require('./utils/backup-utils');
const { createConfigWatcher } = require('./utils/config-watcher');
const CacheManager = require('./services/cache-manager');
const { ChatbotService } = require('./services/chatbot');

// Runtime state
let config;
let logger;
let server = null;
let isStarting = false;
let isStopping = false;
let restartLock = false;
let apiMounted = false;

// Create Express app
const app = express();

// app.locals will be populated by start()

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// Dynamic wrappers for middleware that depend on config/logger so they reflect runtime updates
app.use((req, res, next) => {
  try {
    // createIpWhitelist reads runtime config from req.app.locals internally —
    // do not pass a captured config object here to avoid accidental module-level capture.
    const mw = createIpWhitelist();
    return mw(req, res, next);
  } catch (e) {
    (req.app && req.app.locals && req.app.locals.logger || console).warn('IP whitelist middleware error', e && e.message);
    return next();
  }
});

app.use((req, res, next) => {
  try {
    const lg = req.app.locals.logger || console;
    const mw = requestLogger(lg);
    return mw(req, res, next);
  } catch (e) {
    (req.app && req.app.locals && req.app.locals.logger || console).warn('Request logger middleware error', e && e.message);
    return next();
  }
});

// Documentation portal routes (must be before /api router)
app.get('/api/doc', (req, res) => {
  res.render('doc-viewer', { title: 'API Documentation - DocuLight', docType: 'api' });
});

app.get('/mcp/doc', (req, res) => {
  res.render('doc-viewer', { title: 'MCP Server Documentation - DocuLight', docType: 'mcp' });
});

// Documentation API endpoints (return JSON)
app.get('/api/documentation/:docType', (req, res, next) => getDocumentation(req, res, next));

// Config API endpoints
app.get('/api/config/index', getIndexConfig);

// Admin API routes (Phase 2: Admin Mode)
app.use('/api/admin', adminApiRouter);

// Chatbot API routes (Step 15: RAG Chatbot)
app.use('/api/chatbot', chatbotRoutes);

// Convert file path to web path (e.g., ./public/images/icon.png → /images/icon.png)
function resolveIconPath(configIconPath) {
  if (!configIconPath) {
    return '/images/icon.png';
  }

  // If it's already a web path (starts with /), return as-is
  if (configIconPath.startsWith('/')) {
    return configIconPath;
  }

  // Convert file path to web path
  // ./public/images/icon.png → /images/icon.png
  let webPath = configIconPath
    .replace(/^\.\/public/, '') // Remove ./public prefix
    .replace(/\\/g, '/');       // Normalize Windows paths

  // Ensure path starts with /
  if (!webPath.startsWith('/')) {
    webPath = '/' + webPath;
  }

  return webPath;
}

// Main page (use runtime config)
app.get('/', (req, res) => {
  const cfg = req.app.locals.config || {};
  const iconPath = (cfg.ui && cfg.ui.icon) || './public/images/icon.png';
  const isChatbotMode = cfg.ui?.indexFile === 'CHATBOT';

  // Chatbot mode: show chatbot UI in main content area (FR-CB-015)
  if (isChatbotMode) {
    // Client config for chatbot (timeout settings)
    const clientConfig = cfg.chatbot && cfg.chatbot.client ? {
      timeout: cfg.chatbot.client.timeout,
      keepAliveInterval: cfg.chatbot.client.keepAliveInterval
    } : {
      timeout: 300000,        // 5분 기본값
      keepAliveInterval: 30000  // 30초 기본값
    };

    res.render('index', {
      title: 'DocuLight - Chatbot',
      uiTitle: (cfg.ui && cfg.ui.title) || 'DocuLight',
      uiIcon: resolveIconPath(iconPath),
      uiMaxWidth: (cfg.ui && cfg.ui.maxWidth) || '1024px',
      chatbotMode: true,
      clientConfig: JSON.stringify(clientConfig)
    });
  } else {
    res.render('index', {
      title: 'DocuLight - Markdown Viewer',
      uiTitle: (cfg.ui && cfg.ui.title) || 'DocuLight',
      uiIcon: resolveIconPath(iconPath),
      uiMaxWidth: (cfg.ui && cfg.ui.maxWidth) || '1024px',
      chatbotMode: false,
      clientConfig: null
    });
  }
});

// Raw file download route (must be before /doc/*)
app.get('/doc/*.md', async (req, res, next) => {
  try {
    const { config, logger } = req.app.locals;

    if (!config) {
      return res.status(503).json({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Server not initialized' }
      });
    }

    // Extract file path from URL
    // Example: /doc/guide/intro.md → guide/intro.md (relative path)
    let filePath = req.path.replace('/doc/', '');

    // Remove leading slash if present (validatePath expects relative paths)
    if (filePath.startsWith('/')) {
      filePath = filePath.substring(1);
    }

    if (!filePath || filePath === '' || filePath === '.md') {
      const error = new Error('INVALID_PATH: File path is required');
      error.code = 'INVALID_PATH';
      throw error;
    }

    // Validate path
    const { validatePath } = require('./utils/path-validator');
    const absolutePath = validatePath(config.docsRoot, filePath);

    // Check if file exists
    const fs = require('fs').promises;

    let stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch (error) {
      const notFoundError = new Error('NOT_FOUND: File does not exist');
      notFoundError.code = 'NOT_FOUND';
      throw notFoundError;
    }

    if (!stats.isFile()) {
      const error = new Error('NOT_FOUND: Path is not a file');
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Log download
    logger.info('Raw file download via /doc/*.md', {
      path: filePath,
      filename: path.basename(filePath),
      size: stats.size
    });

    // Set download headers and send file
    res.download(absolutePath, path.basename(filePath));
  } catch (error) {
    next(error);
  }
});

// Document viewer route (for clean URLs)
app.get('/doc/*', (req, res) => {
  const cfg = req.app.locals.config || {};
  const iconPath = (cfg.ui && cfg.ui.icon) || './public/images/icon.png';
  res.render('index', {
    title: 'DocuLight - Markdown Viewer',
    uiTitle: (cfg.ui && cfg.ui.title) || 'DocuLight',
    uiIcon: resolveIconPath(iconPath),
    uiMaxWidth: (cfg.ui && cfg.ui.maxWidth) || '1024px'
  });
});

// Admin page route (Phase 4: Admin Mode)
app.get('/admin', (req, res) => {
  const cfg = req.app.locals.config || {};
  res.render('admin', { config: cfg });
});

// Admin SPA routes (client-side routing support)
app.get('/admin/*', (req, res) => {
  const cfg = req.app.locals.config || {};
  res.render('admin', { config: cfg });
});

// Chatbot page route (Step 15: RAG Chatbot)
app.get('/chatbot', (req, res) => {
  const cfg = req.app.locals.config || {};
  const iconPath = (cfg.ui && cfg.ui.icon) || './public/images/icon.png';

  // Client config for chatbot (timeout settings)
  const clientConfig = cfg.chatbot && cfg.chatbot.client ? {
    timeout: cfg.chatbot.client.timeout,
    keepAliveInterval: cfg.chatbot.client.keepAliveInterval
  } : {
    timeout: 300000,        // 5분 기본값
    keepAliveInterval: 30000  // 30초 기본값
  };

  res.render('chatbot', {
    title: (cfg.ui && cfg.ui.title) || 'DocuLight',
    icon: resolveIconPath(iconPath),
    clientConfig: JSON.stringify(clientConfig)
  });
});

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Note: 404 and error handlers are added dynamically in start() function
// This ensures they are placed after all routers are mounted

// Start the server (exposed API)
async function start(options = {}) {
  if (isStarting) return { success: false, error: 'Start already in progress' };
  isStarting = true;

  try {
    // Load config
    const cfg = loadConfig();
    config = cfg;

    // Create logger
    logger = createLogger(cfg);
    app.locals.config = cfg;
    app.locals.logger = logger;

    // Initialize cache manager (Step 13: Phase 6)
    if (cfg.cache && cfg.cache.enabled) {
      try {
        const cacheManager = new CacheManager(cfg, logger);
        await cacheManager.initialize();
        app.locals.cacheManager = cacheManager;
        logger.info('Cache manager initialized', {
          scanThrottle: cfg.cache.scanThrottle,
          maxMemorySize: cfg.cache.maxMemorySize
        });
      } catch (error) {
        logger.error('Failed to initialize cache manager', { error: error.message });
        // Continue without cache manager - API will fall back to /api/raw
      }
    } else {
      logger.info('Cache manager disabled (cache.enabled = false)');
    }

    // Initialize ChatbotService (Step 15: RAG Chatbot)
    // Only initialize when ui.indexFile === "CHATBOT" (FR-CB-015)
    const isChatbotMode = cfg.ui?.indexFile === 'CHATBOT';
    if (isChatbotMode && cfg.chatbot) {
      try {
        const chatbotService = new ChatbotService(cfg, logger);
        await chatbotService.initialize();
        app.locals.chatbotService = chatbotService;
        logger.info('ChatbotService initialized', {
          llm: cfg.chatbot.llm?.type,
          embedding: cfg.chatbot.embedding?.type
        });
      } catch (error) {
        logger.error('Failed to initialize ChatbotService', { error: error.message });
        // Continue without chatbot - API will return 503
      }
    } else {
      logger.info('ChatbotService disabled (ui.indexFile !== "CHATBOT")');
    }

    // Mount API routers once using the loaded config
    // Unmount previous API router if present (so new config is applied)
    try {
      if (app.locals && app.locals.apiLayer) {
        const stack = app._router && app._router.stack;
        const idx = stack ? stack.indexOf(app.locals.apiLayer) : -1;
        if (idx !== -1) {
          stack.splice(idx, 1);
        }
        delete app.locals.apiLayer;
        apiMounted = false;
      }
    } catch (e) {
      // ignore
    }

    // Mount API router (always remount to reflect latest config)
    const apiRouter = createApiRouter(cfg);
    app.use('/api', apiRouter);
    logger.info('API router mounted', { stackLength: app._router && app._router.stack ? app._router.stack.length : 0 });

    // capture the mounted layer so we can remove it on next start
    try {
      const stack = app._router && app._router.stack;
      if (stack && stack.length > 0) {
        // find layer with handle === apiRouter from the end
        for (let i = stack.length - 1; i >= 0; i--) {
          const layer = stack[i];
          if (layer && layer.handle === apiRouter) {
            app.locals.apiLayer = layer;
            apiMounted = true;
            logger.info('API layer captured', { index: i, totalLayers: stack.length });
            break;
          }
        }
      }
    } catch (e) {
      logger.warn('Failed to capture API layer', { error: e.message });
    }

    // Ensure MCP router is mounted once
    if (!app.locals.mcpMounted) {
      app.use(createMcpRouter());
      app.locals.mcpMounted = true;
    }

    // Ensure Context MCP router is mounted once
    if (!app.locals.contextMcpMounted) {
      app.use(createContextMcpRouter());
      app.locals.contextMcpMounted = true;
      logger.info('Context MCP router mounted');
    }

    // Remove all existing 404 and error handlers by filtering the stack
    try {
      const stack = app._router && app._router.stack;
      if (stack) {
        const originalLength = stack.length;
        // Remove layers that are 404 or error handlers (they have 4 parameters for error handlers)
        app._router.stack = stack.filter(layer => {
          // Keep all layers except our custom 404/error handlers
          if (!layer.route && layer.handle) {
            // Error handler has 4 params: (err, req, res, next)
            if (layer.handle.length === 4 && layer.handle.name !== 'query' && layer.handle.name !== 'expressInit') {
              return false; // Remove error handlers
            }
            // 404 handler returns 404 json
            if (layer.handle.toString().includes('Route not found')) {
              return false; // Remove 404 handlers
            }
          }
          return true; // Keep everything else
        });
        const removed = originalLength - app._router.stack.length;
        if (removed > 0) {
          logger.info('Removed old handlers from stack', { removed, newLength: app._router.stack.length });
        }
      }
    } catch (e) {
      logger.warn('Failed to clean up handlers', { error: e.message });
    }

    // Add 404 handler (after all routers are mounted)
    app.use((req, res) => {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    });
    logger.info('404 handler mounted');

    // Add error handler (must be after all routers and 404 handler)
    app.use((err, req, res, next) => {
      const lg = (req && req.app && req.app.locals && req.app.locals.logger) || logger || console;
      const handler = errorHandler(lg);
      return handler(err, req, res, next);
    });
    logger.info('Error handler mounted');

    const PORT = cfg.port || 3000;
    const HOST = process.env.HOST || cfg.host || '0.0.0.0';

    if (cfg.ssl && cfg.ssl.enabled) {
      const sslOptions = loadSSLOptions(cfg.ssl);
      server = https.createServer(sslOptions, app);
    } else {
      server = http.createServer(app);
    }

    await new Promise((resolve, reject) => {
      server.once('error', (err) => reject(err));
      server.listen(PORT, HOST, () => resolve());
    });

    logger.info('DocuLight server started', { host: HOST, port: PORT, docsRoot: cfg.docsRoot, ssl: !!(cfg.ssl && cfg.ssl.enabled) });

    // Start session cleanup timer (Phase 2: Admin Mode)
    sessionService.startCleanupTimer();
    logger.info('Session cleanup timer started');

    // On first successful start, delete any existing .bak (as requested) and then create a fresh backup
    const configPath = path.join(process.cwd(), 'config.json5');
    const backupPath = path.join(process.cwd(), 'config.json5.bak');
    try {
      if (!start._hasStarted) {
        try { backupUtils.removeBackup(backupPath); } catch (e) { /* ignore */ }
      }
      // create atomic-ish backup
      backupUtils.createBackup(configPath, backupPath);
    } catch (e) {
      logger.warn('Failed to create config backup', { error: e && e.message });
    }

    start._hasStarted = true;
    isStarting = false;
    app.emit('server:started', { config: cfg });

    // Start config watcher (use requested stabilityThreshold and pollInterval)
    try {
      if (!app.locals.configWatcher) {
        // Allow configuring whether port/SSL changes should trigger automatic restart via config.hotReload.allowPortSslAutoRestart
        const allowPortSslAutoRestart = !!(cfg.hotReload && cfg.hotReload.allowPortSslAutoRestart);
        app.locals.configWatcher = createConfigWatcher(app, { stabilityThreshold: 1000, pollInterval: 5000, usePolling: true, allowPortSslAutoRestart });
        app.locals.configWatcher.start();
      }
    } catch (e) {
      (logger || console).warn('Failed to start config watcher', e && e.message);
    }
    return { success: true };
  } catch (err) {
    isStarting = false;
    (logger || console).error('Failed to start server', err && err.message);
    return { success: false, error: err && err.message };
  }
}

// Stop the server (exposed API)
async function stop(timeoutMs = 60000) {
  if (!server) return { success: true };
  if (isStopping) return { success: false, error: 'Stop already in progress' };
  isStopping = true;

  const result = await new Promise((resolve) => {
    let finished = false;

    server.close((err) => {
      if (finished) return;
      finished = true;
      server = null;
      isStopping = false;
      app.emit('server:stopped', { reason: err ? err.message : 'stopped' });
      if (err) {
        (logger || console).error('Error while closing server', err && err.message);
        resolve({ success: false, error: err && err.message });
      } else {
        (logger || console).info('Server closed');
        resolve({ success: true });
      }
    });

    setTimeout(() => {
      if (finished) return;
      finished = true;
      isStopping = false;
      (logger || console).warn('Timed out while closing server');
      resolve({ success: false, error: 'timeout' });
    }, timeoutMs);
  });

  // Stop watcher when server stopped
  try {
    if (app.locals && app.locals.configWatcher) {
      app.locals.configWatcher.close();
      delete app.locals.configWatcher;
    }
  } catch (e) { /* ignore */ }

  // Stop session cleanup timer (Phase 2: Admin Mode)
  try {
    sessionService.stopCleanupTimer();
  } catch (e) { /* ignore */ }

  return result;
}

// Restart helper with single automatic restore attempt on failure
async function restart() {
  if (restartLock) return { success: false, error: 'Restart already in progress' };
  restartLock = true;
  try {
    const log = (app && app.locals && app.locals.logger) || logger || console;
    log.info && log.info('Restart requested');

    const stopRes = await stop();
    log.debug && log.debug('Restart: stop result', stopRes);

    const result = await start();
    log.debug && log.debug('Restart: start result', result);
    if (result.success) {
      restartLock = false;
      log.info && log.info('Restart completed successfully');
      app.emit && app.emit('server:restart:success', { restored: false });
      return { success: true };
    }

    // start failed - attempt restore from backup once
    const backupPath = path.join(process.cwd(), 'config.json5.bak');
    const configPath = path.join(process.cwd(), 'config.json5');

    log.warn && log.warn('Restart: initial start failed, attempting restore from backup', { error: result.error });

    if (fs.existsSync(backupPath)) {
      try {
        backupUtils.restoreBackup(backupPath, configPath);
        log.info && log.info('Restart: Restored config from backup after failed restart');
      } catch (e) {
        log.error && log.error('Restart: Failed to restore backup config', e && (e.stack || e.message));
        restartLock = false;
        app.emit && app.emit('server:restart:failed', { error: result.error, restored: false });
        return { success: false, error: result.error };
      }

      // try start again
      const retry = await start();
      restartLock = false;
      log.debug && log.debug('Restart: retry start result', retry);
      if (retry.success) {
        app.emit && app.emit('server:restart:success', { error: result.error, restored: true });
        return { success: true, restored: true };
      }
      app.emit && app.emit('server:restart:failed', { error: retry.error, restored: false });
      return { success: false, error: retry.error };
    }

    restartLock = false;
    app.emit && app.emit('server:restart:failed', { error: result.error, restored: false });
    return { success: false, error: result.error };
  } catch (e) {
    const log = (app && app.locals && app.locals.logger) || logger || console;
    log.error && log.error('Restart: unexpected error', e && (e.stack || e.message));
    restartLock = false;
    return { success: false, error: e && e.message };
  }
}

// Expose APIs on app for external control
app.start = start;
app.stop = stop;
app.restart = restart;

// Graceful shutdown on signals
const shutdown = async () => {
  (logger || console).info('Shutting down gracefully');
  await stop();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Auto-start when executed directly
if (require.main === module) {
  (async () => {
    const res = await start();
    if (!res.success) {
      (console || logger).error('Failed to start server when executed directly:', res.error);
      process.exit(1);
    }
  })();
}

module.exports = app;
