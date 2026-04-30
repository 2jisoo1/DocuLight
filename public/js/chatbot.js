/**
 * DocLight Chatbot Client
 * Phase 8: 챗봇 UI 클라이언트 로직
 */

(function() {
  'use strict';

  // ============================================
  // Configuration
  // ============================================
  // Merge server config with defaults
  const serverConfig = window.CHATBOT_CONFIG || {};
  const CONFIG = {
    API_BASE: (window.BASE_PATH || '') + '/api/chatbot',
    MAX_MESSAGE_LENGTH: 4000,
    SCROLL_THRESHOLD: 100,
    RETRY_DELAY: 1000,
    MAX_RETRIES: 3,
    // Timeout settings from server (or defaults)
    TIMEOUT: serverConfig.timeout || 300000,  // 5분 기본값
    KEEP_ALIVE_INTERVAL: serverConfig.keepAliveInterval || 30000  // 30초 기본값
  };

  // ============================================
  // State
  // ============================================
  const state = {
    threadId: null,
    isProcessing: false,
    eventSource: null,
    messageHistory: [],
    // 현재 요청의 사용자 입력 언어(i18n 키 번역용). 'ko' | 'en' | ...
    currentLang: 'en'
  };

  // ============================================
  // i18n: 진행 단계 메시지 카탈로그
  // 서버는 i18nKey + vars만 전송, 클라가 사용자 언어로 번역
  // ============================================
  const i18n = {
    detect(text) {
      if (!text) return 'en';
      // Hangul block
      if (/[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/.test(text)) return 'ko';
      // Hiragana / Katakana
      if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
      // CJK Unified (assume Chinese if not preceded by kana)
      if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
      return 'en';
    },

    // {key: {ko, en, ja, zh}} — vars 보간은 {name}, {target}
    catalog: {
      understanding: {
        ko: '질문을 이해하고 있어요',
        en: 'Understanding your question',
        ja: '質問を理解しています',
        zh: '正在理解您的问题'
      },
      classifying: {
        ko: '의도를 파악하는 중이에요',
        en: 'Identifying intent',
        ja: '意図を把握しています',
        zh: '正在识别意图'
      },
      thinking_next: {
        ko: '다음 단계를 생각하고 있어요',
        en: 'Thinking about the next step',
        ja: '次のステップを考えています',
        zh: '正在思考下一步'
      },
      reading_results: {
        ko: '결과를 읽고 있어요',
        en: 'Reading the results',
        ja: '結果を読んでいます',
        zh: '正在阅读结果'
      },
      composing: {
        ko: '답변을 정리하고 있어요',
        en: 'Composing the answer',
        ja: '回答をまとめています',
        zh: '正在整理回答'
      },
      retrieval_found: {
        ko: '관련 문서 {count}개를 찾았어요',
        en: 'Found {count} relevant document(s)',
        ja: '関連文書を{count}件見つけました',
        zh: '找到 {count} 个相关文档'
      },
      'tool:search': {
        ko: '"{target}" 으로 문서를 검색하고 있어요',
        en: 'Searching documents for "{target}"',
        ja: '「{target}」で文書を検索しています',
        zh: '正在搜索 "{target}" 相关文档'
      },
      'tool:get_config': {
        ko: '서버 설정을 확인하고 있어요',
        en: 'Checking server configuration',
        ja: 'サーバー設定を確認しています',
        zh: '正在检查服务器配置'
      },
      'tool:smart_search': {
        ko: '"{target}" 을 깊이 있게 찾아보고 있어요',
        en: 'Searching deeply for "{target}"',
        ja: '「{target}」を詳しく探しています',
        zh: '正在深入搜索 "{target}"'
      },
      'tool:resolve_project': {
        ko: '"{target}" 프로젝트를 확인하고 있어요',
        en: 'Looking up project "{target}"',
        ja: 'プロジェクト「{target}」を確認しています',
        zh: '正在查找项目 "{target}"'
      },
      'tool:search_projects': {
        ko: '프로젝트를 찾고 있어요',
        en: 'Looking through projects',
        ja: 'プロジェクトを探しています',
        zh: '正在查找项目'
      },
      'tool:list_documents': {
        ko: '문서 목록을 살펴보고 있어요',
        en: 'Browsing the document list',
        ja: '文書リストを見ています',
        zh: '正在浏览文档列表'
      },
      'tool:list_full_tree': {
        ko: '문서 트리를 펼쳐보고 있어요',
        en: 'Looking at the document tree',
        ja: '文書ツリーを展開しています',
        zh: '正在查看文档树'
      },
      'tool:read_document': {
        ko: '"{target}" 문서를 읽고 있어요',
        en: 'Reading "{target}"',
        ja: '「{target}」を読んでいます',
        zh: '正在阅读 "{target}"'
      },
      'tool:summarize_document': {
        ko: '"{target}" 문서를 요약하고 있어요',
        en: 'Summarizing "{target}"',
        ja: '「{target}」を要約しています',
        zh: '正在总结 "{target}"'
      },
      'tool:query_document': {
        ko: '"{target}" 문서를 살펴보고 있어요',
        en: 'Examining "{target}"',
        ja: '「{target}」を確認しています',
        zh: '正在查看 "{target}"'
      },
      'tool:query_code_examples': {
        ko: '코드 예제를 찾고 있어요',
        en: 'Looking for code examples',
        ja: 'コード例を探しています',
        zh: '正在查找代码示例'
      },
      // 미등록 도구 fallback
      'tool:_generic': {
        ko: '"{name}" 도구를 사용 중이에요',
        en: 'Using "{name}"',
        ja: '「{name}」ツールを使用しています',
        zh: '正在使用 "{name}"'
      }
    },

    // 보간 결과는 plain text (escape 미수행). 출력 단계(setStatus)에서 escapeHtml로 단일 방어.
    // 누락 키는 placeholder를 빈 문자열로 대체하여 어색한 `{target}` 노출 방지.
    interpolate(template, vars) {
      if (!template) return '';
      return template.replace(/\{(\w+)\}/g, (m, k) => {
        const v = vars && vars[k];
        return v != null && String(v).length > 0 ? String(v) : '';
      });
    },

    translate(key, vars, lang) {
      const language = lang || state.currentLang || 'en';
      let entry = this.catalog[key];
      // tool:* 도구 키 매칭: MCP prefix(예: DOCU_LIGHT_smart_search)가 붙어 있을 수 있어
      // 카탈로그의 알려진 tool 키 끝과 endsWith 매칭 시도. 실패 시 generic fallback.
      if (!entry && key && key.indexOf('tool:') === 0) {
        const suffix = key.slice('tool:'.length);
        // 알려진 tool 키를 길이 내림차순으로 정렬 — `smart_search`가 `search`보다 우선 매칭되도록.
        // suffix === knownTail 또는 suffix endsWith ('_' + knownTail) 인 경우만 매칭 (segment 경계 보존).
        const known = Object.keys(this.catalog)
          .filter((k) => k.indexOf('tool:') === 0 && k !== 'tool:_generic')
          .sort((a, b) => b.length - a.length);
        const matched = known.find((k) => {
          const tail = k.slice('tool:'.length);
          return suffix === tail || suffix.endsWith('_' + tail);
        });
        entry = matched ? this.catalog[matched] : this.catalog['tool:_generic'];
      }
      if (!entry) return key;
      const tmpl = entry[language] || entry.en || Object.values(entry)[0];
      return this.interpolate(tmpl, vars);
    }
  };

  // ============================================
  // DOM Elements
  // ============================================
  const elements = {
    messagesContainer: document.getElementById('messagesContainer'),
    chatForm: document.getElementById('chatForm'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    newSessionBtn: document.getElementById('newSessionBtn'),
    workflowIndicator: document.getElementById('workflowIndicator'),
    workflowStep: document.getElementById('workflowStep'),
    retrievalInfo: document.getElementById('retrievalInfo'),
    retrievalText: document.getElementById('retrievalText')
  };

  // ============================================
  // Markdown Renderer
  // ============================================
  const renderer = {
    // Sources cache for linking (populated from retrieval event)
    _sourcesCache: [],

    init() {
      if (typeof marked !== 'undefined') {
        marked.setOptions({
          breaks: true,
          gfm: true
        });
      }
    },

    // Set sources from retrieval event for path resolution
    setSources(sources) {
      this._sourcesCache = sources || [];
    },

    render(text) {
      if (typeof marked === 'undefined') return this.escapeHtml(text);
      let html = marked.parse(text);
      html = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;
      // Convert [Source: ...] patterns to clickable links
      html = this.convertSourceLinks(html);
      return html;
    },

    // Convert [Source: file1.md, file2.md] to clickable links
    convertSourceLinks(html) {
      // Match [Source: file1.md, file2.md] or [Source: file1.md]
      return html.replace(/\[Source:\s*([^\]]+)\]/gi, (match, files) => {
        const fileList = files.split(',').map(f => f.trim());
        const links = fileList.map(file => {
          const cleanName = this.extractFileName(file);
          const docPath = this.resolveDocPath(file);
          if (docPath) {
            return `<a href="${docPath}" target="_blank" rel="noopener" class="source-link">${this.escapeHtml(cleanName)}</a>`;
          }
          return this.escapeHtml(cleanName);
        });
        return `<span class="source-reference">[Source: ${links.join(', ')}]</span>`;
      });
    },

    // Extract clean filename from full path (handles absolute paths)
    extractFileName(filePath) {
      // Normalize path separators
      const normalized = filePath.replace(/\\/g, '/');
      // Extract just the filename (last part of path)
      const parts = normalized.split('/');
      return parts[parts.length - 1] || filePath;
    },

    // Extract relative path from absolute path (e.g., "C:/Work/.../AnnotaQL/README.md" -> "AnnotaQL/README.md")
    extractRelativePath(filePath) {
      const normalized = filePath.replace(/\\/g, '/');
      // Check if it's an absolute path (contains drive letter or starts with /)
      if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith('/')) {
        // Try to find a known folder pattern (e.g., test-source/, docs/)
        const match = normalized.match(/(?:test-source|docs?|documents?)\/(.+)$/i);
        if (match) {
          return match[1];
        }
        // Fallback: extract last 2 path segments (folder/file.md)
        const parts = normalized.split('/').filter(p => p);
        if (parts.length >= 2) {
          return parts.slice(-2).join('/');
        }
      }
      return normalized;
    },

    // Resolve file name to full document path
    resolveDocPath(fileName) {
      // Extract relative path if absolute path given
      const relativePath = this.extractRelativePath(fileName);
      const normalizedName = relativePath.toLowerCase().replace(/\\/g, '/');

      for (const source of this._sourcesCache) {
        const normalizedSource = source.toLowerCase().replace(/\\/g, '/');
        if (normalizedSource.includes(normalizedName) ||
            normalizedSource.endsWith(normalizedName) ||
            normalizedName.includes(normalizedSource)) {
          // Source is already relative path from server
          let docPath = source.replace(/\\/g, '/');
          // Remove .md extension for clean URL
          docPath = docPath.replace(/\.md$/i, '');
          // Ensure starts with /doc/ (with basePath)
          return (window.BASE_PATH || '') + '/doc/' + docPath;
        }
      }

      // Fallback: use extracted relative path
      let docPath = relativePath.replace(/\.md$/i, '');
      return (window.BASE_PATH || '') + '/doc/' + docPath;
    },

    // Apply syntax highlighting to code blocks after DOM insertion
    highlightCode(container) {
      if (typeof hljs === 'undefined') return;
      container.querySelectorAll('pre code:not(.hljs)').forEach(block => {
        hljs.highlightElement(block);
      });
    },

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  };

  // ============================================
  // Message UI
  // ============================================
  const messageUI = {
    hideWelcome() {
      // Hide centered welcome message in embedded mode
      const welcomeEl = document.getElementById('chatbotWelcome');
      if (welcomeEl) {
        welcomeEl.style.display = 'none';
      }
      // Also hide traditional welcome message
      const welcomeMsg = document.querySelector('.welcome-message');
      if (welcomeMsg) {
        welcomeMsg.style.display = 'none';
      }
    },

    addUserMessage(text) {
      // Hide welcome message on first user input
      this.hideWelcome();

      const messageEl = document.createElement('div');
      messageEl.className = 'message user-message';
      messageEl.innerHTML = `
        <div class="message-content">
          <div class="message-text">${renderer.render(text)}</div>
          <div class="message-time">${this.formatTime(new Date())}</div>
        </div>
        <div class="message-avatar user-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
      `;
      elements.messagesContainer.appendChild(messageEl);
      this.scrollToBottom();
    },

    createBotMessage() {
      const messageEl = document.createElement('div');
      messageEl.className = 'message bot-message streaming pending-status';
      messageEl.innerHTML = `
        <div class="message-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="8" width="16" height="12" rx="2" ry="2"/>
            <circle cx="9" cy="13" r="1.5" fill="white"/>
            <circle cx="15" cy="13" r="1.5" fill="white"/>
            <rect x="8" y="16" width="8" height="2" rx="1" fill="white"/>
            <rect x="11" y="4" width="2" height="4"/>
            <circle cx="12" cy="3" r="1.5"/>
          </svg>
        </div>
        <div class="message-content">
          <div class="message-text"></div>
          <div class="message-sources" style="display: none;"></div>
          <div class="message-time"></div>
          <div class="message-actions" style="display: none;">
            <button class="copy-btn" title="Copy response">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          </div>
        </div>
      `;
      elements.messagesContainer.appendChild(messageEl);
      this.scrollToBottom();
      return messageEl;
    },

    setStatus(messageEl, text) {
      if (!messageEl) return;
      // 토큰 스트리밍이 시작되지 않은 경우에만 status 표시 (이미 본문이 들어왔으면 무시)
      if (!messageEl.classList.contains('pending-status')) return;
      const textEl = messageEl.querySelector('.message-text');
      if (!textEl) return;
      // SECURITY: text는 i18n template + vars 보간 결과이며 vars는 사용자/모델 입력에서 유래.
      // renderer.escapeHtml(div.textContent → div.innerHTML 패턴)이 유일한 XSS 방어선이다.
      // 절대 marked/마크다운 렌더로 교체하지 말 것 — 즉시 XSS 발생.
      textEl.innerHTML = `<span class="status-text">${renderer.escapeHtml(text)}<span class="status-dots"><span>.</span><span>.</span><span>.</span></span></span>`;
      this.scrollToBottom();
    },

    updateBotMessage(messageEl, content, isStreaming = true) {
      // 첫 토큰 도착 — status placeholder 제거
      if (messageEl.classList.contains('pending-status')) {
        messageEl.classList.remove('pending-status');
      }
      const textEl = messageEl.querySelector('.message-text');
      textEl.innerHTML = renderer.render(content);

      // Store raw markdown for copy functionality
      messageEl.dataset.rawContent = content;

      if (!isStreaming) {
        messageEl.classList.remove('streaming');
        messageEl.querySelector('.message-time').textContent = this.formatTime(new Date());

        // Apply syntax highlighting to code blocks
        renderer.highlightCode(textEl);

        // Show copy button and setup handler
        const actionsEl = messageEl.querySelector('.message-actions');
        if (actionsEl) {
          actionsEl.style.display = 'flex';
          const copyBtn = actionsEl.querySelector('.copy-btn');
          if (copyBtn && !copyBtn.dataset.initialized) {
            copyBtn.dataset.initialized = 'true';
            copyBtn.addEventListener('click', () => this.copyToClipboard(messageEl));
          }
        }
      }

      this.scrollToBottom();
    },

    async copyToClipboard(messageEl) {
      const rawContent = messageEl.dataset.rawContent || '';
      const copyBtn = messageEl.querySelector('.copy-btn');

      try {
        await navigator.clipboard.writeText(rawContent);

        // Show success feedback
        if (copyBtn) {
          const originalHtml = copyBtn.innerHTML;
          copyBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          `;
          copyBtn.classList.add('copied');

          setTimeout(() => {
            copyBtn.innerHTML = originalHtml;
            copyBtn.classList.remove('copied');
          }, 2000);
        }
      } catch (err) {
        console.error('Failed to copy:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = rawContent;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          if (copyBtn) {
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = `
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            `;
            copyBtn.classList.add('copied');
            setTimeout(() => {
              copyBtn.innerHTML = originalHtml;
              copyBtn.classList.remove('copied');
            }, 2000);
          }
        } catch (e) {
          console.error('Fallback copy failed:', e);
        }
        document.body.removeChild(textArea);
      }
    },

    addSources(messageEl, sources) {
      if (!sources || sources.length === 0) return;

      const sourcesEl = messageEl.querySelector('.message-sources');
      // Convert sources to clickable links
      const sourceLinks = sources.map(s => {
        const docPath = renderer.resolveDocPath(s);
        const displayName = s.replace(/\\/g, '/');
        return `<a href="${docPath}" target="_blank" rel="noopener" class="source-tag">${renderer.escapeHtml(displayName)}</a>`;
      }).join('');

      sourcesEl.innerHTML = `
        <div class="sources-header">📚 Sources:</div>
        <div class="sources-list">${sourceLinks}</div>
      `;
      sourcesEl.style.display = 'block';
    },

    addErrorMessage(error) {
      const messageEl = document.createElement('div');
      messageEl.className = 'message bot-message error-message';
      messageEl.innerHTML = `
        <div class="message-avatar error-avatar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
        </div>
        <div class="message-content">
          <div class="message-text error-text">
            <strong>Error:</strong> ${renderer.escapeHtml(error)}
          </div>
        </div>
      `;
      elements.messagesContainer.appendChild(messageEl);
      this.scrollToBottom();
    },

    scrollToBottom() {
      const container = elements.messagesContainer;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < CONFIG.SCROLL_THRESHOLD;
      if (isNearBottom || state.isProcessing) {
        container.scrollTop = container.scrollHeight;
      }
    },

    formatTime(date) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  // ============================================
  // Workflow UI
  // ============================================
  const workflowUI = {
    show() {
      elements.workflowIndicator.style.display = 'flex';
    },

    hide() {
      elements.workflowIndicator.style.display = 'none';
      elements.retrievalInfo.style.display = 'none';
    },

    updateStep(step, message) {
      elements.workflowStep.textContent = message || step;
    },

    showRetrieval(count, sources) {
      elements.retrievalInfo.style.display = 'flex';
      elements.retrievalText.textContent = `Found ${count} relevant document${count !== 1 ? 's' : ''}`;
      if (sources && sources.length > 0) {
        elements.retrievalText.textContent += `: ${sources.slice(0, 3).join(', ')}`;
      }
    }
  };

  // ============================================
  // ============================================
  // API Client
  // ============================================
  const api = {
    async createSession() {
      const response = await fetch(`${CONFIG.API_BASE}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to create session');
      return response.json();
    },

    async sendMessage(message, threadId, botMessageEl) {
      return new Promise((resolve, reject) => {
        const url = `${CONFIG.API_BASE}/chat`;
        const body = JSON.stringify({ message, threadId });

        // Close existing EventSource if any
        if (state.eventSource) {
          state.eventSource.close();
        }

        // Setup AbortController for timeout
        const abortController = new AbortController();
        let timeoutId = null;

        // Set timeout if configured (0 = no timeout)
        if (CONFIG.TIMEOUT > 0) {
          timeoutId = setTimeout(() => {
            abortController.abort();
            workflowUI.hide();
            reject(new Error(`Request timeout after ${CONFIG.TIMEOUT / 1000} seconds. Consider increasing chatbot.client.timeout in config.`));
          }, CONFIG.TIMEOUT);
        }

        // Create POST request with fetch for SSE
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: abortController.signal
        }).then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let fullContent = '';
          let sources = [];
          let resolved = false;

          const processEvents = (text) => {
            buffer += text;
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer

            let eventType = '';
            let eventData = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7);
              } else if (line.startsWith('data: ')) {
                eventData = line.slice(6);
                try {
                  const data = JSON.parse(eventData);
                  this.handleEvent(eventType, data, {
                    botMessageEl: () => botMessageEl,
                    onContent: (content) => {
                      // 빈 토큰은 무시 — pending-status 상태를 유지하여 빈 말풍선 깜빡임 방지
                      if (!content) return;
                      fullContent = content;
                      if (botMessageEl) {
                        messageUI.updateBotMessage(botMessageEl, fullContent, true);
                      }
                    },
                    onSources: (s) => { sources = s; },
                    onDone: (result) => {
                      resolved = true;
                      if (timeoutId) clearTimeout(timeoutId);
                      if (botMessageEl) {
                        messageUI.updateBotMessage(botMessageEl, fullContent, false);
                        messageUI.addSources(botMessageEl, sources);
                      }
                      resolve(result);
                    },
                    onError: (err) => {
                      if (timeoutId) clearTimeout(timeoutId);
                      reject(err);
                    }
                  });
                } catch (e) {
                  console.warn('Failed to parse event data:', eventData);
                }
              }
            }
          };

          const pump = () => {
            reader.read().then(({ done, value }) => {
              if (done) {
                // Process any remaining buffer
                if (buffer) processEvents('\n');

                // Clear timeout on stream end
                if (timeoutId) clearTimeout(timeoutId);

                // If no 'done' event was received, resolve with current state
                if (!resolved) {
                  resolved = true;
                  workflowUI.hide();
                  if (botMessageEl) {
                    messageUI.updateBotMessage(botMessageEl, fullContent, false);
                    messageUI.addSources(botMessageEl, sources);
                  }
                  resolve({ threadId: state.threadId });
                }
                return;
              }
              processEvents(decoder.decode(value, { stream: true }));
              pump();
            }).catch((err) => {
              if (timeoutId) clearTimeout(timeoutId);
              reject(err);
            });
          };

          pump();
        }).catch((err) => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(err);
        });
      });
    },

    handleEvent(type, data, callbacks) {
      const msgEl = callbacks.botMessageEl && callbacks.botMessageEl();
      switch (type) {
        case 'step': {
          // 서버가 i18nKey를 보내주면 클라가 사용자 언어로 번역, 없으면 영문 message fallback
          const key = data.i18nKey || data.step;
          const text = data.i18nKey
            ? i18n.translate(data.i18nKey, data.vars || {})
            : (data.message || data.step || '');
          if (msgEl) messageUI.setStatus(msgEl, text);
          // legacy DOM도 함께 갱신 (있으면)
          workflowUI.updateStep(data.step, text);
          break;
        }

        case 'retrieval':
          // Cache sources for link resolution in renderer
          renderer.setSources(data.sources || []);
          callbacks.onSources(data.sources || []);
          if (msgEl) {
            messageUI.setStatus(msgEl, i18n.translate('retrieval_found', { count: data.count }));
          }
          workflowUI.showRetrieval(data.count, data.sources);
          break;

        case 'token':
          callbacks.onContent(data.content);
          break;

        case 'done':
          workflowUI.hide();
          callbacks.onDone(data);
          break;

        case 'error':
          workflowUI.hide();
          callbacks.onError(new Error(data.message || 'Unknown error'));
          break;
      }
    },

    async getHistory(threadId) {
      const response = await fetch(`${CONFIG.API_BASE}/history/${threadId}`);
      if (!response.ok) return null;
      return response.json();
    },

    async deleteHistory(threadId) {
      const response = await fetch(`${CONFIG.API_BASE}/history/${threadId}`, {
        method: 'DELETE'
      });
      return response.ok;
    }
  };

  // ============================================
  // Chat Controller
  // ============================================
  const chat = {
    async send(message) {
      if (state.isProcessing || !message.trim()) return;

      state.isProcessing = true;
      this.updateUI(true);

      // 사용자 입력 언어를 감지하여 i18n 번역에 사용
      state.currentLang = i18n.detect(message);

      // Add user message to UI
      messageUI.addUserMessage(message);

      // 응답 말풍선을 즉시 생성하고 초기 상태("질문을 이해하고 있어요") 표시.
      // 첫 token 도착 시 status가 본문으로 자연스럽게 전환됨 (updateBotMessage가 pending-status 제거).
      const botMessageEl = messageUI.createBotMessage();
      messageUI.setStatus(botMessageEl, i18n.translate('understanding', {}));

      try {
        // Create session if needed
        if (!state.threadId) {
          const session = await api.createSession();
          state.threadId = session.threadId;
        }

        // Send message
        const result = await api.sendMessage(message, state.threadId, botMessageEl);

        // Update state
        state.threadId = result.threadId || state.threadId;

      } catch (error) {
        console.error('Chat error:', error);
        // 진행 상태만 표시되어 있는 비어있는 말풍선은 제거 (오류 메시지로 대체)
        if (botMessageEl && botMessageEl.classList.contains('pending-status')) {
          botMessageEl.remove();
        }
        messageUI.addErrorMessage(error.message || 'Failed to get response');
      } finally {
        // 정상/비정상 경로 모두에서 진행 상태만 남고 본문이 비어있는 말풍선이 남아있으면 정리.
        // (예: chitchat fast-path에서 LLM이 빈 문자열 반환, abort 등)
        if (botMessageEl && botMessageEl.classList.contains('pending-status')) {
          botMessageEl.remove();
        }
        state.isProcessing = false;
        this.updateUI(false);
      }
    },

    updateUI(isProcessing) {
      elements.sendBtn.disabled = isProcessing;
      elements.messageInput.disabled = isProcessing;

      // Store original icon HTML for restoration
      if (!state.originalSendIcon) {
        state.originalSendIcon = elements.sendBtn.innerHTML;
      }

      if (isProcessing) {
        elements.sendBtn.classList.add('loading');
        // Change to stop icon (black square)
        elements.sendBtn.innerHTML = '<span class="stop-icon"></span>';
      } else {
        elements.sendBtn.classList.remove('loading');
        // Restore original send icon
        elements.sendBtn.innerHTML = state.originalSendIcon;
        elements.messageInput.focus();
      }
    },

    newSession() {
      state.threadId = null;
      state.messageHistory = [];

      // Clear all messages
      const messages = elements.messagesContainer.querySelectorAll('.message');
      messages.forEach(m => m.remove());

      // Show welcome message again (embedded mode)
      const welcomeEl = document.getElementById('chatbotWelcome');
      if (welcomeEl) {
        welcomeEl.style.display = 'flex';
      }
      // Show traditional welcome message
      const welcomeMsg = document.querySelector('.welcome-message');
      if (welcomeMsg) {
        welcomeMsg.style.display = 'flex';
      }

      elements.messageInput.focus();
    }
  };

  // ============================================
  // Event Handlers
  // ============================================
  function setupEventHandlers() {
    // Form submit
    elements.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const message = elements.messageInput.value.trim();
      if (message) {
        chat.send(message);
        elements.messageInput.value = '';
        autoResizeTextarea();
      }
    });

    // Enter to send, Shift+Enter for new line
    elements.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        elements.chatForm.dispatchEvent(new Event('submit'));
      }
    });

    // Auto-resize textarea
    elements.messageInput.addEventListener('input', autoResizeTextarea);

    // New session button
    elements.newSessionBtn.addEventListener('click', () => {
      if (confirm('Start a new conversation? Current history will be cleared.')) {
        chat.newSession();
      }
    });
  }

  function autoResizeTextarea() {
    const textarea = elements.messageInput;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  }

  // ============================================
  // Initialize
  // ============================================
  function init() {
    renderer.init();
    setupEventHandlers();
    console.log('DocLight Chatbot initialized');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
