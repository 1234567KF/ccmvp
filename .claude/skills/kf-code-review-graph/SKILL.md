---
name: kf-code-review-graph
description: |
  代码审查依赖图谱。分析变更文件的依赖关系，生成审查优先级地图，
  识别涟漪效应（ripple effects），检查测试覆盖缺口。
  运行 /review-graph 查看完整审查图谱。
triggers:
  - review-graph
  - 审查图谱
  - 代码审查图谱
  - 依赖图谱
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - SearchCodebase
integrated-skills:
  - kf-alignment  # 产出审查报告后自动动后对齐
recommended_model: flash
graph:
  dependencies:
    - target: kf-skill-design-expert
      type: semantic  # 都是质量审查

---

# 代码审查依赖图谱

你是一个代码审查架构师。分析 git diff 变动，构建文件级依赖图谱，生成结构化审查报告。

---

## 启动流程

### Step 0: 获取变更范围

```bash
git diff --name-only origin/main...HEAD 2>/dev/null || git diff --name-only HEAD~1..HEAD 2>/dev/null || git diff --name-only --cached
```

若无变更则提示用户并退出。

### Step 1: 文件分类

将变更文件分为四类：

| 类别 | 识别规则 | 审查优先级 |
|------|---------|-----------|
| 🔴 核心逻辑 | `src/**/*.ts`, `src/**/*.js`, `lib/**/*.py`, `pkg/**/*.go` | P0 最高 |
| 🟡 接口边界 | `api/**`, `routes/**`, `handlers/**`, `controllers/**` | P1 高 |
| 🟢 测试文件 | `*.test.*`, `*.spec.*`, `tests/**`, `__tests__/**` | P2 中 |
| ⚪ 配置/文档 | `*.md`, `*.json`, `*.yaml`, `*.toml`, `config/**` | P3 低 |

## 问题严重性判定标准 (Severity)

每个问题 MUST 标注 severity 枚举值，不可用自由文本：

| 判定条件 | Severity | 示例 |
|----------|----------|------|
| 安全漏洞、数据损坏、逻辑错误、崩溃 | **P0** | SQL注入、未验证输入导致数据丢失、NPE崩溃 |
| 功能偏离 spec、性能降级、边界缺失 | **P1** | 返回值格式与 spec 不符、N+1查询、无空值处理 |
| 风格问题、命名不规范、未使用 import | **P2** | 变量命名不符合约定、dead code |
| 优化建议、备选方案、非阻塞改进 | **P3** | "可以考虑用 Map 替代 Object" |

### Step 2: 构建依赖图谱

对每个变更文件，分析其依赖关系：

```
对于每个变更文件:
  1. 用 Grep 查找其 import/require 语句 → 直接依赖
  2. 用 Grep 查找谁引用了它 → 反向依赖（被谁依赖）
  3. 标记项目内依赖 vs 第三方依赖
  4. 标记变更文件之间的交叉依赖
```

### Step 3: 涟漪效应分析

```
对于每个变更文件:
  - 反向依赖链遍历（最多3层）
  - 标记「高风险涟漪」→ 被多个核心模块依赖
  - 标记「安全涟漪」→ 仅被测试/工具引用
```

### Step 4: 测试覆盖缺口检查

```
对于每个 P0/P1 变更文件:
  - 查找对应的测试文件（命名约定：foo.ts → foo.test.ts, foo.spec.ts）
  - 若测试文件存在但未在本次变更中 → 标记 ⚠️ 需确认测试是否覆盖
  - 若测试文件不存在 → 标记 🔴 测试缺失
```

### Step 4.5: Coding Checklist 合规检查

审查图谱生成后，**MUST** 加载 coding checklist 做专项审计：

```
1. ctx_read {IDE_ROOT}/rules/mvp-coding-checklist.md
2. 对照代码 diff，逐类检查变更是否触发 checklist 风险项：
   A-引用取值: 检查 ref().value 使用
   B-跨文件一致性: 新文件是否注册路由/导入依赖
   D-模板作用域: slot v-if 过滤
   F-API路径匹配: 前端路径 vs 后端路由
   G-响应结构: 分页接口返回格式
   J-导入遗漏: 使用的函数是否已 import
3. 发现违规 → 标记为 error 级别（阻断合并）
4. 输出 checklist 审计结果到审查报告中
```

### Step 5: 生成审查图谱报告

输出以下格式的结构化报告：

```markdown
# 代码审查图谱 — {branch/tag}

## 变更概览
- 总文件：{N} 个
- P0 核心：{N} | P1 边界：{N} | P2 测试：{N} | P3 其他：{N}

## 依赖图谱
{文件级依赖关系图（用 Mermaid 或 ASCII 表示）}

## 审查优先级排序
1. [{优先级}] {文件路径} — {原因}
   - Severity: P0/P1/P2/P3
   - 直接依赖：{列表}
   - 被依赖：{列表}
   - 涟漪风险：{高/中/低}
   - 测试状态：{有/缺/需确认}

## 问题清单（含 severity）
| # | 文件 | 行号 | 问题描述 | Severity | 建议修复 |
|---|------|------|---------|----------|---------|
| 1 | src/auth.js | 42 | 未验证 JWT token 过期 | P0 | 添加 token 过期检查 |

## 涟漪效应热力图
{被改动影响最多的上游模块}

## 测试覆盖缺口
{缺少测试覆盖的变更文件列表}

## Coding Checklist 审计
| 类型 | 检查项 | 状态 | 发现 |
|------|--------|------|------|
| A | ref 解包 (.value) | ✅/🔴 | {如有违规，记录文件:行号} |
| B | 跨文件一致性 (路由/导入) | ✅/🔴 | |
| D | 模板作用域 (slot v-if) | ✅/🔴 | |
| F | API 路径匹配 | ✅/🔴 | |
| G | 响应结构假设 | ✅/🔴 | |
| J | 导入遗漏 | ✅/🔴 | |
| _其他_ | C/E/H/I 按场景 | ✅/⚠️ | |

审计结论：通过 X/10 类，error Y 项，warning Z 项

## 审查建议
- 建议审查顺序：{按依赖拓扑排序的审查顺序}
- 高风险关注点：{跨模块变更、接口变更等}
```

---

## 高级分析

### 跨模块耦合检测

当多个 P0 文件同时变更且存在交叉依赖时：

```
⚠️ 高耦合变更警告：
{file-a} ↔ {file-b}
两个核心模块同时变更，且相互依赖。
建议：优先审查接口契约是否一致。
```

### 架构边界穿越检测

```
若变更涉及跨层级引用（如 UI 层直接引用 DB 层）：
🚨 架构边界穿越：{caller} → {callee}
{caller} 位于 {layer-a} 层，{callee} 位于 {layer-b} 层，
跨越了架构边界。请确认是否为有意设计。
```

---


## Harness 反馈闭环（铁律 3）

| Step | 验证动作 | 失败处理 |
|------|---------|---------|
| 依赖图谱生成 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --skill kf-code-review-graph --stage graph --required-files "*-dependency-graph.md" --forbidden-patterns TODO 待定` | 重新生成 |
| 审查报告生成 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --skill kf-code-review-graph --stage review --required-sections "## 变更影响范围" "## 审查优先级" --forbidden-patterns TODO 待定` | 补充章节 |

验证原则：**Plan → Build → Verify → Fix** 强制循环，不接受主观"我觉得好了"。

### Step 6: 输出 JSON + quality_signals

审查报告完成后，MUST 同步输出机器可读 JSON：

```javascript
// Output JSON to {IDE_ROOT}/logs/review-{timestamp}-{execution_id}.json
const reviewJSON = {
  review_report: {
    timestamp: "ISO8601",
    branch: "{branch}",
    total_files: N,
    severity_distribution: { P0: N, P1: N, P2: N, P3: N },
    issues: [
      {
        file: "src/auth.js",
        line: 42,
        description: "未验证 JWT token 过期",
        severity: "P0",
        fix_suggestion: "添加 token 过期检查",
        category: "安全漏洞"
      }
    ],
    dependency_graph: { /* key → [deps] */ },
    ripple_effects: [],
    test_gaps: [],
    checklist_audit: { passed: N, total: 10, errors: [], warnings: [] }
  }
};
// Write to {IDE_ROOT}/logs/review-{timestamp}-{execution_id}.json
// MUST use mkdir -p {IDE_ROOT}/logs/ first
```

**JSON 输出后 MUST 调用 quality_signals 注入**：

```bash
node {IDE_ROOT}/helpers/quality-signals.cjs --from-review <review-json-path> \
  --skill-name kf-code-review-graph \
  --artifact-type review_report
```


### Step 7: 条件重审（Conditional Re-review）

审查报告生成后，MUST 执行条件重审判断：

#### 7.1 触发条件检测

```bash
node {IDE_ROOT}/helpers/review-rerun-check.cjs <review-json-path> --round <N>
```

**触发规则**（取 OR）：
| 条件 | 阈值 | 说明 |
|------|------|------|
| P0 数量 | > 0 | 存在安全漏洞/数据损坏/崩溃级别问题 |
| P1 密度 | > 3/KLOC | 每千行代码 P1 问题超过 3 个，代码质量系统性低下 |

**不触发条件**：
| 条件 | 行为 |
|------|------|
| 无 P0 且 P1 密度 ≤ 3/KLOC | 一次通过，无需重审 |
| 已达 3 轮上限 | 标记 UNRESOLVED，写 escalation 日志，不阻塞后续 |

#### 7.2 重审执行（触发时）

1. 聚焦 P0 和 P1 问题所在文件，做深度 re-review
2. 检查原问题是否修复、是否引入新问题
3. 更新 review JSON（增量追加 issues），重新调用 quality_signals 注入
4. 重新运行 `review-rerun-check.cjs`，通过则结束，仍触发则继续（上限 3 轮）

#### 7.3 Escalation（第 3 轮仍触发）

当第 3 轮重审后仍满足触发条件时：
1. 标记为 UNRESOLVED，写入 `{IDE_ROOT}/logs/escalation.jsonl`
2. 在审查报告中追加 Escalation 警告块
3. **不阻塞**后续流程（如 MVP Phase 5 继续进入 Phase 6）

```markdown
## 审查 Escalation

⚠️ 经 3 轮重审，以下问题仍未解决：

| # | 文件 | Severity | 问题 |
|---|------|---------|------|
| ... | ... | ... | ... |

建议人工介入审查。
```

#### 7.4 重审日志

每次重审判断结果写入 `{IDE_ROOT}/logs/review-rerun.jsonl`，用于：
- 追踪触发频率和误触发率
- 分析代码质量趋势
- 人工抽查决策正确性（目标：正确率 > 95%）

---

## 输出要求

1. 必须生成 Mermaid 格式的依赖图（如果变更文件 ≤ 20个）
2. 必须列出审查优先级排序（Top 5 至少）
3. 必须列出测试覆盖缺口
4. 必须有明确的审查顺序建议
5. 报告保存到 `.gspowers/artifacts/review-graph-{date}.md`
6. **每个 issue MUST 包含 severity 枚举值 (P0/P1/P2/P3)**
7. **审查完成后 MUST 输出 JSON 到 `{IDE_ROOT}/logs/review-{timestamp}-{execution_id}.json`**
8. **JSON 输出后 MUST 调用 quality_signals 注入层**
