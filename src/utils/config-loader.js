const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');
const { validateIpPattern } = require('./ip-matcher.js');
const { validateSSL } = require('./ssl-validator.js');

/**
 * Load and validate configuration from config.json5
 * @returns {Object} Validated configuration object
 * @throws {Error} If configuration is invalid or missing
 */
function loadConfig() {
  const configPath = path.join(process.cwd(), 'config.json5');

  // Check if config file exists
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Configuration file not found: ${configPath}\n` +
      'Please copy config.example.json5 to config.json5 and configure it.'
    );
  }

  // Read and parse JSON5 config
  let config;
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    config = JSON5.parse(configContent);
  } catch (error) {
    throw new Error(`Failed to parse config.json5: ${error.message}`);
  }

  // Validate required fields
  if (!config.docsRoot) {
    throw new Error('Configuration error: docsRoot is required');
  }

  if (!config.apiKey || config.apiKey === 'CHANGE_THIS_TO_SECURE_KEY') {
    throw new Error(
      'Configuration error: apiKey must be set to a secure value.\n' +
      'Please update config.json5 with a strong API key.'
    );
  }

  // Validate docsRoot exists and is a directory
  const docsRoot = path.resolve(config.docsRoot);
  try {
    const stats = fs.statSync(docsRoot);
    if (!stats.isDirectory()) {
      throw new Error(`docsRoot is not a directory: ${docsRoot}`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`docsRoot directory does not exist: ${docsRoot}`);
    }
    throw new Error(`Cannot access docsRoot: ${error.message}`);
  }

  // Set defaults for optional fields
  config.maxUploadMB = config.maxUploadMB || 10;
  config.port = config.port || 3000;
  config.excludes = config.excludes || [];
  config.logDir = config.logDir || './logs';
  config.logLevel = config.logLevel || 'info';

  // Set defaults for UI settings
  config.ui = config.ui || {};
  config.ui.title = config.ui.title || 'DocLight';
  config.ui.icon = config.ui.icon || '/images/icon.png';

  // Resolve and validate index file paths
  if (config.ui.indexFile) {
    const indexPath = resolveIndexPath(config.ui.indexFile, config.docsRoot);
    if (indexPath && fs.existsSync(indexPath) && indexPath.endsWith('.md')) {
      config.ui.resolvedIndexFile = indexPath;
      console.log(`Index file configured: ${config.ui.indexFile}`);
    } else {
      console.warn(`Index file not found or invalid: ${config.ui.indexFile}, using default welcome screen`);
      config.ui.resolvedIndexFile = null;
    }
  } else {
    config.ui.resolvedIndexFile = null;
  }

  // Resolve API index file
  if (config.ui.apiIndexFile) {
    const apiIndexPath = resolveDocPath(config.ui.apiIndexFile);
    if (fs.existsSync(apiIndexPath)) {
      config.ui.resolvedApiIndexFile = apiIndexPath;
    } else {
      console.warn(`API index file not found: ${config.ui.apiIndexFile}, using default`);
      config.ui.resolvedApiIndexFile = null;
    }
  } else {
    config.ui.resolvedApiIndexFile = null;
  }

  // Resolve MCP index file
  if (config.ui.mcpIndexFile) {
    const mcpIndexPath = resolveDocPath(config.ui.mcpIndexFile);
    if (fs.existsSync(mcpIndexPath)) {
      config.ui.resolvedMcpIndexFile = mcpIndexPath;
    } else {
      console.warn(`MCP index file not found: ${config.ui.mcpIndexFile}, using default`);
      config.ui.resolvedMcpIndexFile = null;
    }
  } else {
    config.ui.resolvedMcpIndexFile = null;
  }

  // Validate maxUploadMB range
  if (config.maxUploadMB < 1 || config.maxUploadMB > 1000) {
    console.warn(
      `Warning: maxUploadMB (${config.maxUploadMB}) is outside recommended range (1-1000). ` +
      'Using default value of 10MB.'
    );
    config.maxUploadMB = 10;
  }

  // Validate excludes array
  if (!Array.isArray(config.excludes)) {
    console.warn('Warning: excludes must be an array. Using empty array.');
    config.excludes = [];
  }

  // Filter out non-string excludes
  const originalLength = config.excludes.length;
  config.excludes = config.excludes.filter(item => typeof item === 'string');
  if (config.excludes.length < originalLength) {
    console.warn(
      `Warning: Removed ${originalLength - config.excludes.length} non-string items from excludes array.`
    );
  }

  // Ensure logDir exists
  const logDir = path.resolve(config.logDir);
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      console.log(`Created log directory: ${logDir}`);
    } catch (error) {
      throw new Error(`Failed to create log directory: ${error.message}`);
    }
  }

  // Store resolved absolute paths
  config.docsRoot = docsRoot;
  config.logDir = logDir;

  // Security 설정 검증
  if (config.security) {
    if (config.security.allows) {
      if (!Array.isArray(config.security.allows)) {
        throw new Error('security.allows must be an array');
      }

      // 각 IP 패턴 검증
      for (const pattern of config.security.allows) {
        if (!validateIpPattern(pattern)) {
          throw new Error(`Invalid IP pattern: ${pattern}`);
        }
      }

      console.log(`IP whitelist enabled: ${config.security.allows.length} patterns`);
    }
  }

  // Hot-reload related defaults
  config.hotReload = config.hotReload || {};
  // Whether allow automatic restart when port/SSL change
  config.hotReload.allowPortSslAutoRestart = !!config.hotReload.allowPortSslAutoRestart;

  // SSL 설정 검증
  if (config.ssl && config.ssl.enabled) {
    console.log('SSL/TLS enabled, validating certificates...');

    const validation = validateSSL(config.ssl);

    if (!validation.valid) {
      const msg = '\n❌ SSL Validation Failed:\n' + validation.errors.map(e => `  • ${e}`).join('\n');
      console.error(msg);
      // Throw an error instead of exiting the process so callers can handle rollback/restart
      throw new Error('SSL Validation Failed: ' + validation.errors.join('; '));
    }

    console.log('✅ SSL certificates validated successfully');
  }

  return config;
}

/**
 * Resolve index file path (relative to docsRoot)
 * @param {string} indexPath - Index file path from config
 * @param {string} docsRoot - Documents root directory
 * @returns {string|null} Resolved absolute path or null
 */
function resolveIndexPath(indexPath, docsRoot) {
  if (!indexPath) return null;

  // If absolute path, return as-is
  if (path.isAbsolute(indexPath)) {
    return indexPath;
  }

  // Remove leading slash if present for path.join
  const cleanPath = indexPath.startsWith('/') ? indexPath.slice(1) : indexPath;

  // Resolve relative to docsRoot
  return path.join(docsRoot, cleanPath);
}

/**
 * Resolve documentation file path (relative to project root)
 * @param {string} docPath - Documentation file path from config
 * @returns {string} Resolved absolute path
 */
function resolveDocPath(docPath) {
  if (!docPath) return null;

  // If absolute path, return as-is
  if (path.isAbsolute(docPath)) {
    return docPath;
  }

  // Remove leading slash if present
  const cleanPath = docPath.startsWith('/') ? docPath.slice(1) : docPath;

  // Resolve relative to project root
  return path.join(process.cwd(), cleanPath);
}

module.exports = { loadConfig };
