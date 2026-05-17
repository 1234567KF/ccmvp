# kf-exa-code 安装与配置指南

## 角色归属

kf-exa-code 属于**节流者（Throttler）**角色体系。作为代码知识检索引擎，它在编码过程中检测知识断层并提供代码示例，是节流者体系中负责"外部知识注入"的关键组件。

## 前置条件

1. **Exa API Key**: 在 [exa.ai](https://exa.ai) 注册获取
2. **Exa MCP 地址**: `https://mcp.exa.ai/mcp`

## 安装步骤

### 1. 配置 Exa API Key

```bash
# 添加到环境变量
export EXA_API_KEY="your-exa-api-key-here"

# Windows PowerShell
$env:EXA_API_KEY="your-exa-api-key-here"
```

### 2. 注册 Exa MCP 服务器

在 settings.json 中添加：

```json
{
  "mcpServers": {
    "exa": {
      "command": "npx",
      "args": ["-y", "@exa-labs/exa-mcp-server"],
      "env": {
        "EXA_API_KEY": "${EXA_API_KEY}"
      }
    }
  }
}
```

### 3. 验证安装

在 Claude Code 中运行：

```
/exa-code test
```

应返回 Exa MCP 连通性确认。

## 使用方式

### 手动触发

```
/exa-code Prisma findMany where 条件过滤
/exa-code "axios interceptors token refresh"
/exa-code --type deep "WebSocket reconnection strategy"
```

### 自动触发

技能在以下场景自动触发：
- import 了未在项目依赖中找到的库
- 编译/运行时报 `ModuleNotFoundError`
- 使用了不熟悉的 API 签名
- `/mvp` 的 Phase 1/2/5 编码阶段按需调用

### 参数选项

| 参数 | 简写 | 默认 | 说明 |
|------|------|------|------|
| `--type` | `-t` | `auto` | 搜索类型 |
| `--code-only` | `-c` | false | 仅代码结果 |
| `--no-prefetch` | — | — | 关闭自动预取 |

## 降级行为

```
Exa MCP 不可用 → kf-web-search → kf-scrapling → 提示手动查阅
```

## 缓存目录

```
{IDE_ROOT}/exa-cache/
├── snippets/    # 代码片段缓存（6h TTL，最大 50MB）
└── index.json   # 缓存索引（7天）
```

