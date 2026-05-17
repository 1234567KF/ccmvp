---
name: kf-alignment
description: 对齐工作流 — "懂"原则。动前谈理解打算，动后谈diff。确保 AI 和用户在同一认知层面。触发词："对齐"、"/alignment"、"说下你的理解"、"谈下打算"、"说下diff"。
metadata:
  principle: 懂
  source: AICoding原则.docx
recommended_model: pro
graph:
  dependencies:
    - target: kf-spec
      type: dependency  # Spec 驱动需对齐理解
    - target: kf-prd-generator
      type: dependency  # PRD 产出需对齐确认
    - target: kf-code-review-graph
      type: dependency  # 审查报告需对齐
    - target: kf-ui-prototype-generator
      type: dependency  # 原型需对齐需求
    - target: kf-scrapling
      type: dependency  # 抓取结果需对齐

---

# kf-alignment — 懂原则：默契对齐

> **核心原则**：懂默契的最高境界。你懂我，我懂你。坦诚相见。提高对齐颗粒度。
> **工作方式**：动前谈理解、打算；动后谈 diff。动前说方向，动后说咋想。

---

## 对齐模式

本 Skill 支持两种模式，由调用方根据执行上下文选择：

### recording 模式（子 Agent，默认）

**适用**：后台 spawn 的 agent（如 `/mvp` 三队 agent）无法接触用户时。

**规则**：
- MUST NOT 向用户提问或等待确认
- 遇到歧义 → 记录为"假设"，选最合理的默认值，标注不确定性
- 假设优先级：PRD/Spec 已有信息 > 项目现有代码模式 > 行业通用实践 > 保守方案
- 三队共享同一份假设清单（协调者在 swarm 广播中注入）

**歧义分级**：

| 标注 | 含义 | 动作 |
|------|------|------|
| `[ASSUMPTION:LOW]` | 不影响方案核心，默认选择合理 | 不做假设，直接使用默认值，不记录 |
| `[ASSUMPTION:UNCERTAIN]` | 有歧义但可在合理范围内自行决策 | 记录假设 + 选择的理由 + 替代方案 |
| `[ASSUMPTION:CRITICAL]` | 歧义影响方案核心竞争力 / 架构选型 / 安全边界 | **MUST 同时生成结构化选择题**，提交给协调者收集，等待用户回答后回传 |

**CRITICAL 级歧义 → 选择题转换规则**：

当 agent 标注 `[ASSUMPTION:CRITICAL]` 时，MUST 同时生成一个结构化选择题，格式如下：

```
### Q{序号}: {一句话问题}
- **背景**：{为什么这里需要用户决策，一行}
- **默认选择**：{如果用户不回答，agent 会采用的默认方案}
- **选项**：
  A. {方案名} — {一行说明}，后果：{选 A 的后果}
  B. {方案名} — {一行说明}，后果：{选 B 的后果}
  C. {方案名} — {一行说明}，后果：{选 C 的后果}（如适用）
- **标注**：[ASSUMPTION:CRITICAL]
```

**约束**：
- 每个 agent 最多提交 3 个 CRITICAL 问题（超过 3 个则只保留最关键的 3 个，其余降级为 UNCERTAIN 自行决策）
- 每个问题必须给至少 2 个选项，至多 4 个
- 每个选项必须包含"后果"——选了会怎样
- 必须标注"默认选择"——用户不回答时用这个
- 问题必须具体、可决策，禁止抽象问题（如"架构怎么设计？"无效）

**产出**：结构化对齐记录 → `{team}-00-alignment.md`，包含：
- 需求理解、边界确认、技术约束
- 补充假设清单（UNCERTAIN 级）
- **待澄清问题清单**（CRITICAL 级，格式化的 MCQ 选择题）

### interactive 模式（协调者）

**适用**：协调者与用户直接对话时（kf-mvp 的 Phase 1、kf-spec 的 Step 1、kf-prd-generator 的 Phase 1）。

**规则**：
- MUST 给出 2-4 个具体选项（选择题），附带各自的后果说明
- 禁止开放提问（如"你觉得呢？"）—— 用户只做选择，不代替 AI 思考
- 选项覆盖关键决策点：技术栈、范围边界、性能档位、安全级别
- 用户选择后锁定决策，不再重复提问

**选项模板**：
```
关于 [决策点]，方案如下：
A. [方案名] — [一行说明]，后果：[选 A 会怎样]
B. [方案名] — [一行说明]，后果：[选 B 会怎样]
C. [方案名] — [一行说明]，后果：[选 C 会怎样]
请选 A/B/C（或提供补充信息）：
```

### 模式选择规则

| 调用场景 | 模式 | 说明 |
|---------|------|------|
| `/mvp` 协调者 Phase 1 任务拆解 | interactive | 协调者与用户对话，必要时给选项 |
| `/mvp` 三队 agent Phase 1 | recording | agent 无法接触用户，记录假设 |
| kf-spec Step 1 需求澄清 | interactive | Step 0 已有 MCQ 选项 |
| kf-prd-generator Phase 1 需求问询 | interactive | 已有结构化问题链 |
| kf-alignment 被用户直接调用 | interactive | `/对齐`、`说下你的理解` |
| 其他技能内部自动调用 | recording | 仅记录，不阻塞流程 |

---

## 工作流

### Phase 1 — 动前对齐（Before Action）

接到任务后，执行前，必须先输出：

```
## 我的理解

[用自己的话复述：要做什么、为什么做、约束条件]

## 我的打算

[打算怎么做：分几步、用什么技术方案、关键决策点]

## 边界确认

- 范围：[本期做什么]
- 排除：[本期不做什么]
- 风险：[可能遇到的问题]
```

**interactive 模式下**，等待用户确认后再开始执行。
**recording 模式下**，自动推进到下一阶段，对齐记录作为假设基线存档。

### Phase 2 — 动后复盘（After Action）

完成任务后，必须输出：

```
## 实际做了什么

[实际执行的动作清单]

## 与计划差异

| 计划 | 实际 | 原因 |
|------|------|------|
| [计划做什么] | [实际做了什么] | [为什么变了] |

## 关键决策

[执行过程中做的关键决策及原因]

## 遗留问题

[未解决的问题、后续建议]
```

---

## 触发方式

### 显式触发

```
对齐                        # AI 输出当前对话的理解和打算
说下你的理解                 # AI 复述对当前上下文的理解
谈下打算                     # AI 说明接下来打算做什么
说下 diff                    # AI 复盘刚才做的改动和原因
/alignment                  # 完整对齐流程
```

### 隐式触发

在以下场景 AI 应主动对齐：
- 用户给出新任务时 → 先复述理解
- 任务执行完毕时 → 输出 diff 复盘
- 方案有变更时 → 说明差异和原因
- 对话跨度较长（>5轮）→ 主动总结当前状态

---

## 文档产出自动对齐（Hook 技术）

以下技能**产出文档后**，必须自动触发 kf-alignment 做动后复盘：

| 技能 | 产出文档类型 | 对齐时机 |
|------|-------------|---------|
| `kf-prd-generator` | PRD.md | 文档写入后 → 输出"与需求的对齐 diff" |
| `kf-spec` | Spec 规格文档 | 文档写入后 → 输出"与 PRD 的对齐 diff" |
| `kf-code-review-graph` | 审查报告 | 报告生成后 → 输出"变更范围对齐 diff" |

### Hook 机制

通用 IDE 暂不支持自动 Hook 触发。文档产出后，请手动触发对齐：

```
说下 diff    # AI 复盘刚才产出的文档与原始需求的差异
```

或在规则中配置：每次 Write/Edit 后提醒执行 `node {IDE_ROOT}/helpers/alignment-hook.cjs check`。

## Harness 反馈闭环（铁律 3）

每个 Phase 完成后 MUST 执行机械化验证：

| Phase | 验证动作 | 失败处理 |
|-------|---------|---------|
| Phase 1 动前对齐 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --skill kf-alignment --stage phase1 --required-sections "## 我的理解" "## 我的打算" "## 边界确认" --forbidden-patterns TODO 待定` | 补充缺失章节 |
| Phase 2 动后复盘 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --skill kf-alignment --stage phase2 --required-sections "## 实际做了什么" "## 与计划差异" "## 关键决策" "## 遗留问题"` | 补充缺失章节 |

验证原则：**Plan → Build → Verify → Fix** 强制循环，不接受主观"我觉得好了"。

## Harness 记忆持久化（铁律 4）

每次对齐完成后 MUST 将结构化记录写入 `memory/alignment-log.md`：

```markdown
### {date} — {skill} {stage}

- **我的理解**：{一句话}
- **边界确认**：{硬约束 / 软约束 / 不做什么}
- **关键决策**：{技术选型 / 架构取舍}
- **遗留问题**：{未解决项，如有}
- **后续建议**：{下次类似场景的参考}
```

下次同类型对齐启动时，MUST 先读取 `memory/alignment-log.md` 中最近 3 条记录作为基线，
避免重复讨论相同问题（铁律 4 — 不让 Agent 犯同样的错误）。

## 集成

本 Skill 与以下 Skill 配合使用：
- `kf-spec`：Step 1 澄清阶段本质就是对齐；产出 Spec 后自动对齐
- `kf-prd-generator`：产出 PRD 后自动对齐
- `kf-mvp`：方案对比和结果汇总
- `kf-code-review-graph`：审查前后对齐改动范围
