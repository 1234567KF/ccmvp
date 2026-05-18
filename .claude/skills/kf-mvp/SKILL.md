---
name: kf-mvp
description: >
  Use when user asks to build an MVP prototype, rapid demo system, or
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
  - kf-annotate
  - kf-data-ingest    # URL/凭据输入预处理
graph:
  dependencies:
    - target: kf-prd-generator
      type: workflow
    - target: kf-spec
      type: workflow
---

# kf-mvp — 原型系统（MVP 快速通道）

> **核心**：设计阶段三队多视角竞争 → 人类决策 → 单队 TDD 落地。输出可演示、可宣讲的原型系统。

---

## Feature Flags

| Flag | 默认 | 说明 |
|------|------|------|
| `--team red` | OFF | 指定红队（激进创新）做 TDD |
| `--team blue` | **ON** | 蓝队（稳健工程）做 TDD — 默认 |
| `--team green` | OFF | 指定绿队（安全保守）做 TDD |
| `--no-mock` | OFF | 禁用 Mock，接入真实第三方（⚠️ 仅演示环境） |
| `--no-prototype` | OFF | 跳过 Phase 6 原型生成 |

---

## Pipeline 架构

### 流水线总览

```
Phase 0        Phase 1        Phase 2     Phase 3       Phase 4      Phase 4.5       Phase 5               Phase 6            Phase 7
技术栈确认  →  三队需求澄清  →  PRD生成  →  三队Spec生成  →  人类决策  →  SDD任务拆分  →  单队模块驱动TDD    →  暗门注释注入    →  使用说明
(主Agent)      (主Agent)      (主Agent)    (主Agent)      (用户)       (主Agent)       (主Agent+子Agent)     (kf-annotate)      (主Agent)
    │              │              │            │             │             │                  │                  │              │
    ▼              ▼              ▼            ▼             ▼             ▼                  ▼                  ▼              ▼
 技术栈确认   三队对齐记录    PRD.md    三队spec.md   选定队伍      spec.md           代码+模块TDD报告    暗门注入页面      USAGE.md
                                                                     tasks/<module>.md   progress.md更新    + 宣讲看板
                                                                     progress.md
```

### 阶段依赖链

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 4.5 → Phase 5 → Phase 6 → Phase 7
  │         │         │         │         │         │           │         │           │
  ▼         ▼         ▼         ▼         ▼         ▼           ▼         ▼           ▼
Gate 0    Gate 1    Gate 2    Gate 3    Gate 4   Gate 4.5    Gate 5    Gate 6        Gate 7
                                              (任务拆分      (模块TDD   (暗门注释    (USAGE
                                               完整性验证)    全部GREEN)  注入完成)     自检通过)
```

---

## 上下文优化与可视化追踪

> 每个 Phase 切换时 MUST 调用 skill-loader 更新技能加载方案。关键节点 MUST 输出 Agent 看板。

Load `references/context-engineering.md` for full command reference on:
- `skill-loader.cjs` — Phase 切换时按需加载/卸载技能，非当前阶段技能降为元数据 stub
- `agent-visual-dashboard.cjs` — Gate 通过、Agent spawn/done、`status` 时输出看板
- `perf-tracker.cjs` — 每 Phase 完成后记录轮次，最终交付输出看板

---

## Context Collection — 启动时

1. 读取 `memory/mvp-generation-log.md` 最近 3 条（历史技术栈选择）
2. 检查 `安装或更新/docs/mvp技术栈.md` → 存在则作为技术栈默认值
3. 扫描工作区依赖文件（`package.json` 等）了解现有栈
4. 若用户提供 `.xlsx` → 检测是否为 SDD 模板 → 是则先走 `kf-prd-generator`

---

## Phase 0 — 技术栈确认与输入准备

### 默认技术栈（极简原则）

后端：Node.js + Hono + Drizzle + SQLite（better-sqlite3）
前端：Vue 3 + Vite（运营Web：Ant Design Vue / H5：Vant）
第三方：全部 Mock
部署：`npm run dev` 一键启动，零外部服务依赖

**极简约束**（不引入）：缓存策略 | 并发控制 | 性能优化 | 安全加固（JWT 除外）| 日志系统 | 监控告警

### 输入源处理

| 输入类型 | 处理方式 |
|---------|---------|
| `.xlsx` SDD 模板 | → 调用 `kf-prd-generator` 生成 PRD.md |
| `.xlsx` 非 SDD | → 读取原始数据，作为需求参考 |
| 口述 / 文本 | → 直接进入 Phase 1 澄清 |
| 已有 PRD.md | → 跳过 Phase 2 |
| **URL/账号密码（现网分析）** | → 调用 `kf-data-ingest` 抓取并持久化到 `.data/` |

### Gate 0 — 技术栈 MUST 确认后方可进入 Phase 1。

**追踪**：完成后运行 `node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase phase-0 --role ai --model <当前模型> --input <估算> --cache 0 --output <估算> --summary "Phase 0: 技术栈确认"`
**可视化**：`node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --phase phase-0 --percent 100`

---

## Phase 1 — 三队需求澄清（Inversion + 多视角）

### 需求收集
一次性问清核心问题：
- Q1: 目标用户是谁？
- Q2: 核心要解决的问题？
- Q3: 本期 MVP 范围？
- Q4: 明确不做什么？
- Q5: 涉及哪些第三方服务？（全部 Mock）

### 三队对齐（串行，文件隔离）
三队（红/蓝/绿）依次执行需求对齐，产出独立对齐文件：
- 红队（激进创新）→ `red-00-alignment.md`
- 蓝队（稳健工程）→ `blue-00-alignment.md`
- 绿队（安全保守）→ `green-00-alignment.md`

每队 MUST 产出：需求理解、边界确认、技术约束、补充假设清单。

### Gate 1 — 三队对齐记录全部产出后进入 Phase 2。

---

## Phase 2 — PRD 生成

调用 `kf-prd-generator`，以完整 Phase 1→2 流程生成结构化 PRD.md。

若输入已足够清晰，可跳过完整流程直接生成轻量 PRD。

### Gate 2 — PRD.md 存在且通过机械化验证。

---

## Phase 3 — 三队 Spec 生成

### 三队并行 Spec（严格隔离）

三队基于同一份 PRD.md 并行生成 Spec，**技术栈铁律强制**（Vue3+Hono+Drizzle+SQLite，不可选）。

**隔离规则**：
- 输入只读：只能读 `docs/prd.md` + `docs/CONTEXT.md`
- 输出隔离：红→`red-*`，蓝→`blue-*`，绿→`green-*`
- 上下文隔离：子 Agent 独立会话，不共享上下文

**每队 Spec 必须包含**：业务架构方案、数据模型、API 契约、业务状态流转、任务拆解。

**MVP 豁免**：缓存策略/并发控制/性能指标/安全方案（认证基础 JWT 除外）/日志监控可标注「跳过」。

**禁止跳过**：业务状态流转定义（含失败路径）| 各分支 UI 差异描述 | 数据表字段定义。

### Step 3.5 — 对抗质疑清单

在 Phase 4 之前自动生成 `challenge-inventory.md`，从方案完整性/实现风险/边界场景/一致性/MVP 适配度五维度分析三队方案差异。

### Gate 3 — 三队 Spec 全部通过质量门禁。

---

## Phase 4 — 人类决策

### 呈现对比

提供核心差异对比表 + 评分矩阵（方案完整性/可维护性/MVP 适配度/实现确定性/创新性），引用 `challenge-inventory.md`。

### 人类选择

询问用户选择哪队方案落地。默认蓝队。

```
可选：A. 红队（激进创新） B. 蓝队（稳健工程⭐默认） C. 绿队（安全保守） D. 融合
```

### Gate 4 — 用户 MUST 明确选择后方可进入 Phase 4.5。

---

## Phase 4.5 — SDD 任务拆分（模块驱动开发准备）

1. 将选定队伍 Spec 复制为 `docs/spec.md`
2. 验证 spec.md 包含：模块划分、数据模型、API 契约、依赖关系
3. 逐模块拆解：每个模块 → `docs/tasks/<module>.md`（checklist 格式）
4. 生成 `docs/tasks/progress.md`：模块进度 + 依赖关系（无依赖标注「可并行」）

**规则**：模块独立可编译/测试 | 单任务 ≤ 2h | 每个模块 MUST 有测试任务 | 边界不清晰时向用户确认

### Gate 4.5 — 全部任务文件存在、最小可执行、含测试任务、progress.md 标注依赖关系。

---

## Phase 5 — 单队 TDD 开发

> **核心原则**：单队执行，融合三队思想生成多视角测试用例。自循环直到全路径通过。Mock 第三方服务但业务逻辑真实落地。

Load `references/phase-5-stages.md` for detailed stage execution:

| Stage | 内容 | 产出 | 门控 |
|-------|------|------|------|
| 0.5 — 多视角测试设计 | 红蓝绿三视角融合，五维度生成尽可能多的测试用例 | `{team}-05-tests/` + `{team}-05-test-report.md` | 全部 RED ✅ |
| 2 — TDD 微循环自循环 | 主 Agent 按 `progress.md` 调度，子 Agent RED→GREEN→REFACTOR | 代码 + `{team}-02-tdd-cycle-{module}-*` | 全部 GREEN ✅ |
| 2.5 — 编译门禁 | tsc + vite build + 组件校验 + ESM 检查（P0 阻断） | `{team}-25-build-report.md` | PASS ✅ |
| 3 — 浏览器自动化测试 | kf-browser-ops 全路径端到端验证 | `{team}-03-browser-report.md` + screenshots | Happy Path 全部通过 ✅ |
| 4 — 清空DB+经典流程回放 | `POST /api/system/reset` + `scripts/replay-classic-flows.js` | `scripts/replay-classic-flows.js` + replay-report | 全部通过 ✅ |

### Gate 5 — Stage 4 全部通过后方可进入 Phase 6。

---

## Phase 6 — 暗门注释注入（委托 kf-annotate）

委托 `kf-annotate` 完成全部工作，根据项目类型选择模式：

### Vue SPA 模式（默认，Vue 3 + Ant Design Vue 项目）

1. 读取 `docs/prd.md` 和 `docs/spec.md`，为每个路由页面构建 L0-L6 注释数据
2. 创建/更新 `src/client/annotations/annotation-data.ts` — 每页的 L0(概览)/L1(字段)/L2(规则)/L3(状态机)/L4(API)/L6(待决策)
3. 创建/更新 `src/client/components/AnnotationDrawer.vue` — 使用 a-drawer + a-tabs 分页渲染
4. 在 `App.vue` 绑定 Ctrl+M 快捷键直接开/关抽屉（无「注释模式」中间状态）
5. 更新 `docs/USAGE.md` 记录快捷键

**交互**：`Ctrl+M` 直接开/关注释抽屉 | 6 个 tab 分页（概览/字段/规则/状态机/API/待决策）

### 静态 HTML 模式（prototypes/ 目录下的 HTML 文件）

1. Phase A (Scan) — 读取页面 + PRD + Spec，建立映射
2. Phase B (Inject) — 注入 JSON 数据块 + `Ctrl+M` 切换脚本
3. Phase C (Dashboard) — 生成 `prototypes/annotations/dashboard.html` 宣讲看板

### Gate 6 — 暗门注释完整性验证

必须通过 kf-annotate 定义的 Gate 检查规则：

| ID | 检查项 | P0/P1 |
|----|--------|-------|
| AN-01 | 注释数据文件存在（annotation-data.ts 或 kf-ann-data 数据块） | P0 |
| AN-02 | 每页 L0 已填充（title/summary/prdRef/specRef） | P0 |
| AN-07 | Ctrl+M 快捷键已绑定 | P0 |
| AN-08 | 无注释模式中间态残留 | P1 |
| AN-09 | 抽屉使用 tab 分页 | P1 |
| AN-10 | 文档同步（USAGE.md 记录快捷键） | P1 |

**阻断规则**：P0 任一未通过 → 退回修复；P1 超过 3 项 → 告警
**验证命令**：详见 kf-annotate SKILL.md Gate 章节

---

## Phase 7 — 傻瓜式使用说明（USAGE.md）

MUST 生成 `USAGE.md`，全部使用 copy-paste 可执行命令：

| 章节 | 内容 | 强制项 |
|------|------|--------|
| 环境准备 | 前提条件 + `npm install; npm run dev` | 命令可复制执行 |
| 预置账号 | 每个角色至少 1 个账号，密码 `123456` | 覆盖所有角色 |
| 主线流程 | 至少 3 条，每步 4-8 步，含具体示例数据 | 覆盖 PRD 所有核心场景 |
| FAQ | 至少 4 个问答 | 含 Ctrl+M 暗门说明 |
| 功能验证矩阵 | ✅/⚠️/❌ 标注 5 大维度 L0-L4 成熟度 | 暗门/角色/审批/状态/Mock |
| 成熟度评估 | L0 概念 → L1 交互 → L2 连通 → L3 闭环 → L4 健壮 | 避免期望落差 |

### Gate 7 — USAGE.md 自检全部通过后方可交付。

**最终交付仪式**：
```
🎉 MVP 交付完成 — <任务名>
├─ 总 Phase: 8/8 ✅
├─ 总 Token: <输入> + <输出>
├─ 上下文压缩率: <skill-loader 报告>
├─ 产物清单: <看板「交付产物」区>
└─ 启动验证: npm run dev → <验证状态>
```

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
│   ├── prd.md              # Phase 2 / Phase 4.5 — 需求文档
│   ├── spec.md             # Phase 4.5 — 详细设计（选定队伍）
│   ├── red-spec.md / blue-spec.md / green-spec.md  # Phase 3
│   ├── tasks/<module>.md   # Phase 4.5 — 模块任务清单
│   ├── tasks/progress.md   # Phase 4.5 — 总体进度追踪
│   └── USAGE.md            # Phase 7 — 使用说明
├── {team}-05-tests/        # Phase 5 Stage 0.5 测试文件
└── {team}-00-alignment.md  # Phase 1 对齐记录
```

---

## Iron Rules

1. **MUST NOT 引入生产级复杂度** — 不做缓存/队列/限流/日志/监控/安全加固（JWT 除外）。
2. **第三方 MUST Mock** — 签名一致可切换。Mock 模拟返回值，不跳过业务逻辑。
3. **加强 TDD 多视角全覆盖** — 融合红蓝绿三队视角，五维度生成测试用例。自循环直到全路径 GREEN。
4. **原型 MUST 带暗门注释** — L0-L6 强制产出，与 PRD 高度一致。
5. **人类决策替代裁判** — 三队方案呈现对比表，用户选择。默认蓝队。
6. **技术栈铁律** — Hono + Drizzle + SQLite + Vue 3 + Vite，不可协商。三队在此栈内竞争方案。
7. **MUST NOT 跳过 Gate** — 每个 Phase Gate 必须通过方可进入下一阶段。
8. **测试验证 MUST 脚本化** — `test-gate.mjs` / `build-gate.mjs`，禁止 AI 口头判断。
9. **每个 Gate MUST 物化产物** — 编译报告/测试报告/浏览器报告等。progress.md 📎 链接物化文件。
10. **修复 MUST 触发回归验证链** — `regression-runner.mjs` 从当前阶段重新验证。
11. **业务路径选择器 MUST 内置** — 多状态分支提供悬浮 toggle 切换业务失败路径。
12. **编码阶段优选 Kimi 2.6** — 不可用时降级 DeepSeek V4 Flash。
13. **交付 MUST 包含 USAGE.md** — 含启动命令、账号、≥3 条流程、FAQ、验证矩阵、成熟度评估。
14. **上下文 MUST 按需加载** — Phase 切换时调 `skill-loader.cjs`。非当前阶段技能降为 meta stub。
15. **多 Agent 状态 MUST 可视化** — Gate 通过 / Agent spawn+done / `status` 时输出看板。
16. **记忆持久化** — MVP 完成后写摘要到 `memory/mvp-generation-log.md`。

---

## Reference Files

| 文件 | 加载时机 | 用途 |
|------|---------|------|
| `references/mvp-tech-stack.md` | Phase 0 | 技术栈详细规范 |
| `references/phase-5-stages.md` | Phase 5 | 详细阶段执行（Stage 0.5-4 + Mock） |
| `references/context-engineering.md` | Phase 切换 | skill-loader / dashboard / perf-tracker 命令 |
| `references/harness-gates.md` | Gate 验证 | Gate 验证命令表 |
| `references/gotchas.md` | 全过程 | 项目特有陷阱 |
| `references/mock-strategy.md` | Phase 5 | Mock 签名规范与模板 |
| `references/esm-scaffold.md` | Phase 0 / Stage 2.5 | ESM 脚手架 |
| `references/component-inventory.md` | Stage 2.5 | UI 组件清单 |
| `references/shell-compatibility.md` | Phase 0 | Shell 跨平台参考 |
| `{IDE_ROOT}/rules/mvp-coding-checklist.md` | Stage 2 | 编码错误检查清单 |
