// 管理员账号完整链路验证
const { NewAPIGatewayAdapter } = require('../src');

async function main() {
  console.log('=== 管理员账号完整链路验证 ===\n');

  const adapter = new NewAPIGatewayAdapter({
    baseUrl: process.env.NEWAPI_BASE_URL || 'http://localhost',
    username: process.env.NEWAPI_USERNAME || 'admin',
    password: process.env.NEWAPI_PASSWORD || '',
    userId: process.env.NEWAPI_USER_ID || '1',
  });

  // 1. 余额
  console.log('--- getBalance() ---');
  const balance = await adapter.getBalance();
  console.log('availableUsd:', balance.availableUsd);
  console.log('expected: ~200 (100000000 / 500000)');

  // 2. 用户信息
  console.log('\n--- getUserInfo() ---');
  const info = await adapter.getUserInfo();
  console.log('quota:', info.data?.quota);
  console.log('used_quota:', info.data?.used_quota);
  console.log('role:', info.data?.role);

  // 3. 用量（可能权限问题）
  console.log('\n--- getUsage() ---');
  try {
    const usage = await adapter.getUsage();
    console.log('dailySpentUsd:', usage.dailySpentUsd);
    console.log('hourlyTokensUsed:', usage.hourlyTokensUsed);
    console.log('raw:', JSON.stringify(usage.raw, null, 2));
  } catch (err) {
    console.log('getUsage failed:', err.message);
    if (err.body) console.log('body:', JSON.stringify(err.body, null, 2));
  }

  // 4. 状态
  console.log('\n--- getStatus() ---');
  try {
    const status = await adapter.request({ path: '/api/status' });
    console.log('quota_per_unit:', status.data?.quota_per_unit);
    console.log('usd_exchange_rate:', status.data?.usd_exchange_rate);
  } catch (err) {
    console.log('status failed:', err.message);
  }

  // 5. 内部状态
  console.log('\n--- Adapter State ---');
  console.log('sessionCookie set:', !!adapter._sessionCookie);
  console.log('quotaPerUnit:', adapter._statusCache?.quota_per_unit || 'not fetched');

  console.log('\n=== 验证完成 ===');
}

main().catch(console.error);
