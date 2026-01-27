/**
 * sLLM Answer Simple Node
 * @module services/chatbot/workflow/nodes/sllm/answer-simple
 *
 * Step 15.1: sLLM 최적화 단순 질문 답변
 * - 간단한 질문에 직접 답변
 * - 문서 기반 답변
 * - 출처 인용 포함
 */

const { SLLM_ANSWER_SIMPLE } = require("../../sllm-prompts");

/**
 * sLLM 단순 질문 답변 노드
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} [deps.logger] - 로거
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function answerSimple(state, { llm, logger }) {
  const { messages, retrievedDocs } = state;

  if (!messages || messages.length === 0) {
    return {
      sllmSimpleAnswer: "",
      currentStep: "sllm:answerSimple"
    };
  }

  // 질문 추출
  const lastMessage = messages[messages.length - 1];
  const question = typeof lastMessage === "string"
    ? lastMessage
    : lastMessage.content;

  if (!question || question.trim().length < 3) {
    return {
      sllmSimpleAnswer: "",
      currentStep: "sllm:answerSimple"
    };
  }

  // 문서 포맷팅
  const documents = formatDocuments(retrievedDocs);

  try {
    const prompt = SLLM_ANSWER_SIMPLE
      .replace("{question}", question)
      .replace("{documents}", documents);

    const response = await llm.invoke(prompt);

    const answer = typeof response === "string"
      ? response
      : response.content;

    if (logger) {
      logger.debug("[sLLM] answerSimple success", {
        questionLength: question.length,
        answerLength: answer.length
      });
    }

    return {
      sllmSimpleAnswer: answer.trim(),
      currentStep: "sllm:answerSimple"
    };
  } catch (error) {
    if (logger) {
      logger.warn("[sLLM] answerSimple error, using fallback", {
        error: error.message
      });
    }

    // 폴백: 문서 기반 간단 답변
    return answerByDocuments(question, retrievedDocs, logger);
  }
}

/**
 * 문서 기반 간단 답변 생성 (폴백)
 * @param {string} question - 질문
 * @param {Array} docs - 검색된 문서 배열
 * @param {Object} [logger] - 로거
 * @returns {Object} 답변 결과
 */
function answerByDocuments(question, docs, logger) {
  if (!docs || docs.length === 0) {
    return {
      sllmSimpleAnswer: "문서에서 관련 정보를 찾을 수 없습니다.",
      currentStep: "sllm:answerSimple"
    };
  }

  // 첫 번째 문서에서 관련 문장 추출
  const firstDoc = docs[0];
  const content = typeof firstDoc === "string"
    ? firstDoc
    : firstDoc.pageContent || firstDoc.content || "";

  const source = firstDoc.metadata?.source || firstDoc.source || "document";
  const filename = extractFilename(source);

  // 질문의 핵심 단어 추출
  const keywords = extractKeywords(question);

  // 관련 문장 찾기
  const sentences = content.split(/[.!?。]\s*/);
  const relevantSentences = sentences.filter(sentence => {
    const lowerSentence = sentence.toLowerCase();
    return keywords.some(keyword =>
      lowerSentence.includes(keyword.toLowerCase())
    );
  }).slice(0, 3);

  let answer;
  if (relevantSentences.length > 0) {
    answer = relevantSentences.join(". ") + ".";
    answer += ` [Source: ${filename}]`;
  } else {
    // 첫 몇 문장 반환
    answer = sentences.slice(0, 2).join(". ") + ".";
    answer += ` [Source: ${filename}]`;
  }

  if (logger) {
    logger.debug("[sLLM] answerByDocuments", {
      question: question.substring(0, 50),
      answerLength: answer.length,
      method: "document-extraction"
    });
  }

  return {
    sllmSimpleAnswer: answer,
    currentStep: "sllm:answerSimple"
  };
}

/**
 * 문서 배열을 프롬프트용 문자열로 포맷팅
 * @param {Array} docs - 검색된 문서 배열
 * @returns {string} 포맷팅된 문서 문자열
 */
function formatDocuments(docs) {
  if (!docs || docs.length === 0) {
    return "No documents available.";
  }

  return docs.map((doc, idx) => {
    const content = typeof doc === "string"
      ? doc
      : doc.pageContent || doc.content || "";
    const source = doc.metadata?.source || doc.source || `doc-${idx + 1}`;
    const filename = extractFilename(source);

    return `[Document ${idx + 1}: ${filename}]\n${content.substring(0, 1500)}`;
  }).join("\n\n---\n\n");
}

/**
 * 경로에서 파일명 추출
 * @param {string} path - 파일 경로
 * @returns {string} 파일명
 */
function extractFilename(path) {
  if (!path) return "unknown";
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || "unknown";
}

/**
 * 질문에서 키워드 추출
 * @param {string} question - 질문
 * @returns {Array<string>} 키워드 배열
 */
function extractKeywords(question) {
  // 불용어 제거
  const stopWords = new Set([
    "what", "how", "why", "when", "where", "who", "which", "is", "are", "was", "were",
    "do", "does", "did", "can", "could", "would", "should", "the", "a", "an",
    "무엇", "어떻게", "왜", "언제", "어디", "누가", "어느", "이", "그", "저",
    "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "하다"
  ]);

  // 단어 추출 및 필터링
  const words = question.match(/[a-zA-Z가-힣]+/g) || [];
  return words.filter(word =>
    word.length >= 2 && !stopWords.has(word.toLowerCase())
  );
}

module.exports = {
  answerSimple,
  answerByDocuments,
  formatDocuments,
  extractKeywords
};
