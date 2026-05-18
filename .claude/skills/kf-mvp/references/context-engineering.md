# 上下文优化与可视化追踪

> 由 SKILL.md 按需加载。包含 skill-loader、agent-visual-dashboard、perf-tracker 完整命令参考。

---

## skill-loader — 按需技能加载（L3 缓存）

每个 Phase 切换时运行：
```bash
# Phase 0 启动
node {IDE_ROOT}/helpers/skill-loader.cjs --optimize-for phase-0 --loaded kf-mvp > .tmp-skill-loader-phase-0.json
node {IDE_ROOT}/helpers/extract-savings.cjs .tmp-skill-loader-phase-0.json

# 后续 Phase 切换
node {IDE_ROOT}/helpers/skill-loader.cjs --optimize-for <phase-id> --loaded <已加载技能> > .tmp-skill-loader-<phase>.json
node {IDE_ROOT}/helpers/extract-savings.cjs .tmp-skill-loader-<phase>.json
```

**加载规则**：
- `required` + `always_on` → 完整加载
- `recommended` / `contextual` → 按需触发
- 非当前阶段技能 → 元数据 stub（~25 tokens/技能）

---

## agent-visual-dashboard — 多 Agent 状态看板

**输出时机**：每次 Gate 通过后 | 每次 spawn/done 子 Agent | 用户输入 `status`

```bash
# 完整看板
node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --mode mvp

# 紧凑状态条
node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --mode mvp --compact

# 记录 Agent
node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --agent-spawn --team <队> --agent <名称> --task <任务ID>
node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --agent-done --team <队> --agent <名称>
node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --agent-fail --team <队> --agent <名称> --error "<原因>"

# 阶段进度
node {IDE_ROOT}/helpers/agent-visual-dashboard.cjs --phase <phase-id> --percent <0-100>
```

看板包含：Phase 流水线进度条 | 活跃 Agent 状态表 | 模块 TDD 进度 | Token 效率 | 交付产物清单

---

## perf-tracker — 全量执行追踪

数据存于 `.claude-flow/perf/`，独立于 skill-traces。

```bash
# 记录对话轮次
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase <phase> --role ai --model <model> --input <N> --cache <%> --output <N> --summary "<阶段摘要>"

# 记录 Agent 间通信
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs auto-log --phase <phase> --role a2a --from <A> --to <B> --model flash --input <N> --cache 0 --output <N> --summary "<摘要>"

# 优化节省明细
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs log-opt --turn-id <id> --lean-ctx-raw <N> --lean-ctx-compressed <N> --l1-cache-hit <N> --l3-stubs <N>

# 最终看板
node {IDE_ROOT}/helpers/perf/perf-tracker.cjs web
# 打开：scripts\view-perf.bat 或双击
```
