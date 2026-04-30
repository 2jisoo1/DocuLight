'use strict';

/**
 * Pre-flight Classify Routing tests for Agentic Graph
 *
 * 검증:
 *  - chitchat 분류 시 tool_call/observe를 우회하고 finalize 직행 (도구 미실행)
 *  - question 분류 시 ReAct 루프 정상 진입 (도구 실행됨)
 *  - classifyEnabled=false 시 classify 노드 미생성, 즉시 tool_call 진입 (회귀 방지)
 *
 * 분류는 키워드 기반 동기 함수 (classifyByKeywords) — LLM 호출 추가 없음.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AIMessage, HumanMessage } = require('@langchain/core/messages');
const { createAgenticGraph } = require('../../src/services/chatbot/workflow/agentic-graph');

function makeMockLlm({ onInvoke } = {}) {
  let count = 0;
  const llm = {
    invoke: async (messages) => {
      count++;
      if (onInvoke) {
        const r = await onInvoke({ count, messages });
        if (r) return r;
      }
      return new AIMessage({ content: '단순 응답' });
    },
  };
  Object.defineProperty(llm, 'callCount', { get: () => count });
  return llm;
}

test('classify chitchat → tool_call 우회, finalize 직행', async () => {
  let toolExecuted = 0;
  const llm = makeMockLlm();
  const tools = [{
    name: 'fake_tool',
    definition: {},
    execute: async () => { toolExecuted++; return 'x'; },
  }];
  const graph = createAgenticGraph({ llm, tools });

  // "안녕" — 짧은 인사말 키워드, chitchat으로 분류됨
  const result = await graph.invoke(
    { messages: [new HumanMessage('안녕')] },
    { configurable: { thread_id: 'classify-chitchat' } }
  );

  assert.equal(result.queryType, 'chitchat', 'queryType은 chitchat이어야 한다');
  assert.equal(toolExecuted, 0, '도구는 호출되지 않아야 한다');
  assert.equal(result.iteration, 0, 'iteration은 0이어야 한다(tool_call 미진입)');
});

test('classify question → tool_call 진입 (ReAct 정상)', async () => {
  let toolExecuted = 0;
  const llm = makeMockLlm({
    onInvoke: ({ count }) => {
      if (count === 1) {
        return new AIMessage({
          content: '',
          tool_calls: [{ id: 'q1', name: 'fake_tool', args: {} }],
        });
      }
      return new AIMessage({ content: '답변 완료' });
    },
  });
  const tools = [{
    name: 'fake_tool',
    definition: {},
    execute: async () => { toolExecuted++; return 'tool result'; },
  }];
  const graph = createAgenticGraph({ llm, tools });

  // "이 문서가 뭐야 알려줘" — '알려줘' 키워드, question으로 분류됨
  const result = await graph.invoke(
    { messages: [new HumanMessage('이 문서가 뭐야 알려줘')] },
    { configurable: { thread_id: 'classify-question' } }
  );

  assert.equal(result.queryType, 'question', 'queryType은 question이어야 한다');
  assert.ok(toolExecuted >= 1, '도구가 한 번 이상 호출되어야 한다');
});

test('chitchat 저신뢰(<0.8) → fast-path 제외, tool_call 진입', async () => {
  // "DocLight 설정?" — 키워드 미매칭 + ≤10자 → 키워드 분류기 §6 기본 분기
  // (confidence 0.6 chitchat). M-1 게이팅으로 tool_call 진입해야 함.
  let toolExecuted = 0;
  const llm = makeMockLlm({
    onInvoke: ({ count }) => {
      if (count === 1) {
        return new AIMessage({
          content: '',
          tool_calls: [{ id: 'low1', name: 'fake_tool', args: {} }],
        });
      }
      return new AIMessage({ content: '완료' });
    },
  });
  const tools = [{ name: 'fake_tool', definition: {}, execute: async () => { toolExecuted++; return 'r'; } }];
  const graph = createAgenticGraph({ llm, tools });

  const result = await graph.invoke(
    { messages: [new HumanMessage('짧은 질문임')] },
    { configurable: { thread_id: 'classify-low-conf' } }
  );

  assert.equal(result.queryType, 'chitchat', '키워드 §6 기본 분기로 chitchat');
  assert.ok(result.confidence < 0.8, `confidence는 0.8 미만이어야 함 (got ${result.confidence})`);
  assert.ok(toolExecuted >= 1, '저신뢰 chitchat은 fast-path 제외 → tool_call 진입');
});

test('multimodal HumanMessage(content array) → 텍스트 추출 후 분류', async () => {
  // H-1: BaseMessage.content가 array인 경우에도 텍스트 추출하여 분류 동작
  let toolExecuted = 0;
  const llm = makeMockLlm();
  const tools = [{ name: 'fake_tool', definition: {}, execute: async () => { toolExecuted++; return 'r'; } }];
  const graph = createAgenticGraph({ llm, tools });

  const multimodalMsg = new HumanMessage({
    content: [
      { type: 'text', text: '안녕' },
    ],
  });
  const result = await graph.invoke(
    { messages: [multimodalMsg] },
    { configurable: { thread_id: 'classify-multimodal' } }
  );

  assert.equal(result.queryType, 'chitchat', '배열 content에서도 "안녕" 추출되어 chitchat 분류');
  assert.equal(toolExecuted, 0, 'chitchat fast-path → 도구 미실행');
});

test('비-human tail (AIMessage)이 섞여도 가장 최근 HumanMessage로 분류', async () => {
  // H-2: 체크포인트 재개 시 tail이 AIMessage여도 역방향 스캔으로 HumanMessage 찾음
  const llm = makeMockLlm();
  const tools = [];
  const graph = createAgenticGraph({ llm, tools });

  const result = await graph.invoke(
    {
      messages: [
        new HumanMessage('안녕'),
        new AIMessage({ content: '이전 턴 응답입니다.' }),
      ],
    },
    { configurable: { thread_id: 'classify-resume' } }
  );

  assert.equal(result.queryType, 'chitchat', 'tail이 AIMessage여도 직전 HumanMessage("안녕")로 분류');
});

test('classifyEnabled=false → classify 노드 미생성, tool_call 즉시 진입', async () => {
  let toolExecuted = 0;
  const llm = makeMockLlm({
    onInvoke: ({ count }) => {
      if (count === 1) {
        return new AIMessage({
          content: '',
          tool_calls: [{ id: 't1', name: 'fake_tool', args: {} }],
        });
      }
      return new AIMessage({ content: '완료' });
    },
  });
  const tools = [{
    name: 'fake_tool',
    definition: {},
    execute: async () => { toolExecuted++; return 'r'; },
  }];
  const graph = createAgenticGraph({
    llm,
    tools,
    config: { chatbot: { agentic: { classifyEnabled: false } } },
  });

  // 입력은 chitchat으로 분류될 짧은 인사말이지만, classify 비활성이므로 tool_call로 직행
  const result = await graph.invoke(
    { messages: [new HumanMessage('안녕')] },
    { configurable: { thread_id: 'classify-disabled' } }
  );

  // classify 미실행 → queryType 기본값 'unknown' 유지
  assert.equal(result.queryType, 'unknown', 'classify 비활성 시 queryType은 기본값 unknown');
  assert.ok(toolExecuted >= 1, 'classify 비활성 시 tool_call 즉시 진입');
});
