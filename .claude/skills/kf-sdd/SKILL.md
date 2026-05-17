---
name: kf-sdd
description: >-
  Load when explicitly called by kf-mvp as an
  attached sub-skill, or when user directly asks to generate SDD artifacts:
  detailed design doc, task breakdown, or Vibe Coding prompt from a PRD.
  Triggers: "SDD", "sdd", "详细设计", "生成详细设计", "任务拆分", "拆任务",
  "Vibe Coding prompt", "生成prompt", "spec设计". NOT for standalone PRD
  generation (use kf-prd-generator) or spec coding (use kf-spec).
metadata:
  pattern: pipeline
  recommended_model: pro
  steps: "3"
  interaction: multi-turn
  called_by:
    - kf-mvp
graph:
  dependencies:
    - target: kf-prd-generator
      type: upstream  # SDD 以 PRD 为输入源
    - target: kf-spec
      type: sibling  # SDD 和 Spec Coding 互补
    - target: kf-mvp
      type: sibling  # 可被 MVP Pipeline 插入调用
---

# kf-sdd — SDD 三阶段流水线（详细设计 → 任务拆分 → Vibe Coding Prompt）

> **核心价值**：以 PRD 为输入，严格三阶段流水线产出详细设计文档、模块任务清单、Vibe Coding 起始 Prompt。模块间保持独立，每阶段有疑问必问，不猜测意图。

## 定位与调用方式

**被动附加技能**：kf-sdd 不独立响应用户需求，由以下方式触发：

| 触发方式 | 说明 |
|---------|------|
| **父技能插入** | `kf-mvp` 在其流程中显式调用 kf-sdd |
| **用户直接调用** | 用户明确说「生成详细设计」「拆分任务」「生成 Vibe Coding prompt」 |
| **阶段指定** | 用户说「只做详细设计」→ 仅执行 Stage 1；「只拆任务」→ 仅 Stage 2 |

**默认行为**：一次调用跑完三阶段全流程。若用户指定只做某阶段，跳过其他阶段。

---

## 前置条件

调用 kf-sdd 前 MUST 满足：

- [ ] `docs/prd.md`（或用户指定的 PRD 路径）已存在且内容完整
- [ ] PRD 中已划分出功能模块（如未划分，Stage 1 必须先与用户确认模块划分）

若 PRD 不存在 → 提示用户先通过 `kf-prd-generator` 生成 PRD。

---

## Stage 1 — 详细设计生成

> 对应需求：spec设计提示词

### 输入

- `docs/prd.md`（用户可指定其他路径）

### 步骤

1. **读取 PRD**：完整理解需求文档中的业务背景、功能模块、数据字段、交互逻辑
2. **模块确认**：
   - 若 PRD 中已明确模块划分 → 以此为基准
   - 若 PRD 中未明确 → MUST 向用户提问确认模块边界
   - **模块间 MUST 保持相互独立，可独立测试**
3. **逐模块编写设计**：每个模块包含：
   - 模块职责（一句话）
   - 输入/输出定义
   - 核心数据结构
   - 接口契约（API/函数签名）
   - 与其他模块的依赖关系（最小化）
   - 测试策略

### 核心规则

- **MUST NOT 猜测意图**：任何不明确的地方 MUST 向用户提问。包括但不限于：
  - 模块边界模糊
  - 数据字段含义不明确
  - 业务规则存在歧义
  - 技术选型未确定
- **模块独立性**：每个模块设计时 MUST 确保可脱离其他模块独立编译/运行/测试
- **不确定项标记**：设计中无法立即确定的内容标记为 `[TODO: 待确认]`，积累后统一向用户提问

### 输出

- `docs/spec.md`

### Gate 1 — 详细设计 MUST 满足以下条件方可进入 Stage 2：
- [ ] 所有 PRD 模块均已覆盖
- [ ] 每个模块有明确的输入/输出/接口定义
- [ ] 无遗留 `[TODO: 待确认]`（全部已提问并获用户确认）
- [ ] 模块间依赖关系已标注且最小化

---

## Stage 2 — 任务拆分

> 对应需求：拆分任务提示词

### 输入

- `docs/prd.md`
- `docs/spec.md`

### 步骤

1. **读取详细设计**：理解每个模块的职责和接口
2. **逐模块拆解最小任务**：
   - 每个任务 MUST 是可独立执行的最小单元
   - 单任务预估工时 ≤ 2 小时
   - 每个任务有明确的输入（设计文档章节）和输出（文件/代码）
3. **生成模块任务文件**：
   - 每个模块一个 `docs/tasks/<module-name>.md`
   - 使用 checklist 表示子任务完成状态
   - 每个子任务格式：`- [ ] {任务描述} — 预估 {X}h — 产出 {文件路径}`
4. **生成总体进度文件**：
   - `docs/tasks/progress.md`
   - 使用 checklist 表示各模块是否已完成
   - 格式：`- [ ] {模块名} — {任务数} 个子任务 — 预估 {X}h`

### 输出

```
docs/tasks/
├── <module-1>.md       # 模块 1 的任务清单（checklist）
├── <module-2>.md       # 模块 2 的任务清单（checklist）
├── ...
└── progress.md         # 总体进度（checklist）
```

### 任务文件模板

```markdown
# {模块名} — 任务清单

> 预估总工时：{X}h | 依赖模块：{列出或"无"}

## 子任务

- [ ] T001: {任务描述} — 预估 {X}h — 产出 `{文件路径}`
- [ ] T002: {任务描述} — 预估 {X}h — 产出 `{文件路径}`
- [ ] ...

## 测试任务

- [ ] T{编号}: 为以上功能编写单元测试 — 预估 {X}h — 产出 `{测试文件路径}`
```

### progress.md 模板

```markdown
# 总体进度

> 更新时间：{date} | 总模块数：{N} | 已完成：{M}

## 模块进度

- [ ] {模块1} — {N} 个子任务 — 预估 {X}h
- [ ] {模块2} — {N} 个子任务 — 预估 {X}h
- [ ] ...
```

### Gate 2 — 任务拆分 MUST 满足以下条件方可进入 Stage 3：
- [ ] 每个 PRD 模块都有对应的 `<module-name>.md`
- [ ] 每个任务都是最小可执行单元（不可再拆）
- [ ] 每个任务有明确产出文件路径
- [ ] 每个模块包含测试任务
- [ ] `progress.md` 包含所有模块的 checklist

---

## Stage 3 — 生成 Vibe Coding Prompt

> 对应需求：生成Vibe Coding用的Prompt

### 输入

- `docs/prd.md`
- `docs/spec.md`
- `docs/tasks/`（全部任务文件）

### 步骤

1. **通读所有输入**：全面了解工程范围、模块划分、任务依赖
2. **生成主 Prompt**：输出到 `docs/prompt.md`

### prompt.md 内容结构

```markdown
# {项目名称} — Vibe Coding 执行 Prompt

## 项目概述
[从 PRD 摘要：做什么、目标用户、核心价值]

## 架构总览
[从 spec.md 摘要：模块划分、模块间依赖关系]

## 执行策略

### 主 Agent 职责
- 跟踪整体进度，维护 `docs/tasks/progress.md`
- 按模块依赖顺序调度子 Agent
- 每个模块完成后验收（测试通过 + 代码规范检查）
- 模块全部完成后做集成验证

### 子 Agent 分工
[每个模块一个子 Agent，列出其职责和输入输出]

| 子 Agent | 模块 | 输入 | 输出 | 任务清单 |
|----------|------|------|------|---------|
| agent-{module1} | {模块1} | spec.md §X | {文件路径} | tasks/{module1}.md |
| agent-{module2} | {模块2} | spec.md §Y | {文件路径} | tasks/{module2}.md |
| ... | ... | ... | ... | ... |

## 测试要求

### Python 项目
- MUST 使用 pytest 编写完整单元测试
- MUST 通过 mypy 类型检查（`mypy --strict`）
- MUST 通过 ruff 代码规范检查（`ruff check`）

### 其他语言
- MUST 有对应的单元测试框架覆盖
- MUST 通过该语言的主流静态分析/ lint 工具
- 测试覆盖率目标：≥ 70%

## 执行流程

1. 主 Agent 读取 `docs/tasks/progress.md` 确认当前进度
2. 按依赖顺序启动子 Agent：
   - 无依赖模块可并行启动
   - 有依赖模块等待依赖完成后启动
3. 每个子 Agent 执行：
   a. 读取详细设计中对应模块的设计
   b. 按任务清单逐项实现
   c. 编写并通过单元测试
   d. 运行 lint/类型检查
   e. 标记任务清单为完成
4. 主 Agent 汇总：
   a. 更新 progress.md
   b. 运行集成测试
   c. 确认所有模块可协同工作

## 约束

- **整个过程无人参与**：子 Agent 自动执行、自动测试、自动修复
- **不确定时回退**：遇到无法自动决策的问题时，子 Agent 记录到模块任务文件中并标记 `[BLOCKED]`
- **测试先行**：先写测试再写实现（TDD）
```

### 核心规则

- **主 Agent 跟踪进度**：prompt 中 MUST 明确主 Agent 通过 `progress.md` 管理整体进度
- **子 Agent 独立执行**：每个模块对应一个子 Agent，输入输出明确
- **无人参与**：prompt 描述的执行流程 MUST 是全自动的
- **质量门禁**：每个模块完成后 MUST 有测试 + lint 验证

### 生成过程中

**MUST 向用户提问**的情况：
- PRD 与 spec.md 之间存在矛盾
- 模块间依赖关系不清晰导致无法确定执行顺序
- 技术栈未指定导致无法确定测试框架
- 其他任何不明确的地方

### 输出

- `docs/prompt.md`

### Gate 3 — prompt.md MUST 满足以下条件：
- [ ] 包含完整的项目概述和架构总览
- [ ] 每个模块都有对应的子 Agent 定义
- [ ] 测试要求具体可执行（指定了框架和命令）
- [ ] 执行流程无歧义
- [ ] 无遗留 `[BLOCKED]` 或 `[TODO]`

---

## 快速通道：单阶段执行

当用户明确说「只做详细设计」或「只拆任务」或「只生成 prompt」时：

| 用户指令 | 执行阶段 | 前提 |
|---------|---------|------|
| 「只做详细设计」 | 仅 Stage 1 | PRD 存在 |
| 「只拆任务」 | 仅 Stage 2 | PRD + spec.md 存在 |
| 「只生成 prompt」 | 仅 Stage 3 | PRD + spec.md + tasks/ 存在 |

缺少前提文件时 MUST 提示用户先补齐。

---

## 输出规范

```
docs/
├── spec.md        # Stage 1 产出
├── tasks/
│   ├── <module-1>.md         # Stage 2 产出 — 模块任务清单
│   ├── <module-2>.md
│   ├── ...
│   └── progress.md           # Stage 2 产出 — 总体进度
└── prompt.md                 # Stage 3 产出 — Vibe Coding 执行 Prompt
```

若用户指定了自定义输出路径，以用户指定为准。

---

## Gotchas

- **SDD ≠ Spec Coding**：kf-sdd 产出的是「详细设计 + 任务拆分 + 执行 Prompt」，关注的是设计文档和工程化执行描述。kf-spec 产出的是「技术规格文档」，关注的是 API 契约、数据模型、架构方案。两者互补但不重叠。
- **PRD 是硬前置**：无 PRD 不走 SDD。如果用户直接说「帮我做 SDD」但未提供 PRD，MUST 引导先走 kf-prd-generator。
- **模块独立性是核心约束**：Stage 1 设计时如果发现两个模块强耦合无法独立测试，MUST 向用户反馈并建议重新划分模块边界。
- **不猜测意图是第一铁律**：三个阶段的每一步，遇到任何不明确的地方 MUST 停下来向用户提问。宁可多问不可臆测。这是需求文档中反复强调的核心规则。
- **Stage 3 产出的 prompt.md 是元文档**：它描述的是「另一个 AI 如何执行这个项目」，不是当前 AI 的执行指令。prompt.md 中描述的子 Agent 机制是给 Vibe Coding 执行者看的。
- **任务拆分的「最小可执行」标准**：如果一个任务描述里包含「和」「以及」「同时」等并列词，说明还可以再拆。每个任务应该只做一件事。
- **checklist 格式强制**：Stage 2 产出的所有任务文件和 progress.md MUST 使用 `- [ ]` checklist 格式，确保下游工具可解析进度。

---

## Iron Rules

1. **MUST NOT 猜测意图** — 任何不明确的地方 MUST 向用户提问，宁可多问不可臆测
2. **PRD 是硬前置** — 无 PRD 不启动任何阶段
3. **模块 MUST 保持独立** — 每个模块可独立测试，模块间依赖最小化
4. **任务 MUST 是最小可执行单元** — 单任务 ≤ 2h，不可再拆分
5. **checklist 格式强制** — 任务文件和进度文件 MUST 使用 `- [ ]` 格式
6. **每个模块 MUST 有测试任务** — Stage 2 任务拆分时每个模块必须包含测试
7. **Stage 3 生成的 prompt MUST 是全自动的** — 描述的流程中无人参与
8. **Gate 不通过不进入下一阶段** — 每个 Gate 的全部 checklist 必须通过
9. **用户指定路径优先** — 输出路径默认 docs/，用户指定则以用户为准

---

## 集成指南

### 在 kf-mvp 中插入

在 `kf-mvp` 的 `integrated-skills` 中加入 `kf-sdd`，在 Phase 3（Spec 生成）后插入 SDD 调用：

```yaml
integrated-skills:
  - kf-alignment
  - kf-prd-generator
  - kf-spec
  - kf-browser-ops
```

### 在 kf-mvp 中插入

同样在 `integrated-skills` 中加入 `kf-sdd`，在设计阶段结束后插入 SDD 调用。

---

## Harness 反馈闭环

| Stage | 验证动作 | 失败处理 |
|-------|---------|---------|
| Stage 1 | 检查 spec.md 覆盖所有 PRD 模块 + 无 `[TODO]` 遗留 | 回退补充 |
| Stage 2 | 检查每个模块有对应 tasks 文件 + progress.md 含全模块 checklist | 回退补充 |
| Stage 3 | 检查 prompt.md 含子 Agent 定义 + 测试要求 + 执行流程 | 回退补充 |
