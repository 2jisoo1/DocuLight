'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadConfig,
  normalizeMcpSecurityConfig,
} = require('../../src/utils/config-loader');

function captureWarnings(fn) {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(String(message));
  try {
    const value = fn();
    return { value, warnings };
  } finally {
    console.warn = originalWarn;
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

function withTempConfig(configBody, fn) {
  const originalCwd = process.cwd();
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-mcp-config-'));
  const docsRoot = path.join(testDir, 'docs');
  const dataDir = path.join(testDir, 'data');
  fs.mkdirSync(docsRoot, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(docsRoot, 'index.md'), '# test\n', 'utf8');
  fs.writeFileSync(path.join(testDir, 'config.json5'), configBody(docsRoot, dataDir), 'utf8');

  try {
    process.chdir(testDir);
    return fn();
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

console.log('\nconfig-security: checking MCP security config normalization\n');

test('creates localhost MCP allowlist defaults from port and http scheme', () => {
  const config = normalizeMcpSecurityConfig({
    port: 3100,
    ssl: { enabled: false },
  });

  assert.deepStrictEqual(config.mcp.allowedOrigins, [
    'http://localhost:3100',
    'http://127.0.0.1:3100',
    'http://[::1]:3100',
  ]);
  assert.deepStrictEqual(config.mcp.allowedHosts, [
    'localhost',
    '127.0.0.1',
    '::1',
  ]);
});

test('uses https origin defaults when SSL is enabled', () => {
  const config = normalizeMcpSecurityConfig({
    port: 3443,
    ssl: { enabled: true },
  });

  assert.deepStrictEqual(config.mcp.allowedOrigins, [
    'https://localhost:3443',
    'https://127.0.0.1:3443',
    'https://[::1]:3443',
  ]);
});

test('omits standard ports from default HTTP and HTTPS origins', () => {
  const httpConfig = normalizeMcpSecurityConfig({
    port: 80,
    ssl: { enabled: false },
  });
  const httpsConfig = normalizeMcpSecurityConfig({
    port: 443,
    ssl: { enabled: true },
  });

  assert.deepStrictEqual(httpConfig.mcp.allowedOrigins, [
    'http://localhost',
    'http://127.0.0.1',
    'http://[::1]',
  ]);
  assert.deepStrictEqual(httpsConfig.mcp.allowedOrigins, [
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
  ]);
});

test('includes explicit non-wildcard config.host in default allowlists', () => {
  const config = normalizeMcpSecurityConfig({
    port: 3000,
    host: 'docs.internal',
  });

  assert(config.mcp.allowedOrigins.includes('http://docs.internal:3000'));
  assert(config.mcp.allowedHosts.includes('docs.internal'));
});

test('does not include wildcard bind address in default allowlists', () => {
  const config = normalizeMcpSecurityConfig({
    port: 3000,
    host: '0.0.0.0',
  });

  assert(!config.mcp.allowedOrigins.includes('http://0.0.0.0:3000'));
  assert(!config.mcp.allowedHosts.includes('0.0.0.0'));
});

test('preserves valid custom allowlists', () => {
  const config = normalizeMcpSecurityConfig({
    mcp: {
      allowedOrigins: ['https://docs.example.com'],
      allowedHosts: ['docs.example.com', 'docs.example.com:8443', '[::1]:3000'],
    },
  });

  assert.deepStrictEqual(config.mcp.allowedOrigins, ['https://docs.example.com']);
  assert.deepStrictEqual(config.mcp.allowedHosts, ['docs.example.com', 'docs.example.com:8443', '[::1]:3000']);
});

test('accepts bare IPv6 host entries before URL parsing', () => {
  const config = normalizeMcpSecurityConfig({
    mcp: {
      allowedHosts: ['::1'],
    },
  });

  assert.deepStrictEqual(config.mcp.allowedHosts, ['::1']);
});

test('rejects non-array allowedOrigins with config key in error', () => {
  assert.throws(
    () => normalizeMcpSecurityConfig({ mcp: { allowedOrigins: 'https://docs.example.com' } }),
    /mcp\.allowedOrigins/
  );
});

test('rejects invalid origin entries with config key in error', () => {
  assert.throws(
    () => normalizeMcpSecurityConfig({ mcp: { allowedOrigins: ['docs.example.com'] } }),
    /mcp\.allowedOrigins/
  );
});

test('rejects non-array allowedHosts with config key in error', () => {
  assert.throws(
    () => normalizeMcpSecurityConfig({ mcp: { allowedHosts: 'docs.example.com' } }),
    /mcp\.allowedHosts/
  );
});

test('rejects invalid host entries with config key in error', () => {
  assert.throws(
    () => normalizeMcpSecurityConfig({ mcp: { allowedHosts: ['http://docs.example.com'] } }),
    /mcp\.allowedHosts/
  );
});

test('rejects host entries with paths', () => {
  assert.throws(
    () => normalizeMcpSecurityConfig({ mcp: { allowedHosts: ['docs.example.com/path'] } }),
    /mcp\.allowedHosts/
  );
});

test('rejects host entries with query, fragment, missing port, or unbracketed IPv6 port', () => {
  for (const host of [
    'docs.example.com?x=1',
    'docs.example.com#frag',
    'docs.example.com:',
    '::1:3000',
    'bad host:123',
    '-bad.example:123',
    'example..com:123',
    'example.com:99999',
  ]) {
    assert.throws(
      () => normalizeMcpSecurityConfig({ mcp: { allowedHosts: [host] } }),
      /mcp\.allowedHosts/
    );
  }
});

test('allows wildcard and warns that it is insecure', () => {
  const { value, warnings } = captureWarnings(() => normalizeMcpSecurityConfig({
    mcp: {
      allowedOrigins: ['*', 'https://docs.example.com'],
      allowedHosts: ['*', 'docs.example.com'],
    },
  }));

  assert.deepStrictEqual(value.mcp.allowedOrigins, ['*', 'https://docs.example.com']);
  assert.deepStrictEqual(value.mcp.allowedHosts, ['*', 'docs.example.com']);
  assert(warnings.some(message => message.includes('mcp.allowedOrigins') && message.includes('wildcard')));
  assert(warnings.some(message => message.includes('mcp.allowedHosts') && message.includes('wildcard')));
});

test('preserves wildcard list order and warns', () => {
  const { value, warnings } = captureWarnings(() => normalizeMcpSecurityConfig({
    mcp: {
      allowedOrigins: ['*', 'https://docs.example.com'],
      allowedHosts: ['*', 'docs.example.com'],
    },
  }));

  assert.strictEqual(value.mcp.allowedOrigins[0], '*');
  assert.strictEqual(value.mcp.allowedHosts[0], '*');
  assert.strictEqual(warnings.length, 2);
});

test('loadConfig applies MCP defaults through startup config path', () => {
  withTempConfig((docsRoot, dataDir) => `{
    docsRoot: ${JSON.stringify(docsRoot)},
    dataDir: ${JSON.stringify(dataDir)},
    port: 3100,
  }`, () => {
    const config = loadConfig();
    assert(config.mcp.allowedOrigins.includes('http://127.0.0.1:3100'));
    assert(config.mcp.allowedHosts.includes('127.0.0.1'));
  });
});

test('loadConfig rejects invalid MCP config through startup config path', () => {
  withTempConfig((docsRoot, dataDir) => `{
    docsRoot: ${JSON.stringify(docsRoot)},
    dataDir: ${JSON.stringify(dataDir)},
    mcp: { allowedHosts: "docs.example.com" },
  }`, () => {
    assert.throws(() => loadConfig(), /mcp\.allowedHosts/);
  });
});

console.log('\nconfig-security OK\n');
