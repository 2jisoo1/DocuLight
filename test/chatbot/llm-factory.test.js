/**
 * LLM Factory Tests
 * Phase 1: Config & LLM Factory
 */

const { createLLM, validateLLMConfig, LLMConfigError } = require('../../src/services/chatbot/llm-factory.js');

describe('LLM Factory', () => {
  describe('createLLM', () => {
    it('should create ChatOpenAI for openai type', () => {
      const config = {
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o',
        contextLength: 128000,
      };

      const llm = createLLM(config);

      expect(llm.constructor.name).toBe('ChatOpenAI');
    });

    it('should create AzureChatOpenAI for azure-openai type', () => {
      const config = {
        type: 'azure-openai',
        endpoint: 'https://my-resource.openai.azure.com',
        apiKey: 'test-key',
        model: 'gpt-4o',
        contextLength: 128000,
        deploymentName: 'gpt-4o',
      };

      const llm = createLLM(config);

      expect(llm.constructor.name).toBe('AzureChatOpenAI');
    });

    it('should create ChatOllama for ollama type', () => {
      const config = {
        type: 'ollama',
        endpoint: 'http://localhost:11434',
        apiKey: '',
        model: 'llama3',
        contextLength: 8192,
      };

      const llm = createLLM(config);

      expect(llm.constructor.name).toBe('ChatOllama');
    });

    it('should throw error for unsupported type', () => {
      const config = { type: 'invalid' };

      expect(() => createLLM(config)).toThrow('Unsupported LLM type');
    });

    it('should throw LLMConfigError for missing type', () => {
      const config = { endpoint: 'https://api.openai.com/v1' };

      expect(() => createLLM(config)).toThrow(LLMConfigError);
      expect(() => createLLM(config)).toThrow('LLM type is required');
    });

    it('should throw error for missing required fields (openai)', () => {
      const config = {
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        // missing apiKey, model
      };

      expect(() => createLLM(config)).toThrow('OpenAI requires');
    });

    it('should throw error for missing deploymentName (azure-openai)', () => {
      const config = {
        type: 'azure-openai',
        endpoint: 'https://my-resource.openai.azure.com',
        apiKey: 'test-key',
        model: 'gpt-4o',
        // missing deploymentName
      };

      expect(() => createLLM(config)).toThrow('deploymentName');
    });

    it('should use default temperature and maxTokens', () => {
      const config = {
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o',
      };

      const llm = createLLM(config);
      // LLM instance should be created without errors
      expect(llm).toBeDefined();
    });

    it('should allow custom temperature and maxTokens', () => {
      const config = {
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o',
        temperature: 0.5,
        maxTokens: 2048,
      };

      const llm = createLLM(config);
      expect(llm).toBeDefined();
    });
  });

  describe('validateLLMConfig', () => {
    it('should return valid for correct openai config', () => {
      const config = {
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o',
      };

      const result = validateLLMConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for correct azure-openai config', () => {
      const config = {
        type: 'azure-openai',
        endpoint: 'https://my-resource.openai.azure.com',
        apiKey: 'test-key',
        model: 'gpt-4o',
        deploymentName: 'gpt-4o',
      };

      const result = validateLLMConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for correct ollama config without apiKey', () => {
      const config = {
        type: 'ollama',
        endpoint: 'http://localhost:11434',
        model: 'llama3',
      };

      const result = validateLLMConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing required fields', () => {
      const config = {};

      const result = validateLLMConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return errors for invalid type', () => {
      const config = {
        type: 'invalid-type',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o',
      };

      const result = validateLLMConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid llm.type'))).toBe(true);
    });

    it('should return errors for missing apiKey on openai', () => {
      const config = {
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      };

      const result = validateLLMConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('apiKey'))).toBe(true);
    });

    it('should return errors for missing deploymentName on azure-openai', () => {
      const config = {
        type: 'azure-openai',
        endpoint: 'https://my-resource.openai.azure.com',
        apiKey: 'test-key',
        model: 'gpt-4o',
      };

      const result = validateLLMConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('deploymentName'))).toBe(true);
    });

    it('should return invalid=false for null config', () => {
      const result = validateLLMConfig(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('LLM configuration is required');
    });
  });
});
