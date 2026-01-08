/**
 * HTML Controller
 * Serves pre-rendered HTML from server-side cache
 * Step 13: Phase 6 - API Endpoints
 *
 * Fallback: When cache manager is disabled, renders directly using MarkdownRenderer
 */

const { getRawContent } = require('../services/file-service');
const MarkdownRenderer = require('../services/markdown-renderer');
const { parseFrontmatter } = require('../services/frontmatter-service');

// Lazy-loaded renderer instance (created on first use)
let fallbackRenderer = null;

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

    if (!userPath) {
      const error = new Error('INVALID_PATH: path parameter is required');
      error.code = 'INVALID_PATH';
      throw error;
    }

    // If cacheManager is available, use it (preferred path)
    if (cacheManager) {
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

      // Trigger background scan AFTER response (async, non-blocking)
      cacheManager.triggerScanIfNeeded().catch(error => {
        logger.warn('Background scan failed', { error: error.message });
      });

      return;
    }

    // Fallback: render directly when cache manager is not available
    logger.info('HTML fallback rendering (cache disabled)', { path: userPath });

    // Read raw markdown content
    const rawContent = await getRawContent(config, logger, userPath);

    // Strip frontmatter before rendering
    const { content: markdownContent } = parseFrontmatter(rawContent);

    // Create renderer instance (lazy initialization)
    if (!fallbackRenderer) {
      fallbackRenderer = new MarkdownRenderer(logger);
    }

    // Render markdown to HTML
    const rendered = await fallbackRenderer.render(markdownContent);

    // Respond with rendered HTML
    res.json({
      html: rendered.html,
      toc: rendered.toc,
      path: userPath,
      cachedAt: null,
      fromCache: false,
      fallback: true
    });

    logger.info('HTML served (fallback)', {
      path: userPath,
      htmlSize: rendered.html.length,
      tocItems: rendered.toc.length
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getHtml };
