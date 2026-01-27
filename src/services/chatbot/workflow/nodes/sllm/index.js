/**
 * sLLM Nodes Index
 * @module services/chatbot/workflow/nodes/sllm
 *
 * Step 15.1: sLLM 최적화 노드 모음
 */

// Phase 1: 질문 분석
const { classifyQuestion, classifyByKeywords, classifySchema } = require("./classify-question");
const { extractConcepts, extractByPattern, extractSchema } = require("./extract-concepts");

// Phase 2: 질문 분해
const { decomposeQuestion, decomposeByPattern, decomposeSchema } = require("./decompose-question");

// Phase 3: 답변 생성
const { answerSubquestion, answerAllSubquestions, formatDocuments: formatDocsForSubq } = require("./answer-subquestion");
const { synthesizeAnswers, synthesizeByPattern, formatSubAnswers, extractSources } = require("./synthesize-answers");
const { answerSimple, answerByDocuments, formatDocuments: formatDocsForSimple, extractKeywords } = require("./answer-simple");

// Phase 4: 검증
const {
  ensembleVerify,
  verifyAccuracy,
  verifyCompleteness,
  verifyByPattern,
  shouldEarlyExit,
  EARLY_EXIT_THRESHOLD,
  accuracySchema,
  completenessSchema
} = require("./verify/ensemble-verify");

const {
  factVerify,
  factVerifyByPattern,
  getUnverifiedFacts,
  isFactVerifyPassed,
  factVerifySchema,
  factSchema
} = require("./verify/fact-verify");

const {
  refineAnswer,
  refineByPattern,
  collectIssues,
  getUnverifiedFactsText,
  needsRefinement,
  REFINE_THRESHOLD
} = require("./verify/refine-answer");

module.exports = {
  // Phase 1: 질문 분석
  classifyQuestion,
  classifyByKeywords,
  classifySchema,
  extractConcepts,
  extractByPattern,
  extractSchema,

  // Phase 2: 질문 분해
  decomposeQuestion,
  decomposeByPattern,
  decomposeSchema,

  // Phase 3: 답변 생성
  answerSubquestion,
  answerAllSubquestions,
  synthesizeAnswers,
  synthesizeByPattern,
  formatSubAnswers,
  extractSources,
  answerSimple,
  answerByDocuments,
  extractKeywords,

  // Phase 4: 검증
  ensembleVerify,
  verifyAccuracy,
  verifyCompleteness,
  verifyByPattern,
  shouldEarlyExit,
  EARLY_EXIT_THRESHOLD,
  accuracySchema,
  completenessSchema,
  factVerify,
  factVerifyByPattern,
  getUnverifiedFacts,
  isFactVerifyPassed,
  factVerifySchema,
  factSchema,
  refineAnswer,
  refineByPattern,
  collectIssues,
  getUnverifiedFactsText,
  needsRefinement,
  REFINE_THRESHOLD
};
