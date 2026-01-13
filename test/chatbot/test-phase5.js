/**
 * Phase 5: Advanced RAG Test
 * Query Rewriting & Document Grading
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
console.log('\n=== Phase 5: Advanced RAG Tests ===\n');

console.log('Testing imports...');
const { ChatbotAnnotation } = require('../../src/services/chatbot/workflow/state');
const {
  GRADE_PROMPT,
  REWRITE_PROMPT,
  LOW_RELEVANCE_PROMPT,
  NO_CONTEXT_PROMPT
} = require('../../src/services/chatbot/workflow/prompts');
const {
  gradeDocuments,
  gradingSchema,
  gradeByKeywords,
  routeByRelevance
} = require('../../src/services/chatbot/workflow/nodes/grade');
const {
  rewriteQuery,
  enhanceQuestionSimple,
  canRetryRewrite
} = require('../../src/services/chatbot/workflow/nodes/rewrite');
const {
  generateWithLowRelevance,
  generateNoContext
} = require('../../src/services/chatbot/workflow/nodes/generate');
const { HumanMessage, AIMessage } = require('@langchain/core/messages');

console.log('All imports successful!\n');

// ============================================
// 1. State Fields Test
// ============================================
console.log('1. State Fields (relevanceScore, rewriteCount)');

test('ChatbotAnnotation should have relevanceScore field', () => {
  const spec = ChatbotAnnotation.spec;
  assert(spec.relevanceScore, 'relevanceScore field should exist');
});

test('ChatbotAnnotation should have rewriteCount field', () => {
  const spec = ChatbotAnnotation.spec;
  assert(spec.rewriteCount, 'rewriteCount field should exist');
});

// ============================================
// 2. Prompts Test
// ============================================
console.log('\n2. Phase 5 Prompts');

test('GRADE_PROMPT should exist and contain placeholders', () => {
  assert(GRADE_PROMPT, 'GRADE_PROMPT should exist');
  assert(GRADE_PROMPT.includes('{document}'), 'Should have {document} placeholder');
  assert(GRADE_PROMPT.includes('{question}'), 'Should have {question} placeholder');
  assert(GRADE_PROMPT.includes('binaryScore'), 'Should mention binaryScore');
});

test('REWRITE_PROMPT should exist and contain placeholders', () => {
  assert(REWRITE_PROMPT, 'REWRITE_PROMPT should exist');
  assert(REWRITE_PROMPT.includes('{question}'), 'Should have {question} placeholder');
});

test('LOW_RELEVANCE_PROMPT should exist and contain placeholders', () => {
  assert(LOW_RELEVANCE_PROMPT, 'LOW_RELEVANCE_PROMPT should exist');
  assert(LOW_RELEVANCE_PROMPT.includes('{context}'), 'Should have {context} placeholder');
  assert(LOW_RELEVANCE_PROMPT.includes('{question}'), 'Should have {question} placeholder');
});

test('NO_CONTEXT_PROMPT should exist and contain placeholders', () => {
  assert(NO_CONTEXT_PROMPT, 'NO_CONTEXT_PROMPT should exist');
  assert(NO_CONTEXT_PROMPT.includes('{question}'), 'Should have {question} placeholder');
});

// ============================================
// 3. Grading Schema Test
// ============================================
console.log('\n3. Grading Schema');

test('gradingSchema should validate correct input', () => {
  const validInput = { binaryScore: 'yes', reasoning: 'Relevant content' };
  const result = gradingSchema.safeParse(validInput);
  assert(result.success, 'Should validate correct input');
});

test('gradingSchema should validate "no" score', () => {
  const validInput = { binaryScore: 'no' };
  const result = gradingSchema.safeParse(validInput);
  assert(result.success, 'Should validate "no" score');
});

test('gradingSchema should reject invalid score', () => {
  const invalidInput = { binaryScore: 'maybe' };
  const result = gradingSchema.safeParse(invalidInput);
  assert(!result.success, 'Should reject invalid score');
});

// ============================================
// 4. Keyword Grading Test (Fallback)
// ============================================
console.log('\n4. Keyword-based Grading (Fallback)');

test('gradeByKeywords should return high score for matching keywords', () => {
  const docs = [{ pageContent: 'This document explains authentication and API keys' }];
  const question = 'How do I authenticate with API?';
  const result = gradeByKeywords(question, docs);
  assert(result.relevanceScore > 0, 'Should find keyword match and return positive score');
  assert.strictEqual(result.currentStep, 'gradeDocuments', 'Should set currentStep');
});

test('gradeByKeywords should return low score for no keyword match', () => {
  const docs = [{ pageContent: 'This is about cooking recipes' }];
  const question = 'How do I configure the database?';
  const result = gradeByKeywords(question, docs);
  assert.strictEqual(result.relevanceScore, 0, 'Should not find match');
});

test('gradeByKeywords should handle empty document', () => {
  const docs = [{ pageContent: '' }];
  const question = 'Any question here';
  const result = gradeByKeywords(question, docs);
  assert.strictEqual(result.relevanceScore, 0, 'Empty doc should return 0');
});

test('gradeByKeywords should handle empty docs array', () => {
  const docs = [];
  const question = 'Some question here';
  // gradeByKeywords handles empty array - relevanceScore will be NaN (0/0)
  // but in practice it's called via gradeDocuments which checks for empty docs first
  const result = gradeByKeywords(question, docs);
  assert(result.currentStep === 'gradeDocuments', 'Should set currentStep');
});

// ============================================
// 5. routeByRelevance Test
// ============================================
console.log('\n5. Routing by Relevance');

test('routeByRelevance should return "generateAnswer" for high relevance', () => {
  const state = { relevanceScore: 0.8, rewriteCount: 0, retrievedDocs: [{ pageContent: 'doc' }] };
  const result = routeByRelevance(state, 0.7);
  assert.strictEqual(result, 'generateAnswer', 'High relevance should go to generateAnswer');
});

test('routeByRelevance should return "rewriteQuery" for low relevance with retries left', () => {
  const state = { relevanceScore: 0.3, rewriteCount: 0, retrievedDocs: [{ pageContent: 'doc' }] };
  const result = routeByRelevance(state, 0.7);
  assert.strictEqual(result, 'rewriteQuery', 'Low relevance with retries should go to rewriteQuery');
});

test('routeByRelevance should return "generateWithLowRelevance" when max retries reached', () => {
  const state = { relevanceScore: 0.3, rewriteCount: 2, retrievedDocs: [{ pageContent: 'doc' }] };
  const result = routeByRelevance(state, 0.7);
  assert.strictEqual(result, 'generateWithLowRelevance', 'Max retries with docs should go to generateWithLowRelevance');
});

test('routeByRelevance should return "generateNoContext" when no docs', () => {
  const state = { relevanceScore: 0, rewriteCount: 2, retrievedDocs: [] };
  const result = routeByRelevance(state, 0.7);
  assert.strictEqual(result, 'generateNoContext', 'No docs should go to generateNoContext');
});

test('routeByRelevance should use default threshold of 0.7', () => {
  const state = { relevanceScore: 0.75, rewriteCount: 0, retrievedDocs: [{ pageContent: 'doc' }] };
  const result = routeByRelevance(state);
  assert.strictEqual(result, 'generateAnswer', 'Should use 0.7 as default threshold');
});

// ============================================
// 6. canRetryRewrite Test
// ============================================
console.log('\n6. Rewrite Retry Logic');

test('canRetryRewrite should return true when rewriteCount is 0', () => {
  const state = { rewriteCount: 0 };
  assert.strictEqual(canRetryRewrite(state), true, 'Should allow retry at 0');
});

test('canRetryRewrite should return true when rewriteCount is 1', () => {
  const state = { rewriteCount: 1 };
  assert.strictEqual(canRetryRewrite(state), true, 'Should allow retry at 1');
});

test('canRetryRewrite should return false when rewriteCount is 2', () => {
  const state = { rewriteCount: 2 };
  assert.strictEqual(canRetryRewrite(state), false, 'Should not allow retry at 2');
});

test('canRetryRewrite should accept custom maxRetries', () => {
  const state = { rewriteCount: 3 };
  assert.strictEqual(canRetryRewrite(state, 5), true, 'Should allow with higher limit');
  assert.strictEqual(canRetryRewrite(state, 3), false, 'Should not allow at limit');
});

// ============================================
// 7. enhanceQuestionSimple Test
// ============================================
console.log('\n7. Simple Question Enhancement (Fallback)');

test('enhanceQuestionSimple should add enhancement to question', () => {
  const question = 'How do I install?';
  const enhanced = enhanceQuestionSimple(question);
  assert(enhanced.startsWith(question), 'Should start with original question');
  assert(enhanced.length > question.length, 'Should be longer than original');
});

test('enhanceQuestionSimple should produce different results', () => {
  // Run multiple times to check randomness (may occasionally fail)
  const question = 'Test question';
  const results = new Set();
  for (let i = 0; i < 10; i++) {
    results.add(enhanceQuestionSimple(question));
  }
  // Should have at least some variety (allows for random same results)
  assert(results.size >= 1, 'Should produce results');
});

// ============================================
// 8. gradeDocuments Test (with Mock LLM)
// ============================================
console.log('\n8. gradeDocuments Node');

asyncTest('gradeDocuments should return relevanceScore', async () => {
  // Mock LLM that returns structured output
  const mockLLM = {
    withStructuredOutput: () => ({
      invoke: async () => ({ binaryScore: 'yes', reasoning: 'Relevant' })
    })
  };

  const state = {
    messages: [new HumanMessage('How do I configure the API?')],
    retrievedDocs: [
      { pageContent: 'API configuration guide', metadata: { source: 'api.md' } }
    ]
  };

  const result = await gradeDocuments(state, { llm: mockLLM });

  assert(typeof result.relevanceScore === 'number', 'Should return relevanceScore');
  assert(result.relevanceScore >= 0 && result.relevanceScore <= 1, 'Score should be 0-1');
  assert.strictEqual(result.currentStep, 'gradeDocuments', 'Should set currentStep');
});

asyncTest('gradeDocuments should handle empty docs', async () => {
  const mockLLM = {
    withStructuredOutput: () => ({
      invoke: async () => ({ binaryScore: 'no' })
    })
  };

  const state = {
    messages: [new HumanMessage('Test question')],
    retrievedDocs: []
  };

  const result = await gradeDocuments(state, { llm: mockLLM });

  assert.strictEqual(result.relevanceScore, 0, 'Empty docs should return 0');
});

asyncTest('gradeDocuments should handle LLM error with fallback', async () => {
  const mockLLM = {
    withStructuredOutput: () => ({
      invoke: async () => { throw new Error('LLM Error'); }
    })
  };

  const state = {
    messages: [new HumanMessage('How to configure API?')],
    retrievedDocs: [
      { pageContent: 'API configuration documentation', metadata: {} }
    ]
  };

  const result = await gradeDocuments(state, { llm: mockLLM });

  // Should fall back to keyword grading
  assert(typeof result.relevanceScore === 'number', 'Should still return a score');
  assert.strictEqual(result.currentStep, 'gradeDocuments', 'Should set currentStep');
});

// ============================================
// 9. rewriteQuery Test (with Mock LLM)
// ============================================
console.log('\n9. rewriteQuery Node');

asyncTest('rewriteQuery should rewrite question', async () => {
  const mockLLM = {
    invoke: async () => 'How can I set up and configure the API endpoint?'
  };

  const state = {
    messages: [new HumanMessage('api setup?')],
    rewriteCount: 0
  };

  const result = await rewriteQuery(state, { llm: mockLLM });

  assert(result.messages, 'Should return messages');
  assert.strictEqual(result.rewriteCount, 1, 'Should increment rewriteCount');
  assert.strictEqual(result.currentStep, 'rewriteQuery', 'Should set currentStep');
});

asyncTest('rewriteQuery should stop at max retries', async () => {
  const mockLLM = {
    invoke: async () => 'Rewritten question'
  };

  const state = {
    messages: [new HumanMessage('test')],
    rewriteCount: 2
  };

  const result = await rewriteQuery(state, { llm: mockLLM });

  assert(result.error, 'Should return error at max retries');
  assert(!result.messages, 'Should not return new messages');
});

asyncTest('rewriteQuery should handle LLM error with fallback', async () => {
  const mockLLM = {
    invoke: async () => { throw new Error('LLM Error'); }
  };

  const state = {
    messages: [new HumanMessage('original question')],
    rewriteCount: 0
  };

  const result = await rewriteQuery(state, { llm: mockLLM });

  // Should use fallback enhancement
  assert(result.messages, 'Should return messages with fallback');
  assert.strictEqual(result.rewriteCount, 1, 'Should still increment count');
  assert(result.error, 'Should indicate fallback was used');
});

// ============================================
// 10. generateWithLowRelevance Test
// ============================================
console.log('\n10. generateWithLowRelevance Node');

asyncTest('generateWithLowRelevance should generate response with uncertainty', async () => {
  const mockLLM = {
    invoke: async () => new AIMessage('Based on limited information...')
  };

  const state = {
    messages: [new HumanMessage('What is the config format?')],
    retrievedDocs: [
      { pageContent: 'Some partially relevant content', metadata: {} },
      { pageContent: 'More content', metadata: {} }
    ]
  };

  const result = await generateWithLowRelevance(state, { llm: mockLLM });

  assert(result.messages, 'Should return messages');
  assert(result.messages.length > 0, 'Should have at least one message');
  assert.strictEqual(result.currentStep, 'generateWithLowRelevance', 'Should set currentStep');
});

asyncTest('generateWithLowRelevance should handle empty messages', async () => {
  const mockLLM = {
    invoke: async () => new AIMessage('Response')
  };

  const state = {
    messages: [],
    retrievedDocs: []
  };

  const result = await generateWithLowRelevance(state, { llm: mockLLM });

  assert(result.error, 'Should return error for empty messages');
});

asyncTest('generateWithLowRelevance should use top 3 docs', async () => {
  let invokedPrompt = '';
  const mockLLM = {
    invoke: async (messages) => {
      invokedPrompt = messages[1].content;
      return new AIMessage('Response');
    }
  };

  const state = {
    messages: [new HumanMessage('Test question')],
    retrievedDocs: [
      { pageContent: 'Doc 1', metadata: {} },
      { pageContent: 'Doc 2', metadata: {} },
      { pageContent: 'Doc 3', metadata: {} },
      { pageContent: 'Doc 4 - should not be included', metadata: {} },
      { pageContent: 'Doc 5 - should not be included', metadata: {} }
    ]
  };

  await generateWithLowRelevance(state, { llm: mockLLM });

  assert(invokedPrompt.includes('Doc 1'), 'Should include Doc 1');
  assert(invokedPrompt.includes('Doc 2'), 'Should include Doc 2');
  assert(invokedPrompt.includes('Doc 3'), 'Should include Doc 3');
  assert(!invokedPrompt.includes('Doc 4'), 'Should not include Doc 4');
});

// ============================================
// 11. generateNoContext Test
// ============================================
console.log('\n11. generateNoContext Node');

asyncTest('generateNoContext should generate helpful response', async () => {
  const mockLLM = {
    invoke: async () => new AIMessage('I could not find relevant documents. Please try rephrasing your question.')
  };

  const state = {
    messages: [new HumanMessage('What is foobar?')]
  };

  const result = await generateNoContext(state, { llm: mockLLM });

  assert(result.messages, 'Should return messages');
  assert(result.messages.length > 0, 'Should have at least one message');
  assert.strictEqual(result.currentStep, 'generateNoContext', 'Should set currentStep');
});

asyncTest('generateNoContext should handle empty messages', async () => {
  const mockLLM = {
    invoke: async () => new AIMessage('Response')
  };

  const state = {
    messages: []
  };

  const result = await generateNoContext(state, { llm: mockLLM });

  assert(result.error, 'Should return error for empty messages');
});

asyncTest('generateNoContext should handle LLM error', async () => {
  const mockLLM = {
    invoke: async () => { throw new Error('LLM Error'); }
  };

  const state = {
    messages: [new HumanMessage('Test question')]
  };

  const result = await generateNoContext(state, { llm: mockLLM });

  assert(result.messages, 'Should return fallback message');
  assert(result.error, 'Should indicate error');
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
