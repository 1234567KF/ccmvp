# MVP 技术栈规范

> kf-mvp 默认技术栈。适用于快速原型验证场景，零外部服务依赖，npm run dev 一键启动。

---

## 后端

| 组件 | 选型 | 版本 | 说明 |
|------|------|------|------|
| 运行时 | Node.js | ≥ 18 LTS | 稳定版本 |
| 框架 | Hono | 4.x | 超轻 Web 框架，TypeScript 原生 |
| 适配器 | @hono/node-server | 1.x | Node.js 运行时适配 |
| 数据库 | SQLite (better-sqlite3) | 11.x | 单文件、零配置、同步 API |
| ORM | Drizzle ORM | 0.36+ | 类型安全，SQL-like 语法，非可选 |
| 认证 | JWT (jsonwebtoken) | 9.x | 无状态认证 |
| 密码 | bcryptjs | 2.x | 密码哈希 |
| 校验 | Zod | 3.x | 请求体/参数校验 |

### Hono 项目结构

```
server/
├── src/
│   ├── index.ts            # 入口：Hono app 启动 + 路由挂载
│   ├── db/
│   │   ├── index.ts         # Drizzle 初始化
│   │   └── schema.ts        # 全部表定义
│   ├── middleware/
│   │   ├── auth.ts          # JWT 认证中间件
│   │   └── error.ts         # 统一错误处理
│   ├── routes/
│   │   ├── auth.ts          # 登录/注册
│   │   └── {resource}.ts    # CRUD 路由
│   ├── utils/
│   │   ├── jwt.ts           # JWT 工具
│   │   ├── response.ts      # 统一响应格式
│   │   └── dict.ts          # 字典缓存
│   └── seed.ts              # Mock 种子数据
├── tests/
│   ├── unit/                # 单元测试
│   ├── integration/         # 集成测试
│   └── e2e/                 # 端到端测试
├── drizzle.config.ts
├── tsconfig.json
└── package.json
```

---

## 前端

| 组件 | 选型 | 版本 | 说明 |
|------|------|------|------|
| 框架 | Vue 3 | 3.4+ | Composition API |
| 构建 | Vite | 5.x | 快速 HMR |
| UI 组件（Web） | Ant Design Vue | 4.x | 企业级后台 |
| UI 组件（H5） | Vant | 4.x | 移动端 |
| 路由 | Vue Router | 4.x | SPA 路由 |
| 状态管理 | Pinia | 2.x | Vue 3 官方推荐 |
| HTTP 客户端 | Axios | 1.x | 请求封装 |
| CSS | CSS Variables | — | 主题变量系统 |

### Vue 3 项目结构

```
web/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.ts              # Vue app 入口
│   ├── App.vue              # 根组件
│   ├── router/
│   │   └── index.ts         # 路由定义
│   ├── stores/
│   │   └── {store}.ts       # Pinia stores
│   ├── api/
│   │   └── index.ts         # Axios 封装 + baseURL
│   ├── views/
│   │   └── {page}.vue       # 页面组件
│   └── components/
│       └── {comp}.vue       # 公共组件
```

---

## 测试工具链

| 层级 | 工具 | 版本 | 说明 |
|------|------|------|------|
| 单元测试 | Vitest | 2.x | Vite 原生测试框架 |
| 集成测试 | Vitest + Hono test | 2.x | 使用 app.request() 测试 API |
| E2E 无头 | Playwright | 1.x | 无头浏览器自动化 |
| E2E 有头 | Playwright | 1.x | headed 模式，可视化验证 |

### 测试结构

```
server/tests/
├── unit/                    # 单元测试
│   ├── utils.test.ts        # 工具函数测试
│   └── schema.test.ts       # Schema 校验测试
├── integration/             # 集成测试（API 级别）
│   ├── auth.test.ts         # 认证 API 测试
│   ├── product.test.ts      # 产品 CRUD + 审批流
│   ├── channel.test.ts      # 渠道 CRUD
│   ├── projectReport.test.ts # 项目报备 + 冲突检测
│   ├── inquiry.test.ts      # 询价报价全流程
│   ├── dailyReport.test.ts  # 日报 CRUD
│   ├── dashboard.test.ts    # 看板 API
│   ├── dict.test.ts         # 字典 CRUD
│   └── system.test.ts       # 重置功能
└── e2e/                     # 端到端测试
    └── classic-flows.spec.ts # Playwright 经典流程回放

web/tests/                   # 前端测试（可选）
```

---

## 一键启动架构

### 项目根目录 package.json（npm workspaces）

```json
{
  "name": "wecrm-mvp",
  "private": true,
  "workspaces": ["server", "web"],
  "scripts": {
    "dev": "concurrently -n server,web -c blue,green \"npm run dev:server\" \"npm run dev:web\"",
    "dev:server": "npm run dev --workspace=server",
    "dev:web": "npm run dev --workspace=web",
    "test": "npm run test --workspace=server",
    "test:e2e": "npx playwright test",
    "install:all": "npm install --workspace=server --workspace=web",
    "db:seed": "npm run db:seed --workspace=server"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

### 启动命令

```bash
# 首次安装
npm install
npm run db:seed

# 一键启动前后端
npm run dev
# → 后端 http://localhost:3000
# → 前端 http://localhost:5173

# 运行测试
npm test              # Vitest 单元+集成
npm run test:e2e      # Playwright E2E
```

---

## Mock 架构

```
server/src/services/
├── payment.ts           # Mock 支付服务
├── sms.ts               # Mock 短信服务
├── storage.ts           # Mock 存储服务
└── push.ts              # Mock 推送服务
```

所有 Mock 服务遵循统一签名规范（见 `references/mock-strategy.md`）。

---

## 演进路径（Demo → 生产）

| 组件 | Demo（MVP） | 生产 |
|------|------------|------|
| 框架 | Hono | Hono（同 API） |
| 数据库 | SQLite (better-sqlite3) | MySQL / PostgreSQL |
| ORM | Drizzle ORM | Drizzle ORM（同 API，换 driver） |
| 支付 | `mockPaymentService` | `realPaymentService`（同签名） |
| 短信 | `mockSmsService` | `realSmsService`（同签名） |
| 存储 | 本地 `uploads/` | OSS / S3 |
| 部署 | `npm run dev` | Docker / PM2 |

**切换原则**：替换 import 路径即可，业务代码零改动。
