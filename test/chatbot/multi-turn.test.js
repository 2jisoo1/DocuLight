'use strict';

/**
 * TASK-P2-005 — Multi-Turn Memory 단위 테스트
 *
 * DoD 커버 항목:
 *   1. maxLines 동적 한도 (5줄 초과 절단)
 *   2. maxTokens 동적 한도 (200토큰 초과 절단)
 *   3. 두 한도 중 먼저 걸리는 것 적용
 *   4. 비동기 prefetch 캐시 히트 (LLM 재호출 없음)
 *   5. prefetch 없을 때 직접 LLM 호출
 *   6. prefetch 캐시 1회 소비 후 재호출 시 LLM 재호출
 *   7. provider != anthropic (azure-openai) 시 동일 동작
 *   8. LLM 실패 시 graceful degradation (throw 없음)
 */

const { MultiTurnMemory, truncateSummary } = require('../../src/services/chatbot/multi-turn-memory');

let passed = 0;
let failed = 0;

function ok(label, cond, detail) {
  if (cond) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ── truncateSummary 순수 로직 ─────────────────────────────────────────────

function test_truncate_by_lines() {
  const text = 'L1\nL2\nL3\nL4\nL5\nL6\nL7';
  const result = truncateSummary(text, 5, 9999);
  const lines = result.split('\n').filter(l => l.trim());
  ok('truncate: maxLines=5 결과 ≤ 5줄', lines.length <= 5, `got ${lines.length}`);
  ok('truncate: L6 포함 안 됨', !result.includes('L6'));
}

function test_truncate_by_tokens() {
  const longText = 'A'.repeat(1000);
  const result = truncateSummary(longText, 99, 200);
  ok('truncate: maxTokens=200 → ≤800자', result.length <= 800, `got ${result.length}`);
}

function test_truncate_lines_before_tokens() {
  const text = 'Line1\nLine2\nLine3';
  const result = truncateSummary(text, 5, 9999);
  const lines = result.split('\n').filter(l => l.trim());
  ok('truncate: 3줄이 5줄 한도 이내이면 3줄 유지', lines.length === 3);
}

function test_truncate_empty_input() {
  const result = truncateSummary('', 5, 200);
  ok('truncate: 빈 입력 → 빈 출력', result === '');
}

function test_truncate_filters_blank_lines() {
  const text = '\n\nLine1\n\nLine2\n\n';
  const result = truncateSummary(text, 5, 9999);
  const lines = result.split('\n').filter(l => l.trim());
  ok('truncate: 빈 줄 제거 후 2줄', lines.length === 2);
}

// ── MultiTurnMemory (fake LLM — 라이브러리 mock 없음) ─────────────────────

async function test_summarize_calls_llm_and_truncates() {
  let callCount = 0;
  const llm = {
    async invoke() {
      callCount++;
      return { content: 'L1\nL2\nL3\nL4\nL5\nL6\nL7' };
    },
  };
  const mem = new MultiTurnMemory({ llm, provider: 'openai' });
  const messages = [
    { role: 'user', content: '안녕하세요' },
    { role: 'assistant', content: '네, 무엇을 도와드릴까요?' },
  ];
  const summary = await mem.summarizePreviousTurns(messages, { maxLines: 5, maxTokens: 200 });
  const lines = summary.split('\n').filter(l => l.trim());
  ok('summarize: LLM 1회 호출', callCount === 1, `callCount=${callCount}`);
  ok('summarize: 결과 ≤ 5줄', lines.length <= 5, `got ${lines.length}`);
}

async function test_prefetch_cache_hit() {
  let callCount = 0;
  const llm = {
    async invoke() {
      callCount++;
      return { content: '사전 캐시 요약' };
    },
  };
  const mem = new MultiTurnMemory({ llm });
  const messages = [{ role: 'user', content: 'prefetch test' }];

  mem.prefetchNextTurnSummary(messages, { maxLines: 5, maxTokens: 200 });

  const summary = await mem.summarizePreviousTurns(messages, { maxLines: 5, maxTokens: 200 });
  ok('prefetch: LLM 정확히 1회 호출', callCount === 1, `callCount=${callCount}`);
  ok('prefetch: 캐시에서 요약 반환', summary === '사전 캐시 요약');
}

async function test_no_prefetch_direct_llm_call() {
  let called = false;
  const llm = {
    async invoke() {
      called = true;
      return { content: '직접 호출 요약' };
    },
  };
  const mem = new MultiTurnMemory({ llm });
  const messages = [{ role: 'user', content: 'no prefetch' }];
  const summary = await mem.summarizePreviousTurns(messages);
  ok('no prefetch: LLM 직접 호출', called);
  ok('no prefetch: 요약 반환', summary.length > 0);
}

async function test_prefetch_cache_consumed_once() {
  let callCount = 0;
  const llm = {
    async invoke() {
      callCount++;
      return { content: `call#${callCount}` };
    },
  };
  const mem = new MultiTurnMemory({ llm });
  const messages = [{ role: 'user', content: 'consume cache' }];

  mem.prefetchNextTurnSummary(messages);
  const s1 = await mem.summarizePreviousTurns(messages);
  const s2 = await mem.summarizePreviousTurns(messages);

  ok('cache 1회 소비: 총 LLM 2회 호출', callCount === 2, `callCount=${callCount}`);
  ok('첫 결과 캐시에서', s1 === 'call#1');
  ok('두 번째 결과 재호출', s2 === 'call#2');
}

async function test_non_anthropic_provider_works() {
  const llm = {
    async invoke() { return { content: 'azure 요약 결과' }; },
  };
  const mem = new MultiTurnMemory({ llm, provider: 'azure-openai' });
  const messages = [{ role: 'user', content: '문서 목록 보여줘' }];
  const summary = await mem.summarizePreviousTurns(messages);
  ok('non-anthropic: 요약 반환', summary.length > 0);
  ok('non-anthropic: 내용 정확', summary === 'azure 요약 결과');
}

async function test_llm_failure_graceful_degradation() {
  const llm = {
    async invoke() { throw new Error('LLM 불가'); },
  };
  const mem = new MultiTurnMemory({ llm });
  const messages = [
    { role: 'user', content: '테스트 메시지' },
    { role: 'assistant', content: '테스트 응답' },
  ];
  let summary;
  let threw = false;
  try {
    summary = await mem.summarizePreviousTurns(messages, { maxLines: 5, maxTokens: 200 });
  } catch {
    threw = true;
  }
  ok('LLM 실패: throw 없음', !threw);
  ok('LLM 실패: 폴백 결과 반환', summary != null && summary.length > 0);
}

async function test_duplicate_prefetch_ignored() {
  let callCount = 0;
  const llm = {
    async invoke() {
      callCount++;
      return { content: `call#${callCount}` };
    },
  };
  const mem = new MultiTurnMemory({ llm });
  const messages = [{ role: 'user', content: 'dup prefetch' }];

  mem.prefetchNextTurnSummary(messages);
  mem.prefetchNextTurnSummary(messages);

  await mem.summarizePreviousTurns(messages);
  ok('중복 prefetch: LLM 1회만 호출', callCount === 1, `callCount=${callCount}`);
}

async function test_anthropic_array_content_response() {
  // Anthropic SDK는 content를 [{type:'text',text:'...'}] 배열로 반환
  const llm = {
    async invoke() {
      return { content: [{ type: 'text', text: 'Anthropic 배열 요약' }] };
    },
  };
  const mem = new MultiTurnMemory({ llm, provider: 'anthropic' });
  const messages = [{ role: 'user', content: '문서 요약 요청' }];
  const summary = await mem.summarizePreviousTurns(messages);
  ok('Anthropic 배열 content: 텍스트 정확히 추출', summary === 'Anthropic 배열 요약',
    `got: "${summary}"`);
}

async function test_null_message_in_array() {
  const llm = {
    async invoke() { return { content: '정상 요약' }; },
  };
  const mem = new MultiTurnMemory({ llm });
  const messages = [null, { role: 'user', content: '정상 메시지' }, null];
  let summary;
  let threw = false;
  try {
    summary = await mem.summarizePreviousTurns(messages);
  } catch {
    threw = true;
  }
  ok('null 메시지 포함: throw 없음', !threw);
  ok('null 메시지 포함: 결과 반환', summary != null && summary.length > 0);
}

async function test_prefetch_opts_mismatch_no_cache_hit() {
  let callCount = 0;
  const llm = {
    async invoke() {
      callCount++;
      return { content: `call#${callCount}` };
    },
  };
  const mem = new MultiTurnMemory({ llm });
  const messages = [{ role: 'user', content: 'opts mismatch' }];

  // prefetch with maxLines=5, consume with maxLines=3 → cache miss (다른 opts)
  mem.prefetchNextTurnSummary(messages, { maxLines: 5, maxTokens: 200 });
  await mem.summarizePreviousTurns(messages, { maxLines: 3, maxTokens: 100 });

  ok('opts 불일치: 캐시 미스로 LLM 2회 호출', callCount === 2, `callCount=${callCount}`);
}

async function run() {
  console.log('── TASK-P2-005 multi-turn.test.js ──');

  test_truncate_by_lines();
  test_truncate_by_tokens();
  test_truncate_lines_before_tokens();
  test_truncate_empty_input();
  test_truncate_filters_blank_lines();

  await test_summarize_calls_llm_and_truncates();
  await test_prefetch_cache_hit();
  await test_no_prefetch_direct_llm_call();
  await test_prefetch_cache_consumed_once();
  await test_non_anthropic_provider_works();
  await test_llm_failure_graceful_degradation();
  await test_duplicate_prefetch_ignored();
  await test_anthropic_array_content_response();
  await test_null_message_in_array();
  await test_prefetch_opts_mismatch_no_cache_hit();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('PASS');
  } else {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
