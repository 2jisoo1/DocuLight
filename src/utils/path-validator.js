const path = require('path');

/**
 * Validate that a resolved path is within the allowed root directory
 * Prevents path traversal attacks
 *
 * @param {string} rootPath - The allowed root directory (absolute path)
 * @param {string} userPath - User-provided path (can be relative)
 * @returns {string} Validated absolute path
 * @throws {Error} If path is outside root or invalid
 */
function validatePath(rootPath, userPath) {
  // Normalize root path
  const normalizedRoot = path.resolve(rootPath);

  // Handle special cases
  if (!userPath || userPath === '/' || userPath === '.') {
    return normalizedRoot;
  }

  // Handle paths starting with '/' as relative to docRoot
  // This allows API paths like '/test.md' to mean 'docRoot/test.md'
  let normalizedUserPath = userPath;
  if (userPath.startsWith('/')) {
    normalizedUserPath = userPath.substring(1);
  }

  // Reject truly absolute paths (with drive letters on Windows or not starting with /)
  if (path.isAbsolute(normalizedUserPath)) {
    const error = new Error('PATH_TRAVERSAL: Absolute paths are not allowed');
    error.code = 'PATH_TRAVERSAL';
    throw error;
  }

  // Normalize and resolve the path
  const resolvedPath = path.resolve(rootPath, normalizedUserPath);

  // Check if resolved path starts with root path
  if (!resolvedPath.startsWith(normalizedRoot + path.sep) && resolvedPath !== normalizedRoot) {
    const error = new Error('PATH_TRAVERSAL: Access outside docsRoot is not allowed');
    error.code = 'PATH_VIOLATION';
    throw error;
  }

  return resolvedPath;
}

/**
 * Get relative path from root
 * @param {string} rootPath - The root directory
 * @param {string} absolutePath - Absolute path to convert
 * @returns {string} Relative path from root
 */
function getRelativePath(rootPath, absolutePath) {
  return path.relative(rootPath, absolutePath) || '/';
}

/**
 * Check if path is within root (boolean version)
 * @param {string} rootPath - The root directory
 * @param {string} testPath - Path to test
 * @returns {boolean} True if path is within root
 */
function isWithinRoot(rootPath, testPath) {
  try {
    const resolved = path.resolve(testPath);
    return resolved.startsWith(rootPath);
  } catch {
    return false;
  }
}

module.exports = {
  validatePath,
  getRelativePath,
  isWithinRoot
};
