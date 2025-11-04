const AsyncLock = require('async-lock');
const FileScannerService = require('./file-scanner-service');
const MarkdownRenderer = require('./markdown-renderer');
const CacheStorage = require('./cache-storage');
const fs = require('fs').promises;
const path = require('path');

/**
 * Cache Manager
 * Manages in-memory and disk cache for rendered HTML with request-based scanning
 *
 * @class CacheManager
 */
class CacheManager {
  /**
   * Create a CacheManager instance
   * @param {Object} config - Configuration object
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.memoryCache = new Map();
    this.fileList = [];
    this.lastScanTime = 0;
    this.isScanning = false;
    this.scanThrottle = config.cache.scanThrottle || 500;
    this.lock = new AsyncLock();
    this.scanner = new FileScannerService(config, logger);
    this.renderer = new MarkdownRenderer(logger);
    this.storage = new CacheStorage(config, logger);
  }

  /**
   * Initialize cache manager
   * - Load disk cache (Phase 4)
   * - Scan all files
   * - Pre-render if configured (Phase 4)
   */
  async initialize() {
    this.logger.info('Initializing cache manager...');

    // Phase 4: Initialize cache storage
    await this.storage.initialize();

    // Scan all files
    const files = await this.scanner.scanAllMarkdownFiles();
    this.updateFileList(files);

    this.logger.info('Cache manager initialized', {
      filesScanned: files.length,
      cacheHits: this.memoryCache.size
    });

    // TODO Phase 4: Pre-render if configured
    // if (this.config.cache.preRenderOnStartup) {
    //   this.logger.info('Pre-rendering all files...');
    //   await this.preRenderAll(files);
    // }
  }

  /**
   * Trigger scan if needed (request-based)
   * Respects throttle to prevent excessive scanning
   * @returns {Promise<boolean>} true if scan was triggered
   */
  async triggerScanIfNeeded() {
    // Skip if already scanning
    if (this.isScanning) {
      return false;
    }

    // Check throttle
    const now = Date.now();
    if (now - this.lastScanTime < this.scanThrottle) {
      return false;
    }

    // Start scan
    this.isScanning = true;
    this.lastScanTime = now;

    try {
      await this.performScan();
      return true;
    } catch (error) {
      this.logger.error('Scan failed', { error: error.message });
      return false;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Perform file system scan
   * Updates file list and invalidates changed files
   */
  async performScan() {
    const files = await this.scanner.scanAllMarkdownFiles();
    this.updateFileList(files);
    this.logger.debug('Scan completed', { filesScanned: files.length });
  }

  /**
   * Update file list and invalidate changed files
   * @param {Array} files - Array of file metadata
   */
  updateFileList(files) {
    this.fileList = files;

    for (const file of files) {
      const cached = this.memoryCache.get(file.path);

      // Invalidate if file was modified
      if (cached && cached.mtime < file.mtime) {
        this.logger.debug('Invalidating cache (file modified)', {
          path: file.path,
          oldMtime: cached.mtime,
          newMtime: file.mtime
        });
        this.memoryCache.delete(file.path);
      }
    }
  }

  /**
   * Get cached HTML or render on demand
   * @param {string} filePath - Relative file path
   * @returns {Promise<CacheEntry|null>}
   */
  async getOrRender(filePath) {
    // Check memory cache
    const cached = this.memoryCache.get(filePath);
    if (cached) {
      cached.lastAccessed = Date.now();
      return { ...cached, fromCache: true };
    }

    // Render and cache
    return await this.renderAndCache(filePath);
  }

  /**
   * Render markdown and cache result
   * Uses lock to prevent concurrent rendering of the same file
   * @param {string} filePath - Relative file path
   * @returns {Promise<CacheEntry>}
   */
  async renderAndCache(filePath) {
    return await this.lock.acquire(filePath, async () => {
      // Double-check cache (might have been cached while waiting for lock)
      const cached = this.memoryCache.get(filePath);
      if (cached) {
        cached.lastAccessed = Date.now();
        return { ...cached, fromCache: true };
      }

      // Get file metadata
      let fileInfo = this.fileList.find(f => f.path === filePath);
      if (!fileInfo) {
        // File not in list, try to get info directly
        const absolutePath = path.join(this.config.docsRoot, filePath);
        try {
          const stats = await fs.stat(absolutePath);
          fileInfo = {
            path: filePath,
            absolutePath: absolutePath,
            mtime: stats.mtimeMs,
            size: stats.size
          };
        } catch (error) {
          this.logger.error('File not found', { path: filePath, error: error.message });
          return null;
        }
      }

      // Phase 2: Implement actual rendering with MarkdownRenderer
      this.logger.info('Rendering file', { path: filePath });

      // Read markdown file
      const markdown = await fs.readFile(fileInfo.absolutePath, 'utf-8');

      // Render markdown to HTML
      const { html, toc } = await this.renderer.render(markdown);

      const entry = {
        path: filePath,
        html: html,
        toc: toc,
        mtime: fileInfo.mtime,
        size: fileInfo.size,
        error: null,
        lastAccessed: Date.now(),
        cachedAt: Date.now()
      };

      // Save to memory cache
      this.memoryCache.set(filePath, entry);

      // Phase 4: Check if eviction needed
      this.evictLRUIfNeeded();

      // Phase 4: Save to disk cache (async, don't wait)
      this.storage.saveToFile(filePath, html, toc).catch(error => {
        this.logger.warn('Failed to save cache to disk', { path: filePath, error: error.message });
      });

      return { ...entry, fromCache: false };
    });
  }

  /**
   * Calculate current memory cache size in bytes
   * @returns {number} Total size in bytes
   */
  calculateMemorySize() {
    let totalSize = 0;
    for (const [_, entry] of this.memoryCache.entries()) {
      if (entry.html) {
        totalSize += entry.html.length;
      }
      // Add TOC size (approximate)
      if (entry.toc) {
        totalSize += JSON.stringify(entry.toc).length;
      }
    }
    return totalSize;
  }

  /**
   * Evict least recently used entries if memory limit exceeded
   */
  evictLRUIfNeeded() {
    const maxSize = this.config.cache.maxMemorySize * 1024 * 1024; // Convert MB to bytes
    let currentSize = this.calculateMemorySize();

    // If under limit, no eviction needed
    if (currentSize <= maxSize) {
      return;
    }

    // Get all entries and sort by lastAccessed (oldest first)
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    let evictedCount = 0;

    // Evict oldest entries until under limit
    while (currentSize > maxSize && entries.length > 0) {
      const [key, entry] = entries.shift();

      // Calculate entry size
      const entrySize = (entry.html?.length || 0) + JSON.stringify(entry.toc || []).length;

      // Remove from cache
      this.memoryCache.delete(key);
      currentSize -= entrySize;
      evictedCount++;

      this.logger.debug('Cache evicted (LRU)', {
        key,
        size: entrySize,
        lastAccessed: new Date(entry.lastAccessed).toISOString()
      });
    }

    if (evictedCount > 0) {
      this.logger.info('LRU eviction completed', {
        evictedCount,
        remainingEntries: this.memoryCache.size,
        currentSize: (currentSize / 1024 / 1024).toFixed(2) + ' MB'
      });
    }
  }

  /**
   * Load cache from disk
   * TODO Phase 4: Implement
   * @private
   */
  async loadDiskCache() {
    this.logger.debug('Loading disk cache (not yet implemented)');
  }

  /**
   * Pre-render all files
   * TODO Phase 4: Implement
   * @param {Array} files - Array of file metadata
   * @private
   */
  async preRenderAll(files) {
    this.logger.info('Pre-rendering not yet implemented');
  }
}

module.exports = CacheManager;
