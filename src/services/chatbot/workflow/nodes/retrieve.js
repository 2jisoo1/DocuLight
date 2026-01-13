/**
 * Document Retrieval Node
 * @module services/chatbot/workflow/nodes/retrieve
 *
 * 벡터 스토어에서 관련 문서 검색
 */

/**
 * 문서 검색 노드
 * @param {Object} state - 워크플로우 상태
 * @param {Object} deps - 의존성
 * @param {Object} deps.retriever - VectorStore Retriever
 * @param {number} deps.k - 검색할 문서 수 (기본: 20)
 * @returns {Promise<Object>} 업데이트된 상태
 */
async function retrieveDocs(state, { retriever, k = 20 }) {
  const { messages } = state;

  if (!messages || messages.length === 0) {
    return {
      retrievedDocs: [],
      currentStep: "retrieveDocs",
      error: "No messages for retrieval",
    };
  }

  const lastMessage = messages[messages.length - 1];
  const query = typeof lastMessage === 'string'
    ? lastMessage
    : lastMessage.content;

  if (!query || query.trim().length === 0) {
    return {
      retrievedDocs: [],
      currentStep: "retrieveDocs",
      error: "Empty query",
    };
  }

  try {
    // Retriever 호출
    const documents = await retriever.invoke(query);

    // 결과 정리 (중복 제거, 소스 정보 보강)
    const uniqueDocs = deduplicateDocuments(documents);

    return {
      retrievedDocs: uniqueDocs,
      currentStep: "retrieveDocs",
    };
  } catch (error) {
    return {
      retrievedDocs: [],
      currentStep: "retrieveDocs",
      error: `Retrieval failed: ${error.message}`,
    };
  }
}

/**
 * 문서 중복 제거
 * 동일 소스의 중복 청크 제거
 * @private
 */
function deduplicateDocuments(documents) {
  const seen = new Set();
  const unique = [];

  for (const doc of documents) {
    // 내용 기반 중복 체크
    const contentHash = doc.pageContent.slice(0, 100);

    if (!seen.has(contentHash)) {
      seen.add(contentHash);
      unique.push(doc);
    }
  }

  return unique;
}

/**
 * 검색 결과 포맷팅
 * @param {Document[]} documents - 검색된 문서 배열
 * @returns {string} 포맷된 컨텍스트 문자열
 */
function formatRetrievedDocs(documents) {
  if (!documents || documents.length === 0) {
    return "";
  }

  return documents
    .map((doc, i) => {
      const source = doc.metadata?.source || doc.metadata?.filePath || "Unknown";
      return `[${i + 1}] Source: ${source}\n${doc.pageContent}`;
    })
    .join("\n\n---\n\n");
}

module.exports = { retrieveDocs, formatRetrievedDocs };
