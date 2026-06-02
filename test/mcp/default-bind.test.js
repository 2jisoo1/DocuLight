'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const originalCwd = process.cwd();
const originalHostEnv = process.env.HOST;
const originalCreateServer = http.createServer;

function clearAppCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(repoRoot, 'src'))) {
      delete require.cache[key];
    }
  }
}

function writeConfig(testDir, extra = '') {
  const docsRoot = path.join(testDir, 'docs');
  const dataDir = path.join(testDir, 'data');
  fs.mkdirSync(docsRoot, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(docsRoot, 'index.md'), '# Default bind test\n', 'utf8');
  fs.writeFileSync(path.join(testDir, 'config.json5'), `{
  docsRoot: ${JSON.stringify(docsRoot)},
  dataDir: ${JSON.stringify(dataDir)},
  logDir: ${JSON.stringify(path.join(testDir, 'logs'))},
  port: 0,
  cache: { enabled: false },
  ui: { indexFile: null, mcpIndexFile: null, apiIndexFile: null },
  hotReload: { allowPortSslAutoRestart: false },
  ${extra}
}
`, 'utf8');
}

async function withStartedApp(extraConfig, envHost) {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-default-bind-'));
  const listens = [];

  writeConfig(testDir, extraConfig);
  process.chdir(testDir);
  if (envHost === undefined) {
    delete process.env.HOST;
  } else {
    process.env.HOST = envHost;
  }

  http.createServer = () => ({
    once() {
      return this;
    },
    listen(port, host, callback) {
      listens.push({ port, host });
      setImmediate(callback);
      return this;
    },
    close(callback) {
      setImmediate(callback);
      return this;
    },
  });

  clearAppCache();
  const app = require('../../src/app');
  const result = await app.start();
  assert.strictEqual(result.success, true, `start failed: ${JSON.stringify(result)}`);
  await app.stop();
  return listens;
}

(async function main() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert(
      !/\bHOST=0\.0\.0\.0\b/.test(packageJson.scripts.dev),
      'npm run dev must not force binding to 0.0.0.0'
    );

    let listens = await withStartedApp('', undefined);
    assert.strictEqual(listens[0].host, '127.0.0.1');

    listens = await withStartedApp('host: "0.0.0.0",', undefined);
    assert.strictEqual(listens[0].host, '0.0.0.0');

    listens = await withStartedApp('host: "127.0.0.1",', '0.0.0.0');
    assert.strictEqual(listens[0].host, '0.0.0.0');

    console.log('default-bind OK');
  } catch (error) {
    console.error('default-bind failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    process.chdir(originalCwd);
    http.createServer = originalCreateServer;
    if (originalHostEnv === undefined) {
      delete process.env.HOST;
    } else {
      process.env.HOST = originalHostEnv;
    }
    process.exit(process.exitCode || 0);
  }
})();
