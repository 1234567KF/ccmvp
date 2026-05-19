# ccmvp 改造方案

> 基于 Matt Pocock Skills 理念的渐进式增强计划

---

## 一、改造原则

1. **保持现有架构** — 不破坏现有 Gate 流水线
2. **增量式融合** — 按优先级逐步引入 Matt Pocock 元素
3. **降低复杂度** — 简化三队竞争，聚焦核心价值
4. **验证驱动** — 每个改造必须有自动化验证

---

## 二、架构优化（核心改造）

### 2.1 前后端解耦 → 独立部署/开发

**当前问题**：server/ 和 client/ 耦合在同一项目，难以独立部署/开发

**改造方案**：
```
原结构：
project/
├── src/
│   ├── server/     # Hono + Drizzle + SQLite
│   └── client/     # Vue 3 + Vite

改造后：
project/
├── backend/        # Hono + Drizzle + SQLite/Turso
├── frontend/       # Vue 3 + Vite + 内置抽屉组件
└── mocks/          # 统一 Mock 服务（可选）
```

**隔离规则**：
- backend 和 frontend 完全独立，可单独 git clone、单独部署
- 通过环境变量 `VITE_API_BASE_URL` 通信
- 联调模式：frontend dev server 代理到 backend dev server

---

### 2.2 SQLite → Turso → 零代码改动升云端

**当前问题**：SQLite 本地存储，无法多人协作、无法云端部署

**改造方案**：
1. 保持 SQLite 为默认开发数据库
2. 使用 Turso（edge SQLite）作为云端选项
3. Drizzle ORM 切换数据库只需改连接字符串，零代码改动

```typescript
// 环境变量配置
DATABASE_URL=file:./data/app.db          # 本地开发
// DATABASE_URL=libsql://xxx.turso.io     # 云端部署
```

**迁移步骤**（可选）：
```bash
# 本地开发用 SQLite
npm run dev

# 切换云端（改一行 .env）
MOCK=false TURSO=true npm run dev
```

---

### 2.3 抽屉注释引擎 → 前端全局组件

**当前问题**：kf-annotate 依赖 kf-mvp 的 Phase 6 注入注释

**改造方案**：
```
frontend/
├── src/
│   ├── components/
│   │   ├── AnnotationDrawer.vue    # 全局抽屉组件
│   │   └── PRDReader.vue           # PRD/Spec 渲染器
│   ├── composables/
│   │   └── useAnnotation.ts        # 注释上下文管理
│   └── annotations/
│       └── data.ts                 # 注释数据（自动挂载）
```

**特性**：
- Ctrl+M 全局开关
- 自动读取 `docs/prd.md` 和 `docs/spec.md` 渲染
- Tab 分页：概览 / 字段 / 规则 / 状态机 / API / 待决策
- 无需调用技能，组件自初始化

---

### 2.4 Mock 一键开关

**当前问题**：Mock 和真实服务切换需要改代码

**改造方案**：
```typescript
// 环境变量控制
MOCK=true   // 使用 mocks/ 服务（默认）
MOCK=false  // 使用真实第三方服务
```

**实现**：
```typescript
// src/config/env.ts
export const config = {
  mock: import.meta.env.VITE_MOCK === 'true',
  apiBase: import.meta.env.VITE_API_BASE_URL,
}

// 业务代码
const service = config.mock ? mockService : realService
```

**目录结构**：
```
mocks/
├── payment.ts     # 支付 Mock
├── sms.ts         # 短信 Mock
├── storage.ts     # 存储 Mock
└── push.ts        # 推送 Mock
```

---

## 三、优先级排序（更新）

| P0 | 前后端目录解耦 | ccmvp | 独立部署/开发基础架构 |
| P0 | Mock 一键开关 | ccmvp | 开发/演示环境切换 |
| P0 | 抽屉注释引擎重构 | 融合 | 前端组件自动挂载 |
| P0 | 添加 `docs/CONTEXT.md` | Matt Pocock | 减少 AI 冗余表达 |
| P1 | SQLite → Turso | ccmvp | 零代码升云端 |
| P1 | 引入 `/diagnose` 调试循环 | Matt Pocock | 标准化 bugfix |
| P1 | Stage 0.5 Tracer Bullet | Matt Pocock | 提升 TDD 反馈速度 |
| P2 | 添加 `docs/adr/` 决策记录 | Matt Pocock | 架构决策持久化 |
| P3 | 精简三队竞争 | ccmvp 优化 | 减少决策疲劳 |
| P3 | 引入 `/grill-with-docs` | Matt Pocock | 强化需求澄清 |
| P3 | 引入 `/improve-codebase-architecture` | Matt Pocock | 架构持续深化 |

---

## 四、P0 改造详情（目录解耦）

### 4.1 前后端目录解耦

**目标**：backend/、frontend/、mocks/ 完全独立

**文件迁移**：
```
原 src/server/ → backend/
原 src/client/ → frontend/
新增 mocks/
```

**backend/ 结构**：
```
backend/
├── src/
│   ├── index.ts          # Hono 入口
│   ├── routes/           # 路由
│   ├── db/               # Drizzle + SQLite/Turso
│   └── services/         # 业务逻辑
├── package.json
├── tsconfig.json
└── drizzle.config.ts
```

**frontend/ 结构**：
```
frontend/
├── src/
│   ├── App.vue
│   ├── main.ts
│   ├── components/       # 含 AnnotationDrawer
│   ├── composables/
│   ├── router/
│   ├── stores/
│   ├── views/
│   ├── api/
│   └── annotations/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .env
```

**mocks/ 结构**：
```
mocks/
├── package.json
├── payment.ts
├── sms.ts
├── storage.ts
└── push.ts
```

**验证命令**：
```bash
# 独立运行 backend
cd backend && npm run dev

# 独立运行 frontend
cd frontend && npm run dev

# 联调模式（根目录）
npm run dev:all
```

---

### 4.2 Mock 一键开关

**目标**：通过环境变量切换 Mock/真实服务

**实现步骤**：
1. 创建 `frontend/src/config/env.ts`
2. 创建 `backend/src/config/env.ts`
3. 业务代码根据 `config.mock` 选择服务

**验证**：
```bash
MOCK=true npm run dev    # 使用 Mock
MOCK=false npm run dev   # 使用真实服务
```

---

## 五、P0 改造详情（文档与调试）

### 3.1 添加 `docs/CONTEXT.md`

**目标**：定义项目领域词汇，统一 AI 与人类的沟通语言

**文件结构**：
```
项目根目录/
└── docs/
    ├── CONTEXT.md          # 新增：领域词汇表
    ├── adr/                 # 新增：架构决策记录
    │   ├── 0001-xxx.md
    │   └── 0002-xxx.md
    ├── prd.md
    └── spec.md
```

**CONTEXT.md 格式**（参考 Matt Pocock）：
```markdown
# 项目领域词汇

## 术语表

| 术语 | 定义 | 避免使用的词 |
|------|------|-------------|
| 订单 | 用户提交的资源请求，含状态机 | booking, reservation |
| 取消 | 用户主动终止订单，需二次确认 | abort, terminate |

## 关系

- 一个 **用户** 可以有多个 **订单**
- 一个 **订单** 只能属于一个 **用户**

## 歧义澄清

- "状态" 在本项目中特指订单状态机，不是 HTTP 状态码
```

**执行步骤**：
1. 在 `kf-mvp` Phase 1 启动时检查 `docs/CONTEXT.md` 是否存在
2. 若不存在，提示用户初始化
3. `/grill-with-docs` 和 `/grill-me` 执行时同步更新 CONTEXT.md

**验证**：AI 生成的代码/文档使用统一术语，无歧义表达

---

### 3.2 引入 `/diagnose` 调试循环

**目标**：标准化 bugfix 流程，确保每个 bug 有可验证的修复

**新增技能**：`kf-diagnose`（基于 Matt Pocock `/diagnose`）

**诊断循环**：
```
Phase 1: 构建反馈循环（30% 工作量）
Phase 2: 复现 bug
Phase 3: 生成 3-5 个假设
Phase 4: 逐一验证（一次一变量）
Phase 5: 修复 + 回归测试
Phase 6: 清理 + 复盘
```

**集成到 ccmvp**：
- Bugfix 任务必须使用 `/kf-diagnose`
- `mvp-coding-checklist.md` 增加"D"类诊断规则
- `agent-visual-dashboard.cjs` 输出诊断进度

**验证命令**：
```bash
node .claude/helpers/diagnose-gate.cjs --bug-id <id> --phase <1-6>
```

---

### 5.2 引入 `/kf-diagnose` 调试循环

**目标**：标准化 bugfix 流程，确保每个 bug 有可验证的修复

**诊断循环**：
```
Phase 1: 构建反馈循环（30% 工作量）
Phase 2: 复现 bug
Phase 3: 生成 3-5 个假设
Phase 4: 逐一验证（一次一变量）
Phase 5: 修复 + 回归测试
Phase 6: 清理 + 复盘
```

**铁律**：没有反馈循环不修复。无 loop 不假设。

**验证命令**：
```bash
node .claude/helpers/diagnose-gate.cjs --bug-id <id> --phase <1-6>
```

---

## 六、P1 改造详情（Tracer Bullet + Turso）

### 6.1 抽屉注释引擎重构

**目标**：前端组件自动挂载，无需技能调用

**新增文件**：
- `frontend/src/components/AnnotationDrawer.vue` — 全局抽屉
- `frontend/src/composables/useAnnotation.ts` — 注释上下文
- `frontend/src/annotations/data.ts` — 注释数据（懒加载 docs/）

**特性**：
- Ctrl+M 全局监听
- 自动读取 docs/prd.md + docs/spec.md
- Tab 分页渲染
- 无需 kf-annotate 技能调用

---

### 6.2 SQLite → Turso 迁移

**目标**：零代码改动升云端

**Drizzle 配置**：
```typescript
// backend/src/db/client.ts
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'

export const db = drizzle(createClient({
  url: process.env.DATABASE_URL || 'file:./data/app.db'
}))
```

**迁移步骤**：
```bash
# 1. 注册 Turso
npx turso db create ccmvp-dev

# 2. 获取 URL
turso db show ccmvp-dev

# 3. 修改 .env
DATABASE_URL=libsql://xxx.turso.io?authToken=xxx

# 4. 推送 schema
cd backend && npx drizzle-kit push
```

**验证**：
```bash
# 本地开发
npm run dev

# 云端切换（改 .env 一行）
# DATABASE_URL=libsql://xxx.turso.io
npm run dev
```

---

### 6.3 改造 Stage 0.5（Tracer Bullet 模式）

**当前问题**：Stage 0.5 一次性生成所有测试用例，接近"横向切片"反模式

**改造方案**：采用 tracer bullet 模式，每次只生成一个测试

**修改 `kf-mvp/SKILL.md` Phase 5 Stage 0.5**：

**After（改造后）**：
```
Stage 0.5: 多视角测试设计 → Tracer Bullet
- 识别第一个最关键的垂直切片
- 生成该切片的一个测试用例（RED）
- 立即实现通过测试（GREEN）
- 循环直到核心路径覆盖

每个 cycle 产出：
- 一个测试文件（RED 状态）
- 对应实现（GREEN 状态）
- 更新 progress.md
```

**保留多视角优势**：
- 测试用例设计时融合三队视角（边界/异常/成功路径）
- 但分批执行，每次一个垂直切片

---

### 4.2 添加 `docs/adr/` 决策记录

**目标**：记录架构决策，防止未来重复讨论

**ADR 格式**（参考 Matt Pocock）：
```markdown
# ADR-0001: 订单状态机使用有限状态机

## 状态

- 已接受

## 上下文

我们需要建模订单生命周期。存在两种方案：
1. 有限状态机（FSM）— 显式状态 + 转换规则
2. 布尔标志组合 — isPending, isCancelled, isCompleted...

## 决策

我们选择 FSM。理由：
- 状态转换规则显式化，便于测试
- 避免布尔组合的组合爆炸
- 与领域专家沟通更清晰

## 结果

正面：
- 状态转换逻辑可测试
- 边界情况显式化

负面：
- 需维护状态转换表
```

**触发条件**（任一）：
1. 决策难以撤销
2. 未来读者会疑惑"为什么这样"
3. 存在真实权衡，有明确替代方案

---

## 五、P2 改造详情

### 5.1 精简三队竞争

**当前问题**：每个 Phase 都生成三份文档，人类决策疲劳

**改造方案**：
- Phase 1（需求澄清）：保留三队对齐，但合并为单文件
- Phase 3（Spec 生成）：简化为双队（蓝 + 红/绿之一）
- Phase 5（TDD）：单一队伍执行

**新流程**：
```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 4.5 → Phase 5 → Phase 6 → Phase 7
          (双队)     (PRD)    (单队Spec)  (用户)    (拆分)      (单队TDD)  (注释)    (USAGE)
```

---

### 5.2 引入 `/grill-with-docs`

**目标**：强化需求澄清，减少"做完了但不是你要的"

**集成点**：
- Phase 1：与三队对齐并行执行
- Phase 4（人类决策前）：挑战最终方案

**Grill 规则**：
- 问一个问题，等回答，再问下一个
- 模糊术语立即提出："你说的 X 是指 A 还是 B？"
- 矛盾立即指出："你代码里 X，但你说的是 Y，哪个对？"
- 决策立即写入 CONTEXT.md

---

## 六、P3 改造详情

### 6.1 引入 `/improve-codebase-architecture`

**新增技能**：`kf-architecture-deepening`（基于 Matt Pocock）

**执行时机**：
- MVP 完成后每 3 天一次
- Bugfix 后评估是否需要架构改进

**检查维度**：
- 浅模块 → 深模块机会
- 测试盲区
- 语义耦合
- 命名一致性

---

## 八、改造时间线（更新）

```
Week 1-2: P0 改造（架构解耦）
├── 前后端目录迁移（src/server → backend/, src/client → frontend/）
├── Mock 一键开关实现（MOCK=true/false）
└── 抽屉注释引擎重构（前端全局组件）

Week 3-4: P0 改造（文档与调试）
├── docs/CONTEXT.md 格式定义
├── kf-mvp 集成 CONTEXT.md 检查
└── kf-diagnose 技能创建

Week 5-6: P1 改造
├── Stage 0.5 tracer bullet 改造
├── SQLite → Turso 迁移（Drizzle 配置）
└── docs/adr/ 格式定义

Week 7-8: P2 改造
├── 三队竞争精简
├── /grill-with-docs 集成
└── 完整流程联调
```

---

## 八、验收标准

每个改造完成后：
1. 自动化测试覆盖新流程
2. 文档更新（SKILL.md、CLAUDE.md）
3. 至少在一个实际 MVP 中验证
4. 收集反馈并迭代

---

## 九、风险与缓解

| 风险 | 缓解 |
|------|------|
| 改造破坏现有流程 | 保持 Gate 验证机制，逐步替换 |
| 复杂度提升 | P0 优先，降低初期成本 |
| 团队不接受 | 提供切换开关，默认沿用旧流程 |