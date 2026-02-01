/**
 * Embedding Notifier Utility
 *
 * Fire-and-forget notifications to ChatbotService when documents change.
 * Provides direct notification as a complement to DocWatcher (chokidar),
 * ensuring embedding updates work even when chokidar is unavailable.
 *
 * All functions are safe to call when chatbotService is null/undefined
 * (chatbot mode disabled). Only .md files trigger notifications.
 */
const path = require('path');
const fs = require('fs').promises;

/**
 * Notify chatbot of document addition or change
 * @param {Object|null} chatbotService
 * @param {Object|null} logger
 * @param {string} absoluteFilePath - Absolute path to the file
 */
function notifyAdd(chatbotService, logger, absoluteFilePath) {
  if (!chatbotService || !absoluteFilePath?.endsWith('.md')) return;
  chatbotService.handleDocumentChange(absoluteFilePath).catch(err => {
    logger?.warn('Embedding notify failed (add)', { path: absoluteFilePath, error: err?.message });
  });
}

/**
 * Notify chatbot of document removal
 * @param {Object|null} chatbotService
 * @param {Object|null} logger
 * @param {string} absoluteFilePath - Absolute path to the file
 */
function notifyRemove(chatbotService, logger, absoluteFilePath) {
  if (!chatbotService || !absoluteFilePath?.endsWith('.md')) return;
  chatbotService.handleDocumentRemove(absoluteFilePath).catch(err => {
    logger?.warn('Embedding notify failed (remove)', { path: absoluteFilePath, error: err?.message });
  });
}

/**
 * Notify chatbot of document rename/move (remove old + add new)
 * @param {Object|null} chatbotService
 * @param {Object|null} logger
 * @param {string} oldAbsolutePath
 * @param {string} newAbsolutePath
 */
function notifyMove(chatbotService, logger, oldAbsolutePath, newAbsolutePath) {
  if (!chatbotService) return;
  notifyRemove(chatbotService, logger, oldAbsolutePath);
  notifyAdd(chatbotService, logger, newAbsolutePath);
}

/**
 * Notify chatbot of batch document removal
 * @param {Object|null} chatbotService
 * @param {Object|null} logger
 * @param {string[]} absolutePaths - Array of absolute file paths
 */
function notifyBatchRemove(chatbotService, logger, absolutePaths) {
  if (!chatbotService || !absolutePaths?.length) return;
  for (const p of absolutePaths) {
    notifyRemove(chatbotService, logger, p);
  }
}

/**
 * Recursively collect .md file paths within a directory (or single file).
 * Call this BEFORE deletion to capture paths for post-delete notification.
 * @param {string} dirPath - Absolute path to file or directory
 * @returns {Promise<string[]>} Array of absolute .md file paths
 */
async function collectMdFiles(dirPath) {
  const results = [];
  try {
    const stats = await fs.stat(dirPath);
    if (stats.isFile()) {
      if (dirPath.endsWith('.md')) results.push(dirPath);
      return results;
    }
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...await collectMdFiles(full));
      } else if (entry.name.endsWith('.md')) {
        results.push(full);
      }
    }
  } catch {
    // Directory/file not found — return empty
  }
  return results;
}

module.exports = {
  notifyAdd,
  notifyRemove,
  notifyMove,
  notifyBatchRemove,
  collectMdFiles
};
