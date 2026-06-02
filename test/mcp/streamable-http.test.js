'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

let app;
let port;
let docsRoot;

const TOOL_PREFIX = 'list';
const TEST_API_KEY = 'streamable-http-test-key';

function request({ method = 'POST', path = '/mcp', body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const requestHeaders = { ...headers };
    if (payload !== null) {
      requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json';
      requestHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: requestHeaders,
    }, (res) => {
      let text = '';
      res.on('data', chunk => {
        text += chunk;
      });
      res.on('end', () => {
        let json = null;
        if (text) {
          try {
            json = JSON.parse(text);
          } catch (error) {
            return reject(new Error(`Failed to parse JSON response: ${text}`));
          }
        }
        resolve({ res, text, json });
      });
    });

    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function rpc(method, params, extra = {}) {
  return request({
    method: 'POST',
    body: {
      jsonrpc: '2.0',
      id: extra.id || 1,
      method,
      ...(params ? { params } : {}),
    },
    headers: extra.headers || {},
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function writeTestConfig(testDir, selectedPort) {
  docsRoot = path.join(testDir, 'docs');
  const dataDir = path.join(testDir, 'data');
  fs.mkdirSync(docsRoot, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(docsRoot, 'index.md'), '# MCP test docs\n', 'utf8');
  fs.writeFileSync(path.join(docsRoot, 'protected-delete-target.md'), '# keep me\n', 'utf8');
  fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify({
    version: 1,
    users: [{
      id: 'test-user',
      email: 'mcp-test@example.com',
      passwordHash: 'unused',
      groupId: 'test-group',
      userKeyHash: crypto.createHash('sha256').update(TEST_API_KEY).digest('hex'),
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
  }, null, 2), 'utf8');

  const config = `{
  docsRoot: ${JSON.stringify(docsRoot)},
  dataDir: ${JSON.stringify(dataDir)},
  logDir: ${JSON.stringify(path.join(testDir, 'logs'))},
  port: ${selectedPort},
  host: "127.0.0.1",
  cache: { enabled: false },
  ui: {
    title: ${JSON.stringify(TOOL_PREFIX)},
    indexFile: null,
    mcpIndexFile: null,
    apiIndexFile: null,
  },
  auth: {
    requireReadLogin: true,
    allowSignup: true,
    signupMode: "approval",
  },
  hotReload: {
    allowPortSslAutoRestart: false,
  },
}
`;

  fs.writeFileSync(path.join(testDir, 'config.json5'), config, 'utf8');
}

(async function main() {
  let serverStarted = false;
  const originalCwd = process.cwd();
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-mcp-http-'));

  try {
    console.log('\nstreamable-http: checking MCP HTTP interoperability\n');

    port = await findFreePort();
    writeTestConfig(testDir, port);
    process.chdir(testDir);
    app = require('../../src/app');

    const startRes = await app.start();
    assert.strictEqual(startRes.success, true, `server failed to start: ${JSON.stringify(startRes)}`);
    serverStarted = true;
    await new Promise(resolve => setTimeout(resolve, 500));

    await test('GET /mcp returns 405 with Allow: POST', async () => {
      const { res, json } = await request({ method: 'GET' });
      assert.strictEqual(res.statusCode, 405);
      assert.strictEqual(res.headers.allow, 'POST');
      assert.strictEqual(json.error.code, 'METHOD_NOT_ALLOWED');
    });

    await test('initialize echoes supported protocol version', async () => {
      const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(json.result.protocolVersion, '2025-11-25');
    });

    await test('browser request from allowed local Origin is accepted', async () => {
      const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
        headers: { Origin: `http://127.0.0.1:${port}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(json.result.protocolVersion, '2025-11-25');
    });

    await test('browser request from disallowed Origin is rejected', async () => {
      const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
        headers: { Origin: 'http://evil.example' },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(json.error.code, 'FORBIDDEN_ORIGIN');
    });

    await test('browser request with disallowed Host is rejected', async () => {
      const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
        headers: {
          Origin: `http://127.0.0.1:${port}`,
          Host: `evil.example:${port}`,
        },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(json.error.code, 'FORBIDDEN_HOST');
    });

    function rawMcpRequest({ method = 'POST', path = '/mcp', headers = [], body, rawBody }) {
      return new Promise((resolve, reject) => {
        const payload = rawBody !== undefined ? rawBody : (body === undefined ? null : JSON.stringify(body));
        const socket = net.connect(port, '127.0.0.1');
        socket.setTimeout(3000, () => {
          socket.destroy(new Error('raw MCP request timed out'));
        });
        let response = '';
        socket.on('connect', () => {
          socket.write([
            `${method} ${path} HTTP/1.0`,
            ...headers,
            ...(payload === null ? [] : [
              'Content-Type: application/json',
              `Content-Length: ${Buffer.byteLength(payload)}`,
            ]),
            '',
            payload || '',
          ].join('\r\n'));
          socket.end();
        });
        socket.on('data', chunk => {
          response += chunk.toString('utf8');
        });
        socket.on('end', () => {
          const statusCode = Number(response.match(/^HTTP\/1\.1 (\d+)/)?.[1]);
          const bodyText = response.split('\r\n\r\n')[1] || '';
          resolve({ statusCode, json: bodyText ? JSON.parse(bodyText) : null });
        });
        socket.on('error', reject);
      });
    }

    function rawMcpRequestWithoutHost(body) {
      return rawMcpRequest({ body });
    }

    await test('GET /mcp with disallowed Host is rejected before 405', async () => {
      const { res, json } = await request({
        method: 'GET',
        headers: { Host: `evil.example:${port}` },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(json.error.code, 'FORBIDDEN_HOST');
    });

    await test('POST /mcp validates source before JSON parsing', async () => {
      const disallowedHost = await rawMcpRequest({
        headers: [
          `Host: evil.example:${port}`,
        ],
        rawBody: '{',
      });
      assert.strictEqual(disallowedHost.statusCode, 403);
      assert.strictEqual(disallowedHost.json.error.code, 'FORBIDDEN_HOST');

      const malformedOrigin = await rawMcpRequest({
        headers: [
          `Host: 127.0.0.1:${port}`,
          'Origin: https://docs.example.com/path',
        ],
        rawBody: '{',
      });
      assert.strictEqual(malformedOrigin.statusCode, 403);
      assert.strictEqual(malformedOrigin.json.error.code, 'FORBIDDEN_ORIGIN');

      const trailingSlash = await rawMcpRequest({
        path: '/mcp/',
        headers: [
          `Host: evil.example:${port}`,
        ],
        rawBody: '{',
      });
      assert.strictEqual(trailingSlash.statusCode, 403);
      assert.strictEqual(trailingSlash.json.error.code, 'FORBIDDEN_HOST');
    });

    await test('originless request with disallowed Host is rejected', async () => {
      const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
        headers: {
          Host: `evil.example:${port}`,
        },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(json.error.code, 'FORBIDDEN_HOST');
    });

    await test('custom allowed Host without port allows any port', async () => {
      app.locals.config.mcp.allowedOrigins = ['https://docs.example.com'];
      app.locals.config.mcp.allowedHosts = ['docs.example.com'];
      try {
        const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
          headers: {
            Origin: 'https://docs.example.com',
            Host: 'docs.example.com:8443',
          },
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(json.result.protocolVersion, '2025-11-25');
      } finally {
        app.locals.config.mcp.allowedOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`];
        app.locals.config.mcp.allowedHosts = ['localhost', '127.0.0.1', '::1'];
      }
    });

    await test('host:port allowlist entry requires exact port', async () => {
      app.locals.config.mcp.allowedOrigins = ['https://docs.example.com'];
      app.locals.config.mcp.allowedHosts = ['docs.example.com:8443'];
      try {
        const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
          headers: {
            Origin: 'https://docs.example.com',
            Host: 'docs.example.com:8444',
          },
        });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(json.error.code, 'FORBIDDEN_HOST');
      } finally {
        app.locals.config.mcp.allowedOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`];
        app.locals.config.mcp.allowedHosts = ['localhost', '127.0.0.1', '::1'];
      }
    });

    await test('host:80 allowlist entry still requires exact port', async () => {
      app.locals.config.mcp.allowedOrigins = ['https://docs.example.com'];
      app.locals.config.mcp.allowedHosts = ['docs.example.com:80'];
      try {
        const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
          headers: {
            Origin: 'https://docs.example.com',
            Host: 'docs.example.com:8443',
          },
        });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(json.error.code, 'FORBIDDEN_HOST');
      } finally {
        app.locals.config.mcp.allowedOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`];
        app.locals.config.mcp.allowedHosts = ['localhost', '127.0.0.1', '::1'];
      }
    });

    await test('host:443 allowlist entry still requires exact port', async () => {
      app.locals.config.mcp.allowedOrigins = ['https://docs.example.com'];
      app.locals.config.mcp.allowedHosts = ['docs.example.com:443'];
      try {
        const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
          headers: {
            Origin: 'https://docs.example.com',
            Host: 'docs.example.com',
          },
        });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(json.error.code, 'FORBIDDEN_HOST');
      } finally {
        app.locals.config.mcp.allowedOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`];
        app.locals.config.mcp.allowedHosts = ['localhost', '127.0.0.1', '::1'];
      }
    });

    await test('wildcard Origin and Host allow arbitrary browser request', async () => {
      app.locals.config.mcp.allowedOrigins = ['*'];
      app.locals.config.mcp.allowedHosts = ['*'];
      try {
        const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
          headers: {
            Origin: 'https://evil.example',
            Host: 'evil.example:4444',
          },
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(json.result.protocolVersion, '2025-11-25');
      } finally {
        app.locals.config.mcp.allowedOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`];
        app.locals.config.mcp.allowedHosts = ['localhost', '127.0.0.1', '::1'];
      }
    });

    await test('wildcard Origin still rejects malformed present Origin', async () => {
      app.locals.config.mcp.allowedOrigins = ['*'];
      app.locals.config.mcp.allowedHosts = ['*'];
      try {
        for (const originHeader of [
          'Origin:',
          'Origin: https://docs.example.com/path',
          'Origin: https://docs.example.com?x=1',
          'Origin: https://docs.example.com#x',
          'Origin: https://user:pass@docs.example.com',
        ]) {
          const result = await rawMcpRequest({
            headers: [
              `Host: 127.0.0.1:${port}`,
              originHeader,
            ],
            body: {
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: { protocolVersion: '2025-11-25' },
            },
          });
          assert.strictEqual(result.statusCode, 403);
          assert.strictEqual(result.json.error.code, 'FORBIDDEN_ORIGIN');
        }
      } finally {
        app.locals.config.mcp.allowedOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`];
        app.locals.config.mcp.allowedHosts = ['localhost', '127.0.0.1', '::1'];
      }
    });

    await test('wildcard Host still rejects malformed or missing Host', async () => {
      app.locals.config.mcp.allowedOrigins = ['*'];
      app.locals.config.mcp.allowedHosts = ['*'];
      try {
        for (const headers of [
          [],
          ['Host: http://127.0.0.1/mcp'],
          ['Host: bad host:123'],
          ['Host: -bad.example:123'],
          ['Host: example..com:123'],
          ['Host: example.com:99999'],
        ]) {
          const result = await rawMcpRequest({
            headers,
            body: {
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: { protocolVersion: '2025-11-25' },
            },
          });
          assert.strictEqual(result.statusCode, 403);
          assert.strictEqual(result.json.error.code, 'FORBIDDEN_HOST');
        }
      } finally {
        app.locals.config.mcp.allowedOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`];
        app.locals.config.mcp.allowedHosts = ['localhost', '127.0.0.1', '::1'];
      }
    });

    await test('malformed Origin is rejected', async () => {
      const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
        headers: {
          Origin: 'not a url',
          Host: `127.0.0.1:${port}`,
        },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(json.error.code, 'FORBIDDEN_ORIGIN');
    });

    await test('Origin null is rejected', async () => {
      const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
        headers: {
          Origin: 'null',
          Host: `127.0.0.1:${port}`,
        },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(json.error.code, 'FORBIDDEN_ORIGIN');
    });

    await test('empty Origin header is rejected', async () => {
      const result = await rawMcpRequest({
        headers: [
          `Host: 127.0.0.1:${port}`,
          'Origin:',
        ],
        body: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-11-25' },
        },
      });
      assert.strictEqual(result.statusCode, 403);
      assert.strictEqual(result.json.error.code, 'FORBIDDEN_ORIGIN');
    });

    await test('missing Host is rejected', async () => {
      const result = await rawMcpRequestWithoutHost({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-11-25' },
      });
      assert.strictEqual(result.statusCode, 403);
      assert.strictEqual(result.json.error.code, 'FORBIDDEN_HOST');
    });

    await test('Host with scheme, path, query, or fragment characters is rejected', async () => {
      for (const host of [`http://127.0.0.1:${port}`, `127.0.0.1:${port}/mcp`, `127.0.0.1:${port}?x=1`, `127.0.0.1:${port}#x`]) {
        const result = await rawMcpRequest({
          headers: [
            `Host: ${host}`,
          ],
          body: {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2025-11-25' },
          },
        });
        assert.strictEqual(result.statusCode, 403);
        assert.strictEqual(result.json.error.code, 'FORBIDDEN_HOST');
      }
    });

    await test('X-Forwarded-Host does not bypass Host validation', async () => {
      const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
        headers: {
          Origin: `http://127.0.0.1:${port}`,
          Host: 'evil.example',
          'X-Forwarded-Host': `127.0.0.1:${port}`,
        },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(json.error.code, 'FORBIDDEN_HOST');
    });

    await test('initialize falls back on unsupported requested protocol version', async () => {
      const { res, json } = await rpc('initialize', { protocolVersion: '1900-01-01' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(json.result.protocolVersion, '2025-11-25');
    });

    await test('notifications/initialized returns 202 empty body', async () => {
      const { res, text } = await request({
        body: { jsonrpc: '2.0', method: 'notifications/initialized' },
        headers: { 'MCP-Protocol-Version': '2025-11-25' },
      });
      assert.strictEqual(res.statusCode, 202);
      assert.strictEqual(text, '');
    });

    await test('tools/list accepts JSON and event-stream Accept values but returns JSON', async () => {
      const { res, json } = await rpc('tools/list', null, {
        headers: {
          'MCP-Protocol-Version': '2025-11-25',
          Accept: 'application/json, text/event-stream',
        },
      });
      assert.strictEqual(res.statusCode, 200);
      assert(Array.isArray(json.result.tools), 'result.tools should be an array');
    });

    await test('tools/list rejects unsupported MCP-Protocol-Version header', async () => {
      const { res, json } = await rpc('tools/list', null, {
        headers: { 'MCP-Protocol-Version': '2024-11-05' },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(json.error.code, 'UNSUPPORTED_MCP_PROTOCOL_VERSION');
    });

    await test('tools/list rejects unacceptable Accept header', async () => {
      const { res, json } = await rpc('tools/list', null, {
        headers: {
          'MCP-Protocol-Version': '2025-11-25',
          Accept: 'text/event-stream',
        },
      });
      assert.strictEqual(res.statusCode, 406);
      assert.strictEqual(json.error.code, 'NOT_ACCEPTABLE');
    });

    await test('JSON-RPC response messages return 202 empty body', async () => {
      const { res, text } = await request({
        body: { jsonrpc: '2.0', id: 99, result: { ok: true } },
        headers: { 'MCP-Protocol-Version': '2025-11-25' },
      });
      assert.strictEqual(res.statusCode, 202);
      assert.strictEqual(text, '');
    });

    await test('batch array body returns JSON-RPC Invalid Request error', async () => {
      const { res, json } = await request({
        body: [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }],
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(json.error.code, -32600);
    });

    await test('tools/list allows missing MCP-Protocol-Version compatibility mode', async () => {
      const { res, json } = await rpc('tools/list');
      assert.strictEqual(res.statusCode, 200);
      assert(Array.isArray(json.result.tools), 'result.tools should be an array');
    });

    await test('constructor tool name is rejected without leaking config data', async () => {
      const { res, text, json } = await rpc('tools/call', {
        name: 'constructor',
        arguments: {},
      });
      assert.strictEqual(res.statusCode, 200);
      assert(json.error, 'constructor should return JSON-RPC error');
      assert(String(json.error.data || json.error.message).includes('Unknown tool'));
      assert(!text.includes(docsRoot), 'response must not include docsRoot');
      assert(!text.includes(path.join(path.dirname(docsRoot), 'data')), 'response must not include dataDir');
    });

    await test('canonical list_documents works when prefix collides with list_* names', async () => {
      const { res, json } = await rpc('tools/call', {
        name: 'list_documents',
        arguments: { path: '/' },
      }, {
        headers: { 'X-API-Key': TEST_API_KEY },
      });
      assert.strictEqual(res.statusCode, 200);
      assert(!json.error, `list_documents failed: ${JSON.stringify(json.error)}`);
      assert(Array.isArray(json.result.content), 'list_documents should return content array');
    });

    await test('prefixed create_document is rejected as unknown and creates no file', async () => {
      const targetPath = path.join(docsRoot, 'prefixed-create-should-not-exist.md');
      const { res, json } = await rpc('tools/call', {
        name: `${TOOL_PREFIX}_create_document`,
        arguments: { path: 'prefixed-create-should-not-exist.md', content: '# blocked\n' },
      });
      assert.strictEqual(res.statusCode, 200);
      assert(json.error, 'prefixed create_document should return JSON-RPC error');
      assert(String(json.error.data || json.error.message).includes('Unknown tool'));
      assert.strictEqual(fs.existsSync(targetPath), false);
    });

    await test('prefixed delete_document is rejected as unknown and does not delete', async () => {
      const targetPath = path.join(docsRoot, 'protected-delete-target.md');
      const { res, json } = await rpc('tools/call', {
        name: `${TOOL_PREFIX}_delete_document`,
        arguments: { path: 'protected-delete-target.md' },
      });
      assert.strictEqual(res.statusCode, 200);
      assert(json.error, 'prefixed delete_document should return JSON-RPC error');
      assert(String(json.error.data || json.error.message).includes('Unknown tool'));
      assert.strictEqual(fs.existsSync(targetPath), true);
    });

    await test('canonical get_config requires read authentication', async () => {
      const { res, json } = await rpc('tools/call', {
        name: 'get_config',
        arguments: { section: 'all' },
      });
      assert.strictEqual(res.statusCode, 200);
      assert(json.error, 'canonical get_config should return JSON-RPC error');
      assert(String(json.error.data || json.error.message).includes('UNAUTHORIZED'));
    });

    await test('advertised get_config requires read authentication', async () => {
      const { res, json } = await rpc('tools/call', {
        name: `${TOOL_PREFIX}_get_config`,
        arguments: { section: 'all' },
      });
      assert.strictEqual(res.statusCode, 200);
      assert(json.error, 'advertised get_config should return JSON-RPC error');
      assert(String(json.error.data || json.error.message).includes('UNAUTHORIZED'));
    });

    console.log('\nstreamable-http OK\n');
  } catch (error) {
    console.error('\nstreamable-http failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    if (serverStarted) {
      await app.stop();
    }
    process.chdir(originalCwd);
    fs.rmSync(testDir, { recursive: true, force: true });
    process.exit(process.exitCode || 0);
  }
})();
