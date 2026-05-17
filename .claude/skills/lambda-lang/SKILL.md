---
name: lambda-lang
description: Agent-to-Agent 原生通信语言 — 340+ 原子指令，7 域（a2a/evo/code/...），3x 压缩。自动注入到多 Agent 并发场景。握手协议 @v2.0#h。
license: MIT
metadata:
  author: team
  version: "2.0"
  domain: infrastructure
  triggers: lambda, agent communication, !ta ct, @v2.0#h, agent通信
  role: infrastructure
  scope: multi-agent
  output-format: protocol
  related-skills: claude-code-pro, kf-mvp
---

# lambda-lang — Agent-to-Agent 原生语言

多 Agent 并发时自动注入 Λ 通信协议，提供 340+ 原子指令，7 域覆盖。

## 核心特性

| 特性 | 说明 |
|------|------|
| 压缩率 | 3x（~200 token → ~67 token/次通信） |
| 原子数 | 340+ |
| 域 | a2a/evo/code/swarm/mcp/obs/kv |
| 触发条件 | 多 Agent spawn 前自动注入 |
| 握手协议 | `@v2.0#h` |

## 工作原理

由 `claude-code-pro`（ccp-smart-dispatch.cjs）在 spawn agent 时自动在 prompt 中注入 Lambda 协议前缀。

## 示例

```
!ta ct @task analyze-deps
!ta st @status done
@v2.0#h  ← 握手确认
```
