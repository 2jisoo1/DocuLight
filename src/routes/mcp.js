const express = require('express');
const {
  getTreeData,
  getRawContent,
  uploadFileData,
  deleteEntryData
} = require('./api-ctrl');

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
    description: 'List all documents in a directory',
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
    description: 'Recursively list all documents and directories starting from a path',
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
    description: 'Read a markdown document',
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
    description: 'Create or update a markdown document',
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
    description: 'Delete a document or directory',
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
  }
];

/**
 * MCP Tool 실행
 */
async function executeTool(config, logger, name, args) {
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
      const { getFullTreeData } = require('./api-ctrl');
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
      await deleteEntryData(config, logger, args.path);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully deleted: ${args.path}`
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

          const result = await executeTool(config, logger, name, args || {});
          return res.json(createJsonRpcResponse(id, result));
        }

        case 'initialize':
          logger.info('MCP: initialize called');
          return res.json(createJsonRpcResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'doclight',
              version: '1.0.0'
            }
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
