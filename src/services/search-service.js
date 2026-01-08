const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { validatePath } = require('../utils/path-validator');

/**
 * Search Service - Document search operations (unified for REST and MCP)
 */

/**
 * Extract document title from markdown content
 * Returns the first H1 heading text, or null if not found
 */
function extractTitle(content) {
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^#\s+(.+?)(?:\s*#*)?$/);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Truncate content to specified length with ellipsis
 */
function truncateContent(content, maxLength = 100) {
  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength) + '...';
}

/**
 * Find all matches of query in content with priority and highlighting
 * @param {string} content - File content
 * @param {string} query - Search query
 * @param {string} filename - Filename
 * @param {Object} options - Options { highlight?: boolean, maxMatchesPerFile?: number, includeContext?: boolean }
 * @returns {Array} Array of match objects
 */
function findMatches(content, query, filename, options = {}) {
  const {
    highlight = true,
    maxMatchesPerFile = 50,
    includeContext = true
  } = options;

  const lines = content.split('\n');
  const matches = [];
  const queryRegex = new RegExp(query, 'gi');

  // Check if filename matches (highest priority)
  const filenameLower = filename.toLowerCase().replace('.md', '');
  if (filenameLower.includes(query.toLowerCase())) {
    const filenameContent = highlight
      ? `<mark>Filename match: ${filename}</mark>`
      : `Filename match: ${filename}`;

    matches.push({
      line: 0,
      content: filenameContent,
      context: `File: ${filename}`,
      priority: 'filename'
    });
  }

  // Check if document title matches (high priority)
  const title = extractTitle(content);
  if (title && title.toLowerCase().includes(query.toLowerCase())) {
    const highlightedTitle = highlight
      ? title.replace(new RegExp(query, 'gi'), (match) => `<mark>${match}</mark>`)
      : title;

    const titleContent = highlight
      ? `<mark>Title match: ${highlightedTitle}</mark>`
      : `Title match: ${highlightedTitle}`;

    matches.push({
      line: 0,
      content: titleContent,
      context: title,
      priority: 'title'
    });
  }

  // Check content for matches
  lines.forEach((line, lineIndex) => {
    if (queryRegex.test(line)) {
      // Reset regex lastIndex for global flag
      queryRegex.lastIndex = 0;

      // Highlight the matched text (if enabled)
      const highlightedContent = highlight
        ? line.replace(queryRegex, (match) => `<mark>${match}</mark>`)
        : line;

      // Extract context if requested
      let context = line;
      if (includeContext) {
        const contextStart = Math.max(0, lineIndex - 2);
        const contextEnd = Math.min(lines.length - 1, lineIndex + 2);
        context = lines.slice(contextStart, contextEnd + 1).join('\n');
      }

      matches.push({
        line: lineIndex + 1,
        content: truncateContent(highlightedContent, 100),
        context: includeContext ? context : truncateContent(line, 100),
        priority: 'content'
      });

      // Limit matches per file
      if (matches.length >= maxMatchesPerFile) {
        return;
      }
    }
  });

  return matches;
}

/**
 * Search documents by query (unified implementation)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} query - Search query
 * @param {Object} options - Options { limit?: number, path?: string, highlight?: boolean, includeContext?: boolean, maxMatchesPerFile?: number }
 * @returns {Promise<Object>} Search results
 */
async function searchDocuments(config, logger, query, options = {}) {
  try {
    const startTime = Date.now();
    const {
      limit = 10,
      path: searchPath = '/',
      highlight = true,
      includeContext = true,
      maxMatchesPerFile = 3
    } = options;

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
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            filesScanned++;

            // Check file size
            const fileStats = await fs.stat(entryPath);
            if (fileStats.size > maxFileSize) {
              continue; // Skip files over 1MB
            }

            // Read file
            try {
              const content = await fs.readFile(entryPath, 'utf-8');
              const matches = findMatches(content, lowerQuery, entry.name, {
                highlight,
                maxMatchesPerFile,
                includeContext
              });

              // Add to results if matches found
              if (matches.length > 0) {
                results.push({
                  path: relativePath.replace(/\\/g, '/'),
                  name: entry.name,
                  matches: matches
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

    // Sort by relevance: priority first, then by match count
    const priorityOrder = { filename: 0, title: 1, content: 2 };
    results.sort((a, b) => {
      // Get highest priority from matches in each result
      const aPriority = Math.min(
        ...a.matches.map(m => priorityOrder[m.priority] ?? 2)
      );
      const bPriority = Math.min(
        ...b.matches.map(m => priorityOrder[m.priority] ?? 2)
      );

      // Compare by priority first, then by match count
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return b.matches.length - a.matches.length;
    });

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
      results: limitedResults,
      limited: results.length > finalLimit
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
