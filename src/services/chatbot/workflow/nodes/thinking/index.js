/**
 * Thinking Mode Module
 * @module services/chatbot/workflow/nodes/thinking
 *
 * Phase 6: 복잡한 질문에 대한 단계별 추론
 * Analyze → Plan → Execute 3단계 프로세스
 */

const { analyzeQuestion, analysisSchema, isComplexQuestion, ANALYZE_PROMPT } = require("./analyze");
const { planStrategy, planSchema, planStepSchema, createDefaultPlan, isComplexPlan, PLAN_PROMPT } = require("./plan");
const { executeSteps, synthesizeResults, formatThinkingOutput, EXECUTE_PROMPT, SYNTHESIZE_PROMPT } = require("./execute");

module.exports = {
  // Analyze
  analyzeQuestion,
  analysisSchema,
  isComplexQuestion,
  ANALYZE_PROMPT,

  // Plan
  planStrategy,
  planSchema,
  planStepSchema,
  createDefaultPlan,
  isComplexPlan,
  PLAN_PROMPT,

  // Execute
  executeSteps,
  synthesizeResults,
  formatThinkingOutput,
  EXECUTE_PROMPT,
  SYNTHESIZE_PROMPT,
};
