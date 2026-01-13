/**
 * Phase 7: API Endpoints & SSE Streaming Tests
 */

const assert = require('assert');

// Test utilities
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

// ============================================
// Test Imports
// ============================================
console.log('\n=== Phase 7: API & SSE Tests ===\n');

console.log('Testing imports...');
const {
  chat,
  getHistory,
  deleteHistory,
  getStatus,
  createSession,
  sendSSE,
  setupSSEHeaders
} = require('../../src/controllers/chatbot-controller');
const { ChatbotService } = require('../../src/services/chatbot/chatbot-service');
const chatbotRoutes = require('../../src/routes/chatbot');

console.log('All imports successful!\n');

// ============================================
// 1. Controller Functions Test
// ============================================
console.log('1. Controller Functions');

test('chat function should be exported', () => {
  assert(typeof chat === 'function', 'chat should be a function');
});

test('getHistory function should be exported', () => {
  assert(typeof getHistory === 'function', 'getHistory should be a function');
});

test('deleteHistory function should be exported', () => {
  assert(typeof deleteHistory === 'function', 'deleteHistory should be a function');
});

test('getStatus function should be exported', () => {
  assert(typeof getStatus === 'function', 'getStatus should be a function');
});

test('createSession function should be exported', () => {
  assert(typeof createSession === 'function', 'createSession should be a function');
});

// ============================================
// 2. SSE Helper Functions Test
// ============================================
console.log('\n2. SSE Helper Functions');

test('sendSSE should format SSE event correctly', () => {
  let output = '';
  const mockRes = {
    write: (data) => { output += data; }
  };

  sendSSE(mockRes, 'test', { message: 'hello' });

  assert(output.includes('event: test\n'), 'Should include event line');
  assert(output.includes('data: {"message":"hello"}\n\n'), 'Should include data line');
});

test('setupSSEHeaders should set correct headers', () => {
  const headers = {};
  let headersFlushed = false;
  const mockRes = {
    setHeader: (key, value) => { headers[key] = value; },
    flushHeaders: () => { headersFlushed = true; }
  };

  setupSSEHeaders(mockRes);

  assert.strictEqual(headers['Content-Type'], 'text/event-stream');
  assert.strictEqual(headers['Cache-Control'], 'no-cache');
  assert.strictEqual(headers['Connection'], 'keep-alive');
  assert(headersFlushed, 'Headers should be flushed');
});

// ============================================
// 3. ChatbotService Test
// ============================================
console.log('\n3. ChatbotService');

test('ChatbotService should be a class', () => {
  assert(typeof ChatbotService === 'function', 'ChatbotService should be a constructor');
});

test('ChatbotService should accept config and logger', () => {
  const mockConfig = { chatbot: {} };
  const mockLogger = { info: () => {}, debug: () => {} };

  const service = new ChatbotService(mockConfig, mockLogger);

  assert(service.config === mockConfig, 'Should store config');
  assert(service.logger === mockLogger, 'Should store logger');
});

test('ChatbotService should have isInitialized flag', () => {
  const service = new ChatbotService({}, null);
  assert.strictEqual(service.isInitialized, false, 'Should start uninitialized');
});

test('ChatbotService createSession should generate UUID', () => {
  const service = new ChatbotService({}, null);
  const sessionId = service.createSession();

  assert(typeof sessionId === 'string', 'Session ID should be string');
  assert(sessionId.length === 36, 'Session ID should be UUID format');
  assert(service.sessions.has(sessionId), 'Session should be stored');
});

test('ChatbotService should track multiple sessions', () => {
  const service = new ChatbotService({}, null);
  const id1 = service.createSession();
  const id2 = service.createSession();
  const id3 = service.createSession();

  assert.strictEqual(service.sessions.size, 3, 'Should have 3 sessions');
  assert(id1 !== id2 && id2 !== id3, 'Session IDs should be unique');
});

asyncTest('ChatbotService deleteSession should remove session', async () => {
  const service = new ChatbotService({}, null);
  const sessionId = service.createSession();

  assert(service.sessions.has(sessionId), 'Session should exist');

  const deleted = await service.deleteSession(sessionId);

  assert(deleted, 'Should return true for deleted session');
  assert(!service.sessions.has(sessionId), 'Session should be removed');
});

asyncTest('ChatbotService deleteSession should return false for non-existent', async () => {
  const service = new ChatbotService({}, null);
  const deleted = await service.deleteSession('non-existent-id');
  assert(!deleted, 'Should return false');
});

asyncTest('ChatbotService getHistory should return null for non-existent', async () => {
  const service = new ChatbotService({}, null);
  const history = await service.getHistory('non-existent-id');
  assert.strictEqual(history, null);
});

asyncTest('ChatbotService getHistory should return session data', async () => {
  const service = new ChatbotService({}, null);
  const sessionId = service.createSession();

  const history = await service.getHistory(sessionId);

  assert(history, 'Should return history');
  assert.strictEqual(history.threadId, sessionId);
  assert(Array.isArray(history.messages), 'Should have messages array');
  assert(history.createdAt, 'Should have createdAt');
});

asyncTest('ChatbotService getStatus should return status object', async () => {
  const mockConfig = {
    chatbot: {
      llm: { type: 'openai', model: 'gpt-4' },
      embedding: { type: 'openai', model: 'text-embedding-3-small' }
    }
  };
  const service = new ChatbotService(mockConfig, null);

  const status = await service.getStatus();

  assert(status.vectorStore, 'Should have vectorStore status');
  assert(status.llm, 'Should have llm status');
  assert(status.embedding, 'Should have embedding status');
  assert(typeof status.activeSessions === 'number', 'Should have activeSessions count');
});

test('ChatbotService getStepMessage should return messages for known steps', () => {
  const service = new ChatbotService({}, null);

  assert(service.getStepMessage('classifyQuery').includes('question'));
  assert(service.getStepMessage('retrieveDocs').includes('document'));
  assert(service.getStepMessage('generateAnswer').includes('response'));
  assert(service.getStepMessage('analyzeQuestion').includes('complex'));
});

test('ChatbotService getStepMessage should handle unknown steps', () => {
  const service = new ChatbotService({}, null);
  const message = service.getStepMessage('unknownStep');
  assert(message.includes('unknownStep'), 'Should include step name');
});

// ============================================
// 4. Routes Test
// ============================================
console.log('\n4. Routes');

test('chatbot routes should be an Express router', () => {
  assert(chatbotRoutes, 'Routes should be exported');
  assert(typeof chatbotRoutes === 'function', 'Routes should be middleware function');
});

test('chatbot routes should have stack (registered routes)', () => {
  assert(chatbotRoutes.stack, 'Router should have stack');
  assert(chatbotRoutes.stack.length > 0, 'Router should have registered routes');
});

// ============================================
// 5. Controller Error Handling Test
// ============================================
console.log('\n5. Controller Error Handling');

asyncTest('chat should return 503 when service unavailable', async () => {
  const mockReq = {
    app: { locals: { chatbotService: null } },
    body: { message: 'test' }
  };
  let statusCode = null;
  let responseData = null;
  const mockRes = {
    status: (code) => {
      statusCode = code;
      return mockRes;
    },
    json: (data) => { responseData = data; }
  };

  await chat(mockReq, mockRes, () => {});

  assert.strictEqual(statusCode, 503);
  assert.strictEqual(responseData.code, 'SERVICE_UNAVAILABLE');
});

asyncTest('chat should return 400 for missing message', async () => {
  const mockReq = {
    app: { locals: { chatbotService: { createSession: () => 'id' } } },
    body: {}
  };
  let statusCode = null;
  let responseData = null;
  const mockRes = {
    status: (code) => {
      statusCode = code;
      return mockRes;
    },
    json: (data) => { responseData = data; }
  };

  await chat(mockReq, mockRes, () => {});

  assert.strictEqual(statusCode, 400);
  assert.strictEqual(responseData.code, 'INVALID_MESSAGE');
});

asyncTest('getHistory should return 400 for missing threadId', async () => {
  const mockReq = {
    app: { locals: { chatbotService: {} } },
    params: {}
  };
  let statusCode = null;
  const mockRes = {
    status: (code) => {
      statusCode = code;
      return mockRes;
    },
    json: () => {}
  };

  await getHistory(mockReq, mockRes, () => {});

  assert.strictEqual(statusCode, 400);
});

asyncTest('getHistory should return 404 for non-existent thread', async () => {
  const mockReq = {
    app: { locals: { chatbotService: { getHistory: async () => null } } },
    params: { threadId: 'non-existent' }
  };
  let statusCode = null;
  const mockRes = {
    status: (code) => {
      statusCode = code;
      return mockRes;
    },
    json: () => {}
  };

  await getHistory(mockReq, mockRes, () => {});

  assert.strictEqual(statusCode, 404);
});

asyncTest('deleteHistory should return 404 for non-existent thread', async () => {
  const mockReq = {
    app: { locals: { chatbotService: { deleteSession: async () => false } } },
    params: { threadId: 'non-existent' }
  };
  let statusCode = null;
  const mockRes = {
    status: (code) => {
      statusCode = code;
      return mockRes;
    },
    json: () => {}
  };

  await deleteHistory(mockReq, mockRes, () => {});

  assert.strictEqual(statusCode, 404);
});

asyncTest('createSession should create new session', async () => {
  const mockReq = {
    app: {
      locals: {
        chatbotService: { createSession: () => 'new-session-id' },
        logger: { info: () => {} }
      }
    }
  };
  let responseData = null;
  const mockRes = {
    json: (data) => { responseData = data; }
  };

  await createSession(mockReq, mockRes, () => {});

  assert.strictEqual(responseData.threadId, 'new-session-id');
  assert(responseData.createdAt, 'Should have createdAt');
});

// ============================================
// Summary
// ============================================
console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
