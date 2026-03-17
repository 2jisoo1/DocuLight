const express = require('express');
const path = require('path');
const { getTreeData, getFullTreeData } = require('../services/tree-service');
const { getRawContent, uploadFileData, deleteEntryData } = require('../services/file-service');
const { getConfig } = require('../services/config-service');
const { searchDocuments } = require('../services/search-service');
const { QueryDocumentService } = require('../services/mcp/query-document-service');
const { SummarizeDocumentService } = require('../services/mcp/summarize-document-service');
const { SmartSearchService } = require('../services/mcp/smart-search-service');
const { ProjectResolverService } = require('../services/mcp/project-resolver-service');
const { CodeBlockExtractorService } = require('../services/mcp/code-block-extractor');
const { validatePath } = require('../utils/path-validator');
const { notifyAdd, notifyBatchRemove, collectMdFiles } = require('../utils/embedding-notifier');

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

/**
 * MCP Tool 목록
 */
const TOOLS = [
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
        }
      }
    }
  },
  {
    name: 'list_full_tree',
    description: 'Recursively list all files and directories as a tree structure. Returns paths only, not content. Use maxDepth to limit recursion depth. Warning: Can be large for big document collections. Consider using list_documents for single directory, or DocuLight_search to find specific files.',
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
        }
      }
    }
  },
  {
    name: 'read_document',
    description: 'Read the COMPLETE content of a markdown document. Returns the full file content which may use many tokens. For better efficiency: Use query_document if you need specific information from the document; Use summarize_document if you need to understand document structure first; Use DocuLight_smart_search if you are not sure which document contains the information. Only use read_document when you specifically need the entire file content.',
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
    name: 'DocuLight_get_config',
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
    name: 'DocuLight_search',
    description: 'Search for documents by keyword matching. Searches file names, titles, and content. Use mode parameter to control output detail: "titles_only" for minimal output (fastest, least tokens), "snippets" (default) for matched lines with surrounding context, "full_context" for complete sections containing matches. For semantic/meaning-based search, use DocuLight_smart_search instead. For searching within a known document, use query_document.',
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
    description: 'Search within a SPECIFIC document and return only sections relevant to your query. Use this when: you know which document to look in, you need specific information (not the whole document), you want to minimize token usage. Returns sections ranked by relevance within your token budget. For searching across multiple documents, use DocuLight_smart_search instead.',
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
    name: 'DocuLight_smart_search',
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
    description: 'Resolve a project or library name to its document path. Use this FIRST when you know the project name but not the exact path. Returns matching projects sorted by relevance with scores. Supports fuzzy matching, aliases, and Korean names. After resolving, use query_document, query_code_examples, or DocuLight_smart_search with the returned path.',
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

const crypto = require('crypto');
const activityLogger = require('../utils/activity-logger');

/**
 * Check if tool requires write authentication
 */
function requiresWriteAuth(toolName) {
  const protectedTools = ['create_document', 'delete_document'];
  return protectedTools.includes(toolName);
}

/**
 * Check if tool requires read authentication (when requireReadLogin is enabled)
 */
function requiresReadAuth(toolName) {
  const readTools = ['list_documents', 'read_document', 'DocuLight_get_config',
    'DocuLight_search', 'query_document', 'summarize_document', 'DocuLight_smart_search',
    'resolve_project', 'query_code_examples'];
  return readTools.includes(toolName);
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
async function executeTool(config, logger, name, args, req) {
  // Check authentication for read tools (when requireReadLogin is enabled)
  const stores = req.app.locals.stores;
  if (requiresReadAuth(name) && stores && stores.authSettingsStore) {
    const settings = stores.authSettingsStore.get();
    if (settings.requireReadLogin) {
      const authResult = validateApiKey(req, config);
      if (!authResult.valid) {
        throw new Error(`UNAUTHORIZED: ${authResult.error}`);
      }
    }
  }

  // Check authentication for write tools (always required)
  if (requiresWriteAuth(name)) {
    const authResult = validateApiKey(req, config);
    if (!authResult.valid) {
      throw new Error(`UNAUTHORIZED: ${authResult.error}`);
    }
    // Check write permission if user info available
    if (authResult.user && authResult.user.permissions) {
      const { hasPermission } = require('../middleware/auth');
      if (!hasPermission(authResult.user.permissions, 'write')) {
        throw new Error('UNAUTHORIZED: Write permission required');
      }
    }
  }

  switch (name) {
    case 'list_documents': {
      const result = await getTreeData(config, logger, args.path || '/');

      // Format as text
      let output = '';
      if (result.dirs && result.dirs.length > 0) {
        for (const dir of result.dirs) {
          output += `📁 ${dir.name}/\n`;
        }
      }
      if (result.files && result.files.length > 0) {
        for (const file of result.files) {
          output += `📄 ${file.name}\n`;
        }
      }
      if (!output) {
        output = '(Empty directory)';
      }

      return {
        content: [
          {
            type: 'text',
            text: `# Documents at ${result.path}\n\n${output}`
          }
        ]
      };
    }

    case 'list_full_tree': {
      const startPath = args.path || '/';
      const result = await getFullTreeData(config, logger, startPath, { maxDepth: args.maxDepth });

      // 포맷 함수
      function formatTree(node, indent = '') {
        let lines = [];
        for (const dir of node.dirs) {
          lines.push(`${indent}📁 ${dir.name}/`);
          lines = lines.concat(formatTree(dir, indent + '  '));
        }
        for (const file of node.files) {
          lines.push(`${indent}📄 ${file.name}`);
        }
        return lines;
      }

      const lines = formatTree(result.root);
      // 대규모 트리 출력 제한 (안전장치)
      //const MAX_LINES = 5000;
      let outputText;
      //if (lines.length > MAX_LINES) {
      //  outputText = lines.slice(0, MAX_LINES).join('\n') + `\n... (truncated ${lines.length - MAX_LINES} more lines)`;
      //} else {
        outputText = lines.join('\n');
      //}

      const header = `# Full Tree at ${result.startPath}\n\n` +
        `Stats: Directories=${result.stats.totalDirs}, Files=${result.stats.totalFiles}` +
        (typeof args.maxDepth === 'number' ? `, MaxDepth=${args.maxDepth}` : '') + '\n\n';

      return {
        content: [
          {
            type: 'text',
            text: header + outputText
          }
        ]
      };
    }

    case 'read_document': {
      const content = await getRawContent(config, logger, args.path);
      return {
        content: [
          {
            type: 'text',
            text: `# ${args.path}\n\n${content}`
          }
        ]
      };
    }

    case 'create_document': {
      // Extract filename and directory
      const pathParts = args.path.split('/').filter(p => p);
      const filename = pathParts.pop();
      const dirPath = pathParts.join('/');

      const buffer = Buffer.from(args.content, 'utf-8');
      await uploadFileData(config, logger, dirPath, buffer, filename);

      // Embedding notification (fire-and-forget)
      const { chatbotService } = req.app.locals;
      const targetDir = validatePath(config.docsRoot, dirPath || '/');
      notifyAdd(chatbotService, logger, path.join(targetDir, filename));

      return {
        content: [
          {
            type: 'text',
            text: `Successfully created/updated: ${args.path}`
          }
        ]
      };
    }

    case 'delete_document': {
      // Collect .md paths before deletion for embedding notification
      const { chatbotService: delChatbot } = req.app.locals;
      const delAbsPath = validatePath(config.docsRoot, args.path);
      const mdFiles = delChatbot ? await collectMdFiles(delAbsPath) : [];

      await deleteEntryData(config, logger, args.path);

      // Embedding notification (fire-and-forget)
      notifyBatchRemove(delChatbot, logger, mdFiles);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully deleted: ${args.path}`
          }
        ]
      };
    }

    case 'DocuLight_get_config': {
      const configResult = await getConfig(config, logger, args.section || 'all');

      // JSON 포맷으로 출력
      let output = JSON.stringify(configResult, null, 2);

      return {
        content: [
          {
            type: 'text',
            text: `# Configuration (section: ${args.section || 'all'})\n\n\`\`\`json\n${output}\n\`\`\``
          }
        ]
      };
    }

    case 'DocuLight_search': {
      const searchMode = args.mode || 'snippets';
      const searchResult = await searchDocuments(
        config,
        logger,
        args.query,
        {
          limit: args.limit || 10,
          path: args.path || '/',
          mode: searchMode
        }
      );

      // 결과 포맷팅 (모드별)
      let output = `# Search Results for "${searchResult.query}"\n\n`;
      output += `**Mode**: ${searchResult.mode}\n`;
      output += `**Statistics**: ${searchResult.total} matches in ${searchResult.filesScanned} files scanned (${searchResult.duration})\n\n`;

      if (searchResult.results.length === 0) {
        output += '(No matches found)';
      } else if (searchResult.mode === 'titles_only') {
        // Minimal format: file list with titles
        for (let i = 0; i < searchResult.results.length; i++) {
          const fileResult = searchResult.results[i];
          output += `${i + 1}. ${fileResult.path} - "${fileResult.title}"\n`;
        }
      } else if (searchResult.mode === 'full_context') {
        // Detailed format: full sections
        for (let i = 0; i < searchResult.results.length; i++) {
          const fileResult = searchResult.results[i];
          output += `## ${i + 1}. ${fileResult.path}\n\n`;
          output += `**Title**: ${fileResult.title}\n\n`;

          if (fileResult.sections && fileResult.sections.length > 0) {
            for (const section of fileResult.sections) {
              if (section.heading) {
                output += `${section.heading}\n\n`;
              }
              // Remove heading from content if present
              const content = section.heading
                ? section.content.replace(section.heading, '').trim()
                : section.content;
              output += `${content}\n\n`;
            }
          }
          output += '---\n\n';
        }
      } else {
        // snippets (default): existing format
        for (let i = 0; i < searchResult.results.length; i++) {
          const fileResult = searchResult.results[i];
          output += `## ${i + 1}. ${fileResult.path}\n\n`;

          for (const match of fileResult.matches) {
            output += `**Line ${match.line}**: ${match.content}\n\n`;
            output += '```\n' + match.context + '\n```\n\n';
          }
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ]
      };
    }

    case 'query_document': {
      const queryService = new QueryDocumentService(config, logger);
      const result = await queryService.queryDocument(
        args.path,
        args.query,
        { maxTokens: args.maxTokens || 2000 }
      );

      const output = queryService.formatAsMarkdown(result);

      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ]
      };
    }

    case 'summarize_document': {
      const summarizeService = new SummarizeDocumentService(config, logger);
      const summary = await summarizeService.summarizeDocument(args.path);
      const output = summarizeService.formatAsMarkdown(summary);

      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ]
      };
    }

    case 'DocuLight_smart_search': {
      const smartSearchService = new SmartSearchService(config, logger);
      // app.locals에서 vectorStoreManager 참조
      smartSearchService.initialize(req.app.locals);

      const result = await smartSearchService.smartSearch(args.query, {
        path: args.path || '/',
        mode: args.mode || 'auto',
        maxTokens: args.maxTokens || 2000,
        limit: args.limit || 5
      });

      const output = smartSearchService.formatAsMarkdown(result);

      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ]
      };
    }

    case 'resolve_project': {
      const resolver = req.app.locals.projectResolver;
      if (!resolver) {
        throw new Error('Project resolver not initialized');
      }

      const results = resolver.resolve(args.name, {
        limit: args.limit || 5,
        version: args.version || null
      });

      const output = resolver.formatAsMarkdown(args.name, results);

      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ]
      };
    }

    case 'query_code_examples': {
      const extractor = new CodeBlockExtractorService(config, logger);
      const results = await extractor.extract(args.query, {
        path: args.path || '/',
        language: args.language || null,
        maxTokens: args.maxTokens || 3000,
        limit: args.limit || 10
      });

      const output = extractor.formatAsMarkdown(args.query, results);

      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
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

  // MCP endpoint - JSON-RPC 2.0
  router.post('/mcp', express.json(), async (req, res) => {
    const { config, logger } = req.app.locals;
    const { jsonrpc, id, method, params } = req.body;

    // JSON-RPC 2.0 validation
    if (jsonrpc !== '2.0') {
      return res.json(createJsonRpcError(id, -32600, 'Invalid Request', 'jsonrpc must be "2.0"'));
    }

    if (!method) {
      return res.json(createJsonRpcError(id, -32600, 'Invalid Request', 'method is required'));
    }

    try {
      switch (method) {
        case 'tools/list':
          logger.info('MCP: tools/list called');
          return res.json(createJsonRpcResponse(id, { tools: TOOLS }));

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
            const result = await executeTool(config, logger, name, args || {}, req);
            activityLogger.mcp('TOOL=' + name, { user: mcpUser, ip: req.ip, args: summarizeArgs(args) });
            return res.json(createJsonRpcResponse(id, result));
          } catch (toolError) {
            if (toolError.message.startsWith('UNAUTHORIZED')) {
              activityLogger.mcpError('AUTH_FAILED', { ip: req.ip, tool: name });
            } else {
              activityLogger.mcpError('TOOL=' + name + ' ERROR', { user: mcpUser, ip: req.ip, error: toolError.message });
            }
            throw toolError;
          }
        }

        case 'initialize':
          logger.info('MCP: initialize called');
          activityLogger.mcp('INITIALIZE', { ip: req.ip });
          return res.json(createJsonRpcResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'DocuLight',
              version: '1.0.0'
            },
            instructions: 'Use this server to retrieve internal documentation and code examples.\n\nRecommended workflow:\n1. Call resolve_project to find the right document path for a project/library name\n2. Call query_document or query_code_examples with the resolved path\n3. Use DocuLight_smart_search for cross-document natural language search\n4. Use summarize_document to understand document structure before reading full content\n\nTips:\n- Always call resolve_project first if you don\'t know the exact document path\n- Use query_code_examples when you specifically need code snippets\n- Set maxTokens to control response size and save context window'
          }));

        default:
          return res.json(createJsonRpcError(id, -32601, 'Method not found', `Method ${method} not supported`));
      }
    } catch (error) {
      logger.error('MCP error', {
        method,
        error: error.message
      });

      return res.json(createJsonRpcError(id, -32603, 'Internal error', error.message));
    }
  });

  return router;
}

module.exports = createMcpRouter;
