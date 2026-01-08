const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');
const { validateIpPattern } = require('./ip-matcher.js');
const { validateSSL } = require('./ssl-validator.js');

/**
 * Normalize API keys configuration for backward compatibility.
 * Converts single apiKey to apiKeys array format.
 * @param {Object} config - Configuration object
 * @returns {Object} Configuration with normalized apiKeys
 */
function normalizeApiKeys(config) {
  // If apiKeys already exists, use it
  if (config.apiKeys && Array.isArray(config.apiKeys)) {
    return config;
  }

  // Convert single apiKey to apiKeys array (backward compatibility)
  if (config.apiKey) {
    config.apiKeys = [{
      key: config.apiKey,
      name: 'Default Admin',
      permissions: ['read', 'write', 'delete']
    }];
  }

  return config;
}

/**
 * Validate apiKeys configuration.
 * @param {Array} apiKeys - Array of API key configurations
 * @throws {Error} If apiKeys configuration is invalid
 */
function validateApiKeys(apiKeys) {
  if (!apiKeys || !Array.isArray(apiKeys) || apiKeys.length === 0) {
    throw new Error('Configuration error: At least one API key required in apiKeys array');
  }

  const validPermissions = ['read', 'write', 'delete'];
  const seenKeys = new Set();

  for (let i = 0; i < apiKeys.length; i++) {
    const keyConfig = apiKeys[i];

    // Validate key is non-empty string
    if (!keyConfig.key || typeof keyConfig.key !== 'string' || keyConfig.key.trim() === '') {
      throw new Error(`Configuration error: apiKeys[${i}].key must be a non-empty string`);
    }

    // Check for default placeholder
    if (keyConfig.key === 'CHANGE_THIS_TO_SECURE_KEY') {
      throw new Error(
        'Configuration error: API key must be changed from default value.\n' +
        'Please update config.json5 with a secure API key.'
      );
    }

    // Check for duplicate keys
    if (seenKeys.has(keyConfig.key)) {
      throw new Error(`Configuration error: Duplicate API key found at apiKeys[${i}]`);
    }
    seenKeys.add(keyConfig.key);

    // Validate name (optional, set default)
    if (!keyConfig.name) {
      keyConfig.name = `API Key ${i + 1}`;
    }

    // Validate permissions (optional, set default)
    if (!keyConfig.permissions) {
      keyConfig.permissions = ['read', 'write', 'delete'];
    } else if (!Array.isArray(keyConfig.permissions)) {
      throw new Error(`Configuration error: apiKeys[${i}].permissions must be an array`);
    } else {
      for (const perm of keyConfig.permissions) {
        if (!validPermissions.includes(perm)) {
          throw new Error(
            `Configuration error: Invalid permission "${perm}" in apiKeys[${i}].permissions. ` +
            `Valid permissions: ${validPermissions.join(', ')}`
          );
        }
      }
    }
  }
}

/**
 * Load and validate configuration from config.json5
 * @returns {Object} Validated configuration object
 * @throws {Error} If configuration is invalid or missing
 */
function loadConfig() {
  const configPath = path.join(process.cwd(), 'config.json5');

  // Auto-generate config.json5 if it doesn't exist
  if (!fs.existsSync(configPath)) {
    try {
      const examplePath = path.join(__dirname, '../../config.example.json5');
      if (fs.existsSync(examplePath)) {
        const exampleContent = fs.readFileSync(examplePath, 'utf-8');
        fs.writeFileSync(configPath, exampleContent);
        console.log('✅ config.json5 auto-generated from config.example.json5');
      } else {
        throw new Error(
          `Configuration file not found: ${configPath}\n` +
          'config.example.json5 is also missing. Cannot auto-generate config.'
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to auto-generate config.json5: ${error.message}\n` +
        'Please manually copy config.example.json5 to config.json5 and configure it.'
      );
    }
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

  // Normalize apiKeys (backward compatibility with single apiKey)
  config = normalizeApiKeys(config);

  // Validate apiKeys (replaces old single apiKey validation)
  validateApiKeys(config.apiKeys);

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

  // Set defaults for log settings
  config.log = config.log || {};
  config.log.dir = config.log.dir || config.logDir || './logs';
  config.log.level = config.log.level || config.logLevel || 'info';
  config.log.maxDays = config.log.maxDays || 30;
  config.log.history = config.log.history !== undefined ? config.log.history : true;

  // Set defaults for UI settings
  config.ui = config.ui || {};
  config.ui.title = config.ui.title || 'DocLight';
  config.ui.icon = config.ui.icon || '/images/icon.png';
  config.ui.maxWidth = config.ui.maxWidth || '1024px';

  // Set defaults for admin settings (Phase 1: Admin Mode)
  config.admin = {
    sessionTimeout: 3600000,  // 1 hour default
    allowUpload: true,
    allowDelete: true,
    maxUploadSize: config.maxUploadMB || 10,  // MB
    editableExtensions: ['.md', '.txt', '.json', '.json5', '.yaml', '.yml'],
    maxEditableSize: 1048576,  // 1MB default
    ...config.admin  // Allow overrides from config file
  };

  // Validate admin settings
  if (typeof config.admin.sessionTimeout !== 'number' || config.admin.sessionTimeout < 60000) {
    console.warn('Warning: admin.sessionTimeout must be at least 60000ms (1 minute). Using default 1 hour.');
    config.admin.sessionTimeout = 3600000;
  }

  if (typeof config.admin.maxEditableSize !== 'number' || config.admin.maxEditableSize < 1024) {
    console.warn('Warning: admin.maxEditableSize must be at least 1024 bytes. Using default 1MB.');
    config.admin.maxEditableSize = 1048576;
  }

  if (!Array.isArray(config.admin.editableExtensions)) {
    console.warn('Warning: admin.editableExtensions must be an array. Using defaults.');
    config.admin.editableExtensions = ['.md', '.txt', '.json', '.json5', '.yaml', '.yml'];
  }

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
