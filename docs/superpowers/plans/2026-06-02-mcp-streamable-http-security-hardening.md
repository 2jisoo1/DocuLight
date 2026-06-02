# MCP Streamable HTTP Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the PR #2 MCP Streamable HTTP security hardening so `/mcp` validates browser Origin/HTTP Host, normalizes MCP security config, binds locally by default, and documents the operating model.

**Architecture:** `src/utils/config-loader.js` becomes the source of truth for normalized `config.mcp` allowlists. `src/routes/mcp.js` consumes the normalized config and blocks invalid Origin/Host before JSON-RPC dispatch. `src/app.js` owns listen host resolution, with `127.0.0.1` as the default when neither `HOST` nor `config.host` is set.

**Tech Stack:** Node.js CommonJS, Express, JSON5 config, native `assert`/`http` test scripts, `scripts/run-tests.js`.

---

## Source Documents

- `docs/srs/requirements.step20_mcp_streamable_http_security.md`
- `docs/srs/plan.step20_mcp_streamable_http.md`
- `docs/plan/2026-06-01-mcp-streamable-http-direction.md`
- `docs/srs/plan.step20_mcp_streamable_http.completion.md`

## Implementation Status

Updated 2026-06-02:

- Task 1 complete: `config.mcp.allowedOrigins` and `config.mcp.allowedHosts` are normalized and validated in `src/utils/config-loader.js`; `test/mcp/config-security.test.js` covers defaults, validation failures, wildcard warnings, and startup loading.
- Task 2 complete: `/mcp` validates source before JSON-RPC dispatch. Present Origin headers must be canonical origins and match `mcp.allowedOrigins`; Host is always validated against `mcp.allowedHosts`. Wildcards allow well-formed arbitrary values only; malformed present Origin and malformed/missing Host are rejected. `test/mcp/streamable-http.test.js` covers the policy.
- Task 3 complete: listen host precedence is `HOST` env > `config.host` > `127.0.0.1`; `npm run dev` no longer forces `HOST=0.0.0.0`; `test/mcp/default-bind.test.js` covers the behavior.
- Task 4 in progress: operator docs and SRS records are being aligned with the final security policy; `test/mcp/mcp-security-docs.test.js` guards critical statements.
- Task 5 pending: full suite, lint/patch hygiene, and final branch review.

## Current Code State

- `src/routes/mcp.js` handles Streamable HTTP basics and MCP source validation.
- `src/utils/config-loader.js` normalizes and validates `config.mcp`.
- `src/app.js` defaults to `127.0.0.1` when `HOST` and `config.host` are absent.
- `test/mcp/streamable-http.test.js`, `test/mcp/config-security.test.js`, `test/mcp/default-bind.test.js`, and `test/mcp/mcp-security-docs.test.js` cover the current policy.

## File Structure

- Modify: `src/utils/config-loader.js`
  - Add MCP config normalization and validation helpers.
  - Export `normalizeMcpSecurityConfig` for direct unit tests.
- Modify: `src/routes/mcp.js`
  - Use normalized `config.mcp`.
  - Validate Origin when present and Host for every `/mcp` request.
  - Implement Host matching semantics: hostname/IP entries allow all ports; `host:port` and `[ipv6]:port` entries require exact port.
- Modify: `src/app.js`
  - Add and export `resolveListenHost(cfg, env)`.
  - Use `127.0.0.1` as default listen host.
- Modify: `package.json`
  - Remove explicit `HOST=0.0.0.0` from `dev` script unless a developer explicitly sets it in the shell.
- Modify: `test/mcp/streamable-http.test.js`
  - Add security integration cases.
- Create: `test/mcp/config-security.test.js`
  - Test config-loader normalization, validation, wildcard warning.
- Create: `test/mcp/default-bind.test.js`
  - Test listen host resolution.
- Create: `test/mcp/mcp-security-docs.test.js`
  - Guard critical documentation statements.
- Modify: `scripts/run-tests.js`
  - Add new MCP test scripts to the default suite.
- Modify: `README.md`, `config.example.json5`, `public/mcp-doc.md`, `docs/mcp/doc/mcp.md`, `docs/mcp/doc/ko/mcp.md`
  - Align operator documentation with the final policy.

## Execution Order

Run tasks sequentially with a fresh subagent per task. Task 2 depends on Task 1 because `/mcp` must consume normalized `config.mcp` from `config-loader`; do not dispatch Task 2 before Task 1 is green and reviewed.

---

### Task 1: Normalize And Validate `config.mcp`

**Files:**
- Modify: `src/utils/config-loader.js`
- Create: `test/mcp/config-security.test.js`

- [ ] **Step 1: Write the failing config security tests**

Create `test/mcp/config-security.test.js`:

```javascript
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

test('wildcard makes matcher allow-all while preserving configured list order', () => {
  const { value } = captureWarnings(() => normalizeMcpSecurityConfig({
    mcp: {
      allowedOrigins: ['*', 'https://docs.example.com'],
      allowedHosts: ['*', 'docs.example.com'],
    },
  }));

  assert.strictEqual(value.mcp.allowedOrigins[0], '*');
  assert.strictEqual(value.mcp.allowedHosts[0], '*');
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
```

- [ ] **Step 2: Run the config security test and verify RED**

Run:

```bash
node test/mcp/config-security.test.js
```

Expected: FAIL because `normalizeMcpSecurityConfig` is not exported from `src/utils/config-loader.js`.

- [ ] **Step 3: Add MCP config normalization helpers**

Modify `src/utils/config-loader.js` near the top-level helper area, before `loadConfig()`:

```javascript
const MCP_WILDCARD = '*';
const MCP_LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];
const MCP_WILDCARD_BIND_HOSTS = new Set(['0.0.0.0', '::', '[::]']);

function getMcpConfigPort(config) {
  return config.port || 3000;
}

function getMcpConfigScheme(config) {
  return config.ssl && config.ssl.enabled ? 'https' : 'http';
}

function isWildcardBindHost(host) {
  return MCP_WILDCARD_BIND_HOSTS.has(String(host || '').trim().toLowerCase());
}

function normalizeMcpHostName(host) {
  const value = String(host || '').trim().toLowerCase();
  if (!value) return '';
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1);
  }
  return value;
}

function hostValueForUrlParse(host) {
  const value = String(host || '').trim().toLowerCase();
  if (!value) return '';
  if (value.startsWith('[')) return value;
  if ((value.match(/:/g) || []).length > 1) return `[${value}]`;
  return value;
}

function formatMcpOriginHost(host) {
  const normalized = normalizeMcpHostName(host);
  return normalized.includes(':') ? `[${normalized}]` : normalized;
}

function defaultMcpHosts(config) {
  const hosts = [...MCP_LOCAL_HOSTS];
  if (config.host && !isWildcardBindHost(config.host)) {
    const normalized = normalizeMcpHostName(config.host);
    if (normalized && !hosts.includes(normalized)) hosts.push(normalized);
  }
  return hosts;
}

function defaultMcpOrigins(config) {
  const scheme = getMcpConfigScheme(config);
  const port = getMcpConfigPort(config);
  return defaultMcpHosts(config).map(host => `${scheme}://${formatMcpOriginHost(host)}:${port}`);
}

function assertStringArray(value, key) {
  if (!Array.isArray(value)) {
    throw new Error(`Configuration error: ${key} must be an array of strings`);
  }
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      throw new Error(`Configuration error: ${key} entries must be non-empty strings`);
    }
  }
}

function validateMcpOriginEntry(entry) {
  if (entry === MCP_WILDCARD) return true;
  try {
    const parsed = new URL(entry);
    return parsed.origin !== 'null' && entry.toLowerCase() === parsed.origin.toLowerCase();
  } catch (error) {
    return false;
  }
}

function validateMcpHostEntry(entry) {
  if (entry === MCP_WILDCARD) return true;
  if (/^https?:\/\//i.test(entry)) return false;
  if (entry.includes('/')) return false;

  const value = entry.trim();
  try {
    const parsed = new URL(`http://${hostValueForUrlParse(value)}`);
    return !!parsed.hostname;
  } catch (error) {
    return false;
  }
}

function warnMcpWildcard(list, key) {
  if (list.includes(MCP_WILDCARD)) {
    console.warn(`Warning: ${key} contains wildcard "*"; MCP DNS rebinding protection for this check is disabled.`);
  }
}

function normalizeMcpSecurityConfig(config) {
  config.mcp = config.mcp || {};

  if (config.mcp.allowedOrigins === undefined) {
    config.mcp.allowedOrigins = defaultMcpOrigins(config);
  } else {
    assertStringArray(config.mcp.allowedOrigins, 'mcp.allowedOrigins');
  }

  if (config.mcp.allowedHosts === undefined) {
    config.mcp.allowedHosts = defaultMcpHosts(config);
  } else {
    assertStringArray(config.mcp.allowedHosts, 'mcp.allowedHosts');
  }

  for (const origin of config.mcp.allowedOrigins) {
    if (!validateMcpOriginEntry(origin)) {
      throw new Error(`Configuration error: mcp.allowedOrigins contains invalid origin: ${origin}`);
    }
  }

  for (const host of config.mcp.allowedHosts) {
    if (!validateMcpHostEntry(host)) {
      throw new Error(`Configuration error: mcp.allowedHosts contains invalid host: ${host}`);
    }
  }

  warnMcpWildcard(config.mcp.allowedOrigins, 'mcp.allowedOrigins');
  warnMcpWildcard(config.mcp.allowedHosts, 'mcp.allowedHosts');

  return config;
}
```

- [ ] **Step 4: Call the normalizer from `loadConfig()`**

In `src/utils/config-loader.js`, after `config.port = config.port || 3000;` and before basePath normalization, add:

```javascript
  normalizeMcpSecurityConfig(config);
```

At the bottom, replace the export with:

```javascript
module.exports = { loadConfig, normalizeMcpSecurityConfig };
```

- [ ] **Step 5: Run the config security test and verify GREEN**

Run:

```bash
node test/mcp/config-security.test.js
```

Expected: PASS and output includes `config-security OK`.

---

### Task 2: Validate Host For Every `/mcp` Request

**Files:**
- Modify: `src/routes/mcp.js`
- Modify: `test/mcp/streamable-http.test.js`

- [ ] **Step 1: Add failing MCP source validation integration tests**

In `test/mcp/streamable-http.test.js`, after the existing `browser request with disallowed Host is rejected` test, add:

```javascript
    function rawMcpRequestWithoutHost(body) {
      return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const socket = net.connect(port, '127.0.0.1');
        let response = '';
        socket.on('connect', () => {
          socket.write([
            'POST /mcp HTTP/1.1',
            'Content-Type: application/json',
            `Content-Length: ${Buffer.byteLength(payload)}`,
            '',
            payload,
          ].join('\r\n'));
        });
        socket.on('data', chunk => {
          response += chunk.toString('utf8');
        });
        socket.on('end', () => {
          const statusCode = Number(response.match(/^HTTP\/1\.1 (\d+)/)?.[1]);
          const bodyText = response.split('\r\n\r\n')[1] || '';
          resolve({ statusCode, json: JSON.parse(bodyText) });
        });
        socket.on('error', reject);
      });
    }

    await test('originless request with disallowed Host is rejected', async () => {
      const { res, json } = await rpc('initialize', { protocolVersion: '2025-11-25' }, {
        headers: {
          Host: `evil.example:${port}`,
        },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(json.error.code, 'FORBIDDEN_HOST');
    });

    await test('custom allowed Origin and Host are accepted', async () => {
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
```

- [ ] **Step 2: Run the streamable test and verify RED**

Run:

```bash
node test/mcp/streamable-http.test.js
```

Expected: FAIL at `originless request with disallowed Host is rejected`, because current Host validation only runs when `Origin` is present.

- [ ] **Step 3: Replace route-local default allowlist fallback with normalized config use**

In `src/routes/mcp.js`, keep `WILDCARD_ALLOW` and replace the existing `getConfiguredPort`, `getConfiguredScheme`, `configuredHostNames`, `defaultAllowedHosts`, `defaultAllowedOrigins`, and `configList` helper group with these Host/Origin matching helpers:

```javascript
function listAllowsWildcard(list) {
  return Array.isArray(list) && list.includes(WILDCARD_ALLOW);
}

function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return '';
  try {
    const parsed = new URL(origin);
    if (parsed.origin === 'null') return '';
    return parsed.origin.toLowerCase();
  } catch (error) {
    return '';
  }
}

function normalizeHostEntry(host) {
  if (!host || typeof host !== 'string') return null;
  const value = host.trim().toLowerCase();
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.includes('/')) return null;
  const parseValue = value.startsWith('[') || (value.match(/:/g) || []).length <= 1
    ? value
    : `[${value}]`;

  try {
    const parsed = new URL(`http://${parseValue}`);
    return {
      hostname: parsed.hostname.replace(/^\[|\]$/g, ''),
      port: parsed.port || '',
      hasPort: value.endsWith(`:${parsed.port}`),
    };
  } catch (error) {
    return null;
  }
}

function originAllowed(origin, allowedOrigins) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (listAllowsWildcard(allowedOrigins)) return true;
  return allowedOrigins.map(normalizeOrigin).includes(normalized);
}

function hostAllowed(host, allowedHosts) {
  const normalized = normalizeHostEntry(host);
  if (!normalized) return false;
  if (listAllowsWildcard(allowedHosts)) return true;

  return allowedHosts.some(allowed => {
    const allowedEntry = normalizeHostEntry(allowed);
    if (!allowedEntry) return false;
    if (allowedEntry.hostname !== normalized.hostname) return false;
    if (allowedEntry.hasPort) return allowedEntry.port === normalized.port;
    return true;
  });
}
```

- [ ] **Step 4: Validate MCP request source before protocol dispatch**

In `src/routes/mcp.js`, rename `validateBrowserOrigin` to `validateMcpRequestSource` and replace its body with:

```javascript
  function validateMcpRequestSource(req, res, logger) {
    const origin = req.get('Origin');
    const host = req.get('Host');
    const config = req.app.locals.config || {};
    const mcpConfig = config.mcp || {};
    const allowedOrigins = mcpConfig.allowedOrigins || [];
    const allowedHosts = mcpConfig.allowedHosts || [];

    if (origin && !originAllowed(origin, allowedOrigins)) {
      logger.warn('MCP request rejected by Origin allowlist', { origin, host });
      rejectForbidden(res, 'FORBIDDEN_ORIGIN', 'Origin is not allowed for MCP requests');
      return false;
    }

    if (!hostAllowed(host, allowedHosts)) {
      logger.warn('MCP request rejected by Host allowlist', { origin, host });
      rejectForbidden(res, 'FORBIDDEN_HOST', 'Host is not allowed for MCP requests');
      return false;
    }

    return true;
  }
```

In the `POST /mcp` handler, replace the call:

```javascript
    if (!validateBrowserOrigin(req, res, logger)) return;
```

with:

```javascript
    if (!validateMcpRequestSource(req, res, logger)) return;
```

- [ ] **Step 5: Run the streamable test and verify GREEN**

Run:

```bash
node test/mcp/streamable-http.test.js
```

Expected: PASS and output includes `streamable-http OK`.

---

### Task 3: Default Bind Address Is Localhost

**Files:**
- Modify: `src/app.js`
- Modify: `package.json`
- Create: `test/mcp/default-bind.test.js`

- [ ] **Step 1: Write the failing default bind test**

Create `test/mcp/default-bind.test.js`:

```javascript
'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

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

function clearAppModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}src${path.sep}app.js`)) delete require.cache[key];
  }
}

function writeConfig(testDir, port, hostLine = '') {
  const docsRoot = path.join(testDir, 'docs');
  const dataDir = path.join(testDir, 'data');
  fs.mkdirSync(docsRoot, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(docsRoot, 'index.md'), '# test\n', 'utf8');
  fs.writeFileSync(path.join(testDir, 'config.json5'), `{
    docsRoot: ${JSON.stringify(docsRoot)},
    dataDir: ${JSON.stringify(dataDir)},
    port: ${port},
    ${hostLine}
  }`, 'utf8');
}

async function withStartedApp(hostLine, fn) {
  const originalCwd = process.cwd();
  const originalHost = process.env.HOST;
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-bind-'));
  const port = await findFreePort();
  delete process.env.HOST;
  writeConfig(testDir, port, hostLine);

  let app;
  try {
    process.chdir(testDir);
    clearAppModuleCache();
    app = require('../../src/app');
    const result = await app.start();
    assert.strictEqual(result.success, true, `server failed to start: ${JSON.stringify(result)}`);
    await fn(app);
  } finally {
    if (app) await app.stop();
    process.chdir(originalCwd);
    if (originalHost === undefined) delete process.env.HOST;
    else process.env.HOST = originalHost;
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

(async function main() {
  console.log('\ndefault-bind: checking server listen host resolution\n');

  clearAppModuleCache();
  const app = require('../../src/app');

  await test('uses 127.0.0.1 when HOST and config.host are absent', () => {
    assert.strictEqual(app.resolveListenHost({}, {}), '127.0.0.1');
  });

  await test('HOST environment variable overrides config host', () => {
    assert.strictEqual(app.resolveListenHost({ host: '127.0.0.1' }, { HOST: '0.0.0.0' }), '0.0.0.0');
  });

  await test('config.host overrides default localhost bind', () => {
    assert.strictEqual(app.resolveListenHost({ host: '10.0.0.15' }, {}), '10.0.0.15');
  });

  await test('app.start records 127.0.0.1 listen host when no host is configured', async () => {
    await withStartedApp('', async (startedApp) => {
      assert.strictEqual(startedApp.locals.listenHost, '127.0.0.1');
    });
  });

  console.log('\ndefault-bind OK\n');
})().catch(error => {
  console.error('\ndefault-bind failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
```

- [ ] **Step 2: Run the default bind test and verify RED**

Run:

```bash
node test/mcp/default-bind.test.js
```

Expected: FAIL because `app.resolveListenHost` is not exported.

- [ ] **Step 3: Add listen host resolver**

In `src/app.js`, near the server lifecycle variables before `async function start()`, add:

```javascript
function resolveListenHost(cfg = {}, env = process.env) {
  return env.HOST || cfg.host || '127.0.0.1';
}
```

Inside `start()`, replace:

```javascript
    const HOST = process.env.HOST || cfg.host || '0.0.0.0';
```

with:

```javascript
    const HOST = resolveListenHost(cfg);
    app.locals.listenHost = HOST;
```

At the bottom of `src/app.js`, after `module.exports = app;`, add:

```javascript
module.exports.resolveListenHost = resolveListenHost;
```

- [ ] **Step 4: Remove explicit wildcard bind from dev script**

In `package.json`, replace:

```json
"dev": "cross-env HOST=0.0.0.0 nodemon src/app.js",
```

with:

```json
"dev": "nodemon src/app.js",
```

- [ ] **Step 5: Run the default bind test and verify GREEN**

Run:

```bash
node test/mcp/default-bind.test.js
```

Expected: PASS and output includes `default-bind OK`.

---

### Task 4: Document The Final MCP Security Policy

**Files:**
- Modify: `README.md`
- Modify: `config.example.json5`
- Modify: `public/mcp-doc.md`
- Modify: `docs/mcp/doc/mcp.md`
- Modify: `docs/mcp/doc/ko/mcp.md`
- Create: `test/mcp/mcp-security-docs.test.js`

- [ ] **Step 1: Write the failing docs guard test**

Create `test/mcp/mcp-security-docs.test.js`:

```javascript
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function includesAll(text, phrases) {
  for (const phrase of phrases) {
    assert(text.includes(phrase), `missing phrase: ${phrase}`);
  }
}

console.log('\nmcp-security-docs: checking MCP security documentation\n');

const readme = read('README.md');
includesAll(readme, [
  'Requests without an `Origin` header',
  'Host header',
  '127.0.0.1',
  'proxy_set_header Host $host;',
  'DNS rebinding protection',
  'auth.requireReadLogin=false',
]);

const configExample = read('config.example.json5');
includesAll(configExample, [
  'MCP Streamable HTTP security settings',
  'allowedOrigins',
  'allowedHosts',
  'Use ["*"] only as an explicit insecure opt-out',
]);

const publicDoc = read('public/mcp-doc.md');
includesAll(publicDoc, [
  'notifications/initialized',
  'MCP-Protocol-Version: 2025-11-25',
  'GET /mcp',
  'Allow: POST',
  'Origin',
  'Host',
]);

const englishDoc = read('docs/mcp/doc/mcp.md');
includesAll(englishDoc, [
  'Streamable HTTP',
  'DNS rebinding',
  'proxy_set_header Host $host;',
]);

const koreanDoc = read('docs/mcp/doc/ko/mcp.md');
includesAll(koreanDoc, [
  'Streamable HTTP',
  'DNS rebinding',
  'proxy_set_header Host $host;',
]);

console.log('\nmcp-security-docs OK\n');
```

- [ ] **Step 2: Run the docs guard and verify RED**

Run:

```bash
node test/mcp/mcp-security-docs.test.js
```

Expected: FAIL because at least one required final-policy phrase is missing from docs.

- [ ] **Step 3: Update README security documentation**

In `README.md`, expand the `MCP Origin and Host Allowlist` section so it includes this content:

```markdown
DocuLight applies MCP Origin/Host checks before JSON-RPC method dispatch:

- Requests with an `Origin` header are treated as browser-origin requests and must match `mcp.allowedOrigins`.
- Requests without an `Origin` header are allowed for CLI/server MCP clients, but they are not treated as secure by Origin validation. Use read authentication, localhost bind, IP allowlists, or reverse proxy access control for network deployments.
- The HTTP `Host` header is always checked against `mcp.allowedHosts`.
- By default, DocuLight listens on `127.0.0.1` when no `HOST` environment variable or `config.host` is set.
- When `auth.requireReadLogin=false`, MCP read tools can be public. Do not combine public read tools with wildcard MCP allowlists on network-exposed deployments.

Reverse proxy deployments should preserve the public Host header:

```nginx
proxy_set_header Host $host;
```
```

- [ ] **Step 4: Update `config.example.json5` MCP comments**

In `config.example.json5`, ensure the MCP section states:

```javascript
  // MCP Streamable HTTP security settings (optional)
  // Requests with an Origin header are browser-origin requests and must match allowedOrigins.
  // Requests without an Origin header are accepted for CLI/server MCP clients.
  // The HTTP Host header is always checked against allowedHosts.
  // Defaults:
  // - allowedOrigins: localhost/127.0.0.1/[::1] on the configured scheme and port
  // - allowedHosts: localhost, 127.0.0.1, ::1
  // Use ["*"] only as an explicit insecure opt-out; it disables DNS rebinding protection for that check.
```

- [ ] **Step 5: Update MCP docs**

In `public/mcp-doc.md`, `docs/mcp/doc/mcp.md`, and `docs/mcp/doc/ko/mcp.md`, add or update a security section containing:

```markdown
### Streamable HTTP Security

Servers validate browser-origin requests before JSON-RPC dispatch. If `Origin` is present, it must match `mcp.allowedOrigins`; if it is invalid, the server responds with HTTP 403. The HTTP `Host` header is always checked against `mcp.allowedHosts`.

Normal CLI/server MCP clients often omit `Origin`. Those requests remain compatible, but operators must rely on authentication, localhost bind, IP allowlists, or reverse proxy access control.

For reverse proxy deployments, preserve the public Host header:

```nginx
proxy_set_header Host $host;
```
```

For the Korean document, translate the prose to Korean but keep the literal config keys and nginx directive unchanged.

- [ ] **Step 6: Run the docs guard and verify GREEN**

Run:

```bash
node test/mcp/mcp-security-docs.test.js
```

Expected: PASS and output includes `mcp-security-docs OK`.

---

### Task 5: Wire Tests Into The Suite And Run Full Verification

**Files:**
- Modify: `scripts/run-tests.js`

- [ ] **Step 1: Add failing runner coverage for new suites**

In `scripts/run-tests.js`, add the new MCP suites immediately after `test/mcp/streamable-http.test.js`:

```javascript
  'test/mcp/config-security.test.js',
  'test/mcp/default-bind.test.js',
  'test/mcp/mcp-security-docs.test.js',
```

- [ ] **Step 2: Run the new individual suites**

Run:

```bash
node test/mcp/config-security.test.js
node test/mcp/streamable-http.test.js
node test/mcp/default-bind.test.js
node test/mcp/mcp-security-docs.test.js
```

Expected: all four commands exit 0.

- [ ] **Step 3: Run the existing MCP parity suite**

Run:

```bash
node test/mcp/handler-parity.test.js
```

Expected: PASS and output includes `parity OK`.

- [ ] **Step 4: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS with all suites passing.

- [ ] **Step 5: Check patch hygiene**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 6: Update completion record**

Modify `docs/srs/plan.step20_mcp_streamable_http.completion.md` to add a final section:

```markdown
## 6. PR #2 보안 보강 완료 기록

- `config.mcp.allowedOrigins`와 `config.mcp.allowedHosts`를 config loading 단계에서 정규화/검증했다.
- `/mcp`는 Origin header가 있는 요청을 allowlist로 검사하고, HTTP `Host` header는 모든 요청에서 검사한다.
- 명시 host 설정이 없으면 기본 bind address는 `127.0.0.1`이다.
- wildcard `["*"]`는 insecure opt-out으로 허용하되 warning을 남긴다.
- public read mode, wildcard, reverse proxy Host 보존 정책을 문서화했다.

검증:

```bash
node test/mcp/config-security.test.js
node test/mcp/streamable-http.test.js
node test/mcp/default-bind.test.js
node test/mcp/mcp-security-docs.test.js
node test/mcp/handler-parity.test.js
npm test
git diff --check
```
```

---

## Review Gates

After each task:

1. The implementer must report RED and GREEN command outputs.
2. A spec compliance review must check the task against:
   - `docs/srs/requirements.step20_mcp_streamable_http_security.md`
   - this implementation plan
3. A code quality review must check:
   - no unrelated refactors
   - no user changes reverted
   - no security checks happening after JSON-RPC method dispatch
   - no broad wildcard defaults

After Task 5, request a final whole-branch review before committing or pushing.

## Self-Review

- Spec coverage: The plan maps every merge-before item from `requirements.step20_mcp_streamable_http_security.md` section 6 to Tasks 1-5.
- Placeholder scan: The plan contains concrete file paths, commands, expected failures, expected passes, and code snippets.
- Type consistency: `config.mcp.allowedOrigins`, `config.mcp.allowedHosts`, `FORBIDDEN_ORIGIN`, `FORBIDDEN_HOST`, and `resolveListenHost` names are consistent across tests and implementation steps.
