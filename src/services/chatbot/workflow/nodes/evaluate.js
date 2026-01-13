/**
 * Answer Evaluation Node
 * @module services/chatbot/workflow/nodes/evaluate
 *
 * Step 16: Self-Correcting RAG
 * 생성된 답변의 품질을 평가하고 필요시 RAG로 재시도
 */

const { z } = require("zod");
const { EVALUATE_ANSWER_PROMPT } = require("../prompts");

/**
 * 답변 품질 평가 스키마
 */
const evaluationSchema = z.object({
  // 답변 품질
  answerQuality: z.enum([
    "adequate",       // 답변이 질문을 충분히 다룸
    "needs_docs",     // 문서 검색 필요
    "hallucination",  // 근거 없는 답변 (문서로 검증 필요)
    "off_topic"       // 질문과 무관한 답변
  ]),
  // 평가 근거
  reason: z.string(),
  // 신뢰도
  confidence: z.number().min(0).max(1)
});

/**
 * 답변 품질 평가 노드
 * 생성된 답변이 질문에 적절한지 평가
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function evaluateAnswer(state, { llm }) {
  const { messages, retrievedDocs, usedRAG } = state;

  // 메시지가 2개 미만이면 평가 불필요
  if (!messages || messages.length < 2) {
    return {
      answerQuality: "adequate",
      evaluationReason: "Not enough messages to evaluate",
      currentStep: "evaluateAnswer"
    };
  }

  // 마지막 AI 메시지 (답변)
  const lastMessage = messages[messages.length - 1];
  const answer = typeof lastMessage === "string"
    ? lastMessage
    : lastMessage.content;

  // 사용자 질문 찾기 (AI 메시지 바로 전의 Human 메시지)
  let question = "";
  for (let i = messages.length - 2; i >= 0; i--) {
    const msg = messages[i];
    const type = msg._getType?.() || msg.constructor?.name || "";
    if (type === "human" || msg instanceof Object && msg.role === "user") {
      question = typeof msg === "string" ? msg : msg.content;
      break;
    }
  }

  if (!question || !answer) {
    return {
      answerQuality: "adequate",
      evaluationReason: "Missing question or answer",
      currentStep: "evaluateAnswer"
    };
  }

  // 대화 히스토리 구성 (최근 6개 메시지)
  const historyLimit = Math.min(messages.length - 2, 6);
  const historyMessages = messages.slice(0, messages.length - 2).slice(-historyLimit);
  const history = historyMessages
    .map(msg => {
      const type = msg._getType?.() || msg.constructor?.name || "unknown";
      const content = typeof msg === "string" ? msg : msg.content;
      const role = type === "human" ? "User" : "Assistant";
      return `${role}: ${content}`;
    })
    .join("\n");

  // 문서 컨텍스트 구성
  const hasDocuments = retrievedDocs && retrievedDocs.length > 0;
  const documentsText = hasDocuments
    ? retrievedDocs.slice(0, 5).map((doc, i) => {
        const source = doc.metadata?.source || "unknown";
        const preview = doc.pageContent?.substring(0, 300) || "";
        return `[Doc ${i + 1}] ${source}\n${preview}...`;
      }).join("\n\n")
    : "No documents provided";

  try {
    const structuredLLM = llm.withStructuredOutput(evaluationSchema);

    const prompt = EVALUATE_ANSWER_PROMPT
      .replace("{history}", history || "No previous conversation")
      .replace("{question}", question)
      .replace("{answer}", answer)
      .replace("{documents}", documentsText)
      .replace("{has_documents}", hasDocuments ? "Yes" : "No");

    const result = await structuredLLM.invoke(prompt);

    return {
      answerQuality: result.answerQuality,
      evaluationReason: result.reason,
      evaluationConfidence: result.confidence,
      currentStep: "evaluateAnswer"
    };
  } catch (error) {
    // Structured output 실패 시 폴백
    return evaluateByHeuristics(question, answer, hasDocuments, usedRAG);
  }
}

/**
 * 휴리스틱 기반 평가 (폴백)
 * LLM 없이 간단한 규칙으로 평가
 * @private
 */
function evaluateByHeuristics(question, answer, hasDocuments, usedRAG) {
  const lowerQuestion = question.toLowerCase();
  const lowerAnswer = answer.toLowerCase();

  // 1. "모르겠다" 류의 응답이면 문서 검색 필요
  const uncertainPhrases = [
    "i don't know", "i'm not sure", "i cannot", "i can't",
    "모르겠", "잘 모르", "확실하지 않", "알 수 없", "찾을 수 없",
    "정보가 없", "정보가 포함되어 있지 않", "정보를 찾을 수 없",
    "문서에서 찾을 수 없", "couldn't find", "cannot find",
    "추가적인 정보", "더 자세한 내용", "구체적인 정보",
    "죄송하지만", "죄송합니다", "sorry", "apologize",
    "제공된 대화", "대화 기록에서", "context does not contain"
  ];
  if (uncertainPhrases.some(phrase => lowerAnswer.includes(phrase))) {
    return {
      answerQuality: "needs_docs",
      evaluationReason: "Answer indicates uncertainty, document search needed",
      currentStep: "evaluateAnswer"
    };
  }

  // 2. "뭐야", "뭔가요", "무엇" 등 정의를 묻는 질문은 RAG 필요
  const definitionPatterns = [
    "뭐야", "뭔가요", "무엇", "what is", "what's", "무슨", "어떤 것",
    "란 무엇", "이란", "가 뭐"
  ];
  const isDefinitionQuestion = definitionPatterns.some(p => lowerQuestion.includes(p));
  if (isDefinitionQuestion && !usedRAG) {
    return {
      answerQuality: "needs_docs",
      evaluationReason: "Definition question requires document verification",
      currentStep: "evaluateAnswer"
    };
  }

  // 3. 질문에 기술적 키워드가 있는데 RAG를 사용하지 않았으면 문서 필요
  const technicalKeywords = [
    "api", "config", "설정", "how to", "어떻게", "방법", "사용법",
    "version", "버전", "install", "설치", "code", "코드", "example", "예제",
    "error", "에러", "오류", "bug", "버그", "function", "함수", "class", "클래스",
    "library", "라이브러리", "module", "모듈", "package", "패키지"
  ];
  const hasTechnicalKeyword = technicalKeywords.some(kw => lowerQuestion.includes(kw));
  if (hasTechnicalKeyword && !usedRAG) {
    return {
      answerQuality: "needs_docs",
      evaluationReason: "Question contains technical keywords, document search recommended",
      currentStep: "evaluateAnswer"
    };
  }

  // 4. 답변에 "일반적으로", "보통", "typically" 등 일반적 설명이 있으면 hallucination 의심
  const generalPhrases = [
    "일반적으로", "보통", "typically", "usually", "generally", "often",
    "대개", "흔히", "많은 경우"
  ];
  if (generalPhrases.some(phrase => lowerAnswer.includes(phrase)) && !usedRAG) {
    return {
      answerQuality: "hallucination",
      evaluationReason: "Answer uses general terms without document evidence",
      currentStep: "evaluateAnswer"
    };
  }

  // 5. 버전, 숫자 등 구체적 정보가 있는데 문서 근거가 없으면 hallucination 의심
  const hasSpecificInfo = /\d+\.\d+|\d{4}년|\d+월|\d+일/.test(answer);
  if (hasSpecificInfo && !hasDocuments && !usedRAG) {
    return {
      answerQuality: "hallucination",
      evaluationReason: "Answer contains specific info without document evidence",
      currentStep: "evaluateAnswer"
    };
  }

  // 6. RAG를 사용하지 않고 질문에 고유명사나 특정 이름이 있으면 문서 필요
  // (대문자로 시작하는 단어, 한글 고유명사 패턴)
  const hasProperNoun = /[A-Z][a-z]+(?:[A-Z][a-z]+)*/.test(question) ||
    /[가-힣]+(?:Store|API|SDK|DB|Server|Client)/.test(question);
  if (hasProperNoun && !usedRAG) {
    return {
      answerQuality: "needs_docs",
      evaluationReason: "Question contains proper noun, document search recommended",
      currentStep: "evaluateAnswer"
    };
  }

  // 기본적으로 adequate (chitchat이나 간단한 대화에 해당)
  return {
    answerQuality: "adequate",
    evaluationReason: "Answer appears reasonable for casual conversation",
    currentStep: "evaluateAnswer"
  };
}

/**
 * 평가 결과 기반 라우팅 결정
 * @param {Object} state - 현재 상태
 * @returns {string} 다음 노드 이름
 */
function routeByEvaluation(state) {
  const { answerQuality, usedRAG, retryCount = 0 } = state;

  // 최대 재시도 횟수 제한 (무한 루프 방지)
  if (retryCount >= 2) {
    return "__end__";
  }

  switch (answerQuality) {
    case "adequate":
      // 답변 충분 → 종료
      return "__end__";

    case "needs_docs":
      if (!usedRAG) {
        // RAG 없이 답변했는데 문서 필요 → RAG로 재시도
        return "retrieveDocs";
      }
      // RAG 했는데도 부족 → 쿼리 재작성 후 재시도
      return "rewriteQuery";

    case "hallucination":
      // 근거 없는 답변 → 반드시 문서 검색
      return "retrieveDocs";

    case "off_topic":
      // 질문 이해 실패 → 재분류 후 재시도
      return "classifyQuery";

    default:
      return "__end__";
  }
}

module.exports = {
  evaluateAnswer,
  evaluationSchema,
  evaluateByHeuristics,
  routeByEvaluation
};
