# ccmvp — AI 驱动的 MVP 开发框架

> 让 AI Agent 像资深工程师一样构建可演示、可宣讲、可维护的 MVP 系统

---

## 一、这是什么

ccmvp 是一个 AI Agent 驱动的 MVP 开发框架，基于**可靠 TDD + 多视角验证 + 门禁自动化**的核心原则。

它的目标是：**让 AI 在人类的监督下，通过严格的验证流程，构建出既快又好的 MVP 系统**。

---

## 二、核心能力

### 2.0 前后端解耦架构

```
项目根目录/
├── backend/      # Hono + Drizzle + SQLite/Turso（独立部署）
├── frontend/     # Vue 3 + Vite + 内置抽屉注释
└── mocks/        # 统一 Mock 服务（可选）
```

**独立开发**：
```bash
# 单独运行 backend
cd backend && npm run dev

# 单独运行 frontend
cd frontend && npm run dev

# 联调模式
npm run dev:all
```

**环境变量控制**：
- `VITE_API_BASE_URL` — 前端 API 地址
- `DATABASE_URL` — 数据库连接（SQLite/Turso）
- `MOCK=true/false` — Mock/真实服务切换

**Turso 零代码升云端**：
```bash
# 本地 SQLite（默认）
npm run dev

# 切换 Turso（改一行 .env）
DATABASE_URL=libsql://xxx.turso.io?authToken=xxx
npm run dev
```

---

### 2.1 可靠的全面的 TDD

```
RED  →  GREEN  →  REFACTOR
 ↓        ↓         ↓
测试失败  最小实现  持续优化
```

**垂直切片**：每个 TDD 循环是一个完整的端到端路径，不是横向的"先写全部测试再写代码"

**多视角覆盖**：
- 红队视角：激进边界、异常路径
- 蓝队视角：稳健成功路径、核心逻辑
- 绿队视角：安全保守路径、错误处理

**物化验证**：
```bash
# TDD 门禁检查
node .claude/helpers/tdd-gate-check.cjs --stage 2 --team blue

# 编译门禁
node .claude/helpers/build-gate.mjs --tsconfig ./tsconfig.json --build-cmd "npm run build"
```

---

### 2.2 多视角设计竞争

在进入编码前，通过**三队独立设计**暴露更多风险：

```
PRD.md → 三队并行 Spec → 人类决策 → 选定方案
         ↓
  ┌──────┼──────┐
  ↓      ↓      ↓
红队 Spec 蓝队 Spec 绿队 Spec
（激进） （稳健） （保守）
```

**隔离规则**：
- 输入只读：只能读 PRD.md + CONTEXT.md
- 输出隔离：红→red-*，蓝→blue-*，绿→green-*
- 上下文隔离：子 Agent 独立会话

---

### 2.3 领域词汇统一

`docs/CONTEXT.md` 定义项目专属术语，消除 AI 冗余表达：

```markdown
## 术语表

| 术语 | 定义 | 避免使用的词 |
|------|------|-------------|
| 订单 | 用户提交的资源请求，含状态机 | booking, reservation |
| 取消 | 用户主动终止订单，需二次确认 | abort, terminate |
```

**效果**：
- 变量/函数/文件名命名一致
- AI 理解更快，token 消耗更低
- 代码库更易导航

---

### 2.4 架构决策持久化

`docs/adr/` 记录架构决策，防止未来重复讨论：

```markdown
# ADR-0001: 订单状态机使用有限状态机

## 决策

选择 FSM，理由：状态转换显式化、避免组合爆炸、与领域专家沟通清晰

## 结果

正面：状态转换可测试、边界显式化
负面：需维护状态转换表
```

---

### 2.5 Mock 一键开关

通过环境变量 `MOCK=true/false` 切换模拟/真实服务：

```bash
# 开发/演示：使用 Mock（默认）
MOCK=true npm run dev

# 接入真实服务
MOCK=false npm run dev
```

**Mock 服务目录**：`mocks/` 统一管理支付/短信/存储/推送

---

### 2.6 抽屉注释引擎

前端全局组件，自动挂载 PRD/Spec：

- **Ctrl+M** 全局开关抽屉
- **自动读取** `docs/prd.md` + `docs/spec.md`
- **Tab 分页**：概览 / 字段 / 规则 / 状态机 / API / 待决策
- **无需技能调用**，组件自初始化

---

### 2.7 标准化调试循环

`/kf-diagnose` 提供系统化 bugfix 方法论：

```
Phase 1: 构建反馈循环 ← 这是技能，其他是机械的
Phase 2: 复现 bug
Phase 3: 生成 3-5 个假设（同时生成，防止锚定）
Phase 4: 逐一验证（一次一变量）
Phase 5: 修复 + 回归测试
Phase 6: 清理 + 复盘
```

**铁律**：没有反馈循环不修复。无 loop 不假设。

---

## 三、流水线架构

```
Phase 0        Phase 1        Phase 2     Phase 3       Phase 4      Phase 4.5       Phase 5               Phase 6            Phase 7
技术栈确认  →  三队需求澄清  →  PRD生成  →  三队Spec生成  →  人类决策  →  SDD任务拆分  →  单队模块驱动TDD    →  暗门注释注入    →  使用说明
    │              │              │            │             │             │                  │                  │              │
    ▼              ▼              ▼            ▼             ▼             ▼                  ▼                  ▼              ▼
技术栈确认   三队对齐记录    PRD.md    三队spec.md   选定队伍      spec.md           代码+模块TDD报告    暗门注入页面      USAGE.md
                                                                     tasks/<module>.md   progress.md更新    + 宣讲看板
                                                                     progress.md
```

**门禁机制**：
- 每个 Phase 必须通过 Gate 才能进入下一阶段
- Gate 验证必须脚本化，禁止 AI 口头判断
- 物化产物：编译报告、测试报告、浏览器报告

---

## 四、技术栈

### 默认极简栈（不可协商）

```
后端：Node.js + Hono + Drizzle + SQLite
前端：Vue 3 + Vite + 选定 UI 框架
第三方：全部 Mock（签名一致可切换）
部署：npm run dev 一键启动
```

**不引入**：缓存策略 | 并发控制 | 性能优化 | 安全加固（JWT 除外）| 日志系统 | 监控告警

### UI 框架选择

| 场景 | 推荐 |
|------|------|
| 企业后台 / B端管理 | Ant Design Vue |
| 通用管理端 / 电商 | Element Plus |
| 现代品牌化 Web | Tailwind CSS |
| H5 移动端 | Vant |

---

## 五、关键文件

### 5.1 入口技能

| 技能 | 做什么 |
|------|--------|
| `kf-go` | 入口路由 — 自动检测任务类型，分发到 kf-mvp 或 kf-sdd |
| `kf-mvp` | 核心流水线 — 8阶段 MVP 开发 |
| `kf-diagnose` | 标准化调试循环 |
| `kf-prd-generator` | 需求→结构化 PRD |
| `kf-grill-with-docs` | 需求面试澄清 |

### 5.2 验证工具

| 命令 | 用途 |
|------|------|
| `harness-gate-check.cjs` | 阶段门禁验证 |
| `tdd-gate-check.cjs` | TDD 合规检查 |
| `build-gate.mjs` | 编译门禁 |
| `agent-visual-dashboard.cjs` | Agent 看板可视化 |
| `skill-loader.cjs` | 按需加载技能 |

### 5.3 文档结构

```
项目根目录/
├── docs/
│   ├── CONTEXT.md          # 领域词汇表
│   ├── adr/                # 架构决策记录
│   │   ├── 0001-xxx.md
│   │   └── 0002-xxx.md
│   ├── prd.md              # 需求文档
│   ├── spec.md             # 详细设计（选定队伍）
│   ├── tasks/              # 模块任务清单
│   │   └── progress.md     # 总体进度
│   └── USAGE.md            # 使用说明
├── src/
│   ├── server/             # Hono + Drizzle + SQLite
│   ├── client/             # Vue 3 + Vite
│   └── services/           # Mock 服务
└── .claude/
    ├── skills/             # 技能定义
    ├── helpers/            # 验证脚本
    └── rules/              # 编码检查清单
```

---

## 六、TDD 工作流详解

### 6.1 垂直切片开发

```
RED→GREEN: test1→impl1  (核心路径)
RED→GREEN: test2→impl2  (边界处理)
RED→GREEN: test3→impl3  (错误处理)
...
```

**禁止**：横向切片（先写全部测试，再写全部代码）

### 6.2 多视角测试用例

每个测试用例设计时融合三队视角：

| 维度 | 红队 | 蓝队 | 绿队 |
|------|------|------|------|
| 边界 | 极端值 | 正常值 | 安全值 |
| 异常 | 异常输入 | 异常处理 | 降级路径 |
| 成功 | 乐观路径 | 标准流程 | 保守确认 |

### 6.3 编码检查清单

`mvp-coding-checklist.md` 覆盖 A-K 类常见错误：

- **A 类**：Vue ref 取值错误
- **B 类**：跨文件一致性遗漏
- **C 类**：路由方法误用
- **D 类**：模板作用域泄漏
- **E 类**：SPA 路由历史模式
- **F 类**：API 路径不匹配
- **G 类**：响应结构假设错误
- **H 类**：URL 路径解析错误
- **I 类**：开发-生产环境不一致
- **J 类**：导入遗漏
- **K 类**：TDD 合规检查

---

## 七、典型使用场景

### 7.1 启动新 MVP

```bash
# 在项目目录中
输入：我想做一个订单管理系统 MVP

系统自动：
1. 进入 Phase 0 - 技术栈确认
2. 读取 CONTEXT.md（无则提示初始化）
3. 启动 kf-mvp 流水线
```

### 7.2 Bugfix

```bash
输入：订单列表页面白屏

系统自动：
1. 调用 /kf-diagnose
2. 构建反馈循环（自动化测试/curl/日志）
3. 复现 → 假设 → 验证 → 修复
4. 回归测试通过后结束
```

### 7.3 架构审视

```bash
输入：检查一下当前代码的架构问题

系统自动：
1. 读取 CONTEXT.md 和 adr/
2. 探索代码库，识别浅模块
3. 提出深化机会（deepening opportunities）
4. 用户选择后进入 grill 流程
```

---

## 八、设计理念

### 8.1 为什么需要这么多约束？

> "Always take small, deliberate steps. The rate of feedback is your speed limit."
> — The Pragmatic Programmer

AI Agent 能极大加速编码，但也加速软件熵增。ccmvp 通过：
- **Gate 验证**：防止错误累积
- **TDD 纪律**：保持可测试性
- **领域词汇**：保持代码可导航
- **架构审视**：防止技术债务失控

### 8.2 为什么是垂直切片？

> "No-one knows exactly what they want"
> — The Pragmatic Programmer

垂直切片让反馈更紧密：
- 每个 cycle 都是一个可演示的功能
- 发现错了可以低成本调整
- 避免"写完了发现不是你要的"

### 8.3 为什么需要三队？

多视角设计能暴露更多风险：
- 红队激进：挖掘边界场景
- 蓝队稳健：确保核心路径
- 绿队保守：兜住安全底线

人类决策不是"选最优"，而是"接受 tradeoff，选择当下最合适的"。

---

## 九、与其他框架的差异

| 维度 | ccmvp | 其他 AI 编程方案 |
|------|-------|------------------|
| 测试哲学 | 垂直切片 + 多视角 | 通常无强制 TDD |
| 验证方式 | 门禁自动化 | 口头判断 |
| 文档体系 | CONTEXT.md + ADR | 通常无领域词汇 |
| 调试流程 | 标准化 diagnose | 随意探索 |
| 架构维护 | 持续深化审视 | 通常忽略 |

---

## 十、快速开始

```bash
# 1. 创建项目目录
mkdir my-mvp && cd my-mvp

# 2. 初始化 ccmvp 结构（可选）
# ccmvp 本身是框架，运行在项目目录下

# 3. 描述你的需求
输入：我想做一个客户管理 MVP，主要功能是客户列表、新建、编辑

# 4. 系统启动 kf-mvp 流水线
# 自动完成 8 个 Phase，最终交付可演示系统
```

---

## 十一、贡献与定制

ccmvp 的技能系统设计为**可组合、可定制**：

- 技能在 `.claude/skills/` 目录下
- 每个技能一个目录，入口 `SKILL.md`
- 规则在 `.claude/rules/` 目录下
- helpers 是可执行的 Node.js 脚本

欢迎根据实际需求调整、扩展、简化。