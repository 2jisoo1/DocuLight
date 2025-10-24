const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { loadConfig } = require('./config-loader');

/**
 * Create a config watcher that triggers app.restart() when safe changes are detected.
 * Options:
 *  - stabilityThreshold: ms to consider file stable (default 1000)
 *  - pollInterval: ms polling interval used by awaitWriteFinish (default 50000)
 *  - usePolling: boolean to force polling (default false)
 */
function createConfigWatcher(app, options = {}) {
  const configPath = path.join(process.cwd(), 'config.json5');
  const stabilityThreshold = options.stabilityThreshold || 1000;
  const pollInterval = typeof options.pollInterval === 'number' ? options.pollInterval : 5000;
  const usePolling = !!options.usePolling;

  let watcher = null;
  let lastHash = null;
  let closed = false;

  function hashStat(p) {
    try {
      const s = fs.statSync(p);
      return `${s.size}:${s.mtimeMs}`;
    } catch (e) {
      return null;
    }
  }

  async function handleChange() {
    if (closed) return;
    const logger = (app && app.locals && app.locals.logger) || console;
    logger.debug && logger.debug('Config watcher: change event received, attempting read');

    // Read with retries in case of transient lock
    let raw = null;
    for (let i = 0; i < 10; i++) {
      try {
        raw = fs.readFileSync(configPath, 'utf8');
        logger.debug && logger.debug(`Config watcher: read attempt ${i + 1} succeeded`);
        break;
      } catch (e) {
        logger.debug && logger.debug(`Config watcher: read attempt ${i + 1} failed: ${e && e.message}`);
        // wait then retry
        await new Promise(res => setTimeout(res, 200));
      }
    }

    if (raw === null) {
      logger.error('Config watcher: Failed to read config after change detected');
      return;
    }

    // Quick stat/hash check to avoid duplicate processing
    const h = hashStat(configPath);
    if (h && h === lastHash) {
      return;
    }

    // Try to validate new config
    let newCfg;
    try {
      logger.debug && logger.debug('Config watcher: validating new config');
      newCfg = loadConfig(); // may throw
      logger.debug && logger.debug('Config watcher: validation succeeded');
    } catch (e) {
      logger.error('Config watcher: New config invalid — change ignored', e && (e.stack || e.message));
      return;
    }

    const currentCfg = (app && app.locals && app.locals.config) || {};

    // Determine if change affects port or ssl (which we treat as restart-required but not auto-applied)
    const portChanged = (newCfg.port || 3000) !== (currentCfg.port || 3000);
    const sslChanged = !!(newCfg.ssl && newCfg.ssl.enabled) !== !!(currentCfg.ssl && currentCfg.ssl.enabled)
      || (newCfg.ssl && newCfg.ssl.certPath) !== (currentCfg.ssl && currentCfg.ssl.certPath)
      || (newCfg.ssl && newCfg.ssl.keyPath) !== (currentCfg.ssl && currentCfg.ssl.keyPath);

    // If only port/ssl changed, log and skip automatic restart
    if (portChanged || sslChanged) {
      logger.warn('Config change detected that requires manual restart (port/SSL change). No automatic restart performed.', { portChanged, sslChanged });
      lastHash = h;
      return;
    }

    // Otherwise attempt restart via app.restart()
    try {
      logger.info('Config change detected — attempting restart', { changedAt: new Date().toISOString() });
      logger.debug && logger.debug('Config watcher: currentCfg keys', Object.keys(currentCfg || {}));
      logger.debug && logger.debug('Config watcher: newCfg keys', Object.keys(newCfg || {}));
      lastHash = h;
      const res = await app.restart();
      if (!res.success) {
        logger.error('Config watcher: Auto-restart failed after config change', res && (res.error || res));
        // emit for tests/observability
        app && app.emit && app.emit('server:restart:failed', { error: res && res.error });
      } else {
        logger.info('Config watcher: Auto-restart succeeded after config change');
        app && app.emit && app.emit('server:restart:success');
      }
    } catch (e) {
      logger.error('Config watcher: Error while handling config change', e && (e.stack || e.message));
      app && app.emit && app.emit('server:restart:error', { error: e && (e.stack || e.message) });
    }
  }

  return {
    start() {
      if (watcher) return watcher;

      watcher = chokidar.watch(configPath, {
        ignoreInitial: true,
        persistent: true,
        usePolling,
        awaitWriteFinish: {
          stabilityThreshold: stabilityThreshold,
          pollInterval: pollInterval
        }
      });

      watcher.on('change', () => {
        // chokidar's awaitWriteFinish already waits; call handler
        handleChange();
      });

      watcher.on('error', (err) => {
        const logger = (app && app.locals && app.locals.logger) || console;
        logger.error('Config watcher error', err && err.message);
      });

      return watcher;
    },
    close() {
      closed = true;
      if (watcher) {
        try { watcher.close(); } catch (e) { /* ignore */ }
        watcher = null;
      }
    }
  };
}

module.exports = { createConfigWatcher };
