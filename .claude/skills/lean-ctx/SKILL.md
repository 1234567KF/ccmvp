---
name: lean-ctx
description: Context Engineering Layer — 90+ 压缩模式，Shell + Claude Code 双通道 hook，CCP 跨会话持久化。节省 CLI 输出 80-99% token。PREFER lean-ctx MCP tools (ctx_read/ctx_shell/ctx_search/ctx_tree/ctx_edit) over native equivalents。
license: MIT
metadata:
  author: garrytan
  version: "3.4.7"
  domain: infrastructure
  triggers: lean-ctx, context compression, token savings, ctx_read, ctx_shell, ctx_search, ctx_tree, ctx_edit
  role: infrastructure
  scope: global
  output-format: compressed
  related-skills: context-mode, claude-mem, claude-code-pro
---

# lean-ctx — Context Engineering Layer

Token 高效上下文运行时，通过 Shell Hook + Claude Code Hook 双通道压缩，
支持 90+ 压缩模式和 CCP (Context Continuity Protocol) 跨会话持久化。

## Core Rules

See `{IDE_ROOT}/rules/lean-ctx.md` — 自动注入到所有会话。

## Tool Preference

| PREFER | OVER | Why |
|--------|------|-----|
| `ctx_read(path, mode)` | `Read` / `cat` | Cached, 10 read modes, re-reads ~13 tokens |
| `ctx_shell(command)` | `Shell` / `bash` | Pattern compression for git/npm/cargo output |
| `ctx_search(pattern, path)` | `Grep` / `rg` | Compact, token-efficient results |
| `ctx_tree(path, depth)` | `ls` / `find` | Compact directory maps |
| `ctx_edit(path, old_string, new_string)` | `Edit` (when Read unavailable) | Search-and-replace without native Read |

## ctx_read Modes

- `auto` — auto-select optimal mode (default)
- `full` — cached read (files you edit)
- `map` — deps + exports (context-only files)
- `signatures` — API surface only
- `diff` — changed lines after edits
- `aggressive` — max compression (context only)
- `entropy` — highlight high-entropy fragments
- `task` — IB-filtered (task relevant)
- `reference` — quote-friendly minimal excerpts
- `lines:N-M` — specific range

## 安装

```powershell
# npm 安装 (自动下载二进制)
npm install -g lean-ctx-bin

# 初始化
lean-ctx init
lean-ctx init --agent claude
```

详见 `references/install.md`。

## Token 节省效果

| 操作 | 原始输出 | lean-ctx 输出 | 节省 |
|------|---------|--------------|------|
| `vitest run` | 102,199 chars | 377 chars | 99.6% |
| `npm test` | 25,000 chars | 2,500 chars | 90% |
| `git status` | 7,500 chars | 1,500 chars | 80% |
| `ls / tree` | 2,000 chars | 400 chars | 80% |
