'use strict';

/**
 * lang-detect.test.js — TASK-P3-006 acceptance test
 * FR-15: 다국어 한·영 자동 감지 유지 회귀 테스트
 * stdout must match /han|eng/
 */

const {
  AGENTIC_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  GENERATE_NO_CONTEXT_PROMPT,
  CHITCHAT_PROMPT,
  SUMMARY_PROMPT,
  LOW_RELEVANCE_PROMPT,
  NO_CONTEXT_PROMPT,
  FAST_GENERATE_PROMPT,
  SUMMARIZE_CONVERSATION_PROMPT,
  REDUCE_SUMMARY_PROMPT,
  MAP_SUMMARY_PROMPT,
  SUMMARY_PROMPT_V2,
  DEEP_READ_SYNTHESIZE_PROMPT,
  CONTEXTUALIZE_PROMPT,
  ANALYZE_REQUEST_PROMPT,
} = require('../../src/services/chatbot/workflow/prompts');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

// ── 1. AGENTIC_SYSTEM_PROMPT: 한·영 자동 감지 지시 보존 ──────────────────────
console.log('\n[AGENTIC_SYSTEM_PROMPT — han·eng language rule preserved]');
assert(typeof AGENTIC_SYSTEM_PROMPT === 'string', 'AGENTIC_SYSTEM_PROMPT is string');
assert(
  /Korean|한국어/i.test(AGENTIC_SYSTEM_PROMPT),
  'AGENTIC_SYSTEM_PROMPT references Korean (han)'
);
assert(
  /English|영어/i.test(AGENTIC_SYSTEM_PROMPT),
  'AGENTIC_SYSTEM_PROMPT references English (eng)'
);
assert(
  /match.*language|language.*match/i.test(AGENTIC_SYSTEM_PROMPT),
  'AGENTIC_SYSTEM_PROMPT contains language-matching instruction'
);

// ── 2. SYSTEM_PROMPT: LANGUAGE RULE 보존 ─────────────────────────────────────
console.log('\n[SYSTEM_PROMPT — LANGUAGE RULE block]');
assert(typeof SYSTEM_PROMPT === 'string', 'SYSTEM_PROMPT is string');
assert(SYSTEM_PROMPT.includes('LANGUAGE RULE'), 'SYSTEM_PROMPT contains LANGUAGE RULE section');
assert(/Korean/i.test(SYSTEM_PROMPT), 'SYSTEM_PROMPT references Korean (han)');
assert(/English/i.test(SYSTEM_PROMPT), 'SYSTEM_PROMPT references English (eng)');
assert(
  /Detect.*language|detect.*lang/i.test(SYSTEM_PROMPT),
  'SYSTEM_PROMPT instructs language detection'
);
assert(
  /Never mix languages/i.test(SYSTEM_PROMPT),
  'SYSTEM_PROMPT prohibits language mixing'
);

// ── 3. 개별 프롬프트: 언어 대응 지시 일관성 (구체적 패턴 검증) ─────────────────
console.log('\n[Per-prompt language-response directive consistency]');

// 언어 지시 패턴 (3가지 형식 허용):
//   a) "LANGUAGE: Match …" 또는 "Match the user's language"
//   b) "Language: {language}" / "LANGUAGE: {language}" — 런타임 주입 형식
//   c) "language.*user's question" / "respond.*language"
const LANG_DIRECTIVE_RE =
  /LANGUAGE:.*Match|Match.*(?:user.s|the).*language|language.*user.s.*question|respond.*language|Language:\s*\{language\}|LANGUAGE:\s*\{language\}/i;

const promptsWithLangDirective = [
  ['GENERATE_NO_CONTEXT_PROMPT', GENERATE_NO_CONTEXT_PROMPT],
  ['CHITCHAT_PROMPT', CHITCHAT_PROMPT],
  ['SUMMARY_PROMPT', SUMMARY_PROMPT],
  ['LOW_RELEVANCE_PROMPT', LOW_RELEVANCE_PROMPT],
  ['NO_CONTEXT_PROMPT', NO_CONTEXT_PROMPT],
  ['FAST_GENERATE_PROMPT', FAST_GENERATE_PROMPT],
  ['SUMMARIZE_CONVERSATION_PROMPT', SUMMARIZE_CONVERSATION_PROMPT],
  ['REDUCE_SUMMARY_PROMPT', REDUCE_SUMMARY_PROMPT],
  ['MAP_SUMMARY_PROMPT', MAP_SUMMARY_PROMPT],
  ['SUMMARY_PROMPT_V2', SUMMARY_PROMPT_V2],
  ['DEEP_READ_SYNTHESIZE_PROMPT', DEEP_READ_SYNTHESIZE_PROMPT],
];

for (const [name, prompt] of promptsWithLangDirective) {
  assert(typeof prompt === 'string', `${name} is string`);
  assert(
    LANG_DIRECTIVE_RE.test(prompt),
    `${name} contains language-matching directive`
  );
}

// ── 4. 한 감지 회귀: 한국어 트리거 패턴 ─────────────────────────────────────
console.log('\n[han (Korean) detection regression]');

const koreanResponseRule = /asks in Korean.*respond.*Korean|Korean.*entirely.*Korean/i;
assert(
  koreanResponseRule.test(SYSTEM_PROMPT),
  'SYSTEM_PROMPT: Korean input → Korean response rule preserved (han)'
);

assert(
  (AGENTIC_SYSTEM_PROMPT.includes('Korean or English')) ||
  (AGENTIC_SYSTEM_PROMPT.includes('Korean') && AGENTIC_SYSTEM_PROMPT.includes('English')),
  'AGENTIC_SYSTEM_PROMPT: han·eng dual-language reference present'
);

// ── 5. 영 감지 회귀: 영어 트리거 패턴 ────────────────────────────────────────
console.log('\n[eng (English) detection regression]');

const englishResponseRule = /asks in English.*respond.*English|English.*entirely.*English/i;
assert(
  englishResponseRule.test(SYSTEM_PROMPT),
  'SYSTEM_PROMPT: English input → English response rule preserved (eng)'
);

// ── 6. CONTEXTUALIZE_PROMPT: 한·영 보존 지시 ─────────────────────────────────
console.log('\n[CONTEXTUALIZE_PROMPT — language preservation]');
assert(typeof CONTEXTUALIZE_PROMPT === 'string', 'CONTEXTUALIZE_PROMPT is string');
assert(
  /Korean|한국어/i.test(CONTEXTUALIZE_PROMPT),
  'CONTEXTUALIZE_PROMPT references Korean (han)'
);
assert(
  /Preserve.*language|language.*Korean|Korean.*English/i.test(CONTEXTUALIZE_PROMPT),
  'CONTEXTUALIZE_PROMPT instructs language preservation'
);

// ── 7. 도구 description 한·영 병기 검증 (NFR-12 통합, ANALYZE_REQUEST_PROMPT) ──
console.log('\n[ANALYZE_REQUEST_PROMPT — han·eng parallel examples (NFR-12)]');
assert(typeof ANALYZE_REQUEST_PROMPT === 'string', 'ANALYZE_REQUEST_PROMPT exported');
assert(
  /자세히|간단히|요약|목록/i.test(ANALYZE_REQUEST_PROMPT),
  'ANALYZE_REQUEST_PROMPT contains Korean (han) examples'
);
assert(
  /detailed|brief|list|summary/i.test(ANALYZE_REQUEST_PROMPT),
  'ANALYZE_REQUEST_PROMPT contains English (eng) examples'
);

// ── 8. 프롬프트 최소 길이 (prompt caching minimum — NFR-12/P3-013 공유 관심사) ──
console.log('\n[Prompt length guard — caching floor (NFR-12/P3-013)]');
assert(
  AGENTIC_SYSTEM_PROMPT.length >= 200,
  'AGENTIC_SYSTEM_PROMPT length ≥ 200 chars (caching floor)'
);
assert(
  SYSTEM_PROMPT.length >= 200,
  'SYSTEM_PROMPT length ≥ 200 chars (caching floor)'
);

// ── 최종 결과 ─────────────────────────────────────────────────────────────────
console.log(`\n[Result] ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

// FR-15 acceptance markers — stdout must match /han|eng/
console.log('han·eng auto-detect preserved: han OK, eng OK');
