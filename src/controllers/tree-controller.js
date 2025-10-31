const { getTreeData, getFullTreeData } = require('../routes/api-ctrl');

/**
 * Get directory tree structure (Express wrapper)
 */
async function getTree(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const userPath = req.query.path || '/';

    const result = await getTreeData(config, logger, userPath);
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

    const result = await getFullTreeData(config, logger, startPath, { maxDepth });

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
