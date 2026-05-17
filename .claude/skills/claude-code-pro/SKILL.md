---
name: claude-code-pro
description: Token 高效调度器 — 知道何时不启动子阶段（<3 文件跳过，省 10K-15K token）。被 `/mvp`、`/triple` 自动调用。（通用 IDE 适配版：回调/轮询逻辑已移除，保留阶段跳过判断）
license: MIT
metadata:
  author: team
  version: "1.0"
  domain: infrastructure
  triggers: ccp, 智能调度, 回调, claude-code-pro
  role: infrastructure
  scope: multi-agent
  output-format: config
  related-skills: lambda-lang, kf-mvp
---

# claude-code-pro — Token 高效调度器（通用 IDE 精简版）

串行阶段场景下智能决定何时跳过子阶段执行。

【通用 IDE 适配说明】
原 Claude Code 版控制 Agent spawn 和回调/轮询，本版精简为：
- 阶段跳过判断（<3 文件且简单依赖 → 直接在当前会话执行）
- 回调/轮询逻辑已移除（通用 IDE 无 Agent 间通信）

## 核心逻辑

```
shouldSkipStage = fileCount < 3 && !hasComplexDependencies
```

## 节省效果

| 场景 | 无 CCP | 有 CCP | 节省 |
|------|--------|--------|------|
| <3 文件任务 | 15K token (启动子阶段) | 0 (跳过) | ~15K token |

## 实现

桥接文件: `{IDE_ROOT}/helpers/ccp-smart-dispatch.cjs`
在阶段启动前注入跳过判断逻辑。
