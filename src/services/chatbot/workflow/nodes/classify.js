/**
 * Query Classification Node
 * @module services/chatbot/workflow/nodes/classify
 *
 * 사용자 질문을 분류하여 적절한 워크플로우 경로 결정
 * - question: 문서 검색 후 답변
 * - summary: 요약 생성
 * - chitchat: 간단한 대화
 * - unknown: 불명확한 입력
 */

const { z } = require("zod");
const { CLASSIFY_PROMPT } = require("../prompts");

/**
 * 분류 결과 스키마
 */
const classificationSchema = z.object({
  type: z.enum(["question", "summary", "chitchat", "unknown"]),
  confidence: z.number().min(0).max(1),
});

/**
 * 질문 분류 노드
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function classifyQuery(state, { llm }) {
  const { messages } = state;

  if (!messages || messages.length === 0) {
    return {
      queryType: "unknown",
      confidence: 0,
      currentStep: "classifyQuery",
      error: "No messages to classify",
    };
  }

  const lastMessage = messages[messages.length - 1];
  const userInput = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  // 빈 입력 처리
  if (!userInput || userInput.trim().length < 3) {
    return {
      queryType: "unknown",
      confidence: 1.0,
      currentStep: "classifyQuery",
    };
  }

  try {
    // Structured output을 지원하는 LLM 사용
    const structuredLLM = llm.withStructuredOutput(classificationSchema);
    const prompt = CLASSIFY_PROMPT.replace("{input}", userInput);

    const result = await structuredLLM.invoke(prompt);

    return {
      queryType: result.type,
      confidence: result.confidence,
      currentStep: "classifyQuery",
    };
  } catch (error) {
    // withStructuredOutput 미지원 시 일반 호출로 폴백
    try {
      const prompt = CLASSIFY_PROMPT.replace("{input}", userInput);
      const response = await llm.invoke(prompt);

      // JSON 파싱 시도
      const content = typeof response === 'string'
        ? response
        : response.content;

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const validated = classificationSchema.safeParse(parsed);

        if (validated.success) {
          // LLM이 unknown을 반환하면 키워드 기반 분류로 재시도
          if (validated.data.type === "unknown") {
            const keywordResult = classifyByKeywords(userInput);
            // 키워드 분류가 더 좋은 결과를 주면 사용
            if (keywordResult.queryType !== "question" || keywordResult.confidence > 0.5) {
              return keywordResult;
            }
          }

          return {
            queryType: validated.data.type,
            confidence: validated.data.confidence,
            currentStep: "classifyQuery",
          };
        }
      }

      // 파싱 실패 시 키워드 기반 분류
      return classifyByKeywords(userInput);
    } catch (fallbackError) {
      // 최종 폴백: 키워드 기반 분류
      return classifyByKeywords(userInput);
    }
  }
}

/**
 * 키워드 기반 분류 (폴백)
 * @private
 */
function classifyByKeywords(input) {
  const normalized = input.toLowerCase().trim();
  const original = input.trim();  // 원본도 유지 (한글 키워드용)
  const inputLength = original.length;

  // === 1단계: 짧은 인사말/chitchat 우선 처리 ===
  // 매우 짧은 입력 (5자 이하)이면서 특별한 키워드가 없으면 chitchat
  if (inputLength <= 5) {
    // 짧은 인사말 패턴 (완전 일치 또는 거의 일치)
    const shortGreetings = [
      'hi', 'hey', 'yo', 'sup', 'hello',
      '안녕', '하이', '헬로', 'ㅎㅇ', 'ㅎㅎ', 'ㅋㅋ', '네', '응', '아', '오',
      '뭐', '왜', '헉', '오호', '음', '흠', '아하', '헐', '오오'
    ];
    for (const greet of shortGreetings) {
      if (normalized === greet || original === greet) {
        return { queryType: "chitchat", confidence: 0.9, currentStep: "classifyQuery" };
      }
    }
    // 5자 이하면서 물음표만 있는 경우도 chitchat
    if (normalized.replace(/[?？!！\s]/g, '').length <= 3) {
      return { queryType: "chitchat", confidence: 0.8, currentStep: "classifyQuery" };
    }
  }

  // === 2단계: 인사말/감정 표현 패턴 ===
  // 영어 인사말
  const greetingsEn = ['hello', 'hi there', 'hey there', 'good morning', 'good afternoon',
                       'good evening', 'thanks', 'thank you', 'bye', 'goodbye', 'see you'];
  // 한글 인사말 (Unicode escapes + literal)
  const greetingsKo = [
    '\uC548\uB155', '\uAC10\uC0AC', '\uACE0\uB9C8\uC6CC', '\uBC18\uAC00\uC6CC',
    '안녕', '감사', '고마워', '반가워', '안녕하세요', '반갑습니다', '고맙습니다',
    '좋은 아침', '좋은 하루', '수고', '잘가', '바이', '굿바이', '안녕히'
  ];

  for (const greet of greetingsEn) {
    if (normalized.includes(greet)) {
      return { queryType: "chitchat", confidence: 0.9, currentStep: "classifyQuery" };
    }
  }
  for (const greet of greetingsKo) {
    if (original.includes(greet)) {
      return { queryType: "chitchat", confidence: 0.9, currentStep: "classifyQuery" };
    }
  }

  // === 3단계: 짧은 입력에서 인사말성 패턴 추가 감지 ===
  // 10자 이하에서 물음표로 끝나는 짧은 인사말 ("안녕?", "뭐해?", "잘 지내?")
  if (inputLength <= 10) {
    const shortChitchatPatterns = [
      /^안녕[\?？]?$/,           // 안녕, 안녕?
      /^뭐해[\?？]?$/,           // 뭐해, 뭐해?
      /^잘\s?지내[\?？]?$/,      // 잘지내, 잘 지내?
      /^hi[\?！!]?$/i,           // hi, hi?
      /^hey[\?！!]?$/i,          // hey, hey?
      /^hello[\?！!]?$/i,        // hello, hello?
      /^sup[\?！!]?$/i,          // sup, sup?
      /^yo[\?！!]?$/i,           // yo, yo?
    ];
    for (const pattern of shortChitchatPatterns) {
      if (pattern.test(original) || pattern.test(normalized)) {
        return { queryType: "chitchat", confidence: 0.9, currentStep: "classifyQuery" };
      }
    }
  }

  // === 4단계: 요약 요청 패턴 ===
  const summaryKeywordsEn = ['summarize', 'summary', 'overview', 'tldr', 'tl;dr'];
  const summaryKeywordsKo = [
    '\uC694\uC57D', '\uC815\uB9AC', '\uAC1C\uC694',
    '요약', '정리', '개요', '요점', '간략히', '짧게 설명'
  ];

  for (const keyword of summaryKeywordsEn) {
    if (normalized.includes(keyword)) {
      return { queryType: "summary", confidence: 0.8, currentStep: "classifyQuery" };
    }
  }
  for (const keyword of summaryKeywordsKo) {
    if (original.includes(keyword)) {
      return { queryType: "summary", confidence: 0.8, currentStep: "classifyQuery" };
    }
  }

  // === 5단계: 질문 패턴 (문서 검색 필요) ===
  // 의미 있는 질문 키워드가 있어야 함 (단순 물음표 제외)
  const questionKeywordsEn = ['what is', 'how to', 'how do', 'why does', 'when is',
                              'where is', 'who is', 'can you', 'could you', 'explain',
                              'describe', 'tell me about', 'show me'];
  const questionKeywordsKo = [
    '무엇', '어떻게', '왜', '언제', '어디', '누구',
    '설명해', '알려줘', '가르쳐', '뭐야', '뭔가', '어떤',
    '방법', '이유', '원인'
  ];

  for (const keyword of questionKeywordsEn) {
    if (normalized.includes(keyword)) {
      return { queryType: "question", confidence: 0.7, currentStep: "classifyQuery" };
    }
  }
  for (const keyword of questionKeywordsKo) {
    if (original.includes(keyword)) {
      return { queryType: "question", confidence: 0.7, currentStep: "classifyQuery" };
    }
  }

  // 물음표가 있고 10자 이상이면 question으로 처리
  if ((normalized.includes('?') || original.includes('？')) && inputLength > 10) {
    return { queryType: "question", confidence: 0.6, currentStep: "classifyQuery" };
  }

  // === 6단계: 기본값 ===
  // 긴 입력(15자 이상)은 question으로, 짧은 입력은 chitchat으로
  if (inputLength >= 15) {
    return {
      queryType: "question",
      confidence: 0.5,
      currentStep: "classifyQuery",
    };
  }

  // 짧은 입력은 chitchat으로 처리 (RAG 불필요)
  return {
    queryType: "chitchat",
    confidence: 0.6,
    currentStep: "classifyQuery",
  };
}

module.exports = { classifyQuery, classificationSchema };
