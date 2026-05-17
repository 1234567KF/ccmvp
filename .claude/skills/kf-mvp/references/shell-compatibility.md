# Shell 兼容性参考（Shell Compatibility）

> 目标：确保 kf-mvp 中的所有命令在 Windows (PowerShell)、macOS (zsh/bash)、Linux (bash) 上均可运行。

---

## 核心原则

1. **脚本优先**：所有多步操作优先封装为 Node.js 脚本（天然跨平台）
2. **统一命令**：Shell 命令示例统一使用 `npm run xxx` 形式
3. **避免歧义**：不使用 `&&` 串联命令（PowerShell 不兼容），改用分号 `;` 或独立行

---

## Bash vs PowerShell 差异速查

| 操作 | Bash / zsh | PowerShell | 跨平台安全写法 |
|------|-----------|-----------|--------------|
| 命令串联（成功继续） | `cmd1 && cmd2` | `cmd1; if ($?) { cmd2 }` | `cmd1; cmd2` 或独立行 |
| 命令串联（无条件） | `cmd1; cmd2` | `cmd1; cmd2` | `cmd1; cmd2` ✅ |
| 续行符 | `\` | `` ` `` | 避免续行，或封装为脚本 |
| 环境变量设置 | `VAR=val cmd` | `$env:VAR="val"; cmd` | `cross-env VAR=val cmd` |
| 变量引用 | `$VAR` | `$env:VAR` | Node 脚本内 `process.env.VAR` |
| 后台进程 | `cmd &` | `Start-Process cmd` | `start cmd` (Windows) / `cmd &` (Unix) |
| 路径分隔符 | `/` | `\` 或 `/` | Node `path.resolve()` |
| 文件查找 | `ls *.js` | `Get-ChildItem *.js` | Node `fs.readdirSync()` |
| 进程终止 | `kill PID` | `Stop-Process -Id PID` | Node `process.kill()` |

---

## kf-mvp 命令兼容性对照表

| 阶段 | 原始命令（bash） | 跨平台命令（推荐） |
|------|-----------------|-------------------|
| Phase 0 安装 | `npm install` | `npm install` ✅ |
| Stage 0.5 TDD | `npx vitest run --reporter json > test-results.json` | `npx vitest run --reporter json` (输出到 stdout) |
| Stage 0.5 验证 | `node {IDE_ROOT}/helpers/mvp-tdd-gate-check.cjs --team {team} --output {team}-05-test-report.md` | 同左 ✅ |
| Stage 2 TDD | `npx vitest run` | `npx vitest run` ✅ |
| Stage 2 验证 | `node {IDE_ROOT}/helpers/test-gate.mjs --cmd "npm test" --expected-pass-rate 100 --output {team}-05-test-report.md` | 同左 ✅ |
| Stage 2.5 编译 | `node {IDE_ROOT}/helpers/build-gate.mjs --build-cmd "npm run build" --esm-check --output {team}-25-build-report.md` | 同左 ✅ |
| Stage 3 启动 | `npm run dev` | `npm run dev` ✅ |
| Stage 4 回放 | `node scripts/replay-classic-flows.mjs` | 同左 ✅ |
| 回归验证 | `node {IDE_ROOT}/helpers/regression-runner.mjs --from-stage 2 --to-stage 3 --output regression-report.md` | 同左 ✅ |
| 端口冲突 | `npx kill-port 5173` | `npx kill-port 5173` ✅ |

---

## 启动命令规范

### 推荐写法（跨平台）

```bash
# ✅ 好：每行独立，分号分隔
cd MVP-TEST1; npm install; npm run dev

# ✅ 好：封装为 npm script
npm run start:dev

# ✅ 好：Node.js 脚本
node scripts/start-dev.mjs
```

### 禁止写法

```bash
# ❌ PowerShell 不兼容 &&
npm install && npm run dev

# ❌ PowerShell 不兼容 \ 续行
npm run build \
  -- --mode production

# ❌ PowerShell 不兼容 export
export PORT=3000 && npm run dev
```

---

## package.json scripts 规范

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "setup": "npm install",
    "start": "npm run dev; npm run server",
    "start:server": "node server.js"
  }
}
```

**规则**：
- `scripts` 中使用 `;` 替代 `&&`
- 复杂操作封装为独立 `.mjs` 脚本
- 环境变量使用 `cross-env`（如需要）

---

## 端口管理

```bash
# 查看端口占用
# Windows
netstat -ano | findstr :5173

# macOS/Linux
lsof -i :5173

# 跨平台（推荐）
npx kill-port 5173
```

---

## 路径处理

所有脚本内部使用 Node.js `path` 模块处理路径，不依赖 shell 路径约定：

```javascript
import { resolve } from 'path';

// ✅ 跨平台
const configPath = resolve(CWD, 'vite.config.ts');

// ❌ 硬编码 Unix 路径
const configPath = CWD + '/vite.config.ts';
```

---

## 环境变量

```bash
# ❌ Unix 特有
PORT=3000 npm run dev

# ❌ PowerShell 特有
$env:PORT="3000"; npm run dev

# ✅ 跨平台（使用 cross-env）
npx cross-env PORT=3000 npm run dev

# ✅ 跨平台（使用 Node 脚本读取 .env）
node scripts/start-with-env.mjs
```
