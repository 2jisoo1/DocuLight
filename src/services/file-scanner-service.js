const fs = require('fs').promises;
const path = require('path');

/**
 * File Scanner Service
 * Recursively scans directory for markdown files with metadata collection
 *
 * @class FileScannerService
 */
class FileScannerService {
  /**
   * Create a FileScannerService instance
   * @param {Object} config - Configuration object
   * @param {string} config.docsRoot - Root directory to scan
   * @param {Array<string>} config.excludes - Patterns to exclude
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.docsRoot = config.docsRoot;
    this.excludes = config.excludes || [];
  }

  /**
   * Scan all markdown files in docsRoot recursively
   * @returns {Promise<Array<FileMetadata>>} Array of file metadata objects
   */
  async scanAllMarkdownFiles() {
    const files = [];
    await this._scanRecursive(this.docsRoot, '', files);
    return files;
  }

  /**
   * Recursive scan helper
   * @private
   * @param {string} dir - Current directory absolute path
   * @param {string} relativePath - Current relative path from docsRoot
   * @param {Array} files - Accumulator array for results
   */
  async _scanRecursive(dir, relativePath, files) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      this.logger.error('Failed to read directory', { dir, error: error.message });
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      // Check exclude patterns
      if (this._shouldExclude(relPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recursively scan subdirectory
        await this._scanRecursive(fullPath, relPath, files);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Collect markdown file metadata
        try {
          const stats = await fs.stat(fullPath);
          files.push({
            path: relPath,
            absolutePath: fullPath,
            mtime: stats.mtimeMs,
            size: stats.size,
            isCached: false
          });
        } catch (error) {
          this.logger.warn('Failed to stat file', { path: relPath, error: error.message });
        }
      }
    }
  }

  /**
   * Check if path should be excluded based on patterns
   * @private
   * @param {string} relPath - Relative path to check
   * @returns {boolean} True if path should be excluded
   */
  _shouldExclude(relPath) {
    // Normalize path separators for consistent matching
    const normalizedPath = relPath.replace(/\\/g, '/');

    for (const pattern of this.excludes) {
      // Simple string matching for now (can be enhanced with ignore library later)
      if (normalizedPath.includes(pattern)) {
        return true;
      }
    }
    return false;
  }
}

module.exports = FileScannerService;
