const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { validatePath } = require('../utils/path-validator');

/**
 * Search Service - Document search operations
 */

/**
 * Search documents by query (real-time file scanning)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} query - Search query
 * @param {Object} options - Options { limit?: number, path?: string }
 * @returns {Promise<Object>} Search results
 */
async function searchDocuments(config, logger, query, options = {}) {
  try {
    const startTime = Date.now();
    const { limit = 10, path: searchPath = '/' } = options;

    // Input validation
    if (!query || typeof query !== 'string') {
      const error = new Error('INVALID_QUERY: Query must be a non-empty string');
      error.code = 'INVALID_QUERY';
      throw error;
    }

    if (query.length < 2) {
      const error = new Error('QUERY_TOO_SHORT: Query must be at least 2 characters');
      error.code = 'QUERY_TOO_SHORT';
      throw error;
    }

    // Validate and limit
    let finalLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 100);

    // Validate path
    let absoluteSearchPath;
    try {
      absoluteSearchPath = validatePath(config.docsRoot, searchPath);
    } catch (error) {
      const pathError = new Error(`PATH_ERROR: ${error.message}`);
      pathError.code = 'PATH_TRAVERSAL';
      throw pathError;
    }

    // Check if search path is a directory
    let stats;
    try {
      stats = await fs.stat(absoluteSearchPath);
    } catch (error) {
      const notFoundError = new Error(`PATH_NOT_FOUND: ${searchPath}`);
      notFoundError.code = 'NOT_FOUND';
      throw notFoundError;
    }

    if (!stats.isDirectory()) {
      const error = new Error('PATH_NOT_DIR: Search path must be a directory');
      error.code = 'INVALID_PATH';
      throw error;
    }

    // Create ignore filter
    const ig = ignore().add(config.excludes);

    // Search results storage
    const results = [];
    let filesScanned = 0;
    const maxFileSize = 1024 * 1024; // 1MB

    // Convert query to lowercase (case-insensitive search)
    const lowerQuery = query.toLowerCase();

    // Recursive file search
    async function searchRecursive(currentPath) {
      // Search timeout (5 seconds)
      if (Date.now() - startTime > 5000) {
        const error = new Error('SEARCH_TIMEOUT: Search operation took too long');
        error.code = 'TIMEOUT';
        throw error;
      }

      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          // Skip hidden files
          if (entry.name.startsWith('.')) continue;

          const entryPath = path.join(currentPath, entry.name);
          const relativePath = path.relative(config.docsRoot, entryPath);

          // Apply exclude rules
          if (ig.ignores(relativePath)) continue;

          if (entry.isDirectory()) {
            // Recurse
            await searchRecursive(entryPath);
          } else if (entry.isFile()) {
            filesScanned++;

            // Check file size
            const fileStats = await fs.stat(entryPath);
            if (fileStats.size > maxFileSize) {
              continue; // Skip files over 1MB
            }

            // Read file
            try {
              const content = await fs.readFile(entryPath, 'utf-8');
              const lines = content.split('\n');
              const fileMatches = [];

              // Search each line
              for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                if (line.toLowerCase().includes(lowerQuery)) {
                  // Extract context (±2 lines)
                  const contextStart = Math.max(0, lineNum - 2);
                  const contextEnd = Math.min(lines.length - 1, lineNum + 2);
                  const context = lines.slice(contextStart, contextEnd + 1).join('\n');

                  fileMatches.push({
                    line: lineNum + 1,
                    content: line.trim(),
                    context: context
                  });

                  // Max 50 matches per file
                  if (fileMatches.length >= 50) break;
                }
              }

              // Add to results if matches found
              if (fileMatches.length > 0) {
                results.push({
                  path: '/' + relativePath.replace(/\\/g, '/'),
                  matches: fileMatches
                });
              }

              // Stop if total results reached limit
              if (results.length >= finalLimit) break;
            } catch (readError) {
              // Log and continue on read errors
              logger.warn('Failed to read file during search', {
                path: entryPath,
                error: readError.message
              });
            }
          }
        }
      } catch (dirError) {
        // Log and continue on directory read errors
        logger.warn('Failed to read directory during search', {
          path: currentPath,
          error: dirError.message
        });
      }
    }

    // Execute search
    await searchRecursive(absoluteSearchPath);

    // Limit results
    const limitedResults = results.slice(0, finalLimit);

    const duration = Date.now() - startTime;
    logger.info('Document search completed', {
      query,
      path: searchPath,
      results: limitedResults.length,
      filesScanned,
      duration: `${duration}ms`
    });

    return {
      query,
      path: searchPath,
      total: limitedResults.length,
      filesScanned,
      duration: `${duration}ms`,
      results: limitedResults
    };
  } catch (error) {
    logger.error('Document search failed', {
      query,
      error: error.message,
      code: error.code
    });
    throw error;
  }
}

module.exports = {
  searchDocuments
};
