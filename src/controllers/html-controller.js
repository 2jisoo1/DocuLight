/**
 * HTML Controller
 * Serves pre-rendered HTML from server-side cache
 * Step 13: Phase 6 - API Endpoints
 */

/**
 * Get pre-rendered HTML from cache or render on demand
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
async function getHtml(req, res, next) {
  try {
    const { config, logger, cacheManager } = req.app.locals;
    const userPath = req.query.path;

    // Validate cacheManager availability
    if (!cacheManager) {
      const error = new Error('SERVICE_UNAVAILABLE: Cache manager not initialized');
      error.code = 'SERVICE_UNAVAILABLE';
      throw error;
    }

    if (!userPath) {
      const error = new Error('INVALID_PATH: path parameter is required');
      error.code = 'INVALID_PATH';
      throw error;
    }

    // Trigger background scan (async, non-blocking)
    // This runs independently and doesn't affect response time
    cacheManager.triggerScanIfNeeded().catch(error => {
      logger.warn('Background scan failed', { error: error.message });
    });

    // Get cached HTML or render on demand
    const cached = await cacheManager.getOrRender(userPath);

    if (!cached) {
      const error = new Error('NOT_FOUND: File not found or cannot be rendered');
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Respond with HTML and TOC
    res.json({
      html: cached.html,
      toc: cached.toc,
      path: userPath,
      cachedAt: cached.cachedAt,
      fromCache: cached.fromCache
    });

    logger.info('HTML served', {
      path: userPath,
      fromCache: cached.fromCache,
      htmlSize: cached.html.length,
      tocItems: cached.toc.length
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getHtml };
