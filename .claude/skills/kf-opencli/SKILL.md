---
name: kf-opencli
description: |
  OpenCLI — 把任意网站变成命令行工具。AI 原生的浏览器自动化框架，100+ 平台内建适配器，
  通过 Chrome Extension 复用已登录会话，零凭证存储。结构化数据提取（table/json/yaml/md/csv），
  补充 kf-web-search（搜索）和 kf-scrapling（爬虫）之间的真空地带：特定平台的结构化数据 CLI 直取。
  可被 kf-mvp Stage 1/2/3 按需自动调用。
triggers:
  - opencli
  - 平台抓取
  - 热榜
  - 知乎热榜
  - B站热门
  - 微博热搜
  - 小红书
  - 抖音
  - GitHub trending
  - HackerNews
  - Twitter trending
  - Reddit
  - 数据直取
  - CLI抓取
  - 浏览器自动化
version: "1.7.11"
license: Apache 2.0 / BSD-3-Clause
recommended_model: flash
integrated-skills:
  - kf-alignment
  - kf-web-search
  - kf-scrapling
metadata:
  pattern: tool-wrapper
  homepage: "https://github.com/jackwener/opencli"
  npm: "@jackwener/opencli"
  platforms: 100+
graph:
  dependencies:
    - target: kf-scrapling
      type: substitution  # CLI 不可用时降级爬虫

---

# OpenCLI — 平台数据 CLI 直取

OpenCLI 是一个 AI 原生的浏览器自动化框架，将任意网站变成命令行工具。
100+ 内建适配器覆盖国内外主流平台，通过 Chrome Extension 复用浏览器已登录会话，
**零凭证存储、零风控风险**。

## 与现有技能的互补关系

| 技能 | 定位 | 何时用 |
|------|------|--------|
| **kf-web-search** | 多引擎搜索 | 需要找资料、搜文章、查文档 |
| **kf-scrapling** | 通用爬虫+反反爬 | 抓取任意网站、需要 Python 编程、绕过 Cloudflare |
| **kf-opencli** (本技能) | 平台数据 CLI 直取 | 目标平台已在 100+ 适配器中，需要结构化数据快速直取 |

决策流程：
```
需要数据？
  ├─ 任意网站/需要编程 → kf-scrapling
  ├─ 搜资料/找文章 → kf-web-search
  └─ 特定平台(知乎/B站/微博/GitHub/Twitter/Reddit...) → kf-opencli
```

## 安装（已完成）

```bash
npm install -g @jackwener/opencli  # 全局安装
opencli --version                   # 验证：1.7.11
```

### Chrome Extension（可选，启用会话复用）

OpenCLI 通过 Chrome Extension 复用浏览器已登录会话，实现**零凭证**访问需要登录的平台。
安装 Chrome Extension 后，`opencli browser` 命令可操作浏览器进行复杂交互。

```bash
opencli doctor  # 诊断浏览器桥接状态
```

## 平台适配器速查

### 国内平台

| 平台 | 命令示例 | 用途 |
|------|---------|------|
| 知乎 | `opencli zhihu hot -f json` | 热榜/搜索/回答/用户 |
| B站 | `opencli bilibili hot --limit 10` | 热门视频/搜索/用户 |
| 微博 | `opencli weibo hot` | 热搜/搜索/用户 |
| 小红书 | `opencli xiaohongshu search <关键词>` | 笔记搜索/详情 |
| 抖音 | `opencli douyin hot` | 热门/搜索/用户 |
| 豆瓣 | `opencli douban movie-hot` | 电影/书籍/搜索 |
| 36氪 | `opencli 36kr hot` | 热榜/文章/搜索 |
| 淘宝 | `opencli taobao search <关键词>` | 商品搜索 |
| 京东 | `opencli jd search <关键词>` | 商品搜索 |
| 1688 | `opencli 1688 search <关键词>` | 货源搜索 |
| 闲鱼 | `opencli xianyu search <关键词>` | 二手搜索 |
| BOSS直聘 | `opencli boss search <关键词>` | 职位搜索 |
| 东方财富 | `opencli eastmoney hot-stock` | 股票/行情 |
| 雪球 | `opencli xueqiu hot` | 投资社区 |
| 虎扑 | `opencli hupu hot` | 热帖/搜索 |
| V2EX | `opencli v2ex hot` | 热帖/搜索 |
| Linux DO | `opencli linux-do hot` | 热帖/搜索 |
| 贴吧 | `opencli tieba hot` | 热帖/搜索 |
| 今日头条 | `opencli toutiao hot` | 热榜/搜索 |
| 微信读书 | `opencli weread book-hot` | 书籍/排行 |
| 得到 | `opencli ke courses` | 课程/搜索 |
| 中国知网 | `opencli cnki search` | 学术论文搜索 |
| 百度学术 | `opencli baidu-scholar search` | 学术搜索 |
| 万方 | `opencli wanfang search` | 学术搜索 |
| 超星 | `opencli chaoxing search` | 学术搜索 |

### 国际平台

| 平台 | 命令示例 | 用途 |
|------|---------|------|
| GitHub | `opencli gh search repos <关键词>` | 仓库/PR/Issue 搜索 |
| HackerNews | `opencli hackernews top --limit 5` | 热帖/搜索 |
| Twitter/X | `opencli twitter trending` | 趋势/搜索/用户 |
| Reddit | `opencli reddit search <关键词>` | 搜索/subreddit/帖子 |
| YouTube | `opencli youtube search <关键词>` | 视频搜索/详情 |
| arXiv | `opencli arxiv search <关键词>` | 论文搜索 |
| Wikipedia | `opencli wikipedia search <关键词>` | 百科搜索 |
| Bloomberg | `opencli bloomberg news` | 财经新闻 |
| Yahoo Finance | `opencli yahoo-finance stock <代码>` | 股票数据 |
| ProductHunt | `opencli producthunt top` | 产品热榜 |
| Medium | `opencli medium search <关键词>` | 文章搜索 |
| Substack | `opencli substack search <关键词>` | 博客搜索 |
| Instagram | `opencli instagram search <关键词>` | 搜索/帖子 |
| TikTok | `opencli tiktok trending` | 趋势/搜索 |
| LinkedIn | `opencli linkedin search <关键词>` | 搜索/职位 |
| Spotify | `opencli spotify search <关键词>` | 音乐搜索 |
| IMDb | `opencli imdb search <关键词>` | 电影搜索 |
| StackOverflow | `opencli stackoverflow search <关键词>` | 技术问答 |
| Dev.to | `opencli devto top` | 技术文章 |
| Google Scholar | `opencli google-scholar search <关键词>` | 学术搜索 |
| LessWrong | `opencli lesswrong top` | AI 对齐社区 |
| Bluesky | `opencli bluesky search <关键词>` | 社交搜索 |
| Discord | `opencli discord-app channels` | 频道/消息 |

### AI 平台

| 平台 | 命令示例 | 用途 |
|------|---------|------|
| Claude | `opencli claude conversations` | 对话管理 |
| ChatGPT | `opencli chatgpt conversations` | 对话管理 |
| Gemini | `opencli gemini conversations` | 对话管理 |
| DeepSeek | `opencli deepseek conversations` | 对话管理 |
| Grok | `opencli grok conversations` | 对话管理 |
| 豆包 | `opencli doubao conversations` | 对话管理 |
| 元宝 | `opencli yuanbao conversations` | 对话管理 |
| 即梦 | `opencli jimeng generate <提示词>` | AI 图片生成 |
| Cursor | `opencli cursor open` | IDE 控制 |
| Codex | `opencli codex open` | IDE 控制 |

### 企业协作

| 平台 | 命令示例 | 用途 |
|------|---------|------|
| 飞书/Lark | `opencli lark-cli docs <id>` | 文档/消息/日历 |
| 企业微信 | `opencli wecom-cli messages` | 消息/日程/文档 |
| 钉钉 | `opencli dws messages` | 消息/文档/日历 |
| Notion | `opencli notion search <关键词>` | 页面/数据库 |
| Obsidian | `opencli obsidian search <关键词>` | 笔记搜索 |

## CLI 使用模式

### 基础数据提取

```bash
# 结构化输出（默认 table）
opencli <platform> <command> [options]

# JSON 输出（给 AI agent 消费）
opencli <platform> <command> -f json

# Markdown 输出（给人类阅读）
opencli <platform> <command> -f md

# CSV 输出（给数据分析）
opencli <platform> <command> -f csv

# 限制结果数
opencli <platform> <command> --limit 10
```

### 浏览器控制

```bash
# 截图
opencli browser screenshot --url https://example.com

# 导航+提取
opencli browser navigate --url https://example.com
opencli browser extract --selector ".content"

# 交互操作
opencli browser click --selector ".btn"
opencli browser type --selector "input" --text "搜索内容"
opencli browser wait --selector ".loaded"
```

### 搜索模式

```bash
# 平台搜索（替代 web-search 的模糊搜索结果）
opencli zhihu search "Rust async trait" -f json
opencli reddit search "best practices microservices" --limit 20
opencli github search repos "llm agent framework" --limit 10
opencli arxiv search "attention mechanism transformer" -f json
opencli bilibili search "前端性能优化" --limit 10
```

## Agent 调用模式

当被 kf-mvp 的 agent 调用时：

```
Stage 1 (架构设计):
  - 搜索技术方案: opencli github search repos <技术栈> --limit 5 -f json
  - 查最新论文: opencli arxiv search <关键词> -f json
  - 看社区讨论: opencli reddit search <主题> --limit 10
  - 国内方案: opencli zhihu search <技术> -f json

Stage 2 (编码实现):
  - 找参考代码: opencli github search code <关键词> --limit 10
  - 查 StackOverflow: opencli stackoverflow search <问题> -f json
  - 搜组件库: opencli uiverse search <UI模式>

Stage 3 (集成测试):
  - 浏览器自动化: opencli browser screenshot/click/type
  - 数据验证: opencli <platform> <command> -f json 对比预期数据结构
```

## 与 kf-web-search/kf-scrapling 的协作模式

### 模式 1: Search → OpenCLI 深度提取

```
kf-web-search 搜索 → 发现知乎/B站/Reddit 上的高相关度内容
                → kf-opencli 直接获取结构化全文/详情
```

### 模式 2: OpenCLI → Scrapling 深度抓取

```
kf-opencli 列出目标 URL 列表 → kf-scrapling 并发批量抓取全文
```

### 模式 3: 三维信息收集（MVP Stage 1 标配）

```
kf-web-search → 多引擎搜索，发现信息源
kf-opencli    → 特定平台结构化数据直取
kf-scrapling  → 非适配器网站深度反反爬抓取
```

## Guardrails

- 仅访问你有权限的平台和数据
- 遵守各平台 ToS，不用于大规模爬取
- `[cookie]` 标记的命令需要 Chrome Extension 复用已登录会话，但不会存储凭证
- `[intercept]` 标记的命令通过浏览器桥接拦截网络请求，不主动发送额外请求
- `[public]` 标记的命令无需认证即可使用
- `[ui]` 标记的命令通过 CDP 操作桌面应用 UI，需应用已打开
- 敏感数据（如私信、个人资料）不记录到产物文件

## 参考链接

- GitHub: https://github.com/jackwener/opencli
- npm: https://www.npmjs.com/package/@jackwener/opencli
- `references/adapter-list.md` — 完整适配器列表（自动生成）
