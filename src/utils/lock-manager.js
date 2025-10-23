const AsyncLock = require('async-lock');

/**
 * Lock manager for file system operations
 * Prevents concurrent modifications to the same path
 */
class LockManager {
  constructor(options = {}) {
    this.lock = new AsyncLock({
      timeout: options.timeout || 10000, // 10 seconds default
      maxPending: options.maxPending || 1000
    });
  }

  /**
   * Acquire lock and execute function
   * @param {string} key - Lock key (usually absolute path)
   * @param {Function} fn - Async function to execute while holding lock
   * @param {Object} options - Lock options
   * @returns {Promise<any>} Result of fn
   */
  async acquire(key, fn, options = {}) {
    const maxRetries = options.maxRetries || 5;
    const retryDelay = options.retryDelay || 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.lock.acquire(key, fn);
      } catch (error) {
        if (error.message.includes('timeout') && attempt < maxRetries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        // Convert timeout errors to conflict errors
        if (error.message.includes('timeout')) {
          const lockError = new Error('LOCK_TIMEOUT: Resource is locked by another operation');
          lockError.code = 'LOCK_TIMEOUT';
          throw lockError;
        }

        throw error;
      }
    }
  }

  /**
   * Check if a key is currently locked
   * @param {string} key - Lock key to check
   * @returns {boolean} True if locked
   */
  isLocked(key) {
    return this.lock.isBusy(key);
  }
}

// Singleton instance
const lockManager = new LockManager();

module.exports = lockManager;
