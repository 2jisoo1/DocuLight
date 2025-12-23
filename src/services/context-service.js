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

module.exports = { getContextDocuments, getDocumentContent };
