# helpers/ 目录结构

> 可执行 .cjs/.mjs 模块，被 settings.json hooks 或手动 CLI 调用。

## Hook 注册的脚本

| 脚本 | 注册点 | 职责 |
|------|--------|------|
| `hook-handler.cjs` | PreToolUse / PostToolUse / SessionStart / SessionEnd | 中央调度（安全 require，stdin 超时处理） |
| `alignment-hook.cjs` | PostToolUse | 对齐检查自动触发 |
| `auto-memory-hook.mjs` | SessionStart / Stop | 自动记忆导入/同步 |
| `tokenforge-hook.cjs` | PreToolUse | 管道压缩（Bash 输出 → tokenforge） |
| `harness-gate-check.cjs` | 通过 gate-keeper 技能调用 | 阶段门禁验证 |

## 手动 CLI 脚本

| 脚本 | 职责 |
|------|------|
| `tdd-gate-check.cjs` | TDD 合规验证 |
| `build-gate.mjs` | 编译门禁 |
| `test-gate.mjs` | 测试门禁 |
| `agent-visual-dashboard.cjs` | Agent 执行看板 |
| `coverage-reporter.cjs` | 覆盖率报告 |
| `spec-reviewer.cjs` | Spec 审查 |
| `skill-validator.cjs` | 技能定义校验 |
| `review-rerun-check.cjs` | 审查重跑检查 |
| `quality-signals.cjs` | 质量信号采集 |
| `test-cycle-manager.cjs` | 测试循环管理 |
| `contract-checker.mjs` | 契约检查 |
| `hang-state-manager.cjs` | 挂起状态管理 |

## 性能监控（perf/）

| 脚本 | 职责 |
|------|------|
| `perf-auto-log.cjs` | PreToolUse 自动性能日志 |
| `perf-capture.cjs` | 性能数据采集 |
| `perf-daemon.cjs` | 性能守护进程 |
| `perf-server.cjs` | 性能数据服务 |
| `sync-from-transcript.cjs` | 转录同步 |
| `perf-tracker.cjs` | 性能追踪 |
| `sync-lean-ctx.cjs` | lean-ctx 同步 |
| `optimization-registry.json` | 优化注册表 |
