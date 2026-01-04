/**
 * Context Service
 *
 * description이 있는 문서만 제공
 * AI 에이전트용 문서 컨텍스트 조회
 */

const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { validatePath } = require('../utils/path-validator');
const { parseFrontmatterFromFile, parseFrontmatter } = require('./frontmatter-service');

/**
 * Get all documents with description metadata (recursive)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} userPath - Starting directory path
 * @returns {Promise<Array<{ path: string, name: string, description: string }>>}
 */
async function getContextDocuments(config, logger, userPath = '/') {
  const absolutePath = validatePath(config.docsRoot, userPath);
  const ig = ignore().add(config.excludes);
  const results = [];

  async function scanRecursive(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    const promises = entries.map(async (entry) => {
      if (entry.name.startsWith('.')) return;

      const entryAbsolute = path.join(currentPath, entry.name);
      const relativePath = path.relative(config.docsRoot, entryAbsolute);

      if (ig.ignores(relativePath)) return;

      if (entry.isDirectory()) {
        await scanRecursive(entryAbsolute);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const frontmatter = await parseFrontmatterFromFile(entryAbsolute);

        // Only include documents with description
        if (frontmatter.description) {
          results.push({
            path: '/' + relativePath.replace(/\\/g, '/'),
            name: frontmatter.name || entry.name.replace(/\.md$/, ''),
            description: frontmatter.description
          });
        }
      }
    });

    await Promise.allSettled(promises);
  }

  await scanRecursive(absolutePath);

  // Sort by path
  results.sort((a, b) => a.path.localeCompare(b.path));

  logger.info('Context documents retrieved', {
    path: userPath,
    count: results.length
  });

  return results;
}

/**
 * Get raw document content (without frontmatter)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} userPath - Document path
 * @returns {Promise<string>}
 */
async function getDocumentContent(config, logger, userPath) {
  // Remove leading slash for validatePath (except for root '/')
  const normalizedPath = (userPath && userPath !== '/' && userPath.startsWith('/'))
    ? userPath.slice(1)
    : userPath;
  const absolutePath = validatePath(config.docsRoot, normalizedPath);

  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) {
    const error = new Error('NOT_FOUND: Path is not a file');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const content = await fs.readFile(absolutePath, 'utf-8');
  const parsed = parseFrontmatter(content);

  logger.info('Document content retrieved', {
    path: userPath,
    size: content.length
  });

  return parsed.content;
}

/**
 * Search for text across all markdown documents
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} query - Search keyword
 * @param {Object} options - Search options
 * @returns {Promise<{ query, total_matches, total_files, truncated, results }>}
 */
async function searchDocuments(config, logger, query, options = {}) {
  // ============ 1. Input Validation ============
  const trimmedQuery = (query || '').trim();
  if (trimmedQuery.length === 0) {
    throw new Error('query is required and must not be empty');
  }
  if (trimmedQuery.length > 200) {
    throw new Error('query must be 200 characters or less');
  }

  // ============ 2. Sanitize Options ============
  const contextChars = Math.min(Math.max(parseInt(options.context_chars) || 50, 10), 500);
  const maxResultsPerFile = Math.min(Math.max(parseInt(options.max_results) || 10, 1), 100);
  const caseSensitive = options.case_sensitive === true;
  const searchPath = options.path || '/';

  // ============ 3. Path Normalization (consistent with getDocumentContent) ============
  const normalizedPath = (searchPath && searchPath !== '/' && searchPath.startsWith('/'))
    ? searchPath.slice(1)
    : searchPath;

  // ============ 4. Global Limits ============
  const MAX_TOTAL_MATCHES = 500;
  const MAX_FILES_TO_SEARCH = 1000;

  const absolutePath = validatePath(config.docsRoot, normalizedPath);
  const ig = ignore().add(config.excludes);
  const results = [];
  let totalMatches = 0;
  let filesSearched = 0;
  let truncated = false;

  const searchQuery = caseSensitive ? trimmedQuery : trimmedQuery.toLowerCase();

  // ============ 5. File Search Function ============
  async function searchInFile(filePath, relativePath) {
    if (totalMatches >= MAX_TOTAL_MATCHES || filesSearched >= MAX_FILES_TO_SEARCH) {
      truncated = true;
      return;
    }
    filesSearched++;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const frontmatter = parseFrontmatter(content);
      const textContent = frontmatter.content;

      if (!textContent || textContent.length === 0) return;

      const lines = textContent.split(/\r?\n/);
      const matches = [];
      let lineNumber = 0;
      let charOffset = 0;

      for (const line of lines) {
        lineNumber++;
        const searchLine = caseSensitive ? line : line.toLowerCase();
        let searchIndex = 0;

        while ((searchIndex = searchLine.indexOf(searchQuery, searchIndex)) !== -1) {
          if (matches.length >= maxResultsPerFile) break;
          if (totalMatches + matches.length >= MAX_TOTAL_MATCHES) {
            truncated = true;
            break;
          }

          // Context extraction
          const globalStart = charOffset + searchIndex;
          const contextStart = Math.max(0, globalStart - contextChars);
          const contextEnd = Math.min(textContent.length, globalStart + trimmedQuery.length + contextChars);
          let excerpt = textContent.slice(contextStart, contextEnd);

          if (contextStart > 0) excerpt = '...' + excerpt;
          if (contextEnd < textContent.length) excerpt = excerpt + '...';

          // Highlight match
          const matchStart = globalStart - contextStart + (contextStart > 0 ? 3 : 0);
          const matchEnd = matchStart + trimmedQuery.length;
          excerpt = excerpt.slice(0, matchStart) + '**' +
                   excerpt.slice(matchStart, matchEnd) + '**' +
                   excerpt.slice(matchEnd);

          matches.push({
            line: lineNumber,
            excerpt: excerpt.replace(/\r?\n/g, ' ')
          });
          searchIndex += trimmedQuery.length;
        }

        charOffset += line.length + 1;
        if (matches.length >= maxResultsPerFile || truncated) break;
      }

      if (matches.length > 0) {
        totalMatches += matches.length;
        results.push({
          path: '/' + relativePath.replace(/\\/g, '/'),
          name: frontmatter.name || path.basename(filePath, '.md'),
          match_count: matches.length,
          matches
        });
      }
    } catch (error) {
      logger.warn('Search file error', { path: relativePath, error: error.message });
    }
  }

  // ============ 6. Sequential Directory Scan ============
  async function scanRecursive(currentPath) {
    if (totalMatches >= MAX_TOTAL_MATCHES || filesSearched >= MAX_FILES_TO_SEARCH) {
      truncated = true;
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      logger.warn('Directory read error', { path: currentPath, error: error.message });
      return;
    }

    for (const entry of entries) {
      if (totalMatches >= MAX_TOTAL_MATCHES || filesSearched >= MAX_FILES_TO_SEARCH) {
        truncated = true;
        break;
      }
      if (entry.name.startsWith('.')) continue;

      const entryAbsolute = path.join(currentPath, entry.name);
      const relativePath = path.relative(config.docsRoot, entryAbsolute);
      if (ig.ignores(relativePath)) continue;

      if (entry.isDirectory()) {
        await scanRecursive(entryAbsolute);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        await searchInFile(entryAbsolute, relativePath);
      }
    }
  }

  await scanRecursive(absolutePath);
  results.sort((a, b) => b.match_count - a.match_count);

  logger.info('Document search completed', {
    query: trimmedQuery,
    total_matches: totalMatches,
    total_files: results.length,
    truncated
  });

  return { query: trimmedQuery, total_matches: totalMatches, total_files: results.length, truncated, results };
}

module.exports = { getContextDocuments, getDocumentContent, searchDocuments };
