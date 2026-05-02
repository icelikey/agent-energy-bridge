#!/bin/bash
# NewAPI 端点快速探测（curl 版本）
# 用法: NEWAPI_BASE_URL=https://xxx NEWAPI_API_KEY=sk-xxx bash scripts/newapi-discovery.sh

set -e

BASE_URL="${NEWAPI_BASE_URL%/}"
API_KEY="$NEWAPI_API_KEY"

if [ -z "$BASE_URL" ]; then
  echo "错误: 请设置环境变量 NEWAPI_BASE_URL"
  echo "示例: NEWAPI_BASE_URL=https://your-newapi.example.com NEWAPI_API_KEY=sk-xxx bash scripts/newapi-discovery.sh"
  exit 1
fi

echo "NewAPI 端点探测开始"
echo "Base URL: $BASE_URL"
echo "API Key : ${API_KEY:0:8}..."

AUTH_HEADER=""
if [ -n "$API_KEY" ]; then
  AUTH_HEADER="-H \"Authorization: Bearer $API_KEY\""
fi

probe() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  echo ""
  echo "========== $method $path =========="
  local url="${BASE_URL}${path}"
  echo "Request URL: $url"

  if [ -n "$body" ]; then
    echo "Body: $body"
    curl -s -w "\n__HTTP_STATUS__:%{http_code}\n" -X "$method" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      ${AUTH_HEADER:+-H} ${AUTH_HEADER:+$"Authorization: Bearer $API_KEY"} \
      -d "$body" "$url" || echo "curl failed"
  else
    curl -s -w "\n__HTTP_STATUS__:%{http_code}\n" -X "$method" \
      -H "Accept: application/json" \
      ${AUTH_HEADER:+-H} ${AUTH_HEADER:+$"Authorization: Bearer $API_KEY"} \
      "$url" || echo "curl failed"
  fi
}

# 1. 用户信息/余额
probe GET "/api/user/self"

# 2. 用量信息
probe GET "/api/usage/token"
probe GET "/api/user/usage"

# 3. 模型列表
probe GET "/v1/models"

# 4. 充值端点探测
probe GET "/api/topup"

# 5. 状态检查
probe GET "/api/status"

echo ""
echo "========== 探测完成 =========="
echo "请将上方完整输出复制给开发者。"
