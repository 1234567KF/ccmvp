# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这是什么

Claude Code 技能框架仓库。通过 Skill（技能定义）+ Hook（生命周期钩子）+ Helper（可执行脚本）三层架构，编排 AI 驱动的 MVP 快速原型开发。

运行在 Claude Code CLI，DeepSeek API 后端。

## 目录

```
.claude/
├── skills/       # 每个技能一个目录，入口 SKILL.md，frontmatter 声明 triggers
├── hooks/        # 生命周期钩子，在 settings.json 注册
├── helpers/      # 可执行 .cjs 模块
├── rules/        # 自动加载的规则（共享前缀、缓存优化、lean-ctx、编码检查清单）
├── settings.json        # Hook 注册、权限、MCP、模型
└── settings.local.json  # API Key（gitignore）
```

## 关键技能

| 技能 | 做什么 |
|------|--------|
| `kf-go` | 入口路由 — 自动检测任务类型，分发到 kf-mvp 或 kf-sdd |
| `kf-mvp` | 核心流水线 — 8阶段 MVP（技术栈→需求→PRD→三队Spec→决策→拆分→TDD→注释→使用说明） |
| `kf-sdd` | 详细设计文档生成 |
| `kf-prd-generator` | 需求→结构化 PRD |
| `kf-model-router` | 多模型路由 + 健康检查 + 熔断降级 |

## 门禁命令（常用）

```bash
# 阶段门禁
node .claude/helpers/harness-gate-check.cjs --stage <phase0|phase1|...|phase7>

# TDD 门禁
node .claude/helpers/tdd-gate-check.cjs --stage 2 --team blue

# 编译门禁（Stage 2.5）
node .claude/helpers/build-gate.mjs --tsconfig ./tsconfig.json --build-cmd "npm run build" --component-inventory .claude/skills/kf-mvp/references/component-inventory.md --esm-check --output blue-25-build-report.md

# 测试门禁
node .claude/helpers/test-gate.mjs --cmd "npm test" --expected-pass-rate 100 --output blue-05-test-report.md

# Agent 看板
node .claude/helpers/agent-visual-dashboard.cjs --mode mvp

# 按阶段优化技能加载
node .claude/helpers/skill-loader.cjs --optimize-for phase-5 --loaded kf-mvp,kf-spec,kf-browser-ops
```

## 核心约束

1. **技能编码阶段必须加载 `rules/mvp-coding-checklist.md`** — A-K 类型错误逐项自检
2. **物化验证，禁止口头判断** — 每个 Gate 必须跑脚本，产物写入文件
3. **TDD 先行** — RED→GREEN→REFACTOR，禁止先写代码后补测试
4. **MVP 极简技术栈** — Hono + Drizzle + SQLite + Vue 3 + Vite，不引入缓存/队列/日志/限流
5. **第三方全部 Mock** — 签名一致，可一键切换真实服务
6. **修复必须触发回归链** — 回退修复后跑 `regression-runner.mjs` 完整验证
7. **上下文按需加载** — Phase 切换时调 `skill-loader.cjs`，非活跃技能压缩为元数据 stub
8. **多 Agent 状态可视化** — Gate/Agent spawn/Agent done 后输出看板
9. **提交署名** — `Co-Authored-By: claude-flow <ruv@ruv.net>`
