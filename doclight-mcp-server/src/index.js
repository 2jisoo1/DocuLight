#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from './config.js';
import { listDocuments } from './tools/list.js';
import { readDocument } from './tools/read.js';
import { createDocument } from './tools/create.js';
import { updateDocument } from './tools/update.js';
import { deleteDocument } from './tools/delete.js';

const config = loadConfig();

// MCP 서버 초기화
const server = new Server(
  {
    name: 'doclight-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool 목록 제공
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'doclight_list',
        description: 'List all documents in DocLight repository',
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
        name: 'doclight_read',
        description: 'Read a document from DocLight',
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
        name: 'doclight_create',
        description: 'Create a new document in DocLight',
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
        name: 'doclight_update',
        description: 'Update an existing document (same as create - overwrites)',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Document path'
            },
            content: {
              type: 'string',
              description: 'New markdown content'
            }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'doclight_delete',
        description: 'Delete a document from DocLight',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Document path to delete'
            }
          },
          required: ['path']
        }
      }
    ]
  };
});

// Tool 실행
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'doclight_list':
        return await listDocuments(config, args.path || '/');

      case 'doclight_read':
        return await readDocument(config, args.path);

      case 'doclight_create':
      case 'doclight_update':
        return await createDocument(config, args.path, args.content);

      case 'doclight_delete':
        return await deleteDocument(config, args.path);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// 서버 시작
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('DocLight MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
