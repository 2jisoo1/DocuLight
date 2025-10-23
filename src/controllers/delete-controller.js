const fs = require('fs').promises;
const { validatePath } = require('../utils/path-validator');
const lockManager = require('../utils/lock-manager');

/**
 * Delete file or directory
 */
async function deleteEntry(req, res, next) {
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

    // Check if path exists
    try {
      await fs.access(absolutePath);
    } catch {
      const error = new Error('NOT_FOUND: Path does not exist');
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Acquire lock and delete
    await lockManager.acquire(absolutePath, async () => {
      const maxRetries = 2;
      let lastError;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Recursive delete with force option
          await fs.rm(absolutePath, { recursive: true, force: true });

          logger.info('Entry deleted', {
            path: userPath,
            attempt: attempt + 1
          });

          return;
        } catch (error) {
          lastError = error;

          // If file is busy, retry
          if (error.code === 'EBUSY' && attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }

          throw error;
        }
      }

      // If we get here, all retries failed
      if (lastError) {
        const error = new Error('FILE_BUSY: File is in use and cannot be deleted');
        error.code = 'FILE_BUSY';
        throw error;
      }
    });

    res.json({
      success: true,
      path: userPath,
      message: 'Entry deleted successfully'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { deleteEntry };
