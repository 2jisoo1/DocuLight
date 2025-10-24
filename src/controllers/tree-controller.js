const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { validatePath } = require('../utils/path-validator');

/**
 * Get directory tree structure
 */
async function getTree(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const userPath = req.query.path || '/';

    // Validate path
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
        files.push({
          name: entry.name,
          size: fileStats.size
        });
      }
    }

    // Sort alphabetically
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    logger.info('Tree retrieved', {
      path: userPath,
      dirs: dirs.length,
      files: files.length
    });

    res.json({
      path: userPath,
      dirs,
      files,
      excludesApplied: true
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get full recursive tree structure starting from docsRoot
 */
async function getFullTree(req, res, next) {
  try {
    const { config, logger } = req.app.locals;

    // Create ignore filter
    const ig = ignore().add(config.excludes);

    // Build recursive tree
    const tree = await buildTreeRecursive(config.docsRoot, config.docsRoot, ig);

    const totalFiles = countFiles(tree);
    const totalDirs = countDirs(tree);

    logger.info('Full tree retrieved', {
      totalFiles,
      totalDirs
    });

    res.json({
      root: tree,
      docsRoot: config.docsRoot,
      excludesApplied: true,
      stats: {
        totalFiles,
        totalDirs
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Recursively build tree structure
 * @param {string} rootPath - Root documents directory
 * @param {string} currentPath - Current directory being processed
 * @param {Object} ig - Ignore filter instance
 * @returns {Object} Tree structure with dirs and files
 */
async function buildTreeRecursive(rootPath, currentPath, ig) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  const dirs = [];
  const files = [];

  for (const entry of entries) {
    // Skip hidden files
    if (entry.name.startsWith('.')) {
      continue;
    }

    // Get relative path for exclude check
    const relativePath = path.relative(rootPath, path.join(currentPath, entry.name));

    // Check if excluded
    if (ig.ignores(relativePath)) {
      continue;
    }

    const fullPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      // Recursively build subdirectory tree
      const subTree = await buildTreeRecursive(rootPath, fullPath, ig);
      dirs.push({
        name: entry.name,
        path: '/' + relativePath.replace(/\\/g, '/'),
        type: 'directory',
        ...subTree
      });
    } else if (entry.isFile()) {
      const fileStats = await fs.stat(fullPath);
      files.push({
        name: entry.name,
        path: '/' + relativePath.replace(/\\/g, '/'),
        type: 'file',
        size: fileStats.size
      });
    }
  }

  // Sort alphabetically
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return { dirs, files };
}

/**
 * Helper function to count total files in tree
 * @param {Object} tree - Tree structure
 * @returns {number} Total number of files
 */
function countFiles(tree) {
  let count = tree.files.length;
  for (const dir of tree.dirs) {
    count += countFiles(dir);
  }
  return count;
}

/**
 * Helper function to count total directories in tree
 * @param {Object} tree - Tree structure
 * @returns {number} Total number of directories
 */
function countDirs(tree) {
  let count = tree.dirs.length;
  for (const dir of tree.dirs) {
    count += countDirs(dir);
  }
  return count;
}

module.exports = { getTree, getFullTree };
