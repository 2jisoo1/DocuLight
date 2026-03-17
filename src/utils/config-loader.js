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

  // Remove legacy apiKey/apiKeys from config (no longer used)
  delete config.apiKey;
  delete config.apiKeys;

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

  // Set defaults for dataDir (Step 17: User Management)
  config.dataDir = config.dataDir || './data';
  config.dataDir = path.resolve(config.dataDir);
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    console.log(`Created data directory: ${config.dataDir}`);
  }

  // Auto-create users.json if it doesn't exist
  const usersJsonPath = path.join(config.dataDir, 'users.json');
  if (!fs.existsSync(usersJsonPath)) {
    const defaultUsersData = { version: 1, updatedAt: new Date().toISOString(), users: [] };
    fs.writeFileSync(usersJsonPath, JSON.stringify(defaultUsersData, null, 2), 'utf-8');
    console.log(`✅ users.json auto-generated: ${usersJsonPath}`);
  }

  // Parse email configuration (optional, null if not configured)
  if (config.email) {
    if (!config.email.host || !config.email.from) {
      console.warn('Warning: email.host and email.from are required for email service. Email features disabled.');
      config.email = null;
    }
  } else {
    config.email = null;
  }

  // Set defaults for optional fields
  config.maxUploadMB = config.maxUploadMB || 10;
  config.port = config.port || 3000;
  config.excludes = config.excludes || [];
  config.logDir = config.logDir || './logs';
  config.logLevel = config.logLevel || 'info';

  // Normalize basePath: default "", must start with "/", no trailing "/"
  if (config.basePath && typeof config.basePath === 'string') {
    let bp = config.basePath.trim();
    if (bp && !bp.startsWith('/')) {
      bp = '/' + bp;
    }
    // Remove trailing slash(es)
    bp = bp.replace(/\/+$/, '');
    config.basePath = bp;
  } else {
    config.basePath = '';
  }

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

  // Set defaults for auth settings (user authentication)
  config.auth = {
    requireReadLogin: false,
    sessionTimeout: 3600000,  // 1 hour default
    allowSignup: true,
    allowedEmailDomains: [],
    ...config.auth
  };
  if (config.auth.sessionTimeout < 60000) {
    config.auth.sessionTimeout = 3600000;
  }

  // signupMode 정규화
  if (!['approval', 'self'].includes(config.auth.signupMode)) {
    if (config.auth.signupMode) {
      console.warn(`Warning: auth.signupMode "${config.auth.signupMode}" is invalid. Using default "approval".`);
    }
    config.auth.signupMode = 'approval';
  }

  // selfSignup 기본값
  config.auth.selfSignup = config.auth.selfSignup || {};
  config.auth.selfSignup.defaultGroupName = config.auth.selfSignup.defaultGroupName || 'Viewer';

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
    // Special value "CHATBOT" enables chatbot mode (FR-CB-015)
    if (config.ui.indexFile === 'CHATBOT') {
      config.ui.resolvedIndexFile = 'CHATBOT';
      console.log(`Index file configured: CHATBOT (chatbot mode enabled)`);
    } else {
      const indexPath = resolveIndexPath(config.ui.indexFile, config.docsRoot);
      if (indexPath && fs.existsSync(indexPath) && indexPath.endsWith('.md')) {
        config.ui.resolvedIndexFile = indexPath;
        console.log(`Index file configured: ${config.ui.indexFile}`);
      } else {
        console.warn(`Index file not found or invalid: ${config.ui.indexFile}, using default welcome screen`);
        config.ui.resolvedIndexFile = null;
      }
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

  // Chatbot 설정 검증 (Step 15: RAG Chatbot)
  if (config.chatbot) {
    validateChatbotConfig(config.chatbot);

    // RAG 설정 기본값
    config.chatbot.rag = {
      chunkSize: 1000,
      chunkOverlap: 200,
      retrievalCount: 20,
      ...config.chatbot.rag
    };

    // Persistence 설정 기본값 및 경로 처리
    config.chatbot.rag.persistence = {
      dataDir: './data/vector',
      autoCompact: true,
      compactThreshold: 0.3,
      syncOnStartup: true,
      batchSize: 50,
      ...config.chatbot.rag.persistence
    };

    // dataDir 절대 경로 변환
    const persistenceDataDir = config.chatbot.rag.persistence.dataDir;
    config.chatbot.rag.persistence.dataDir = path.isAbsolute(persistenceDataDir)
      ? persistenceDataDir
      : path.resolve(process.cwd(), persistenceDataDir);

    // persistence 설정 검증
    validatePersistenceConfig(config.chatbot.rag.persistence);

    // Context 설정 기본값
    config.chatbot.context = {
      compressionThreshold: 0.7,
      compressionTarget: 0.1,
      ...config.chatbot.context
    };

    // 시스템 프롬프트 기본값
    config.chatbot.systemPrompt = config.chatbot.systemPrompt || '';

    // Client 설정 기본값 (브라우저로 전달)
    config.chatbot.client = {
      timeout: 300000,        // 5분 기본값
      keepAliveInterval: 30000,  // 30초 기본값
      ...config.chatbot.client
    };

    // Client 설정 검증
    validateClientConfig(config.chatbot.client);

    // Note: ChatbotService is only initialized when ui.indexFile === "CHATBOT"
    const isChatbotMode = config.ui?.indexFile === 'CHATBOT';
    if (isChatbotMode) {
      console.log(`✅ Chatbot enabled: LLM=${config.chatbot.llm.type}, Embedding=${config.chatbot.embedding.type}`);
    } else {
      console.log(`ℹ️ Chatbot configured but not enabled (set ui.indexFile="CHATBOT" to enable)`);
    }
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

/**
 * Validate chatbot configuration (Step 15: RAG Chatbot)
 * @param {Object} chatbotConfig - chatbot configuration object
 * @throws {Error} If chatbot configuration is invalid
 */
function validateChatbotConfig(chatbotConfig) {
  if (!chatbotConfig) return;

  const validLLMTypes = ['openai', 'azure-openai', 'ollama'];
  const errors = [];

  // LLM 설정 검증
  if (!chatbotConfig.llm) {
    errors.push('chatbot.llm is required');
  } else {
    const llm = chatbotConfig.llm;

    if (!llm.type) {
      errors.push('chatbot.llm.type is required');
    } else if (!validLLMTypes.includes(llm.type)) {
      errors.push(`chatbot.llm.type must be one of: ${validLLMTypes.join(', ')}`);
    }

    if (!llm.endpoint) {
      errors.push('chatbot.llm.endpoint is required');
    }

    if (!llm.model) {
      errors.push('chatbot.llm.model is required');
    }

    // OpenAI, Azure는 apiKey 필수
    if (llm.type !== 'ollama' && !llm.apiKey) {
      errors.push('chatbot.llm.apiKey is required for openai/azure-openai');
    }

    // Azure 전용 필드
    if (llm.type === 'azure-openai' && !llm.deploymentName) {
      errors.push('chatbot.llm.deploymentName is required for azure-openai');
    }

    // contextLength 검증 (선택적)
    if (llm.contextLength !== undefined) {
      if (typeof llm.contextLength !== 'number' || llm.contextLength < 1000) {
        errors.push('chatbot.llm.contextLength must be a number >= 1000');
      }
    }

    // temperature 검증
    if (llm.temperature !== undefined) {
      if (typeof llm.temperature !== 'number' || llm.temperature < 0 || llm.temperature > 2) {
        errors.push('chatbot.llm.temperature must be a number between 0 and 2');
      }
    }
  }

  // Embedding 설정 검증
  if (!chatbotConfig.embedding) {
    errors.push('chatbot.embedding is required');
  } else {
    const embedding = chatbotConfig.embedding;

    if (!embedding.type) {
      errors.push('chatbot.embedding.type is required');
    } else if (!validLLMTypes.includes(embedding.type)) {
      errors.push(`chatbot.embedding.type must be one of: ${validLLMTypes.join(', ')}`);
    }

    if (!embedding.endpoint) {
      errors.push('chatbot.embedding.endpoint is required');
    }

    // OpenAI, Azure는 apiKey 필수
    if (embedding.type !== 'ollama' && !embedding.apiKey) {
      errors.push('chatbot.embedding.apiKey is required for openai/azure-openai');
    }

    // Azure 전용 필드
    if (embedding.type === 'azure-openai' && !embedding.deploymentName) {
      errors.push('chatbot.embedding.deploymentName is required for azure-openai');
    }
  }

  // RAG 설정 검증 (선택적)
  if (chatbotConfig.rag) {
    const rag = chatbotConfig.rag;

    if (rag.chunkSize !== undefined) {
      if (typeof rag.chunkSize !== 'number' || rag.chunkSize < 100) {
        errors.push('chatbot.rag.chunkSize must be a number >= 100');
      }
    }

    if (rag.chunkOverlap !== undefined) {
      if (typeof rag.chunkOverlap !== 'number' || rag.chunkOverlap < 0) {
        errors.push('chatbot.rag.chunkOverlap must be a non-negative number');
      }
    }

    if (rag.retrievalCount !== undefined) {
      if (typeof rag.retrievalCount !== 'number' || rag.retrievalCount < 1) {
        errors.push('chatbot.rag.retrievalCount must be a number >= 1');
      }
    }
  }

  // Context 설정 검증 (선택적)
  if (chatbotConfig.context) {
    const context = chatbotConfig.context;

    if (context.compressionThreshold !== undefined) {
      if (typeof context.compressionThreshold !== 'number' ||
          context.compressionThreshold < 0 || context.compressionThreshold > 1) {
        errors.push('chatbot.context.compressionThreshold must be a number between 0 and 1');
      }
    }

    if (context.compressionTarget !== undefined) {
      if (typeof context.compressionTarget !== 'number' ||
          context.compressionTarget < 0 || context.compressionTarget > 1) {
        errors.push('chatbot.context.compressionTarget must be a number between 0 and 1');
      }
    }
  }

  if (errors.length > 0) {
    throw new Error('Chatbot configuration error:\n  • ' + errors.join('\n  • '));
  }
}

/**
 * Validate persistence configuration for vector store
 * @param {Object} persistenceConfig - persistence configuration object
 * @throws {Error} If persistence configuration is invalid
 */
function validatePersistenceConfig(persistenceConfig) {
  if (!persistenceConfig) return;

  const errors = [];

  // dataDir 검증
  if (!persistenceConfig.dataDir || typeof persistenceConfig.dataDir !== 'string') {
    errors.push('chatbot.rag.persistence.dataDir must be a non-empty string');
  }

  // autoCompact 검증
  if (persistenceConfig.autoCompact !== undefined &&
      typeof persistenceConfig.autoCompact !== 'boolean') {
    errors.push('chatbot.rag.persistence.autoCompact must be a boolean');
  }

  // compactThreshold 검증
  if (persistenceConfig.compactThreshold !== undefined) {
    if (typeof persistenceConfig.compactThreshold !== 'number' ||
        persistenceConfig.compactThreshold < 0 ||
        persistenceConfig.compactThreshold > 1) {
      errors.push('chatbot.rag.persistence.compactThreshold must be a number between 0 and 1');
    }
  }

  // syncOnStartup 검증
  if (persistenceConfig.syncOnStartup !== undefined &&
      typeof persistenceConfig.syncOnStartup !== 'boolean') {
    errors.push('chatbot.rag.persistence.syncOnStartup must be a boolean');
  }

  // batchSize 검증
  if (persistenceConfig.batchSize !== undefined) {
    if (typeof persistenceConfig.batchSize !== 'number' ||
        persistenceConfig.batchSize < 1 ||
        persistenceConfig.batchSize > 1000) {
      errors.push('chatbot.rag.persistence.batchSize must be a number between 1 and 1000');
    }
  }

  if (errors.length > 0) {
    throw new Error('Persistence configuration error:\n  • ' + errors.join('\n  • '));
  }

  console.log(`✅ Vector store persistence: ${persistenceConfig.dataDir}`);
}

/**
 * Validate client configuration for chatbot
 * @param {Object} clientConfig - client configuration object
 * @throws {Error} If client configuration is invalid
 */
function validateClientConfig(clientConfig) {
  if (!clientConfig) return;

  const errors = [];

  // timeout 검증 (0 = 무제한, 최소 10초)
  if (clientConfig.timeout !== undefined) {
    if (typeof clientConfig.timeout !== 'number') {
      errors.push('chatbot.client.timeout must be a number');
    } else if (clientConfig.timeout !== 0 && clientConfig.timeout < 10000) {
      errors.push('chatbot.client.timeout must be 0 (no timeout) or >= 10000ms (10 seconds)');
    } else if (clientConfig.timeout > 3600000) {
      console.warn('Warning: chatbot.client.timeout is very high (> 1 hour). This may cause issues.');
    }
  }

  // keepAliveInterval 검증 (0 = 비활성화, 최소 5초)
  if (clientConfig.keepAliveInterval !== undefined) {
    if (typeof clientConfig.keepAliveInterval !== 'number') {
      errors.push('chatbot.client.keepAliveInterval must be a number');
    } else if (clientConfig.keepAliveInterval !== 0 && clientConfig.keepAliveInterval < 5000) {
      errors.push('chatbot.client.keepAliveInterval must be 0 (disabled) or >= 5000ms (5 seconds)');
    }
  }

  if (errors.length > 0) {
    throw new Error('Client configuration error:\n  • ' + errors.join('\n  • '));
  }
}

module.exports = { loadConfig };
