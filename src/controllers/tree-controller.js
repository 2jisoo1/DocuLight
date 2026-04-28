const { getTreeData, getFullTreeData } = require('../services/tree-service');

/**
 * Get directory tree structure (Express wrapper)
 */
async function getTree(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const userPath = req.query.path || '/';
    const useDisplayName = req.query.useDisplayName === 'true';

    const result = await getTreeData(config, logger, userPath, { useDisplayName });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Get full recursive tree structure (Express wrapper)
 */
async function getFullTree(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const startPath = req.query.path || '/';
    const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth) : undefined;
    const useDisplayName = req.query.useDisplayName === 'true';

    const result = await getFullTreeData(config, logger, startPath, { maxDepth, useDisplayName });

    // Format response to match original REST API format
    res.json({
      root: result.root,
      docsRoot: result.docsRoot,
      excludesApplied: result.excludesApplied,
      stats: result.stats
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getTree, getFullTree };
