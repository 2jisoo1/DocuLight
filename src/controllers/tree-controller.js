const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { validatePath } = require('../utils/path-validator');

/**
 * Get directory tree structure
 */
async function getTree(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const userPath = req.query.path || '/';

    // Validate path
    const absolutePath = validatePath(config.docsRoot, userPath);

    // Check if path exists and is a directory
    const stats = await fs.stat(absolutePath);
    if (!stats.isDirectory()) {
      const error = new Error('NOT_FOUND: Path is not a directory');
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Create ignore filter
    const ig = ignore().add(config.excludes);

    // Read directory contents
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    const dirs = [];
    const files = [];

    for (const entry of entries) {
      // Skip hidden files
      if (entry.name.startsWith('.')) {
        continue;
      }

      // Get relative path for exclude check
      const relativePath = path.relative(
        config.docsRoot,
        path.join(absolutePath, entry.name)
      );

      // Check if excluded
      if (ig.ignores(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        dirs.push({ name: entry.name });
      } else if (entry.isFile()) {
        const filePath = path.join(absolutePath, entry.name);
        const fileStats = await fs.stat(filePath);
        files.push({
          name: entry.name,
          size: fileStats.size
        });
      }
    }

    // Sort alphabetically
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    logger.info('Tree retrieved', {
      path: userPath,
      dirs: dirs.length,
      files: files.length
    });

    res.json({
      path: userPath,
      dirs,
      files,
      excludesApplied: true
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getTree };
