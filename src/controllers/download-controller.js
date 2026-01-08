const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const ignore = require('ignore');
const { validatePath } = require('../utils/path-validator');

/**
 * Download single file
 */
async function downloadFile(req, res, next) {
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
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      const error = new Error('NOT_FOUND: Path is not a file');
      error.code = 'NOT_FOUND';
      throw error;
    }

    const filename = path.basename(absolutePath);

    logger.info('File download started', {
      path: userPath,
      size: stats.size
    });

    // Set headers
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);

    // Stream file
    const fileStream = require('fs').createReadStream(absolutePath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      logger.info('File download completed', { path: userPath });
    });

    fileStream.on('error', (error) => {
      logger.error('File download error', { path: userPath, error: error.message });
      next(error);
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Download directory as ZIP
 */
async function downloadDirectory(req, res, next) {
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

    // Check if directory exists
    const stats = await fs.stat(absolutePath);
    if (!stats.isDirectory()) {
      const error = new Error('NOT_FOUND: Path is not a directory');
      error.code = 'NOT_FOUND';
      throw error;
    }

    const dirName = path.basename(absolutePath);
    const zipFilename = `${dirName}.zip`;

    logger.info('Directory ZIP download started', { path: userPath });

    // Set headers
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFilename)}"`);
    res.setHeader('Content-Type', 'application/zip');

    // Create archiver
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    // Handle errors
    archive.on('error', (error) => {
      logger.error('ZIP creation error', { path: userPath, error: error.message });
      next(error);
    });

    archive.on('end', () => {
      logger.info('Directory ZIP download completed', {
        path: userPath,
        bytes: archive.pointer()
      });
    });

    // Pipe to response
    archive.pipe(res);

    // Create ignore filter
    const ig = ignore().add(config.excludes);

    // Add directory to archive with exclude filter
    archive.glob('**/*', {
      cwd: absolutePath,
      ignore: (name) => {
        const relativePath = path.relative(config.docsRoot, path.join(absolutePath, name));
        return ig.ignores(relativePath);
      }
    });

    // Finalize archive
    await archive.finalize();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  downloadFile,
  downloadDirectory
};
