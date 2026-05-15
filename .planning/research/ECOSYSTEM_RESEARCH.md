# Agent Energy Bridge — 生态调研报告

**调研日期:** 2026-05-05
**调研范围:** 免费 LLM API 渠道、开源 AI Gateway、成本管控工具

---

## 一、免费模型渠道（无需信用卡）

### Tier 1 — 高额度/高稳定性

| 提供商 | 注册要求 | 代表模型 | 免费额度 | 速率限制 | 适用场景 |
|--------|----------|----------|----------|----------|----------|
| **Groq** | 邮箱/Google | llama-3.3-70b, kimi-k2, qwen3-32b | 30 RPM / 14,400 RPD | 500+ tokens/s | 低延迟实时对话 |
| **Google Gemini (AI Studio)** | 邮箱 | Gemini 2.0 Flash | ~1,500 req/day | 30 RPM | 多模态、长上下文 |
| **OpenRouter** | 邮箱 | 33+ 免费模型 | ~20 RPM / 200 RPD | 因模型而异 | 单一端点多模型 |

### Tier 2 — 开发友好

| 提供商 | 注册要求 | 特色 | 限制 |
|--------|----------|------|------|
| **Cerebras** | 邮箱 | 1M tokens/day, 30 RPM | Llama 系列为主 |
| **SambaNova** | 邮箱 | 开发 tier 额度较宽松 | — |
| **Cloudflare Workers AI** | Cloudflare 账号 | 10K neurons/day, 300 RPM, 边缘部署 | 49+ 模型 |
| **NVIDIA NIM** | 邮箱 | ~40 RPM, 46+ 企业模型 | 1,000 req/month |
| **Hugging Face** | 邮箱 | 社区模型极多 | ~$0.10/month credits |

### 综合推荐

| 需求 | 首选 | 备选 |
|------|------|------|
| 最快推理 | Groq | Cerebras |
| 最多模型 | OpenRouter | Hugging Face |
| 多模态/长上下文 | Google Gemini | — |
| 无需注册 | LLM7.io (30 RPM) | — |
| 欧洲数据驻留 | Mistral AI | — |

---

## 二、开源 AI Gateway 生态

### 1. LiteLLM — 事实标准

- **仓库:** `BerriAI/litellm` | ~40K stars | MIT | Python
- **能力:** 100+ 提供商统一接口、实时成本追踪、硬预算封顶、回退路由、速率限制、负载均衡、缓存、虚拟 Key 管理
- **成本:** 自托管 TCO $2,000-3,500/月（基础设施 + DevOps）
- **局限:** Python GIL 瓶颈（1,000+ RPS）、无内置 A/B 测试、企业支持 $30K/年

### 2. RouteLLM — 智能路由

- **仓库:** `lm-sys/RouteLLM` | ~4,300 stars | Apache 2.0 | UC Berkeley
- **能力:** ML 分类器路由强弱模型、MT Bench 上 85% 成本降低、保持 95% GPT-4 质量
- **局限:** 仅支持二选一路由，生产环境通常与 LiteLLM 搭配使用

### 3. Langfuse — 成本可观测性

- **仓库:** `langfuse/langfuse` | ~23,000 stars | MIT | 被 ClickHouse 收购 (2026-01)
- **能力:** 自动成本计算、多步链路追踪、与 LiteLLM 回调集成
- **特色:** 细粒度定价（缓存 token、推理 token、音视频 token）

### 其他网关

| 项目 | 模式 | 特色 |
|------|------|------|
| Helicone | 开源/托管 | 可观测性为主 |
| Cloudflare AI Gateway | 托管免费层 | 全球边缘缓存 <30ms |
| Kong AI Gateway | 企业 | 2026 基准测试吞吐量最高 |

---

## 三、成本管控/预算守护工具

### 开源项目

| 仓库 | 语言 | 核心能力 | 与 AEB 的差异 |
|------|------|----------|---------------|
| `ogulcanaydogan/LLM-Cost-Guardian` | Go | 反向代理、<10ms 开销、预算告警、Grafana 面板 | 无自动充值、无免费模型兜底 |
| `LuciferForge/ai-cost-guard` | Python | 硬预算封顶、BudgetExceededError、CLI、JSON 存储 | 无自动充值、无三层降级 |
| `prashantdudami/llm-cost-guard` | Python | Redis 分布式预算、审计日志、Prometheus 指标 | 无自动充值 |
| `woodwater2026/agent-budget-guard` | Python | MCP Server 集成、JSONL 日志 | 无自动充值、无路由能力 |
| `brutally-Honest/llm-token-budget` | — | 预检 token 计数、成本估算 | 仅预检，无运行时管控 |

### 商业产品

| 产品 | 核心能力 | 价格 |
|------|----------|------|
| AgentKavach | 硬预算限制、实时告警、Kill Switch | 企业定价 |
| Portkey | 网关 + 可观测性 + 语义缓存 | 托管定价 |

---

## 四、关键发现：市场空白

### "自动加油"（Auto-Refuel）功能

**调研结论：GitHub 上没有任何开源项目实现自动充值/自动加油机制。**

现有工具全部停留在以下三个层面：
1. **监控** — 追踪 token/成本用量
2. **告警** — 阈值到达时通知
3. **硬限制** — 超出预算时阻断请求

**没有任何工具能做到：**
- 余额不足时自动调用充值接口
- 充值失败时自动降级到免费模型
- 三层模型兜底（主选 → 降级 → 免费）
- 多协议自适应（OpenAI/Anthropic/Google/Kimi/MiniMax）
- 12 维能力雷达图模型评分
- 预算感知路由（free/economy/balanced/premium）
- Agent 交互界面自动同步余额

### 这就是 Agent Energy Bridge 的核心差异化优势

> "自动的 token 加油是最核心的业务" — 这不是一个功能，而是一个**无人涉足的蓝海**。

---

## 五、对 AEB 的启示

### 对标 LiteLLM（网关层）

| LiteLLM 能力 | AEB 现状 | 差距 |
|--------------|----------|------|
| 100+ 提供商 | 5 协议自适应 | 数量差距大，但 NewAPI 生态内覆盖足够 |
| 实时成本追踪 | 基础 usage 统计 | 需升级到按模型/用户/任务维度 |
| 硬预算封顶 | BudgetGuard 四层动作 | AEB 更精细（allow/downgrade/block/free_fallback） |
| 回退路由 | 三层降级兜底 | 相当 |
| 虚拟 Key 管理 | 无 | v2 考虑 |
| 缓存 | 无 | 可考虑 |

### AEB 独特优势（市场上没有竞品）

1. **Auto-Refuel 自动加油** — 余额不足自动充值，无人实现
2. **Agent 原生集成** — Claude Code Hook / OpenClaw Cost Guard / Skill 一键安装
3. **预算感知路由** — 四档预算策略 + 12 维模型评分
4. **零外部依赖** — Node.js 内置模块，部署极简
5. **NewAPI 生态深度集成** — 激活码兑换直接对接额度系统

### 技术借鉴

| 来源 | 可借鉴点 |
|------|----------|
| LiteLLM | 负载均衡算法、缓存策略、虚拟 Key 设计 |
| RouteLLM | ML 路由分类器思路（未来可加入） |
| Langfuse | 成本归因粒度（缓存 token、推理 token 区分） |
| LLM-Cost-Guardian | Grafana 面板集成、<10ms 代理开销 |
| ai-cost-guard | CLI 设计模式、硬预算实现 |

---

## Sources

- [awesome-free-llm-apis](https://github.com/mnfst/awesome-free-llm-apis)
- [litellm-free-models-proxy](https://github.com/tomaasz/litellm-free-models-proxy)
- [free-ai-bible](https://github.com/abbosaliboev/free-ai-bible)
- [OpenRouter Free Models (May 2026)](https://costgoat.com/pricing/openrouter-free-models)
- [Every AI API with a Free Tier in 2026](https://www.grizzlypeaksoftware.com/articles/p/every-ai-api-with-a-free-tier-in-2026-the-developers-cheat-sheet-jl33ach0)
- [Groq API Free Tier Limits 2026](https://www.grizzlypeaksoftware.com/articles/p/groq-api-free-tier-limits-in-2026-what-you-actually-get-uwysd6mb)
- [LiteLLM](https://github.com/BerriAI/litellm)
- [RouteLLM](https://github.com/lm-sys/RouteLLM)
- [Langfuse](https://github.com/langfuse/langfuse)
- [LLM-Cost-Guardian](https://github.com/ogulcanaydogan/LLM-Cost-Guardian)
- [ai-cost-guard](https://github.com/LuciferForge/ai-cost-guard)
- [agent-budget-guard](https://github.com/woodwater2026/agent-budget-guard)
- [AI API Gateway 2026](https://tokenmix.ai/blog/ai-api-gateway)
- [Top 5 LLM Gateways 2025](https://www.helicone.ai/blog/top-llm-gateways-comparison-2025)
