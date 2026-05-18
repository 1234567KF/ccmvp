---
name: kf-data-ingest
description: >
  Use when the user provides URLs, login credentials, or targets for web scraping
  and the extracted data must be persisted locally to prevent context loss.
  Triggers: "抓取数据", "爬取保存", "采集存储", "scrape to file", "分析这个网站",
  "帮我爬", "数据采集", URLs with credentials for crawling.
triggers:
  - 抓取数据
  - 数据采集
  - 爬取保存
  - 采集存储
  - scrape to file
  - 爬取并保存
  - 采集数据
  - 爬虫保存
  - 分析这个网站
  - 帮我爬
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - WebSearch
  - WebFetch
integrated-skills:
  - kf-scrapling
  - kf-web-search
  - kf-alignment
metadata:
  pattern: pipeline
  version: "0.2.0"
  called_by:
    - kf-mvp               # Phase 0 输入预处理
recommended_model: flash
---

# kf-data-ingest — 数据抓取与本地持久化

You are running a data ingestion pipeline. Execute each step in order. **Do NOT skip steps.** Each step has a gate condition — do not proceed until it is met.

---

## Step 1 — 需求确认（Inversion Phase）

**Goal**: Confirm scope, credentials, and tooling before spending resources.

### 1a. 收集信息

Ask the user (one at a time if unclear):
1. **目标 URL / 站点列表** — 主站路径
2. **凭据** — 账号密码 / Cookie / Token / API Key
3. **采集范围** — 单页 / 全站 / 特定路径 / 特定数据字段
4. **是否需要登录后的状态** — 登录后 cookie/session 是否需要保持

### 1b. 工具选型

Based on the target, select the primary tool:

| 场景 | 首选工具 | 回退方案 |
|------|---------|---------|
| 公开网页/文档 | kf-web-search + WebFetch | kf-scrapling get |
| 需登录/表单提交 | kf-scrapling post | kf-scrapling fetch (browser) |
| Cloudflare 反爬 | kf-scrapling stealthy-fetch --solve-cloudflare | 改 kf-web-search 搜索缓存版本 |
| 动态渲染/JS 重 | kf-scrapling fetch --network-idle | kf-scrapling stealthy-fetch |
| 大规模/多页列表 | kf-scrapling Spider | 拆分为多次单页请求 |
| 需要搜索资料 | kf-web-search (策略 A/B/C) | 再定 |

> 选型原则：给一个 **默认方案** + 特殊场景 **回退方案**，不给菜单让 Agent 猜。

**Gate**: Present the plan to the user. Ask: "确认以上方案？凭据是否完整？" Do NOT proceed to Step 2 without user confirmation.

---

## Step 2 — 执行抓取

**Goal**: Fetch data using the chosen tool.

### 2a. 登录状态获取（如需）

If credentials are provided:
- For **kf-scrapling**: Use `scrapling extract post` to submit login form, or `scrapling extract fetch` with `--cookies` for session-based auth
- Capture and verify login success before proceeding to data scraping
- If login fails: report the error to user, do NOT silently continue

### 2b. 数据抓取

Execute the tool from Step 1. Always:
- Use `--ai-targeted` for kf-scrapling extracts (sanitizes output for AI consumption)
- Output to a **temp file** first, then read back
- Validate response content (not empty, not an error page, not a login page redirect)

### 2c. 抓取失败处理

| 失败表现 | 自动处理 |
|---------|---------|
| 空内容 / 403 | kf-scrapling get → fetch (browser) → stealthy-fetch 逐级升级 |
| Cloudflare 拦截 | stealthy-fetch --solve-cloudflare |
| 超时 | --timeout 60 重试一次 |
| 登录后仍返回登录页 | Cookie/Session 未保持，检查凭据或改用 browser fetch |
| 以上全失败 | 通知用户，提供替代建议（缓存 / 人工导出） |

**Gate**: Confirm output is non-empty and relevant. If data is incomplete, notify the user before proceeding.

---

## Step 3 — 本地持久化（强制）

**Goal**: Write structured data to disk so it survives context loss.

### 3a. 创建目录

```
.data/{domain}/
```

### 3b. 写入原始数据

Write the raw extracted content to:
```
.data/{domain}/{YYYYMMDD_HHmm}-raw.{md|json|html|txt}
```

Choose the format based on content type:
- **Markdown** for readable text content (kf-scrapling --ai-targeted output defaults to this)
- **JSON** for structured/API data
- **HTML** only if structure matters and markdown conversion loses information

### 3c. 写入分析摘要

Write a structured summary to a separate file:

```
.data/{domain}/{YYYYMMDD_HHmm}-summary.md
```

Use this exact template:

```markdown
# 数据摘要 — {站点/页面名称}

**抓取时间**: {YYYY-MM-DD HH:mm}
**来源 URL**: {url}
**页面/数据量**: {N pages / N records}

## 关键数据

{表格或结构化列表 — 优先用表格，列名清晰}

## 分析要点

1. {核心发现 1}
2. {核心发现 2}
3. {核心发现 3}

## 完整性评估

- **状态**: {完整 / 部分 / 失败}
- **缺失**: {缺失的内容或字段，无则写 无}
- **置信度**: {高/中/低} — {判断依据}

## 原始数据文件

{引用 raw 文件的相对路径}

## 备注

{额外说明，如需要二次采集、需后续分析等}
```

### 3d. 持久化检查清单

- [ ] `.data/{domain}/` 目录已创建
- [ ] raw 文件已写入（非空）
- [ ] summary 已写入（按上述模板，所有 section 存在）
- [ ] 摘要包含完整性自评

---

## Step 4 — 输出摘要与确认

**Goal**: Present findings to the user concisely.

Present:
1. **数据概况** — 来源、数据量、耗时
2. **核心发现** — 3-5 条要点（优先表格）
3. **本地文件** — `.data/{domain}/` 路径，用户可后续查阅
4. **下一步建议** — 是否需要补充采集 / 开始分析 / 开始编码

Ask: "要继续分析/编码，还是需要补充采集？"

---

## Step 5 — 质量自检（Reviewer Phase）

Before concluding, verify:

- [ ] 所有抓取结果已落地到 `.data/`，不依赖上下文
- [ ] summary.md 包含完整性评估
- [ ] 凭据未硬编码到写入的文件中（检查 raw 文件不包含密码明文）
- [ ] 如果抓取失败，已向用户报告而非静默跳过

---

## Gotchas

- **kf-scrapling 输出到文件时文件扩展名决定格式**：`.md` = markdown, `.json` = JSON, `.txt` = text only, `.html` = raw HTML。不要用 `.txt` 存结构化数据。
- **Temp 文件用完必须清理**：scrapling 临时文件在读取后 `rm` 或 `Remove-Item`，避免磁盘残留。
- **Cookie 有效期短**：登录后立即使用，不要跨步骤等待。先登录取得 cookie，在同一轮中执行数据采集。
- **站点可能限制爬取频率**：`.data/` 目录内容只增不删，避免重复爬取相同页面。
- **密码/Token 检查**：写入 summary 时检查是否意外包含明文密码或 API Key。如有，用 `***` 替换再写文件。

---

## 使用示例

```
用户: "帮我爬这个后台 http://example.com/admin 账号 admin/123456"
→ Step 1: 用户确认范围（后台所有订单页面）+ 凭据
→ Step 2: scrapling extract post 登录 → 获取 cookie → extract get 订单列表
→ Step 3: .data/example.com/20260518_1430-raw.md + summary.md
→ Step 4: 展示摘要，提示用户查阅本地文件
→ Step 5: 自检通过
```
