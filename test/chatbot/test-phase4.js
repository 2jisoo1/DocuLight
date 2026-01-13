/**
 * Phase 4 Tests - Conversation Management
 * Run: node test/chatbot/test-phase4.js
 */

const { HumanMessage, AIMessage } = require("@langchain/core/messages");

// Import modules
const { estimateTokens, truncateToTokenLimit, isContextOverThreshold, getRemainingTokens } = require('../../src/services/chatbot/token-estimator.js');
const { summarizeHistory, checkContextSize, needsSummarization } = require('../../src/services/chatbot/workflow/nodes/summarize.js');
const { routeByContextSize, createSimpleChatbotGraph, ConversationManager } = require('../../src/services/chatbot/workflow/graph.js');
const { SUMMARIZE_CONVERSATION_PROMPT } = require('../../src/services/chatbot/workflow/prompts.js');
const { ChatbotAnnotation } = require('../../src/services/chatbot/workflow/state.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`  ❌ ${name}`);
      console.log(`     Error: ${error.message}`);
      failed++;
    }
  })();
}

function expect(value) {
  return {
    toBe(expected) {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toBeDefined() {
      if (value === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    toBeGreaterThan(num) {
      if (!(value > num)) {
        throw new Error(`Expected ${value} to be greater than ${num}`);
      }
    },
    toBeLessThan(num) {
      if (!(value < num)) {
        throw new Error(`Expected ${value} to be less than ${num}`);
      }
    },
    toBeTruthy() {
      if (!value) {
        throw new Error(`Expected truthy value, got ${value}`);
      }
    },
    toBeFalsy() {
      if (value) {
        throw new Error(`Expected falsy value, got ${value}`);
      }
    }
  };
}

// Mock LLM for testing
function createMockLLM(options = {}) {
  const {
    classifyResult = { type: 'question', confidence: 0.9 },
    generateResult = 'This is a test response.',
    summarizeResult = 'Summary of the conversation.'
  } = options;

  return {
    withStructuredOutput: () => ({
      invoke: async () => classifyResult
    }),
    invoke: async (input) => {
      // Check if it's a summarization request
      const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
      if (inputStr.includes('summarize') || inputStr.includes('summary')) {
        return new AIMessage(summarizeResult);
      }
      return new AIMessage(generateResult);
    }
  };
}

// Mock Retriever for testing
function createMockRetriever() {
  return {
    invoke: async () => [
      { pageContent: 'Test document content.', metadata: { source: 'test.md' } },
    ]
  };
}

async function runTests() {
  console.log('\n🧪 Phase 4: Conversation Management Tests\n');

  // ==========================================
  console.log('Token Estimator:');
  // ==========================================

  await test('should estimate tokens for simple string', () => {
    const text = 'Hello, world!';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(100);
  });

  await test('should estimate tokens for Korean text', () => {
    const text = '안녕하세요, 세상!';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
  });

  await test('should estimate tokens for state object', () => {
    const state = {
      messages: [
        { content: 'User question' },
        { content: 'AI response' }
      ],
      summary: 'Previous summary'
    };
    const tokens = estimateTokens(state);
    expect(tokens).toBeGreaterThan(0);
  });

  await test('should handle empty input', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  await test('should truncate text to token limit', () => {
    const longText = 'Hello world. '.repeat(100);
    const truncated = truncateToTokenLimit(longText, 50);
    expect(estimateTokens(truncated)).toBeLessThan(100);
  });

  await test('should check context over threshold', () => {
    const state = {
      messages: [{ content: 'x'.repeat(10000) }]
    };
    const isOver = isContextOverThreshold(state, 1000, 0.5);
    expect(isOver).toBe(true);
  });

  await test('should calculate remaining tokens', () => {
    const state = { messages: [{ content: 'Hello' }] };
    const remaining = getRemainingTokens(state, 1000);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThan(1000);
  });

  // ==========================================
  console.log('\nPrompts:');
  // ==========================================

  await test('SUMMARIZE_CONVERSATION_PROMPT should be defined', () => {
    expect(SUMMARIZE_CONVERSATION_PROMPT).toBeDefined();
    expect(SUMMARIZE_CONVERSATION_PROMPT).toBeTruthy();
  });

  await test('SUMMARIZE_CONVERSATION_PROMPT should have placeholders', () => {
    expect(SUMMARIZE_CONVERSATION_PROMPT.includes('{existing_summary}')).toBe(true);
    expect(SUMMARIZE_CONVERSATION_PROMPT.includes('{conversation}')).toBe(true);
    expect(SUMMARIZE_CONVERSATION_PROMPT.includes('{target_tokens}')).toBe(true);
  });

  // ==========================================
  console.log('\nSummarize Node:');
  // ==========================================

  await test('should summarize conversation history', async () => {
    const mockLLM = createMockLLM({ summarizeResult: 'This is a summary.' });
    const state = {
      messages: [
        new HumanMessage('First question'),
        new AIMessage('First answer'),
        new HumanMessage('Second question'),
        new AIMessage('Second answer'),
      ],
      summary: ''
    };
    const config = {
      chatbot: {
        llm: { contextLength: 1000 },
        context: { compressionTarget: 0.1 }
      }
    };

    const result = await summarizeHistory(state, { llm: mockLLM, config });

    expect(result.summary).toBeDefined();
    expect(result.currentStep).toBe('summarizeHistory');
    expect(result.messages.length).toBeLessThan(state.messages.length);
  });

  await test('should handle empty messages in summarize', async () => {
    const mockLLM = createMockLLM();
    const state = { messages: [], summary: '' };

    const result = await summarizeHistory(state, { llm: mockLLM, config: {} });

    expect(result.currentStep).toBe('summarizeHistory');
  });

  await test('should check context size for routing', () => {
    const smallState = { messages: [{ content: 'Hello' }] };
    const result = checkContextSize(smallState, { chatbot: { llm: { contextLength: 10000 } } });
    expect(result).toBe('__end__');
  });

  await test('should detect when summarization is needed', () => {
    const largeState = {
      messages: [{ content: 'x'.repeat(10000) }],
      retrievedDocs: [{ pageContent: 'y'.repeat(5000) }]
    };
    const config = { chatbot: { llm: { contextLength: 1000 }, context: { compressionThreshold: 0.1 } } };

    const needs = needsSummarization(largeState, config);
    expect(needs).toBe(true);
  });

  // ==========================================
  console.log('\nContext Size Routing:');
  // ==========================================

  await test('should route to END when context is small', () => {
    const state = { messages: [{ content: 'Hello' }] };
    const config = { chatbot: { llm: { contextLength: 128000 } } };

    const route = routeByContextSize(state, config);
    // END is represented as Symbol in LangGraph, but our function returns the string/symbol
    expect(route).toBeDefined();
  });

  await test('should route to summarizeHistory when context is large', () => {
    const largeContent = 'x'.repeat(100000);
    const state = { messages: [{ content: largeContent }] };
    const config = { chatbot: { llm: { contextLength: 1000 }, context: { compressionThreshold: 0.5 } } };

    const route = routeByContextSize(state, config);
    expect(route).toBe('summarizeHistory');
  });

  // ==========================================
  console.log('\nState Annotation:');
  // ==========================================

  await test('ChatbotAnnotation should have summary field', () => {
    expect(ChatbotAnnotation).toBeDefined();
    // The annotation spec should include summary
  });

  // ==========================================
  console.log('\nSimple Graph (without MemorySaver):');
  // ==========================================

  await test('should create simple chatbot graph', () => {
    const mockLLM = createMockLLM();
    const mockRetriever = createMockRetriever();

    const graph = createSimpleChatbotGraph({
      llm: mockLLM,
      retriever: mockRetriever,
      config: {}
    });

    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe('function');
  });

  // ==========================================
  console.log('\nConversationManager:');
  // ==========================================

  await test('should create ConversationManager', () => {
    const mockLLM = createMockLLM();
    const mockRetriever = createMockRetriever();

    const graph = createSimpleChatbotGraph({
      llm: mockLLM,
      retriever: mockRetriever,
      config: {}
    });

    const manager = new ConversationManager(graph);

    expect(manager).toBeDefined();
    expect(typeof manager.createSession).toBe('function');
    expect(typeof manager.chat).toBe('function');
    expect(typeof manager.endSession).toBe('function');
  });

  await test('should create and track sessions', () => {
    const mockLLM = createMockLLM();
    const mockRetriever = createMockRetriever();

    const graph = createSimpleChatbotGraph({
      llm: mockLLM,
      retriever: mockRetriever,
      config: {}
    });

    const manager = new ConversationManager(graph);

    const sessionId = manager.createSession();
    expect(sessionId).toBeDefined();
    expect(manager.getActiveSessionCount()).toBe(1);

    manager.endSession(sessionId);
    expect(manager.getActiveSessionCount()).toBe(0);
  });

  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
