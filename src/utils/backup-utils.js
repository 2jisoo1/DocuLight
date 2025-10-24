const fs = require('fs');
const path = require('path');

/**
 * Create an atomic backup of a file.
 * Writes to a temporary file in the same directory and renames it into place.
 * Throws on error.
 */
function createBackup(srcPath, backupPath) {
  const dir = path.dirname(backupPath);
  const tmp = path.join(dir, `.tmp-${Date.now()}-${path.basename(backupPath)}`);

  // Ensure source exists
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Source config not found: ${srcPath}`);
  }

  // Copy to tmp file then rename for (mostly) atomic behavior
  fs.copyFileSync(srcPath, tmp);

  // If backupPath exists, remove it first (rename on Windows doesn't overwrite)
  if (fs.existsSync(backupPath)) {
    try {
      fs.unlinkSync(backupPath);
    } catch (e) {
      // ignore and try rename
    }
  }

  fs.renameSync(tmp, backupPath);
}

/**
 * Restore backup to given config path (atomic-ish via tmp+rename).
 */
function restoreBackup(backupPath, destPath) {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${backupPath}`);
  }

  const dir = path.dirname(destPath);
  const tmp = path.join(dir, `.tmp-${Date.now()}-${path.basename(destPath)}`);

  fs.copyFileSync(backupPath, tmp);

  // Remove existing destination if present
  if (fs.existsSync(destPath)) {
    try {
      fs.unlinkSync(destPath);
    } catch (e) {
      // ignore
    }
  }

  fs.renameSync(tmp, destPath);
}

function removeBackup(backupPath) {
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
}

module.exports = { createBackup, restoreBackup, removeBackup };
