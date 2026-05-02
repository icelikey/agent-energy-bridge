// 真实 NewAPI 联调验证脚本
const { NewAPIGatewayAdapter } = require('../src');

async function main() {
  console.log('=== NewAPI 真实环境验证 ===\n');

  const adapter = new NewAPIGatewayAdapter({
    baseUrl: 'http://107.174.146.180',
    username: 'testuser123',
    password: 'testpass123',
    userId: '3',
  });

  // 1. 测试 getBalance
  console.log('--- 测试 getBalance() ---');
  try {
    const balance = await adapter.getBalance();
    console.log('成功! availableUsd:', balance.availableUsd);
    console.log('balanceUsd:', balance.balanceUsd);
  } catch (err) {
    console.log('失败:', err.message);
    if (err.body) console.log('响应:', JSON.stringify(err.body, null, 2));
  }

  // 2. 测试 getUsage
  console.log('\n--- 测试 getUsage() ---');
  try {
    const usage = await adapter.getUsage();
    console.log('dailySpentUsd:', usage.dailySpentUsd);
    console.log('hourlyTokensUsed:', usage.hourlyTokensUsed);
    console.log('原始数据:', JSON.stringify(usage.raw, null, 2));
  } catch (err) {
    console.log('失败:', err.message);
    if (err.body) console.log('响应:', JSON.stringify(err.body, null, 2));
  }

  // 3. 测试 getUserInfo
  console.log('\n--- 测试 getUserInfo() ---');
  try {
    const info = await adapter.getUserInfo();
    console.log('用户名:', info.data?.username);
    console.log('quota:', info.data?.quota);
    console.log('used_quota:', info.data?.used_quota);
  } catch (err) {
    console.log('失败:', err.message);
  }

  // 4. 测试 listModels (需要 sk-key，预期失败)
  console.log('\n--- 测试 listModels() ---');
  try {
    const models = await adapter.listModels();
    console.log('成功! 模型数:', models.data?.length || 'unknown');
  } catch (err) {
    console.log('失败:', err.message);
  }

  // 5. 检查 adapter 内部状态
  console.log('\n--- Adapter 内部状态 ---');
  console.log('sessionCookie 是否设置:', !!adapter._sessionCookie);
  console.log('quotaPerUnit:', adapter.quotaPerUnit);

  console.log('\n=== 验证完成 ===');
}

main().catch(console.error);
