# Phase 5 — 详细阶段说明

> 由 SKILL.md Phase 5 按需加载。包含 Stage 0.5-4 完整执行细节、Mock 策略、模型路由。

---

## 编码阶段模型路由偏好

| 优先级 | 模型 | 说明 |
|--------|------|------|
| **P0 首选** | **Kimi 2.6** | 编码能力最强，长上下文 |
| **P1 降级** | **DeepSeek V4 Flash** | 速度快，成本低 |
| **P2 兜底** | DeepSeek Pro / MiniMax | 仅前两个不可用时 |

**路由规则**：
1. 进入 Phase 5 时检查当前会话模型是否为 Kimi 2.6
2. 若不是 → 提示用户手动切换
3. 子 Agent spawn：前端模块 → DeepSeek V4 Flash；后端/API + 复杂逻辑 → Kimi 2.6

---

## TDD 加强流水线

```
Stage 0.5              Stage 2                   Stage 2.5              Stage 3               Stage 4
多视角测试设计    →    TDD 微循环自循环    →    编译门禁          →    浏览器自动化测试  →  清空DB+经典流程回放
(红蓝绿三视角融合)    (RED→GREEN→REFACTOR      (tsc+vite+组件+ESM)    (kf-browser-ops       (从头验证所有核心流程)
 尽可能多测试用例)     直到全部 GREEN)           全部通过方可进入)       全路径端到端验证)
```

---

## Stage 0.5 — 多视角测试设计先行

**执行者**：当前 AI（QA 角色）
**输入**：选定队伍的 Spec + 三队 PRD/Spec 全部产物

### 三视角融合策略

| 视角 | 来源 | 测试侧重 | 用例类型 |
|------|------|---------|---------|
| 🔴 红队激进 | `red-spec.md` | 探索性场景、非常规操作 | 越权操作、异常输入、非预期流程跳转 |
| 🔵 蓝队稳健 | `blue-spec.md` | 核心业务流程、数据一致性 | 标准 CRUD 全路径、状态流转、数据校验 |
| 🟢 绿队安全 | `green-spec.md` | 边界条件、权限边界 | 空数据/极值/并发模拟/角色越界 |

### 测试用例生成规则

| 维度 | 内容 | 最低数量 |
|------|------|---------|
| **功能流程** | 每个功能的完整 Happy Path | 每功能 ≥ 2 条 |
| **规则边界** | 字段校验、业务规则边界值 | 每规则 ≥ 1 条 |
| **异常路径** | 无效输入、过期状态、资源不存在 | 每模块 ≥ 2 条 |
| **角色权限** | 不同角色的可见性/可操作性 | 每角色 ≥ 1 条 |
| **状态流转** | 实体生命周期各状态节点合法/非法跳转 | 每状态 ≥ 1 条 |

**生成动作**：
1. 读取三队 Spec + 对齐记录
2. 按维度逐项提取场景，生成测试文件
3. 每个场景写完整断言（禁止 `it.todo`、禁止空断言）
4. RED 验证：确认测试编译成功 + 全部预期失败

- **产出**：`{team}-05-tests/` + `{team}-05-scenarios.json` + `{team}-05-test-report.md`
- **门控**：测试编译成功 ✅ | 全部 RED ✅ | 覆盖 5 维度 ✅
- **验证命令**：`node {IDE_ROOT}/helpers/mvp-tdd-gate-check.cjs --stage 0.5 --output {team}-05-test-report.md`

---

## Stage 2 — 模块驱动 TDD 微循环

融合 kf-sdd 的模块拆分 + 进度追踪。主 Agent 通过 `docs/tasks/progress.md` 管理进度，按依赖顺序调度。

**节流判断**：剩余模块 < 3 且依赖简单 → 跳过 spawn，当前会话依次执行；≥ 3 或依赖复杂 → spawn 子 Agent。

### 2.1 主 Agent 调度流程

1. 读取 `docs/tasks/progress.md` → 确定执行顺序
2. 分批启动子 Agent：第一批（依赖：无）→ 后续批次（依赖完成后立即启动）
3. 每次 spawn 后记录 Agent 状态 + 输出看板
4. 全部模块完成 → 进入 Stage 3

### 2.2 子 Agent 模块 TDD 微循环

每轮循环：
1. **RED**：从测试中筛选本模块用例 1-3 个 → 确认预期失败
2. **GREEN**：写最小代码通过测试（禁止超前实现）
3. **REFACTOR**：保持 GREEN，运行 `ctx_read {IDE_ROOT}/rules/mvp-coding-checklist.md` 自检
4. 输出 `{team}-02-tdd-cycle-{module}-N.md` → 下一组

**终止条件**：全部测试 GREEN ✅ 或 最多 8 轮 → 标记 UNRESOLVED

### 2.3 子 Agent 契约

| 项 | 说明 |
|----|------|
| **输入** | `ctx_read docs/spec.md map` + `ctx_read docs/tasks/<module>.md reference` + 本模块测试 |
| **输出** | 本模块代码 + `ctx_write {team}-02-tdd-cycle-{module}-final.md` |
| **完成标志** | 全部测试 GREEN + checklist P0 通过 |
| **禁止** | 修改其他模块代码 / 引入模块外依赖 / 超前实现 |

### 2.4 硬性规则

1. 测试先行，RED 验证
2. GREEN 最小实现，禁止超前
3. 禁止先实现后补测试 → 检测到则删除重来
4. 模块隔离，跨模块通过接口契约
5. 测试验证 MUST 脚本化：`test-gate.mjs`
6. 每完成一个模块更新 progress.md

- **产出**：代码 + `{team}-02-tdd-cycle-{module}-*` + `docs/tasks/<module>.md`（已勾选）+ progress.md（已更新）
- **门控**：全部 GREEN ✅ | progress.md 全部 ✅
- **验证命令**：`node {IDE_ROOT}/helpers/test-gate.mjs --cmd "npm test" --expected-pass-rate 100 --output {team}-05-test-report.md`

---

## Stage 2.5 — 编译门禁（P0 阻断）

TDD 只测逻辑不测编译。此阶段未通过不得进入 Stage 3。

```bash
node {IDE_ROOT}/helpers/build-gate.mjs \
  --tsconfig ./tsconfig.json \
  --build-cmd "npm run build" \
  --component-inventory {IDE_ROOT}/skills/kf-mvp/references/component-inventory.md \
  --esm-check \
  --output {team}-25-build-report.md
```

**四项检查**：TypeScript 编译 | 前端构建 | 组件存在性 | ESM 兼容性

**失败处理**：读取报告定位错误 → 回退 Stage 2 修复 → 重新运行 build-gate 直到 PASS → `regression-runner.mjs` 回归验证

- **产出**：`{team}-25-build-report.md`
- **门控**：PASS ✅

---

## Stage 3 — 浏览器自动化测试（kf-browser-ops）

**动作**：
1. 启动应用（`npm run dev`）
2. 调用 `kf-browser-ops` 打开关键页面
3. 按场景矩阵走通核心流程：列表页（搜索→筛选→分页→详情）、表单页（新建→填写→校验→提交→回显）、详情页（查看→编辑→删除确认）、状态流转
4. 关键步骤截图存档到 `{team}-03-screenshots/`
5. 失败路径记录到 `{team}-03-browser-report.md`

**失败处理**：P0 错误 → 回退 Stage 2 → `regression-runner.mjs --from-stage 2 --to-stage 3 --rerun-build --output regression-report.md`

- **产出**：`{team}-03-browser-report.md` + `{team}-03-screenshots/`
- **门控**：核心 Happy Path 全部通过 ✅ | P0 阻断错误 = 0 ✅

---

## Stage 4 — 清空数据库 + 经典流程从头回放

### 4.1 清空数据库功能

MVP 必须内置「重置系统」能力：
- 前端：底部「🧹 重置演示数据」按钮（开发/演示模式可见）
- 后端：`POST /api/system/reset` → 清空所有业务表 → 重新 seed()
- 清空前弹出确认框

### 4.2 经典业务流程脚本

生成 `scripts/replay-classic-flows.js`，可被 AI 或人类一键执行：
- 每个流程对应 PRD 中的一个核心用户场景
- 使用与前端相同的 API 调用
- 每步输出 ✅/❌，失败时中断报告
- 支持 `node scripts/replay-classic-flows.js` 执行

### 4.3 浏览器回放验证

回放脚本通过后，浏览器重放关键页面 + 截图

- **产出**：`scripts/replay-classic-flows.js` + `{team}-04-replay-report.md`
- **门控**：所有经典流程回放通过 ✅ | 截图无异常 ✅

---

## Mock 策略

所有第三方服务 MUST 使用 Mock：

| 服务 | Mock 方式 | 切换真实 |
|------|----------|---------|
| 支付 | `mockPaymentService` — 固定成功响应 | 替换 `src/services/payment.js` |
| 短信 | `mockSmsService` — console.log | 替换 `src/services/sms.js` |
| OSS/存储 | `mockStorageService` — 本地 `uploads/` | 替换 `src/services/storage.js` |
| 推送 | `mockPushService` — 记录到 mock 日志 | 替换 `src/services/push.js` |

**签名规范**：Mock 函数签名 MUST 与真实服务完全一致。切换仅需替换 import 路径。

**Mock 数据**：中文真实感数据、5-8 条、至少 3 种状态、支持「🧹 重置演示数据」
