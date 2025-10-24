# Step 5: MCP Server & Security Enhancement (Revised)

## 개요

**목표**: MCP 서버 구현 및 보안 강화 (기존 인증 방식 유지)

**핵심 요구사항**:
1. MCP 서버 구현 (문서 CRUD 기능)
2. IP 화이트리스트 (allows) 기능 추가
3. SSL/TLS 지원 (선택적)

**변경 사항**:
- ✅ 기존 Header 기반 인증 유지
- ✅ URL 구조 변경 없음
- ✅ 클라이언트 코드 변경 불필요

---

## 1. MCP 서버 구현

### 1.1 프로젝트 구조

```
doclight-mcp-server/
├── package.json
├── .env.example
├── README.md
└── src/
    ├── index.js          # MCP 서버 메인
    ├── config.js         # 설정 로드
    ├── client.js         # DocLight API 클라이언트
    └── tools/
        ├── list.js       # 문서 목록 조회
        ├── read.js       # 문서 읽기
        ├── create.js     # 문서 생성
        ├── update.js     # 문서 수정
        └── delete.js     # 문서 삭제
```

### 1.2 package.json

**파일**: `doclight-mcp-server/package.json`

```json
{
  "name": "doclight-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for DocLight document management",
  "type": "module",
  "main": "src/index.js",
  "bin": {
    "doclight-mcp": "src/index.js"
  },
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1",
    "form-data": "^4.0.0"
  },
  "keywords": ["mcp", "doclight", "markdown", "documentation"],
  "license": "MIT"
}
```

### 1.3 MCP 서버 메인

**파일**: `doclight-mcp-server/src/index.js`

```javascript
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
```

### 1.4 DocLight API 클라이언트

**파일**: `doclight-mcp-server/src/client.js`

```javascript
import axios from 'axios';
import FormData from 'form-data';

export class DocLightClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  /**
   * API 요청 헬퍼
   */
  async request(method, path, data = null) {
    const url = `${this.baseUrl}/api${path}`;

    try {
      const response = await axios({
        method,
        url,
        headers: {
          'X-API-Key': this.apiKey  // Header 방식 유지
        },
        data,
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        throw new Error('Network error: No response from server');
      } else {
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }

  /**
   * 디렉토리 트리 조회
   */
  async getTree(path = '/') {
    return this.request('GET', `/tree?path=${encodeURIComponent(path)}`);
  }

  /**
   * 파일 읽기
   */
  async readFile(path) {
    const result = await this.request('GET', `/raw?path=${encodeURIComponent(path)}`);
    return result;
  }

  /**
   * 파일 생성/수정 (multipart/form-data)
   */
  async createFile(path, content) {
    const form = new FormData();

    // 파일명과 디렉토리 분리
    const pathParts = path.split('/').filter(p => p);
    const filename = pathParts.pop();
    const dirPath = '/' + pathParts.join('/');

    // Buffer로 변환
    const buffer = Buffer.from(content, 'utf-8');
    form.append('file', buffer, {
      filename: filename,
      contentType: 'text/markdown'
    });

    const url = `${this.baseUrl}/api/upload?path=${encodeURIComponent(dirPath)}`;

    try {
      const response = await axios.post(url, form, {
        headers: {
          ...form.getHeaders(),
          'X-API-Key': this.apiKey
        },
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  /**
   * 파일 삭제
   */
  async deleteFile(path) {
    return this.request('DELETE', `/entry?path=${encodeURIComponent(path)}`);
  }
}
```

### 1.5 Tool 구현

**파일**: `doclight-mcp-server/src/tools/list.js`

```javascript
import { DocLightClient } from '../client.js';

export async function listDocuments(config, path) {
  const client = new DocLightClient(config.baseUrl, config.apiKey);

  try {
    const result = await client.getTree(path);

    // 트리 구조를 텍스트로 변환
    const formatTree = (items, indent = 0) => {
      let output = '';
      for (const item of items) {
        const prefix = '  '.repeat(indent);
        const icon = item.type === 'directory' ? '📁' : '📄';
        output += `${prefix}${icon} ${item.name}\n`;

        if (item.children && item.children.length > 0) {
          output += formatTree(item.children, indent + 1);
        }
      }
      return output;
    };

    const treeText = formatTree(result.children || [result]);

    return {
      content: [
        {
          type: 'text',
          text: `# Documents at ${path}\n\n${treeText}`
        }
      ]
    };
  } catch (error) {
    throw new Error(`Failed to list documents: ${error.message}`);
  }
}
```

**파일**: `doclight-mcp-server/src/tools/read.js`

```javascript
import { DocLightClient } from '../client.js';

export async function readDocument(config, path) {
  const client = new DocLightClient(config.baseUrl, config.apiKey);

  try {
    const result = await client.readFile(path);

    return {
      content: [
        {
          type: 'text',
          text: `# ${path}\n\n${result.content}`
        }
      ]
    };
  } catch (error) {
    throw new Error(`Failed to read document: ${error.message}`);
  }
}
```

**파일**: `doclight-mcp-server/src/tools/create.js`

```javascript
import { DocLightClient } from '../client.js';

export async function createDocument(config, path, content) {
  const client = new DocLightClient(config.baseUrl, config.apiKey);

  try {
    const result = await client.createFile(path, content);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully created/updated: ${path}`
        }
      ]
    };
  } catch (error) {
    throw new Error(`Failed to create document: ${error.message}`);
  }
}
```

**파일**: `doclight-mcp-server/src/tools/update.js`

```javascript
// update는 create와 동일 (덮어쓰기)
export { createDocument as updateDocument } from './create.js';
```

**파일**: `doclight-mcp-server/src/tools/delete.js`

```javascript
import { DocLightClient } from '../client.js';

export async function deleteDocument(config, path) {
  const client = new DocLightClient(config.baseUrl, config.apiKey);

  try {
    const result = await client.deleteFile(path);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully deleted: ${path}`
        }
      ]
    };
  } catch (error) {
    throw new Error(`Failed to delete document: ${error.message}`);
  }
}
```

### 1.6 설정 로더

**파일**: `doclight-mcp-server/src/config.js`

```javascript
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export function loadConfig() {
  const baseUrl = process.env.DOCLIGHT_URL;
  const apiKey = process.env.DOCLIGHT_API_KEY;

  if (!baseUrl) {
    throw new Error('Missing DOCLIGHT_URL environment variable');
  }

  if (!apiKey) {
    throw new Error('Missing DOCLIGHT_API_KEY environment variable');
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey
  };
}
```

### 1.7 환경 변수 예시

**파일**: `doclight-mcp-server/.env.example`

```bash
# DocLight Server Configuration
DOCLIGHT_URL=http://localhost:3000
DOCLIGHT_API_KEY=your-api-key-here
```

### 1.8 MCP Server README

**파일**: `doclight-mcp-server/README.md`

```markdown
# DocLight MCP Server

Model Context Protocol server for DocLight document management.

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` with your DocLight server URL and API key:
```bash
DOCLIGHT_URL=http://localhost:3000
DOCLIGHT_API_KEY=your-api-key-here
```

## Usage

### Standalone Test

```bash
npm start
```

Then send JSON-RPC commands via stdin:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm start
```

### Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "doclight": {
      "command": "node",
      "args": ["/absolute/path/to/doclight-mcp-server/src/index.js"],
      "env": {
        "DOCLIGHT_URL": "http://localhost:3000",
        "DOCLIGHT_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Available Tools

- `doclight_list` - List documents in a directory
- `doclight_read` - Read a document
- `doclight_create` - Create a new document
- `doclight_update` - Update an existing document
- `doclight_delete` - Delete a document

## Example Usage in Claude

```
User: "DocLight에 있는 문서 목록 보여줘"
Claude: [Uses doclight_list tool]

User: "guide/getting-started.md 파일 읽어줘"
Claude: [Uses doclight_read tool]

User: "새 문서 만들어줘: docs/api.md"
Claude: [Uses doclight_create tool]
```
```

---

## 2. IP 화이트리스트 (allows)

### 2.1 설정 구조

**파일**: `config.json5`

```json5
{
  docsRoot: "/data/docs",
  apiKey: "your-api-key",
  port: 3000,

  // IP 화이트리스트 (선택적)
  security: {
    // IP 패턴 배열
    allows: [
      "127.0.0.1",           // 로컬호스트
      "::1",                 // IPv6 로컬호스트
      "10.0.1.*",            // 10.0.1.0-255
      "10.0.100-200.*",      // 10.0.100.0-255 ~ 10.0.200.0-255
      "192.168.1.0/24"       // CIDR 표기법
    ]
  }
}
```

### 2.2 IP 매칭 유틸리티

**새 파일**: `src/utils/ip-matcher.js`

```javascript
/**
 * IP 주소 매칭 유틸리티
 */

/**
 * IP 주소를 숫자로 변환
 */
function ipToNumber(ip) {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * CIDR 표기법 매칭
 * 예: 192.168.1.0/24
 */
function matchCIDR(ip, cidr) {
  const [network, bits] = cidr.split('/');
  const mask = -1 << (32 - parseInt(bits));

  const ipNum = ipToNumber(ip);
  const networkNum = ipToNumber(network);

  return (ipNum & mask) === (networkNum & mask);
}

/**
 * 와일드카드 패턴 매칭
 * 예: 10.0.1.* → 10.0.1.0-255
 * 예: 10.0.100-200.* → 10.0.100.0-255 ~ 10.0.200.0-255
 */
function matchWildcard(ip, pattern) {
  const ipParts = ip.split('.').map(Number);
  const patternParts = pattern.split('.');

  for (let i = 0; i < 4; i++) {
    const ipPart = ipParts[i];
    const patternPart = patternParts[i];

    // 와일드카드
    if (patternPart === '*') {
      continue;
    }

    // 범위 (예: 100-200)
    if (patternPart.includes('-')) {
      const [min, max] = patternPart.split('-').map(Number);
      if (ipPart < min || ipPart > max) {
        return false;
      }
      continue;
    }

    // 정확한 매칭
    if (ipPart !== Number(patternPart)) {
      return false;
    }
  }

  return true;
}

/**
 * IP 주소가 허용된 패턴에 매칭되는지 확인
 */
export function isIpAllowed(ip, allowPatterns) {
  // allowPatterns가 없으면 모든 IP 허용
  if (!allowPatterns || allowPatterns.length === 0) {
    return true;
  }

  // IPv6를 IPv4로 변환 (::ffff:192.168.1.1 → 192.168.1.1)
  const ipv4 = ip.replace(/^::ffff:/, '');

  // IPv6 주소는 별도 처리 필요 (향후 확장)
  if (ipv4.includes(':')) {
    // 현재는 IPv6 로컬호스트만 허용
    return ipv4 === '::1' && allowPatterns.includes('::1');
  }

  // 각 패턴과 매칭 시도
  for (const pattern of allowPatterns) {
    // 정확한 매칭
    if (pattern === ipv4) {
      return true;
    }

    // CIDR 표기법
    if (pattern.includes('/')) {
      if (matchCIDR(ipv4, pattern)) {
        return true;
      }
    }

    // 와일드카드 패턴
    if (pattern.includes('*') || pattern.match(/\d+-\d+/)) {
      if (matchWildcard(ipv4, pattern)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * IP 패턴 유효성 검증
 */
export function validateIpPattern(pattern) {
  // IPv4 정확한 주소
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(pattern)) {
    return true;
  }

  // CIDR 표기법
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(pattern)) {
    return true;
  }

  // 와일드카드 패턴
  if (/^[\d\-*]+\.[\d\-*]+\.[\d\-*]+\.[\d\-*]+$/.test(pattern)) {
    return true;
  }

  // IPv6 (단순 체크)
  if (pattern.includes(':')) {
    return true;
  }

  return false;
}
```

### 2.3 IP 화이트리스트 미들웨어

**새 파일**: `src/middleware/ip-whitelist.js`

```javascript
import { isIpAllowed } from '../utils/ip-matcher.js';

export function createIpWhitelist(config) {
  const allowPatterns = config.security?.allows;

  // allows가 없으면 미들웨어 비활성화
  if (!allowPatterns || allowPatterns.length === 0) {
    return (req, res, next) => next();
  }

  return (req, res, next) => {
    const clientIp = req.ip || req.connection.remoteAddress;

    if (isIpAllowed(clientIp, allowPatterns)) {
      // 허용된 IP
      req.app.locals.logger.debug('IP allowed', { ip: clientIp });
      next();
    } else {
      // 차단된 IP
      req.app.locals.logger.warn('IP blocked', {
        ip: clientIp,
        path: req.path,
        method: req.method
      });

      res.status(403).json({
        error: {
          code: 'IP_BLOCKED',
          message: 'Access denied from your IP address'
        }
      });
    }
  };
}
```

### 2.4 Config Loader 업데이트

**파일**: `src/utils/config-loader.js` (기존 파일 수정)

```javascript
import { validateIpPattern } from './ip-matcher.js';

function loadConfig() {
  // ... 기존 코드 ...

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

  return config;
}
```

### 2.5 App.js 통합

**파일**: `src/app.js` (수정)

```javascript
import { createIpWhitelist } from './middleware/ip-whitelist.js';

// ... 기존 코드 ...

// IP 화이트리스트 미들웨어 (가장 먼저 적용)
app.use(createIpWhitelist(config));

// 기존 미들웨어들
app.use(requestLogger(logger));
// ...
```

---

## 3. SSL/TLS 지원

### 3.1 설정 구조

**파일**: `config.json5`

```json5
{
  docsRoot: "/data/docs",
  apiKey: "your-api-key",
  port: 3000,

  // SSL/TLS 설정 (선택적)
  ssl: {
    enabled: true,
    cert: "/path/to/cert.pem",
    key: "/path/to/key.pem",
    // 선택적: CA 인증서
    ca: "/path/to/ca.pem"
  }
}
```

### 3.2 SSL 검증 유틸리티

**새 파일**: `src/utils/ssl-validator.js`

```javascript
import fs from 'fs';
import crypto from 'crypto';

/**
 * SSL 인증서 및 키 검증
 */
export function validateSSL(sslConfig) {
  const errors = [];

  // 1. 파일 존재 확인
  if (!fs.existsSync(sslConfig.cert)) {
    errors.push(`SSL certificate not found: ${sslConfig.cert}`);
  }

  if (!fs.existsSync(sslConfig.key)) {
    errors.push(`SSL private key not found: ${sslConfig.key}`);
  }

  if (sslConfig.ca && !fs.existsSync(sslConfig.ca)) {
    errors.push(`SSL CA certificate not found: ${sslConfig.ca}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // 2. 파일 읽기 가능 확인
  try {
    fs.readFileSync(sslConfig.cert, 'utf8');
    fs.readFileSync(sslConfig.key, 'utf8');
    if (sslConfig.ca) {
      fs.readFileSync(sslConfig.ca, 'utf8');
    }
  } catch (error) {
    errors.push(`Failed to read SSL files: ${error.message}`);
    return { valid: false, errors };
  }

  // 3. 인증서 형식 검증
  try {
    const certContent = fs.readFileSync(sslConfig.cert, 'utf8');
    const keyContent = fs.readFileSync(sslConfig.key, 'utf8');

    // PEM 형식 확인
    if (!certContent.includes('BEGIN CERTIFICATE')) {
      errors.push('SSL certificate is not in PEM format');
    }

    if (!keyContent.includes('BEGIN PRIVATE KEY') &&
        !keyContent.includes('BEGIN RSA PRIVATE KEY')) {
      errors.push('SSL private key is not in PEM format');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

  } catch (error) {
    errors.push(`SSL validation failed: ${error.message}`);
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * SSL 설정 로드
 */
export function loadSSLOptions(sslConfig) {
  const options = {
    cert: fs.readFileSync(sslConfig.cert),
    key: fs.readFileSync(sslConfig.key)
  };

  if (sslConfig.ca) {
    options.ca = fs.readFileSync(sslConfig.ca);
  }

  return options;
}
```

### 3.3 Config Loader 업데이트

**파일**: `src/utils/config-loader.js` (기존 파일 수정)

```javascript
import { validateSSL } from './ssl-validator.js';

function loadConfig() {
  // ... 기존 코드 ...

  // SSL 설정 검증
  if (config.ssl && config.ssl.enabled) {
    console.log('SSL/TLS enabled, validating certificates...');

    const validation = validateSSL(config.ssl);

    if (!validation.valid) {
      console.error('\n❌ SSL Validation Failed:\n');
      validation.errors.forEach(err => console.error(`  • ${err}`));
      console.error('');
      process.exit(1);
    }

    console.log('✅ SSL certificates validated successfully');
  }

  return config;
}
```

### 3.4 App.js 업데이트 (HTTPS 서버)

**파일**: `src/app.js` (수정)

```javascript
import express from 'express';
import http from 'http';
import https from 'https';
import { loadSSLOptions } from './utils/ssl-validator.js';

// ... 기존 코드 ...

// 서버 시작
const PORT = config.port || 3000;

let server;

if (config.ssl && config.ssl.enabled) {
  // HTTPS 서버
  const sslOptions = loadSSLOptions(config.ssl);
  server = https.createServer(sslOptions, app);

  server.listen(PORT, () => {
    logger.info('DocLight HTTPS server started', {
      port: PORT,
      docsRoot: config.docsRoot,
      ssl: true
    });

    console.log(`\n✅ DocLight Server Started (HTTPS)`);
    console.log(`   📂 Docs: ${config.docsRoot}`);
    console.log(`   🔒 SSL: Enabled`);
    console.log(`   🌐 URL: https://localhost:${PORT}\n`);
  });
} else {
  // HTTP 서버
  server = http.createServer(app);

  server.listen(PORT, () => {
    logger.info('DocLight HTTP server started', {
      port: PORT,
      docsRoot: config.docsRoot,
      ssl: false
    });

    console.log(`\n✅ DocLight Server Started (HTTP)`);
    console.log(`   📂 Docs: ${config.docsRoot}`);
    console.log(`   ⚠️  SSL: Disabled`);
    console.log(`   🌐 URL: http://localhost:${PORT}\n`);
  });
}

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
```

---

## 4. 테스트 계획

### 4.1 MCP 서버 테스트

```bash
# 1. 설치
cd doclight-mcp-server
npm install

# 2. 환경 변수 설정
cp .env.example .env
# .env 편집

# 3. Tool 목록 조회
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm start

# 4. 문서 목록 조회
echo '{
  "jsonrpc":"2.0",
  "id":2,
  "method":"tools/call",
  "params":{
    "name":"doclight_list",
    "arguments":{"path":"/"}
  }
}' | npm start

# 5. 문서 읽기
echo '{
  "jsonrpc":"2.0",
  "id":3,
  "method":"tools/call",
  "params":{
    "name":"doclight_read",
    "arguments":{"path":"/README.md"}
  }
}' | npm start
```

### 4.2 IP 화이트리스트 테스트

```bash
# 1. config.json5에 allows 추가
{
  security: {
    allows: ["127.0.0.1", "10.0.1.*"]
  }
}

# 2. 허용된 IP에서 접근 (로컬)
curl http://localhost:3000/api/tree
# Expected: 200 OK

# 3. 차단된 IP에서 접근 테스트
# 다른 머신에서 또는 프록시 사용
curl http://server-ip:3000/api/tree
# Expected: 403 Forbidden
```

### 4.3 SSL/TLS 테스트

```bash
# 1. 테스트 인증서 생성
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# 2. config.json5 설정
{
  ssl: {
    enabled: true,
    cert: "/path/to/cert.pem",
    key: "/path/to/key.pem"
  }
}

# 3. 서버 시작
npm start
# Expected: "DocLight Server Started (HTTPS)"

# 4. HTTPS 접근
curl -k https://localhost:3000/api/tree
# -k: 자체 서명 인증서 허용

# 5. HTTP 접근 시도
curl http://localhost:3000/api/tree
# Expected: 연결 실패 (HTTPS만 허용)
```

---

## 5. 파일 변경 요약

### 생성할 파일

**MCP Server (11개)**:
1. `doclight-mcp-server/package.json`
2. `doclight-mcp-server/.env.example`
3. `doclight-mcp-server/README.md`
4. `doclight-mcp-server/src/index.js`
5. `doclight-mcp-server/src/config.js`
6. `doclight-mcp-server/src/client.js`
7. `doclight-mcp-server/src/tools/list.js`
8. `doclight-mcp-server/src/tools/read.js`
9. `doclight-mcp-server/src/tools/create.js`
10. `doclight-mcp-server/src/tools/update.js`
11. `doclight-mcp-server/src/tools/delete.js`

**DocLight Server (4개)**:
1. `src/utils/ip-matcher.js` - **NEW**
2. `src/middleware/ip-whitelist.js` - **NEW**
3. `src/utils/ssl-validator.js` - **NEW**
4. `src/utils/config-loader.js` - **수정**
5. `src/app.js` - **수정**

### 수정할 파일

1. `config.example.json5` - security, ssl 예시 추가
2. `README.md` - 문서 업데이트

---

## 6. 구현 순서

### Phase 1: MCP 서버 구현 (3-4시간)
1. ✅ 프로젝트 구조 생성
2. ✅ package.json, .env.example 작성
3. ✅ MCP SDK 통합 (index.js)
4. ✅ DocLight 클라이언트 구현 (client.js)
5. ✅ 5개 Tool 구현 (list, read, create, update, delete)
6. ✅ 로컬 테스트
7. ✅ Claude Desktop 연동 테스트

### Phase 2: IP 화이트리스트 (2-3시간)
1. ✅ ip-matcher.js 구현
2. ✅ ip-whitelist.js 미들웨어 구현
3. ✅ config-loader.js 검증 로직 추가
4. ✅ app.js 통합
5. ✅ 테스트 (로컬/원격 IP)

### Phase 3: SSL/TLS 지원 (2-3시간)
1. ✅ ssl-validator.js 구현
2. ✅ config-loader.js SSL 검증 추가
3. ✅ app.js HTTPS 서버 구현
4. ✅ 테스트 인증서 생성 및 테스트

### Phase 4: 문서화 (1시간)
1. ✅ MCP Server README 작성
2. ✅ config.example.json5 업데이트
3. ✅ README.md 업데이트

**총 예상 시간**: 8-11시간

---

## 7. 성공 기준

- [ ] MCP 서버가 DocLight API 호출 성공
- [ ] Claude Desktop에서 문서 목록 조회
- [ ] Claude Desktop에서 문서 읽기
- [ ] Claude Desktop에서 문서 생성/수정
- [ ] Claude Desktop에서 문서 삭제
- [ ] IP 화이트리스트로 허용된 IP만 접근 가능
- [ ] 차단된 IP는 403 응답
- [ ] SSL 인증서 검증 정상 작동
- [ ] HTTPS 서버 정상 구동
- [ ] 잘못된 SSL 설정 시 서버 종료
- [ ] SSL 없을 시 HTTP로 정상 작동

---

## 8. 다음 단계

Step 5 완료 후:
- MCP 서버 npm 패키지 배포 고려
- 추가 보안 기능 (Rate limiting, Brute force protection)
- 문서 검색 기능
- 문서 버전 관리
