const fs = require('fs').promises;
const path = require('path');

/**
 * Cache Storage Service
 * Manages disk-based cache persistence
 *
 * @class CacheStorage
 */
class CacheStorage {
  /**
   * Create a CacheStorage instance
   * @param {Object} config - Configuration object
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.cacheDir = config.cache.cacheDir || './.cache';
    this.htmlDir = path.join(this.cacheDir, 'html');
    this.tocDir = path.join(this.cacheDir, 'toc');
    this.manifestPath = path.join(this.cacheDir, 'manifest.json');
  }

  /**
   * Initialize cache directories
   */
  async initialize() {
    try {
      await fs.mkdir(this.htmlDir, { recursive: true });
      await fs.mkdir(this.tocDir, { recursive: true });
      this.logger.info('Cache storage initialized', { cacheDir: this.cacheDir });
    } catch (error) {
      this.logger.error('Failed to initialize cache storage', {
        error: error.message,
        cacheDir: this.cacheDir
      });
      throw error;
    }
  }

  /**
   * Save HTML and TOC cache to disk
   * @param {string} filePath - Relative file path (e.g., "guide/intro.md")
   * @param {string} html - Rendered HTML content
   * @param {Array} toc - Table of contents data
   */
  async saveToFile(filePath, html, toc) {
    try {
      // Convert .md to .html/.json
      const htmlPath = path.join(this.htmlDir, filePath.replace(/\.md$/, '.html'));
      const tocPath = path.join(this.tocDir, filePath.replace(/\.md$/, '.json'));

      // Ensure parent directories exist
      await fs.mkdir(path.dirname(htmlPath), { recursive: true });
      await fs.mkdir(path.dirname(tocPath), { recursive: true });

      // Save HTML
      await fs.writeFile(htmlPath, html, 'utf-8');

      // Save TOC
      await fs.writeFile(tocPath, JSON.stringify(toc, null, 2), 'utf-8');

      this.logger.debug('Cache saved to disk', { path: filePath });
    } catch (error) {
      this.logger.error('Failed to save cache to disk', {
        path: filePath,
        error: error.message
      });
      // Don't throw - cache save failure shouldn't break the application
    }
  }

  /**
   * Load HTML and TOC cache from disk
   * @param {string} filePath - Relative file path (e.g., "guide/intro.md")
   * @returns {Promise<{html: string, toc: Array}|null>} Cache data or null if not found
   */
  async loadFromDisk(filePath) {
    try {
      const htmlPath = path.join(this.htmlDir, filePath.replace(/\.md$/, '.html'));
      const tocPath = path.join(this.tocDir, filePath.replace(/\.md$/, '.json'));

      // Read both files
      const html = await fs.readFile(htmlPath, 'utf-8');
      const tocData = await fs.readFile(tocPath, 'utf-8');
      const toc = JSON.parse(tocData);

      this.logger.debug('Cache loaded from disk', { path: filePath });

      return { html, toc };
    } catch (error) {
      // Cache miss or read error (not an error condition)
      this.logger.debug('Cache miss on disk', { path: filePath });
      return null;
    }
  }

  /**
   * Load manifest file
   * @returns {Promise<Object>} Manifest data
   */
  async loadManifest() {
    try {
      const data = await fs.readFile(this.manifestPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // No manifest or parse error - return default
      this.logger.debug('No manifest found, using default');
      return {
        version: 1,
        lastUpdated: Date.now(),
        files: []
      };
    }
  }

  /**
   * Save manifest file
   * @param {Object} manifest - Manifest data
   */
  async saveManifest(manifest) {
    try {
      await fs.writeFile(
        this.manifestPath,
        JSON.stringify(manifest, null, 2),
        'utf-8'
      );
      this.logger.debug('Manifest saved', {
        fileCount: manifest.files?.length || 0
      });
    } catch (error) {
      this.logger.error('Failed to save manifest', {
        error: error.message
      });
      // Don't throw - manifest save failure shouldn't break the application
    }
  }

  /**
   * Delete cache files for a specific path
   * @param {string} filePath - Relative file path
   */
  async deleteCache(filePath) {
    try {
      const htmlPath = path.join(this.htmlDir, filePath.replace(/\.md$/, '.html'));
      const tocPath = path.join(this.tocDir, filePath.replace(/\.md$/, '.json'));

      await fs.unlink(htmlPath).catch(() => {}); // Ignore if doesn't exist
      await fs.unlink(tocPath).catch(() => {});

      this.logger.debug('Cache deleted from disk', { path: filePath });
    } catch (error) {
      this.logger.error('Failed to delete cache from disk', {
        path: filePath,
        error: error.message
      });
    }
  }
}

module.exports = CacheStorage;
