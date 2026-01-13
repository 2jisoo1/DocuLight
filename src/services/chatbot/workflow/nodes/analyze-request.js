/**
 * Request Analysis Node
 * @module services/chatbot/workflow/nodes/analyze-request
 *
 * Step 17: Multi-Document Summarization
 * 사용자 입력에서 요약 요구사항 추출 (길이, 형식, 초점 영역)
 */

const { z } = require("zod");
const { ANALYZE_REQUEST_PROMPT } = require("../prompts");

/**
 * 요약 요구사항 스키마
 */
const summaryRequirementsSchema = z.object({
  // 목표 길이
  targetLength: z.object({
    value: z.number().nullable(),
    unit: z.enum(["characters", "words", "sentences", "paragraphs"]).nullable(),
    constraint: z.enum(["minimum", "maximum", "approximate"]).nullable(),
  }).nullable(),
  // 출력 형식
  format: z.enum([
    "bullet_points",
    "numbered_list",
    "table",
    "prose",
    "detailed_prose",
    "brief",
    "auto"
  ]),
  // 초점 영역
  focusAreas: z.array(z.string()),
  // 언어
  language: z.enum(["ko", "en", "auto"]),
});

/**
 * 사용자 요청 분석 노드
 * 요약 요청에서 구체적인 요구사항 추출
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function analyzeRequest(state, { llm }) {
  const { messages } = state;

  // 마지막 사용자 메시지 추출
  const lastMessage = messages[messages.length - 1];
  const userInput = typeof lastMessage === "string"
    ? lastMessage
    : lastMessage.content;

  if (!userInput) {
    return {
      summaryRequirements: getDefaultRequirements(userInput),
      currentStep: "analyzeRequest"
    };
  }

  try {
    // LLM Structured Output으로 요구사항 추출 시도
    const structuredLLM = llm.withStructuredOutput(summaryRequirementsSchema);
    const prompt = ANALYZE_REQUEST_PROMPT.replace("{input}", userInput);
    const result = await structuredLLM.invoke(prompt);

    return {
      summaryRequirements: {
        ...result,
        originalRequest: userInput
      },
      currentStep: "analyzeRequest"
    };
  } catch (error) {
    // LLM 실패 시 키워드 기반 폴백
    return {
      summaryRequirements: analyzeByKeywords(userInput),
      currentStep: "analyzeRequest"
    };
  }
}

/**
 * 키워드 기반 요구사항 분석 (폴백)
 * @param {string} input - 사용자 입력
 * @returns {Object} 추출된 요구사항
 */
function analyzeByKeywords(input) {
  const normalized = input.toLowerCase();

  const requirements = {
    targetLength: null,
    format: "auto",
    focusAreas: [],
    language: detectLanguage(input),
    originalRequest: input
  };

  // === 길이 요구사항 추출 ===

  // 한글 패턴: "1500자 이상", "500자 이내", "1000자 정도"
  const korCharMatch = input.match(/(\d+)\s*자\s*(이상|이내|이하|정도|내외)?/);
  if (korCharMatch) {
    const value = parseInt(korCharMatch[1], 10);
    const modifier = korCharMatch[2] || "정도";
    requirements.targetLength = {
      value,
      unit: "characters",
      constraint: modifier.includes("이상") ? "minimum" :
                 modifier.includes("이내") || modifier.includes("이하") ? "maximum" : "approximate"
    };
  }

  // 한글 패턴: "500단어", "300 words"
  const korWordMatch = input.match(/(\d+)\s*(단어|words?)\s*(이상|이내|이하|정도)?/i);
  if (korWordMatch && !requirements.targetLength) {
    const value = parseInt(korWordMatch[1], 10);
    const modifier = korWordMatch[3] || "";
    requirements.targetLength = {
      value,
      unit: "words",
      constraint: modifier.includes("이상") || modifier.includes("minimum") ? "minimum" :
                 modifier.includes("이내") || modifier.includes("이하") || modifier.includes("maximum") ? "maximum" : "approximate"
    };
  }

  // 영어 패턴: "at least 500 words", "under 1000 characters"
  const engLengthMatch = input.match(/(at\s+least|minimum|under|maximum|about|around|approximately)\s+(\d+)\s*(words?|characters?)/i);
  if (engLengthMatch && !requirements.targetLength) {
    const constraint = engLengthMatch[1].toLowerCase();
    const value = parseInt(engLengthMatch[2], 10);
    const unit = engLengthMatch[3].toLowerCase().startsWith("word") ? "words" : "characters";
    requirements.targetLength = {
      value,
      unit,
      constraint: constraint.includes("least") || constraint.includes("minimum") ? "minimum" :
                 constraint.includes("under") || constraint.includes("maximum") ? "maximum" : "approximate"
    };
  }

  // 상세/간략 표현으로 길이 추론
  if (!requirements.targetLength) {
    if (/자세히|상세히|detailed|comprehensive|in\s+detail|충분히/.test(normalized)) {
      requirements.targetLength = { value: 1000, unit: "words", constraint: "minimum" };
    } else if (/간단히|짧게|brief|concise|short|간략히/.test(normalized)) {
      requirements.targetLength = { value: 200, unit: "words", constraint: "maximum" };
    }
  }

  // === 형식 요구사항 추출 ===

  if (/bullet|요점|리스트|목록/.test(normalized)) {
    requirements.format = "bullet_points";
  } else if (/표로|table|비교|comparison/.test(normalized)) {
    requirements.format = "table";
  } else if (/번호|numbered|순서|step/.test(normalized)) {
    requirements.format = "numbered_list";
  } else if (/자세히|상세히|detailed|comprehensive/.test(normalized)) {
    requirements.format = "detailed_prose";
  } else if (/간단히|짧게|brief|short/.test(normalized)) {
    requirements.format = "brief";
  }

  // === 초점 영역 추출 ===

  // "~에 대해", "~에 관해", "about ~" 패턴
  const aboutPatterns = [
    /(.+?)(?:에\s*대해|에\s*관해|에\s*대하여|를?\s*정리)/,
    /about\s+(.+?)(?:\s+in|\s*$)/i,
    /summarize\s+(.+?)(?:\s+in|\s*$)/i
  ];

  for (const pattern of aboutPatterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      const topic = match[1].trim();
      if (topic && topic.length > 1 && topic.length < 100) {
        requirements.focusAreas.push(topic);
        break;
      }
    }
  }

  // 특정 키워드 추출: "API", "설치", "기능" 등
  const topicKeywords = [
    "api", "설치", "install", "기능", "feature", "사용법", "usage",
    "설정", "config", "예제", "example", "튜토리얼", "tutorial"
  ];
  for (const keyword of topicKeywords) {
    if (normalized.includes(keyword) && !requirements.focusAreas.includes(keyword)) {
      requirements.focusAreas.push(keyword);
    }
  }

  return requirements;
}

/**
 * 언어 감지
 * @param {string} text - 텍스트
 * @returns {string} 언어 코드
 */
function detectLanguage(text) {
  const koreanChars = (text.match(/[가-힣]/g) || []).length;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;

  if (koreanChars > englishChars) return "ko";
  if (englishChars > koreanChars) return "en";
  return "auto";
}

/**
 * 기본 요구사항 반환
 * @param {string} input - 원본 입력
 * @returns {Object} 기본 요구사항
 */
function getDefaultRequirements(input) {
  return {
    targetLength: null,
    format: "auto",
    focusAreas: [],
    language: detectLanguage(input || ""),
    originalRequest: input || ""
  };
}

/**
 * 요구사항 기반 프롬프트 헬퍼 생성
 */

/**
 * 목표 길이 명세 문자열 생성
 * @param {Object} requirements - 요구사항
 * @returns {string} 길이 명세
 */
function buildTargetLengthSpec(requirements) {
  if (!requirements?.targetLength?.value) {
    return "Auto (appropriate for content)";
  }

  const { value, unit, constraint } = requirements.targetLength;
  const constraintText = {
    minimum: "at least",
    maximum: "no more than",
    approximate: "approximately"
  }[constraint] || "approximately";

  const unitText = {
    characters: "characters",
    words: "words",
    sentences: "sentences",
    paragraphs: "paragraphs"
  }[unit] || "words";

  return `${constraintText} ${value} ${unitText}`;
}

/**
 * 형식 가이드라인 문자열 생성
 * @param {string} format - 형식
 * @returns {string} 가이드라인
 */
function buildFormatGuidelines(format) {
  const guidelines = {
    bullet_points: `
- Use bullet points for main ideas
- Indent sub-points with proper hierarchy
- Keep each bullet concise (1-2 lines)`,

    numbered_list: `
1. Number each main point sequentially
2. Use sub-numbers (1.1, 1.2) for details
3. Maintain logical ordering`,

    table: `
| Category | Description |
|----------|-------------|
Use tables for comparisons, features, or structured data.
Keep cell content brief and include headers.`,

    prose: `
Write in flowing paragraphs. Each paragraph should cover one main idea.
Use transitions between paragraphs.`,

    detailed_prose: `
Write comprehensive paragraphs with:
- An introduction paragraph
- Multiple body paragraphs with detailed explanations
- Section headings (##) if appropriate
- A conclusion paragraph`,

    brief: `
Be extremely concise. Maximum 3-5 sentences total.
Focus only on the most critical information.`,

    auto: `Use the most appropriate format for the content.`
  };

  return guidelines[format] || guidelines.auto;
}

/**
 * 길이 제약 명령 문자열 생성
 * @param {Object} requirements - 요구사항
 * @returns {string} 길이 제약 명령
 */
function buildLengthConstraint(requirements) {
  if (!requirements?.targetLength?.value) return "";

  const { value, unit, constraint } = requirements.targetLength;

  const instructions = {
    characters: {
      minimum: `IMPORTANT: Your response MUST be at least ${value} characters. Provide detailed explanations to meet this requirement.`,
      maximum: `IMPORTANT: Keep your response under ${value} characters. Be concise.`,
      approximate: `IMPORTANT: Target approximately ${value} characters in your response.`
    },
    words: {
      minimum: `IMPORTANT: Your response MUST contain at least ${value} words. Elaborate with examples and details.`,
      maximum: `IMPORTANT: Keep your response under ${value} words. Be concise and focused.`,
      approximate: `IMPORTANT: Target approximately ${value} words in your response.`
    }
  };

  return instructions[unit]?.[constraint] || "";
}

module.exports = {
  analyzeRequest,
  analyzeByKeywords,
  summaryRequirementsSchema,
  buildTargetLengthSpec,
  buildFormatGuidelines,
  buildLengthConstraint,
  detectLanguage,
  getDefaultRequirements
};
