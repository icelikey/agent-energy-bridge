// 调试 Node.js fetch 的 cookie 处理

async function test() {
  const baseUrl = 'http://107.174.146.180';

  // 1. 登录
  console.log('=== 1. 登录 ===');
  const loginRes = await fetch(`${baseUrl}/api/user/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'testuser123', password: 'testpass123' }),
  });
  console.log('Status:', loginRes.status);
  console.log('Headers:');
  for (const [k, v] of loginRes.headers) {
    console.log(`  ${k}: ${v}`);
  }
  const setCookie = loginRes.headers.get('set-cookie');
  console.log('set-cookie raw:', setCookie);
  const loginBody = await loginRes.json();
  console.log('Body:', JSON.stringify(loginBody, null, 2));

  // 2. 用保存的 cookie 访问 /api/user/self
  console.log('\n=== 2. 带 cookie 请求 ===');
  const cookie = setCookie;
  const selfRes = await fetch(`${baseUrl}/api/user/self`, {
    headers: {
      'new-api-user': '3',
      cookie,
    },
  });
  console.log('Status:', selfRes.status);
  const selfBody = await selfRes.json();
  console.log('Body:', JSON.stringify(selfBody, null, 2));

  // 3. 不带 cookie 请求（对照）
  console.log('\n=== 3. 不带 cookie 请求 ===');
  const noCookieRes = await fetch(`${baseUrl}/api/user/self`, {
    headers: {
      'new-api-user': '3',
    },
  });
  console.log('Status:', noCookieRes.status);
  const noCookieBody = await noCookieRes.json();
  console.log('Body:', JSON.stringify(noCookieBody, null, 2));
}

test().catch(console.error);
