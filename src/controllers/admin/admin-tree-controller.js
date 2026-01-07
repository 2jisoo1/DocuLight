/**
 * Admin Tree Controller
 * Phase 3: Admin API Implementation
 *
 * Provides tree retrieval with all file types and metadata
 */
const treeService = require('../../services/tree-service');

/**
 * Get directory tree with all files and metadata
 * GET /api/admin/tree
 *
 * Query Parameters:
 *   - path: Starting path (default: '/')
 *   - maxDepth: Maximum depth to traverse (optional)
 *
 * Response:
 *   { success: true, tree: { root, startPath, stats } }
 */
async function getTree(req, res, next) {
  try {
    const { path: startPath = '/', maxDepth } = req.query;
    const config = req.app.locals.config;
    const logger = req.app.locals.logger;

    // Parse maxDepth if provided
    const options = {
      includeAllFiles: true,
      includeMetadata: true
    };

    if (maxDepth !== undefined) {
      const depth = parseInt(maxDepth, 10);
      if (!isNaN(depth) && depth >= 0) {
        options.maxDepth = depth;
      }
    }

    const result = await treeService.getFullTreeData(config, logger, startPath, options);

    logger.info('Admin tree retrieved', {
      startPath,
      totalFiles: result.stats.totalFiles,
      totalDirs: result.stats.totalDirs
    });

    res.json({
      success: true,
      tree: result
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND' || error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Path not found'
        }
      });
    }

    if (error.code === 'PATH_VIOLATION') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access to path denied'
        }
      });
    }

    next(error);
  }
}

module.exports = {
  getTree
};
