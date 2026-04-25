const BASE_URL = process.env.AGENT_RELAY_URL || 'http://127.0.0.1:3100';
const AGENT_ID = process.env.AGENT_ID || 'local-agent-energy-skill-test';

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
  const calls = [
    ['health', () => request('/agent/v1/health')],
    ['capabilities', () => request('/agent/v1/models/capabilities')],
    ['balance', () => request('/agent/v1/balance')],
    ['usage', () => request('/agent/v1/usage/summary')],
    ['recommend', () => request('/agent/v1/recommend', {
      method: 'POST',
      body: JSON.stringify({ taskType: 'coding', budgetTier: 'balanced', client: 'agent-energy-station-skill' }),
    })],
    ['optimize', () => request('/agent/v1/optimize', {
      method: 'POST',
      body: JSON.stringify({ estimatedCostUsd: 1.2, requestedTokens: 60000, client: 'agent-energy-station-skill' }),
    })],
  ];

  for (const [name, run] of calls) {
    const result = await run();
    console.log(`\n--- ${name} [${result.status}]`);
    console.log(JSON.stringify(result.data, null, 2));
    if (result.status >= 400 || result.data.success === false) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
