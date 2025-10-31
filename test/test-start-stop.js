// Simple test: start and stop the server via app.start/app.stop
const app = require('../src/app');

(async function main() {
  console.log('Starting server...');
  const res = await app.start();
  console.log('Start result:', res);
  if (!res.success) {
    console.error('Start failed');
    process.exit(1);
  }

  // Wait a moment to let server fully settle
  await new Promise((r) => setTimeout(r, 1500));

  console.log('Stopping server...');
  const stopRes = await app.stop();
  console.log('Stop result:', stopRes);
  if (!stopRes.success) {
    console.error('Stop failed');
    process.exit(2);
  }

  console.log('Start/Stop test passed');
  process.exit(0);
})();
