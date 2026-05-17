---
name: kf-annotate
type: injector
description: >-
  向现有 HTML 页面注入 L0-L6 七层暗门注释，生成注释宣讲看板。
  仅做注释注入，不生成页面。由 kf-mvp Phase 6 自动调用或用户直接触发。
trigger: 注释注入, annotate, 暗门, 宣讲看板, 演示注释, 功能说明
capabilities:
  - annotation_injection
  - presentation_dashboard
  - l0_l6_layer_system
recommended_model: pro
integrated-skills:
  - kf-alignment
graph:
  dependencies:
    - target: kf-mvp
      type: pipeline
      phase: 6

---

# kf-annotate — 暗门注释注入（轻量版）

> **核心价值**：Phase 5 代码完成后，向现有 HTML 页面注入 PRD 级暗门注释，生成宣讲看板供客户演示和团队宣讲。

**适用范围**：仅适用于 kf-mvp 流水线的 Phase 5 产出页面（`prototypes/` 目录下的 HTML 文件）。

---

## 三阶段流水线

```
Phase A: 扫描（Scan）      Phase B: 注入（Inject）      Phase C: 看板（Dashboard）
────────────────────       ────────────────────       ────────────────────
读取 Phase 5 页面        →  生成结构化注释 JSON     →  生成宣讲看板 HTML
解析 PRD + Spec             注入 JSON 数据块            含 Mermaid 图表
建立 页面→字段 映射          批量处理全部页面              可筛选/打印
    │                            │                            │
    └─── Gate A ────────────────┴─── Gate B ─────────────────┘
```

**注意**：
- 不生成页面，不修改业务功能
- 不引入外部 CSS/JS 依赖
- 注释内容采用 **结构化 JSON 数据块**（废弃旧的 `data-ann-*` 属性方案）
- 暗门抽屉从 JSON 数据渲染，不依赖 DOM 遍历
- Phase C（看板）产出独立的 HTML，不侵入业务页面

---

## Phase A — 扫描（Scan）

### Step A.1 — 收集输入

| 输入 | 来源 | 用途 |
|------|------|------|
| Phase 5 页面文件 | `prototypes/*.html` | 待注入目标 |
| PRD.md | `docs/prd.md` | 业务规则来源 |
| Spec.md | `docs/spec.md` | 字段/API/状态定义 |
| 页面清单 | 从 `prototypes/` 自动检测 | 确定注入范围 |

### Step A.2 — 解析页面结构

对每个 HTML 页面，提取：
- **页面标题**：`<title>` 或 `<h1>`
- **表单字段**：`<input>`、`<select>`、`<textarea>` 的 `name` 和 `id`
- **表格列**：`<table>` 的 `<th>` 内容
- **操作按钮**：`<button>`、`<a>` 的文本
- **数据展示**：卡片、描述列表的关键标签

**输出**：每页一张结构映射表

```json
{
  "pages": [
    {
      "file": "order-list.html",
      "title": "订单列表",
      "elements": {
        "fields": ["orderId", "customerName", "amount", "status", "createTime"],
        "buttons": ["查询", "新增", "导出"],
        "table_columns": ["订单号", "客户", "金额", "状态", "操作"]
      }
    }
  ]
}
```

### Step A.3 — 读取 PRD + Spec

从 `docs/prd.md` 和 `docs/spec.md` 提取：
- 业务规则（计算公式、条件逻辑）
- 字段定义（类型、校验、约束）
- 权限矩阵（角色 × 操作）
- 状态流转（状态机）
- API 契约（端点、请求响应）
- 异常场景

### Gate A

> 除非所有 HTML 页面读取完成且 PRD/Spec 解析完毕，否则不进入 Phase B。

---

## Phase B — 注入（Inject）

### Step B.1 — 生成结构化注释 JSON 数据

对照 Phase A 的页面结构映射表和 PRD/Spec，为每个页面生成结构化 JSON 注释数据。
模板定义见 `references/annotation-templates.md`。

| 层 | 名称 | 内容 | 必填 | JSON key |
|----|------|------|------|----------|
| **L0** | 页面概览 | 页面目的、所属模块、目标用户、页面类型、PRD 引用 | ✅ | `l0` |
| **L0.ops** | 操作定义 | 该页支持的所有操作 + 权限边界 + 条件显示 | ✅ | `l0_ops` |
| **L0.search** | 搜索字段 | 列表型页面的搜索条件字段 | ○ | `l0_search` |
| **L0.deps** | 模块依赖 | 跨模块依赖、级联影响 | ○ | `l0_deps` |
| **L1** | 字段说明 | 字段类型、inputType、校验规则、数据来源、联动规则、模式差异 | ✅ | `l1` |
| **L1.list** | 列表展示 | 列表型页面的列宽/排序/格式化配置 | ○ | `l1_list` |
| **L1.stats** | 统计指标 | 统计型页面的指标计算逻辑与展示格式 | ○ | `l1_stats` |
| **L1.perm** | 权限矩阵 | 角色 × 字段/操作可见性 | ○ | `l1_perm` |
| **L1.bounds** | 边界值 | 数值范围、长度限制、格式正则、最大输入长度 | ✅ | `l1_bounds` |
| **L2** | 业务规则 | 计算公式、条件逻辑、权限要求 | ✅ | `l2` |
| **L2.exceptions** | 异常处理 | 异常场景、触发条件、恢复方案、边界值关联 | ○ | `l2_exceptions` |
| **L3** | 状态机 | 实体状态流转（含 Mermaid 图表字符串） | ○ | `l3` |
| **L4** | API 契约 | 端点、方法、请求/响应、错误码 | ✅ | `l4` |
| **L5** | 性能备注 | 数据量预期、缓存策略、懒加载 | ○ | `l5` |
| **L6** | 开放问题 | TBD、待决策、假设标记 | ✅ | `l6` |

**v2 页面分类**：顶层 `pageType` 字段区分页面类型（`list`/`form`/`stats`/`special`），不同类型对应不同的必填层级组合。详见 `references/annotation-templates.md`。

**规则**：
- 示例数据 MUST 标注 `(示例)`
- 字段名 MUST 与 HTML 中的 `name`/`id` 一致
- 业务规则 MUST 引用 `[PRD x.x.x]` 格式（如 `[PRD 3.2.4 R005]`）
- 每个注释条目 MUST 包含 `prdRef` 字段
- 无内容层 MUST 写占位「本页面无相关注释」

**辅助脚本**（推荐使用，保证格式一致）：

```bash
# 为指定页面自动生成注释 JSON 并注入
node {IDE_ROOT}/helpers/annotate-generator.mjs \
  --page public/index.html \
  --prd docs/prd.md \
  --spec docs/spec.md \
  --template {IDE_ROOT}/skills/kf-annotate/references/annotation-templates.md \
  --output public/index.html \
  --mode inject

# 仅生成 JSON（不注入页面）
node {IDE_ROOT}/helpers/annotate-generator.mjs \
  --page public/index.html \
  --prd docs/prd.md \
  --spec docs/spec.md \
  --output annotations.json \
  --mode generate
```

### Step B.2 — 注入结构化 JSON 数据块

> ⚠️ **已废弃旧方案**: 不再使用 `data-ann-*` 属性注入。改用结构化 JSON 数据块。

在每个 HTML 页面的 `</body>` 前，注入注释 JSON 数据块和暗门抽屉渲染脚本：

```html
<!-- ═══ kf-annotate: 页面注释区块（开始） ═══ -->
<script id="kf-ann-data" type="application/json">
{
  "pageId": "order-list",
  "pageTitle": "订单管理",
  "layers": {
    "l0": {
      "title": "页面概览",
      "content": [
        {"key": "页面名称", "value": "订单管理"},
        {"key": "所属模块", "value": "交易管理 > 订单列表"},
        {"key": "业务说明", "value": "展示全部订单，支持多条件查询和状态筛选"},
        {"key": "目标用户", "value": "管理员、运营人员"},
        {"key": "PRD 来源", "value": "[PRD 3.2] 订单管理"}
      ]
    },
    "l1": {
      "title": "字段说明",
      "content": [
        {"field": "order_no", "type": "String(20)", "description": "系统自动生成", "rules": "必填，唯一", "example": "ORD20250101001", "prdRef": "[PRD 3.2.2 R001]"}
      ]
    }
    // ... L2, L3, L4, L6 等
  }
}
</script>

<!-- 暗门抽屉渲染脚本（从 JSON 数据渲染） -->
<script src="kf-ann-drawer.js"></script>
<!-- ═══ kf-annotate: 页面注释区块（结束） ═══ -->
```

### Step B.3 — 暗门抽屉渲染（自包含脚本）

抽屉渲染脚本由 `annotate-generator.mjs` 自动注入到页面中，功能说明：

**抽屉功能**：
- `Ctrl+M` 或点击右下角「📌 暗门」按钮打开抽屉
- **L0-L6 标签页**：动态从 JSON 数据生成标签（只显示有数据的层级）
- **表格渲染**：根据 JSON 数据类型自动选择渲染格式（kv 对表、字段表、规则表、API 表、状态机表）
- **ESC** 关闭抽屉
- **拖拽左侧手柄**：调整抽屉宽度
- 再次 `Ctrl+M` 关闭，页面恢复正常

**渲染规则**：
- L0 类型（含 `key`/`value` 对） → 双列表格
- L1/L2/L4/L6 类型（含结构化对象） → 多列表格（表头自动生成）
- L3 状态机 → 状态列表 + 迁移表格
- 空层级 → 「本层无注释数据」占位
- PRD 引用 → 灰色小字显示

### Step B.4 — 批量处理

对所有目标 HTML 文件执行 `annotate-generator.mjs` 注入：

```bash
# 为每个页面逐个注入
node {IDE_ROOT}/helpers/annotate-generator.mjs \
  --page public/index.html \
  --prd docs/prd.md \
  --spec docs/spec.md \
  --output public/index.html \
  --mode inject

node {IDE_ROOT}/helpers/annotate-generator.mjs \
  --page public/admin.html \
  --prd docs/prd.md \
  --spec docs/spec.md \
  --output public/admin.html \
  --mode inject
```

**注入规则**：
- 不要修改原有 HTML 结构/样式/脚本
- 仅在 `</body>` 前追加 JSON 数据块和暗门渲染脚本
- 每个文件最后确认 `</html>` 结尾完整
- 如果页面已包含旧版 `data-ann-*` 属性，脚本自动清理

### Gate B

> 验证命令：`node {IDE_ROOT}/helpers/annotate-validator.mjs --target <page.html> --layers l0,l0_ops,l1,l2,l3,l4,l6 --output annotate-validation-report.md`

| 检查项 | 标准 | 阻断 |
|--------|------|------|
| JSON 数据存在 | 所有目标页面均含 `<script id="kf-ann-data">` 数据块 | P0 |
| JSON 格式正确 | 可被 `JSON.parse` 正确解析 | P0 |
| pageType 声明 | 顶层含 `pageType` 字段且值在 `list/form/stats/special` 中 | P1 |
| 必填层级完整 | 按 pageType 对应的必填层级（见模板）均已填充 | P0 |
| L1 inputType 覆盖 | 每个 L1 字段均标注 `inputType`（14 种枚举之一） | P0 |
| L0.ops condition | 条件显示的按钮需标注 `condition` 字段 | P1 |
| PRD 引用可追溯 | 所有 `prdRef` 字段引用的 PRD 章节在 PRD.md 中可匹配 | P1 |
| 模板合规 | 各层级字段符合 `annotation-templates.md` 的必填字段要求 | P1 |
| 抽屉正常运作 | `Ctrl+M` 打开/关闭，标签页切换，表格渲染正确 | P1 |
| 页面功能不受影响 | 原有业务功能正常运行 | P1 |

**阻断规则**：P0 任一未通过 → 退回 Phase B Step B.1 修复；P1 超过 3 项 → 告警但可继续

---

## Phase C — 看板（Dashboard）

### Step C.1 — 收集 JSON 注释数据

从所有已注入的页面中提取 `kf-ann-data` JSON 数据块，汇总为统一的数据集：

```
目标页面:
├── public/index.html    ← 含 kf-ann-data
├── public/admin.html    ← 含 kf-ann-data
└── ...
        ↓ 提取汇总
annotations-dataset.json  ← 所有页面注释数据集合
```

### Step C.2 — 生成宣讲看板

在 `public/annotations/` 下生成单页 `dashboard.html`：

```
public/
├── index.html
├── admin.html
├── annotations/
│   └── dashboard.html    ← 宣讲看板（新增）
```

看板内容：
- **项目概览**：PRD 名称、模块列表、页面数量、注释统计
- **页面索引**：每个页面的 L0 概览卡片，点击跳转
- **L2 业务规则汇总**：所有页面的业务规则表格
- **L3 状态机**：所有实体的 Mermaid `stateDiagram-v2`
- **L4 API 契约**：所有接口的端点清单
- **L6 开放问题**：所有待决策项汇总

看板 MUST 包含：
- 页面导航（带水印「宣讲专用」字样）
- 注释可搜索过滤
- 打印样式优化（`@media print`）
- 零外部依赖

**看板样式**：单色干净风格，无品牌色依赖。白底黑字，表格用浅灰边框。

### Step C.3 — 注释统计输出

在看板底部输出统计摘要：

```markdown
## 注释统计

| 指标 | 数值 |
|------|------|
| 注入页面数 | 5 |
| 总注释条数 | 127 |
| 覆盖层级 | L0-L6 全层 |
| L3 状态机 | 3 个实体 |
| L6 待决策 | 7 项 |
| 一键切换暗门 | 是 (Ctrl+M) |
```

### Step C.4 — 打开看板

> 输出看板路径后，提示用户浏览器打开 `public/annotations/dashboard.html`。

### Gate C

> - [ ] 看板可正常打开
> - [ ] 所有页面索引正确
> - [ ] Mermaid 图表渲染正确
> - [ ] 搜索过滤功能可用
> - [ ] 打印样式正常

---

## 交叉引用格式

注释中的引用 MUST 使用标准格式（详见 `references/annotation-templates.md`）：

| 引用类型 | 格式 | 示例 |
|---------|------|------|
| PRD 章节 | `[PRD x.x.x]` | `[PRD 3.2.1]` |
| PRD 规则 | `[PRD x.x.x Rxxx]` | `[PRD 3.2.4 R005]` |
| 状态引用 | `[L3-StateName]` | `[L3-Approved]` |
| 角色引用 | `[@RoleName]` | `[@Admin]` |
| 异常场景 | `[#Error-Scenario]` | `[#Error-DataConflict]` |
| 字段引用 | `[field_name]` | `[customer_id]` |

---

## 辅助脚本

| 脚本 | 用途 | 调用时机 |
|------|------|---------|
| `helpers/annotate-generator.mjs` | 按模板为页面生成注释 JSON 并注入 | Phase 6 Phase B |
| `helpers/annotate-validator.mjs` | 验证注释完整性 + PRD 可追溯性 | Phase 6 Gate B |

---

## 与旧 data-ann-* 方案的差异

| 维度 | 旧方案 (data-ann-*) | 新方案 (结构化 JSON) |
|------|---------------------|----------------------|
| 数据存储 | HTML 属性字符串 | `<script type="application/json">` 数据块 |
| 可读性 | 差 — 长字符串嵌在属性中 | 优 — 结构化表格渲染 |
| 可维护性 | 差 — 分散在各 DOM 元素 | 优 — 集中管理，一页一份数据 |
| PRD 追溯 | 不可验证 — 自由文本 | 可验证 — `prdRef` 字段 + 自动交叉检查 |
| 抽屉渲染 | 遍历 DOM 收集属性 | 直接读取 JSON 数据渲染 |
| Vue SPA 兼容 | 差 — 依赖 Vue 组件 DOM 结构 | 优 — 不依赖 Vue DOM，仅操作 HTML |
| 自动化 | 无脚本支持 | `annotate-generator.mjs` + `annotate-validator.mjs` |
| 可验证 | AI 口头判断 | 脚本产出结构化报告 |
