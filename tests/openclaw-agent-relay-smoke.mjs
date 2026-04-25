const BASE_URL = process.env.AGENT_RELAY_URL || 'http://127.0.0.1:3100';
const AGENT_ID = process.env.AGENT_ID || 'openclaw-lobster-local-test';

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'x-agent-id': AGENT_ID,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: response.status, data };
}

async function main() {
  const steps = [];
  steps.push(['health', await request('/agent/v1/health')]);
  steps.push(['capabilities', await request('/agent/v1/models/capabilities')]);
  steps.push(['balance.before', await request('/agent/v1/balance')]);
  steps.push(['recommend.coding', await request('/agent/v1/recommend', {
    method: 'POST',
    body: JSON.stringify({ taskType: 'coding', budgetTier: 'balanced', client: 'openclaw' }),
  })]);
  steps.push(['optimize.before', await request('/agent/v1/optimize', {
    method: 'POST',
    body: JSON.stringify({ estimatedCostUsd: 2.8, requestedTokens: 90000, client: 'openclaw' }),
  })]);
  steps.push(['redeem', await request('/agent/v1/refuel/redeem', {
    method: 'POST',
    body: JSON.stringify({ code: 'OPENCLAW-TEST-10', client: 'openclaw' }),
  })]);
  steps.push(['balance.after', await request('/agent/v1/balance')]);
  steps.push(['optimize.after', await request('/agent/v1/optimize', {
    method: 'POST',
    body: JSON.stringify({ estimatedCostUsd: 2.8, requestedTokens: 90000, client: 'openclaw' }),
  })]);

  for (const [name, result] of steps) {
    console.log(`\n--- ${name} [${result.status}]`);
    console.log(JSON.stringify(result.data, null, 2));
    if (result.status >= 400 || result.data.success === false) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
