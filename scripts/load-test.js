#!/usr/bin/env node
/**
 * Simple load test script for PixelAgent Hub API.
 * Usage: node scripts/load-test.js [--concurrency N] [--count N] [--endpoint URL]
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3100';
const CONCURRENCY = parseInt(process.env.TEST_CONCURRENCY || '5', 10);
const TOTAL_REQUESTS = parseInt(process.env.TEST_COUNT || '20', 10);
const MODE = process.env.TEST_MODE || 'pipeline';

async function sendRequest(id) {
  const start = Date.now();
  try {
    const resp = await fetch(`${BASE_URL}/api/run/${MODE}?async=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': `load-${id}`,
      },
      body: JSON.stringify({ description: `Load test request ${id}` }),
    });
    const body = await resp.json();
    const duration = Date.now() - start;
    return { id, status: resp.status, duration, body };
  } catch (err) {
    const duration = Date.now() - start;
    return { id, status: 0, duration, error: err.message };
  }
}

async function main() {
  console.log(`Load test: ${TOTAL_REQUESTS} requests, ${CONCURRENCY} concurrent, mode=${MODE}`);
  console.log(`Target: ${BASE_URL}/api/run/${MODE}?async=1\n`);

  const results = [];
  let inFlight = 0;
  let completed = 0;
  const startTime = Date.now();

  for (let i = 1; i <= TOTAL_REQUESTS; i++) {
    while (inFlight >= CONCURRENCY) {
      await new Promise(r => setTimeout(r, 10));
    }
    inFlight++;
    sendRequest(i).then(result => {
      results.push(result);
      inFlight--;
      completed++;
      const status = result.status === 202 ? '✓' : '✗';
      console.log(`[${completed}/${TOTAL_REQUESTS}] ${status} req#${result.id} ${result.status} ${result.duration}ms`);
    });
  }

  // Wait for all to complete
  while (completed < TOTAL_REQUESTS) {
    await new Promise(r => setTimeout(r, 50));
  }

  const totalDuration = Date.now() - startTime;
  const successCount = results.filter(r => r.status === 202).length;
  const avgDuration = results.reduce((s, r) => s + r.duration, 0) / results.length;

  console.log(`\n--- Results ---`);
  console.log(`Total:     ${TOTAL_REQUESTS}`);
  console.log(`Accepted:  ${successCount}`);
  console.log(`Failed:    ${TOTAL_REQUESTS - successCount}`);
  console.log(`Total time: ${totalDuration}ms`);
  console.log(`Avg latency: ${avgDuration.toFixed(1)}ms`);
  console.log(`Throughput: ${(TOTAL_REQUESTS / (totalDuration / 1000)).toFixed(1)} req/s`);
}

main().catch(console.error);
