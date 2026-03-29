// MCP Tools Integration Test
// Tests the two new MCP tools: DocuLight_get_config and DocuLight_search

const app = require('../src/app');
const http = require('http');

/**
 * Helper: Send JSON-RPC 2.0 request to MCP endpoint
 */
function sendMcpRequest(method, params = null) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1000),
      method,
      ...(params && { params })
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Test suite
 */
(async function main() {
  let serverStarted = false;

  try {
    // 1. Start server
    console.log('\n=== MCP Tools Test Suite ===\n');
    console.log('1. Starting server...');
    const startRes = await app.start();
    if (!startRes.success) {
      throw new Error('Failed to start server: ' + JSON.stringify(startRes));
    }
    serverStarted = true;
    console.log('   ✓ Server started\n');

    // Wait for server to settle
    await new Promise(r => setTimeout(r, 1000));

    // 2. Test tools/list
    console.log('2. Testing tools/list...');
    const listRes = await sendMcpRequest('tools/list');

    if (!listRes.result || !listRes.result.tools) {
      throw new Error('tools/list failed: ' + JSON.stringify(listRes));
    }

    const tools = listRes.result.tools;
    const toolNames = tools.map(t => t.name);

    // Dynamically discover tool names (prefix depends on config.ui.title)
    const configToolName = toolNames.find(n => n.endsWith('_get_config'));
    const searchToolName = toolNames.find(n => n.endsWith('_search') && !n.endsWith('_smart_search'));

    if (!configToolName) {
      throw new Error('*_get_config not found in tools list');
    }
    if (!searchToolName) {
      throw new Error('*_search not found in tools list');
    }

    console.log(`   ✓ Found ${tools.length} tools`);
    console.log(`   ✓ ${configToolName} registered`);
    console.log(`   ✓ ${searchToolName} registered\n`);

    // 3. Test *_get_config
    console.log(`3. Testing ${configToolName}...`);
    const configRes = await sendMcpRequest('tools/call', {
      name: configToolName,
      arguments: { section: 'all' }
    });

    if (configRes.error) {
      throw new Error(`${configToolName} failed: ` + JSON.stringify(configRes.error));
    }

    if (!configRes.result || !configRes.result.content) {
      throw new Error(`${configToolName} returned invalid result`);
    }

    const configText = configRes.result.content[0].text;

    // Verify sensitive values are masked
    if (!configText.includes('"apiKey": "***"')) {
      throw new Error('apiKey not masked in config response');
    }

    console.log('   ✓ Config retrieved successfully');
    console.log('   ✓ Sensitive values masked (apiKey)');

    // Check if section filtering works
    if (configText.includes('"docsRoot"') && configText.includes('"port"')) {
      console.log('   ✓ Full config returned for section=all\n');
    }

    // 4. Test *_search
    console.log(`4. Testing ${searchToolName}...`);
    const searchRes = await sendMcpRequest('tools/call', {
      name: searchToolName,
      arguments: { query: 'test', limit: 5 }
    });

    if (searchRes.error) {
      throw new Error(`${searchToolName} failed: ` + JSON.stringify(searchRes.error));
    }

    if (!searchRes.result || !searchRes.result.content) {
      throw new Error(`${searchToolName} returned invalid result`);
    }

    const searchText = searchRes.result.content[0].text;

    console.log('   ✓ Search executed successfully');

    if (searchText.includes('Search Results for "test"')) {
      console.log('   ✓ Search results formatted correctly');
    }

    if (searchText.includes('Statistics:')) {
      console.log('   ✓ Statistics included in response\n');
    }

    // 5. Test error handling - invalid query
    console.log('5. Testing error handling...');
    const errorRes = await sendMcpRequest('tools/call', {
      name: searchToolName,
      arguments: { query: 'x' }  // Too short (< 2 chars)
    });

    if (!errorRes.error) {
      throw new Error('Expected error for query too short, but got success');
    }

    console.log('   ✓ Query validation working (rejected query < 2 chars)');
    console.log('   ✓ Error handling working correctly\n');

    // All tests passed
    console.log('=== All MCP Tools Tests PASSED ✓ ===\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup
    if (serverStarted) {
      console.log('Stopping server...');
      await app.stop();
      console.log('Server stopped.\n');
    }
    process.exit(0);
  }
})();
