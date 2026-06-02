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
