---
name: kf-model-router
description: |
  全自动多模型智能路由引擎 — "省+稳+准"三位一体。多供应商动态调度（DeepSeek Pro/Flash + MiniMax 2.7 + Kimi K2.5），
  语义任务分类 + 加权评分选优 + 断路器 + 降级链 + 令牌桶限流 + 密钥隔离。零配置，自动触发，用户无感。
  触发词："模型路由"、"切换模型"、"省模式"、"智能路由"、"模型调度"、"多模型路由"、"smart router"、"安全路由"、"safe router"、"断路器"、"限流"。
triggers:
  - 模型路由
  - 切换模型
  - 省模式
  - 智能路由
  - 模型调度
  - 多模型路由
  - smart router
  - 路由调度
  - 多模型
  - 安全路由
  - safe router
  - 断路器
  - 限流
metadata:
  principle: 省 + 稳 + 准
  source: AICoding原则.docx — 红蓝绿三队融合方案
  status: stable
  version: 2.0.0
  integrated-skills:
    - kf-spec
    - kf-mvp
    - kf-alignment
    - kf-prd-generator
    - kf-code-review-graph
    - kf-web-search
    - kf-brainstorm
    - kf-browser-ops
  capabilities:
    - dual-model-routing: "DeepSeek Pro/Flash 双模型基础路由"
    -     - multi-vendor-routing: "多供应商动态路由（DeepSeek/MiniMax/Kimi）"
    - semantic-classification: "语义任务分类（8 种类型 + 4 级复杂度）"
    - weighted-scoring: "加权评分选优（4 种策略）"
    - circuit-breaker: "断路器 + 健康探测 + 自动恢复"
    - fallback-chain: "降级链（最多 4 级）"
    - rate-limiter: "令牌桶限流（每供应商独立桶）"
    - key-isolation: "密钥隔离（各供应商独立环境变量）"
    - cache-compatible: "DeepSeek KV Cache 保留"
    - zero-config: "零手动配置，运行时内存调度"
graph:
  dependencies:
    - target: kf-mvp
      type: dependency
    - target: kf-spec
      type: dependency
    - target: kf-alignment
      type: dependency
    - target: kf-prd-generator
      type: dependency
    - target: kf-code-review-graph
      type: dependency
    - target: kf-web-search
      type: dependency
    - target: kf-brainstorm
      type: dependency
    - target: kf-browser-ops
      type: dependency
    - target: kf-reverse-spec
      type: dependency
    - target: kf-grant-research
      type: dependency
    - target: kf-add-skill
      type: dependency
    - target: kf-doc-consistency
      type: dependency
    - target: kf-autoresearch
      type: dependency
    - target: kf-token-tracker
      type: dependency
    - target: kf-langextract
      type: dependency
    - target: kf-skill-design-expert
      type: dependency
    - target: kf-go
      type: dependency
---

# kf-model-router — 省+稳+准：全自动多模型智能路由引擎

> **核心原则**：最好的模型和最性价比的模型搭配，结合工具方法稳固 ROI。
> **管理原则**：想的美，做的实。计划用 pro（深度推理），执行用 flash（高效落地）。
> **扩展**：支持多供应商模型池（DeepSeek + MiniMax + Kimi），自动最优路由。
> **安全信条**：宁可降级不可泄露，每次调用必须有降级方案。
> **切换方式**：自动切换，用户无感。

---

## 架构总览

```
任务描述
  │
  ├─ Task Classifier ──→ 语义分析 → 类型 + 复杂度
  │
  ├─ Model Registry ───→ 查询可用模型池
  │
  ├─ Routing Engine ───→ 加权评分 → 选择最优
  │     │
  │     ├─ 快速路径（查表，置信度 > 0.85）
  │     └─ 加权路径（4 种策略）
  │
  ├─ Safety Layer ─────→ 断路器 + 限流 + 健康探测
  │     │
  │     └─ 异常 → 走降级链 (最多 4 级)
  │
  └─ Dispatcher ──────→ 密钥注入 + 返回 model 参数
```

---

## 基础路由（DeepSeek Pro/Flash）

| 阶段 | 自动切换模型 | 原因 |
|------|------------|------|
| **计划/设计** | pro（deepseek-v4-pro） | 需要深度推理、架构决策、权衡取舍 |
| **执行/编码** | flash（deepseek-v4-flash） | 效率优先，常规编码任务不需要极致推理 |
| **代码审查** | flash（deepseek-v4-flash） | 模式匹配为主，性价比高 |
| **文档生成** | flash（deepseek-v4-flash） | 结构化输出，低成本 |
| **Bug 排查** | pro（deepseek-v4-pro） | 需要深度上下文理解和推理链 |
| **简单问答** | 轻量模型（Haiku 级） | 极低成本，快速响应 |

## 多供应商路由

| 任务类型 | 复杂度 | DeepSeek | MiniMax | Kimi | 默认首选 |
|---------|--------|----------|--------|------|---------|
| 架构/设计 | 高 | **v4-pro** | m2.5 | k2.6 | v4-pro |
| 编码/实现 | simple/medium | **v4-flash** | m2.5 | k2.6 | v4-flash |
| 编码/实现 | complex | v4-pro | **m2.5** | k2.6 | m2.5 |
| 代码审查 | 低 | v4-flash | **m2.5** | k2.6 | m2.5 |
| Bug 排查 | 高 | v4-pro | m2.5 | **k2.6** | k2.6 |
| 文档生成 | 低 | v4-flash | m2.5 | **k2.5** | k2.5 |
| 简单问答 | 低 | v4-flash | m2.5 | **k2.5** | k2.5 |
| 测试编写 | 中 | **v4-flash** | m2.5 | k2.6 | v4-flash |
| UI 原型/前端 | 中 | v4-flash | m2.5 | **k2.6** | k2.6 |
| 计划/需求 | 高 | **v4-pro** | m2.5 | k2.6 | v4-pro |
| 数学/算法 | 高 | **v4-pro** | m2.5 | k2.6 | v4-pro |
| 多Agent协作 | 高 | v4-pro | m2.5 | **k2.6** | k2.6 |

## 支持的模型池

| 模型 | 供应商 | 类型 | 适用场景 | 相对成本 | 环境变量 |
|------|--------|------|---------|---------|---------|
| deepseek-v4-pro | DeepSeek | reasoning | 架构/推理/数学/Agent | 中 | DEEPSEEK_API_KEY |
| deepseek-v4-flash | DeepSeek | chat | 日常编码/测试/文档/缓存 | 低 | DEEPSEEK_API_KEY |
| minimax-m2.5 | MiniMax | chat | 编程SOTA/审查/极速/低成本 | 极低 | MINIMAX_API_KEY |
| kimi-k2.6 | Kimi | chat | 代码/前端/Agent/工具调用 | 中 | KIMI_API_KEY |
| kimi-k2.5 | Kimi | chat | 长文本/文档/中文对话 | 中 | KIMI_API_KEY |

## 路由策略

| 策略 | 说明 | 命令 |
|------|------|------|
| balanced | 平衡性价比和性能（默认） | `node index.cjs route "任务"` |
| cost_optimized | 性价比优先 | `node index.cjs route "任务" -s cost_optimized` |
| performance_optimized | 性能优先 | `node index.cjs route "任务" -s performance_optimized` |
| fallback_only | 仅降级模型 | `node index.cjs route "任务" -s fallback_only` |

---

## 安全机制

### 断路器

| 参数 | 默认值 | 说明 |
|------|--------|------|
| failureThreshold | 3（smart）/ 5（safe） | 连续失败次数 → OPEN |
| successThreshold | 2 | 半开状态连续成功次数 → CLOSED |
| timeout | 30000ms | OPEN → HALF_OPEN 等待时间 |
| halfOpenMaxRequests | 1 | 半开状态允许最大试探请求数 |

```
CLOSED (正常) ──连续失败→ OPEN (熔断)
   ↑                       │
   │                       ↓
   恢复 ←──超时──→ HALF-OPEN (尝试恢复)
```

### 降级链

| 首选模型 | 降级链 |
|---------|--------|
| `deepseek-v4-pro` | → `deepseek-v4-flash` → `minimax-2.7` → `kimi-k2.5` → SAFE_MODE |
| `deepseek-v4-flash` | → `deepseek-v4-pro` → `minimax-2.7` → `kimi-k2.5` → SAFE_MODE |
| `minimax-2.7` | → `deepseek-v4-flash` → `kimi-k2.5` → SAFE_MODE |
| `kimi-k2.5` | → `deepseek-v4-flash` → SAFE_MODE |

触发降级条件：断路器 OPEN / 密钥缺失 / 限流令牌不足 / 健康探测不通过 / HTTP 超时/5xx。

### 令牌桶限流

| 供应商 | 容量 | 填充速率 | 安全余量 |
|--------|------|---------|---------|
| DeepSeek | 16 tokens | 0.26/s | 80%（20 rpm → 16） |
| MiniMax | 24 tokens | 0.4/s | 80%（30 rpm → 24） |
| Kimi | 16 tokens | 0.26/s | 80%（20 rpm → 16） |

多 Agent 共享同一供应商桶，桶满时请求等待（最多 5000ms）后降级。

### 密钥隔离

每个供应商独立环境变量，独立 HTTP 客户端实例，独立令牌桶：

```bash
export DEEPSEEK_API_KEY=sk-xxx
export MINIMAX_API_KEY=mm-xxx
export KIMI_API_KEY=sk-xxx
```

---

## 文件结构

```
{IDE_ROOT}/skills/kf-model-router/
├── SKILL.md                   # 本文件
├── model-registry.json         # 模型注册表（配置驱动）
├── model-registry.cjs          # 模型注册中心
├── index.cjs                   # 统一入口 API
├── task-classifier.cjs         # 语义任务分类器
├── routing-engine.cjs          # 动态路由引擎（加权评分）
├── dispatcher.cjs              # 并发调度器
├── health-checker.cjs          # 健康探测 + 断路器
├── model-router-hook.cjs       # PreToolUse Hook
├── providers/                  # 供应商适配器
│   ├── base-adapter.cjs        # 适配器基类
│   ├── deepseek.cjs            # DeepSeek 适配器
│   ├── minimax.cjs             # MiniMax 适配器
│   └── kimi.cjs              # Kimi (Moonshot) 适配器
├── safety/                     # 安全基础设施
│   ├── circuit-breaker.cjs     # 断路器模式
│   ├── degradation-chain.cjs   # 降级链编排
│   ├── rate-limiter.cjs        # 令牌桶限流
│   ├── key-isolator.cjs        # 密钥隔离 + 客户端工厂
│   ├── health-probe.cjs        # 健康探测
│   ├── model-health.cjs        # 三态断路器 + 健康探测
│   └── safe-router.cjs         # 安全路由主入口
└── test/
    └── model-router.test.cjs   # 集成测试
```

---

## 自动触发机制

### 方式 1：技能 Frontmatter 声明（推荐）

其他技能在 SKILL.md frontmatter 中通过 `integrated-skills` 声明依赖 kf-model-router 后，
该技能启动时自动检查当前模型是否匹配推荐模型，不匹配则自动切换。

### 方式 2：Hook 自动检测

```json
{
  "matcher": "Skill",
  "hooks": [
    {
      "type": "command",
      "command": "node {IDE_ROOT}/helpers/model-router-hook.cjs auto-route",
      "timeout": 5000
    },
    {
      "type": "command",
      "command": "node {IDE_ROOT}/skills/kf-model-router/model-router-hook.cjs",
      "timeout": 5000
    }
  ]
}
```

### 方式 3：Agent 级模型路由（MVP 内部）

当 `/mvp` 通过 `Agent` 工具 spawn 子 Agent 时，每个 Agent 独立指定模型：

| 角色 | model 参数 | 实际模型 | 原因 |
|------|-----------|---------|------|
| 协调者/裁判 | opus（不设置） | `deepseek-v4-pro` | 深度推理：任务拆解、裁判评分、方案融合 |
| 全栈开发 | sonnet | `deepseek-v4-flash` | 高效执行：需求对齐、架构设计、编码实现 |
| 集成测试 | sonnet | `deepseek-v4-flash` | 高效执行：测试编写、代码审查 |
| 前端设计师 | sonnet | `deepseek-v4-flash` | 高效执行：UI 原型、方案汇总 |

### 方式 4：手动触发（调试/覆盖）

```
/set-model pro              # 手动切换到 pro
/set-model flash            # 手动切换到 flash
/set-model minimax-2.7      # 手动切换到 MiniMax 2.7
/set-model kimi-k2.5   # 手动切换到 Kimi K2.5
模型路由                     # AI 分析当前任务并推荐模型
省模式                       # 自动进入执行模式（flash）
```

---

## 模型路由映射

kf-model-router ID → Claude Code Agent model string:

| Router ID | Agent model | 等级 |
|-----------|-------------|------|
| deepseek-v4-pro | opus | pro 级推理 |
| minimax-2.7 | opus | pro 级推理 |
| deepseek-v4-flash | sonnet | flash 级执行 |
| kimi-k2.5 | sonnet | 前端/长文本 |
| kimi-k2.5 | sonnet | 前端/长文本 |

---

## KV Cache 兼容

- DeepSeek 模型 KV Cache 优化策略完全保留
- 共享前缀机制不变（前 300-500 token 逐字相同）
- 预热策略：spawn 第一个 agent 前预热
- 多轮保持：messages 连续追加
- 不支持缓存的模型（MiniMax、Kimi）跳过预热步骤

---

## CLI 用法

```bash
# 路由决策
node {IDE_ROOT}/skills/kf-model-router/index.cjs route "写一个用户登录模块"

# 调度决策（含 agent model 映射）
node {IDE_ROOT}/skills/kf-model-router/index.cjs dispatch "重构订单系统架构"

# 查看统计
node {IDE_ROOT}/skills/kf-model-router/index.cjs stats

# 健康检查
node {IDE_ROOT}/skills/kf-model-router/index.cjs health-check

# 查询安全状态
node {IDE_ROOT}/skills/kf-model-router/safety/safe-router.cjs status

# 查看路由日志
node {IDE_ROOT}/skills/kf-model-router/safety/safe-router.cjs log 20
```

### 编程接口

```javascript
const router = require('./index.cjs');

const decision = await router.route({
  description: "实现一个分布式缓存层",
});
console.log(decision.model.id);        // "deepseek-v4-pro"
console.log(decision.fallbackChain);   // ["deepseek-v4-pro", "minimax-2.7", ...]
console.log(decision.confidence);      // 0.95

const agentConfig = await router.dispatch({
  description: "修复登录页面的样式 bug",
});
console.log(agentConfig.model);        // "sonnet"
console.log(agentConfig.modelId);      // "deepseek-v4-flash"
```

---

## ROI 参考

| 模型 | 相对成本 | 适用场景 |
|------|---------|---------|
| deepseek-v4-pro | 100% (¥3/K) | 架构设计、复杂 Bug、需求澄清 |
| deepseek-v4-flash | ~33% (¥1/K) | 日常编码、代码审查、文档 |
| minimax-2.7 | ~33% (¥1/K) | 通用任务（推理+编码+审查+文档） |
| kimi-k2.5 | ~33% (¥1/K) | 前端开发、长文本读写、文档生成 | 简单问答、格式转换 |
| kimi-k2.5 | ~333% (¥10/K) | 高精度推理（成本敏感） |

****建议配比**：pro 30% + flash 50% + kimi 15% + minimax 5%，综合成本 ~50%。

---

## Harness 反馈闭环

每次模型切换后 MUST 验证：

```bash
# 路由决策验证
node {IDE_ROOT}/helpers/harness-gate-check.cjs \
  --skill kf-model-router \
  --stage routing \
  --required-sections "任务类型" "推荐模型" "置信度"

# 健康状态验证
node {IDE_ROOT}/helpers/harness-gate-check.cjs \
  --skill kf-model-router \
  --stage health \
  --required-fields "status" "circuit_breaker"
```

路由决策记录到 `memory/model-routing-stats.md`，每周汇总统计各供应商使用占比、成本节省、断路器触发记录。

路由原则：**计划用 pro（15%），执行用 flash（60%），低成本模型（25%）**。

