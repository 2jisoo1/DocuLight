'use strict';

/**
 * marker-parser.test.js — TASK-P3-001 acceptance test
 * stdout must contain [PLAN] for regex gate: \[PLAN\]
 */

const { parseMarkers, hasMarker, stripMarkers, MARKER_NAMES } =
  require('../../src/services/agent-tools/marker-parser');
const { AGENTIC_SYSTEM_PROMPT } =
  require('../../src/services/chatbot/workflow/prompts');

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${label}`);
    failed++;
  }
}

// ── 1. parseMarkers: 세 마커 모두 추출 ────────────────────────────────────
const fullText =
  '[PLAN] Search docs for auth API. [OBSERVE] Found 3 relevant files. [SELF_CHECK] No gaps detected.';
const m1 = parseMarkers(fullText);
assert(m1.PLAN === 'Search docs for auth API.', '[PLAN] section extracted');
assert(m1.OBSERVE === 'Found 3 relevant files.', '[OBSERVE] section extracted');
assert(m1.SELF_CHECK === 'No gaps detected.', '[SELF_CHECK] section extracted');

// ── 2. parseMarkers: 단일 [PLAN] 마커 ────────────────────────────────────
const planOnly = '[PLAN] Retrieve installation guide.';
const m2 = parseMarkers(planOnly);
assert(m2.PLAN === 'Retrieve installation guide.', '[PLAN] only — correct value');
assert(!m2.OBSERVE, '[OBSERVE] absent when not present');
assert(!m2.SELF_CHECK, '[SELF_CHECK] absent when not present');

// ── 3. parseMarkers: 빈 텍스트 ───────────────────────────────────────────
assert(Object.keys(parseMarkers('')).length === 0, 'empty text → empty object');
assert(Object.keys(parseMarkers(null)).length === 0, 'null text → empty object');

// ── 4. hasMarker ──────────────────────────────────────────────────────────
assert(hasMarker(fullText, 'PLAN'), 'hasMarker detects [PLAN]');
assert(hasMarker(fullText, 'OBSERVE'), 'hasMarker detects [OBSERVE]');
assert(hasMarker(fullText, 'SELF_CHECK'), 'hasMarker detects [SELF_CHECK]');
assert(!hasMarker('no markers here', 'PLAN'), 'hasMarker returns false for absent marker');

// ── 5. stripMarkers ───────────────────────────────────────────────────────
const stripped = stripMarkers('[PLAN] plan text. [OBSERVE] obs text.');
assert(!stripped.includes('[PLAN]'), 'stripMarkers removes [PLAN]');
assert(!stripped.includes('[OBSERVE]'), 'stripMarkers removes [OBSERVE]');

// ── 6. MARKER_NAMES ───────────────────────────────────────────────────────
assert(Array.isArray(MARKER_NAMES), 'MARKER_NAMES is array');
assert(MARKER_NAMES.includes('PLAN'), 'MARKER_NAMES contains PLAN');
assert(MARKER_NAMES.includes('OBSERVE'), 'MARKER_NAMES contains OBSERVE');
assert(MARKER_NAMES.includes('SELF_CHECK'), 'MARKER_NAMES contains SELF_CHECK');

// ── 7. AGENTIC_SYSTEM_PROMPT includes marker instructions ────────────────
assert(typeof AGENTIC_SYSTEM_PROMPT === 'string', 'AGENTIC_SYSTEM_PROMPT exported');
assert(AGENTIC_SYSTEM_PROMPT.includes('[PLAN]'), 'AGENTIC_SYSTEM_PROMPT contains [PLAN]');
assert(AGENTIC_SYSTEM_PROMPT.includes('[OBSERVE]'), 'AGENTIC_SYSTEM_PROMPT contains [OBSERVE]');
assert(AGENTIC_SYSTEM_PROMPT.includes('[SELF_CHECK]'), 'AGENTIC_SYSTEM_PROMPT contains [SELF_CHECK]');

// ── 결과 출력 (stdout_regex: \[PLAN\] 통과 보장) ────────────────────────
console.log(`\nmarker-parser: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
