'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assertIncludes(file, text) {
  assert(
    read(file).includes(text),
    `${file} must include: ${text}`
  );
}

try {
  assertIncludes('README.md', 'The server binds to `127.0.0.1` by default.');
  assertIncludes('README.md', 'Origin values must be canonical origins such as `https://docs.example.com`; do not include path, query, hash, or userinfo.');
  assertIncludes('README.md', 'Requests without an `Origin` header, such as normal CLI/server MCP clients, are accepted only in the sense that missing `Origin` is not rejected; `Host` is still always checked.');
  assertIncludes('README.md', 'Host entries may be hostnames/IPs or exact `host:port` values.');
  assertIncludes('README.md', 'Preserve the original `Host` header when using a reverse proxy; DocuLight does not trust `X-Forwarded-Host` for MCP allowlist checks.');

  assertIncludes('config.example.json5', '// The server binds to 127.0.0.1 by default.');
  assertIncludes('config.example.json5', '// Set top-level host: "0.0.0.0" only when direct remote access is required.');
  assertIncludes('config.example.json5', '// POST /mcp always checks Host against allowedHosts.');
  assertIncludes('config.example.json5', '// only in the sense that missing Origin is not rejected; Host is still checked.');
  assertIncludes('config.example.json5', '// Origin entries must be canonical origins: scheme + host + optional port, no path/query/hash/userinfo.');

  assertIncludes('docs/mcp/doc/mcp.md', 'The server binds to `127.0.0.1` by default.');
  assertIncludes('docs/mcp/doc/mcp.md', 'Origin values must be canonical origins such as `https://docs.example.com`; do not include path, query, hash, or userinfo.');
  assertIncludes('docs/mcp/doc/mcp.md', 'Requests without an `Origin` header, such as normal CLI/server MCP clients, are accepted only in the sense that missing `Origin` is not rejected; `Host` is still always checked.');
  assertIncludes('docs/mcp/doc/mcp.md', 'Preserve the original `Host` header when using a reverse proxy; DocuLight does not trust `X-Forwarded-Host` for MCP allowlist checks.');

  assertIncludes('docs/mcp/doc/ko/mcp.md', '서버는 기본적으로 `127.0.0.1`에 bind합니다.');
  assertIncludes('docs/mcp/doc/ko/mcp.md', 'Origin 값은 `https://docs.example.com` 같은 canonical origin이어야 하며 path, query, hash, userinfo를 포함하지 않습니다.');
  assertIncludes('docs/mcp/doc/ko/mcp.md', '일반 CLI/server MCP 클라이언트처럼 `Origin` 헤더가 없는 요청은 Origin 누락만으로 거부하지 않지만, Host 검사는 항상 적용');
  assertIncludes('docs/mcp/doc/ko/mcp.md', 'reverse proxy를 사용할 때는 원래 `Host` header를 보존해야 하며, DocuLight는 MCP allowlist 검사에 `X-Forwarded-Host`를 신뢰하지 않습니다.');

  console.log('mcp-security-docs OK');
} catch (error) {
  console.error('mcp-security-docs failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
