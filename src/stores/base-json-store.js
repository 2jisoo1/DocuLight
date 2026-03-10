const fs = require('fs');
const path = require('path');
const lockManager = require('../utils/lock-manager');

class BaseJsonStore {
  constructor(filePath, defaultData = {}) {
    this.filePath = filePath;
    this.defaultData = defaultData;
    this.lockKey = `store:${path.basename(filePath)}`;
  }

  /**
   * Load data from JSON file. Returns defaultData if file doesn't exist.
   * @returns {Object} Parsed JSON data
   */
  load() {
    if (!fs.existsSync(this.filePath)) {
      return JSON.parse(JSON.stringify(this.defaultData));
    }
    const content = fs.readFileSync(this.filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Save data to JSON file atomically (temp file → rename).
   * Uses async-lock to prevent concurrent writes.
   * @param {Object} data - Data to save
   */
  async save(data) {
    await lockManager.acquire(this.lockKey, async () => {
      data.updatedAt = new Date().toISOString();

      // Backup existing file
      if (fs.existsSync(this.filePath)) {
        const bakPath = this.filePath + '.bak';
        fs.copyFileSync(this.filePath, bakPath);
      }

      // Atomic write: temp file → rename
      const tmpPath = this.filePath + '.tmp';
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    });
  }
}

module.exports = BaseJsonStore;
