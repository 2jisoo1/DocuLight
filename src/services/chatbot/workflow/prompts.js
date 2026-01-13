/**
 * Chatbot Workflow Prompts
 * @module services/chatbot/workflow/prompts
 *
 * 모든 프롬프트는 영어로 작성되며,
 * 다국어 응답을 위한 지시가 포함됨
 */

/**
 * 시스템 프롬프트
 * 문서 기반 Q&A 어시스턴트의 기본 행동 정의
 */
const SYSTEM_PROMPT = `You are a helpful document assistant for DocLight.
Your primary role is to answer questions based on retrieved documents accurately.

CORE PRINCIPLES:
1. Be concise, accurate, and helpful
2. Always cite sources when referencing specific documents
3. If information is uncertain or incomplete, clearly state limitations
4. Format responses with proper Markdown for readability

RESPONSE FORMAT GUIDELINES:
- Use bullet points for lists
- Use code blocks with language tags for code
- Use bold for emphasis on key terms
- Include source references in format: [Source: filename.md]
  IMPORTANT: Use ONLY the filename (e.g., "README.md", "01-overview.md"), NOT full paths.
  NEVER include directory paths like "C:\\..." or "/home/..." in source references.

LANGUAGE RULE (CRITICAL):
- Detect the user's language from their question
- If the user asks in Korean, respond ENTIRELY in Korean
- If the user asks in English, respond ENTIRELY in English
- Never mix languages in a single response
- When unsure, default to the language of the most recent message`;

/**
 * 질문 분류 프롬프트
 * 사용자 입력을 4가지 카테고리로 분류
 */
const CLASSIFY_PROMPT = `You are a query classifier for a document Q&A system.
Classify the following user input into exactly one of these categories:

CATEGORIES:
1. "question" - A specific question seeking information from documents
   Examples: "How do I authenticate?", "What is the API endpoint?", "API 키는 어떻게 발급받나요?"

2. "summary" - A request for summarization or overview
   Examples: "Summarize this document", "Give me an overview", "이 문서를 요약해줘"

3. "chitchat" - Casual conversation, greetings, thanks, or off-topic
   Examples: "Hello", "Thank you", "How are you?", "안녕하세요", "감사합니다"

4. "unknown" - Cannot classify or ambiguous input
   Examples: Single words, gibberish, incomplete sentences

EDGE CASES:
- Follow-up questions like "Tell me more" → "question"
- Questions about the system itself → "chitchat"
- Complex multi-part queries → "question"
- Empty or very short input (<3 chars) → "unknown"

User input: {input}

Respond with a JSON object containing type and confidence (0.0-1.0).`;

/**
 * 답변 생성 프롬프트 (컨텍스트 있음)
 */
const GENERATE_PROMPT = `Generate a comprehensive answer based on the provided documents.

CONTEXT DOCUMENTS:
{context}

USER'S QUESTION: {question}

CRITICAL ANTI-HALLUCINATION RULES:
1. ONLY use information explicitly present in the documents above
2. NEVER invent, assume, or generate code that is not in the documents
3. NEVER assume syntax or API based on the name (e.g., "QL" does NOT mean SQL)
4. If documents show specific code examples, quote them EXACTLY as shown
5. If no code examples are in documents, explicitly state: "The provided documents do not contain specific code examples for this."

INSTRUCTIONS:
1. Answer ONLY based on the provided documents - nothing else
2. If the documents contain relevant information, synthesize a clear answer
3. If documents are partially relevant, acknowledge what you can/cannot answer
4. If asked for code but documents don't have it: Say "The documents don't contain code examples for this specific request"

RESPONSE STRUCTURE:
- Start with a direct answer to the question
- Provide supporting details from documents
- Include code examples ONLY if they exist in the documents (copy exactly, do not modify or invent)
- End with source references in format: [Source: filename.md]
  CRITICAL: Use ONLY the filename (e.g., "README.md"), NEVER full paths like "C:\\..." or "/home/..."

EDGE CASES:
- If asked for code not in documents: State that no code examples were found, do NOT generate your own
- If documents conflict: Present both perspectives
- If question is vague: Ask for clarification OR make reasonable assumptions and state them

Generate your response:`;

/**
 * 답변 생성 프롬프트 (컨텍스트 없음)
 */
const GENERATE_NO_CONTEXT_PROMPT = `The user asked a question, but no relevant documents were found.

USER'S QUESTION: {question}

INSTRUCTIONS:
1. Acknowledge that no relevant documents were found
2. If the question is about general knowledge, provide a brief general answer
3. Suggest the user rephrase their question or provide more context
4. Stay helpful and constructive

LANGUAGE: Match the language of the user's question.

Generate your response:`;

/**
 * 잡담 응답 프롬프트
 */
const CHITCHAT_PROMPT = `Respond to the user's casual message or greeting.

CONVERSATION HISTORY:
{history}

USER MESSAGE: {input}

GUIDELINES:
1. Be friendly and helpful
2. If greeting, greet back and offer assistance
3. If thanking, acknowledge and offer further help
4. Keep responses brief
5. Match the user's language
6. IMPORTANT: Use conversation history to maintain context (e.g., remember user's name if mentioned)

Generate a brief, friendly response:`;

/**
 * 요약 생성 프롬프트
 */
const SUMMARY_PROMPT = `Generate a summary based on the provided documents.

CONTEXT DOCUMENTS:
{context}

USER'S REQUEST: {question}

INSTRUCTIONS:
1. Create a concise summary of the key points
2. Organize information logically
3. Use bullet points for clarity
4. Include important details but avoid redundancy

LANGUAGE: Match the language of the user's request.

Generate your summary:`;

/**
 * 대화 요약 프롬프트 (Phase 4: 컨텍스트 압축)
 */
const SUMMARIZE_CONVERSATION_PROMPT = `Summarize the following conversation history concisely.
Focus on:
1. Key questions asked by the user
2. Important information provided in answers
3. Any decisions or conclusions reached
4. Ongoing topics that may need follow-up

EXISTING SUMMARY (if any):
{existing_summary}

RECENT CONVERSATION:
{conversation}

TARGET: Keep the summary under {target_tokens} tokens while preserving essential context.

LANGUAGE: Match the primary language used in the conversation.

Generate a concise summary:`;

/**
 * 문서 관련성 평가 프롬프트 (Phase 5: Document Grading)
 */
const GRADE_PROMPT = `You are a grader assessing relevance of a retrieved document to a user question.

Here is the retrieved document:
{document}

Here is the user question: {question}

If the document contains keywords or semantic meaning related to the question, grade it as relevant.
Give a binary score 'yes' or 'no' to indicate whether the document is relevant to the question.

Respond with a JSON object: { "binaryScore": "yes" or "no", "reasoning": "brief explanation" }`;

/**
 * 쿼리 재작성 프롬프트 (Phase 5: Query Rewriting)
 */
const REWRITE_PROMPT = `You are a query optimizer for a document search system.
Rewrite the following question to improve search results.

Focus on:
1. Key technical terms and concepts
2. Making the intent clearer
3. Adding relevant context if implicit
4. Using more specific terminology

Original question: {question}

Provide ONLY the rewritten question, nothing else.

Rewritten question:`;

/**
 * 낮은 관련성 문서로 답변 생성 프롬프트 (Phase 5: Graceful Degradation)
 */
const LOW_RELEVANCE_PROMPT = `The retrieved documents may not be directly relevant to the user's question.
Please provide the best possible answer based on the available information, but clearly indicate uncertainty.

AVAILABLE CONTEXT (may be partially relevant):
{context}

USER'S QUESTION: {question}

CRITICAL ANTI-HALLUCINATION RULES:
1. ONLY use information explicitly present in the documents above
2. NEVER invent, assume, or generate code that is not in the documents
3. NEVER guess syntax, API, or features based on naming conventions
4. If code is requested but not in documents, explicitly say so

INSTRUCTIONS:
1. Attempt to answer based ONLY on available information - do not supplement with assumptions
2. Clearly state if the answer might not be complete or accurate
3. Suggest what additional information might help
4. If asked for code/examples not in documents: Say "The available documents do not contain the specific code examples requested"

IMPORTANT: Begin your response by acknowledging that the available information may not be complete.

LANGUAGE: Match the language of the user's question.

Generate your response:`;

/**
 * 검색 결과 없음 프롬프트 (Phase 5: No Context)
 */
const NO_CONTEXT_PROMPT = `No relevant documents were found for the user's question.

CONVERSATION HISTORY:
{history}

USER'S CURRENT QUESTION: {question}

INSTRUCTIONS:
1. First, check if the answer can be found in the conversation history above
2. If the question relates to previous conversation (e.g., asking about something mentioned earlier), answer using that context
3. If no relevant information in history, politely inform the user that no relevant documents were found
4. If the question is general knowledge, provide a brief helpful response
5. Suggest the user try:
   - Rephrasing their question
   - Using different keywords
   - Checking if the information exists in the system
6. Stay helpful and constructive

LANGUAGE: Match the language of the user's question.

Generate your response:`;

/**
 * 답변 품질 평가 프롬프트 (Step 16: Self-Correcting RAG)
 */
const EVALUATE_ANSWER_PROMPT = `You are an answer quality evaluator for a document Q&A system.

CONVERSATION HISTORY:
{history}

USER'S QUESTION:
{question}

GENERATED ANSWER:
{answer}

DOCUMENTS USED (if any):
{documents}

EVALUATE the answer quality:

1. "adequate" - Answer fully addresses the question
   - For chitchat/greetings: appropriate response
   - For follow-ups: correctly references previous context
   - For document questions: answer is supported by documents
   - For general knowledge: reasonable and accurate response

2. "needs_docs" - Answer is insufficient, document search needed
   - Question asks about specific technical details not in context
   - Answer is vague or says "I don't know" for document-related question
   - Question references specific features/APIs/configurations
   - User asks about "how to" do something specific

3. "hallucination" - Answer contains unsupported claims
   - Claims specific facts without document support
   - Invents features, APIs, or details not in documents
   - Provides code examples that may be incorrect
   - States specific version numbers or configurations without source

4. "off_topic" - Answer doesn't address the question
   - Completely misunderstands the question
   - Answers a different question
   - Ignores key parts of the question

IMPORTANT CONSIDERATIONS:
- Was RAG used for this answer? (documents provided: {has_documents})
- If no documents were used, could documents have improved the answer?
- Is the answer based on conversation context alone appropriate?
- Are there specific technical claims that need document verification?

Respond with JSON: {"answerQuality": "...", "reason": "brief explanation", "confidence": 0.0-1.0}`;

/**
 * Fast Path 답변 생성 프롬프트 (Step 16: Self-Correcting RAG)
 * RAG 없이 빠르게 답변 시도
 */
const FAST_GENERATE_PROMPT = `Generate a response based on the conversation history alone.

CONVERSATION HISTORY:
{history}

USER'S QUESTION: {question}

INSTRUCTIONS:
1. First, determine if you can adequately answer from conversation context
2. For greetings, chitchat, follow-ups to previous answers: respond directly
3. For technical questions about specific documents/features: indicate uncertainty
4. Be honest if you need more information
5. Keep response concise

LANGUAGE: Match the language of the user's question.

Generate your response:`;

/**
 * === Step 17: Multi-Document Summarization Prompts ===
 */

/**
 * 요약 요구사항 분석 프롬프트
 */
const ANALYZE_REQUEST_PROMPT = `You are analyzing a user request for document summarization.
Extract specific requirements from the user's message.

USER REQUEST: {input}

EXTRACT THE FOLLOWING:

1. TARGET LENGTH:
   - Look for: "1500자 이상", "500 words", "간단히", "자세히", "3 paragraphs", etc.
   - Identify value, unit (characters/words/sentences/paragraphs), and constraint (minimum/maximum/approximate)
   - If "자세히/detailed" mentioned: suggest minimum 1000 words
   - If "간단히/brief" mentioned: suggest maximum 200 words

2. OUTPUT FORMAT:
   - "bullet_points": 요점정리, bullet points, list, 목록
   - "numbered_list": 순서대로, numbered, step by step
   - "table": 표로, table, comparison, 비교
   - "prose": 문단으로, paragraph form
   - "detailed_prose": 상세히, in detail, comprehensive
   - "brief": 간략히, briefly, 짧게
   - "auto": No specific format requested

3. FOCUS AREAS:
   - Extract specific topics, keywords, or sections mentioned
   - Examples: "API 부분만", "security features", "설치 방법"

4. LANGUAGE:
   - "ko": Korean request
   - "en": English request
   - "auto": Cannot determine

Respond with JSON:
{
  "targetLength": { "value": number|null, "unit": "characters"|"words"|null, "constraint": "minimum"|"maximum"|"approximate"|null },
  "format": "bullet_points"|"numbered_list"|"table"|"prose"|"detailed_prose"|"brief"|"auto",
  "focusAreas": ["topic1", "topic2"],
  "language": "ko"|"en"|"auto"
}`;

/**
 * Map 단계 요약 프롬프트 (부분 요약)
 */
const MAP_SUMMARY_PROMPT = `Summarize the following document segment for a multi-document summary.

DOCUMENT SOURCE: {source}

CONTENT:
{content}

REQUIREMENTS:
- Target Format: {format}
- Focus Areas: {focusAreas}
- Language: {language}

This is part {partNumber} of {totalParts} in a multi-document summary.

INSTRUCTIONS:
1. Extract key information and main points
2. Keep the summary focused and factual
3. Note important details that should be preserved in final summary
4. Maintain consistent terminology
5. Mark source references for later citation

Generate a partial summary (aim for 200-400 words):`;

/**
 * Reduce 단계 요약 프롬프트 (최종 병합)
 */
const REDUCE_SUMMARY_PROMPT = `Combine the following partial summaries into a comprehensive final summary.

USER'S ORIGINAL REQUEST: {originalRequest}

PARTIAL SUMMARIES:
{partialSummaries}

REQUIREMENTS:
- Target Length: {targetLengthSpec}
- Output Format: {formatSpec}
- Focus Areas: {focusAreas}
- Language: {language}

{lengthConstraint}

FORMAT GUIDELINES:
{formatGuidelines}

INSTRUCTIONS:
1. Synthesize all partial summaries into a coherent whole
2. Remove redundancy across summaries while preserving unique information
3. Ensure the final output matches the requested format
4. Respect the target length constraint (CRITICAL)
5. Organize by topic/theme, not by source document
6. Include source references in format: [Source: filename.md] - use ONLY filename, never full paths

Generate the final summary:`;

/**
 * 향상된 요약 생성 프롬프트 (동적 요구사항 지원)
 */
const SUMMARY_PROMPT_V2 = `Generate a summary based on the provided documents.

CONTEXT DOCUMENTS:
{context}

USER'S REQUEST: {question}

SUMMARIZATION REQUIREMENTS:
- Target Length: {targetLengthSpec}
- Output Format: {formatSpec}
- Focus Areas: {focusAreas}

{lengthConstraint}

FORMAT GUIDELINES:
{formatGuidelines}

INSTRUCTIONS:
1. Organize information logically
2. Match the requested format exactly
3. Include source references: [Source: filename.md] - use ONLY filename, never full paths
4. Focus on the specified areas if provided
5. RESPECT THE LENGTH CONSTRAINT (CRITICAL)

LANGUAGE: {language}

Generate your summary:`;

/**
 * === Step 19: Deep Document Reading for Thinking Mode ===
 * 답변이 부족할 때 전체 문서를 섹션별로 읽어 포괄적 답변 생성
 */

/**
 * 답변 충분성 평가 프롬프트
 * 생성된 답변이 사용자 질문을 충족하는지 평가
 */
const EVALUATE_SUFFICIENCY_PROMPT = `You are evaluating whether an AI response adequately answers the user's question.

USER'S QUESTION: {question}

GENERATED RESPONSE: {response}

EVALUATE the response for:
1. Does it directly answer what the user asked?
2. If the user asked for code/examples, does the response provide them?
3. Is the response specific or just general/vague?
4. Does it say "I don't have information" or similar?

Respond with JSON:
{
  "isSufficient": true/false,
  "reason": "brief explanation",
  "missingAspects": ["list of what's missing"],
  "confidence": 0.0-1.0
}`;

/**
 * 섹션별 문서 분석 프롬프트
 * 전체 문서를 읽고 사용자 질문에 답할 수 있는 내용 추출
 */
const DEEP_READ_SECTION_PROMPT = `You are analyzing a document section to find information relevant to the user's question.

USER'S QUESTION: {question}

WHAT WE'RE LOOKING FOR: {missingAspects}

DOCUMENT SECTION ({sectionNumber}/{totalSections}):
Source: {source}
---
{content}
---

INSTRUCTIONS:
1. Extract ALL relevant information from this section that helps answer the question
2. If this section contains code examples, include them EXACTLY as written
3. If this section contains API details, configuration, or technical specs, extract them
4. Note any important context or prerequisites mentioned

Respond with JSON:
{
  "hasRelevantContent": true/false,
  "extractedContent": "relevant content from this section (include code verbatim)",
  "codeExamples": ["any code snippets found"],
  "keyPoints": ["important points extracted"]
}`;

/**
 * 최종 Deep Read 답변 생성 프롬프트
 * 추출된 모든 섹션 정보를 종합하여 최종 답변 생성
 */
const DEEP_READ_SYNTHESIZE_PROMPT = `Generate a comprehensive answer based on deep document analysis.

USER'S ORIGINAL QUESTION: {question}

EXTRACTED INFORMATION FROM DOCUMENT ANALYSIS:
{extractedInfo}

DOCUMENT SOURCE: {source}

INSTRUCTIONS:
1. Synthesize all extracted information into a coherent, complete answer
2. If code examples were found, include them with proper formatting
3. Organize the response logically
4. Cite the source document using ONLY filename (e.g., [Source: README.md]), never full paths
5. If some aspects couldn't be found even after deep reading, acknowledge it

CRITICAL:
- Only use information that was extracted from the document
- Do NOT invent or assume information not in the extracted content
- If no code examples were found in the document, explicitly state this

LANGUAGE: Match the language of the user's question.

Generate your comprehensive response:`;

/**
 * === Step 18: Query Contextualization Prompt ===
 * 대화 맥락을 기반으로 follow-up 질문을 독립적 질문으로 재작성
 */
const CONTEXTUALIZE_PROMPT = `Given the following conversation history and a follow-up question,
rewrite the follow-up question to be a standalone question that includes all necessary context.

CONVERSATION HISTORY:
{history}

FOLLOW-UP QUESTION: {question}

INSTRUCTIONS:
1. Identify what the follow-up question is referring to from the history
2. Rewrite the question to include the specific topic/subject from context
3. Keep the rewritten question natural and concise
4. Preserve the original language (Korean/English)
5. If the question is already standalone, return it unchanged

EXAMPLES:
- History: "User: AnnotaQL에 대해 알려줘" → "Assistant: AnnotaQL은..."
  Follow-up: "개발 편의성은 어때?"
  Rewritten: "AnnotaQL의 개발 편의성은 어떤가요?"

- History: "User: How does authentication work?" → "Assistant: Authentication uses JWT..."
  Follow-up: "What about expiration?"
  Rewritten: "What is the expiration policy for JWT authentication tokens?"

Provide ONLY the rewritten question, nothing else:`;

module.exports = {
  SYSTEM_PROMPT,
  CLASSIFY_PROMPT,
  GENERATE_PROMPT,
  GENERATE_NO_CONTEXT_PROMPT,
  CHITCHAT_PROMPT,
  SUMMARY_PROMPT,
  SUMMARIZE_CONVERSATION_PROMPT,
  GRADE_PROMPT,
  REWRITE_PROMPT,
  LOW_RELEVANCE_PROMPT,
  NO_CONTEXT_PROMPT,
  EVALUATE_ANSWER_PROMPT,
  FAST_GENERATE_PROMPT,
  // Step 17: Multi-Document Summarization
  ANALYZE_REQUEST_PROMPT,
  MAP_SUMMARY_PROMPT,
  REDUCE_SUMMARY_PROMPT,
  SUMMARY_PROMPT_V2,
  // Step 18: Query Contextualization
  CONTEXTUALIZE_PROMPT,
  // Step 19: Deep Document Reading (Thinking Mode)
  EVALUATE_SUFFICIENCY_PROMPT,
  DEEP_READ_SECTION_PROMPT,
  DEEP_READ_SYNTHESIZE_PROMPT
};
