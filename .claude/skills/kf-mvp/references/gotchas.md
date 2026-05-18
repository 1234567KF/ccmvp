# Gotchas

- **MVP ≠ 生产代码**。所有第三方 MUST Mock，禁止引入真实 API Key。即使 `--no-mock` 也使用沙箱密钥。
- **极简技术栈**：不引入 Redis/消息队列/限流/WAF。不加索引优化/CDN。不做 XSS/CSRF 防护（JWT 基础认证除外）。
- **SQLite 是 MVP 最优解** — 单文件、零配置。后续切 MySQL 只需换 Drizzle 方言。
- **Hono + Drizzle 是 MVP 后端最优组合** — 14KB、TypeScript 原生、多运行时。搭配分层架构（routes → controllers → services → repositories → drizzle），后端可整体替换为 Java + Spring Boot + MySQL。
- **暗门注释是核心差异化能力** — L0-L6 注释让非技术人员理解系统全貌。
- **业务方案可竞争，技术栈不可选**。三队在统一技术栈（Vue3+Hono+Drizzle+SQLite）内竞争业务方案。
- **Mock 签名一致性** — Mock 函数签名 MUST 与真实服务一致。切换仅替换 import 路径。
- **原型数据 MUST 来自 Mock 数据源** — 原型效果与代码行为一致。
- **业务路径选择器** — 多状态分支时 MUST 提供 hover pill/toggle 切换业务失败路径（驳回/支付失败/库存不足等），区别于系统级异常（500/503）。
- **业务设计必须真实落地** — Mock 模拟服务返回值，不跳过业务逻辑（回调/超时/对账/状态流转等）。
- **编码阶段优选 Kimi 2.6** — 不可用时降级 DeepSeek V4 Flash。不用普通 pro 写 MVP 代码。
- **RBAC 按需启用** — 单角色系统跳过。仅 PRD 含多角色权限差异或审批流时才实现。
- **USAGE.md 是强制交付物** — 零技术门槛，人人看都会操作验证。
- **成熟度评估 MUST 显式标注** — 用 ✅/⚠️/❌ 标注 L0-L4 成熟度，避免期望落差。
