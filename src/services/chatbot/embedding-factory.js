/**
 * Embedding Factory - 다중 Embedding 제공자 지원
 * @module services/chatbot/embedding-factory
 *
 * 지원 제공자:
 * - openai: OpenAI API
 * - azure-openai: Azure OpenAI Service
 * - ollama: Ollama (로컬)
 */

const { OpenAIEmbeddings, AzureOpenAIEmbeddings } = require("@langchain/openai");
const { OllamaEmbeddings } = require("@langchain/ollama");

/**
 * Embedding 설정 오류
 */
class EmbeddingConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmbeddingConfigError';
    this.code = 'EMBEDDING_CONFIG_INVALID';
  }
}

/**
 * Embedding 인스턴스 생성 팩토리
 * @param {Object} config - chatbot.embedding 설정
 * @param {string} config.type - Embedding 타입 ('openai' | 'azure-openai' | 'ollama')
 * @param {string} config.endpoint - API 엔드포인트
 * @param {string} config.apiKey - API 키 (ollama는 빈 문자열 허용)
 * @param {string} config.model - 모델명
 * @param {string} [config.apiVersion] - Azure API 버전 (azure-openai 시)
 * @param {string} [config.deploymentName] - Azure 배포 이름 (azure-openai 필수)
 * @returns {Embeddings} Embedding 인스턴스
 * @throws {EmbeddingConfigError} 잘못된 설정 시
 */
function createEmbeddings(config) {
  const {
    type,
    endpoint,
    apiKey,
    model,
    apiVersion,
    deploymentName
  } = config;

  // 필수 필드 검증
  if (!type) {
    throw new EmbeddingConfigError('Embedding type is required');
  }

  switch (type) {
    case 'openai':
      if (!endpoint || !apiKey || !model) {
        throw new EmbeddingConfigError('OpenAI Embedding requires: endpoint, apiKey, model');
      }
      return new OpenAIEmbeddings({
        model,
        apiKey,
        configuration: { baseURL: endpoint },
      });

    case 'azure-openai': {
      if (!endpoint || !apiKey) {
        throw new EmbeddingConfigError('Azure OpenAI Embedding requires: endpoint, apiKey');
      }
      if (!deploymentName) {
        throw new EmbeddingConfigError('Azure OpenAI Embedding requires: deploymentName');
      }
      // Extract instance name from endpoint
      // Supports both: https://xxx.openai.azure.com and https://xxx.cognitiveservices.azure.com
      const instanceMatch = endpoint.match(/https?:\/\/([^.]+)\.(openai|cognitiveservices)\.azure\.com/);
      const instanceName = instanceMatch ? instanceMatch[1] : '';
      return new AzureOpenAIEmbeddings({
        azureOpenAIApiKey: apiKey,
        azureOpenAIApiInstanceName: instanceName,
        azureOpenAIApiVersion: apiVersion || '2024-02-01',
        azureOpenAIApiEmbeddingsDeploymentName: deploymentName,
      });
    }

    case 'ollama':
      if (!endpoint || !model) {
        throw new EmbeddingConfigError('Ollama Embedding requires: endpoint, model');
      }
      // Ollama는 로컬 환경이므로 apiKey 빈 문자열 허용
      return new OllamaEmbeddings({
        model,
        baseUrl: endpoint,
      });

    default:
      throw new EmbeddingConfigError(
        `Unsupported embedding type: ${type}. Supported types: openai, azure-openai, ollama`
      );
  }
}

/**
 * Embedding 설정 유효성 검증
 * @param {Object} config - chatbot.embedding 설정
 * @returns {Object} 검증 결과 { valid: boolean, errors: string[] }
 */
function validateEmbeddingConfig(config) {
  const errors = [];

  if (!config) {
    return { valid: false, errors: ['Embedding configuration is required'] };
  }

  const { type, endpoint, apiKey, model, deploymentName } = config;

  if (!type) {
    errors.push('embedding.type is required');
  } else if (!['openai', 'azure-openai', 'ollama'].includes(type)) {
    errors.push(`Invalid embedding.type: ${type}. Must be one of: openai, azure-openai, ollama`);
  }

  if (!endpoint) {
    errors.push('embedding.endpoint is required');
  }

  if (!model && type !== 'azure-openai') {
    errors.push('embedding.model is required');
  }

  // OpenAI, Azure는 apiKey 필수
  if (type !== 'ollama' && !apiKey) {
    errors.push('embedding.apiKey is required for openai/azure-openai');
  }

  // Azure 전용 필드
  if (type === 'azure-openai' && !deploymentName) {
    errors.push('embedding.deploymentName is required for azure-openai');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  createEmbeddings,
  validateEmbeddingConfig,
  EmbeddingConfigError
};
