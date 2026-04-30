'use strict';

/**
 * TASK-P1-010 — path-traversal-guard.test.js
 * acceptance: exit 0, stdout_regex "4 traversal patterns blocked"
 */

const { validateToolPath } = require('../../src/services/agent-tools/security');

let failed = 0;
let blocked = 0;

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

function assertBlocked(p, label) {
  let threw = false;
  try {
    validateToolPath(p);
  } catch (e) {
    if (e.code === 'PATH_TRAVERSAL' || e.code === 'PATH_VIOLATION') {
      threw = true;
      blocked++;
    }
  }
  assert(threw, `expected PATH_TRAVERSAL for ${label}`);
}

console.log('--- path-traversal-guard.test.js ---');

// ── 4종 차단 검증 ─────────────────────────────────────────────────────────

test('pattern 1: ../ blocked', () => {
  assertBlocked('../secret/file', '../');
  assertBlocked('/docs/../etc/passwd', '../ (embedded)');
});

test('pattern 2: ..\\ blocked', () => {
  assertBlocked('..\\secret\\file', '.\\..\\');
  assertBlocked('/docs/..\\windows', '..\\ (embedded)');
});

test('pattern 3: /etc/passwd blocked', () => {
  assertBlocked('/etc/passwd', '/etc/passwd');
  assertBlocked('/ETC/PASSWD', '/etc/passwd case-insensitive');
});

test('pattern 4: c:\\windows blocked', () => {
  assertBlocked('c:\\windows\\system32', 'c:\\windows');
  assertBlocked('C:\\WINDOWS\\system32', 'c:\\windows case-insensitive');
});

// ── 정상 경로 통과 ───────────────────────────────────────────────────────
test('valid paths pass through', () => {
  const cases = [
    '/docs/guide.md',
    '/project/src/index.js',
    'relative/path.md',
    '/docs/windows-setup.md',  // 'windows' 단어가 포함되어도 c:\windows 패턴이 아님
  ];
  for (const p of cases) {
    assert(validateToolPath(p) !== undefined, `valid path rejected: ${p}`);
  }
});

// ── 결과 ─────────────────────────────────────────────────────────────────
if (failed === 0 && blocked >= 4) {
  console.log(`4 traversal patterns blocked`);
  process.exit(0);
} else {
  if (blocked < 4) console.error(`Only ${blocked}/4 traversal patterns were blocked`);
  if (failed > 0) console.error(`${failed} test(s) FAILED`);
  process.exit(1);
}
