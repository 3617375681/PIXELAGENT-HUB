const baseUrl = process.env.LOAD_TEST_BASE_URL || 'http://localhost:3100';
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 5);
const total = Number(process.env.LOAD_TEST_TOTAL || 20);

async function runOne(i) {
  const res = await fetch(`${baseUrl}/api/run/parallel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `load-${Date.now()}-${i}`,
      description: `load test task ${i}`,
      agentIds: ['researcher', 'coder'],
    }),
  });
  return { ok: res.ok, status: res.status };
}

async function main() {
  const startedAt = Date.now();
  let inFlight = 0;
  let cursor = 0;
  let success = 0;
  let failed = 0;
  const statuses = {};

  await new Promise((resolve) => {
    const pump = () => {
      while (inFlight < concurrency && cursor < total) {
        const id = cursor++;
        inFlight++;
        runOne(id)
          .then((r) => {
            if (r.ok) success++;
            else failed++;
            statuses[r.status] = (statuses[r.status] || 0) + 1;
          })
          .catch(() => {
            failed++;
            statuses['network_error'] = (statuses['network_error'] || 0) + 1;
          })
          .finally(() => {
            inFlight--;
            if (cursor >= total && inFlight === 0) {
              resolve();
              return;
            }
            pump();
          });
      }
    };
    pump();
  });

  const elapsedMs = Date.now() - startedAt;
  console.log(JSON.stringify({
    baseUrl,
    total,
    concurrency,
    success,
    failed,
    elapsedMs,
    avgMsPerReq: Number((elapsedMs / Math.max(total, 1)).toFixed(2)),
    statuses,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
