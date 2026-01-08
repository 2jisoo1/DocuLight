const path = require('path');

/**
 * Get index file configuration
 */
function getIndexConfig(req, res) {
  const config = req.app.locals.config;

  let indexFile = null;

  if (config.ui && config.ui.resolvedIndexFile) {
    // Convert absolute path to relative path for client
    const docsRoot = config.docsRoot;
    indexFile = path.relative(docsRoot, config.ui.resolvedIndexFile);

    // Ensure leading slash
    if (!indexFile.startsWith('/')) {
      indexFile = '/' + indexFile;
    }

    // Handle Windows path separators
    indexFile = indexFile.replace(/\\/g, '/');
  }

  res.json({
    indexFile,
    hasIndex: !!indexFile
  });
}

module.exports = { getIndexConfig };
