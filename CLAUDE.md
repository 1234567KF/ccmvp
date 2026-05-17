# MVP 技能框架

本仓库是 AI 编程智驾框架，以 MVP 快速原型开发为核心。
运行环境：原生 Claude Code CLI。

## 配置目录

`.claude/` — 技能框架核心目录（技能、文档、辅助脚本）

> 路径占位符：`{IDE_ROOT}` = `.claude/`

- `.claude/hooks/` — Hook 脚本（运行时，全生命周期）
- `.claude/skills/` — 技能定义（Markdown）
- `.claude/helpers/` — 辅助脚本
- `.claude/rules/` — 编码规则

> `.qoder/` 目录为历史遗留，已停止同步，不再使用。

## 核心技能

| 触发词 | 说明 |
|--------|------|
| `/mvp` | MVP Pipeline（PRD+Spec+原型+TDD） |
| `/go` | 统一工作流导航入口 |
| `头脑风暴` | 头脑风暴评审 |
| `/spec` | 技术规格生成 |
| `/对齐` | 需求对齐 |

## 快速开始

1. 在 `.claude/settings.local.json` 中配置 API Key
2. 打开项目，输入 `/mvp [任务描述]` 启动 MVP Pipeline
