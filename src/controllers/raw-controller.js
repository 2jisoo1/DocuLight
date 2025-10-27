const fs = require('fs').promises;
const path = require('path');
const { validatePath } = require('../utils/path-validator');

/**
 * Get raw markdown file content
 */
async function getRaw(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const userPath = req.query.path;

    if (!userPath) {
      const error = new Error('PATH_TRAVERSAL: Path parameter is required');
      error.code = 'PATH_TRAVERSAL';
      throw error;
    }

    // Validate path
    const absolutePath = validatePath(config.docsRoot, userPath);

    // Check if file exists
    let stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch (fsError) {
      // Convert ENOENT to NOT_FOUND (404)
      if (fsError.code === 'ENOENT') {
        const error = new Error('NOT_FOUND: File does not exist');
        error.code = 'NOT_FOUND';
        throw error;
      }
      // Re-throw other file system errors
      throw fsError;
    }

    if (!stats.isFile()) {
      const error = new Error('NOT_FOUND: Path is not a file');
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Check if file is markdown
    const ext = path.extname(absolutePath).toLowerCase();
    if (ext !== '.md') {
      const error = new Error('UNSUPPORTED_TYPE: Only .md files are supported');
      error.code = 'UNSUPPORTED_TYPE';
      throw error;
    }

    // Read file content
    const content = await fs.readFile(absolutePath, 'utf-8');

    logger.info('Raw file accessed', {
      path: userPath,
      size: content.length
    });

    res.type('text/plain').send(content);
  } catch (error) {
    next(error);
  }
}

module.exports = { getRaw };
