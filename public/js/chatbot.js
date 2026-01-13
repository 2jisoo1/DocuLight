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
    API_BASE: '/api/chatbot',
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
    thinkingMode: true,  // Default: enabled
    eventSource: null,
    messageHistory: []
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
    thinkingModeToggle: document.getElementById('thinkingMode'),
    workflowIndicator: document.getElementById('workflowIndicator'),
    workflowStep: document.getElementById('workflowStep'),
    retrievalInfo: document.getElementById('retrievalInfo'),
    retrievalText: document.getElementById('retrievalText'),
    thinkingPanel: document.getElementById('thinkingPanel'),
    thinkingContent: document.getElementById('thinkingContent'),
    closeThinking: document.getElementById('closeThinking')
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
          // Ensure starts with /doc/
          return '/doc/' + docPath;
        }
      }

      // Fallback: use extracted relative path
      let docPath = relativePath.replace(/\.md$/i, '');
      return '/doc/' + docPath;
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
      messageEl.className = 'message bot-message streaming';
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

    updateBotMessage(messageEl, content, isStreaming = true) {
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
  // Thinking Panel UI
  // ============================================
  const thinkingUI = {
    show() {
      if (state.thinkingMode && elements.thinkingPanel) {
        elements.thinkingPanel.style.display = 'block';
      }
    },

    hide() {
      if (elements.thinkingPanel) {
        elements.thinkingPanel.style.display = 'none';
      }
      if (elements.thinkingContent) {
        elements.thinkingContent.innerHTML = '';
      }
    },

    addStep(phase, content) {
      // Skip if thinking panel not available (embedded mode)
      if (!elements.thinkingPanel || !elements.thinkingContent) return;

      // Show panel only when content arrives (not initially)
      if (state.thinkingMode && elements.thinkingPanel.style.display !== 'block') {
        elements.thinkingPanel.style.display = 'block';
      }

      const stepEl = document.createElement('div');
      stepEl.className = `thinking-step thinking-${phase}`;

      const phaseLabels = {
        analyze: '🔍 Analysis',
        plan: '📋 Plan',
        execute: '⚙️ Execution'
      };

      stepEl.innerHTML = `
        <div class="thinking-step-header">${phaseLabels[phase] || phase}</div>
        <div class="thinking-step-content">${renderer.render(content)}</div>
      `;

      elements.thinkingContent.appendChild(stepEl);
    }
  };

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

    async sendMessage(message, threadId, thinkingMode) {
      return new Promise((resolve, reject) => {
        const url = `${CONFIG.API_BASE}/chat`;
        const body = JSON.stringify({ message, threadId, thinkingMode });

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
            thinkingUI.hide();
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
          let botMessageEl = null;
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
                    onBotMessageCreate: () => {
                      if (!botMessageEl) {
                        botMessageEl = messageUI.createBotMessage();
                      }
                      return botMessageEl;
                    },
                    onContent: (content) => {
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
                  thinkingUI.hide();
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
      switch (type) {
        case 'step':
          workflowUI.updateStep(data.step, data.message);
          break;

        case 'retrieval':
          workflowUI.showRetrieval(data.count, data.sources);
          // Cache sources for link resolution in renderer
          renderer.setSources(data.sources || []);
          callbacks.onSources(data.sources || []);
          break;

        case 'thinking':
          thinkingUI.addStep(data.phase, data.content);
          break;

        case 'token':
          callbacks.onBotMessageCreate();
          callbacks.onContent(data.content);
          break;

        case 'done':
          workflowUI.hide();
          thinkingUI.hide();
          callbacks.onDone(data);
          break;

        case 'error':
          workflowUI.hide();
          thinkingUI.hide();
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

      // Add user message to UI
      messageUI.addUserMessage(message);

      // Show workflow indicator
      workflowUI.show();
      workflowUI.updateStep('start', 'Connecting...');

      // Note: Thinking panel will be shown only when thinking content arrives
      // (handled in thinkingUI.addStep)

      try {
        // Create session if needed
        if (!state.threadId) {
          const session = await api.createSession();
          state.threadId = session.threadId;
        }

        // Send message
        const result = await api.sendMessage(message, state.threadId, state.thinkingMode);

        // Update state
        state.threadId = result.threadId || state.threadId;

      } catch (error) {
        console.error('Chat error:', error);
        messageUI.addErrorMessage(error.message || 'Failed to get response');
        workflowUI.hide();
        thinkingUI.hide();
      } finally {
        state.isProcessing = false;
        this.updateUI(false);
      }
    },

    updateUI(isProcessing) {
      elements.sendBtn.disabled = isProcessing;
      elements.messageInput.disabled = isProcessing;

      if (isProcessing) {
        elements.sendBtn.classList.add('loading');
      } else {
        elements.sendBtn.classList.remove('loading');
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

      // Clear thinking panel
      if (elements.thinkingContent) {
        elements.thinkingContent.innerHTML = '';
      }
      thinkingUI.hide();

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

    // Thinking mode toggle
    elements.thinkingModeToggle.addEventListener('change', (e) => {
      state.thinkingMode = e.target.checked;
      document.body.classList.toggle('thinking-enabled', state.thinkingMode);
    });

    // Close thinking panel
    elements.closeThinking.addEventListener('click', () => {
      thinkingUI.hide();
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

    // Sync state with HTML checkbox (default: checked in HTML)
    // HTML has checked attribute, so read actual checkbox state
    state.thinkingMode = elements.thinkingModeToggle.checked;
    if (state.thinkingMode) {
      document.body.classList.add('thinking-enabled');
    }

    // Save preferences on change
    elements.thinkingModeToggle.addEventListener('change', () => {
      localStorage.setItem('chatbot_thinkingMode', state.thinkingMode);
    });

    console.log('DocLight Chatbot initialized');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
