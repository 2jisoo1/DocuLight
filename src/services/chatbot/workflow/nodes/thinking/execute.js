/**
 * Thinking Mode - Execute Node
 * @module services/chatbot/workflow/nodes/thinking/execute
 *
 * Phase 6: 계획 실행 및 답변 생성
 * 계획된 단계들을 순차적으로 실행하여 최종 답변 생성
 */

const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const { formatRetrievedDocs } = require("../retrieve");

/**
 * 실행 프롬프트
 */
const EXECUTE_PROMPT = `You are executing a planned response strategy. Follow the plan carefully.

ORIGINAL QUESTION: {question}

PLAN:
Strategy: {strategy}
Steps:
{steps}

CONTEXT DOCUMENTS:
{context}

CURRENT STEP: {currentStepNumber}. {currentAction}
Description: {currentDescription}
Expected Output: {expectedOutput}

PREVIOUS STEPS RESULTS:
{previousResults}

INSTRUCTIONS:
1. Execute the current step based on the available context
2. Be comprehensive but concise
3. If this is the final step, provide a complete answer
4. Reference source documents when applicable

Execute this step:`;

/**
 * 종합 프롬프트
 */
const SYNTHESIZE_PROMPT = `You are synthesizing multiple answers into a final comprehensive response.

ORIGINAL QUESTION: {question}

STEP RESULTS:
{stepResults}

CONTEXT DOCUMENTS:
{context}

INSTRUCTIONS:
1. Combine all step results into a coherent, comprehensive answer
2. Ensure the answer is well-structured (use headings, bullets if helpful)
3. Include source references where applicable
4. Match the language of the user's question (Korean/English)
5. Remove any redundancy between steps

Generate your final answer:`;

/**
 * 계획 실행 노드 (Thinking Mode Step 3)
 * 계획된 각 단계를 실행하고 결과 종합
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.llm - LLM 인스턴스
 * @param {Object} deps.config - 설정
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function executeSteps(state, { llm, config = {} }) {
  const { messages, thinkingPlan, retrievedDocs, thinkingMode } = state;

  // Thinking 모드가 비활성화되어 있거나 계획이 없으면 일반 생성으로 위임
  if (!thinkingMode || !thinkingPlan) {
    return {
      currentStep: "executeSteps",
      thinkingResults: null,
    };
  }

  if (!messages || messages.length === 0) {
    return {
      messages: [new AIMessage("I don't have a question to respond to.")],
      currentStep: "executeSteps",
      error: "No messages to execute",
    };
  }

  const lastMessage = messages[messages.length - 1];
  const question = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  // 컨텍스트 포맷팅
  const context = retrievedDocs && retrievedDocs.length > 0
    ? formatRetrievedDocs(retrievedDocs)
    : "No context documents available";

  const systemPrompt = config.chatbot?.systemPrompt ||
    "You are a helpful document assistant. Be comprehensive and accurate.";

  try {
    const stepResults = [];
    const { strategy, steps } = thinkingPlan;

    // 단일 단계 또는 낮은 복잡도면 직접 답변
    if (steps.length <= 1 || thinkingPlan.estimatedComplexity === "low") {
      const directPrompt = `Based on the following context, answer the question comprehensively.

CONTEXT:
${context}

QUESTION: ${question}

Provide a well-structured answer:`;

      const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(directPrompt),
      ]);

      const aiMessage = response instanceof AIMessage
        ? response
        : new AIMessage(typeof response === 'string' ? response : response.content);

      return {
        messages: [aiMessage],
        thinkingResults: [{
          step: 1,
          action: "Direct answer",
          result: aiMessage.content,
        }],
        currentStep: "executeSteps",
      };
    }

    // 복잡한 계획: 각 단계 순차 실행
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // 이전 결과 포맷팅
      const previousResults = stepResults.length > 0
        ? stepResults.map((r, idx) => `Step ${idx + 1}: ${r.result.slice(0, 500)}...`).join('\n\n')
        : "No previous steps";

      // 단계 포맷팅
      const stepsFormatted = steps.map((s, idx) =>
        `${s.stepNumber}. ${s.action}: ${s.description}`
      ).join('\n');

      const stepPrompt = EXECUTE_PROMPT
        .replace("{question}", question)
        .replace("{strategy}", strategy)
        .replace("{steps}", stepsFormatted)
        .replace("{context}", context)
        .replace("{currentStepNumber}", step.stepNumber.toString())
        .replace("{currentAction}", step.action)
        .replace("{currentDescription}", step.description)
        .replace("{expectedOutput}", step.expectedOutput)
        .replace("{previousResults}", previousResults);

      try {
        const stepResponse = await llm.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(stepPrompt),
        ]);

        const stepContent = typeof stepResponse === 'string'
          ? stepResponse
          : stepResponse.content;

        stepResults.push({
          step: step.stepNumber,
          action: step.action,
          result: stepContent,
        });
      } catch (stepError) {
        // 개별 단계 실패 시 기록하고 계속
        stepResults.push({
          step: step.stepNumber,
          action: step.action,
          result: `[Step failed: ${stepError.message}]`,
          error: stepError.message,
        });
      }
    }

    // 결과 종합
    const finalResponse = await synthesizeResults(
      llm,
      systemPrompt,
      question,
      stepResults,
      context
    );

    return {
      messages: [new AIMessage(finalResponse)],
      thinkingResults: stepResults,
      currentStep: "executeSteps",
    };
  } catch (error) {
    return {
      messages: [new AIMessage(
        "I encountered an error while processing your question. Please try again."
      )],
      currentStep: "executeSteps",
      error: `Execution failed: ${error.message}`,
    };
  }
}

/**
 * 단계별 결과 종합
 * @param {Object} llm - LLM 인스턴스
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} question - 원본 질문
 * @param {Array} stepResults - 단계별 결과
 * @param {string} context - 문서 컨텍스트
 * @returns {Promise<string>} 종합된 답변
 */
async function synthesizeResults(llm, systemPrompt, question, stepResults, context) {
  // 모든 단계가 실패했으면 에러 메시지
  const validResults = stepResults.filter(r => !r.error);
  if (validResults.length === 0) {
    return "I apologize, but I couldn't process your question properly. Please try rephrasing.";
  }

  // 단일 유효 결과면 그대로 반환
  if (validResults.length === 1) {
    return validResults[0].result;
  }

  // 여러 결과 종합
  const stepResultsFormatted = stepResults.map(r =>
    `### Step ${r.step}: ${r.action}\n${r.error ? '[Failed]' : r.result}`
  ).join('\n\n---\n\n');

  const synthesizePrompt = SYNTHESIZE_PROMPT
    .replace("{question}", question)
    .replace("{stepResults}", stepResultsFormatted)
    .replace("{context}", context.slice(0, 3000)); // 컨텍스트 길이 제한

  try {
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(synthesizePrompt),
    ]);

    return typeof response === 'string' ? response : response.content;
  } catch (error) {
    // 종합 실패 시 마지막 유효 결과 반환
    return validResults[validResults.length - 1].result;
  }
}

/**
 * Thinking 모드 결과 포맷팅 (UI 표시용)
 * @param {Object} state - 현재 상태
 * @returns {Object} 포맷팅된 thinking 결과
 */
function formatThinkingOutput(state) {
  const { thinkingAnalysis, thinkingPlan, thinkingResults } = state;

  return {
    analysis: thinkingAnalysis ? {
      type: thinkingAnalysis.questionType,
      subQuestions: thinkingAnalysis.subQuestions,
      reasoning: thinkingAnalysis.reasoning,
    } : null,
    plan: thinkingPlan ? {
      strategy: thinkingPlan.strategy,
      complexity: thinkingPlan.estimatedComplexity,
      stepCount: thinkingPlan.steps.length,
    } : null,
    execution: thinkingResults ? {
      completedSteps: thinkingResults.length,
      failedSteps: thinkingResults.filter(r => r.error).length,
    } : null,
  };
}

module.exports = {
  executeSteps,
  synthesizeResults,
  formatThinkingOutput,
  EXECUTE_PROMPT,
  SYNTHESIZE_PROMPT
};
