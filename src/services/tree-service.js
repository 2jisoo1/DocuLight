const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { validatePath } = require('../utils/path-validator');
const { parseFrontmatterFromFile } = require('./frontmatter-service');

/**
 * Tree Service - Directory tree operations
 */

/**
 * Get directory tree structure
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} userPath - User-provided path (default: '/')
 * @returns {Promise<Object>} Tree data with dirs and files
 */
async function getTreeData(config, logger, userPath = '/') {
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

      // Parse frontmatter only for .md files
      let displayName = null;
      let description = null;
      if (entry.name.endsWith('.md')) {
        const frontmatter = await parseFrontmatterFromFile(filePath);
        displayName = frontmatter.name;
        description = frontmatter.description;
      }

      files.push({
        name: entry.name,
        displayName,
        description,
        size: fileStats.size
      });
    }
  }

  // Sort naturally (numeric-aware, like Obsidian)
  dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  logger.info('Tree retrieved', {
    path: userPath,
    dirs: dirs.length,
    files: files.length
  });

  return {
    path: userPath,
    dirs,
    files,
    excludesApplied: true
  };
}

/**
 * Get full recursive tree structure
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} startPath - Starting directory path (default: '/')
 * @param {Object} options - Options { maxDepth?: number }
 * @returns {Promise<Object>} Recursive tree with stats
 */
async function getFullTreeData(config, logger, startPath = '/', options = {}) {
  const { maxDepth } = options;

  // Validate and convert to absolute path
  const absoluteStart = validatePath(config.docsRoot, startPath);
  const stats = await fs.stat(absoluteStart);
  if (!stats.isDirectory()) {
    const error = new Error('NOT_FOUND: Start path is not a directory');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const ig = ignore().add(config.excludes);

  // Internal recursive function
  async function buildRecursive(rootPath, currentAbsolute, currentRelative, depth) {
    // Check depth limit
    if (typeof maxDepth === 'number' && depth > maxDepth) {
      return { dirs: [], files: [] };
    }

    const entries = await fs.readdir(currentAbsolute, { withFileTypes: true });
    const dirs = [];
    const files = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // Skip hidden files

      const entryAbsolute = path.join(currentAbsolute, entry.name);
      const relativePath = path.relative(config.docsRoot, entryAbsolute);

      if (ig.ignores(relativePath)) continue; // Apply exclude rules

      if (entry.isDirectory()) {
        const subTree = await buildRecursive(rootPath, entryAbsolute, '/' + relativePath.replace(/\\/g, '/'), depth + 1);
        dirs.push({
          name: entry.name,
          path: '/' + relativePath.replace(/\\/g, '/'),
          type: 'directory',
          ...subTree
        });
      } else if (entry.isFile()) {
        const fileStats = await fs.stat(entryAbsolute);

        // Parse frontmatter only for .md files
        let displayName = null;
        let description = null;
        if (entry.name.endsWith('.md')) {
          const frontmatter = await parseFrontmatterFromFile(entryAbsolute);
          displayName = frontmatter.name;
          description = frontmatter.description;
        }

        files.push({
          name: entry.name,
          displayName,
          description,
          path: '/' + relativePath.replace(/\\/g, '/'),
          type: 'file',
          size: fileStats.size
        });
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return { dirs, files };
  }

  // Helper functions to count files and dirs
  function countFiles(tree) {
    let count = tree.files.length;
    for (const d of tree.dirs) count += countFiles(d);
    return count;
  }

  function countDirs(tree) {
    let count = tree.dirs.length;
    for (const d of tree.dirs) count += countDirs(d);
    return count;
  }

  const rootTree = await buildRecursive(config.docsRoot, absoluteStart, startPath, 0);
  const totalFiles = countFiles(rootTree);
  const totalDirs = countDirs(rootTree);

  logger.info('Full tree data retrieved', {
    startPath,
    totalFiles,
    totalDirs,
    maxDepth: typeof maxDepth === 'number' ? maxDepth : 'unlimited'
  });

  return {
    root: rootTree,
    docsRoot: config.docsRoot,
    startPath,
    excludesApplied: true,
    options: { maxDepth },
    stats: { totalFiles, totalDirs }
  };
}

module.exports = {
  getTreeData,
  getFullTreeData
};
