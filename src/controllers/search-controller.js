const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { validatePath } = require('../utils/path-validator');

/**
 * Search documents by keyword
 * GET /api/search?query=<keyword>&limit=<limit>
 */
async function searchDocuments(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const { query, limit = 50 } = req.query;

    // Validate query parameter
    if (!query || query.trim().length < 2) {
      return res.json({
        query: query || '',
        results: [],
        total: 0
      });
    }

    const searchQuery = query.trim().toLowerCase();
    const searchLimit = Math.min(parseInt(limit) || 50, 100);

    // Create ignore filter
    const ig = ignore().add(config.excludes);

    // Recursively search all markdown files
    const results = [];
    await searchFilesRecursive(config.docsRoot, config.docsRoot, searchQuery, results, ig);

    // Sort by relevance: priority first, then by match count
    // Priority order: filename > title > content
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

    const limitedResults = results.slice(0, searchLimit);

    logger.info('Documents searched', {
      query: searchQuery,
      resultsFound: limitedResults.length,
      total: results.length
    });

    res.json({
      query: searchQuery,
      results: limitedResults,
      total: results.length,
      limited: results.length > searchLimit
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Recursively search all markdown files in directory
 */
async function searchFilesRecursive(
  rootPath,
  currentPath,
  query,
  results,
  ig,
  maxFilesPerResult = 3
) {
  try {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      // Check if excluded
      if (ig.ignores(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recursively search subdirectory
        await searchFilesRecursive(rootPath, fullPath, query, results, ig, maxFilesPerResult);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Search markdown files
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const matches = findMatches(content, query, entry.name);

          if (matches.length > 0) {
            // Normalize path: remove leading .md extension, keep relative path format
            // e.g., "guide/setup.md" or "README.md" (no leading slash)
            const docPath = relativePath.replace(/\\/g, '/');
            results.push({
              path: docPath,
              name: entry.name,
              matches: matches.slice(0, maxFilesPerResult)
            });
          }
        } catch (fileError) {
          // Skip files that can't be read
          continue;
        }
      }
    }
  } catch (dirError) {
    // Skip directories that can't be read
  }
}

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
 * Find all matches of query in content
 * Returns array of match objects with line number, content, and context
 */
function findMatches(content, query, filename) {
  const lines = content.split('\n');
  const matches = [];
  const queryRegex = new RegExp(query, 'gi');

  // Check if filename matches (highest priority)
  const filenameLower = filename.toLowerCase().replace('.md', '');
  if (filenameLower.includes(query.toLowerCase())) {
    matches.push({
      line: 0,
      content: `<mark>Filename match: ${filename}</mark>`,
      context: `File: ${filename}`,
      priority: 'filename'
    });
  }

  // Check if document title matches (high priority)
  const title = extractTitle(content);
  if (title) {
    if (title.toLowerCase().includes(query.toLowerCase())) {
      const highlightedTitle = title
        .replace(new RegExp(query, 'gi'), (match) => `<mark>${match}</mark>`);
      matches.push({
        line: 0,
        content: `<mark>Title match: ${highlightedTitle}</mark>`,
        context: title,
        priority: 'title'
      });
    }
  }

  // Check content for matches
  lines.forEach((line, lineIndex) => {
    if (queryRegex.test(line)) {
      // Reset regex lastIndex for global flag
      queryRegex.lastIndex = 0;

      // Highlight the matched text
      const highlightedContent = line
        .replace(queryRegex, (match) => `<mark>${match}</mark>`);

      matches.push({
        line: lineIndex + 1,
        content: truncateContent(highlightedContent, 100),
        context: truncateContent(line, 100),
        priority: 'content'
      });
    }
  });

  return matches;
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

module.exports = { searchDocuments };
