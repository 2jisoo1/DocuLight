/**
 * LLM Factory - 다중 LLM 제공자 지원
 * @module services/chatbot/llm-factory
 *
 * 지원 제공자:
 * - openai: OpenAI API
 * - azure-openai: Azure OpenAI Service
 * - ollama: Ollama (로컬)
 */

const { ChatOpenAI, AzureChatOpenAI } = require("@langchain/openai");
const { ChatOllama } = require("@langchain/ollama");
const { createLLMWithFallback: _createLLMWithFallback } = require('./llm-fallback');

/**
 * LLM 설정 오류
 */
class LLMConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LLMConfigError';
    this.code = 'LLM_CONFIG_INVALID';
  }
}

/**
 * LLM 인스턴스 생성 팩토리
 * @param {Object} config - chatbot.llm 설정
 * @param {string} config.type - LLM 타입 ('openai' | 'azure-openai' | 'ollama')
 * @param {string} config.endpoint - API 엔드포인트
 * @param {string} config.apiKey - API 키 (ollama는 빈 문자열 허용)
 * @param {string} config.model - 모델명
 * @param {number} [config.temperature=0.7] - 생성 온도
 * @param {number} [config.maxTokens=4096] - 최대 토큰 수
 * @param {string} [config.apiVersion] - Azure API 버전 (azure-openai 필수)
 * @param {string} [config.deploymentName] - Azure 배포 이름 (azure-openai 필수)
 * @returns {BaseChatModel} LLM 인스턴스
 * @throws {LLMConfigError} 잘못된 설정 시
 */
function createLLM(config) {
  const {
    type,
    endpoint,
    apiKey,
    model,
    temperature = 0.7,
    maxTokens = 4096,
    apiVersion,
    deploymentName
  } = config;

  // 필수 필드 검증
  if (!type) {
    throw new LLMConfigError('LLM type is required');
  }

  switch (type) {
    case 'openai':
      if (!endpoint || !apiKey || !model) {
        throw new LLMConfigError('OpenAI requires: endpoint, apiKey, model');
      }
      return new ChatOpenAI({
        model,
        apiKey,
        configuration: { baseURL: endpoint },
        temperature,
        maxTokens,
      });

    case 'azure-openai': {
      if (!endpoint || !apiKey || !model) {
        throw new LLMConfigError('Azure OpenAI requires: endpoint, apiKey, model');
      }
      if (!deploymentName) {
        throw new LLMConfigError('Azure OpenAI requires: deploymentName');
      }
      // Extract instance name from endpoint URL
      // Supports both formats:
      // - https://instance.openai.azure.com
      // - https://instance.cognitiveservices.azure.com
      const instanceMatch = endpoint.match(/https?:\/\/([^.]+)\.(openai|cognitiveservices)\.azure\.com/);
      const instanceName = instanceMatch ? instanceMatch[1] : '';
      if (!instanceName) {
        throw new LLMConfigError(`Could not extract Azure OpenAI instance name from endpoint: ${endpoint}`);
      }
      return new AzureChatOpenAI({
        model,
        azureOpenAIApiKey: apiKey,
        azureOpenAIApiInstanceName: instanceName,
        azureOpenAIApiVersion: apiVersion || '2024-02-01',
        azureOpenAIApiDeploymentName: deploymentName,
        temperature,
        maxTokens,
      });
    }

    case 'ollama':
      if (!endpoint || !model) {
        throw new LLMConfigError('Ollama requires: endpoint, model');
      }
      // Ollama는 로컬 환경이므로 apiKey 빈 문자열 허용
      return new ChatOllama({
        model,
        baseUrl: endpoint,
        temperature,
      });

    case 'anthropic': {
      if (!apiKey || !model) {
        throw new LLMConfigError('Anthropic requires: apiKey, model');
      }
      let ChatAnthropic;
      try {
        ({ ChatAnthropic } = require('@langchain/anthropic'));
      } catch (_) {
        throw new LLMConfigError(
          'Anthropic provider requires @langchain/anthropic: npm install @langchain/anthropic'
        );
      }
      return new ChatAnthropic({
        model,
        anthropicApiKey: apiKey,
        temperature,
        maxTokens,
      });
    }

    default:
      throw new LLMConfigError(
        `Unsupported LLM type: ${type}. Supported types: openai, azure-openai, ollama, anthropic`
      );
  }
}

/**
 * LLM 설정 유효성 검증
 * @param {Object} config - chatbot.llm 설정
 * @returns {Object} 검증 결과 { valid: boolean, errors: string[] }
 */
function validateLLMConfig(config) {
  const errors = [];

  if (!config) {
    return { valid: false, errors: ['LLM configuration is required'] };
  }

  const { type, endpoint, apiKey, model, deploymentName } = config;

  if (!type) {
    errors.push('llm.type is required');
  } else if (!['openai', 'azure-openai', 'ollama', 'anthropic'].includes(type)) {
    errors.push(`Invalid llm.type: ${type}. Must be one of: openai, azure-openai, ollama, anthropic`);
  }

  // Anthropic uses the default API endpoint; others require explicit endpoint
  if (type !== 'anthropic' && !endpoint) {
    errors.push('llm.endpoint is required');
  }

  if (!model) {
    errors.push('llm.model is required');
  }

  // OpenAI, Azure, Anthropic은 apiKey 필수
  if (!['ollama'].includes(type) && !apiKey) {
    errors.push('llm.apiKey is required for openai/azure-openai/anthropic');
  }

  // Azure 전용 필드
  if (type === 'azure-openai' && !deploymentName) {
    errors.push('llm.deploymentName is required for azure-openai');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 설정 객체를 받아 재시도+폴백 체인 Runnable을 반환한다.
 * @param {Object} primaryConfig - 주 LLM 설정 (createLLM 형식)
 * @param {Array<Object>} [fallbackConfigs=[]] - 폴백 LLM 설정 목록
 * @param {Object} [options={}] - createLLMWithFallback 옵션
 * @returns {{ invoke: Function, retries: number, fallbackCount: number }}
 */
function createLLMWithFallback(primaryConfig, fallbackConfigs = [], options = {}) {
  const primary = createLLM(primaryConfig);
  const fallbacks = fallbackConfigs.map((cfg, i) => {
    try {
      return createLLM(cfg);
    } catch (err) {
      throw new LLMConfigError(`fallback[${i}]: ${err.message}`);
    }
  });
  return _createLLMWithFallback(primary, fallbacks, options);
}

module.exports = {
  createLLM,
  validateLLMConfig,
  LLMConfigError,
  createLLMWithFallback,
};
