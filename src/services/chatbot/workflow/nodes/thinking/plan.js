/**
 * Thinking Mode - Plan Node
 * @module services/chatbot/workflow/nodes/thinking/plan
 *
 * Phase 6: 답변 전략 계획
 * 분석 결과를 바탕으로 답변 생성 전략 수립
 */

const { z } = require("zod");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");

/**
 * 계획 단계 스키마
 */
const planStepSchema = z.object({
  stepNumber: z.number(),
  action: z.string(),
  description: z.string(),
  expectedOutput: z.string(),
});

/**
 * 전체 계획 스키마
 */
const planSchema = z.object({
  strategy: z.string(),
  steps: z.array(planStepSchema),
  estimatedComplexity: z.enum(["low", "medium", "high"]),
});

/**
 * 계획 프롬프트
 */
const PLAN_PROMPT = `You are a strategic planner for answering questions. Based on the analysis, create a plan to answer the user's question.

ORIGINAL QUESTION: {question}

ANALYSIS RESULT:
- Question Type: {questionType}
- Sub-questions: {subQuestions}
- Required Information: {requiredInfo}
- Reasoning: {reasoning}

AVAILABLE CONTEXT:
{context}

INSTRUCTIONS:
Create a step-by-step plan to answer this question comprehensively. Each step should:
1. Have a clear action (e.g., "Explain concept X", "Compare A and B", "Provide example")
2. Include what information to use
3. Describe expected output

Respond with JSON containing:
- strategy: Brief description of the overall approach
- steps: Array of steps with stepNumber, action, description, expectedOutput
- estimatedComplexity: "low" | "medium" | "high"`;

/**
 * 답변 전략 계획 노드 (Thinking Mode Step 2)
 * 분석 결과를 바탕으로 단계별 답변 계획 수립
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function planStrategy(state, { llm }) {
  const { messages, thinkingAnalysis, retrievedDocs, thinkingMode } = state;

  // Thinking 모드가 비활성화되어 있거나 분석이 없으면 스킵
  if (!thinkingMode || !thinkingAnalysis) {
    return {
      currentStep: "planStrategy",
      thinkingPlan: null,
    };
  }

  // 간단한 질문은 계획 단계 스킵
  if (thinkingAnalysis.questionType === "simple" && thinkingAnalysis.subQuestions.length === 0) {
    return {
      thinkingPlan: {
        strategy: "Direct answer - simple question identified",
        steps: [{
          stepNumber: 1,
          action: "Answer directly",
          description: "Provide a direct, comprehensive answer",
          expectedOutput: "Complete answer to the question",
        }],
        estimatedComplexity: "low",
      },
      currentStep: "planStrategy",
    };
  }

  if (!messages || messages.length === 0) {
    return {
      currentStep: "planStrategy",
      thinkingPlan: null,
      error: "No messages to plan for",
    };
  }

  const lastMessage = messages[messages.length - 1];
  const question = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  // 컨텍스트 요약
  const contextSummary = retrievedDocs && retrievedDocs.length > 0
    ? retrievedDocs.slice(0, 5).map(d => `- ${d.pageContent.slice(0, 300)}...`).join('\n')
    : "No context available";

  try {
    const prompt = PLAN_PROMPT
      .replace("{question}", question)
      .replace("{questionType}", thinkingAnalysis.questionType)
      .replace("{subQuestions}", thinkingAnalysis.subQuestions.join(", ") || "None")
      .replace("{requiredInfo}", thinkingAnalysis.requiredInfo.join(", ") || "None")
      .replace("{reasoning}", thinkingAnalysis.reasoning)
      .replace("{context}", contextSummary);

    // Structured output 사용 시도
    try {
      const structuredLLM = llm.withStructuredOutput(planSchema);
      const plan = await structuredLLM.invoke(prompt);

      return {
        thinkingPlan: plan,
        currentStep: "planStrategy",
      };
    } catch (structuredError) {
      // Structured output 미지원 시 일반 호출
      const response = await llm.invoke([
        new SystemMessage("You are a strategic planner. Respond only with valid JSON."),
        new HumanMessage(prompt),
      ]);

      const content = typeof response === 'string' ? response : response.content;

      // JSON 파싱 시도
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const plan = planSchema.parse(parsed);

        return {
          thinkingPlan: plan,
          currentStep: "planStrategy",
        };
      }

      // 파싱 실패 시 기본 계획
      return {
        thinkingPlan: createDefaultPlan(thinkingAnalysis),
        currentStep: "planStrategy",
      };
    }
  } catch (error) {
    // 에러 시 기본 계획
    return {
      thinkingPlan: createDefaultPlan(thinkingAnalysis),
      currentStep: "planStrategy",
      error: `Planning failed: ${error.message}`,
    };
  }
}

/**
 * 기본 계획 생성 (폴백)
 * @param {Object} analysis - 분석 결과
 * @returns {Object} 기본 계획
 */
function createDefaultPlan(analysis) {
  const steps = [];

  // 서브 질문이 있으면 각각에 대한 단계 생성
  if (analysis.subQuestions && analysis.subQuestions.length > 0) {
    analysis.subQuestions.forEach((sq, index) => {
      steps.push({
        stepNumber: index + 1,
        action: `Answer sub-question ${index + 1}`,
        description: sq,
        expectedOutput: `Answer to: ${sq}`,
      });
    });

    // 종합 단계 추가
    steps.push({
      stepNumber: steps.length + 1,
      action: "Synthesize answers",
      description: "Combine all sub-answers into a comprehensive response",
      expectedOutput: "Complete, integrated answer",
    });
  } else {
    // 기본 단일 단계
    steps.push({
      stepNumber: 1,
      action: "Answer question",
      description: "Provide comprehensive answer based on available context",
      expectedOutput: "Complete answer",
    });
  }

  return {
    strategy: "Sequential answering with synthesis",
    steps,
    estimatedComplexity: analysis.questionType === "multi-part" ? "high" : "medium",
  };
}

/**
 * 계획 복잡도 확인
 * @param {Object} plan - 계획 결과
 * @returns {boolean} 복잡한 계획 여부
 */
function isComplexPlan(plan) {
  if (!plan) return false;
  return plan.estimatedComplexity !== "low" || plan.steps.length > 2;
}

module.exports = { planStrategy, planSchema, planStepSchema, createDefaultPlan, isComplexPlan, PLAN_PROMPT };
