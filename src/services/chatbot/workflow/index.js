/**
 * Chatbot Workflow Module
 * @module services/chatbot/workflow
 *
 * LangGraph 기반 RAG 워크플로우 내보내기
 * Phase 5: Advanced RAG (Query Rewriting, Document Grading) 추가
 * Phase 6: Thinking Mode 추가
 * Step 16: Self-Correcting RAG 추가
 * Step 17: Multi-Document Summarization 추가
 */

const { ChatbotAnnotation } = require("./state");
const { classifyQuery, classificationSchema } = require("./nodes/classify");
const { retrieveDocs, formatRetrievedDocs } = require("./nodes/retrieve");
const { generateAnswer, generateAnswerStream, generateWithLowRelevance, generateNoContext, fastGenerate } = require("./nodes/generate");
const { summarizeHistory, checkContextSize, needsSummarization } = require("./nodes/summarize");
const { gradeDocuments, gradingSchema, routeByRelevance } = require("./nodes/grade");
const { rewriteQuery, canRetryRewrite } = require("./nodes/rewrite");
const { evaluateAnswer, evaluationSchema, routeByEvaluation } = require("./nodes/evaluate");
const prompts = require("./prompts");
// Step 17: Multi-Document Summarization
const {
  analyzeRequest,
  analyzeByKeywords,
  summaryRequirementsSchema,
  buildTargetLengthSpec,
  buildFormatGuidelines,
  buildLengthConstraint
} = require("./nodes/analyze-request");
const {
  mapSummarize,
  reduceSummaries,
  generateSummary,
  routeForSummarization,
  groupDocumentsByTokenBudget
} = require("./nodes/map-summarize");

module.exports = {
  // State
  ChatbotAnnotation,

  // Nodes - Classify
  classifyQuery,
  classificationSchema,

  // Nodes - Retrieve
  retrieveDocs,
  formatRetrievedDocs,

  // Nodes - Grade (Phase 5)
  gradeDocuments,
  gradingSchema,
  routeByRelevance,

  // Nodes - Rewrite (Phase 5)
  rewriteQuery,
  canRetryRewrite,

  // Nodes - Evaluate (Step 16)
  evaluateAnswer,
  evaluationSchema,
  routeByEvaluation,

  // Nodes - Generate
  generateAnswer,
  generateAnswerStream,
  generateWithLowRelevance,
  generateNoContext,
  fastGenerate,

  // Nodes - Summarize
  summarizeHistory,
  checkContextSize,
  needsSummarization,

  // Prompts
  prompts,

  // Step 17: Multi-Document Summarization
  analyzeRequest,
  analyzeByKeywords,
  summaryRequirementsSchema,
  buildTargetLengthSpec,
  buildFormatGuidelines,
  buildLengthConstraint,
  mapSummarize,
  reduceSummaries,
  generateSummary,
  routeForSummarization,
  groupDocumentsByTokenBudget,
};
