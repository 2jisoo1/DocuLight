'use strict';

/**
 * Security multi-layer defense skeleton (TASK-P1-010, NFR-3)
 * @module services/agent-tools/security
 *
 * - redactPII     : 이메일/전화번호 PII 제거
 * - auditLog      : 도구 호출 1건/라인 → agent-audit.jsonl
 * - validateToolPath : path traversal 4종 차단 + allowlist 검증
 */

const fs = require('fs');
const path = require('path');


// ── Path traversal 금지 패턴 4종 (DoD: ../  ..\  /etc/passwd  c:\windows) ─
const TRAVERSAL_PATTERNS = [
  { re: /\.\.\//, label: '../' },
  { re: /\.\.\\/,  label: '..\\'  },
  { re: /\/etc\/passwd/i, label: '/etc/passwd' },
  { re: /c:\\windows/i,   label: 'c:\\windows' },
];

// ── 내부 상태 ─────────────────────────────────────────────────────────────
let _auditLogPath = path.join(process.cwd(), 'logs', 'agent-audit.jsonl');
let _logger = null;

/**
 * 모듈 설정 (테스트에서 auditLogPath 교체용).
 * @param {object} [opts]
 * @param {string} [opts.auditLogPath]
 * @param {object} [opts.logger]
 */
function configure({ auditLogPath, logger } = {}) {
  if (auditLogPath) _auditLogPath = auditLogPath;
  if (logger !== undefined) _logger = logger;
}

// ── redactPII ─────────────────────────────────────────────────────────────

/**
 * args 객체(또는 임의 값)에서 이메일·전화번호를 재귀적으로 마스킹.
 * 원본을 변경하지 않고 새 값을 반환.
 *
 * @param {*} args
 * @returns {*}
 */
function redactPII(args, _visited = new WeakSet()) {
  if (typeof args === 'string') {
    // Inline literals avoid shared global-flag lastIndex state (I-1)
    return args
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL REDACTED]')
      .replace(/\b\d{2,4}-\d{3,4}-\d{4}\b/g, '[PHONE REDACTED]');
  }
  if (Array.isArray(args)) {
    if (_visited.has(args)) return '[CIRCULAR]';
    _visited.add(args);
    return args.map(v => redactPII(v, _visited));
  }
  if (args !== null && typeof args === 'object') {
    if (_visited.has(args)) return '[CIRCULAR]';
    _visited.add(args);
    const out = {};
    for (const [k, v] of Object.entries(args)) {
      out[k] = redactPII(v, _visited);
    }
    return out;
  }
  return args;
}

// ── auditLog ──────────────────────────────────────────────────────────────

/**
 * 도구 호출 1건을 agent-audit.jsonl 에 JSONL 1라인으로 기록.
 * PII는 자동 마스킹 후 기록. 쓰기 실패 시 warn 로그만 남기고 계속.
 *
 * @param {string} toolName
 * @param {*}      args
 * @param {*}      result
 * @param {string} sessionId
 */
function auditLog(toolName, args, result, sessionId) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      sessionId: sessionId ?? 'unknown',
      toolName,
      args: redactPII(args),
      result_summary: _summarizeResult(result),
    };
    const line = JSON.stringify(entry) + '\n';
    const dir = path.dirname(_auditLogPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(_auditLogPath, line, 'utf8');
  } catch (err) {
    _logger?.warn(`[security] audit_log_write_failed: ${err.message}`);
  }
}

/** @private */
function _summarizeResult(result) {
  if (result === null || result === undefined) return 'null';
  const s = typeof result === 'string' ? result : JSON.stringify(result);
  return s.length > 200 ? s.slice(0, 200) + '...' : s;
}

// ── validateToolPath ──────────────────────────────────────────────────────

/**
 * 도구 인자 경로를 검증. 4종 traversal 패턴 및 allowlist 루트를 강제.
 * 위반 시 code='PATH_TRAVERSAL' Error throw + audit warn.
 *
 * @param {string}   p                    - 검증할 경로
 * @param {object}   [opts]
 * @param {string[]} [opts.rootAllowlist]  - 허용 루트 접두어 목록
 * @returns {string} 정규화된 경로 (백슬래시 → 슬래시)
 * @throws {Error}   PATH_TRAVERSAL | PATH_VIOLATION
 */
function validateToolPath(p, { rootAllowlist = [] } = {}) {
  if (typeof p !== 'string' || !p) {
    throw Object.assign(
      new Error('PATH_TRAVERSAL: empty or non-string path'),
      { code: 'PATH_TRAVERSAL' }
    );
  }

  // 1. Check raw string first — catches ..\\ and c:\\windows with literal backslashes
  _assertNoTraversal(p);

  // 2. URL-decode + normalize backslashes, re-check — catches %2e%2e%2f and similar
  let decoded;
  try { decoded = decodeURIComponent(p); } catch (_) { decoded = p; }
  const normalized = decoded.replace(/\\/g, '/');
  if (normalized !== p) _assertNoTraversal(normalized);

  if (rootAllowlist.length > 0) {
    const ok = rootAllowlist.some(root => {
      const r = root.replace(/\\/g, '/');
      return normalized === r ||
             normalized.startsWith(r === '/' ? r : r + '/');
    });
    if (!ok) {
      _logger?.warn(`[security] path_allowlist_violation path="${p}"`);
      throw Object.assign(
        new Error(`PATH_VIOLATION: path outside allowed roots`),
        { code: 'PATH_VIOLATION' }
      );
    }
  }

  return normalized;
}

/** @private — throws PATH_TRAVERSAL if any forbidden pattern matches str */
function _assertNoTraversal(str) {
  for (const { re, label } of TRAVERSAL_PATTERNS) {
    if (re.test(str)) {
      _logger?.warn(`[security] path_traversal_blocked pattern="${label}" path="${str}"`);
      throw Object.assign(
        new Error(`PATH_TRAVERSAL: pattern "${label}" blocked in path`),
        { code: 'PATH_TRAVERSAL' }
      );
    }
  }
}

module.exports = { configure, redactPII, auditLog, validateToolPath, TRAVERSAL_PATTERNS };
