/**
 * Phase 8: Chatbot UI Tests
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Test utilities
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

// ============================================
// Test Files Exist
// ============================================
console.log('\n=== Phase 8: Chatbot UI Tests ===\n');

console.log('1. File Existence Checks');

const projectRoot = path.join(__dirname, '../..');

test('chatbot.ejs template should exist', () => {
  const filePath = path.join(projectRoot, 'src/views/chatbot.ejs');
  assert(fs.existsSync(filePath), 'chatbot.ejs file should exist');
});

test('chatbot.js client script should exist', () => {
  const filePath = path.join(projectRoot, 'public/js/chatbot.js');
  assert(fs.existsSync(filePath), 'chatbot.js file should exist');
});

test('chatbot.css stylesheet should exist', () => {
  const filePath = path.join(projectRoot, 'public/css/chatbot.css');
  assert(fs.existsSync(filePath), 'chatbot.css file should exist');
});

// ============================================
// Test EJS Template Content
// ============================================
console.log('\n2. EJS Template Structure');

const ejsContent = fs.readFileSync(
  path.join(projectRoot, 'src/views/chatbot.ejs'),
  'utf-8'
);

test('EJS should have DOCTYPE declaration', () => {
  assert(ejsContent.includes('<!DOCTYPE html>'), 'Should have DOCTYPE');
});

test('EJS should have chatbot container', () => {
  assert(ejsContent.includes('chatbot-container'), 'Should have chatbot container');
});

test('EJS should have messages container', () => {
  assert(ejsContent.includes('messagesContainer'), 'Should have messages container');
});

test('EJS should have chat form', () => {
  assert(ejsContent.includes('chatForm'), 'Should have chat form');
});

test('EJS should have message input', () => {
  assert(ejsContent.includes('messageInput'), 'Should have message input');
});

test('EJS should have send button', () => {
  assert(ejsContent.includes('sendBtn'), 'Should have send button');
});

test('EJS should have new session button', () => {
  assert(ejsContent.includes('newSessionBtn'), 'Should have new session button');
});

test('EJS should have thinking mode toggle', () => {
  assert(ejsContent.includes('thinkingMode'), 'Should have thinking mode toggle');
});

test('EJS should have workflow indicator', () => {
  assert(ejsContent.includes('workflowIndicator'), 'Should have workflow indicator');
});

test('EJS should have thinking panel', () => {
  assert(ejsContent.includes('thinkingPanel'), 'Should have thinking panel');
});

test('EJS should include marked.js', () => {
  assert(ejsContent.includes('marked'), 'Should include marked.js');
});

test('EJS should include DOMPurify', () => {
  assert(ejsContent.includes('DOMPurify') || ejsContent.includes('purify'), 'Should include DOMPurify');
});

test('EJS should include highlight.js', () => {
  assert(ejsContent.includes('highlight'), 'Should include highlight.js');
});

test('EJS should include chatbot.css', () => {
  assert(ejsContent.includes('chatbot.css'), 'Should link chatbot.css');
});

test('EJS should include chatbot.js', () => {
  assert(ejsContent.includes('chatbot.js'), 'Should include chatbot.js');
});

// ============================================
// Test JavaScript Client Content
// ============================================
console.log('\n3. JavaScript Client Structure');

const jsContent = fs.readFileSync(
  path.join(projectRoot, 'public/js/chatbot.js'),
  'utf-8'
);

test('JS should have CONFIG object', () => {
  assert(jsContent.includes('const CONFIG'), 'Should have CONFIG object');
});

test('JS should have API_BASE config', () => {
  assert(jsContent.includes('API_BASE'), 'Should have API_BASE');
});

test('JS should have state object', () => {
  assert(jsContent.includes('const state'), 'Should have state object');
});

test('JS state should track threadId', () => {
  assert(jsContent.includes('threadId'), 'State should have threadId');
});

test('JS state should track isProcessing', () => {
  assert(jsContent.includes('isProcessing'), 'State should have isProcessing');
});

test('JS state should track thinkingMode', () => {
  assert(jsContent.includes('thinkingMode'), 'State should have thinkingMode');
});

test('JS should have elements object', () => {
  assert(jsContent.includes('const elements'), 'Should have elements object');
});

test('JS should have renderer object', () => {
  assert(jsContent.includes('const renderer'), 'Should have renderer object');
});

test('JS renderer should use marked', () => {
  assert(jsContent.includes('marked.parse') || jsContent.includes('marked.setOptions'), 'Renderer should use marked');
});

test('JS renderer should use DOMPurify', () => {
  assert(jsContent.includes('DOMPurify.sanitize'), 'Renderer should use DOMPurify');
});

test('JS should have messageUI object', () => {
  assert(jsContent.includes('const messageUI') || jsContent.includes('messageUI ='), 'Should have messageUI object');
});

test('JS messageUI should have addUserMessage', () => {
  assert(jsContent.includes('addUserMessage'), 'messageUI should have addUserMessage');
});

test('JS messageUI should have createBotMessage', () => {
  assert(jsContent.includes('createBotMessage'), 'messageUI should have createBotMessage');
});

test('JS messageUI should have updateBotMessage', () => {
  assert(jsContent.includes('updateBotMessage'), 'messageUI should have updateBotMessage');
});

test('JS messageUI should have addSources', () => {
  assert(jsContent.includes('addSources'), 'messageUI should have addSources');
});

test('JS messageUI should have addErrorMessage', () => {
  assert(jsContent.includes('addErrorMessage'), 'messageUI should have addErrorMessage');
});

test('JS should have workflowUI object', () => {
  assert(jsContent.includes('const workflowUI') || jsContent.includes('workflowUI ='), 'Should have workflowUI object');
});

test('JS workflowUI should have show/hide methods', () => {
  assert(jsContent.includes('workflowUI') && jsContent.includes('.show') && jsContent.includes('.hide'),
    'workflowUI should have show/hide');
});

test('JS should have thinkingUI object', () => {
  assert(jsContent.includes('const thinkingUI') || jsContent.includes('thinkingUI ='), 'Should have thinkingUI object');
});

test('JS should have api object', () => {
  assert(jsContent.includes('const api') || jsContent.includes('api ='), 'Should have api object');
});

test('JS api should have createSession method', () => {
  assert(jsContent.includes('createSession'), 'api should have createSession');
});

test('JS api should have sendMessage method', () => {
  assert(jsContent.includes('sendMessage'), 'api should have sendMessage');
});

test('JS should handle SSE events', () => {
  assert(jsContent.includes('event:') || jsContent.includes('EventSource') || jsContent.includes('text/event-stream'),
    'Should handle SSE events');
});

test('JS should handle SSE step event', () => {
  assert(jsContent.includes("'step'") || jsContent.includes('"step"'), 'Should handle step event');
});

test('JS should handle SSE retrieval event', () => {
  assert(jsContent.includes("'retrieval'") || jsContent.includes('"retrieval"'), 'Should handle retrieval event');
});

test('JS should handle SSE thinking event', () => {
  assert(jsContent.includes("'thinking'") || jsContent.includes('"thinking"'), 'Should handle thinking event');
});

test('JS should handle SSE token event', () => {
  assert(jsContent.includes("'token'") || jsContent.includes('"token"'), 'Should handle token event');
});

test('JS should handle SSE done event', () => {
  assert(jsContent.includes("'done'") || jsContent.includes('"done"'), 'Should handle done event');
});

test('JS should handle SSE error event', () => {
  assert(jsContent.includes("'error'") || jsContent.includes('"error"'), 'Should handle error event');
});

test('JS should have chat controller', () => {
  assert(jsContent.includes('const chat') || jsContent.includes('chat ='), 'Should have chat controller');
});

test('JS chat should have send method', () => {
  assert(jsContent.includes('chat.send') || jsContent.includes('send('), 'chat should have send method');
});

test('JS chat should have newSession method', () => {
  assert(jsContent.includes('newSession'), 'chat should have newSession method');
});

test('JS should setup event handlers', () => {
  assert(jsContent.includes('setupEventHandlers') || jsContent.includes('addEventListener'),
    'Should setup event handlers');
});

test('JS should handle form submit', () => {
  assert(jsContent.includes('submit'), 'Should handle form submit');
});

test('JS should handle Enter key', () => {
  assert(jsContent.includes('Enter'), 'Should handle Enter key');
});

test('JS should have init function', () => {
  assert(jsContent.includes('function init') || jsContent.includes('init()'), 'Should have init function');
});

test('JS should save thinking mode preference', () => {
  assert(jsContent.includes('localStorage'), 'Should use localStorage for preferences');
});

// ============================================
// Test CSS Stylesheet Content
// ============================================
console.log('\n4. CSS Stylesheet Structure');

const cssContent = fs.readFileSync(
  path.join(projectRoot, 'public/css/chatbot.css'),
  'utf-8'
);

test('CSS should have root variables', () => {
  assert(cssContent.includes(':root'), 'Should have :root for CSS variables');
});

test('CSS should have chatbot-container styles', () => {
  assert(cssContent.includes('.chatbot-container'), 'Should have chatbot-container styles');
});

test('CSS should have chatbot-header styles', () => {
  assert(cssContent.includes('.chatbot-header'), 'Should have chatbot-header styles');
});

test('CSS should have chatbot-messages styles', () => {
  assert(cssContent.includes('.chatbot-messages'), 'Should have chatbot-messages styles');
});

test('CSS should have message styles', () => {
  assert(cssContent.includes('.message'), 'Should have message styles');
});

test('CSS should have user-message styles', () => {
  assert(cssContent.includes('.user-message'), 'Should have user-message styles');
});

test('CSS should have bot-message styles', () => {
  assert(cssContent.includes('.bot-message'), 'Should have bot-message styles');
});

test('CSS should have error-message styles', () => {
  assert(cssContent.includes('.error-message'), 'Should have error-message styles');
});

test('CSS should have message-avatar styles', () => {
  assert(cssContent.includes('.message-avatar'), 'Should have message-avatar styles');
});

test('CSS should have message-content styles', () => {
  assert(cssContent.includes('.message-content'), 'Should have message-content styles');
});

test('CSS should have workflow-indicator styles', () => {
  assert(cssContent.includes('.workflow-indicator'), 'Should have workflow-indicator styles');
});

test('CSS should have thinking-panel styles', () => {
  assert(cssContent.includes('.thinking-panel'), 'Should have thinking-panel styles');
});

test('CSS should have thinking-toggle styles', () => {
  assert(cssContent.includes('.thinking-toggle'), 'Should have thinking-toggle styles');
});

test('CSS should have chatbot-input styles', () => {
  assert(cssContent.includes('.chatbot-input'), 'Should have chatbot-input styles');
});

test('CSS should have input-form styles', () => {
  assert(cssContent.includes('.input-form'), 'Should have input-form styles');
});

test('CSS should have btn-send styles', () => {
  assert(cssContent.includes('.btn-send'), 'Should have btn-send styles');
});

test('CSS should have streaming animation', () => {
  assert(cssContent.includes('.streaming') || cssContent.includes('@keyframes'),
    'Should have streaming animation');
});

test('CSS should have spinner animation', () => {
  assert(cssContent.includes('.spinner') || cssContent.includes('spin'),
    'Should have spinner animation');
});

test('CSS should have responsive styles', () => {
  assert(cssContent.includes('@media'), 'Should have responsive styles');
});

test('CSS should have sources styles', () => {
  assert(cssContent.includes('.sources') || cssContent.includes('.message-sources'),
    'Should have sources styles');
});

test('CSS should have welcome-message styles', () => {
  assert(cssContent.includes('.welcome-message'), 'Should have welcome-message styles');
});

// ============================================
// Test App.js Integration
// ============================================
console.log('\n5. App.js Integration');

const appContent = fs.readFileSync(
  path.join(projectRoot, 'src/app.js'),
  'utf-8'
);

test('App should import chatbot routes', () => {
  assert(appContent.includes("require('./routes/chatbot')"), 'Should import chatbot routes');
});

test('App should mount chatbot API routes', () => {
  assert(appContent.includes("/api/chatbot"), 'Should mount chatbot API routes');
});

test('App should have chatbot page route', () => {
  assert(appContent.includes("'/chatbot'") || appContent.includes('"/chatbot"'),
    'Should have chatbot page route');
});

test('App should render chatbot view', () => {
  assert(appContent.includes("render('chatbot'") || appContent.includes('render("chatbot"'),
    'Should render chatbot view');
});

// ============================================
// Test Controller Exports
// ============================================
console.log('\n6. Controller Exports');

const controller = require('../../src/controllers/chatbot-controller');

test('Controller should export chat function', () => {
  assert(typeof controller.chat === 'function', 'chat should be a function');
});

test('Controller should export getHistory function', () => {
  assert(typeof controller.getHistory === 'function', 'getHistory should be a function');
});

test('Controller should export deleteHistory function', () => {
  assert(typeof controller.deleteHistory === 'function', 'deleteHistory should be a function');
});

test('Controller should export getStatus function', () => {
  assert(typeof controller.getStatus === 'function', 'getStatus should be a function');
});

test('Controller should export createSession function', () => {
  assert(typeof controller.createSession === 'function', 'createSession should be a function');
});

test('Controller should export sendSSE function', () => {
  assert(typeof controller.sendSSE === 'function', 'sendSSE should be a function');
});

test('Controller should export setupSSEHeaders function', () => {
  assert(typeof controller.setupSSEHeaders === 'function', 'setupSSEHeaders should be a function');
});

// ============================================
// Test Routes
// ============================================
console.log('\n7. Routes Configuration');

const routes = require('../../src/routes/chatbot');

test('Routes should be an Express router', () => {
  assert(typeof routes === 'function', 'Routes should be middleware function');
});

test('Routes should have stack', () => {
  assert(routes.stack && routes.stack.length > 0, 'Routes should have registered endpoints');
});

// ============================================
// Summary
// ============================================
console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
