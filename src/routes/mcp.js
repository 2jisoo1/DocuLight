const express = require('express');

/**
 * MCP over HTTP (JSON-RPC 2.0)
 * SDK 없이 직접 구현
 */

/**
 * JSON-RPC 2.0 응답 생성
 */
function createJsonRpcResponse(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

/**
 * JSON-RPC 2.0 에러 응답 생성
 */
function createJsonRpcError(id, code, message, data = null) {
  const error = {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  };

  if (data) {
    error.error.data = data;
  }

  return error;
}

const DEFAULT_MCP_PREFIX = 'DocuLight';
const SUPPORTED_MCP_PROTOCOL_VERSIONS = ['2025-11-25'];
const DEFAULT_MCP_PROTOCOL_VERSION = '2025-11-25';
const WILDCARD_ALLOW = '*';

/**
 * Convert ui.title to MCP tool name prefix.
 * Spaces → underscores, non-alphanumeric removed, fallback DEFAULT_MCP_PREFIX.
 */
function sanitizeForToolName(title) {
  if (!title) return DEFAULT_MCP_PREFIX;
  const sanitized = title.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
  return sanitized || DEFAULT_MCP_PREFIX;
}

function getConfiguredPort(config) {
  return config.port || 3000;
}

function getConfiguredScheme(config) {
  return config.ssl && config.ssl.enabled ? 'https' : 'http';
}

function normalizeHost(host) {
  if (!host || typeof host !== 'string') return '';
  const value = host.trim().toLowerCase();
  if (!value) return '';

  try {
    return new URL(value.includes('://') ? value : `http://${value}`).host;
  } catch (error) {
    return value;
  }
}

function hostnameOnly(host) {
  const normalized = normalizeHost(host);
  if (!normalized) return '';
  if (normalized.startsWith('[')) {
    const end = normalized.indexOf(']');
    return end === -1 ? normalized : normalized.slice(1, end);
  }
  if ((normalized.match(/:/g) || []).length > 1) {
    return normalized;
  }
  return normalized.split(':')[0];
}

function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return '';
  try {
    const parsed = new URL(origin);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch (error) {
    return '';
  }
}

function configuredHostNames(config) {
  const host = config.host;
  if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') {
    return [];
  }
  return [host];
}

function defaultAllowedHosts(config) {
  return ['localhost', '127.0.0.1', '::1', ...configuredHostNames(config)];
}

function defaultAllowedOrigins(config) {
  const scheme = getConfiguredScheme(config);
  const port = getConfiguredPort(config);
  return defaultAllowedHosts(config).flatMap(host => {
    const displayHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    return [`${scheme}://${displayHost}:${port}`];
  });
}

function configList(value, fallback) {
  return Array.isArray(value) ? value : fallback;
}

function listAllowsWildcard(list) {
  return list.includes(WILDCARD_ALLOW);
}

function originAllowed(origin, allowedOrigins) {
  if (listAllowsWildcard(allowedOrigins)) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return allowedOrigins.map(normalizeOrigin).includes(normalized);
}

function hostAllowed(host, allowedHosts) {
  if (listAllowsWildcard(allowedHosts)) return true;
  const normalized = normalizeHost(host);
  const bare = hostnameOnly(normalized);
  return allowedHosts.some(allowed => {
    const allowedHost = normalizeHost(allowed);
    return normalized === allowedHost || bare === hostnameOnly(allowedHost);
  });
}

/**
 * MCP Tool 목록 (prefix from config.ui.title)
 */
function buildTools(prefix) {
  return [
  {
    name: 'list_documents',
    description: 'List files and folders in a specific directory (non-recursive). Returns names only, not content. Use this when you need to see what is in a single directory. For recursive listing, use list_full_tree instead.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path (default: root)',
          default: '/'
        },
        useDisplayName: {
          type: 'boolean',
          description: 'If true, show frontmatter title instead of filename for markdown files. Default: false (show actual filename).',
          default: false
        }
      }
    }
  },
  {
    name: 'list_full_tree',
    description: `Recursively list all files and directories as a tree structure. Returns paths only, not content. Use maxDepth to limit recursion depth. Warning: Can be large for big document collections. Consider using list_documents for single directory, or ${prefix}_search to find specific files.`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Starting directory path (default: /)',
          default: '/'
        },
        maxDepth: {
          type: 'integer',
          description: 'Optional maximum depth (0 = only this directory). If omitted, full depth.'
        },
        useDisplayName: {
          type: 'boolean',
          description: 'If true, show frontmatter title instead of filename for markdown files. Default: false (show actual filename).',
          default: false
        }
      }
    }
  },
  {
    name: 'read_document',
    description: `Read the COMPLETE content of a markdown document. Returns the full file content which may use many tokens. For better efficiency: Use query_document if you need specific information from the document; Use summarize_document if you need to understand document structure first; Use ${prefix}_smart_search if you are not sure which document contains the information. Only use read_document when you specifically need the entire file content.`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Document path (e.g., guide/getting-started.md)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'create_document',
    description: 'Create a new markdown document or overwrite an existing one. Requires X-API-Key authentication. The content parameter should be valid markdown. Parent directories are created automatically if they do not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Document path (e.g., guide/new-doc.md)'
        },
        content: {
          type: 'string',
          description: 'Markdown content'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'delete_document',
    description: 'Permanently delete a file or directory (including all contents). Requires X-API-Key authentication. This action cannot be undone. For directories, all nested files and folders will be deleted.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Document or directory path to delete'
        }
      },
      required: ['path']
    }
  },
  {
    name: `${prefix}_get_config`,
    description: 'Get current DocLight server configuration. Sensitive values (API keys, etc.) are masked. Use section parameter to get specific config: "ui" for UI settings, "security" for security settings, "ssl" for SSL config, or "all" for everything. Useful for debugging or understanding server setup.',
    inputSchema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description: 'Configuration section to retrieve (ui, security, ssl, all)',
          default: 'all',
          enum: ['ui', 'security', 'ssl', 'all']
        }
      }
    }
  },
  {
    name: `${prefix}_search`,
    description: `Search for documents by keyword matching. Searches file names, titles, and content. Use mode parameter to control output detail: "titles_only" for minimal output (fastest, least tokens), "snippets" (default) for matched lines with surrounding context, "full_context" for complete sections containing matches. For semantic/meaning-based search, use ${prefix}_smart_search instead. For searching within a known document, use query_document.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (minimum 2 characters)'
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results to return (1-100)',
          default: 10
        },
        path: {
          type: 'string',
          description: 'Search within directory (default: /)',
          default: '/'
        },
        mode: {
          type: 'string',
          enum: ['titles_only', 'snippets', 'full_context'],
          description: 'Result detail level: titles_only (minimal), snippets (default), full_context (detailed)',
          default: 'snippets'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'query_document',
    description: `Search within a SPECIFIC document and return only sections relevant to your query. Use this when: you know which document to look in, you need specific information (not the whole document), you want to minimize token usage. Returns sections ranked by relevance within your token budget. For searching across multiple documents, use ${prefix}_smart_search instead.`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Document path (e.g., guide/setup.md)'
        },
        query: {
          type: 'string',
          description: 'What information you need from this document'
        },
        maxTokens: {
          type: 'integer',
          description: 'Maximum tokens to return (default: 2000)',
          default: 2000
        }
      },
      required: ['path', 'query']
    }
  },
  {
    name: 'summarize_document',
    description: 'Get a structured summary of a document without reading the full content. Returns: table of contents (all headings), key points extracted from each section, statistics (word count, section count, code blocks, etc.). Use this to understand document structure before deciding whether to read the full document (read_document) or which sections to query (query_document). Much more efficient than reading the entire document.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Document path (e.g., guide/setup.md)'
        }
      },
      required: ['path']
    }
  },
  {
    name: `${prefix}_smart_search`,
    description: 'The most intelligent search option for finding information across multiple documents. Automatically uses vector search when available (understands meaning, not just keywords) and falls back to keyword search if embedding not configured. Returns only relevant sections, not full documents. Use mode="auto" (default) to let the system choose, "semantic" to force vector search, "keyword" for exact text matching. Set maxTokens to control output size. For searching within a specific document, use query_document instead.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (natural language for semantic, keywords for fallback)'
        },
        path: {
          type: 'string',
          description: 'Directory to search within (default: /)',
          default: '/'
        },
        mode: {
          type: 'string',
          enum: ['auto', 'semantic', 'keyword'],
          description: 'Search mode: auto (use semantic if available), semantic (force), keyword (force)',
          default: 'auto'
        },
        maxTokens: {
          type: 'integer',
          description: 'Maximum tokens to return (default: 2000)',
          default: 2000
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of documents (default: 5)',
          default: 5
        }
      },
      required: ['query']
    }
  },
  {
    name: 'resolve_project',
    description: `Resolve a project or library name to its document path. Use this FIRST when you know the project name but not the exact path. Returns matching projects sorted by relevance with scores. Supports fuzzy matching, aliases, and Korean names. After resolving, use query_document, query_code_examples, or ${prefix}_smart_search with the returned path.`,
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Project or library name (natural language, e.g., "json5", "AnnotaQL", "옵션위버")'
        },
        version: {
          type: 'string',
          description: 'Specific version to resolve (e.g., "2.0"). If omitted, returns all versions.'
        },
        limit: {
          type: 'integer',
          description: 'Maximum results (default: 5)',
          default: 5
        }
      },
      required: ['name']
    }
  },
  {
    name: 'query_code_examples',
    description: 'Extract code examples from documents that match a query. Returns code blocks with surrounding context (heading and description). Use language parameter to filter by programming language (java, python, javascript, etc.). More token-efficient than read_document when you only need code examples.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What kind of code examples you need'
        },
        path: {
          type: 'string',
          description: 'Directory or file to search (default: /)',
          default: '/'
        },
        language: {
          type: 'string',
          description: 'Filter by language (e.g., java, python, javascript). Omit for all languages.'
        },
        maxTokens: {
          type: 'integer',
          description: 'Maximum tokens to return (default: 3000)',
          default: 3000
        },
        limit: {
          type: 'integer',
          description: 'Maximum code blocks to return (default: 10)',
          default: 10
        }
      },
      required: ['query']
    }
  }
  ];
}

const crypto = require('crypto');
const activityLogger = require('../utils/activity-logger');
const handlers = require('../services/agent-tools/handlers');

/**
 * Check if tool requires write authentication
 */
function requiresWriteAuth(handlerKey) {
  const protectedTools = ['create_document', 'delete_document'];
  return protectedTools.includes(handlerKey);
}

/**
 * Check if tool requires read authentication (when requireReadLogin is enabled)
 */
function requiresReadAuth(handlerKey) {
  const readTools = ['list_documents', 'list_full_tree', 'read_document',
    'get_config', 'search', 'query_document', 'summarize_document', 'smart_search',
    'resolve_project', 'query_code_examples'];
  return readTools.includes(handlerKey);
}

const PREFIXED_TOOL_KEYS = ['get_config', 'search', 'smart_search'];

function resolveHandlerKey(toolName, prefix) {
  if (!toolName || typeof toolName !== 'string') {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(handlers, toolName) &&
      typeof handlers[toolName] === 'function') {
    return toolName;
  }

  const prefixMarker = prefix + '_';
  if (!toolName.startsWith(prefixMarker)) {
    return toolName;
  }

  const suffix = toolName.slice(prefixMarker.length);
  return PREFIXED_TOOL_KEYS.includes(suffix) &&
    Object.prototype.hasOwnProperty.call(handlers, suffix) &&
    typeof handlers[suffix] === 'function'
    ? suffix
    : null;
}

/**
 * Validate API key (user-key) via SHA-256 hash lookup
 */
function validateApiKey(req, config) {
  const providedKey = req.header('X-API-Key');

  if (!providedKey) {
    return { valid: false, error: 'X-API-Key header is required for this operation' };
  }

  const stores = req.app.locals.stores;
  if (!stores || !stores.userStore || stores.userStore.getUserCount() === 0) {
    return { valid: false, error: 'No users configured. Please complete setup first.' };
  }

  const hash = crypto.createHash('sha256').update(providedKey).digest('hex');
  const user = stores.userStore.findByUserKeyHash(hash);

  if (!user) {
    return { valid: false, error: 'Invalid API key' };
  }

  if (user.status === 'disabled') {
    return { valid: false, error: 'Account is disabled' };
  }

  const group = stores.groupStore.findById(user.groupId);
  return {
    valid: true,
    user: {
      userId: user.id,
      email: user.email,
      groupId: user.groupId,
      permissions: group ? group.permissions : ['read']
    }
  };
}

/**
 * MCP Tool 실행
 */
async function executeTool(config, logger, name, args, req, prefix) {
  const handlerKey = resolveHandlerKey(name, prefix);
  const hasHandler = handlerKey && Object.prototype.hasOwnProperty.call(handlers, handlerKey);
  const handler = hasHandler ? handlers[handlerKey] : null;
  if (typeof handler !== 'function') {
    throw new Error(`Unknown tool: ${name}`);
  }

  // Check authentication for read tools (when requireReadLogin is enabled)
  const stores = req.app.locals.stores;
  if (requiresReadAuth(handlerKey) && stores && stores.authSettingsStore) {
    const settings = stores.authSettingsStore.get();
    if (settings.requireReadLogin) {
      const authResult = validateApiKey(req, config);
      if (!authResult.valid) {
        throw new Error(`UNAUTHORIZED: ${authResult.error}`);
      }
    }
  }

  // Check authentication for write tools (always required)
  if (requiresWriteAuth(handlerKey)) {
    const authResult = validateApiKey(req, config);
    if (!authResult.valid) {
      throw new Error(`UNAUTHORIZED: ${authResult.error}`);
    }
    if (authResult.user && authResult.user.permissions) {
      const { hasPermission } = require('../middleware/auth');
      if (!hasPermission(authResult.user.permissions, 'write')) {
        throw new Error('UNAUTHORIZED: Write permission required');
      }
    }
  }

  return handler(config, logger, args, req, prefix);
}

/**
 * Create MCP router
 */
function summarizeArgs(args) {
  if (!args) return '{}';
  const summary = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && v.length > 100) {
      summary[k] = v.substring(0, 100) + '...[truncated]';
    } else {
      summary[k] = v;
    }
  }
  return JSON.stringify(summary);
}

function createMcpRouter() {
  const router = express.Router();

  router.get('/mcp', (req, res) => {
    return res
      .status(405)
      .set('Allow', 'POST')
      .json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'GET /mcp is not supported because SSE streams are disabled. Use POST /mcp.'
        }
      });
  });

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function classifyJsonRpcMessage(body) {
    if (Array.isArray(body)) {
      return { type: 'invalid', id: null, reason: 'Batch requests are not supported' };
    }

    if (!body || typeof body !== 'object') {
      return { type: 'invalid', id: null, reason: 'body must be a JSON-RPC object' };
    }

    const id = hasOwn(body, 'id') ? body.id : null;
    if (body.jsonrpc !== '2.0') {
      return { type: 'invalid', id, reason: 'jsonrpc must be "2.0"' };
    }

    const hasId = hasOwn(body, 'id');
    const hasMethod = hasOwn(body, 'method');
    const hasNonEmptyMethod = typeof body.method === 'string' && body.method.length > 0;
    const hasResultOrError = hasOwn(body, 'result') || hasOwn(body, 'error');

    if (hasId && hasNonEmptyMethod) {
      return { type: 'request', id, method: body.method, params: body.params };
    }

    if (!hasId && hasNonEmptyMethod) {
      return { type: 'notification', id: null, method: body.method, params: body.params };
    }

    if (hasId && !hasMethod && hasResultOrError) {
      return { type: 'response', id, method: undefined };
    }

    return { type: 'invalid', id, reason: 'body must be a JSON-RPC request, notification, or response' };
  }

  function acceptAllowsJson(req) {
    const accept = req.get('Accept');
    if (!accept) return true;

    return accept
      .split(',')
      .map(part => part.split(';')[0].trim().toLowerCase())
      .some(mediaType => mediaType === 'application/json' || mediaType === '*/*');
  }

  function rejectNotAcceptable(res) {
    return res.status(406).json({
      error: {
        status: 406,
        code: 'NOT_ACCEPTABLE',
        message: 'Accept header must include application/json'
      }
    });
  }

  function rejectForbidden(res, code, message) {
    return res.status(403).json({
      error: {
        status: 403,
        code,
        message
      }
    });
  }

  function validateBrowserOrigin(req, res, logger) {
    const origin = req.get('Origin');
    if (!origin) {
      return true;
    }

    const config = req.app.locals.config || {};
    const mcpConfig = config.mcp || {};
    const allowedOrigins = configList(mcpConfig.allowedOrigins, defaultAllowedOrigins(config));
    const allowedHosts = configList(mcpConfig.allowedHosts, defaultAllowedHosts(config));

    if (!originAllowed(origin, allowedOrigins)) {
      logger.warn('MCP request rejected by Origin allowlist', { origin, host: req.get('Host') });
      rejectForbidden(res, 'FORBIDDEN_ORIGIN', 'Origin is not allowed for MCP requests');
      return false;
    }

    if (!hostAllowed(req.get('Host'), allowedHosts)) {
      logger.warn('MCP request rejected by Host allowlist', { origin, host: req.get('Host') });
      rejectForbidden(res, 'FORBIDDEN_HOST', 'Host is not allowed for MCP requests');
      return false;
    }

    return true;
  }

  function validateProtocolHeader(req, res, logger, messageInfo) {
    const version = req.get('MCP-Protocol-Version');
    if (version && !SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(version)) {
      res.status(400).json({
        error: {
          status: 400,
          code: 'UNSUPPORTED_MCP_PROTOCOL_VERSION',
          message: `Unsupported MCP-Protocol-Version header: ${version}`
        }
      });
      return false;
    }

    const isInitializeRequest = messageInfo.type === 'request' && messageInfo.method === 'initialize';
    if (!version && !isInitializeRequest) {
      const logCompatibility = typeof logger.debug === 'function'
        ? logger.debug.bind(logger)
        : logger.info.bind(logger);
      logCompatibility('MCP-Protocol-Version header missing; compatibility mode assumed', {
        method: messageInfo.method
      });
    }

    return true;
  }

  function resolveInitializeProtocolVersion(params, logger) {
    const requested = params && params.protocolVersion;
    if (!requested) {
      return DEFAULT_MCP_PROTOCOL_VERSION;
    }

    if (SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(requested)) {
      return requested;
    }

    logger.warn('Unsupported initialize protocolVersion requested; falling back to default', {
      requested,
      protocolVersion: DEFAULT_MCP_PROTOCOL_VERSION
    });
    return DEFAULT_MCP_PROTOCOL_VERSION;
  }

  // MCP endpoint - JSON-RPC 2.0
  router.post('/mcp', express.json(), async (req, res) => {
    const { config, logger } = req.app.locals;
    const prefix = sanitizeForToolName(config.ui?.title);

    if (!validateBrowserOrigin(req, res, logger)) {
      return;
    }

    const messageInfo = classifyJsonRpcMessage(req.body);

    if (messageInfo.type === 'invalid') {
      return res.json(createJsonRpcError(messageInfo.id, -32600, 'Invalid Request', messageInfo.reason));
    }

    if (!acceptAllowsJson(req)) {
      return rejectNotAcceptable(res);
    }

    if (!validateProtocolHeader(req, res, logger, messageInfo)) {
      return;
    }

    if (messageInfo.type === 'response') {
      logger.info('MCP: JSON-RPC response accepted', { id: messageInfo.id });
      return res.status(202).end();
    }

    if (messageInfo.type === 'notification') {
      if (messageInfo.method === 'notifications/initialized') {
        logger.info('MCP: notifications/initialized received');
        activityLogger.mcp('INITIALIZED', { ip: req.ip });
      } else {
        logger.info('MCP: notification accepted', { method: messageInfo.method });
      }
      return res.status(202).end();
    }

    const { id, method, params } = messageInfo;

    try {
      switch (method) {
        case 'tools/list':
          logger.info('MCP: tools/list called');
          return res.json(createJsonRpcResponse(id, { tools: buildTools(prefix) }));

        case 'tools/call': {
          if (!params || !params.name) {
            return res.json(createJsonRpcError(id, -32602, 'Invalid params', 'tool name is required'));
          }

          const { name, arguments: args } = params;
          logger.info('MCP: tools/call', { tool: name, args });

          // Determine user label for activity log
          const authResult = validateApiKey(req, config);
          const mcpUser = authResult.valid && authResult.user
            ? (authResult.user.email || `apikey(${activityLogger.maskKey(authResult.user.userId)})`)
            : 'anonymous';

          try {
            const result = await executeTool(config, logger, name, args || {}, req, prefix);
            activityLogger.mcp('TOOL=' + name, { user: mcpUser, ip: req.ip, args: summarizeArgs(args) });
            return res.json(createJsonRpcResponse(id, result));
          } catch (toolError) {
            if (toolError.message.startsWith('UNAUTHORIZED')) {
              activityLogger.mcpError('AUTH_FAILED', { ip: req.ip, tool: name });
            } else {
              activityLogger.mcpError('TOOL=' + name + ' ERROR', {
                user: mcpUser,
                ip: req.ip,
                error: toolError.message,
                code: toolError.code,
                stack: toolError.stack,
                args: summarizeArgs(args)
              });
            }
            throw toolError;
          }
        }

        case 'initialize':
          logger.info('MCP: initialize called');
          activityLogger.mcp('INITIALIZE', { ip: req.ip });
          return res.json(createJsonRpcResponse(id, {
            protocolVersion: resolveInitializeProtocolVersion(params, logger),
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: prefix,
              version: '1.0.0'
            },
            instructions: `Use this server to retrieve internal documentation and code examples.\n\nRecommended workflow:\n1. Call resolve_project to find the right document path for a project/library name\n2. Call query_document or query_code_examples with the resolved path\n3. Use ${prefix}_smart_search for cross-document natural language search\n4. Use summarize_document to understand document structure before reading full content\n\nTips:\n- Always call resolve_project first if you don't know the exact document path\n- Use query_code_examples when you specifically need code snippets\n- Set maxTokens to control response size and save context window`
          }));

        default:
          return res.json(createJsonRpcError(id, -32601, 'Method not found', `Method ${method} not supported`));
      }
    } catch (error) {
      const isBusinessError = ['INVALID_PATH', 'INVALID_QUERY', 'DOCUMENT_NOT_FOUND', 'PATH_TRAVERSAL', 'INVALID_FORMAT', 'UNAUTHORIZED'].includes(error.code);
      const logMethod = isBusinessError ? 'warn' : 'error';
      logger[logMethod]('MCP error', {
        method,
        tool: method === 'tools/call' ? params?.name : undefined,
        args: method === 'tools/call' ? summarizeArgs(params?.arguments) : undefined,
        error: error.message,
        code: error.code,
        stack: isBusinessError ? undefined : error.stack
      });

      return res.json(createJsonRpcError(id, -32603, 'Internal error', error.message));
    }
  });

  return router;
}

module.exports = createMcpRouter;
module.exports.buildTools = buildTools;
module.exports.sanitizeForToolName = sanitizeForToolName;
module.exports.SUPPORTED_MCP_PROTOCOL_VERSIONS = SUPPORTED_MCP_PROTOCOL_VERSIONS;
module.exports.DEFAULT_MCP_PROTOCOL_VERSION = DEFAULT_MCP_PROTOCOL_VERSION;
module.exports.resolveHandlerKey = resolveHandlerKey;
