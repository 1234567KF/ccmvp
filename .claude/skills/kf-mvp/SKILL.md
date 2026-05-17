---
name: kf-mvp
description: >-
  Load when user asks to build an MVP prototype, rapid demo system, or
  quick-validation application with mock data. Prioritizes speed and
  demonstrability over production quality. Triggers: 原型系统, MVP, mvp,
  快速原型, MVP开发, 原型开发, 快速验证, demo系统, 原型演示. NOT for
  production code, performance optimization, security audit, or comprehensive
  testing.
metadata:
  pattern: pipeline + inversion + generator
  recommended_model: <当前对话模型>
  steps: "8"
  interaction: multi-turn
integrated-skills:
  - kf-alignment
  - kf-prd-generator
  - kf-spec
  - kf-browser-ops
graph:
  dependencies:
    - target: kf-prd-generator
      type: workflow  # Phase 2 调用
    - target: kf-spec
      type: workflow  # Phase 3 调用
---

# kf-mvp — 原型系统（MVP 快速通道）

> **核心价值**：设计阶段保留三队多视角竞争，实现阶段收敛为单队 TDD 落地。输出可演示、可宣讲的带暗门注释原型系统。

---

## Feature Flags

| Flag | 默认 | 说明 |
|------|------|------|
| `--team red` | OFF | 指定红队（激进创新）做 TDD |
| `--team blue` | **ON** | 蓝队（稳健工程）做 TDD — 默认 |
| `--team green` | OFF | 指定绿队（安全保守）做 TDD |
| `--no-mock` | OFF | 禁用 Mock，接入真实第三方（⚠️ 仅用于演示环境） |
| `--no-prototype` | OFF | 跳过 Phase 6 原型生成 |

---

## Pipeline 架构

> kf-mvp 采用 8 阶段 Pipeline 流水线，阶段间有明确门控和产物交接。
> Phase 4.5 任务拆分后，Phase 5 按模块依赖顺序调度子 Agent 并行 TDD。

### 流水线总览

```
Phase 0        Phase 1        Phase 2     Phase 3       Phase 4      Phase 4.5       Phase 5               Phase 6            Phase 7
技术栈确认  →  三队需求澄清  →  PRD生成  →  三队Spec生成  →  人类决策  →  SDD任务拆分  →  单队模块驱动TDD    →  暗门注释注入    →  使用说明
(主Agent)      (主Agent)      (主Agent)    (主Agent)      (用户)       (主Agent)       (主Agent+子Agent)     (子Agent:          (主Agent)
                                                                        产出:                               kf-annotate)
    │              │              │            │             │             │                  │                  │              │
    ▼              ▼              ▼            ▼             ▼             ▼                  ▼                  ▼              ▼
 技术栈确认   三队对齐记录    PRD.md    三队spec.md   选定队伍      spec.md           代码+模块TDD报告    暗门注入页面      USAGE.md
                                                                    tasks/<module>.md   progress.md更新    + 宣讲看板
                                                                    progress.md
```

### 阶段依赖链（DAG）

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 4.5 → Phase 5 → Phase 6 → Phase 7
  │         │         │         │         │         │           │         │           │
  ▼         ▼         ▼         ▼         ▼         ▼           ▼         ▼           ▼
Gate 0    Gate 1    Gate 2    Gate 3    Gate 4   Gate 4.5    Gate 5    Gate 6        Gate 7
                                               (任务拆分      (模块TDD   (暗门注释    (USAGE
                                                完整性验证)    全部GREEN)  注入完成)     自检通过)
```

### 模块级依赖调度（Phase 5 Stage 2 核心）

Phase 4.5 产出 `docs/tasks/progress.md` 标注模块依赖关系后，Phase 5 按以下规则调度：

```
主 Agent 读取 progress.md
  │
  ├── 无依赖模块（标注「可并行」）→ [并行] spawn 子 Agent A, B, C...
  │     └── 子 Agent: 模块内 RED → GREEN → REFACTOR → 上报主 Agent
  │
  ├── 有依赖模块 → 等待依赖模块 ✅ → spawn 子 Agent
  │     └── 子 Agent: 同上
  │
  └── 每个模块完成后 → 主 Agent 更新 progress.md（⏳→✅）
        │
        └── 全部模块 ✅ → 进入 Phase 5 Stage 3（浏览器测试）
```

| 调度规则 | 说明 |
|---------|------|
| **并发粒度** | 无依赖模块可同时启动子 Agent，最大化并行度 |
| **依赖等待** | 有依赖模块必须等待其依赖模块全部 ✅ 后才启动 |
| **进度追踪** | 主 Agent 通过 `docs/tasks/progress.md` 管理整体进度 |
| **失败隔离** | 单个模块失败不阻塞其他无依赖模块 |

---

## 上下文优化与可视化追踪（Context Engineering & Visual Tracking）

> **核心价值**：通过 **skill-loader 按需加载**（L3 缓存）降低上下文膨胀，通过 **agent-visual-dashboard** 让 MVP 执行全程透明可视。稳定可靠、节省 Token、高效直观。

### skill-loader — 按需技能加载（L3 缓存）

**启动时**（Phase 0 之前）运行：
```bash
node {IDE_ROOT}/helpers/skill-loader.cjs --optimize-for phase-0 --loaded kf-mvp > .tmp-skill-loader-phase-0.json
```

**每个 Phase 切换时**运行：
```bash
node {IDE_ROOT}/helpers/skill-loader.cjs --optimize-for <phase-id> --loaded <当前已加载技能,逗号分隔> > .tmp-skill-loader-<phase-id>.json
```

> ⚡ **L3 节省数据自动采集**：每次执行 skill-loader 后，必须紧接着调用以下命令记录节省数据到看板：
> ```bash
> node {IDE_ROOT}/helpers/extract-savings.cjs .tmp-skill-loader-<phase-id>.json
> ```
> `extract-savings.cjs` 会自动从 skill-loader 输出 JSON 中提取 `saved_tokens` 和 `compression_ratio_percent`，并调用 `log-opt --l3-stubs` 写入 turns.jsonl。

**加载规则**：
| 类型 | 处理方式 | Token 代价 |
|------|---------|-----------|
| `required` + `always_on` | **完整加载**（全文入上下文） | 实际 skill 大小 |
| `recommended` / `contextual` | **按需触发**（用户输入匹配 triggers 时才加载） | 0（未触发时） |
| 非当前阶段技能 | **元数据_stub**（保留 name + triggers + 一行描述） | ~25 tokens/技能 |

**不影响 L1 共享前缀缓存**：系统提示词前 200-500 tokens 保持不变，skill-loader 只控制 `### SHARED PREFIX END` 之后的差异化内容加载。

### agent-visual-dashboard — 多 Agent 状态看板

**以下时机 MUST 输出看板到对话**：
1. 每次 Gate 通过后（展示阶段进度总览）
2. 每次 spawn 子 Agent 时（展示 Agent 集群状态 + 谁在干什么）
3. 每次子 Agent 上报完成时（更新进度条 + Token 消耗）
4. Phase 5 每完成一个模块 TDD 后（更新模块 checklist 进度）
5. 用户输入 `/mvp status` 或 `status` 时（实时刷新）

**命令**：
```bash
# 生成完整 MVP 看板（Markdown 格式，直接输出到对话）
node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --mode mvp

# 紧凑单行状态条
node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --mode mvp --compact

# 记录 Agent 创建（spawn 时调用）
node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --agent-spawn --team <red|blue|green|default> --agent <名称> --task <任务ID>

# 标记 Agent 完成
node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --agent-done --team <队> --agent <名称>

# 标记 Agent 失败
node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --agent-fail --team <队> --agent <名称> --error "<原因>"

# 更新当前阶段进度
node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --phase <phase-id> --percent <0-100>
```

**自定义 Agent 追踪**：用户自行创建的 Agent 同样支持上述 `--agent-spawn/done/fail` 指令，看板会自动将其纳入「自定义 Agent 集群」区域展示。

**看板输出包含**：
- Phase 流水线进度条（Phase 0→7，当前 Phase 高亮）
- 活跃 Agent 状态表（运行中/已完成/失败，含耗时）
- 模块 TDD 进度表（RED→GREEN→REFACTOR 状态）
- Token 效率指标（输入/输出/CCP 节省/lean-ctx 压缩率）
- 交付产物清单（最近 6 个）

### perf-tracker — 全量执行追踪与优化节省面板

> **新增**：追踪每次人机对话轮次的模型使用、Token 消耗（输入未命中/输入缓存命中/输出），
> 以及各类优化机制节省明细（不含模型切换）。数据存于 `.claude-flow/perf/`，独立于 skill-traces。

**命令**：
```bash
# 记录一次人机对话轮次（AI 响应完成后调用）
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs log-turn --role ai --model <pro|flash> --tokens-in-uncached <N> --tokens-in-cached <N> --tokens-out <N> --phase <phase-id>

# 记录用户输入轮次（收到用户输入时调用）
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs log-turn --role human --model <pro|flash> --tokens-in-uncached <N> --tokens-in-cached <N> --tokens-out <N> --phase <phase-id>

# 记录 Agent→Agent 消息
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs log-a2a --from <agent> --to <agent> --skill <skill> --model <pro|flash> --tokens-in-uncached <N> --tokens-in-cached <N> --tokens-out <N> --protocol lambda|native --phase <phase-id>

# 记录优化节省明细
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs log-opt --turn-id <turn-id> --lean-ctx-raw <N> --lean-ctx-compressed <N> --l1-cache-hit <N> --l3-stubs <N> --ccp-skipped <N> --lambda-raw <N> --lambda-compressed <N>

# 输出实时看板
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs dashboard
```

**每个 Phase 执行完成后 MUST 调用 log-turn 记录 AI 轮次**。
每次涉及多 Agent 通信 MUST 调用 log-a2a 记录。
**最终交付时 MUST 调用 dashboard 输出完整看板**。

---

## Context Collection — 启动时

1. **记忆基线加载**：读取 `memory/mvp-generation-log.md` 最近 3 条（如存在），了解历史 MVP 项目的技术栈选择和遗留问题
2. 检查 `安装或更新/docs/mvp技术栈.md` 是否存在 → 存在则作为技术栈默认值
3. 扫描工作区依赖文件（`package.json` 等）了解现有技术栈
4. 若用户提供了 `.xlsx` 文件，检测是否为 SDD 模板 → 是则先走 `kf-prd-generator`

---

## Phase 0 — 技术栈确认与输入准备

### Step 0.1 — 技术栈确认

MUST 以 MVP 模式为默认技术栈，**极简原则**：

```
后端：Node.js + Hono + Drizzle + SQLite（better-sqlite3，14KB超轻框架）
前端：Vue 3 + Vite（运营Web：Ant Design Vue / H5：Vant）
第三方：全部 Mock（签名一致，可一键切真实服务）
部署：npm run dev 一键启动，零外部服务依赖

极简约束（几乎不考虑）：
❌ 缓存策略（Redis、内存缓存）
❌ 并发控制（队列、锁、事务隔离级别）
❌ 性能优化（索引调优、查询优化、分页优化、CDN）
❌ 安全加固（XSS/CSRF 防护、限流、输入净化）
❌ 日志系统（结构化日志、日志轮转、采集）
❌ 监控告警（健康检查端点除外）
```

询问用户确认或修改。若用户说「用当前技术栈」，则自动扫描项目依赖文件。

### Step 0.2 — 输入源处理

| 输入类型 | 处理方式 |
|---------|---------|
| `.xlsx` SDD 模板 | → 调用 `kf-prd-generator` 生成 PRD.md，以此为输入 |
| `.xlsx` 非 SDD | → 读取原始数据，作为需求参考 |
| 口述 / 文本 | → 直接进入 Phase 1 澄清 |
| 已有 PRD.md | → 跳过 Phase 2，以 PRD 为输入 |

### Gate 0 — 技术栈 MUST 确认后方可进入 Phase 1。

> **可视化**：Gate 0 通过后，运行 `node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --phase phase-0 --percent 100` 并输出看板到对话。

**追踪**：MUST 在此 Phase 完成后运行以下命令记录轮次。AI 自行估算 Token：上下文字符数÷4≈token 数，首次 Phase 缓存率≈0%。

> ⚡ **模型动态检测规则**：`--model <当前模型>` 中的 `<当前模型>` 必须替换为**执行本次对话的实际模型**（如 `flash`/`pro`/`kimi`/`minimax`）。AI MUST 感知当前会话使用的模型并如实填入，禁止沿用硬编码值。
> `--content` 可选，填写该阶段的核心输出摘要（如 "蓝队选定，技术栈确认"），不超过 100 字，将在看板中显示。
```bash
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-0 --role ai --model <当前模型> --input <输入token估算> --cache <缓存百分比> --output <输出token估算> --summary "Phase 0: 技术栈确认"
```

---

## Phase 1 — 三队需求澄清（Inversion + 多视角）

### Step 1.1 — 需求收集（Inversion）

一次性问清 MVP 的核心问题（与 kf-spec Step 1 对齐）：

- Q1: "目标用户是谁？（一个核心角色）"
- Q2: "核心要解决的问题是什么？"
- Q3: "本期 MVP 必须实现的范围？"
- Q4: "明确不做什么？"
- Q5: "涉及的第三方服务有哪些？（支付/短信/OSS/推送…）— 全部 Mock"

**轻量通道**（工时 ≤ 2 天）：用选择题形式。

### Step 1.2 — 三队对齐（串行，文件隔离）

三队（红/蓝/绿）依次执行需求对齐，产出入独立的对齐文件：

| 队 | 角色定位 | 产出 |
|----|---------|------|
| 红队 | 激进创新 — 探索新颖架构和方案 | `red-00-alignment.md` |
| 蓝队 | 稳健工程 — 可维护性、交付确定性 | `blue-00-alignment.md` |
| 绿队 | 安全保守 — 边界场景、数据安全 | `green-00-alignment.md` |

每队 MUST 产出：需求理解、边界确认、技术约束、补充假设清单。

### Gate 1 — 三队对齐记录全部产出后进入 Phase 2。

> **可视化**：Gate 1 通过后，运行 `node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --phase phase-1 --percent 100` 并输出看板。同时运行 `node {IDE_ROOT}/helpers/skill-loader.cjs --optimize-for phase-2 --loaded kf-mvp,kf-prd-generator` 更新上下文加载。

**追踪**：MUST 在此 Phase 完成后运行以下命令记录轮次和三队 A2A 通信：
```bash
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-1 --role ai --model <当前模型> --input <输入token估算> --cache <缓存百分比> --output <输出token估算> --summary "Phase 1: 三队需求澄清"
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-1 --role a2a --from coordinator --to red --model flash --input <估算> --cache 0 --output <估算> --summary "红队对齐"
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-1 --role a2a --from coordinator --to blue --model flash --input <估算> --cache 0 --output <估算> --summary "蓝队对齐"
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-1 --role a2a --from coordinator --to green --model flash --input <估算> --cache 0 --output <估算> --summary "绿队对齐"
```

---

## Phase 2 — PRD 生成

调用 `kf-prd-generator`，以其完整 Phase 1→2 流程生成结构化 PRD.md。

**简化**：若输入已足够清晰（口述需求 + Phase 1 澄清充分），可跳过完整 PRD 流程，直接生成轻量 PRD。

### Gate 2 — PRD.md 存在且通过机械化验证。

> **可视化**：Gate 2 通过后，运行 `node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --phase phase-2 --percent 100` 并输出看板。同时运行 `node {IDE_ROOT}/helpers/skill-loader.cjs --optimize-for phase-3 --loaded kf-mvp,kf-spec` 更新上下文加载（PRD 阶段技能可卸载）。

**追踪**：MUST 在此 Phase 完成后运行以下命令记录轮次：
```bash
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-2 --role ai --model <当前模型> --input <输入token估算> --cache <缓存百分比> --output <输出token估算> --summary "Phase 2: PRD生成"
```

---

## Phase 3 — 三队 Spec 生成
### Step 3.1 — 三队各自出 Spec（并行，严格隔离）

三队基于同一份 PRD.md + CONTEXT.md **并行**生成各自 Spec，最大化效率。

#### 三队并发隔离机制（关键）

```
┌─────────────────────────────────────────────────────────────┐
│                    主 Agent（协调者）                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   红队 Agent │  │   蓝队 Agent │  │   绿队 Agent │         │
│  │   (激进创新)  │  │   (稳健工程)  │  │   (安全保守)  │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                │
│         ▼                ▼                ▼                │
│    只读: PRD.md     只读: PRD.md     只读: PRD.md          │
│    只读: CONTEXT.md 只读: CONTEXT.md 只读: CONTEXT.md      │
│         │                │                │                │
│         ▼                ▼                ▼                │
│    写入: red-*      写入: blue-*     写入: green-*         │
│    (隔离输出)        (隔离输出)       (隔离输出)             │
└─────────────────────────────────────────────────────────────┘
```

**隔离规则**：
| 维度 | 规则 | 说明 |
|------|------|------|
| **输入只读** | 三队只能读取 `docs/prd.md` + `docs/CONTEXT.md` + 公共输入 | 禁止读取其他队的产出 |
| **输出隔离** | 红队只能写 `red-*` 前缀文件 | 蓝队只能写 `blue-*` 前缀文件 |
| **文件锁** | 主 Agent 通过文件命名约定实现逻辑隔离 | 非强制锁，依赖命名规范 |
| **上下文隔离** | 每个子 Agent 独立会话，不共享上下文 | 天然隔离，无交叉污染 |

**子 Agent 输入契约**：
```
输入（只读）:
  - docs/prd.md
  - docs/CONTEXT.md
  - docs/spec.md（如有，作为参考）

输出（写入）:
  - {team}-spec.md          # Spec 主文档
  - {team}-00-alignment.md  # 对齐记录（Phase 1 产物）

禁止:
  - 读取其他队的 red-* / blue-* / green-* 文件
  - 写入非本队前缀的文件
  - 修改 docs/prd.md / docs/CONTEXT.md
```

#### 执行方式

**通用 IDE 环境（当前环境）**：
- 子 Agent 类型选择 `Browser` 或 `CodeReview`（非 Guide）
- **关键**：Browser Agent 无法直接写文件 → 子 Agent 返回完整内容，**主 Agent 负责写入文件**
- 三队子 Agent 并行 spawn，各自返回 Markdown 内容
- 主 Agent 收集三队输出，分别写入 `red-spec.md` / `blue-spec.md` / `green-spec.md`

**Qoder/Claude Code 环境**：
- 子 Agent 可直接写文件，三队真正并行
- 主 Agent 只需监控进度，无需中转内容

#### 三队侧重

| 队 | 产出文件 | 侧重 |
|----|---------|------|
| 红队 | `red-spec.md` | 新颖架构、前沿方案、探索性设计 |
| 蓝队 | `blue-spec.md` | 稳健架构、可维护、标准最佳实践 |
| 绿队 | `green-spec.md` | 安全架构、边界完备、异常处理 |

⛔ **技术栈铁律**：三队必须以极简默认技术栈（Vue3 + Hono + Drizzle + SQLite）为约束。竞争焦点是业务逻辑、数据模型、架构方案，**严禁各队提出替代技术栈**。技术栈不可选。

每队 Spec 必须包含：业务架构方案、数据模型、API 契约、业务状态流转、任务拆解。

**MVP Spec 极简约束**：Spec 中以下章节可标注「MVP 阶段跳过」：
- 缓存策略 → ❌ 跳过
- 并发控制 → ❌ 跳过
- 性能指标 → ❌ 跳过
- 安全方案（认证基础 JWT 除外）→ ❌ 跳过
- 日志与监控 → ❌ 跳过（仅保留 console.log）

⛔ **以下章节禁止标注跳过**：
- 业务状态流转定义 → ✅ **必须完整定义**（正常路径 + 每条业务失败路径）
- 每条业务分支的界面差异 → ✅ **必须描述**（成功页/失败页/驳回页等的 UI 差异）
- 数据表字段定义 → ✅ **必须完整**（不因极简砍字段）

### Step 3.2 — 质量门禁

三队 Spec 均需通过 kf-spec 的 Gate 4 综合质量门禁。**但安全/性能/并发相关检查项可标为 N/A（MVP 豁免）。** 未通过的队伍回退修复，最多 2 轮。

### Gate 3 — 三队 Spec 全部通过质量门禁。

> **可视化**：Gate 3 通过后，运行 `node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --phase phase-3 --percent 100` 并输出看板。三队 Spec 文件名（red-spec.md / blue-spec.md / green-spec.md）作为产物在看板「交付产物」区展示。

**追踪**：MUST 在此 Phase 完成后运行以下命令记录轮次和三队 Spec A2A：
```bash
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-3 --role ai --model <当前模型> --input <输入token估算> --cache <缓存百分比> --output <输出token估算> --summary "Phase 3: 三队Spec生成"
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-3 --role a2a --from coordinator --to red --model flash --input <估算> --cache 0 --output <估算> --summary "红队Spec"
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-3 --role a2a --from coordinator --to blue --model flash --input <估算> --cache 0 --output <估算> --summary "蓝队Spec"
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-3 --role a2a --from coordinator --to green --model flash --input <估算> --cache 0 --output <估算> --summary "绿队Spec"
```

---

### Step 3.5 — 对抗质疑清单（Challenge Inventory）

> 这是对抗质疑机制的轻量版，在人类决策前 AI 主动识别三队方案中的潜在风险点。

质疑清单 MUST 在 Phase 4 之前自动生成，包含以下维度（每维度至少 1 条）：

| 维度 | 定义 | 示例 |
|------|------|------|
| **方案完整性** | 是否覆盖所有核心场景？有无遗漏？ | "红队未定义XX失败路径的异常处理" |
| **实现风险** | 哪些部分有技术复杂度或实现不确定性？ | "蓝队推荐的新库团队是否熟悉？" |
| **边界场景** | 各队对边界条件的处理是否充分？ | "绿队在并发场景未定义超时机制，但MVP可接受" |
| **一致性** | 各队方案间是否存在矛盾或冲突？ | "红蓝绿在XX字段类型上的定义不一致" |
| **MVP 适配度** | 方案是否过于复杂（过度工程）或过于简单（无法验证核心价值）？ | "红队引入了完整的微服务架构，对MVP验证来说过度设计" |

**生成规则**：
1. 读取三队对齐记录 + 三队 Spec 全部产物
2. 逐维度分析，每条质疑标注来源队伍
3. 输出到 `challenge-inventory.md`
4. 在 Phase 4 对比表中引用质疑清单中的关键条目

**质疑调性要求**：
- 不攻击方案，只指出可改进点
- 标注风险等级：🔴 P0（阻断）/ 🟡 P1（重要）/ 🔵 P2（建议）
- 每条质疑附带来源队伍的原始观点引用

- **产出**：`challenge-inventory.md`
- **门控**：产出存在即通过

---

## Phase 4 — 人类决策

### Step 4.1 — 呈现对比

将三队方案的核心差异以对比表呈现给用户，包含评分维度：

```
### 三队方案对比

#### 评分矩阵

| 评分维度 | 权重 | 红队 | 蓝队 | 绿队 | 说明 |
|---------|------|------|------|------|------|
| **方案完整性** | 30% | X/10 | X/10 | X/10 | 覆盖全部核心场景、失败路径完整 |
| **可维护性** | 20% | X/10 | X/10 | X/10 | 代码结构清晰、模块化好、团队熟悉度 |
| **MVP 适配度** | 20% | X/10 | X/10 | X/10 | 方案复杂度与MVP验证目标匹配度 |
| **实现确定性** | 20% | X/10 | X/10 | X/10 | 技术风险低、实现路径明确 |
| **创新性** | 10% | X/10 | X/10 | X/10 | 架构/方案新颖度和演进潜力 |
| **总分** | **100%** | **X.X** | **X.X** | **X.X** | 加权合计 |

#### 核心差异对比

| 维度 | 红队（激进） | 蓝队（稳健）⭐默认 | 绿队（安全） |
|------|------------|-----------------|------------|
| 方案特色 | ... | ... | ... |
| 技术栈 | Vue3+Hono+Drizzle+SQLite（统一） | Vue3+Hono+Drizzle+SQLite（统一） | Vue3+Hono+Drizzle+SQLite（统一） |
| 数据模型 | ... | ... | ... |
| API 设计 | ... | ... | ... |
| 核心优势 | ... | ... | ... |
| 主要风险 | ... | ... | ... |
| 预估工时 | Xh | Yh | Zh |

**参考：** `challenge-inventory.md` 中的质疑清单
```

### Step 4.2 — 人类选择

询问用户选择哪队方案落地。默认蓝队。

```
请选择落地执行的方案：
A. 红队 — 激进创新方案（适合探索性 MVP）
B. 蓝队 — 稳健工程方案 ⭐（默认，适合大多数 MVP）
C. 绿队 — 安全保守方案（适合涉及敏感数据的 MVP）
D. 融合 — 手动指定各维度取哪队的方案

当前选择：[B] 蓝队
```

### Gate 4 — 用户 MUST 明确选择后方可进入 Phase 5。

**追踪**：Gate 4 用户选择后，MUST 运行以下命令记录用户的决策轮次：
```bash
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-4 --role human --model <当前模型> --input <输入token估算> --cache <缓存百分比> --output <输出token估算> --summary "Phase 4: 用户决策选定队伍"
```

---

## Phase 4.5 — SDD 任务拆分（模块驱动开发准备）

> **核心价值**：将选定队伍的 Spec 拆分为可独立执行的模块任务文件，为 Phase 5 TDD 自循环提供模块级并行执行基础。
> 此阶段融入 kf-sdd 的任务拆分能力——按模块产出独立任务文件、进度追踪文件，主 Agent 通过 progress.md 管理整体进度。

### Step 4.5.1 — 生成统一文档

1. 将选定队伍的 Spec（`{team}-spec.md`）复制/转换为 `docs/spec.md`（若不存在）
2. 若 `docs/prd.md` 不存在，从 Phase 2 PRD 产物生成 `docs/prd.md`
3. 验证 spec.md 包含：模块划分、数据模型、API 契约、依赖关系

### Step 4.5.2 — 逐模块任务拆分

基于 `docs/spec.md` 的模块划分，逐个模块拆解：

1. **识别模块** — 从 Spec 中提取所有功能模块
2. **模块独立性验证** — 确认每个模块可独立测试，模块间依赖最小化
3. **逐模块拆解最小任务**：
   - 每个任务 MUST 是可独立执行的最小单元
   - 单任务预估工时 ≤ 2 小时
   - 每个任务有明确的输入（Spec 章节）和输出（文件路径）
4. **生成模块任务文件**：
   - 每个模块一个 `docs/tasks/<module-name>.md`
   - 使用 checklist 表示子任务完成状态
   - 格式：`- [ ] T{编号}: {任务描述} — 预估 {X}h — 产出 {文件路径}`

### Step 4.5.3 — 生成总体进度文件

生成 `docs/tasks/progress.md`：
- 使用 checklist 表示各模块完成状态
- 格式：`- [ ] {模块名} — {N} 个子任务 — 预估 {X}h — 状态：⏳待开始`
- 标注模块间依赖关系（无依赖模块标注「可并行」）

### 任务文件模板

```markdown
# {模块名} — 任务清单

> 预估总工时：{X}h | 依赖模块：{列出或"无"} | 状态：⏳待开始

## 子任务

- [ ] T001: {任务描述} — 预估 {X}h — 产出 `{文件路径}`
- [ ] T002: {任务描述} — 预估 {X}h — 产出 `{文件路径}`

## 测试任务

- [ ] T{编号}: 为以上功能编写单元测试 — 预估 {X}h — 产出 `{测试文件路径}`
```

### progress.md 模板

```markdown
# 总体进度

> 更新时间：{date} | 总模块数：{N} | 已完成：{M}

## 模块进度

- [ ] {模块1} — {N} 个子任务 — 预估 {X}h — 🔗 依赖：无 → 可并行 — 📎 
- [ ] {模块2} — {N} 个子任务 — 预估 {X}h — 🔗 依赖：{模块1} — 📎 
- [ ] ...
```

> **📎 列说明**：每个模块完成后，链接到对应的物化文件（如 `{team}-05-test-report.md`、`{team}-25-build-report.md`）。禁止仅口头确认完成，必须有物化文件链接。

### 核心规则

- **模块独立性**：每个模块可独立编译/运行/测试
- **最小可执行**：单任务 ≤ 2h，不可再拆分
- **checklist 格式强制**：所有任务文件和 progress.md MUST 使用 `- [ ]` 格式
- **每个模块 MUST 有测试任务**
- **不猜测意图**：模块边界模糊或依赖关系不清晰时 MUST 向用户确认

### Gate 4.5 — 任务拆分 MUST 满足以下条件方可进入 Phase 5：
- [ ] `docs/spec.md` 已生成
- [ ] `docs/prd.md` 已生成
- [ ] 每个 Spec 模块都有对应的 `docs/tasks/<module>.md`
- [ ] 每个任务是最小可执行单元（不可再拆）
- [ ] 每个任务有明确产出文件路径
- [ ] 每个模块包含测试任务
- [ ] `docs/tasks/progress.md` 包含所有模块的 checklist + 依赖关系
- [ ] 业务失败路径被纳入任务拆解（非仅「happy path」）
- [ ] 涉及多状态分支的模块标注了「需业务路径选择器」

> **可视化**：Gate 4.5 通过后，运行 `node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --phase phase-5 --percent 0` 并输出看板。同时运行 `node {IDE_ROOT}/helpers/skill-loader.cjs --optimize-for phase-5 --loaded kf-mvp,kf-spec,kf-browser-ops` 加载编码阶段所需技能（设计阶段技能卸载，节省上下文）。

**追踪**：MUST 在此 Phase 完成后运行以下命令记录轮次：
```bash
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-4.5 --role ai --model <当前模型> --input <输入token估算> --cache <缓存百分比> --output <输出token估算> --summary "Phase 4.5: SDD任务拆分"
```

---

## Phase 5 — 单队加强 TDD 开发（多视角全覆盖 + 自循环 + 浏览器验证）

> **核心原则**：单队执行，但融入红/蓝/绿三队思想，从多视角生成尽可能多的测试用例和路径。自循环测试直到全路径通过，最终经无头浏览器自动化验证。
> **编码极简**：不使用缓存层、不引入并发控制、不做性能优化、不添加安全中间件（JWT 认证除外）。但测试覆盖不能极简——能测的路径都要测。
> **业务逻辑真实落地**：所有设计的功能/流程/界面数据 MUST 真实实现。第三方服务 Mock 但业务处理逻辑不能跳过。业务失败路径 MUST 实现 Business Path Selector 悬浮选择器，演示者可切换观察不同业务分支。

### 🤖 编码阶段模型路由偏好

> Phase 5 编码/TDD 阶段涉及大量代码生成，优先使用编码能力最强的模型。

| 优先级 | 模型 | 说明 |
|--------|------|------|
| **P0 首选** | **Kimi 2.6**（最新可用版本） | 编码能力最强，长上下文处理代码文件 |
| **P1 降级** | **DeepSeek V4 Flash** | 速度快，编码质量高，成本低 |
| **P2 兜底** | DeepSeek Pro / MiniMax | 仅当前两个不可用时 |

**路由规则**（节流者·模型路由）：
1. 进入 Phase 5 时，MUST 检查当前会话模型是否为 Kimi 2.6
2. 若不是 → 提示用户手动切换：`建议切换模型为 Kimi 2.6（编码最优），或 DeepSeek V4 Flash（高速备选）`
3. 设计阶段（Phase 1-4）和原型阶段（Phase 6-7）不做模型限制，使用默认 pro 模型即可
4. **子 Agent spawn 时**：前端模块 → 推荐 DeepSeek V4 Flash（成本低，够用）；后端/API 模块 + 复杂逻辑 → 推荐 Kimi 2.6（编码最强）

### TDD 加强流水线

```
Stage 0.5              Stage 2                   Stage 2.5              Stage 3               Stage 4
多视角测试设计    →    TDD 微循环自循环    →    编译门禁          →    浏览器自动化测试  →  清空DB+经典流程回放
(红蓝绿三视角融合)    (RED→GREEN→REFACTOR      (tsc+vite+组件+ESM)    (kf-browser-ops       (从头验证所有核心流程)
 尽可能多测试用例)     直到全部 GREEN)           全部通过方可进入)       全路径端到端验证)
```

---

### Stage 0.5 — 多视角测试设计先行

- **执行者**：当前 AI（QA 角色）
- **输入**：选定队伍的 Spec + 三队 PRD/Spec 全部产物
- **核心要求**：融合红蓝绿三队视角，尽可能多地生成测试用例

#### 三视角融合策略

| 视角 | 来源 | 测试侧重 | 生成用例类型 |
|------|------|---------|------------|
| 🔴 红队激进 | `red-spec.md` | 探索性场景、非常规操作路径 | 越权操作、异常输入、非预期流程跳转 |
| 🔵 蓝队稳健 | `blue-spec.md` | 核心业务流程、数据一致性 | 标准 CRUD 全路径、状态流转、数据校验 |
| 🟢 绿队安全 | `green-spec.md` | 边界条件、权限边界、数据安全 | 空数据/极值/并发模拟/角色越界 |

#### 测试用例生成规则

从三队 Spec 中提取以下维度的测试场景，**尽可能全面**：

| 维度 | 内容 | 最低数量 |
|------|------|---------|
| **功能流程** | 每个功能的完整 Happy Path | 每功能 ≥ 2 条 |
| **规则边界** | 字段校验、业务规则边界值 | 每规则 ≥ 1 条 |
| **异常路径** | 无效输入、过期状态、资源不存在 | 每模块 ≥ 2 条 |
| **角色权限** | 不同角色的可见性/可操作性 | 每角色 ≥ 1 条 |
| **状态流转** | 实体生命周期各状态节点的合法/非法跳转 | 每状态 ≥ 1 条 |

**生成动作**：
1. 读取三队 Spec + 三队对齐记录
2. 按上述维度逐项提取场景，生成完整测试文件
3. 每个场景写完整断言（禁止 `it.todo`、禁止空断言）
4. RED 验证：确认测试编译成功 + 全部预期失败

- **产出**：`{team}-05-tests/` + `{team}-05-scenarios.json`（含三视角标注）+ `{team}-05-test-report.md`（物化测试报告）
- **门控**：测试编译成功 ✅ | 全部 RED ✅ | 覆盖 5 维度 ✅
- **验证命令**：`node {IDE_ROOT}/helpers/mvp-tdd-gate-check.cjs --stage 0.5 --output {team}-05-test-report.md`（**禁止 AI 口头判断**）

---

### Stage 2 — 模块驱动 TDD 微循环

> **核心升级**：融合 kf-sdd 的模块拆分 + 进度追踪能力。主 Agent 通过 `docs/tasks/progress.md` 管理整体进度，按模块依赖顺序逐个执行 TDD。无依赖模块可并行执行（主 Agent spawn 多个子 Agent 同时开工）。
>
> ⛔ **节流者（Throttler）集成**：此处使用 `claude-code-pro`（CCP）智能判断是否值得 spawn + `lean-ctx` 压缩产物传递 + `kf-model-router` 最优模型路由。三条规则见下方。

#### 2.0 启动前 — 读取进度文件

**MUST** 在开始编码前执行：
1. 读取 `docs/tasks/progress.md` 确认当前进度与模块依赖关系
2. 读取 `docs/spec.md` 了解各模块的接口契约
3. 识别「可并行」标注的模块（无依赖模块可同时启动子 Agent）
4. **CCP 节流判断**：检查剩余模块数 + 文件复杂度——
   - 剩余模块 < 3 且依赖简单 → **跳过 spawn**，直接在当前会话依次执行（省 10K-15K token）
   - 剩余模块 ≥ 3 或依赖复杂 → 走下方 spawn 调度流程

```
┌──────────────────────────────────────────────────────────┐
│  模块驱动 TDD 执行模型                                     │
│                                                          │
│  主 Agent（进度追踪）                                      │
│  ├── 读取 progress.md → 确定执行顺序                       │
│  ├── 无依赖模块 → [并行] spawn 子 Agent A, B, C...        │
│  ├── 有依赖模块 → 等待依赖完成后 spawn 子 Agent             │
│  └── 每个模块完成后 → 更新 progress.md ✅                   │
│                                                          │
│  子 Agent（模块 TDD）                                      │
│  ┌──────────┐    ┌──────────┐    ┌────────┐              │
│  │ RED 验证  │ → │ GREEN 实现│ → │REFACTOR│              │
│  │(预期失败) │    │(最小实现) │    │(保持绿)│              │
│  └──────────┘    └──────────┘    └────────┘              │
│       ↑                              │                   │
│       │     模块内还有测试 ←──────────┘                   │
│       │                              │                   │
│       └── 模块全部 GREEN → 上报主 Agent ─┘                │
└──────────────────────────────────────────────────────────┘
```

#### 2.1 主 Agent 调度流程

1. **读取 progress.md** → `ctx_read docs/tasks/progress.md reference`（仅取模块状态和依赖关系，省 token）
2. **分批启动子 Agent**：
   - 第一批：所有「依赖：无」标注的模块 → 并行 spawn 子 Agent
   - 后续批次：依赖模块完成后 → 立即 spawn 下一批
   - **每次 spawn 后 MUST 记录 Agent 状态**：
     ```bash
     node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --agent-spawn --team <队> --agent "<模块名>-dev" --task "<模块名>"
     ```
   - **spawn 完成后 MUST 输出看板**：`node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --mode mvp`
3. **等待子 Agent 结果**（使用 `lean-ctx` 压缩读取子 Agent 产出，避免全文入上下文）：
   - 子 Agent 完成后 → `ctx_read {team}-02-tdd-cycle-{module}-final.md map` 取最终状态
   - 主 Agent 验证测试通过
   - 更新 `docs/tasks/<module>.md` 的 checklist（勾选已完成任务）
   - 更新 `docs/tasks/progress.md` 的模块状态（⏳→🔄→✅）
   - **标记 Agent 完成并刷新看板**：
     ```bash
     node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --agent-done --team <队> --agent "<模块名>-dev"
     node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --mode mvp
     ```
4. **全部模块完成** → 进入 Stage 3

#### 2.2 子 Agent 模块内 TDD 微循环

每个子 Agent 在单个模块内执行 TDD：

**每轮循环（Cycle N）**：
1. **RED 验证**：从 `{team}-05-tests/` 中筛选本模块的测试用例（1-3 个）→ 确认全部预期失败
2. **GREEN 实现**：写最小代码让当前组测试通过 → **禁止超前实现（不写其他模块的代码）**
3. **REFACTOR**：保持 GREEN，优化代码结构 → 运行 `ctx_read {IDE_ROOT}/rules/mvp-coding-checklist.md` 逐项自检
4. 输出 `{team}-02-tdd-cycle-{module}-N.md` → 进入下一组

**模块内终止条件**：
- ✅ 本模块全部测试 GREEN → 上报主 Agent
- ⚠️ 最多 8 轮循环 → 仍有失败则标记 UNRESOLVED，主 Agent 记录到 progress.md

#### 2.3 子 Agent 输入/输出契约

每个子 Agent MUST 有明确的输入输出边界：

| 契约项 | 说明 |
|--------|------|
| **输入**（lean-ctx 压缩读取） | `ctx_read docs/spec.md map`（模块章节） + `ctx_read docs/tasks/<module>.md reference`（任务清单） + `{team}-05-tests/` 本模块测试 |
| **输出**（lean-ctx 压缩传递） | 本模块代码文件 + `ctx_write {team}-02-tdd-cycle-{module}-final.md`（仅写最终状态摘要，非全文） |
| **完成标志** | 本模块全部测试 GREEN + checklist P0 通过 |
| **禁止事项** | 修改其他模块代码 / 引入模块外依赖 / 超前实现非本模块功能 |

#### 2.4 硬性规则

1. 测试先行：编码前 MUST 读取 Stage 0.5 测试文件中本模块的测试
2. RED 验证：确认测试预期失败
3. GREEN 实现：写最小代码让测试通过，禁止超前实现（含跨模块）
4. 禁止先实现后补测试 — 检测到则删除代码重新从 RED 开始
5. 模块隔离：子 Agent 只修改本模块代码，跨模块依赖通过已有接口契约
6. 进度更新：主 Agent 每完成一个模块 MUST 更新 progress.md
7. **测试验证 MUST 脚本化**：禁止 AI 口头判断"测试通过"，MUST 执行 `test-gate.mjs` 并读取物化报告

- **产出**：代码文件 + `{team}-02-tdd-cycle-{module}-*.md`（每模块每轮循环报告）+ `docs/tasks/<module>.md`（已勾选）+ `docs/tasks/progress.md`（已更新）+ `{team}-05-test-report.md`（测试执行报告）
- **门控**：全部模块测试 GREEN ✅ | progress.md 全部模块标记 ✅
- **验证命令**：`node {IDE_ROOT}/helpers/test-gate.mjs --cmd "npm test" --expected-pass-rate 100 --output {team}-05-test-report.md`
- **多轮循环条件**：`test-gate.mjs` 报告通过率 < 100% 时继续 TDD 微循环，≥ 100% 时终止

---

### Stage 2.5 — 编译门禁（强制阻断）

> **核心价值**：TDD 只测逻辑不测编译。Stage 2.5 在进入浏览器测试之前强制执行编译检查，确保代码可构建、组件合规、ESM 兼容。
> **此阶段为 P0 阻断**：编译门禁未通过，不得进入 Stage 3。

- **执行者**：当前 AI（调用 `build-gate.mjs`）
- **输入**：Stage 2 全部代码产物
- **动作**：

```bash
node {IDE_ROOT}/helpers/build-gate.mjs \
  --tsconfig ./tsconfig.json \
  --build-cmd "npm run build" \
  --component-inventory {IDE_ROOT}/skills/kf-mvp/references/component-inventory.md \
  --esm-check \
  --output {team}-25-build-report.md
```

**四项检查**：

| # | 检查项 | 命令/方式 | 说明 |
|---|--------|----------|------|
| 1 | TypeScript 编译 | `tsc --noEmit` | 零错误编译通过 |
| 2 | 前端构建 | `npm run build` / `vite build` | Vite 构建成功，产出 dist/ |
| 3 | 组件存在性校验 | 对照 `component-inventory.md` | 禁止使用不存在的组件（如 van-table） |
| 4 | ESM 兼容性 | 扫描 `__dirname` / `require()` | 在 ESM 项目中检测 CJS 残留 |

**ESM 脚手架参考**：`{IDE_ROOT}/skills/kf-mvp/references/esm-scaffold.md` 提供 `__dirname`→`import.meta.url`、`require`→`import` 等替代方案。

- **产出**：`{team}-25-build-report.md`（编译门禁报告）
- **门控**：报告结论 PASS 方可进入 Stage 3 ✅
- **失败处理**：
  1. 读取 `{team}-25-build-report.md` 定位具体错误
  2. 回退 Stage 2 修复（修正导入、替换违规组件、修复 ESM 兼容）
  3. 修复完成后 **MUST** 重新运行 `build-gate.mjs` 直到 PASS
  4. **MUST** 接着运行 `regression-runner.mjs --from-stage 2 --to-stage 2.5` 确保修复未引入新的 TDD 失败

> **可视化**：Gate 2.5 通过后，运行 `node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --phase phase-5 --sub-stage 2.5 --percent 100`。

**追踪**：MUST 运行以下命令记录轮次：
```bash
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-5 --role ai --model flash --input <输入token估算> --cache <缓存百分比> --output <输出token估算> --summary "Phase 5 Stage 2.5: 编译门禁"
```

---

### Stage 3 — 浏览器自动化测试（kf-browser-ops）

> 端到端验证：启动应用 → 无头浏览器自动走通所有核心路径 → 截图存档。

- **执行者**：当前 AI（调用 `kf-browser-ops`）
- **输入**：Stage 2 代码 + Stage 0.5 测试场景矩阵
- **动作**：
  1. 启动应用（`npm run dev`）
  2. 调用 `kf-browser-ops` 打开关键页面
  3. 按测试场景矩阵逐条走通核心流程：
     - 列表页：搜索 → 筛选 → 分页 → 查看详情
     - 表单页：新建 → 填写 → 校验 → 提交 → 回显
     - 详情页：查看 → 编辑 → 删除确认
     - 状态流转：各状态节点间的合法/非法跳转
  4. 每个关键步骤截图存档到 `{team}-03-screenshots/`
  5. 失败路径记录到 `{team}-03-browser-report.md`

- **门控**：核心 Happy Path 全部通过 ✅ | P0 阻断错误 = 0 ✅
- **失败处理**：P0 错误 → 回退 Stage 2 修复 → **MUST** 执行 `regression-runner.mjs --from-stage 2 --to-stage 3 --rerun-build --output regression-report.md` 完整回归验证 → 重新进入 Stage 3
- **产出**：`{team}-03-browser-report.md` + `{team}-03-screenshots/`

---

### Stage 4 — 清空数据库 + 经典业务流程从头回放

> **MVP 特色能力**：支持一键清空数据库，让 AI 或人类从零开始跑通所有经典业务流程。

#### 4.1 清空数据库功能

MVP 必须内置「重置系统」能力：

```
前端：提供「清空数据」按钮（仅开发/演示模式可见）
后端：POST /api/system/reset
  → 清空所有业务表数据
  → 重新插入 Mock 种子数据
  → 返回初始状态
```

**实现要求**：
- SQLite：`DELETE FROM {table}` 逐表清空 + 重新 `seed()`
- 前端按钮放在页面底部或设置区，标注「🧹 重置演示数据」
- 清空前弹出确认框：「将清空所有数据并重新初始化，确定继续？」

#### 4.2 经典业务流程脚本

基于 PRD 中定义的核心业务场景，生成 **经典流程回放脚本**：

```javascript
// scripts/replay-classic-flows.js
// 可被 AI 或人类直接执行，从头走通所有核心业务流程

async function replayFlows() {
  // 1. 清空数据库
  await api.post('/api/system/reset');
  
  // 2. 经典流程 1：用户注册 → 登录 → 创建资源
  const user = await api.post('/api/auth/register', { ... });
  const token = await api.post('/api/auth/login', { ... });
  const resource = await api.post('/api/resource', { ... }, { headers: { Authorization: token } });
  
  // 3. 经典流程 2：资源编辑 → 状态变更 → 删除
  // ...
  
  console.log('✅ 所有经典流程回放完成');
}

replayFlows();
```

**回放脚本要求**：
- 每个经典流程对应 PRD 中的一个核心用户场景
- 使用与前端相同的 API 调用（确保 API 契约一致性）
- 每步输出 `✅/❌` 状态，失败时中断并报告
- 支持 `node scripts/replay-classic-flows.js` 一键执行

#### 4.3 浏览器回放验证

回放脚本通过后，调用 `kf-browser-ops` 在浏览器中重放关键页面：
- 清空后首页 → 确认空态展示正确
- 注册新用户 → 确认注册流程通畅
- 执行业务操作 → 确认数据实时更新
- 截图存档 → `{team}-04-replay-screenshots/`

- **产出**：`scripts/replay-classic-flows.js` + `{team}-04-replay-report.md`
- **门控**：所有经典流程回放通过 ✅ | 浏览器验证截图无异常 ✅

---

### Mock 策略

所有第三方服务 MUST 使用 Mock：

| 第三方服务 | Mock 方式 | 切换真实服务 |
|-----------|----------|------------|
| 支付 | `mockPaymentService` — 返回固定成功响应 | 替换 `src/services/payment.js` |
| 短信 | `mockSmsService` — console.log 代替发送 | 替换 `src/services/sms.js` |
| OSS/存储 | `mockStorageService` — 本地 `uploads/` 目录 | 替换 `src/services/storage.js` |
| 推送 | `mockPushService` — 记录到 `mock-push-log.json` | 替换 `src/services/push.js` |

**Mock 签名规范**：每个 Mock 服务的函数签名 MUST 与真实服务完全一致（参数名、返回类型、异常类型）。切换时仅需替换 import 路径。

**Mock 数据要求**：
- 使用逼真的演示数据（中文姓名、合理金额、真实时间戳）
- 5-8 条数据，至少 3 种状态变化
- 支持「🧹 重置演示数据」按钮（调用 Stage 4 的清空数据库接口）

---

### Gate 5 — Stage 4 全部通过后方可进入 Phase 6。

> **可视化**：Gate 5 通过后，运行 `node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --phase phase-5 --percent 100` 并输出看板。模块 TDD 全部 GREEN 的汇总在看板「模块进度」区展示。

**追踪**：MUST 在此 Phase 完成后运行以下命令记录轮次和子 A2A。每个子 Agent spawn 记一条 A2A：
```bash
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-5 --role ai --model flash --input <输入token估算> --cache <缓存百分比> --output <输出token估算> --summary "Phase 5: 模块TDD编码"
```
子 Agent 示例：`node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-5 --role a2a --from 主Agent --to <模块> --model flash --input <估算> --cache 0 --output <估算> --summary "模块: <模块名>"`

---

## Phase 6 — 暗门注释注入（委托 kf-annotate）

> **核心价值**：向 Phase 5 产出的 HTML 页面注入 PRD 级 L0-L6 暗门注释，生成宣讲看板供客户演示和团队宣讲。

### Step 6.1 — 调用 kf-annotate

Phase 6 不再自行实现注释生成逻辑，而是委托 `kf-annotate` 技能完成全部工作：

```
kf-annotate Phase A (Scan)   → 读取页面 + PRD + Spec，建立映射
kf-annotate Phase B (Inject) → 注入 data-ann-* 属性 + 暗门切换脚本
kf-annotate Phase C (Dashboard) → 生成宣讲看板，含 Mermaid 状态机
```

**调用方式**：以当前上下文信息（Phase 5 产出页面路径 + PRD 路径 + Spec 路径）作为 kf-annotate 的输入参数，触发其执行。

### Step 6.2 — 交互验证

- `Ctrl+M` 切换暗门模式：蓝色虚线边框标注含注释的元素
- 悬停显示注释气泡
- 右下角「📌 暗门」按钮可点击切换
- 再次 `Ctrl+M` 恢复正常页面

### Step 6.3 — 宣讲看板

产出 `prototypes/annotations/dashboard.html`，包含：
- 所有页面的 L0 概览卡片索引
- L2 业务规则汇总表
- L3 状态机 Mermaid 图表集合
- L4 API 契约清单
- L6 开放问题列表
- 搜索过滤、打印优化

> 用浏览器打开看板，即可用于客户演示和团队宣讲。

### Gate 6 — 暗门注释注入全部完成后方可进入 Phase 7。

> **可视化**：Gate 6 通过后，运行 `node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --phase phase-6 --percent 100` 并输出看板。同时运行 `node {IDE_ROOT}/helpers/skill-loader.cjs --optimize-for phase-7 --loaded kf-mvp` 卸载原型阶段技能。

**追踪**：MUST 在此 Phase 完成后运行以下命令记录轮次：
```bash
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-6 --role ai --model flash --input <输入token估算> --cache <缓存百分比> --output <输出token估算> --summary "Phase 6: 暗门注释注入"
```

---

## Phase 7 — 傻瓜式使用说明（USAGE.md）

> **核心价值**：MVP 交付后必须让任何人都能立即上手操作验证。使用说明要做到「人人看都会操作」，零技术门槛。

### Step 7.1 — 环境准备（一句话启动）

MUST 生成 `USAGE.md`，包含以下内容，**全部使用 copy-paste 可执行的命令**：

```markdown
# {项目名称} — 使用说明

## 1. 启动方式

### 前提条件
- 已安装 Node.js ≥ 18（下载：https://nodejs.org）

### 一键启动
\`\`\`bash
# 第一步：安装依赖（仅首次）
npm install

# 第二步：启动项目
npm run dev
\`\`\`

### 启动成功后
- 后端地址：http://localhost:3000
- 前端地址：http://localhost:5173 ← 打开浏览器访问这个
```

### Step 7.2 — 账号密码

MUST 列出所有预置账号，每个账号标注角色和用途：

```markdown
## 2. 预置账号

| 账号 | 密码 | 角色 | 用途 |
|------|------|------|------|
| admin@test.com | 123456 | 管理员 | 管理所有数据、配置系统 |
| user@test.com | 123456 | 普通用户 | 日常业务操作 |
| viewer@test.com | 123456 | 只读用户 | 查看数据，无编辑权限 |
```

**生成规则**：账号 MUST 基于 PRD 中定义的角色映射生成，每个角色至少 1 个账号。密码统一用 `123456`（MVP 演示用，非生产）。

### Step 7.3 — 傻瓜式操作主线流程

MUST 以「第一步 → 第二步 → 第三步」的线性步骤呈现，每一步包含：
- **做什么**（一句话描述）
- **在哪里做**（点击哪个菜单/按钮）
- **输入什么**（具体的示例数据，可直接复制粘贴）
- **预期看到什么**（操作后的正常结果）

```markdown
## 3. 操作主线流程（跟着做一遍就懂了）

### 🧹 首次使用：重置演示数据
1. 打开浏览器访问 http://localhost:5173
2. 用管理员账号登录（admin@test.com / 123456）
3. 点击页面底部的「🧹 重置演示数据」按钮
4. 确认弹窗 → 数据重置完成

### 流程 1：{核心场景名称，如「创建客户」}

| 步骤 | 操作 | 详细说明 |
|------|------|---------|
| ① | 点击左侧菜单「{菜单名}」 | 进入{页面名}页面 |
| ② | 点击右上角「{按钮文字}」按钮 | 弹出{对话框名} |
| ③ | 填写表单 | **复制以下数据粘贴进去：**<br>• 名称：`{真实感示例值}`<br>• 电话：`{真实感示例值}`<br>• ... |
| ④ | 点击「保存」 | 列表页面刷新，新记录出现在第一行 ✅ |

### 流程 2：{第二个核心场景}
...（以此类推，覆盖 PRD 中所有核心用户场景）

### 🔄 清空重来
1. 点击底部「🧹 重置演示数据」
2. 所有数据回到初始状态
3. 可以反复练习操作流程
```

**流程覆盖要求**：
- MUST 覆盖 PRD 中定义的所有核心用户场景（至少 3 条主线流程）
- 每条流程的步骤数 4-8 步，不宜过长
- 示例数据 MUST 使用真实感的中文数据（姓名、电话、金额、日期等），可直接复制粘贴
- 每步操作必须标注预期结果（✅ 后面写预期看到什么）

### Step 7.4 — 常见问题（FAQ）

```markdown
## 4. 常见问题

**Q: 页面打不开？**
A: 确认终端窗口还在运行 `npm run dev`，不要关掉。

**Q: 数据乱了想重来？**
A: 用管理员登录，点击底部「🧹 重置演示数据」。

**Q: 想换个账号登录？**
A: 点击右上角头像 →「退出登录」→ 重新输入账号密码。

**Q: 暗门注释怎么看？**
A: 按 `Ctrl+M` 打开注释抽屉，左侧选择 L0-L6 标签页查看不同层级的业务说明。按 `Esc` 或再按 `Ctrl+M` 关闭。
```

### Step 7.5 — 功能验证矩阵（强制）

USAGE.md MUST 包含「功能验证矩阵」章节，用表格汇总各核心能力的实现成熟度：

```markdown
| 能力维度 | 验证项 | 实现方式 | 验证方式 | 成熟度 |
|---------|--------|---------|---------|--------|
| 暗门注释 | L0-L6 抽屉 | 内嵌注释面板 | Ctrl+M 切换 | ✅ 完整 |
| 角色权限 | 角色切换器 | data-role + CSS | Playwright/手动 | ⚠️ 部分 |
| ... | ... | ... | ... | ... |

> 成熟度图例：✅ 完整 | ⚠️ 部分/原型级 | ❌ 未实现
```

**矩阵必须覆盖的维度**：
- 暗门注释（L0-L6 完整性、PRD 一致性）
- 角色权限（角色切换、按钮显隐、数据隔离 — 按需填写）
- 审批权限（状态机、审批流 — 按需填写）
- 状态视图（数据/空态/加载/错误）
- Mock 数据（逼真度、重置能力）

### Step 7.6 — 成熟度评估说明（强制）

每个 MVP 项目 MUST 在 USAGE.md 中标注各功能的成熟度等级：

| 成熟度 | 定义 | 交付标准 |
|--------|------|---------|
| L0 概念 | 原型 HTML 可展示 | 静态页面，无交互 |
| L1 交互 | 前端状态可切换 | 模态框、标签页、角色切换可用 |
| L2 连通 | 前端调通后端 API | 真实数据增删改查 |
| L3 闭环 | 完整业务流跑通 | 审批流、状态机真实流转 |
| L4 健壮 | 异常处理+边界覆盖 | 错误提示、空态、越权处理 |

> **目的**：避免「全都做了但都没做好」的陷阱，让用户一眼看清每个功能的实际深度。

### Step 7.7 — USAGE.md 自检

- [ ] 启动命令 copy-paste 可直接执行（`npm install; npm run dev`，跨平台兼容见 `references/shell-compatibility.md`）
- [ ] 至少 3 个预置账号，覆盖所有角色（单角色系统至少 2 个账号）
- [ ] 至少 3 条主线操作流程，每步有具体数据可复制粘贴
- [ ] 每条流程步骤数 4-8 步
- [ ] 每步标注 ✅ 预期结果
- [ ] 包含「功能验证矩阵」章节，覆盖 5 大维度
- [ ] 包含「成熟度评估」说明，标注各功能 L0-L4 等级
- [ ] FAQ 至少 4 个问答
- [ ] 使用中文写作，零技术术语（或首次出现时解释）
- [ ] 包含 Ctrl+M 暗门注释的使用说明

### Gate 7 — USAGE.md 自检全部通过后方可交付。

> **可视化**：Gate 7（最终交付）通过后，运行 `node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --phase phase-7 --percent 100` 并输出**最终完整看板**。运行 `node {IDE_ROOT}/helpers/skill-loader.cjs --context-report` 输出本次 MVP 的 Token 消耗与上下文压缩报告。

**追踪**：MUST 在此 Phase 完成后运行以下命令记录最终轮次，并生成看板：
```bash
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-7 --role ai --model <当前模型> --input <输入token估算> --cache <缓存百分比> --output <输出token估算> --summary "Phase 7: 使用说明交付"
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs web
```
> 打开看板：在项目根目录运行 `scripts\view-perf.bat` 或双击该文件。

> **最终交付仪式**：在对话中输出以下总结——
> ```
> 🎉 MVP 交付完成 — <任务名>
> ├─ 总 Phase: 8/8 ✅
> ├─ 总 Token: <输入> + <输出>
> ├─ 上下文压缩率: <skill-loader 报告>
> ├─ 产物清单: <看板「交付产物」区>
> └─ 启动验证: npm run dev → <验证状态>
> ```

---

## 输出规范

```
项目根目录/
├── src/                    # Phase 5 代码产物
│   ├── server/             # Hono + Drizzle + SQLite 后端
│   ├── client/             # Vue 3 + Vite 前端
│   └── services/           # Mock 服务（支付/短信/存储/推送）
├── scripts/
│   └── replay-classic-flows.js  # Phase 5 Stage 4 经典流程回放脚本
├── prototypes/             # Phase 6 原型产物
│   └── index.html          # 带暗门注释的原型（单页或多页）
├── docs/
│   ├── prd.md              # Phase 2 / Phase 4.5 产物 — 需求文档
│   ├── spec.md             # Phase 4.5 产物 — 详细设计（来自选定队伍）
│   ├── red-spec.md         # Phase 3 红队产物
│   ├── blue-spec.md        # Phase 3 蓝队产物
│   ├── green-spec.md       # Phase 3 绿队产物
│   ├── tasks/              # Phase 4.5 产物 — 模块任务拆分
│   │   ├── <module-1>.md   # 模块任务清单（checklist）
│   │   ├── <module-2>.md
│   │   ├── ...
│   │   └── progress.md     # 总体进度追踪（checklist）
│   └── USAGE.md            # Phase 7 产物 — 傻瓜式使用说明
├── {team}-05-tests/        # Phase 5 Stage 0.5 测试文件
└── {team}-00-alignment.md  # Phase 1 对齐记录
```

---

## Gotchas

- **MVP ≠ 生产代码**。所有第三方服务 MUST Mock，禁止引入真实 API Key 或生产配置。即使 `--no-mock` 模式也应使用沙箱环境的测试密钥。
- **加强 TDD：多视角全覆盖 + 模块驱动自循环**。单队但融合红/蓝/绿三队思想，从功能流程/规则边界/异常路径/角色权限/状态流转五个维度生成尽可能多的测试用例。Phase 4.5 按模块拆分任务 + 生成 progress.md 进度文件，Phase 5 Stage 2 主 Agent 按模块依赖顺序调度子 Agent 执行 TDD（RED→GREEN→REFACTOR），无依赖模块可并行。测试覆盖不能极简——能测的路径都要测。
- **极简技术栈：缓存/并发/性能/安全几乎不考虑**。不引入 Redis、消息队列、限流器、WAF 等中间件。不加索引优化、查询优化、CDN。不做 XSS/CSRF 防护、输入净化（JWT 基础认证除外）。但极简的是技术栈，不是测试覆盖。
- **暗门注释是 MVP 的核心差异化能力**。原型不仅是 UI 演示，更是需求宣讲工具。L0-L6 注释让非技术人员（产品/运营/客户）能理解系统全貌。
- **人类决策 > 自动裁判**。MVP 不做自动评分和裁判。三队方案呈现给人类，人类说了算。默认蓝队仅当用户不选择时生效。
- **SQLite 是 MVP 最优解**。单文件、零配置、同步 API、无需安装。后续切 MySQL 只需换 Drizzle 方言，SQL 无需改动。不要为了「生产规范」在 MVP 阶段引入 MySQL/PostgreSQL。
- **Hono + Drizzle 是 MVP 后端最优组合**。Hono 仅 14KB，性能 Express 的 2-3x，TypeScript 原生，多运行时支持（Node/Bun/Deno/Cloudflare Workers）。Drizzle ORM 零运行时开销，API 贴近 SQL。搭配分层架构（routes → controllers → services → repositories → drizzle），API 契约不变的情况下，后端可整体替换为 Java + Spring Boot + MySQL。
- **业务方案可竞争，技术栈不可选**。三队 Spec 竞争的是业务逻辑和数据模型方案，技术栈统一使用默认极简栈（Vue3 + Hono + Drizzle + SQLite），禁止在 Spec 中提议替代技术栈。选中队伍落地时必须强制使用默认技术栈实现。
- **业务设计必须真实落地，禁止 MVP 偷懒**。凡是 PRD/Spec 中设计的流程、功能、界面、数据字段，必须是真实可运行的代码。MVP 极简的只是技术栈（不用 Redis/消息队列等），不是业务逻辑的完整性。依赖第三方 API 的环节（支付/短信/OSS 等）服务本身可 Mock，但围绕它的**业务处理逻辑**（回调处理、超时容错、对账、状态流转等）必须完整实现。不允许出现「这里是真实应该调第三方 API 但我用 mock 数据占位了」式的偷懒——Mock 是模拟服务的返回值，不是跳过业务逻辑的执行。
- **业务路径选择器（Business Path Selector）**。当业务涉及多种状态分支时（尤其是**业务失败路径**，如审批驳回／支付失败／库存不足／风控拦截等），UI 中 MUST 提供悬浮可见的选择标记（hover pill / toggle switch），让演示者随时切换 Path A / Path B 观察不同业务分支的界面表现和流程差异。这与系统连接失败（503/500）的异常处理不同——后者只需 Mock 标准错误提示即可。业务路径选择器聚焦于**业务逻辑的分支决策**，是验证业务规则完整性的关键手段。
- **Mock 签名一致性**。Mock 服务的函数签名 MUST 与真实服务一致。切换时只需替换 import 路径，不应修改业务代码。
- **原型中的演示数据 MUST 来自 Mock 数据源**。确保原型展示效果与代码实际行为一致。避免原型看起来很好但代码跑不通的情况。
- **编码阶段优选 Kimi 2.6 模型**。Phase 5 涉及大量代码生成，Kimi 2.6 编码能力最强。不可用时降级到 DeepSeek V4 Flash。不要用普通 pro 模型写 MVP 代码——速度和准确度都差一档。
- **USAGE.md 是交付物的一部分，不是可选项**。MVP 不是给开发者用的，是给产品/运营/客户演示用的。使用说明必须零技术门槛，人人看都会操作验证。
- **RBAC 按需而非强制**。不是所有 MVP 都需要角色权限系统。判定标准：PRD 中若出现「不同角色看到不同内容」或「审批流」描述，才启用 RBAC（角色切换器 + data-role 按钮显隐）。单角色系统（如个人工具、纯展示型原型）应直接跳过，避免过度工程。WeCRM 因有 L3→L2→L1 多级审批流，RBAC 是刚需；但若系统只有「管理员/用户」两级，仅需轻量切换即可。
- **成熟度评估是交付关键，必须显式标注**。MVP 容易陷入「全都做了但都没做好」的陷阱。USAGE.md MUST 包含「功能验证矩阵」，用 ✅/⚠️/❌ 标注每个功能的成熟度（L0 概念 → L1 交互 → L2 连通 → L3 闭环 → L4 健壮）。让用户一眼看清每个功能的实际深度，避免期望落差。

---

## Iron Rules

1. **MUST NOT 引入生产级复杂度** — MVP 的目标是快，不是完备。不做权限细分、不做日志系统、不做监控告警。
2. **第三方 MUST Mock** — 支付/短信/OSS/推送全部 Mock。签名一致可切换。
3. **加强 TDD 多视角全覆盖 + 模块驱动** — 融合红蓝绿三队视角，从功能流程/规则边界/异常路径/角色权限/状态流转五维度生成测试用例。Phase 4.5 按模块拆分任务生成 progress.md，Phase 5 主 Agent 按依赖顺序调度子 Agent 并行 TDD（无依赖模块可并发）。自循环直到全路径 GREEN。经浏览器自动化验证。
4. **原型 MUST 带暗门注释** — L0-L6 七层注释抽屉是强制产出。注释必须与 PRD 高度一致、易读、全面。
5. **人类决策替代裁判** — 三队方案呈现对比表，用户选择落地队伍。不做自动评分。
6. **默认蓝队** — 用户未选择时，默认用蓝队（稳健工程）落地。
7. **技术栈铁律，不可协商** — 默认技术栈（Node.js + Hono + Drizzle ORM + SQLite + Vue 3 + Vite）为强制约束。三队 Spec 在此技术栈内竞争业务方案，选中队伍落地时强制使用。禁止各队在 Spec 中提议替代技术栈。用户可覆盖但需明确确认。
8. **MUST NOT 跳过 Gate** — 每个 Phase Gate 必须通过后方可进入下一阶段。
9. **反馈闭环** — Phase 2（PRD）、Phase 3（Spec）、Phase 4.5（SDD 任务拆分）、Phase 6（原型）产出后 MUST 做机械化验证。
10. **记忆持久化** — 每次 MVP 完成后 MUST 写摘要到 `memory/mvp-generation-log.md`。
11. **极简第一：缓存/并发/性能/安全几乎不考虑** — 不引入 Redis/消息队列/限流/WAF。不加索引优化/CDN。不做 XSS/CSRF 防护。极简的是技术栈，不是测试覆盖。
12. **清空数据库 + 经典流程回放** — MVP 必须内置 `POST /api/system/reset` 清空+重新播种能力。生成 `scripts/replay-classic-flows.js` 一键回放所有经典业务流程。
13. **编码阶段优选 Kimi 2.6** — Phase 5 TDD 编码必须使用 Kimi 2.6（首选）或 DeepSeek V4 Flash（备选）。不要用其他模型写 MVP 代码。
14. **交付 MUST 包含 USAGE.md** — 傻瓜式使用说明是强制产出。包含启动命令、账号密码、至少 3 条主线操作流程、FAQ。要做到人人看都会操作验证。
15. **禁止 MVP 偷懒，业务设计必须真实落地** — 所有 PRD/Spec 中设计的流程、功能、界面、数据字段 MUST 真实代码实现。Mock 只能用于模拟第三方服务返回值，不能替代业务逻辑的执行。每一个业务状态、每一步流转、每一个数据字段都必须是可运行的实代码。依赖第三方的环节（支付/短信/OSS）服务调用 Mock，但回调处理、超时容错、状态更新、失败重试等**业务处理逻辑**必须完整编码。
16. **业务路径选择器（Business Path Selector）MUST 内置** — 涉及多种业务状态分支时（尤其是业务失败路径：审批驳回/支付失败/库存不足/风控拦截等），UI 页面 MUST 提供悬浮可见的选择标记（hover pill / toggle switch），让演示者随时切换 Path A / Path B，直观展示不同业务分支的界面表现、状态流转、数据差异。这与系统级异常（500/503）不同；聚焦于**业务逻辑的分支决策**的可视化演示。
17. **RBAC 按需启用，禁止过度工程** — 单角色系统不得强制引入角色切换器。仅当 PRD 明确包含多角色权限差异或审批流时，才实现 RBAC（角色下拉 + data-role 显隐）。两级简单系统仅保留 Admin/User 轻量切换。
18. **USAGE.md MUST 包含功能验证矩阵 + 成熟度评估** — 用 ✅/⚠️/❌ 标注每个能力的成熟度（L0-L4），覆盖暗门注释、角色权限、审批权限、状态视图、Mock 数据五大维度。避免期望落差。
19. **上下文 MUST 按需加载，禁止全量膨胀** — 每个 Phase 切换时 MUST 调用 `skill-loader.cjs` 重新计算加载方案。非当前阶段技能仅保留元数据 stub（~25 tokens/技能）。L1 共享前缀缓存不受影响。
20. **多 Agent 状态 MUST 可视化呈现** — 每次 Gate 通过、每次 Agent spawn/done、用户输入 `status` 时，MUST 输出 `agent-visual-dashboard.cjs` 看板到对话。自定义 Agent 同样纳入看板追踪。
21. **编译门禁为 P0 阻断** — Stage 2.5 编译门禁是强制门禁。TDD 通过不代表代码可编译运行。`build-gate.mjs` 返回 FAIL（tsc 编译失败 / vite build 失败 / ESM 不兼容 / 组件不存在）时，MUST 回退 Stage 2 修复，禁止进入 Stage 3。
22. **每个 Gate MUST 物化产物文件** — 每个 Phase/Stage 结束后 MUST 生成对应的物化报告文件（编译报告、测试报告、浏览器测试报告、注释验证报告等）。禁止 AI 口头确认「已完成」。progress.md 中 MUST 以 📎 链接到物化文件。
23. **修复 MUST 触发回归验证链** — 任何修复操作（退回上一阶段修改代码后）MUST 执行 `regression-runner.mjs`，从当前阶段重新运行完整验证链（TDD → 编译 → 浏览器测试）。禁止仅修复单点后跳过其他验证步骤。

---

## Harness 反馈闭环

> 每个 Gate 的验证动作 MUST 由可执行脚本完成，禁止 AI 口头判断。脚本输出物化到文件，AI 读取文件判断 PASS/FAIL。

| Gate | 验证命令 | 阻断条件 | 失败处理 |
|------|---------|---------|---------|
| Gate 0 (技术栈) | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase0` | `docs/tech-stack-confirmed.md` 不存在 | 补充技术栈确认书 |
| Gate 1 (对齐) | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase1` | 三队对齐文件缺失 | 回退生成 |
| Gate 2 (PRD) | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase2 --required-sections "## 需求背景" "## 业务规则" "## 验收标准"` | PRD 缺失或章节不全 | 补充缺失章节 |
| Gate 3 (Spec) | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase3 --required-sections "## 技术方案" "## 数据模型" "## API 契约"` | 三队 Spec 缺失 | 回退修复 |
| Gate 4 (决策) | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase4` | `docs/spec.md` 未生成 | 等待用户决策 |
| Gate 4.5 (拆分) | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase4_5` | 任务文件/进度文件缺失 | 回退补充 |
| Gate 2.5 (编译) | `node {IDE_ROOT}/helpers/build-gate.mjs --tsconfig ./tsconfig.json --build-cmd "npm run build" --component-inventory {IDE_ROOT}/skills/kf-mvp/references/component-inventory.md --esm-check --output {team}-25-build-report.md` | 编译失败 / 组件校验失败 / ESM 不兼容 | 回退 Stage 2 修复 → 重新编译 |
| Gate 5 (TDD) | `node {IDE_ROOT}/helpers/test-gate.mjs --cmd "npm test" --expected-pass-rate 100 --output {team}-05-test-report.md` | 测试通过率 < 100% | 继续 TDD 微循环 |
| Gate 5 (浏览器) | `kf-browser-ops` 全路径端到端验证 | 核心 Happy Path 失败 / P0 阻断错误 > 0 | 回退 Stage 2 修复 → `regression-runner.mjs` 重新验证 |
| Gate 5 (回放) | `node scripts/replay-classic-flows.js` + `kf-browser-ops` 截图验证 | 任一经典流程回放失败 | 回退 Stage 2 修复 |
| Gate 6 (注释) | `node {IDE_ROOT}/helpers/annotate-validator.mjs --target public/index.html --layers l0,l0.ops,l1,l2,l3,l4,l6 --output annotate-validation-report.md` | 缺少必填层级 / PRD 引用不可追溯 | 补充注释 → 重新验证 |
| Gate 7 (USAGE) | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase7` | 启动命令不可执行 / 账号清单缺失 / 流程覆盖不足 / 无验证矩阵 | 补充 USAGE.md |

---

## Reference Files

| 文件 | 加载时机 | 用途 |
|------|---------|------|
| `references/mvp-tech-stack.md` | Phase 0 | MVP 技术栈详细规范 |
| `references/mock-strategy.md` | Phase 5 | Mock 服务签名规范与模板 |
| `references/esm-scaffold.md` | Phase 0 / Stage 2.5 | ESM 脚手架预设（__dirname → import.meta.url） |
| `references/component-inventory.md` | Stage 2.5 | UI 组件清单（Ant Design Vue 4.x / Vant 4.x） |
| `references/shell-compatibility.md` | Phase 0 | Shell 跨平台兼容性参考（bash / PowerShell） |
| `安装或更新/docs/mvp技术栈.md` | Phase 0 | 项目级 MVP 技术栈（如存在） |
| `{IDE_ROOT}/rules/mvp-coding-checklist.md` | Phase 5 Stage 2c | 编码错误检查清单 |
