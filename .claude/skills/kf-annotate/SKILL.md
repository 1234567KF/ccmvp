---
name: kf-annotate
description: >-
  Load when asked to inject L0-L6 annotation layers into Vue SPA or static
  HTML, or when called by kf-mvp Phase 6 for annotation injection. Use for
  presentation demos, annotation drawers, and feature explanations.
  Triggers: 注释注入, annotate, 暗门, 宣讲看板, 演示注释, 功能说明.
  Internal: auto-called by kf-mvp Phase 6.
metadata:
  type: injector
  capabilities:
    - annotation_injection
    - vue_spa_annotation
    - static_html_annotation
    - l0_l6_layer_system
  pattern: generator
  recommended_model: pro
  - kf-mvp (Phase 6)
graph:
  dependencies:
    - target: kf-mvp
      type: pipeline
      phase: 6
---

# kf-annotate — 暗门注释注入

> **核心价值**：Phase 5 代码完成后，向页面注入 PRD 级暗门注释（L0-L6），提供演示和宣讲时的功能说明查阅能力。

## 两种模式

| 模式 | 适用场景 | 实现方式 |
|------|---------|---------|
| **Vue SPA 模式** | Vue 3 + 选定 UI 框架项目 | `annotation-data.ts` 数据 + `AnnotationDrawer.vue` 抽屉组件 |
| **静态 HTML 模式** | 纯 HTML 原型页面 (`prototypes/`) | JSON 数据块注入 `</body>` 前 + 渲染脚本 |

---

## Vue SPA 模式（推荐）

> 适用于 kf-mvp 技术栈（Vue 3 + 选定 UI 框架 + Vite）的项目。
> UI 框架由 kf-mvp Phase 0 选定（参考 `references/ui-framework-recommendation.md`），
> 记录在 `memory/mvp-generation-log.md`。本技能通过该记录感知框架选择。

### 架构

```
src/client/annotations/annotation-data.ts   ← L0-L6 注释数据定义
src/client/components/AnnotationDrawer.vue  ← 抽屉渲染组件
src/App.vue                                 ← Ctrl+M 快捷键绑定
```

### UI 框架组件映射

Phase 0 选定的框架决定了 Drawer 和 Tabs 的具体组件。以下为各框架的对应关系：

| 框架 | Drawer 组件 | Tabs 组件 | import 来源 |
|------|------------|----------|------------|
| **Ant Design Vue** | `<a-drawer>` | `<a-tabs>` / `<a-tab-pane>` | `ant-design-vue` |
| **Element Plus** | `<el-drawer>` | `<el-tabs>` / `<el-tab-pane>` | `element-plus` |
| **Arco Design** | `<a-drawer>` | `<a-tabs>` / `<a-tab-pane>` | `@arco-design/web-vue` |
| **Vant** (H5) | `<van-popup>` + `position="right"` | `<van-tabs>` / `<van-tab>` | `vant` |
| **shadcn/vue** | `<Sheet>` (from `radix-vue`) | `<Tabs>` / `<TabsContent>` / `<TabsList>` / `<TabsTrigger>` | `radix-vue` |
| **Tailwind CSS** | 纯 CSS 抽屉（`fixed + translate-x`） | 纯 CSS tab（`v-if` 切换） | 无第三方依赖 |

> **自动判断**：Phase 6 启动时从 `memory/mvp-generation-log.md` 读取 `UI Framework:` 条目，
> 若无记录则默认 Ant Design Vue。

### 数据层 (annotation-data.ts)

```typescript
export interface PageAnnotation {
  route: string
  L0: AnnotationL0       // 页面概览 — 必填
  L1?: AnnotationL1      // 字段说明 — 有表单/表格的页必填
  L2?: AnnotationL2      // 业务规则 — 有业务逻辑的页必填
  L3?: AnnotationL3      // 状态机 — 有状态流转的实体必填
  L4?: AnnotationL4      // API 契约 — 有后端交互的页必填
  L6?: AnnotationL6      // 开放问题 — 有 TBD/待决策的页必填
}
```

#### 各层定义

**L0 — 页面概览**（必填）：
```typescript
interface AnnotationL0 {
  title: string; summary: string;
  prdRef: string; specRef: string;
  deps: string[]; ops: string[];
}
```

**L1 — 字段说明**（有表格/表单的页必填）：
```typescript
interface AnnotationL1 {
  fields: { name: string; desc: string; biz?: string; rule?: string }[];
  tips?: string[];
}
```

**L2 — 业务规则**（有业务逻辑的页必填）：
```typescript
interface AnnotationL2 {
  rules: string[];        // 业务规则列表
  exceptions: string[];   // 异常/边界场景
}
```

**L3 — 状态机**（有状态流转的实体）：
```typescript
interface AnnotationL3 {
  entity: string;                          // 实体名（如"溯源码"）
  states: string[];                        // 所有状态
  initial: string;                         // 初始态
  transitions: { from: string; to: string; event: string; guard?: string }[];
}
```

**L4 — API 契约**（有后端交互的页）：
```typescript
interface AnnotationL4 {
  endpoints: { method: string; path: string; description: string; request?: string; response?: string }[];
}
```

**L6 — 开放问题**（有 TBD/待决策的页）：
```typescript
interface AnnotationL6 {
  items: { id: string; question: string; status: string; note?: string }[];
}
```

### 抽屉组件 (AnnotationDrawer.vue)

- 使用选定 UI 框架的 Drawer + Tabs 组件实现（见上方 UI 框架组件映射表）
- 每个层级一个 tab 页：概览(L0) | 字段(L1) | 规则(L2) | 状态机(L3) | API(L4) | 待决策(L6)
- 无数据的 tab 页自动隐藏（v-if 控制）
- 通过 `visible` prop + `update:visible` emit 实现 v-model 双向绑定

**模板示例**（以 Ant Design Vue 为例，其他框架见映射表替换组件标签名）：

```vue
<a-drawer v-model:open="open" title="暗门注释" placement="right" width="500">
  <a-tabs v-model:activeKey="activeTab">
    <a-tab-pane key="L0" tab="概览">...</a-tab-pane>
    <a-tab-pane v-if="ann.L1" key="L1" tab="字段">...</a-tab-pane>
    <a-tab-pane v-if="ann.L2" key="L2" tab="规则">...</a-tab-pane>
    <a-tab-pane v-if="ann.L3" key="L3" tab="状态机">...</a-tab-pane>
    <a-tab-pane v-if="ann.L4" key="L4" tab="API">...</a-tab-pane>
    <a-tab-pane v-if="ann.L6" key="L6" tab="待决策">...</a-tab-pane>
  </a-tabs>
</a-drawer>
```

### 快捷键绑定 (App.vue)

```typescript
// Ctrl+M 直接开/关抽屉，无「注释模式」概念
if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
  e.preventDefault()
  annVisible.value = !annVisible.value
}
```

**关键约束**：
- 禁止"注释模式"中间状态 — Ctrl+M 直接控制抽屉 visible，不设 mode flag
- 禁止浮动按钮和模式指示条 — 仅通过快捷键交互
- 禁止外部 CSS/JS 依赖 — 使用项目已有的 UI 框架组件
- 使用选定框架的组件（参照上方 UI 框架组件映射表），禁止混用其他框架组件

### 执行步骤

| 步骤 | 动作 | 产出 |
|------|------|------|
| 1 | 读取 `docs/prd.md` 和 `docs/spec.md` | 理解业务规则、字段、API |
| 2 | 识别所有路由页面 | 页面清单 |
| 3 | 对每个页面构建 L0-L6 注释数据 | `annotation-data.ts` |
| 4 | 创建/更新 `AnnotationDrawer.vue` | 抽屉组件 |
| 5 | 在 `App.vue` 绑定 Ctrl+M 快捷键 | 快捷键交互 |
| 6 | 更新 `docs/USAGE.md` 记录快捷键 | 使用说明 |

---

## 静态 HTML 模式

（原始模式，适用于 `prototypes/` 目录下的 HTML 文件）

### 三阶段流水线

```
Phase A: 扫描（Scan）      Phase B: 注入（Inject）      Phase C: 看板（Dashboard）
读取页面 + PRD/Spec      →  生成结构化 JSON 数据块     →  生成宣讲看板 HTML
建立 页面→字段 映射          注入到 </body> 前            含 Mermaid 图表
```

### 交互方式

- `Ctrl+M` 直接开/关抽屉
- 抽屉从 JSON 数据渲染（L0-L6 标签页）
- ESC 关闭抽屉

（详见 `references/annotation-templates.md` 的静态 HTML 模板部分）

---

## Gate 强制执行规则

> 所有 kf-mvp Phase 6 必须通过以下门禁方可进入 Phase 7。

| ID | 检查项 | Vue SPA 模式 | 静态 HTML 模式 | 阻断 |
|----|--------|-------------|---------------|------|
| AN-01 | 注释数据文件存在 | `annotation-data.ts` 存在 | `kf-ann-data` script 标签存在 | P0 |
| AN-02 | 每页 L0 已填充 | 每个路由的 L0 含 title/summary/prdRef/specRef | 每个页面的 l0 含 pageName/module/prdRef | P0 |
| AN-03 | L1 覆盖表单字段 | 有表单/表格的页必填 L1.fields | 对应页面的 l1 含字段定义 | P1 |
| AN-04 | L2 覆盖业务规则 | 有业务逻辑的页必填 L2.rules | 对应页面的 l2 含规则定义 | P1 |
| AN-05 | L3 状态机定义 | 有状态流转的实体标注 L3 | 对应页面 l3 含状态机 | P2 |
| AN-06 | L4 API 契约 | 有后端交互的页标注 L4.endpoints | 对应页面 l4 含 API 定义 | P2 |
| AN-07 | Ctrl+M 快捷键 | App.vue 中绑定 handleKeydown | 页面含暗门抽屉脚本 | P0 |
| AN-08 | 无注释模式残留 | 无 annMode/mode 等中间态概念 | 无 mode indicator bar | P1 |
| AN-09 | 抽屉使用 tab 分页 | AnnotationDrawer 使用 Tabs 组件分页（根据选定框架） | 抽屉脚本含标签页逻辑 | P1 |
| AN-10 | 文档同步 | `docs/USAGE.md` 记录 Ctrl+M 快捷键 | 同左 | P1 |

**阻断规则**：P0 任一未通过 → 退回修复；P1 超过 3 项 → 告警但可继续

### 验证命令

```bash
# Vue SPA 模式 — 检查注释数据文件完整性
grep -c "route:" src/client/annotations/annotation-data.ts
grep "L3:" src/client/annotations/annotation-data.ts | wc -l
grep "L4:" src/client/annotations/annotation-data.ts | wc -l

# 检查 Ctrl+M 绑定
grep -c "ctrlKey.*key.*'m'" src/App.vue

# 检查无 annMode 残留
grep -c "annMode" src/App.vue  # 应为 0
```

---

## 复盘记录（溯源系统项目经验）

### 问题 1：注释模式中间态概念多余

**现象**：最初实现了 "演示模式/注释ON" badge + 黄色指示条 + 浮动按钮的多状态切换。

**根因**：将注释理解为一种"页面模式"而非"抽屉工具"。

**教训**：注释系统应该是快捷键呼出的工具，而非改变页面行为的模式。Ctrl+M 直接控制抽屉 visible，不设任何中间状态。

**修复**：删除 annMode ref、mock-badge、浮动按钮、模式指示条。仅保留 `annVisible: ref(false)` + Ctrl+M 切换。

### 问题 2：无 tab 分页，内容单薄

**现象**：最初仅实现了 L0/L1/L2 三层，内容垂直堆叠，没有组织。

**根因**：急于交付功能，跳过了 L3-L6 的数据定义；没有使用 tabs 组织内容。

**教训**：L0-L6 分层结构天然适合 tab 导航。每层独立 tab 页，无数据的 tab 自动隐藏。

**修复**：按 annotation-templates.md 的 L0-L6 定义补全数据；抽屉改用 a-tabs 分页。

### 问题 3：技能描述与实际架构不匹配

**现象**：kf-annotate SKILL.md 只描述了静态 HTML 注入模式，但项目是 Vue SPA。

**根因**：技能文档未随技术栈演进更新。

**教训**：技能应有模式选择机制。触发时检测目标项目架构（Vue SPA vs 静态 HTML），选择对应模版。

**修复**：SKILL.md 增加 Vue SPA 模式说明和模板。

### 问题 4：缺少强制执行机制

**现象**：注释数据不全（缺 L3/L4/L6）没有被及时发现。

**根因**：Phase 6 没有强制验证 gate。

**教训**：注释完整性必须通过 gate 脚本验证，不能靠 AI 自觉。

**修复**：增加 Gate 检查规则表（AN-01~AN-10），P0 阻断式强制执行。
