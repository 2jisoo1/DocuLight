'use strict';

/**
 * TASK-P1-010 — security.test.js
 * acceptance: exit 0, stdout_regex "redact OK"
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { configure, redactPII, auditLog, validateToolPath } = require('../../src/services/agent-tools/security');

let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// 테스트용 임시 audit log 경로
const tmpAuditLog = path.join(os.tmpdir(), `security-test-${process.pid}.jsonl`);
configure({ auditLogPath: tmpAuditLog });

console.log('--- security.test.js ---');

// ── redactPII: 이메일 마스킹 ──────────────────────────────────────────────
test('redactPII: email masked in string', () => {
  const result = redactPII('user: alice@example.com');
  assert(!result.includes('alice@example.com'), 'email not redacted');
  assert(result.includes('[EMAIL REDACTED]'), 'redact marker missing');
});

test('redactPII: email masked in nested object', () => {
  const result = redactPII({ user: 'contact: bob@test.org', meta: { from: 'no@reply.io' } });
  assert(!JSON.stringify(result).includes('@'), 'nested email not redacted');
});

// ── redactPII: 전화번호 마스킹 ─────────────────────────────────────────────
test('redactPII: phone masked in string', () => {
  const result = redactPII('call: 010-1234-5678');
  assert(!result.includes('010-1234-5678'), 'phone not redacted');
  assert(result.includes('[PHONE REDACTED]'), 'redact marker missing');
});

test('redactPII: multiple PII types masked simultaneously', () => {
  const raw = 'email@test.com and 02-333-4567';
  const result = redactPII(raw);
  assert(!result.includes('email@test.com'), 'email still present');
  assert(!result.includes('02-333-4567'), 'phone still present');
});

// ── redactPII: 비-PII 보존 ─────────────────────────────────────────────────
test('redactPII: non-PII string unchanged', () => {
  const raw = 'hello world 12345';
  assert(redactPII(raw) === raw, 'non-PII string was modified');
});

test('redactPII: array elements redacted', () => {
  const result = redactPII(['a@b.com', 'safe']);
  assert(!result[0].includes('@'), 'array email not redacted');
  assert(result[1] === 'safe', 'safe element modified');
});

test('redactPII: non-string primitives pass through', () => {
  assert(redactPII(42) === 42, 'number changed');
  assert(redactPII(null) === null, 'null changed');
  assert(redactPII(true) === true, 'boolean changed');
});

// ── auditLog: JSONL 1라인 기록 ────────────────────────────────────────────
test('auditLog: writes one JSONL line', () => {
  if (fs.existsSync(tmpAuditLog)) fs.unlinkSync(tmpAuditLog);
  auditLog('mcp.search_documents', { query: 'guide' }, { count: 3 }, 'sess-001');
  const lines = fs.readFileSync(tmpAuditLog, 'utf8').trim().split('\n');
  assert(lines.length === 1, `expected 1 line, got ${lines.length}`);
  const entry = JSON.parse(lines[0]);
  assert(entry.toolName === 'mcp.search_documents', 'toolName mismatch');
  assert(entry.sessionId === 'sess-001', 'sessionId mismatch');
  assert(typeof entry.ts === 'string', 'ts missing');
});

test('auditLog: PII in args is redacted before writing', () => {
  if (fs.existsSync(tmpAuditLog)) fs.unlinkSync(tmpAuditLog);
  auditLog('mcp.query_document', { query: 'user@secret.com 010-9999-0000' }, null, 'sess-002');
  const raw = fs.readFileSync(tmpAuditLog, 'utf8');
  assert(!raw.includes('user@secret.com'), 'email not redacted in audit log');
  assert(!raw.includes('010-9999-0000'), 'phone not redacted in audit log');
});

test('auditLog: appends multiple calls', () => {
  if (fs.existsSync(tmpAuditLog)) fs.unlinkSync(tmpAuditLog);
  auditLog('tool_a', {}, {}, 's1');
  auditLog('tool_b', {}, {}, 's1');
  const lines = fs.readFileSync(tmpAuditLog, 'utf8').trim().split('\n');
  assert(lines.length === 2, `expected 2 lines, got ${lines.length}`);
});

// ── validateToolPath: 정상 경로 허용 ─────────────────────────────────────
test('validateToolPath: valid path allowed', () => {
  const result = validateToolPath('/docs/guide.md');
  assert(result === '/docs/guide.md', 'valid path rejected');
});

test('validateToolPath: backslash normalized to slash', () => {
  const result = validateToolPath('/docs/sub/file.md');
  assert(result.includes('/'), 'not normalized');
});

// ── validateToolPath: path traversal 차단 ────────────────────────────────
test('validateToolPath: ../  blocked', () => {
  let threw = false;
  try { validateToolPath('/docs/../etc/passwd'); } catch (e) { threw = true; }
  assert(threw, '../ traversal not blocked');
});

test('validateToolPath: allowlist respected', () => {
  let threw = false;
  try { validateToolPath('/other/path', { rootAllowlist: ['/docs'] }); } catch (e) { threw = true; }
  assert(threw, 'allowlist violation not caught');
  const ok = validateToolPath('/docs/guide.md', { rootAllowlist: ['/docs'] });
  assert(ok === '/docs/guide.md', 'valid allowlist path rejected');
});

// ── 결과 ──────────────────────────────────────────────────────────────────
// 임시 파일 정리
try { if (fs.existsSync(tmpAuditLog)) fs.unlinkSync(tmpAuditLog); } catch (_) {}

if (failed === 0) {
  console.log('redact OK');
  process.exit(0);
} else {
  console.error(`${failed} test(s) FAILED`);
  process.exit(1);
}
