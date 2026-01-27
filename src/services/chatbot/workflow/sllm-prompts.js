/**
 * sLLM Optimized Prompts
 * @module services/chatbot/workflow/sllm-prompts
 *
 * Step 15.1: sLLM(1.2B) 최적화 프롬프트
 * - 각 프롬프트는 단일 작업만 수행
 * - 토큰 효율성 최적화
 * - JSON 출력 강제
 */

/**
 * [STEP 1] CLASSIFY_QUESTION
 * 목적: 질문이 simple인지 complex인지 판정
 * 토큰: ~150
 * 온도: 0.1
 */
const SLLM_CLASSIFY_QUESTION = `Your task: Identify if this question is SIMPLE or COMPLEX.

DEFINITION:
- SIMPLE: Single, clear question with one direct answer
  Examples: "What is X?", "How do I Y?"
- COMPLEX: Needs multiple pieces of information or comparisons
  Examples: "Compare X and Y", "Why does X happen and how to fix?"

QUESTION: {question}

Output JSON only:
{
  "type": "simple" or "complex",
  "confidence": 0.0 to 1.0,
  "reason": "one sentence max"
}`;

/**
 * [STEP 2] EXTRACT_CONCEPTS
 * 목적: 핵심 개념과 키워드 추출
 * 토큰: ~100
 * 온도: 0.3
 */
const SLLM_EXTRACT_CONCEPTS = `Your task: Extract KEY CONCEPTS from the question.

QUESTION: {question}

EXTRACT:
1. Core concepts: Main ideas (2-5 items)
2. Keywords: Technical terms (2-5 items)

Output JSON only:
{
  "coreConcepts": ["concept1", "concept2"],
  "keywords": ["keyword1", "keyword2"]
}`;

/**
 * [STEP 3] DECOMPOSE_QUESTION
 * 목적: 복잡한 질문을 2-3개 하위 질문으로 분해
 * 토큰: ~250
 * 온도: 0.5
 */
const SLLM_DECOMPOSE_QUESTION = `Your task: Break this COMPLEX question into 2-3 simple sub-questions.

QUESTION: {question}
KEY CONCEPTS: {concepts}

RULE: Create sub-questions that:
1. Are simpler than the original
2. Together, fully answer the original question

Output JSON only:
{
  "subQuestions": [
    {"order": 1, "question": "sub-question 1"},
    {"order": 2, "question": "sub-question 2"},
    {"order": 3, "question": "sub-question 3"}
  ],
  "logic": "brief explanation"
}`;

/**
 * [STEP 4] ANSWER_SUBQUESTION
 * 목적: 하위 질문 1개에 대해 답변
 * 토큰: ~200 + 문서
 * 온도: 0.3
 */
const SLLM_ANSWER_SUBQUESTION = `Your task: Answer ONLY this ONE sub-question.

ORIGINAL QUESTION (context): {originalQuestion}
SUB-QUESTION TO ANSWER: {subQuestion}

DOCUMENTS:
{documents}

RULES:
1. Answer ONLY the sub-question
2. Use ONLY information from documents
3. If not found: say "Not found in documents"
4. Keep answer: 2-5 sentences
5. Cite: [Source: filename.md]

ANSWER:`;

/**
 * [STEP 5] SYNTHESIZE_ANSWERS
 * 목적: 모든 하위 답변을 하나로 조합
 * 토큰: ~300 + 하위 답변들
 * 온도: 0.5
 */
const SLLM_SYNTHESIZE_ANSWERS = `Your task: Combine all sub-answers into ONE complete answer.

ORIGINAL QUESTION: {originalQuestion}

SUB-ANSWERS:
{subAnswers}

RULES:
1. Create a single coherent answer
2. Synthesize, don't just concatenate
3. Remove redundancy
4. Include source citations
5. Length: 3-7 sentences

SYNTHESIZED ANSWER:`;

/**
 * [STEP 6] ANSWER_SIMPLE
 * 목적: 간단한 질문에 직접 답변
 * 토큰: ~150 + 문서
 * 온도: 0.3
 */
const SLLM_ANSWER_SIMPLE = `Your task: Provide a direct answer.

QUESTION: {question}

DOCUMENTS:
{documents}

RULES:
1. Direct answer (no preamble)
2. Support with document info
3. Structure:
   - Main answer (1-2 sentences)
   - Supporting details
   - [Source: filename.md]
4. Length: 3-8 sentences

ANSWER:`;

/**
 * [STEP 7] ENSEMBLE_VERIFY - Variant A (Accuracy Check)
 * 목적: 답변이 문서와 일치하고 지원되지 않는 주장이 없는지 확인
 * 토큰: ~200 + 문서
 * 온도: 0.1
 */
const SLLM_VERIFY_ACCURACY = `QUESTION: {question}
ANSWER: {answer}
DOCUMENTS: {documents}

Check this answer:
1. Does it match the documents? [yes/no]
2. Does it answer the question? [yes/no]
3. Any unsupported claims? [list or empty]

Output JSON:
{
  "matchesDocuments": true/false,
  "answersQuestion": true/false,
  "unsupportedClaims": [],
  "score": 0-100
}`;

/**
 * [STEP 7] ENSEMBLE_VERIFY - Variant B (Completeness Check)
 * 목적: 답변이 질문을 완전히 다루는지 확인
 * 토큰: ~150
 * 온도: 0.1
 */
const SLLM_VERIFY_COMPLETENESS = `Does this answer fully address the question?

QUESTION: {question}
ANSWER: {answer}

Check:
1. Main question answered? [yes/partially/no]
2. Missing aspects? [list]

Output JSON:
{
  "mainAnswered": "yes",
  "missingAspects": [],
  "score": 0-100
}`;

/**
 * [STEP 8] FACT_VERIFY
 * 목적: 답변을 사실 단위로 분해하고 각각 검증
 * 토큰: ~400 + 문서
 * 온도: 0.1
 */
const SLLM_FACT_VERIFY = `Your task: Break this answer into individual facts and verify each.

ANSWER: {answer}

DOCUMENTS:
{documents}

For each fact:
1. Extract the claim
2. Find evidence in documents
3. Mark as: verified / inferred / not_found / contradicted

Output JSON:
{
  "facts": [
    {"id": 1, "text": "fact1", "status": "verified", "evidence": "quote", "source": "filename.md"},
    {"id": 2, "text": "fact2", "status": "not_found", "evidence": null, "source": null}
  ],
  "summary": {
    "verified": 0,
    "inferred": 0,
    "not_found": 0,
    "contradicted": 0
  },
  "overallScore": 0-100
}`;

/**
 * [STEP 9] REFINE_ANSWER
 * 목적: 검증 피드백을 반영하여 답변 개선
 * 토큰: ~300 + 원본 답변
 * 온도: 0.3
 */
const SLLM_REFINE_ANSWER = `Your task: Improve this answer based on verification feedback.

ORIGINAL ANSWER:
{answer}

ISSUES FOUND:
{issues}

UNVERIFIED FACTS:
{unverifiedFacts}

RULES:
1. Fix identified issues
2. Remove unverified claims OR add "according to available documents"
3. Keep verified facts unchanged
4. Maintain concise length

IMPROVED ANSWER:`;

module.exports = {
  // Phase 1: 질문 분석
  SLLM_CLASSIFY_QUESTION,
  SLLM_EXTRACT_CONCEPTS,

  // Phase 2: 질문 분해
  SLLM_DECOMPOSE_QUESTION,

  // Phase 3: 답변 생성
  SLLM_ANSWER_SUBQUESTION,
  SLLM_SYNTHESIZE_ANSWERS,
  SLLM_ANSWER_SIMPLE,

  // Phase 4: 검증
  SLLM_VERIFY_ACCURACY,
  SLLM_VERIFY_COMPLETENESS,
  SLLM_FACT_VERIFY,
  SLLM_REFINE_ANSWER
};
