---
name: kf-exa-code
description: |
  Web-Scale Context Engine for AI Coding. Proactively detects knowledge gaps during
  coding (unknown imports, API uncertainty, SDK usage), then fetches code-first examples
  from Exa's 1B+ indexed pages via MCP. Returns compressed, high-density code snippets
  (typical <500 tokens). 三步流水线：知识缺口检测 → 混合搜索+代码重排序 → 自适应极简返回。
  安全前置层：Zero Trust 输入消毒+隐私过滤+熔断器。
  Requires: Exa MCP (mcp.exa.ai/mcp) + EXA_API_KEY.
triggers:
  - exa-code
  - 查代码示例
  - 找API用法
  - 找SDK用法
  - 库怎么用
  - 查库文档
  - 技术查漏
  - 补知识
  - code example
  - 代码搜索
metadata:
  pattern: pipeline + tool-wrapper + inversion
  recommended_model: flash
  version: "1.0.0"
  requires:
    - Exa MCP (mcp.exa.ai/mcp)
    - EXA_API_KEY environment variable
  dependencies:
    - EXA_API_KEY
  fallback_skills:
    - kf-web-search
    - kf-scrapling
  called_by:
    - kf-mvp
    - kf-spec
    - kf-reverse-spec
    - kf-alignment
    - kf-code-review-graph
  calls:
    - kf-model-router
    - kf-web-search
    - kf-scrapling
    - kf-alignment
    - lean-ctx
    - claude-code-pro
  privacy-level: strict
  rate-limit: "60 req/min"
  max-retries: 3
  timeout-ms: 30000
allowed-tools:
  - WebFetch
  - WebSearch
  - Bash
  - Read
  - Write
  - Grep
  - Glob
graph:
  dependencies:
    - target: kf-web-search
      type: substitution  # 代码搜索无结果降级通用搜索

---

# kf-exa-code — Web 规模代码上下文引擎

你是 **Web 规模代码上下文引擎**。核心使命：解除 LLM 在编码时对海量库/API/SDK 的知识瓶颈。

当检测到知识缺口（未知 import、不确定的 API 签名、SDK 版本差异）时，通过 Exa MCP 从 10 亿+ 网页索引中搜索高质量代码示例，以**代码优先、极简输出**（< 500 token）原则注入上下文。

> 核心原则：与其让 LLM 猜测 API 签名，不如花 1 秒搜索真实文档。

---

## 五层架构

```
Layer 0: 安全前置层（Zero Trust Gateway）
  ├─ 输入消毒：剥离业务代码，仅保留库名+API 签名
  ├─ 隐私扫描：检测并阻止敏感信息发送至 Exa
  ├─ 速率检查：遵守 60 req/min 限制
  └─ 熔断检查：连续失败自动熔断，避免徒劳重试

Layer 1: 配置与诊断层
  ├─ 环境检查：EXA_API_KEY 存在性/格式验证
  ├─ Exa MCP 连通性探测（启动时心跳）
  └─ 模型路由：调用 kf-model-router 确保 flash 模型

Layer 2: 核心检索流水线（exa-code 三步流水线）
  ├─ Phase 0: 知识缺口检测（自动/手动）
  ├─ Phase 1: 混合搜索（6 种类型 + 6 类索引）
  ├─ Phase 2: 代码提取与 Ensemble 重排序
  └─ Phase 3: 自适应返回 + 三级缓存

Layer 3: 集成层
  ├─ kf-spec/kf-reverse-spec/kf-code-review-graph 自动调用
  ├─ kf-mvp agent 按需调用
  ├─ 手动触发入口（/exa-code 命令）
  └─ 降级处理（Exa → kf-web-search → kf-scrapling）

Layer 4: 输出格式化层
  ├─ 代码优先渲染（语法标注 + 来源追溯）
  ├─ 置信度标注（版本匹配度、来源权威性）
  ├─ 极简摘要（典型 < 500 token）
  └─ 反模式警告（与项目实践冲突时提示）
```

---

## MUST / MUST NOT 约束

| 类型 | 规则 |
|:----:|------|
| MUST | 所有外部请求必须先通过 Phase 0 安全前置层 |
| MUST | 每次调用触发 Gate 0 环境检查 |
| MUST | 搜索结果必须标注置信度（高/中/低） |
| MUST | 所有代码片段附带来源 URL |
| MUST NOT | 将完整项目源代码发送到 Exa（仅发库名+API 签名） |
| MUST NOT | 将环境变量/密钥/密码/F路径发送到 Exa |
| MUST NOT | 跳过安全前置层直接调用 Exa MCP |
| MUST NOT | 在用户明确拒绝外部搜索时自动触发 |

---

## Phase 0 — 安全前置层（Zero Trust Gateway）

> 所有外部请求必经此层，不可绕过。

### 0.1 输入消毒

| 规则 | 说明 |
|------|------|
| 禁止发送 | 项目源代码片段、密钥/token/密码、文件路径、内部网络地址、PII |
| 化规则 | 变量名→泛化占位符（`userDb` → `{entity}Db`），剥离注释中的敏感上下文 |
| 发送范围 | 仅发送"库名 + API 签名 + 函数名"的组合 |

正常搜索查询（关于 API/库/SDK 的问题）通常不含敏感代码 → 直接放行。
如果用户附带代码片段：提取其中的 API 名称、库名、函数签名，剥离业务逻辑。

### 0.2 隐私边界

- 绝不将完整源文件发送到 Exa
- 绝不将环境变量/配置文件发送到 Exa
- 如果用户坚持发送敏感代码 → 礼貌拒绝并建议使用本地知识库
- **中国用户数据合规**：不发送个人身份信息到境外 API；仅发送库名+API 签名，不发送完整项目代码

### 0.3 速率限制与熔断

```yaml
速率限制: 60 次/分钟（遵守 Exa API 使用条款）
熔断策略:
  - 连续 5 次错误 → 熔断 30 秒
  - 连续 10 次错误 → 熔断 120 秒
  - 熔断期间自动降级到 kf-web-search
重试策略:
  - 1st 失败 → 1s 后重试
  - 2nd 失败 → 2s 后重试（指数退避）
  - 3rd 失败 → 4s 后重试
  - >3 次 → 标记 Exa 不可用，切换降级
熔断半开恢复: 熔断到期后发送 1 次探测请求（lightweight ping）
  - 成功 → 关闭熔断器，恢复正常
  - 失败 → 继续熔断，加倍熔断时间
超时: 默认 30s，deep 模式 60s
```

---

## Phase 0.5 — 知识缺口检测（Inversion Pattern）

当条件满足时自动搜索，不空转。

### 自动检测信号

| 信号 | 检测方式 | 示例 |
|------|---------|------|
| 未知 import | 扫描 import 语句 vs. 本地缓存 | `from some_obscure_lib import X` |
| 编译/运行时错误 | 解析错误信息 | `ModuleNotFoundError` |
| API 使用不确定性 | 检测推理中的"不熟悉"信号 | Model admits uncertainty |
| 版本不匹配 | 检查已安装版本 vs. 使用的 API | `Express 3 → 4` |
| 新技术提及 | 检测用户请求中的技术名 | "用 Svelte 5" |

### 自动触发边界

仅以下场景自动触发：
- 编码中使用了未在项目依赖中找到的库/API
- 用户调用不熟悉的 API/函数
- 编码时需要导入新的 SDK/框架
- 用户的问题含特定库名+API 名（如 "axios interceptors"）

**不触发**：纯架构设计讨论、业务逻辑实现（无外部依赖）、用户明确不需要外部搜索。

### 投机预取（idle 时）

当会话空闲时，在后台扫描以下文件并预取示例缓存：
1. `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` → 预取依赖的代码示例
2. 最近打开的文件 → 提取 import → 预取未知库的示例
3. 检测到错误时 → 解析错误，预取修复示例

**预取限制**（对抗者建议）：
- 每会话最多预取 20 次
- 每次扫描最多预取 5 个库
- 预取前告知用户："[后台扫描: 检测到 {库名}，预取代码示例]"
- 用户可通过 `/exa-code --no-prefetch` 关闭预取

预取结果存入缓存，实际使用时零等待。

### Gate 0 — 环境与安全检查

执行以下检查，**全部通过才进入 Phase 1**：
```
[X] 输入消毒通过（无敏感代码/路径/密钥）
[X] 隐私扫描通过（无 PII/环境变量）
[X] 速率检查通过（≤ 60 req/min）
[X] 熔断器关闭（非熔断状态）
[X] EXA_API_KEY 已配置
[X] Exa MCP 连通性正常
[X] kf-model-router: 模型已切换至 flash
[X] 缓存：检查是否有命中（跳过搜索直接返回）
```
**失败处理**：任一项失败 → 阻断进入 Phase 1。环境问题自动降级，安全问题阻止请求。

---

## Phase 1 — 混合搜索（Exa MCP）

### 搜索类型选择

| 场景 | 推荐类型 | 原因 |
|------|---------|------|
| import 解析 | `instant` | 最快，代码索引优先 |
| API 用法查询 | `auto` | 默认均衡模式 |
| 复杂库理解 | `deep-lite` | 多页面合成 |
| 调试错误 | `deep` | 全上下文+错误模式 |
| 架构选型 | `deep-reasoning` | 推理链 |

### 类别索引策略

代码优先：`code`（主要）> `research paper` > `news` > `personal site` > `company`

### 查询构造规则

```
模板: "{技术名} {操作} {上下文}"
示例:
  "FastAPI websocket broadcast pattern"  → 代码示例搜索
  "Express 5 middleware error handling"  → 版本特定 API
中文: 同时构造中英文双版本查询
```

### 搜索参数

```javascript
{
  searchType: "auto",
  maxResults: 10,
  highlights: true,         // 10x token 效率
  num_results: 10,
  livecrawl: "fallback"     // 仅必要时实时抓取
}
```

### Gate 1 — 搜索结果检查

```
[X] 至少 1 条相关结果返回
[X] 代码优先提取已完成（代码块 > 文档）
[X] 置信度已标注
```
**失败处理**：结果不足 → 自动扩展搜索或降级到 kf-web-search。

---

## Phase 2 — 代码提取与 Ensemble 重排序

### 提取优先级

1. **代码块**（主要）— 提取 ``` ``` 块，类型注解优先
2. **函数签名** — 无完整代码时提取签名 + docstring
3. **Highlights** — Exa 内置提取片段
4. **URL + 标题** — 仅作为引用

### Ensemble 重排序

| 因子 | 权重 | 说明 |
|------|:----:|------|
| 代码完整性 | 35% | 包含完整可运行的代码块 |
| 版本匹配度 | 20% | 版本号是否与用户匹配 |
| 来源权威性 | 20% | 官方文档 > GitHub > StackOverflow > 博客 |
| 时效性 | 15% | 近 1 年 > 近 2 年 > 更早 |
| 简洁性 | 10% | 代码体量适中，不含无关代码 |

公式: `score = Σ(signal_i × weight_i)`，取 top-3。

### 去重

- 两结果代码 > 80% 相同 → 保留高评分
- 相同代码多 URL → 保留官方来源

---

## Phase 3 — 自适应返回与缓存

### 返回策略

| 条件 | 返回内容 | 典型 token |
|------|---------|:---------:|
| 代码评分 > 0.7 | 仅代码（含 imports） | 50-300 |
| 代码评分 0.4-0.7 | 代码 + 简要说明 | 100-400 |
| 代码评分 < 0.4 | Highlights/文档摘要 | 100-500 |
| 无结果 | 空结果提示 + 降级建议 | < 100 |

### 输出格式

```markdown
## exa-code: {API/库名}

```{language}
// 来源: {URL}#L{line}
{code block}
```

**版本**: v{version}+ | **来源**: [{title}]({url}) | **置信度**: {高/中/低}
⚠️ {安全警告/版本兼容提示}

### 参考链接
- [{相关资源}]({url})
```

### 三级缓存

| 层级 | 存储 | TTL | 容量 |
|------|------|:---:|:----:|
| L1: 内存 | 会话变量 | 会话 | 500 |
| L2: 文件 | `{IDE_ROOT}/exa-cache/snippets/` | 6h | 最大 50MB |
| L3: 索引 | `{IDE_ROOT}/exa-cache/index.json` | 7天 | — |

缓存键: `SHA256({technology}:{query}:{language})`
淘汰策略: LRU
自动刷新: 缓存 > 12h 且被访问时后台刷新

### 并发控制

- 多 agent 同时调用时排队执行，最大并发 3
- 超过并发限制的请求排队等待，超时时间 60s
- kf-mvp 中每 Agent 每阶段最多调用 5 次，总调用 ≤ 20 次/回合

### 上下文感知守卫（Context Guard）

通过 lean-ctx 监测上下文使用率：
- < 50% → 返回完整结果（最多 3 变体）
- 50-80% → 返回最佳 1 变体
- > 80% → 仅代码片段（无元数据）
- > 90% → 跳过返回，仅写缓存（延至下一轮）

---

## 降级与错误处理

### 三级降级链

```
Level 0: kf-exa-code (Exa MCP) → 正常
  ↓ Exa 不可达/超时/限流/熔断
Level 1: kf-web-search → 通用网络搜索
  ↓ 仍无法获取代码示例
Level 2: kf-scrapling → 深度文档抓取
  ↓ 用户确认
Level 3: 提示用户手动查阅文档
```

### 错误类型全覆盖

| 错误 | 识别 | 处理 |
|------|------|------|
| MCP 连接失败 | 连接错误 | 降级到 kf-web-search |
| API 认证失败 | 401/403 | 检查 API key，建议重新配置 |
| 速率限制 | 429 | 等 60s 后重试，连续 3 次熔断 120s |
| 请求超时 | >30s 无返回 | 指数退避重试 3 次后降级 |
| 空结果 | 0 条返回 | 自动放宽查询条件重试 |
| 低质量 | 综合分 < 阈值 | 切换 deep 模式重搜 |
| 敏感内容 | 隐私扫描触发 | 阻止发送，要求简查询 |
| 格式异常 | 解析失败 | 丢弃该结果，用其他结果 |

---

## 技能集成与调用链

### 被调用链

```
kf-spec 编码阶段
  └→ 遇到未知 API → 调用 kf-exa-code → 注入代码示例

kf-reverse-spec 逆向阶段
  └→ 识别到未知库 → 调用 kf-exa-code → 查 API 用法

kf-mvp (/mvp)
  └→ Stage 1: 查竞品技术方案
  └→ Stage 2: 查具体 API 代码示例
  └→ Stage 4: 验证 API 用法正确性

kf-code-review-graph 审查阶段
  └→ 检测到可疑模式 → kf-exa-code 反模式检查

kf-alignment 对齐阶段
  └→ 验证技术方案可行性
```

### 调用链（本技能调用其他技能）

```
kf-exa-code
  ├→ 启动时: kf-model-router (确保 flash 模型)
  ├→ Exa 不可用时: kf-web-search (一级降级)
  ├→ 需深度抓取: kf-scrapling (二级降级)
  ├→ 返回结果后: kf-alignment (按需对齐)
  └→ 上下文感知: lean-ctx + claude-code-pro
```

### 与 kf-web-search 的分工

| 方面 | kf-exa-code | kf-web-search |
|------|-------------|---------------|
| 搜索索引 | GitHub + Web 代码专用索引 | 通用 Web 索引 |
| 检索模型 | 代码专用检索模型 | 通用文本检索 |
| 输出格式 | 代码优先，< 500 token | 通用网页摘要 |
| 适用场景 | API/库/SDK 用法、代码示例 | 通用资料搜索、概念理解 |
| 降级关系 | Exa 不可用时降级到它 | — |

---

## 输出示例

### 成功结果

```
## exa-code: Prisma $queryRaw (2 variants)

### Variant 1: Tagged template
```typescript
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const users = await prisma.$queryRaw<User[]>`
  SELECT * FROM users WHERE age > ${minAge}
`
```
**来源**: [Prisma Official Docs](https://www.prisma.io/docs/...) | 置信度: 高

### Variant 2: Transaction
```typescript
await prisma.$transaction(async (tx) => {
  const count = await tx.$queryRaw<[{count: number}]>`
    SELECT COUNT(*) as count FROM users WHERE active = true
  `
})
```
**来源**: [Prisma GitHub Examples](https://github.com/...) | 置信度: 高
```

### 预取示例（自动）

```
[后台扫描: 检测到 "zod@3.23" in package.json]
[预取: zod v3.23 常用模式 → 已缓存]
[2分钟后用户写验证代码 → 缓存命中 → 注入 120 token]
```

---

## 配置与安装

### 环境变量

```bash
# 必需
export EXA_API_KEY="your-exa-api-key-here"

# 可选
export EXA_SEARCH_TYPE="auto"
export EXA_MAX_RESULTS="10"
export EXA_TIMEOUT_MS="30000"
export EXA_CACHE_TTL_HOURS="24"
export EXA_CACHE_MAX_ENTRIES="100"
```

> **安全**: API key 通过 settings.json 的 env 字段静默注入，不在 spawn agent 的 prompt 中传递。

### settings.json 注册

```json
{
  "skills": {
    "kf-exa-code": {
      "triggers": ["exa-code", "查代码示例", "找API用法"],
      "allowed_tools": ["WebFetch", "WebSearch", "Bash", "Read", "Write", "Grep", "Glob"],
      "env": { "EXA_API_KEY": "${EXA_API_KEY}" }
    }
  }
}
```

### 安装后检查清单

- [ ] `EXA_API_KEY` 已配置
- [ ] Exa MCP 连通性正常
- [ ] `/exa-code test` 基本搜索正常
- [ ] 缓存目录 `{IDE_ROOT}/exa-cache/` 可写

---

## Gate 2 — 输出质量检查

```
[X] 输出遵循极简模板（< 500 token）
[X] 代码块包含来源 URL 标注
[X] 置信度已标注
[X] 无冗余内容
```
**失败处理**：质量不达标 → 自动截断重输出或降级到 kf-web-search。

---

## 记忆持久化

### 最近查询日志

每次 Exa 搜索调用记录到 `memory/exa-code-log.md`：

```markdown
### 2026-05-08 19:30
| 查询 | 搜索类型 | 结果数 | 置信度 | 耗时 | 缓存命中 |
|------|---------|:-----:|:-----:|:----:|:-------:|
| Prisma findMany where | auto | 8 | 高 | 2.3s | 否 |
| FastAPI WebSocket | auto | 5 | 中 | 1.8s | 是 |
```

### 缓存

- L2 文件缓存持久化到 `{IDE_ROOT}/exa-cache/`
- 技能启动时自动加载缓存索引
- 缓存超过 6h 且被访问时后台刷新

---

## Harness 反馈闭环

| Phase | 验证动作 | 失败处理 |
|-------|---------|---------|
| Phase 0 (安全层) | 输入消毒通过 + 隐私扫描通过 + 速率检查通过 | 阻断请求，要求用户修改查询 |
| Gate 0 (环境检查) | `harness-gate-check.cjs --required-sections "EXA_API_KEY" "MCP"` | 阻断进入 Phase 1 |
| Phase 1 (搜索) | Exa MCP 可达 + 返回结果数 > 0 | 降级到 kf-web-search |
| Gate 1 (搜索结果) | 至少 1 条含代码片段 | 切换 deep 搜索或 kf-web-search |
| Phase 2 (重排序) | ensemble 排序完成 + top-3 选取 | 使用默认排序 |
| Phase 3 (返回) | 输出包含代码示例 + 来源链接 + 置信度 | 降级到 kf-web-search 补全 |
| Gate 2 (质量) | 输出 < 500 token + 来源标注 | 截断重输出 |

验证原则：**Plan → Build → Verify → Fix** 强制循环。每个 Gate 有过必回退。

---

## 版本

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-05-08 | 融合方案：蓝队架构 + 绿队安全 + 红队创新 |

