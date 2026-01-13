/**
 * Simple test runner for LLM and Embedding factories
 * Run: node test/chatbot/test-factories.js
 */

const { createLLM, validateLLMConfig, LLMConfigError } = require('../../src/services/chatbot/llm-factory.js');
const { createEmbeddings, validateEmbeddingConfig, EmbeddingConfigError } = require('../../src/services/chatbot/embedding-factory.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    failed++;
  }
}

function expect(value) {
  return {
    toBe(expected) {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toBeDefined() {
      if (value === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    toThrow(expectedMessage) {
      if (typeof value !== 'function') {
        throw new Error('Expected a function');
      }
      try {
        value();
        throw new Error('Expected function to throw');
      } catch (e) {
        if (expectedMessage && !e.message.includes(expectedMessage)) {
          throw new Error(`Expected error message to include "${expectedMessage}", got "${e.message}"`);
        }
      }
    },
    toHaveLength(length) {
      if (value.length !== length) {
        throw new Error(`Expected length ${length}, got ${value.length}`);
      }
    },
    toBeGreaterThan(num) {
      if (!(value > num)) {
        throw new Error(`Expected ${value} to be greater than ${num}`);
      }
    },
    toContain(item) {
      if (!value.includes(item)) {
        throw new Error(`Expected array to contain "${item}"`);
      }
    }
  };
}

console.log('\n🧪 LLM Factory Tests\n');

console.log('createLLM:');

test('should create ChatOpenAI for openai type', () => {
  const config = {
    type: 'openai',
    endpoint: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    model: 'gpt-4o',
  };
  const llm = createLLM(config);
  expect(llm.constructor.name).toBe('ChatOpenAI');
});

test('should create AzureChatOpenAI for azure-openai type', () => {
  const config = {
    type: 'azure-openai',
    endpoint: 'https://my-resource.openai.azure.com',
    apiKey: 'test-key',
    model: 'gpt-4o',
    deploymentName: 'gpt-4o',
  };
  const llm = createLLM(config);
  expect(llm.constructor.name).toBe('AzureChatOpenAI');
});

test('should create ChatOllama for ollama type', () => {
  const config = {
    type: 'ollama',
    endpoint: 'http://localhost:11434',
    apiKey: '',
    model: 'llama3',
  };
  const llm = createLLM(config);
  expect(llm.constructor.name).toBe('ChatOllama');
});

test('should throw error for unsupported type', () => {
  expect(() => createLLM({ type: 'invalid' })).toThrow('Unsupported LLM type');
});

test('should throw error for missing type', () => {
  expect(() => createLLM({ endpoint: 'https://api.openai.com/v1' })).toThrow('LLM type is required');
});

test('should throw error for missing deploymentName on azure-openai', () => {
  expect(() => createLLM({
    type: 'azure-openai',
    endpoint: 'https://my-resource.openai.azure.com',
    apiKey: 'test-key',
    model: 'gpt-4o',
  })).toThrow('deploymentName');
});

console.log('\nvalidateLLMConfig:');

test('should return valid for correct openai config', () => {
  const result = validateLLMConfig({
    type: 'openai',
    endpoint: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    model: 'gpt-4o',
  });
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
});

test('should return errors for missing required fields', () => {
  const result = validateLLMConfig({});
  expect(result.valid).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
});

console.log('\n🧪 Embedding Factory Tests\n');

console.log('createEmbeddings:');

test('should create OpenAIEmbeddings for openai type', () => {
  const config = {
    type: 'openai',
    endpoint: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    model: 'text-embedding-3-small',
  };
  const embeddings = createEmbeddings(config);
  expect(embeddings.constructor.name).toBe('OpenAIEmbeddings');
});

test('should create AzureOpenAIEmbeddings for azure-openai type', () => {
  const config = {
    type: 'azure-openai',
    endpoint: 'https://my-resource.openai.azure.com',
    apiKey: 'test-key',
    model: 'text-embedding-3-small',
    deploymentName: 'text-embedding-3-small',
  };
  const embeddings = createEmbeddings(config);
  expect(embeddings.constructor.name).toBe('AzureOpenAIEmbeddings');
});

test('should create OllamaEmbeddings for ollama type', () => {
  const config = {
    type: 'ollama',
    endpoint: 'http://localhost:11434',
    apiKey: '',
    model: 'nomic-embed-text',
  };
  const embeddings = createEmbeddings(config);
  expect(embeddings.constructor.name).toBe('OllamaEmbeddings');
});

test('should throw error for unsupported embedding type', () => {
  expect(() => createEmbeddings({ type: 'invalid' })).toThrow('Unsupported embedding type');
});

console.log('\nvalidateEmbeddingConfig:');

test('should return valid for correct embedding config', () => {
  const result = validateEmbeddingConfig({
    type: 'openai',
    endpoint: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    model: 'text-embedding-3-small',
  });
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
});

test('should return errors for missing embedding config', () => {
  const result = validateEmbeddingConfig(null);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain('Embedding configuration is required');
});

console.log('\n' + '='.repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
