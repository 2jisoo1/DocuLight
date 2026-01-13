/**
 * Thinking Mode - Analyze Node
 * @module services/chatbot/workflow/nodes/thinking/analyze
 *
 * Phase 6: 복잡한 질문 분석
 * 질문의 구성 요소와 필요한 정보를 식별
 */

const { z } = require("zod");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");

/**
 * 분석 결과 스키마
 */
const analysisSchema = z.object({
  questionType: z.enum(["simple", "complex", "multi-part"]),
  subQuestions: z.array(z.string()),
  requiredInfo: z.array(z.string()),
  reasoning: z.string(),
});

/**
 * 분석 프롬프트
 */
const ANALYZE_PROMPT = `You are an expert question analyzer. Analyze the following question and break it down into components.

USER QUESTION: {question}

CONTEXT (if available):
{context}

INSTRUCTIONS:
1. Determine the question type:
   - "simple": Single, straightforward question with one clear answer
   - "complex": Requires multiple pieces of information or reasoning steps
   - "multi-part": Contains multiple distinct sub-questions

2. If complex or multi-part, identify sub-questions that need to be answered
3. List the required information or concepts needed to answer
4. Explain your reasoning

Respond with JSON containing:
- questionType: "simple" | "complex" | "multi-part"
- subQuestions: Array of sub-questions (empty for simple questions)
- requiredInfo: Array of required information/concepts
- reasoning: Brief explanation of your analysis`;

/**
 * 질문 분석 노드 (Thinking Mode Step 1)
 * 복잡한 질문을 분석하여 구성 요소 식별
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function analyzeQuestion(state, { llm }) {
  const { messages, retrievedDocs, thinkingMode } = state;

  // Thinking 모드가 비활성화되어 있으면 스킵
  if (!thinkingMode) {
    return {
      currentStep: "analyzeQuestion",
      thinkingAnalysis: null,
    };
  }

  if (!messages || messages.length === 0) {
    return {
      currentStep: "analyzeQuestion",
      thinkingAnalysis: null,
      error: "No messages to analyze",
    };
  }

  const lastMessage = messages[messages.length - 1];
  const question = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  // 컨텍스트 요약 (있는 경우)
  const contextSummary = retrievedDocs && retrievedDocs.length > 0
    ? retrievedDocs.slice(0, 3).map(d => d.pageContent.slice(0, 200)).join('\n...\n')
    : "No context available";

  try {
    const prompt = ANALYZE_PROMPT
      .replace("{question}", question)
      .replace("{context}", contextSummary);

    // Structured output 사용 시도
    try {
      const structuredLLM = llm.withStructuredOutput(analysisSchema);
      const analysis = await structuredLLM.invoke(prompt);

      return {
        thinkingAnalysis: analysis,
        currentStep: "analyzeQuestion",
      };
    } catch (structuredError) {
      // Structured output 미지원 시 일반 호출
      const response = await llm.invoke([
        new SystemMessage("You are a question analyzer. Respond only with valid JSON."),
        new HumanMessage(prompt),
      ]);

      const content = typeof response === 'string' ? response : response.content;

      // JSON 파싱 시도
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const analysis = analysisSchema.parse(parsed);

        return {
          thinkingAnalysis: analysis,
          currentStep: "analyzeQuestion",
        };
      }

      // 파싱 실패 시 기본값
      return {
        thinkingAnalysis: {
          questionType: "simple",
          subQuestions: [],
          requiredInfo: [question],
          reasoning: "Could not parse analysis, treating as simple question",
        },
        currentStep: "analyzeQuestion",
      };
    }
  } catch (error) {
    // 에러 시 기본 분석
    return {
      thinkingAnalysis: {
        questionType: "simple",
        subQuestions: [],
        requiredInfo: [],
        reasoning: `Analysis failed: ${error.message}`,
      },
      currentStep: "analyzeQuestion",
      error: `Analysis failed: ${error.message}`,
    };
  }
}

/**
 * 질문 복잡도 판단
 * @param {Object} analysis - 분석 결과
 * @returns {boolean} 복잡한 질문 여부
 */
function isComplexQuestion(analysis) {
  if (!analysis) return false;
  return analysis.questionType !== "simple" || analysis.subQuestions.length > 0;
}

module.exports = { analyzeQuestion, analysisSchema, isComplexQuestion, ANALYZE_PROMPT };
