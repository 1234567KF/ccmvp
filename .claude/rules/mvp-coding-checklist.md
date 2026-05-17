---
trigger: always_on
---
# AI编程错误检查清单（Coding Error Checklist）

> **强制执行**：所有 kf- 系列技能启动时，必须加载本清单并在编码阶段逐项检查。
> 来源：政企用车 V2 bug 修复实战提炼。

---

## 类型 A：引用取值错误（Ref Unwrapping）

**抽象**：Vue 3 Composition API 中，script 内访问 ref 必须使用 `.value`，模板中自动解包。

| # | 实例 | 错误代码 | 修复代码 | 根因 |
|---|------|---------|---------|------|
| A1 | Login.vue 传参 | `api.post('/auth/login', { phone, code })` | `api.post('/auth/login', { phone: phone.value, code: code.value })` | `phone` 是 ref 对象，非字符串 |

**检查要点**：
- [ ] API 调用参数中的变量是否包含 `.value`
- [ ] 函数参数传递时 ref 是否正确解包
- [ ] watch/computed 中 ref 是否加了 `.value`

---

## 类型 B：跨文件一致性遗漏（Cross-file Consistency）

**抽象**：新增组件/路由/API 时，遗漏关联文件的注册或配置。

| # | 实例 | 错误 | 修复 | 根因 |
|---|------|------|------|------|
| B1 | Register.vue 路由 | 创建了组件但未在 router.js 注册 | 添加 `import Register` + `{ path: '/register', component: Register }` | 新增文件未检查路由注册 |
| B2 | Register 按钮跳转 | `router.push('/login')` | `router.push('/register')` | 复制粘贴后未更新目标路径 |
| B3 | wallet.js getDb 导入 | 使用了 `getDb()` 但未 import | 添加 `import { getDb } from '../db.js'` | 新增功能未检查依赖导入 |

**检查要点**：
- [ ] 新组件 → 是否注册了路由？
- [ ] 新 API 调用 → 后端是否有对应路由？
- [ ] 新导入的函数 → import 语句是否存在？
- [ ] 导航目标 → URL 路径是否与路由定义匹配？

---

## 类型 C：导航方法误用（Navigation Method）

**抽象**：`router.push()` vs `router.replace()` 选择错误，导致历史栈异常。

| # | 实例 | 错误 | 修复 | 根因 |
|---|------|------|------|------|
| C1 | EquityBuy 购买后导航 | `router.push('/equity')` | `router.replace('/equity')` | 购买后返回会回到购买页，形成循环 |
| C2 | 多次购买后返回异常 | push N 次 → 按返回 N 次回到购买页 | replace → 返回直接回到上一级页面 | 未区分"新增历史"与"替换当前" |

**判断标准**：
- **push**：用户期望能"返回"到当前页（如列表→详情）
- **replace**：当前页是中间态/一次性操作（如提交成功、登录后跳转）
- [ ] 表单提交成功后 → replace
- [ ] 登录/注册后 → replace  
- [ ] 购买/下单后 → replace
- [ ] 列表→详情→返回列表 → push

---

## 类型 D：模板作用域泄漏（Template Scope）

**抽象**：UI 框架（Ant Design Vue / Vant）的 slot/scoped slot 未正确过滤，导致操作列影响所有列。

| # | 实例 | 错误 | 修复 | 根因 |
|---|------|------|------|------|
| D1 | VehicleList action 列 | `#bodyCell` 未加 `v-if` 过滤 | `v-if="column.key === 'action'"` | Ant Design Table slot 默认匹配所有列 |

**检查要点**：
- [ ] 自定义 `#bodyCell` / `#cell` slot 是否加了 `v-if` 列类型过滤？
- [ ] 多个 slot 共用一个模板时是否互相干扰？
- [ ] 条件渲染 slot 是否有默认 fallback？

---

## 类型 E：SPA 路由历史模式（SPA Routing Mode）

**抽象**：多页面 SPA 架构中，`createWebHistory` 不处理子路径刷新，需要 fallback 机制。

| # | 实例 | 错误 | 修复 | 根因 |
|---|------|------|------|------|
| E1 | 子页面刷新空白 | `http://.../driver.html/orders` 刷新白屏 | 添加 SPA fallback 中间件 | 浏览器请求 `/driver.html/orders` 时服务器无对应文件 |
| E2 | Vite 无 SPA fallback | Vite dev server 未处理子路径 | `spaFallbackPlugin()` 重写路径 | Vite 按静态文件服务，不认识 SPA 路由 |
| E3 | Express 无 SPA fallback | 生产环境子路径 404 | 静态文件中间件 + HTML fallback | 开发/生产环境路由处理不一致 |

**检查要点**：
- [ ] 多页 SPA 是否配置了 fallback（`/*.html/*` → `/*.html`）？
- [ ] Vite dev server 是否加了自定义插件？
- [ ] 生产环境 Express/NGINX 是否配置了 fallback？
- [ ] Vue Router 的 `createWebHistory('/base.html')` base 是否正确？

---

## 类型 F：API 路径不匹配（API Path Mismatch）

**抽象**：前端请求路径与后端路由定义不一致，导致 404/500。

| # | 实例 | 错误 | 修复 | 根因 |
|---|------|------|------|------|
| F1 | 司机钱包 API | `api.get('/wallet/driver')` | `api.get('/wallet')` | 后端路由为 `/api/wallet`，无 `/driver` 子路径 |
| F2 | 机构钱包 API | `/api/wallet/org` 500 | 添加 `getDb` import | 后端路由使用了未导入的函数 |

**检查要点**：
- [ ] 前端 API 路径是否与后端 `app.get/post/put/delete` 定义完全一致？
- [ ] 路径参数名称是否匹配（`:id` vs `:orderId`）？
- [ ] 后端 handler 中所有依赖是否已 import？
- [ ] API 响应结构是否符合前端预期 `{code, data, message}`？

---

## 类型 G：响应结构假设错误（Response Shape Assumption）

**抽象**：前端对后端 API 返回数据结构的假设与实际情况不符。

| # | 实例 | 错误 | 修复 | 根因 |
|---|------|------|------|------|
| G1 | 订单列表分页 | 假设 `data` 是数组 | `data.list || data || []` | 分页接口返回 `{list, total, page}` 对象 |
| G2 | 钱包提现记录字段 | `data.withdrawal_history` | `data.withdrawals` | 字段名拼写/命名不一致 |

**检查要点**：
- [ ] 分页接口 → 返回对象包含 `list`/`total`/`page`，不是数组
- [ ] 字段名完全匹配后端定义（大小写、下划线、驼峰）
- [ ] 接口有变动时同步更新前端调用
- [ ] 使用 `|| []` / `|| {}` 容错处理

---

## 类型 H：URL 路径解析错误（URL Resolution Error）

**抽象**：`new URL(path, base)` 中，当 `path` 以 `/` 开头时，base 的路径部分被丢弃。

| # | 实例 | 错误 | 修复 | 根因 |
|---|------|------|------|------|
| H1 | bugfix_test 请求构造 | `new URL('/api/auth/login', 'http://localhost:3000')` OK，但 `new URL('/auth/login', 'http://localhost:3000/api')` 失败 | 使用 `{hostname, port, path}` 显式构造 | 绝对路径 `/auth/login` 覆盖了 base 的 `/api` 路径 |

**规则**：
- `new URL('/path', 'http://host/base/')` → `http://host/path`（/base/ 被丢弃）
- `new URL('path', 'http://host/base/')` → `http://host/base/path`
- 测试中优先使用 `{hostname, port, path}` 对象形式，避免 URL 构造歧义

**检查要点**：
- [ ] 测试请求使用 `{hostname, port, path}` 而非 `new URL()` 构造？
- [ ] 如果使用 `new URL()`，第二个参数 base 的 path 不会被误保留？
- [ ] HTTP 请求库的 baseURL 配置是否正确？

---

## 类型 K：TDD 合规（TDD Compliance）

**抽象**：TDD 是默认工作流，编码前必须先有测试，编码必须遵循 RED→GREEN→REFACTOR 微循环。

| # | 检查项 | 说明 | P0/P1 |
|---|--------|------|-------|
| K1 | 编码前是否有测试文件 | Stage 2 启动前 MUST 确认 Stage 0.5 测试文件存在 | P0 |
| K2 | RED 验证是否通过 | 测试是否全部预期失败（RED） | P0 |
| K3 | GREEN 实现是否最小 | 是否写了刚好足够让测试通过的代码 | P0 |
| K4 | 覆盖率是否达标 | 分支覆盖 ≥ 70% | P1 |
| K5 | 编码顺序是否合规 | 是否先实现后补测试（违规则自动删除重来） | P0 |
| K6 | 测试断言是否完整 | 禁止 it.todo / 空断言 | P1 |
| K7 | QA-编码解耦 | 测试设计 Agent 和编码 Agent 是否上下文隔离 | P1 |

**检查要点**：
- [ ] Stage 0.5 测试文件是否已生成且可编译
- [ ] 编码前是否先执行了 RED 验证
- [ ] 是否有超出测试范围的超前实现
- [ ] 覆盖率报告是否达到阈值
- [ ] 是否存在先写代码后补测试的行为

**违规处理**：
- K1/K2/K5 未通过 → 退回对应阶段修复（P0 阻断）
- K3 未通过 → 警告，建议重构（P0 但不阻断）
- K4/K6/K7 未通过 → P1 告警，记录到审查报告

**验证命令**：
```bash
node {IDE_ROOT}/helpers/tdd-gate-check.cjs --stage 2 --team {team}
node {IDE_ROOT}/helpers/coverage-reporter.cjs gate --team {team} --min-branches 70
```

---

## 类型 I：开发-生产环境不一致（Dev-Prod Parity）

**抽象**：Vite dev server 和 Express 生产服务器对同一功能处理方式不同。

| # | 实例 | 错误 | 修复 | 根因 |
|---|------|------|------|------|
| I1 | SPA fallback 只在 Vite 有 | Vite 有插件，Express 无 | Express 添加静态文件 + fallback | 开发/生产两个服务栈 |
| I2 | API proxy | Vite 有 proxy 配置 | Express 直接挂载 API 路由 | proxy 只在 dev 模式生效 |

**检查要点**：
- [ ] Vite proxy 配置的开发功能在生产 Express 中是否有等效实现？
- [ ] 静态文件服务配置是否在开发和生产环境一致？
- [ ] CORS、鉴权中间件是否在两个环境都配置了？

---

## 类型 J：导入遗漏（Import Omission）

**抽象**：使用了函数/组件/模块但未导入，运行时才暴露。

| # | 实例 | 错误 | 修复 | 根因 |
|---|------|------|------|------|
| J1 | wallet.js | 使用 `getDb()` 未 import | 添加 `import { getDb } from '../db.js'` | 重构/新增代码未同步 import |

**检查要点**：
- [ ] 每个函数调用检查其来源模块是否已 import
- [ ] 重命名函数后同步更新 import
- [ ] 文件拆分后检查新文件的 import 完整性

---

## 执行流程

所有 kf- 系列技能在编码阶段必须：

```
Step 1: 加载 checklist → ctx_read {IDE_ROOT}/rules/mvp-coding-checklist.md
Step 2: 逐项自检 → 对照 A-K 类型检查要点
Step 3: 修复问题 → 标记通过的检查项
Step 4: 输出 → "✅ checklist 自检完成，通过 X/Y 项"
```

**权重**：A/B/D/J/K 类为 P0（必须检查），C/E/F/G/H/I 类为 P1（按场景检查）。
