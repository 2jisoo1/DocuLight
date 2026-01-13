/**
 * Phase 3 Tests - RAG Workflow
 * Run: node test/chatbot/test-phase3.js
 */

const { HumanMessage, AIMessage } = require("@langchain/core/messages");

// Import workflow modules
const { ChatbotAnnotation } = require('../../src/services/chatbot/workflow/state.js');
const { classifyQuery, classificationSchema } = require('../../src/services/chatbot/workflow/nodes/classify.js');
const { retrieveDocs, formatRetrievedDocs } = require('../../src/services/chatbot/workflow/nodes/retrieve.js');
const { generateAnswer } = require('../../src/services/chatbot/workflow/nodes/generate.js');
const { createChatbotGraph, createSimpleChatbotGraph, routeByQueryType, runSimpleQuery } = require('../../src/services/chatbot/workflow/graph.js');
const { SYSTEM_PROMPT, CLASSIFY_PROMPT, GENERATE_PROMPT } = require('../../src/services/chatbot/workflow/prompts.js');

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
    toContain(item) {
      if (typeof value === 'string') {
        if (!value.includes(item)) {
          throw new Error(`Expected string to contain "${item}"`);
        }
      } else if (Array.isArray(value)) {
        if (!value.includes(item)) {
          throw new Error(`Expected array to contain "${item}"`);
        }
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
    },
    toBeOneOf(options) {
      if (!options.includes(value)) {
        throw new Error(`Expected one of ${JSON.stringify(options)}, got ${value}`);
      }
    }
  };
}

// Mock LLM for testing
function createMockLLM(options = {}) {
  const {
    classifyResult = { type: 'question', confidence: 0.9 },
    generateResult = 'This is a test response.'
  } = options;

  return {
    withStructuredOutput: () => ({
      invoke: async () => classifyResult
    }),
    invoke: async () => new AIMessage(generateResult),
    stream: async function* () {
      for (const word of generateResult.split(' ')) {
        yield { content: word + ' ' };
      }
    }
  };
}

// Mock Retriever for testing
function createMockRetriever(docs = []) {
  return {
    invoke: async () => docs.length > 0 ? docs : [
      { pageContent: 'Test document 1 content about API authentication.', metadata: { source: 'doc1.md' } },
      { pageContent: 'Test document 2 content about configuration.', metadata: { source: 'doc2.md' } },
    ]
  };
}

async function runTests() {
  console.log('\n🧪 Phase 3: RAG Workflow Tests\n');

  // ==========================================
  console.log('Prompts:');
  // ==========================================

  await test('SYSTEM_PROMPT should be defined', () => {
    expect(SYSTEM_PROMPT).toBeDefined();
    expect(SYSTEM_PROMPT).toContain('DocLight');
    expect(SYSTEM_PROMPT).toContain('LANGUAGE RULE');
  });

  await test('CLASSIFY_PROMPT should contain categories', () => {
    expect(CLASSIFY_PROMPT).toBeDefined();
    expect(CLASSIFY_PROMPT).toContain('question');
    expect(CLASSIFY_PROMPT).toContain('summary');
    expect(CLASSIFY_PROMPT).toContain('chitchat');
    expect(CLASSIFY_PROMPT).toContain('unknown');
  });

  await test('GENERATE_PROMPT should have placeholders', () => {
    expect(GENERATE_PROMPT).toBeDefined();
    expect(GENERATE_PROMPT).toContain('{context}');
    expect(GENERATE_PROMPT).toContain('{question}');
  });

  // ==========================================
  console.log('\nClassify Node:');
  // ==========================================

  await test('should classify question type with mock LLM', async () => {
    const mockLLM = createMockLLM({ classifyResult: { type: 'question', confidence: 0.95 } });
    const state = {
      messages: [new HumanMessage('How do I authenticate with the API?')]
    };

    const result = await classifyQuery(state, { llm: mockLLM });

    expect(result.queryType).toBe('question');
    expect(result.confidence).toBe(0.95);
    expect(result.currentStep).toBe('classifyQuery');
  });

  await test('should classify chitchat type', async () => {
    const mockLLM = createMockLLM({ classifyResult: { type: 'chitchat', confidence: 0.9 } });
    const state = {
      messages: [new HumanMessage('Hello!')]
    };

    const result = await classifyQuery(state, { llm: mockLLM });

    expect(result.queryType).toBe('chitchat');
  });

  await test('should handle empty messages', async () => {
    const mockLLM = createMockLLM();
    const state = { messages: [] };

    const result = await classifyQuery(state, { llm: mockLLM });

    expect(result.queryType).toBe('unknown');
    expect(result.error).toBeDefined();
  });

  await test('should handle short input as unknown', async () => {
    const mockLLM = createMockLLM();
    const state = {
      messages: [new HumanMessage('Hi')]  // < 3 chars when trimmed
    };

    const result = await classifyQuery(state, { llm: mockLLM });

    // Short input should be classified as unknown or use fallback
    expect(result.currentStep).toBe('classifyQuery');
  });

  // ==========================================
  console.log('\nRetrieve Node:');
  // ==========================================

  await test('should retrieve documents', async () => {
    const mockRetriever = createMockRetriever();
    const state = {
      messages: [new HumanMessage('API authentication')]
    };

    const result = await retrieveDocs(state, { retriever: mockRetriever });

    expect(result.retrievedDocs.length).toBeGreaterThan(0);
    expect(result.currentStep).toBe('retrieveDocs');
  });

  await test('should handle empty query', async () => {
    const mockRetriever = createMockRetriever();
    const state = {
      messages: [new HumanMessage('')]
    };

    const result = await retrieveDocs(state, { retriever: mockRetriever });

    expect(result.retrievedDocs.length).toBe(0);
    expect(result.error).toBeDefined();
  });

  await test('should format retrieved docs', () => {
    const docs = [
      { pageContent: 'Content 1', metadata: { source: 'doc1.md' } },
      { pageContent: 'Content 2', metadata: { source: 'doc2.md' } }
    ];

    const formatted = formatRetrievedDocs(docs);

    expect(formatted).toContain('[1]');
    expect(formatted).toContain('[2]');
    expect(formatted).toContain('doc1.md');
    expect(formatted).toContain('Content 1');
  });

  // ==========================================
  console.log('\nGenerate Node:');
  // ==========================================

  await test('should generate answer with context', async () => {
    const mockLLM = createMockLLM({ generateResult: 'The API uses token-based authentication.' });
    const state = {
      messages: [new HumanMessage('How do I authenticate?')],
      retrievedDocs: [
        { pageContent: 'Use Bearer token for authentication.', metadata: { source: 'auth.md' } }
      ],
      queryType: 'question'
    };

    const result = await generateAnswer(state, { llm: mockLLM, config: {} });

    expect(result.messages.length).toBe(1);
    expect(result.currentStep).toBe('generateAnswer');
  });

  await test('should generate chitchat response', async () => {
    const mockLLM = createMockLLM({ generateResult: 'Hello! How can I help you today?' });
    const state = {
      messages: [new HumanMessage('Hello!')],
      retrievedDocs: [],
      queryType: 'chitchat'
    };

    const result = await generateAnswer(state, { llm: mockLLM, config: {} });

    expect(result.messages.length).toBe(1);
    expect(result.currentStep).toBe('generateAnswer');
  });

  await test('should handle no messages', async () => {
    const mockLLM = createMockLLM();
    const state = {
      messages: [],
      retrievedDocs: [],
      queryType: 'question'
    };

    const result = await generateAnswer(state, { llm: mockLLM, config: {} });

    expect(result.error).toBeDefined();
  });

  // ==========================================
  console.log('\nRouting:');
  // ==========================================

  await test('should route question to retrieveDocs', () => {
    const state = { queryType: 'question' };
    const next = routeByQueryType(state);
    expect(next).toBe('retrieveDocs');
  });

  await test('should route summary to retrieveDocs', () => {
    const state = { queryType: 'summary' };
    const next = routeByQueryType(state);
    expect(next).toBe('retrieveDocs');
  });

  await test('should route chitchat to generateAnswer', () => {
    const state = { queryType: 'chitchat' };
    const next = routeByQueryType(state);
    expect(next).toBe('generateAnswer');
  });

  await test('should route unknown to retrieveDocs', () => {
    const state = { queryType: 'unknown' };
    const next = routeByQueryType(state);
    expect(next).toBe('retrieveDocs');
  });

  // ==========================================
  console.log('\nGraph Creation:');
  // ==========================================

  await test('should create chatbot graph', () => {
    const mockLLM = createMockLLM();
    const mockRetriever = createMockRetriever();

    const graph = createChatbotGraph({
      llm: mockLLM,
      retriever: mockRetriever,
      config: {}
    });

    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe('function');
  });

  await test('should run simple query through graph', async () => {
    const mockLLM = createMockLLM({
      classifyResult: { type: 'question', confidence: 0.9 },
      generateResult: 'Test answer from the documents.'
    });
    const mockRetriever = createMockRetriever();

    // Use simple graph (without MemorySaver) for basic query test
    const graph = createSimpleChatbotGraph({
      llm: mockLLM,
      retriever: mockRetriever,
      config: {}
    });

    const answer = await runSimpleQuery(graph, 'What is the API endpoint?');

    expect(answer).toBeDefined();
    expect(typeof answer).toBe('string');
  });

  // ==========================================
  console.log('\nState Annotation:');
  // ==========================================

  await test('ChatbotAnnotation should be defined', () => {
    expect(ChatbotAnnotation).toBeDefined();
  });

  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
