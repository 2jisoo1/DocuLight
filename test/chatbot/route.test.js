'use strict';

/**
 * TASK-P3-002 — 라우팅 휴리스틱 (한·영 균형) 테스트
 * FR-7 acceptance: stdout must contain "han+eng balanced"
 */

const { computeHints, hanRatio, routingHeuristicNode } = require(
  '../../src/services/chatbot/workflow/nodes/route'
);

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

// ── hanRatio ──────────────────────────────────────────────────────────────────
console.log('\n[hanRatio]');
assert(hanRatio('안녕하세요') > 0.9, 'pure Korean → ratio > 0.9');
assert(hanRatio('hello world') === 0, 'pure English → ratio = 0');
assert(hanRatio('') === 0, 'empty → 0');
assert(hanRatio('hello 안녕') > 0 && hanRatio('hello 안녕') < 1, 'mixed → between 0 and 1');

// ── Han 키워드 힌트 (Korean queries) ─────────────────────────────────────────
console.log('\n[Korean (Han) heuristics]');

const hanList = computeHints('문서 목록을 알려줘');
assert(Array.isArray(hanList), 'returns array');
assert(hanList.includes('mcp.list_full_tree') || hanList.includes('mcp.list_documents'),
  '목록 → list tool included');

const hanRecent = computeHints('최근 업데이트된 문서를 보여줘');
assert(hanRecent.includes('mcp.list_recent'), '최근 → mcp.list_recent');

const hanSearch = computeHints('API 인증 방법 검색해줘');
assert(hanSearch.length > 0, '검색 → at least one hint');
assert(hanSearch.includes('mcp.smart_search') || hanSearch.includes('mcp.search_documents'),
  '검색 → search tool included');

const hanSummary = computeHints('이 문서를 요약해줘');
assert(hanSummary.includes('mcp.summarize_document'), '요약 → mcp.summarize_document');

const hanCode = computeHints('코드 예제를 보여줘');
assert(hanCode.includes('mcp.extract_code_block'), '코드 → mcp.extract_code_block');

const hanQuery = computeHints('인증 방식이 어떻게 되나요?');
assert(hanQuery.length > 0, '어떻게 → at least one hint');

// ── Eng 키워드 힌트 (English queries) ────────────────────────────────────────
console.log('\n[English (Eng) heuristics]');

const engList = computeHints('show all documents in the project');
assert(engList.includes('mcp.list_full_tree') || engList.includes('mcp.list_documents'),
  'list/all → list tool included');

const engRecent = computeHints('what are the recent documents?');
assert(engRecent.includes('mcp.list_recent'), 'recent → mcp.list_recent');

const engSearch = computeHints('search for authentication examples');
assert(engSearch.includes('mcp.smart_search') || engSearch.includes('mcp.search_documents'),
  'search → search tool included');

const engSummary = computeHints('summarize this document for me');
assert(engSummary.includes('mcp.summarize_document'), 'summarize → mcp.summarize_document');

const engCode = computeHints('show me a code example');
assert(engCode.includes('mcp.extract_code_block'), 'code example → mcp.extract_code_block');

const engQuery = computeHints('what is the authentication flow?');
assert(engQuery.length > 0, 'what is → at least one hint');
assert(engQuery.includes('mcp.query_document') || engQuery.includes('mcp.search_documents'),
  'what is → query/search tool');

// ── 힌트 한계 ────────────────────────────────────────────────────────────────
console.log('\n[Hint count limits]');

const wideQuery = computeHints('전체 목록 요약 코드 검색 섹션');
assert(wideQuery.length <= 3, 'max 3 hints returned');

const emptyQuery = computeHints('');
assert(emptyQuery.length === 0, 'empty string → 0 hints');

const shortQuery = computeHints('hi');
assert(shortQuery.length === 0, 'very short (≤10 chars, no keyword) → 0 hints');

const longQuery = computeHints('what does the project actually contain overall?');
assert(longQuery.length > 0, 'long query no keyword → fallback smart_search');
assert(longQuery.includes('mcp.smart_search'), 'fallback → mcp.smart_search');

// ── Node 함수 ─────────────────────────────────────────────────────────────────
console.log('\n[routingHeuristicNode]');

const state1 = { messages: [{ content: '문서 목록을 알려줘' }] };
const result1 = routingHeuristicNode(state1);
assert(result1.currentStep === 'routingHeuristic', 'node sets currentStep');
assert(Array.isArray(result1.heuristicHints), 'node returns heuristicHints array');
assert(result1.heuristicHints.includes('mcp.list_full_tree') ||
       result1.heuristicHints.includes('mcp.list_documents'), 'node: Korean list query');

const stateEng = { messages: ['search for config guide'] };
const resultEng = routingHeuristicNode(stateEng);
assert(resultEng.heuristicHints.includes('mcp.smart_search') ||
       resultEng.heuristicHints.includes('mcp.search_documents'), 'node: English search query');

const stateEmpty = { messages: [] };
const resultEmpty = routingHeuristicNode(stateEmpty);
assert(Array.isArray(resultEmpty.heuristicHints), 'node: empty messages → array');

// Logger stub — heuristic_hint 기록 검증
const logEvents = [];
const stubLogger = { info: (msg, meta) => logEvents.push({ msg, meta }) };
routingHeuristicNode({ messages: [{ content: '최근 문서 알려줘' }] }, { logger: stubLogger });
assert(logEvents.length === 1 && logEvents[0].msg === 'heuristic_hint',
  'node logs heuristic_hint to winston');
assert(Array.isArray(logEvents[0].meta.hints), 'logged hints is array');

// E1: 오류 경로 — state.messages에 악의적 값
const stateErr = { messages: [null] };
const resultErr = routingHeuristicNode(stateErr);
assert(Array.isArray(resultErr.heuristicHints), 'E1: error → heuristicHints still array');

// ── recordHintMatch ───────────────────────────────────────────────────────────
const { recordHintMatch } = require(
  '../../src/services/chatbot/workflow/nodes/route'
);

console.log('\n[recordHintMatch]');

const matchEvents = [];
const matchLogger = { info: (msg, meta) => matchEvents.push({ msg, meta }) };

recordHintMatch(['mcp.smart_search'], 'mcp.smart_search', matchLogger);
assert(matchEvents.length === 1 && matchEvents[0].msg === 'heuristic_match',
  'recordHintMatch emits heuristic_match');
assert(matchEvents[0].meta.match === true, 'match=true when actual in hints');

recordHintMatch(['mcp.smart_search'], 'mcp.list_recent', matchLogger);
assert(matchEvents[1].meta.match === false, 'match=false when actual not in hints');

recordHintMatch(['mcp.smart_search'], null, matchLogger);
assert(matchEvents[2].meta.match === false, 'match=false when actualTool=null');

// no-logger branch must not throw
recordHintMatch(['mcp.smart_search'], 'mcp.smart_search', null);
recordHintMatch(['mcp.smart_search'], 'mcp.smart_search', undefined);
assert(true, 'no-logger branch: no throw');

// ── 최종 결과 ─────────────────────────────────────────────────────────────────
console.log(`\n[Result] ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

// FR-7 acceptance marker — stdout must match /han\+eng balanced/
console.log('han+eng balanced');
