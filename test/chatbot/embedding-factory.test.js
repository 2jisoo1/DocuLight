/**
 * Embedding Factory Tests
 * Phase 1: Config & LLM Factory
 */

const { createEmbeddings, validateEmbeddingConfig, EmbeddingConfigError } = require('../../src/services/chatbot/embedding-factory.js');

describe('Embedding Factory', () => {
  describe('createEmbeddings', () => {
    it('should create OpenAIEmbeddings for openai type', () => {
      const config = {
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
      };

      const embeddings = createEmbeddings(config);

      expect(embeddings.constructor.name).toBe('OpenAIEmbeddings');
    });

    it('should create AzureOpenAIEmbeddings for azure-openai type', () => {
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

    it('should create OllamaEmbeddings for ollama type', () => {
      const config = {
        type: 'ollama',
        endpoint: 'http://localhost:11434',
        apiKey: '',
        model: 'nomic-embed-text',
      };

      const embeddings = createEmbeddings(config);

      expect(embeddings.constructor.name).toBe('OllamaEmbeddings');
    });

    it('should throw error for unsupported type', () => {
      const config = { type: 'invalid' };

      expect(() => createEmbeddings(config)).toThrow('Unsupported embedding type');
    });

    it('should throw EmbeddingConfigError for missing type', () => {
      const config = { endpoint: 'https://api.openai.com/v1' };

      expect(() => createEmbeddings(config)).toThrow(EmbeddingConfigError);
      expect(() => createEmbeddings(config)).toThrow('Embedding type is required');
    });

    it('should throw error for missing required fields (openai)', () => {
      const config = {
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        // missing apiKey, model
      };

      expect(() => createEmbeddings(config)).toThrow('OpenAI Embedding requires');
    });

    it('should throw error for missing deploymentName (azure-openai)', () => {
      const config = {
        type: 'azure-openai',
        endpoint: 'https://my-resource.openai.azure.com',
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        // missing deploymentName
      };

      expect(() => createEmbeddings(config)).toThrow('deploymentName');
    });
  });

  describe('validateEmbeddingConfig', () => {
    it('should return valid for correct openai config', () => {
      const config = {
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
      };

      const result = validateEmbeddingConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for correct azure-openai config', () => {
      const config = {
        type: 'azure-openai',
        endpoint: 'https://my-resource.openai.azure.com',
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        deploymentName: 'text-embedding-3-small',
      };

      const result = validateEmbeddingConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for correct ollama config without apiKey', () => {
      const config = {
        type: 'ollama',
        endpoint: 'http://localhost:11434',
        model: 'nomic-embed-text',
      };

      const result = validateEmbeddingConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing required fields', () => {
      const config = {};

      const result = validateEmbeddingConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return errors for invalid type', () => {
      const config = {
        type: 'invalid-type',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
      };

      const result = validateEmbeddingConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid embedding.type'))).toBe(true);
    });

    it('should return errors for missing apiKey on openai', () => {
      const config = {
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        model: 'text-embedding-3-small',
      };

      const result = validateEmbeddingConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('apiKey'))).toBe(true);
    });

    it('should return errors for missing deploymentName on azure-openai', () => {
      const config = {
        type: 'azure-openai',
        endpoint: 'https://my-resource.openai.azure.com',
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
      };

      const result = validateEmbeddingConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('deploymentName'))).toBe(true);
    });

    it('should return invalid=false for null config', () => {
      const result = validateEmbeddingConfig(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Embedding configuration is required');
    });
  });
});
