/**
 * Chatbot Module
 * @module services/chatbot
 *
 * RAG 기반 챗봇 서비스 모듈
 */

const { ChatbotService } = require("./chatbot-service");
const { createLLM, createEmbeddings, LLM_TYPES } = require("./llm-factory");
const { VectorStoreManager } = require("./vector-store");
const { DocWatcher } = require("./doc-watcher");
const { DocLoader, loadMarkdownWithFrontmatter } = require("./doc-loader");
const { estimateTokens, truncateToTokenLimit, isContextOverThreshold, getRemainingTokens } = require("./token-estimator");
const workflow = require("./workflow");

module.exports = {
  // Main Service
  ChatbotService,

  // LLM Factory
  createLLM,
  createEmbeddings,
  LLM_TYPES,

  // Document Processing
  VectorStoreManager,
  DocWatcher,
  DocLoader,
  loadMarkdownWithFrontmatter,

  // Token Management
  estimateTokens,
  truncateToTokenLimit,
  isContextOverThreshold,
  getRemainingTokens,

  // Workflow
  workflow
};
