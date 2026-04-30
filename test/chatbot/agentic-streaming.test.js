'use strict';

/**
 * Agentic finalize streaming tests
 *
 * 검증:
 *  - llm.stream + streamCallbacks 등록 시 finalize가 토큰별 onToken을 호출 (누적 content)
 *  - llm.stream 미지원 시 invoke 폴백
 *  - streamCallbacks에 thread_id가 등록 안 되어 있으면 invoke로만 동작 (기본 호환)
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AIMessage, HumanMessage, AIMessageChunk } = require('@langchain/core/messages');
const { createAgenticGraph } = require('../../src/services/chatbot/workflow/agentic-graph');

function makeStreamingLlm(tokens) {
  return {
    invoke: async () => new AIMessage({ content: tokens.join('') }),
    stream: async function* () {
      for (const t of tokens) {
        yield new AIMessageChunk({ content: t });
      }
    },
  };
}

test('streaming 활성: finalize가 매 토큰마다 누적 content로 onToken 호출', async () => {
  const tokens = ['안', '녕', '하', '세', '요'];
  const llm = makeStreamingLlm(tokens);
  const streamCallbacks = new Map();
  const graph = createAgenticGraph({ llm, tools: [], streamCallbacks });

  const received = [];
  streamCallbacks.set('stream-thread', (chunk) => received.push(chunk));

  // chitchat fast-path → finalize 직행
  const result = await graph.invoke(
    { messages: [new HumanMessage('안녕')] },
    { configurable: { thread_id: 'stream-thread' } }
  );

  assert.equal(received.length, tokens.length, `토큰 수만큼 onToken 호출 (got ${received.length})`);
  // 누적 검증: 마지막 호출이 전체 content
  assert.equal(received[received.length - 1], '안녕하세요');
  // 중간 호출은 단조 증가 누적
  for (let i = 1; i < received.length; i++) {
    assert.ok(received[i].length > received[i - 1].length, `누적 길이는 단조 증가해야 함 [${i}]`);
  }
  // 최종 message content도 동일
  const last = result.messages[result.messages.length - 1];
  assert.equal(last.content, '안녕하세요');
});

test('streaming 비활성(callback 미등록): invoke로 폴백, onToken 호출 없음', async () => {
  const tokens = ['x', 'y', 'z'];
  const llm = makeStreamingLlm(tokens);
  const streamCallbacks = new Map(); // 비어있음
  const graph = createAgenticGraph({ llm, tools: [], streamCallbacks });

  const result = await graph.invoke(
    { messages: [new HumanMessage('안녕')] },
    { configurable: { thread_id: 'no-callback' } }
  );

  // streamCallbacks Map에 thread_id 미등록 → invoke 사용
  const last = result.messages[result.messages.length - 1];
  assert.equal(last.content, 'xyz', 'invoke 결과 content');
});

test('llm.stream 미지원: invoke 폴백', async () => {
  // stream 메서드 없는 mock
  const llm = { invoke: async () => new AIMessage({ content: '폴백 응답' }) };
  const streamCallbacks = new Map();
  const received = [];
  streamCallbacks.set('no-stream', (c) => received.push(c));

  const graph = createAgenticGraph({ llm, tools: [], streamCallbacks });
  const result = await graph.invoke(
    { messages: [new HumanMessage('안녕')] },
    { configurable: { thread_id: 'no-stream' } }
  );

  assert.equal(received.length, 0, 'stream 미지원 시 onToken 미호출');
  const last = result.messages[result.messages.length - 1];
  assert.equal(last.content, '폴백 응답');
});

test('llm.stream 실패: invoke 폴백 후 onToken 1회 발송 (M4)', async () => {
  const llm = {
    invoke: async () => new AIMessage({ content: '폴백 OK' }),
    stream: async () => { throw new Error('stream broken'); },
  };
  const streamCallbacks = new Map();
  const received = [];
  streamCallbacks.set('stream-fail', (c) => received.push(c));

  const graph = createAgenticGraph({ llm, tools: [], streamCallbacks });
  const result = await graph.invoke(
    { messages: [new HumanMessage('안녕')] },
    { configurable: { thread_id: 'stream-fail' } }
  );

  const last = result.messages[result.messages.length - 1];
  assert.equal(last.content, '폴백 OK');
  // M4: 폴백 경로에서도 클라이언트가 빈 응답을 받지 않도록 onToken 1회 호출
  assert.equal(received.length, 1, '폴백 시 onToken 정확히 1회 호출');
  assert.equal(received[0], '폴백 OK');
});

test('streaming 후 finalMessage가 AIMessage instanceof 유지 (H2)', async () => {
  const tokens = ['A', 'B'];
  const llm = makeStreamingLlm(tokens);
  const streamCallbacks = new Map();
  streamCallbacks.set('h2', () => { /* no-op */ });

  const graph = createAgenticGraph({ llm, tools: [], streamCallbacks });
  const result = await graph.invoke(
    { messages: [new HumanMessage('안녕')] },
    { configurable: { thread_id: 'h2' } }
  );

  const last = result.messages[result.messages.length - 1];
  // _getType 또는 instanceof 어느 한쪽은 살아있어야 downstream 무사
  const hasGetType = typeof last?._getType === 'function' && last._getType() === 'ai';
  const isInstance = last instanceof AIMessage;
  assert.ok(hasGetType || isInstance, 'AIMessage 프로토타입(또는 _getType)이 보존되어야 함');
  assert.equal(last.content, 'AB');
});

test('finalize는 [SELF_CHECK]/[DOUBLE_CHECK] 마커가 있는 메시지를 LLM 입력에서 제거', async () => {
  // LLM에 전달된 messages를 캡처
  let invokedMessages = null;
  const llm = {
    invoke: async (messages) => {
      invokedMessages = messages;
      return new AIMessage({ content: '깨끗한 답변' });
    },
  };
  const streamCallbacks = new Map();
  const graph = createAgenticGraph({ llm, tools: [], streamCallbacks });

  // 사용자 메시지 + 내부 마커가 포함된 system/user 메시지
  const { SystemMessage } = require('@langchain/core/messages');
  // chitchat fast-path로 finalize 직행시키기 위해 "안녕" 사용
  const msgs = [
    new HumanMessage('안녕'),
    new SystemMessage('[DOUBLE_CHECK trigger=citation<2] 인용 부족.'),
    new SystemMessage('[SELF_CHECK] 검토하세요.'),
  ];

  await graph.invoke(
    { messages: msgs },
    { configurable: { thread_id: 'sanitize' } }
  );

  // 실제 finalize의 LLM.invoke에 전달된 메시지에 마커가 없어야 함
  const allContent = (invokedMessages || []).map((m) => m?.content || '').join('|');
  assert.ok(!allContent.includes('[DOUBLE_CHECK'), '[DOUBLE_CHECK 마커가 LLM 입력에 노출되면 안 됨');
  assert.ok(!allContent.includes('[SELF_CHECK'), '[SELF_CHECK] 마커가 LLM 입력에 노출되면 안 됨');
  // 사용자 메시지는 보존
  assert.ok(allContent.includes('안녕'), '사용자 메시지는 보존되어야 함');
});

test('cleanupThread API: BudgetController 누수 방지', async () => {
  const llm = { invoke: async () => new AIMessage({ content: 'ok' }) };
  const graph = createAgenticGraph({ llm, tools: [], streamCallbacks: new Map() });
  // cleanup API 노출 확인
  assert.equal(typeof graph.cleanupThread, 'function', 'cleanupThread API export됨');
  // 호출이 throw 없이 동작
  graph.cleanupThread('non-existent-thread');
  graph.cleanupThread(undefined);
  graph.cleanupThread(null);
});
