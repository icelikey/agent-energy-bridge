#!/usr/bin/env node
// NewAPI 端点探测脚本 — 在真实 new-api 实例上运行，输出原始响应格式
// 用法: NEWAPI_BASE_URL=https://xxx NEWAPI_API_KEY=sk-xxx node scripts/newapi-discovery.js

const baseUrl = process.env.NEWAPI_BASE_URL;
const apiKey = process.env.NEWAPI_API_KEY;

if (!baseUrl) {
  console.error('错误: 请设置环境变量 NEWAPI_BASE_URL');
  console.error('示例: NEWAPI_BASE_URL=https://your-newapi.example.com NEWAPI_API_KEY=sk-xxx node scripts/newapi-discovery.js');
  process.exit(1);
}

async function request(method, path, body) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
  };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  console.log(`\n========== ${method} ${path} ==========`);
  console.log('Request URL :', url);
  console.log('Headers     :', JSON.stringify(headers, null, 2));
  if (body) console.log('Body        :', JSON.stringify(body, null, 2));

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { _rawText: text };
    }

    console.log('Status      :', response.status, response.statusText);
    console.log('Response    :', JSON.stringify(data, null, 2));
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.log('Error       :', error.message);
    return { ok: false, error: error.message };
  }
}

async function main() {
  console.log('NewAPI 端点探测开始');
  console.log('Base URL    :', baseUrl);
  console.log('API Key     :', apiKey ? `${apiKey.slice(0, 8)}...` : '(未提供)');

  // 1. 用户信息/余额
  await request('GET', '/api/user/self');

  // 2. 用量信息（尝试多个已知路径）
  await request('GET', '/api/usage/token');
  await request('GET', '/api/user/usage');
  await request('GET', '/api/usage');

  // 3. 模型列表
  await request('GET', '/v1/models');

  // 4. 充值接口探测（不实际执行，仅探测端点存在性）
  await request('GET', '/api/topup');

  // 5. 健康检查
  await request('GET', '/api/status');

  console.log('\n========== 探测完成 ==========');
  console.log('请将上方完整输出复制给开发者，用于修正适配器字段映射。');
}

main().catch(console.error);
