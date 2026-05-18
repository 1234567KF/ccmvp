# UI 框架推荐引擎

> 用于 kf-mvp Phase 0 Step 0.2：根据项目类型和客户端类型推荐最优前端 UI 框架。
> 选定后动态加载对应框架的组件清单到上下文。

---

## 推荐矩阵

### 项目类型 × 客户端类型 → 推荐框架

| 项目类型 | Web 桌面端 | H5 移动端 | Hybrid (Web+H5) |
|---------|-----------|-----------|----------------|
| **admin** 后台管理 | **Ant Design Vue** ⭐ / Element Plus | Vant | Ant Design Vue + Vant |
| **public-web** 官网 | **Tailwind CSS** ⭐ / shadcn/vue | Vant / Tailwind CSS | Tailwind CSS |
| **e-commerce** 电商 | **Element Plus** ⭐ / Ant Design Vue | Vant | Element Plus + Vant |
| **saas** SaaS平台 | **Ant Design Vue** ⭐ / Arco Design | Vant | Ant Design Vue + Vant |
| **mobile-h5** H5活动页 | Vant | **Vant** ⭐ | Vant |
| **landing** 落地页 | **Tailwind CSS** ⭐ / shadcn/vue | Tailwind CSS | Tailwind CSS |
| **tool** 内部工具 | **Ant Design Vue** ⭐ / Element Plus | — | Ant Design Vue |
| **social** 社交/内容 | **shadcn/vue** ⭐ / Tailwind CSS | Vant | shadcn/vue + Vant |
| **dashboard** 数据看板 | **Ant Design Vue** ⭐ / Arco Design | Vant | Ant Design Vue + Vant |

> ⭐ 表示主要推荐（基于生态成熟度、文档质量、社区活跃度）

---

## 快速决策树

```
项目是面向什么终端？
├── 移动端 H5 为主 → Vant
│   └── 需要桌面 Web 版本？ → Vant + 按需补充桌面框架
├── 桌面 Web 为主 → 看项目类型
│   ├── B端/企业级 → Ant Design Vue
│   │   └── 倾向现代简约 → Arco Design
│   ├── 通用管理端 → Element Plus
│   ├── 自定义设计/品牌化 → Tailwind CSS
│   │   └── 想要预置组件 → shadcn/vue + Tailwind
│   └── 数据密集/复杂交互 → Ant Design Vue
└── 需要同时支持 Web + H5 → Hybrid 方案
    ├── Web 用 Ant Design Vue + H5 用 Vant
    ├── Web 用 Element Plus + H5 用 Vant
    └── 全用 Tailwind CSS（统一设计语言）
```

---

## 各框架详细档案

---

### 1. Ant Design Vue 4.x

| 属性 | 值 |
|------|-----|
| **官网** | https://antdv.com |
| **最新版本** | 4.x |
| **Vue 版本** | Vue 3 + Composition API |
| **类型** | 企业级桌面组件库 |
| **风格** | 专业、沉稳、规范 |
| **GitHub Stars** | 20k+ |
| **最佳场景** | 企业后台、B端管理、SaaS、CRM、ERP |
| **主题方案** | CSS 变量 + ConfigProvider 全局/局部主题 |
| **优点** | 组件最全、中文文档好、企业级表格/表单强、Vue 3 原生 |
| **缺点** | 样式较重、打包体积大、移动端支持弱 |
| **推荐搭配** | Vue Router + Pinia + Axios |
| **npm** | `ant-design-vue` |

**核心组件**：见 `references/ui-templates/ant-design-vue/components.md`

**主题定制**：通过 `ConfigProvider` 设置 `theme` 属性、CSS 变量覆盖

---

### 2. Element Plus

| 属性 | 值 |
|------|-----|
| **官网** | https://element-plus.org |
| **最新版本** | 2.x |
| **Vue 版本** | Vue 3 + Composition API |
| **类型** | 桌面组件库 |
| **风格** | 简洁、清晰、通用 |
| **GitHub Stars** | 24k+ |
| **最佳场景** | 通用管理端、电商后台、内容管理 |
| **主题方案** | CSS 变量 + 在线主题编辑器 |
| **优点** | 社区最大、生态成熟、文档全面、组件丰富、国际化好 |
| **缺点** | 高级组件需额外库、定制复杂度中等 |
| **推荐搭配** | Vue Router + Pinia + Axios |
| **npm** | `element-plus` |

**核心组件**：见 `references/ui-templates/element-plus/components.md`

---

### 3. Arco Design Vue

| 属性 | 值 |
|------|-----|
| **官网** | https://arco.design/vue |
| **最新版本** | 2.x |
| **Vue 版本** | Vue 3 + Composition API |
| **类型** | 桌面组件库 |
| **风格** | 现代、简约、年轻化 |
| **GitHub Stars** | 5k+ |
| **最佳场景** | 现代化企业应用、Saas、创意工具、数据看板 |
| **主题方案** | CSS 变量 + 可视化主题编辑（官方平台） |
| **优点** | 设计语言统一、主题定制能力强、交互精致、中文文档 |
| **缺点** | 社区比 Ant Design/Element 小、第三方集成较少 |
| **推荐搭配** | Vue Router + Pinia + Axios |
| **npm** | `@arco-design/web-vue` |

**核心组件**：见 `references/ui-templates/arco-design/components.md`

---

### 4. Vant 4.x

| 属性 | 值 |
|------|-----|
| **官网** | https://vant-ui.github.io |
| **最新版本** | 4.x |
| **Vue 版本** | Vue 3 + Composition API |
| **类型** | 移动端组件库 |
| **风格** | 轻量、移动原生感 |
| **GitHub Stars** | 23k+ |
| **最佳场景** | H5 移动页面、移动端营销活动、小程序风格应用 |
| **主题方案** | CSS 变量 + `ConfigProvider` |
| **优点** | 移动端最优解、轻量高性能、组件贴合移动场景、中文文档好 |
| **缺点** | 仅支持 H5，不支持桌面端 |
| **推荐搭配** | Vue Router + Pinia + Axios |
| **npm** | `vant` |

**核心组件**：见 `references/ui-templates/vant/components.md`

**使用注意**：
- 使用 `rem` 布局（Vant 默认基于 37.5px）
- 组件直接导入，无需额外注册
- Web 端和 H5 端不要在同页面混用

---

### 5. shadcn/vue

| 属性 | 值 |
|------|-----|
| **官网** | https://shadcn-vue.com |
| **最新版本** | latest (滚动发布) |
| **Vue 版本** | Vue 3 + Composition API |
| **类型** | 组件库（基于 Radix Vue + Tailwind CSS） |
| **风格** | 现代、极简、高度可定制 |
| **GitHub Stars** | 5k+ |
| **最佳场景** | 现代 Web 应用、自定义品牌设计、创业项目、SaaS |
| **主题方案** | Tailwind CSS 类 + CSS 变量 |
| **优点** | 非传统组件库（复制代码到项目）、完全控制样式、无障碍好、现代设计 |
| **缺点** | 需要手动复制组件、生态较新、中文文档不完善 |
| **推荐搭配** | Tailwind CSS + Vue Router + Pinia |
| **npm** | `radix-vue` + `tailwindcss` |

**核心组件**：见 `references/ui-templates/shadcn-vue/components.md`

**使用方式**：
- 通过 CLI 添加组件：`npx shadcn-vue add button`
- 组件直接复制到项目目录（非 npm 包依赖）
- 完全自定义样式（Tailwind 类 + CSS 变量）

---

### 6. Tailwind CSS

| 属性 | 值 |
|------|-----|
| **官网** | https://tailwindcss.com |
| **最新版本** | 4.x（2025+） |
| **Vue 版本** | 框架无关，Vue 3 完全兼容 |
| **类型** | 实用优先的 CSS 框架 |
| **风格** | 完全自定义，无默认设计 |
| **GitHub Stars** | 84k+ |
| **最佳场景** | 自定义设计、官网、落地页、品牌化应用 |
| **主题方案** | `tailwind.config.js` 自定义设计令牌 |
| **优点** | 零设计阻力、高度灵活、热重载快、打包小、生态庞大 |
| **缺点** | 无预置组件（需自行组装）、模板类名多、学习曲线 |
| **推荐搭配** | 任意 UI 组件库或 Headless UI / Radix Vue |
| **npm** | `tailwindcss` |

**核心模式**：见 `references/ui-templates/tailwind/patterns.md`

**Vue 3 + Tailwind CSS 最佳实践**：
- PostCSS 插件集成（Vite 原生支持）
- 避免在 `v-bind:class` 中拼接字符串 → 使用数组语法
- 提取重复组合为 `@apply` 或组件
- Dark mode 用 `class` 策略：`dark:` 前缀控制

---

## 选定框架后的上下文加载

Phase 0 选定框架后，按需加载以下文件：

| 框架 | 加载文件 | 加载时机 |
|------|---------|---------|
| Ant Design Vue | `ui-templates/ant-design-vue/components.md` | Phase 5 Stage 2 前 |
| Element Plus | `ui-templates/element-plus/components.md` | Phase 5 Stage 2 前 |
| Arco Design | `ui-templates/arco-design/components.md` | Phase 5 Stage 2 前 |
| Vant | `ui-templates/vant/components.md` | Phase 5 Stage 2 前 |
| shadcn/vue | `ui-templates/shadcn-vue/components.md` | Phase 5 Stage 2 前 |
| Tailwind CSS | `ui-templates/tailwind/patterns.md` | Phase 5 Stage 2 前 |

> **按需加载规则**：框架组件清单仅在 Phase 5（编码阶段）加载，Phase 0-4 期间只需记录框架名称。
> 通过 skill-loader 机制实现非活跃阶段零 token 开销。

---

## 历史记录

选定框架后写入 `memory/mvp-generation-log.md`：

```
— UI Framework: Ant Design Vue 4.x
— UI Reason: admin dashboard, Web desktop, enterprise backend
```
