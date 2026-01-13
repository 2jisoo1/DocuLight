/**
 * Phase 6: Thinking Mode Tests
 * Analyze → Plan → Execute workflow
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
console.log('\n=== Phase 6: Thinking Mode Tests ===\n');

console.log('Testing imports...');
const { ChatbotAnnotation } = require('../../src/services/chatbot/workflow/state');
const {
  analyzeQuestion,
  analysisSchema,
  isComplexQuestion,
  planStrategy,
  planSchema,
  createDefaultPlan,
  isComplexPlan,
  executeSteps,
  formatThinkingOutput
} = require('../../src/services/chatbot/workflow/nodes/thinking');
const { createThinkingChatbotGraph } = require('../../src/services/chatbot/workflow/graph');
const { HumanMessage, AIMessage } = require('@langchain/core/messages');

console.log('All imports successful!\n');

// ============================================
// 1. State Fields Test
// ============================================
console.log('1. State Fields (Thinking Mode)');

test('ChatbotAnnotation should have thinkingMode field', () => {
  const spec = ChatbotAnnotation.spec;
  assert(spec.thinkingMode, 'thinkingMode field should exist');
});

test('ChatbotAnnotation should have thinkingAnalysis field', () => {
  const spec = ChatbotAnnotation.spec;
  assert(spec.thinkingAnalysis, 'thinkingAnalysis field should exist');
});

test('ChatbotAnnotation should have thinkingPlan field', () => {
  const spec = ChatbotAnnotation.spec;
  assert(spec.thinkingPlan, 'thinkingPlan field should exist');
});

test('ChatbotAnnotation should have thinkingResults field', () => {
  const spec = ChatbotAnnotation.spec;
  assert(spec.thinkingResults, 'thinkingResults field should exist');
});

// ============================================
// 2. Analysis Schema Test
// ============================================
console.log('\n2. Analysis Schema');

test('analysisSchema should validate simple question', () => {
  const valid = {
    questionType: 'simple',
    subQuestions: [],
    requiredInfo: ['API key'],
    reasoning: 'Direct question about API key'
  };
  const result = analysisSchema.safeParse(valid);
  assert(result.success, 'Should validate simple analysis');
});

test('analysisSchema should validate complex question', () => {
  const valid = {
    questionType: 'complex',
    subQuestions: ['What is X?', 'How does Y work?'],
    requiredInfo: ['X definition', 'Y mechanism'],
    reasoning: 'Multi-part question'
  };
  const result = analysisSchema.safeParse(valid);
  assert(result.success, 'Should validate complex analysis');
});

test('analysisSchema should validate multi-part question', () => {
  const valid = {
    questionType: 'multi-part',
    subQuestions: ['Part 1', 'Part 2', 'Part 3'],
    requiredInfo: [],
    reasoning: 'Multiple distinct questions'
  };
  const result = analysisSchema.safeParse(valid);
  assert(result.success, 'Should validate multi-part analysis');
});

test('analysisSchema should reject invalid type', () => {
  const invalid = {
    questionType: 'invalid',
    subQuestions: [],
    requiredInfo: [],
    reasoning: 'Test'
  };
  const result = analysisSchema.safeParse(invalid);
  assert(!result.success, 'Should reject invalid type');
});

// ============================================
// 3. Plan Schema Test
// ============================================
console.log('\n3. Plan Schema');

test('planSchema should validate simple plan', () => {
  const valid = {
    strategy: 'Direct answer',
    steps: [{
      stepNumber: 1,
      action: 'Answer',
      description: 'Provide answer',
      expectedOutput: 'Complete answer'
    }],
    estimatedComplexity: 'low'
  };
  const result = planSchema.safeParse(valid);
  assert(result.success, 'Should validate simple plan');
});

test('planSchema should validate complex plan', () => {
  const valid = {
    strategy: 'Multi-step approach',
    steps: [
      { stepNumber: 1, action: 'Analyze', description: 'Analyze question', expectedOutput: 'Analysis' },
      { stepNumber: 2, action: 'Research', description: 'Find info', expectedOutput: 'Information' },
      { stepNumber: 3, action: 'Synthesize', description: 'Combine', expectedOutput: 'Final answer' }
    ],
    estimatedComplexity: 'high'
  };
  const result = planSchema.safeParse(valid);
  assert(result.success, 'Should validate complex plan');
});

// ============================================
// 4. Helper Functions Test
// ============================================
console.log('\n4. Helper Functions');

test('isComplexQuestion should return false for null', () => {
  assert.strictEqual(isComplexQuestion(null), false);
});

test('isComplexQuestion should return false for simple', () => {
  const analysis = { questionType: 'simple', subQuestions: [] };
  assert.strictEqual(isComplexQuestion(analysis), false);
});

test('isComplexQuestion should return true for complex', () => {
  const analysis = { questionType: 'complex', subQuestions: [] };
  assert.strictEqual(isComplexQuestion(analysis), true);
});

test('isComplexQuestion should return true with subQuestions', () => {
  const analysis = { questionType: 'simple', subQuestions: ['sub1'] };
  assert.strictEqual(isComplexQuestion(analysis), true);
});

test('isComplexPlan should return false for null', () => {
  assert.strictEqual(isComplexPlan(null), false);
});

test('isComplexPlan should return false for low complexity', () => {
  const plan = { estimatedComplexity: 'low', steps: [{ stepNumber: 1 }] };
  assert.strictEqual(isComplexPlan(plan), false);
});

test('isComplexPlan should return true for high complexity', () => {
  const plan = { estimatedComplexity: 'high', steps: [] };
  assert.strictEqual(isComplexPlan(plan), true);
});

test('isComplexPlan should return true for many steps', () => {
  const plan = { estimatedComplexity: 'low', steps: [1, 2, 3] };
  assert.strictEqual(isComplexPlan(plan), true);
});

test('createDefaultPlan should handle empty analysis', () => {
  const analysis = { subQuestions: [], questionType: 'simple' };
  const plan = createDefaultPlan(analysis);
  assert(plan.strategy, 'Should have strategy');
  assert(plan.steps.length >= 1, 'Should have at least one step');
});

test('createDefaultPlan should create steps for subQuestions', () => {
  const analysis = { subQuestions: ['Q1', 'Q2'], questionType: 'multi-part' };
  const plan = createDefaultPlan(analysis);
  assert(plan.steps.length >= 3, 'Should have step per subQuestion plus synthesis');
});

// ============================================
// 5. analyzeQuestion Node Test
// ============================================
console.log('\n5. analyzeQuestion Node');

asyncTest('analyzeQuestion should skip when thinkingMode is false', async () => {
  const mockLLM = {
    withStructuredOutput: () => ({
      invoke: async () => ({ questionType: 'simple', subQuestions: [], requiredInfo: [], reasoning: 'test' })
    })
  };

  const state = {
    messages: [new HumanMessage('Simple question')],
    thinkingMode: false,
    retrievedDocs: []
  };

  const result = await analyzeQuestion(state, { llm: mockLLM });
  assert.strictEqual(result.thinkingAnalysis, null, 'Should return null when disabled');
  assert.strictEqual(result.currentStep, 'analyzeQuestion');
});

asyncTest('analyzeQuestion should analyze when thinkingMode is true', async () => {
  const mockLLM = {
    withStructuredOutput: () => ({
      invoke: async () => ({
        questionType: 'complex',
        subQuestions: ['What?', 'How?'],
        requiredInfo: ['Info1'],
        reasoning: 'Complex question identified'
      })
    })
  };

  const state = {
    messages: [new HumanMessage('Complex multi-part question')],
    thinkingMode: true,
    retrievedDocs: []
  };

  const result = await analyzeQuestion(state, { llm: mockLLM });
  assert(result.thinkingAnalysis, 'Should have analysis');
  assert.strictEqual(result.thinkingAnalysis.questionType, 'complex');
  assert.strictEqual(result.currentStep, 'analyzeQuestion');
});

asyncTest('analyzeQuestion should handle empty messages', async () => {
  const mockLLM = {};
  const state = { messages: [], thinkingMode: true, retrievedDocs: [] };
  const result = await analyzeQuestion(state, { llm: mockLLM });
  assert(result.error, 'Should return error for empty messages');
});

// ============================================
// 6. planStrategy Node Test
// ============================================
console.log('\n6. planStrategy Node');

asyncTest('planStrategy should skip when thinkingMode is false', async () => {
  const mockLLM = {};
  const state = {
    messages: [new HumanMessage('Test')],
    thinkingMode: false,
    thinkingAnalysis: null,
    retrievedDocs: []
  };

  const result = await planStrategy(state, { llm: mockLLM });
  assert.strictEqual(result.thinkingPlan, null);
});

asyncTest('planStrategy should skip for simple questions', async () => {
  const mockLLM = {};
  const state = {
    messages: [new HumanMessage('Simple question')],
    thinkingMode: true,
    thinkingAnalysis: { questionType: 'simple', subQuestions: [] },
    retrievedDocs: []
  };

  const result = await planStrategy(state, { llm: mockLLM });
  assert(result.thinkingPlan, 'Should have default plan');
  assert.strictEqual(result.thinkingPlan.estimatedComplexity, 'low');
});

asyncTest('planStrategy should create plan for complex questions', async () => {
  const mockLLM = {
    withStructuredOutput: () => ({
      invoke: async () => ({
        strategy: 'Multi-step approach',
        steps: [
          { stepNumber: 1, action: 'Research', description: 'Find info', expectedOutput: 'Info' },
          { stepNumber: 2, action: 'Synthesize', description: 'Combine', expectedOutput: 'Answer' }
        ],
        estimatedComplexity: 'medium'
      })
    })
  };

  const state = {
    messages: [new HumanMessage('Complex question')],
    thinkingMode: true,
    thinkingAnalysis: {
      questionType: 'complex',
      subQuestions: ['Part 1', 'Part 2'],
      requiredInfo: ['Info needed'],
      reasoning: 'Complex'
    },
    retrievedDocs: []
  };

  const result = await planStrategy(state, { llm: mockLLM });
  assert(result.thinkingPlan, 'Should have plan');
  assert.strictEqual(result.thinkingPlan.strategy, 'Multi-step approach');
});

// ============================================
// 7. executeSteps Node Test
// ============================================
console.log('\n7. executeSteps Node');

asyncTest('executeSteps should skip when thinkingMode is false', async () => {
  const mockLLM = {};
  const state = {
    messages: [new HumanMessage('Test')],
    thinkingMode: false,
    thinkingPlan: null,
    retrievedDocs: []
  };

  const result = await executeSteps(state, { llm: mockLLM });
  assert.strictEqual(result.thinkingResults, null);
});

asyncTest('executeSteps should handle empty messages', async () => {
  const mockLLM = {};
  const state = {
    messages: [],
    thinkingMode: true,
    thinkingPlan: { strategy: 'test', steps: [], estimatedComplexity: 'low' },
    retrievedDocs: []
  };

  const result = await executeSteps(state, { llm: mockLLM });
  assert(result.error, 'Should return error for empty messages');
});

asyncTest('executeSteps should execute simple plan', async () => {
  const mockLLM = {
    invoke: async () => new AIMessage('Here is the answer based on the context.')
  };

  const state = {
    messages: [new HumanMessage('What is API?')],
    thinkingMode: true,
    thinkingPlan: {
      strategy: 'Direct answer',
      steps: [{ stepNumber: 1, action: 'Answer', description: 'Provide answer', expectedOutput: 'Answer' }],
      estimatedComplexity: 'low'
    },
    retrievedDocs: [{ pageContent: 'API documentation', metadata: {} }]
  };

  const result = await executeSteps(state, { llm: mockLLM });
  assert(result.messages, 'Should return messages');
  assert(result.messages.length > 0, 'Should have at least one message');
  assert(result.thinkingResults, 'Should have results');
});

// ============================================
// 8. formatThinkingOutput Test
// ============================================
console.log('\n8. formatThinkingOutput');

test('formatThinkingOutput should handle null values', () => {
  const state = {
    thinkingAnalysis: null,
    thinkingPlan: null,
    thinkingResults: null
  };
  const output = formatThinkingOutput(state);
  assert.strictEqual(output.analysis, null);
  assert.strictEqual(output.plan, null);
  assert.strictEqual(output.execution, null);
});

test('formatThinkingOutput should format analysis', () => {
  const state = {
    thinkingAnalysis: {
      questionType: 'complex',
      subQuestions: ['Q1', 'Q2'],
      reasoning: 'Test'
    },
    thinkingPlan: null,
    thinkingResults: null
  };
  const output = formatThinkingOutput(state);
  assert.strictEqual(output.analysis.type, 'complex');
  assert.strictEqual(output.analysis.subQuestions.length, 2);
});

test('formatThinkingOutput should format plan', () => {
  const state = {
    thinkingAnalysis: null,
    thinkingPlan: {
      strategy: 'Test strategy',
      estimatedComplexity: 'high',
      steps: [1, 2, 3]
    },
    thinkingResults: null
  };
  const output = formatThinkingOutput(state);
  assert.strictEqual(output.plan.strategy, 'Test strategy');
  assert.strictEqual(output.plan.complexity, 'high');
  assert.strictEqual(output.plan.stepCount, 3);
});

test('formatThinkingOutput should format execution', () => {
  const state = {
    thinkingAnalysis: null,
    thinkingPlan: null,
    thinkingResults: [
      { step: 1, result: 'OK' },
      { step: 2, result: 'OK' },
      { step: 3, error: 'Failed' }
    ]
  };
  const output = formatThinkingOutput(state);
  assert.strictEqual(output.execution.completedSteps, 3);
  assert.strictEqual(output.execution.failedSteps, 1);
});

// ============================================
// 9. Graph Creation Test
// ============================================
console.log('\n9. createThinkingChatbotGraph');

test('createThinkingChatbotGraph should create graph', () => {
  // Mock dependencies
  const mockLLM = {
    invoke: async () => new AIMessage('Response'),
    withStructuredOutput: () => ({ invoke: async () => ({}) })
  };
  const mockRetriever = {
    invoke: async () => []
  };

  const graph = createThinkingChatbotGraph({
    llm: mockLLM,
    retriever: mockRetriever,
    config: {}
  });

  assert(graph, 'Should create graph');
  assert(graph.invoke, 'Should have invoke method');
  assert(graph.stream, 'Should have stream method');
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
