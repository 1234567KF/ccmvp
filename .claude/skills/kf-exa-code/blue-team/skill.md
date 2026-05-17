---
name: kf-exa-code
description: |
  Web规模代码上下文工具。通过 Exa MCP 搜索引擎，为编码代理提供
  实时、精准的代码示例和技术文档参考，解除 LLM 在第三方库/API/SDK
  方面的知识断层。遵循"代码优先、极简输出"原则。
  要求：EXA_API_KEY 已配置。
triggers:
  - exa-code
  - exa搜索
  - 代码搜索
  - 查代码示例
  - 查API用法
  - 查SDK用法
  - 技术上下文
  - 代码上下文
allowed-tools:
  - WebSearch
  - WebFetch
  - Bash
  - Read
  - Write
metadata:
  pattern: pipeline
  recommended_model: flash  # 搜索类任务 flash 足够，无需 pro
  steps: "5"
  interaction: single-turn  # 典型场景下是一次问答
  dependencies:
    - EXA_API_KEY  # 环境变量，通过 Exa MCP 认证
  fallback_skills:
    - kf-web-search  # Exa MCP 不可用时降级
  called_by:
    - kf-mvp  # MVP agent 按需自动调用
    - kf-spec               # Spec 编码阶段获取 API/SDK 示例
    - kf-reverse-spec       # 逆向工程阶段查文档
    - kf-alignment          # 动后对齐时验证技术方案可行性
---

# kf-exa-code — Web 规模代码上下文工具

你是代码上下文检索专家。当开发者需要了解某库/API/SDK 的用法、参数、返回格式时，
你通过 Exa MCP 搜索引擎精准定位代码示例和技术文档，以"代码优先、极简输出"原则返回。

> 核心原则：与其让 LLM 猜测 API 签名，不如花 1 秒搜索真实文档。

---

## 分层架构

本技能采用四层架构，每层职责清晰、可独立测试和替换：

```
Layer 0: 配置与诊断层
  ├─ 环境检查（EXA_API_KEY 存在性/格式验证）
  ├─ Exa MCP 连通性探测（定时/启动时心跳）
  └─ kf-model-router 调用（确保 flash 模型）

Layer 1: Exa MCP 客户端层
  ├─ MCP 协议通信（https://mcp.exa.ai/mcp）
  ├─ 6 种搜索类型路由（auto/instant/fast/deep-lite/deep/deep-reasoning）
  ├─ 6 大类别索引过滤（company/people/research paper/...）
  └─ 请求超时与重试（3 次，指数退避）

Layer 2: 核心检索流水线
  ├─ Step 1 混合搜索 → 多关键词组合搜索
  ├─ Step 2 代码提取与重排序 → ensemble 方法最大化召回
  ├─ Step 3 自适应返回 → 代码优先，不足时补充文档
  └─ Highlights 提取 → 10x token 效率

Layer 3: 集成层
  ├─ kf-spec 集成钩子（编码阶段自动查 API 示例）
  ├─ kf-mvp 集成（MVP agent 按需调用）
  ├─ 手动触发入口（/exa-code 命令）
  └─ 降级处理（Exa 不可用 → kf-web-search）

Layer 4: 输出格式化层
  ├─ 代码优先渲染（语法高亮、文件路径标注）
  ├─ 置信度标注（版本匹配度、来源权威性）
  ├─ 极简摘要（典型 200-500 token）
  └─ 引用追溯（来源 URL + 代码行号）
```

---

## 核心工作流程（5 步）

### Step 0 — 环境诊断与初始化

自动执行以下检查，**全部通过才进入 Step 1**：

```markdown
[环境检查]
  ✅ EXA_API_KEY: 已配置
  ✅ Exa MCP 连通性: 正常（响应时间 XXms）
  ✅ kf-model-router: 模型已切换至 flash
  ⚡ 缓存: 命中 {N} 条相似查询，跳过搜索

[结果]
  → 状态: 就绪 | 降级: false
```

检查失败时自动处理：

| 问题 | 处理方式 |
|------|---------|
| EXA_API_KEY 未配置 | 输出配置指引，提示用户设置环境变量后重试 |
| Exa MCP 连通失败 | 降级到 kf-web-search，记录日志 |
| 缓存命中 | 跳过搜索，直接返回缓存结果（节省 token） |
| 模型非 flash | kf-model-router 自动切换 |

### Step 1 — 查询理解与策略选择

将用户自然语言问题转化为 Exa 搜索策略：

**输入分析**：
- 提取核心技术名词（库名、API 名、SDK 版本号）
- 区分查询类型：代码示例 / API 文档 / SDK 用法 / 版本迁移
- 识别上下文约束（语言、框架版本、平台）

**策略选择**：

| 输入特征 | 搜索类型 | 类别索引 | 示例 |
|---------|---------|---------|------|
| 明确库/API 名 | `auto` | — | "Playwright screenshot API" |
| 代码示例需求 | `auto` | — | "Fetch API timeout example" |
| 最新版本特性 | `fast` | — | "Next.js 15 app router changes" |
| 深度技术调研 | `deep` | — | "WebSocket reconnection strategy best practices" |
| 学术代码参考 | `auto` | research paper | "Transformer attention implementation PyTorch" |
| 竞品/公司技术 | `auto` | company | "Anthropic MCP SDK usage" |

### Step 2 — 混合搜索执行

按选择的策略执行搜索，**最多 3 轮**：

```
第 1 轮: 精确匹配（"" 精确短语）→ 期望：≥ 3 条高质量结果
第 2 轮: 扩展查询（去除精确限定，加同义词）→ 触发条件：第 1 轮结果 < 3
第 3 轮: 语义放宽（去掉版本号/限定词）→ 触发条件：第 2 轮仍不足
```

**搜索参数配置**（默认值，可由用户覆盖）：

```javascript
{
  searchType: "auto",           // auto | instant | fast | deep-lite | deep | deep-reasoning
  maxResults: 10,               // 返回结果数
  highlights: true,             // 启用 Highlights（10x token 效率）
  codePriority: true,           // 代码优先排序
  maxTokens: 500,               // 单条结果 token 上限
  includeDomains: [],           // 限定域名（如 ["github.com", "docs.npmjs.com"]）
  excludeDomains: [],           // 排除域名
  timeRange: null               // 时间范围
}
```

### Step 3 — 代码提取与重排序

对搜索结果执行 ensemble 重排序，**目标是最大化召回质量而非数量**：

**重排序因子**（加权评分）：

| 因子 | 权重 | 说明 |
|------|------|------|
| 代码密度 | 35% | 结果中代码块占比越高越好 |
| 版本匹配度 | 25% | 示例代码版本与用户查询版本是否匹配 |
| 来源权威性 | 20% | 官方文档 > 知名博客 > StackOverflow > 采集站 |
| 时效性 | 10% | 最近 1 年内 > 1-2 年 > 2 年以上 |
| 完整性 | 10% | 包含完整导入+调用+错误处理的示例优先 |

**代码优先提取**：
- 优先提取完整代码块（含 import 语句）
- 同一 API 的多种写法（callback / promise / async-await）
- 辅助提取：参数表、返回值类型、错误码

### Step 4 — 自适应返回

根据 Step 3 评分结果，**只返回最相关的 1-3 条**，每条控制在几百 token：

**返回策略矩阵**：

| 条件 | 返回内容 | 示例 |
|------|---------|------|
| 代码示例评分 > 0.7 | 仅代码（含 import + 调用） | `// 来自 docs.example.com:45` + 代码块 |
| 代码评分 0.4-0.7 | 代码 + 摘要说明（2-3 行） | 代码块 + 简要说明参数含义 |
| 代码评分 < 0.4 | 完整文档片段 | 文档标题 + 关键段落 + 链接 |

**极简输出模板**：

```markdown
## {API/库名} — 用法参考

### 代码示例
```{language}
// 来源: {URL}#L{line}
{code block}
```

### 关键说明
- 参数: {参数名} → {类型+说明}
- 返回值: {类型}
- 版本兼容: v{version}+

### 更多参考
- [{标题}]({URL})
- [{备选方案}]({URL})
```

### Step 5 — 置信度评估与反馈

每次搜索结果附带置信度评估，帮助调用方判断可信程度：

**置信度等级**：

| 等级 | 标准 | 建议操作 |
|------|------|---------|
| 高 (>0.8) | 官方文档 + 版本匹配 + 完整代码 | 可直接使用 |
| 中 (0.5-0.8) | 知名来源但版本略有出入 | 需对照当前版本验证 |
| 低 (<0.5) | 社区内容或版本不确定 | 建议查官方文档交叉验证 |
| 无结果 | 搜索未返回相关内容 | 降级到 kf-web-search 重试 |

---

## 集成方案

### 被 kf-spec 自动调用

在 kf-spec 的编码执行阶段（Step 6），当遇到以下场景时自动触发 kf-exa-code：

```markdown
触发条件（任一满足）:
  - 需要调用未使用过的第三方库 API
  - Async/wait 模式不确定的 API
  - SDK 版本兼容性问题
  - 需要最新的 API 文档（本地文档过时）

调用方式:
  1. kf-spec 提取当前编码任务中的未知 API 列表
  2. 对每个 API 调用 kf-exa-code（可并行）
  3. 将结果注入当前编码上下文
  4. 编码完成后，清理临时搜索上下文

超时控制: 单次调用 < 30s，批次调用 < 120s
```

### 被 kf-mvp 自动调用

在 `/mvp` 的 Phase 1/3/5 中，Agent 可按需调用 kf-exa-code：

```markdown
调用策略:
  - Stage 1（方案设计）: 查竞品技术方案、对比库选型
  - Stage 2（编码实现）: 查具体 API 的代码示例
  - Stage 3（测试修复）: 查边界场景处理、错误模式

调用限制:
  - 单 Agent 每阶段最多调用 5 次
  - 总调用数 ≤ 20 次 / 回合
  - 超出限制 → 优先合并查询，缩小搜索范围
```

### 被 kf-reverse-spec 自动调用

在逆向工程阶段，遇到不熟悉的 API/SDK 时调用：

```markdown
触发场景:
  - 代码中出现未识别的库/API
  - 推测功能但不确定具体实现
  - 需要确认 API 的弃用状态或替代方案
```

### 被 kf-alignment 自动调用

在动后对齐阶段，验证技术方案可行性：

```markdown
触发场景:
  - 对齐时发现技术方案依赖不熟悉的 API
  - 需要确认替代方案是否存在
  - 技术方案与官方推荐做法不一致
```

---

## 手动使用

### 直接查询

```
/exa-code <查询内容>
```

示例：
```
/exa-code Playwright page screenshot API options
/exa-code Fetch API timeout controller signal
/exa-code Next.js 15 middleware rewrite vs redirect
```

### 高级用法

```
/exa-code --type deep --domain github.com "WebSocket reconnection TypeScript"
/exa-code --max-results 5 --lang python "asyncio gather exception handling"
/exa-code --time-range 1y "React Server Components data fetching"
```

参数说明：

| 参数 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| `--type` | `-t` | `auto` | 搜索类型 |
| `--max-results` | `-n` | `10` | 最大结果数 |
| `--domain` | `-d` | — | 限定域名（可多次指定） |
| `--lang` | `-l` | — | 编程语言过滤 |
| `--time-range` | `-r` | — | 时间范围（1y/6m/3m） |
| `--code-only` | `-c` | `false` | 仅返回代码结果 |
| `--verbose` | `-v` | `false` | 显示完整搜索过程 |

---

## 错误处理与降级

### 分层降级策略

```
Level 0: Exa MCP 正常 → 直接调用
Level 1: Exa MCP 超时 → 重试 3 次（指数退避: 1s → 3s → 9s）
Level 2: Exa MCP 不可用 → 降级到 kf-web-search
Level 3: kf-web-search 也不可用 → 返回缓存 + 提示用户手动查
```

### 常见错误处理

| 错误 | 检测方式 | 处理 |
|------|---------|------|
| EXA_API_KEY 未设置 | Step 0 环境检查 | 输出配置指引 + 提示设置后重试 |
| Exa MCP 超时（>30s） | 网络层超时 | 降级到 kf-web-search |
| API 配额耗尽 | 响应头 `X-RateLimit-*` | 提示用户，建议升级计划或等待 |
| 搜索结果为空 | 返回结果数 = 0 | 自动执行第 2/3 轮扩展搜索 |
| 搜索结果质量低 | 置信度 < 0.4 | 自动更换搜索类型（auto→deep） |
| 无效响应格式 | JSON 解析失败 | 重试 1 次，失败则降级 |

### 缓存策略

为节省 token 和提升响应速度，对重复查询使用本地缓存：

```
缓存键: MD5(查询内容 + searchType + lang)
缓存有效期: 24 小时
缓存存储: {IDE_ROOT}/skills/kf-exa-code/cache/
缓存容量: 最多 100 条，超出时淘汰最旧条目
```

---

## 配置与安装

### 环境变量

```bash
# 必需
export EXA_API_KEY="your-exa-api-key-here"

# 可选
export EXA_SEARCH_TYPE="auto"        # 默认搜索类型
export EXA_MAX_RESULTS="10"          # 默认最大结果数
export EXA_TIMEOUT_MS="30000"        # MCP 请求超时（毫秒）
export EXA_CACHE_TTL_HOURS="24"      # 缓存有效期（小时）
export EXA_CACHE_MAX_ENTRIES="100"   # 最大缓存条目数
```

### 在 settings.json 中注册

```json
{
  "skills": {
    "kf-exa-code": {
      "triggers": ["exa-code", "exa搜索", "代码搜索", "查代码示例"],
      "allowed_tools": ["WebSearch", "WebFetch", "Bash", "Read", "Write"],
      "env": {
        "EXA_API_KEY": "${EXA_API_KEY}"
      },
      "memory": {
        "recent_queries": 10,
        "cache_enabled": true
      }
    }
  }
}
```

### 安装后检查清单

- [ ] `EXA_API_KEY` 已添加到环境变量
- [ ] 运行 `/exa-code test` 验证连通性
- [ ] 运行 `/exa-code "Fetch API"` 验证基本搜索
- [ ] 确认 kf-model-router 在技能启动时自动切换模型

---

## 与现有技能的关系

### 互补关系（非替代）

| 技能 | 关系 | 说明 |
|------|------|------|
| kf-web-search | 互补 + 降级 | kf-exa-code 专注代码示例，kf-web-search 做通用搜索；Exa 不可用时 kf-exa-code 降级到 kf-web-search |
| kf-scrapling | 互补 | kf-exa-code 查代码，kf-scrapling 做深度页面内容采集 |
| kf-opencli | 互补 | kf-exa-code 查 API 用法，kf-opencli 查平台数据 |
| kf-spec | 被调用 | 编码阶段自动获取 API/SDK 示例 |
| kf-reverse-spec | 被调用 | 逆向阶段识别未知 API |
| kf-alignment | 被调用 | 对齐验证阶段确认技术方案 |
| kf-model-router | 自动调用 | 启动时切换至 flash 模型 |
| kf-token-tracker | 被调用 | 记录搜索 token 消耗 |

### 在自动调用链中的位置

```
kf-spec Step 6（编码执行）
  │
  └─ 检测到未知 API → 调用 kf-exa-code
       │
       ├─ Step 0: 环境诊断 → 调用 kf-model-router
       ├─ Step 1-4: 搜索流水线 → 通过 Exa MCP
       ├─ Step 5: 置信度评估
       │
       ├─ 成功 → 注入编码上下文 → 继续编码
       └─ 失败 → 降级到 kf-web-search → 继续编码
```

---

## 门控清单

### Gate 0 — 环境诊断门禁
- [ ] EXA_API_KEY 已配置
- [ ] Exa MCP 连通性正常
- [ ] 模型已切换至 flash
- [ ] 缓存系统可用

### Gate 1 — 查询理解门禁
- [ ] 核心技术名词已提取
- [ ] 搜索类型已选择
- [ ] 搜索参数已确认

### Gate 2 — 搜索结果门禁
- [ ] 至少 1 条相关结果
- [ ] 代码优先提取已完成
- [ ] 置信度评估已标注

### Gate 3 — 输出质量门禁
- [ ] 输出遵循极简模板
- [ ] 代码块包含来源标注
- [ ] 无冗余内容（< 500 token 典型值）

---

## Harness 铁律合规

### 铁律 1 — 稳定可靠
- 四层架构确保每层可独立测试
- 分层降级策略保证不因单点故障中断工作流
- 缓存机制减少外部依赖

### 铁律 2 — 门控阻断
- Gate 0 环境检查阻断不满足条件的执行
- 降级触发时显式通知用户

### 铁律 3 — 反馈闭环
- 每次搜索输出置信度评估
- 5 步流程中每步产出可验证
- 搜索质量低自动触发扩展搜索

### 铁律 4 — 记忆持久化
- 最近 10 条查询摘要存入 `memory/exa-code-log.md`
- 缓存持久化到磁盘

### 铁律 5 — 极简输出
- 单结果典型 < 200 token
- 整次调用典型 < 500 token
- 代码优先，去冗余

---

## 输出格式

### 成功响应

```markdown
## kf-exa-code 搜索结果

**查询**: {原始查询}
**策略**: {搜索类型} | {类别索引} | {搜索轮次}
**置信度**: {高/中/低}（评分: {N}/1.0）

### {API/库名}
```{language}
// 来源: {URL}#L{line}
{code block}
```

**版本**: v{version}+ | **来源**: {域名}

---

### 补充参考
- [{标题}]({URL})
- [{相关资源}]({URL})

---

_[共 {N} 条搜索结果 | 耗时 {X}s | token 消耗: {Y}]_
```

### 降级通知

```markdown
## kf-exa-code — 降级通知

当前 Exa MCP 不可用（原因: {超时/配额/连接失败}），
已自动降级到 kf-web-search 进行搜索。

降级影响:
- 搜索结果可能缺少代码优先排序
- 代码提取密度可能降低
- 置信度评估依赖 kf-web-search 结果质量

如需重试 Exa，请稍后再次调用 /exa-code。
```

### 空结果

```markdown
## kf-exa-code — 未找到结果

未找到与 "{查询}" 相关的代码示例。建议：

1. 简化查询词（去掉版本号/限定词）
2. 尝试同义词（如 "upload" → "multipart"）
3. 使用英文关键词搜索（如果当前是中文）
4. 换用 /web-search 进行更广泛的搜索
```

---

## 版本与维护

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v1.0 | 2026-05-08 | 初始技能定义，蓝队方案 |

