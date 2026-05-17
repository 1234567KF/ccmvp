# ESM 脚手架预设

> kf-mvp 项目默认使用 ESM（`"type": "module"`）。此文件提供 ESM 项目的最小可运行模板和常见 CJS→ESM 迁移模式。

---

## package.json 最小模板

```json
{
  "name": "mvp-project",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "vitest": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

---

## CJS → ESM 常见替换

### `__dirname`

```javascript
// ❌ CJS（ESM 中不可用）
const dir = __dirname;

// ✅ ESM 替代
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

### `__filename`

```javascript
// ❌ CJS
const file = __filename;

// ✅ ESM
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
```

### `require()`

```javascript
// ❌ CJS
const fs = require('fs');
const myModule = require('./my-module');

// ✅ ESM
import fs from 'fs';
import myModule from './my-module.js';

// ✅ JSON 导入（ESM）
import pkg from './package.json' with { type: 'json' };
// 或使用 readFileSync + JSON.parse
```

### `module.exports`

```javascript
// ❌ CJS
module.exports = { foo, bar };

// ✅ ESM
export { foo, bar };
export default { foo, bar };
```

### `require.main === module`

```javascript
// ❌ CJS
if (require.main === module) { main(); }

// ✅ ESM
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) { main(); }
```

---

## `.mjs` / `.cjs` 后缀规则

| 文件后缀 | `"type": "module"` 时 | 无 `"type"` 时 |
|---------|----------------------|---------------|
| `.js` | ESM | CJS |
| `.mjs` | ESM | ESM |
| `.cjs` | CJS | CJS |
| `.ts` | 取决于 tsconfig | 取决于 tsconfig |

---

## 检测违规的 grep 模式

以下模式在 `"type": "module"` 项目中视为违规：

```bash
# 检测 __dirname
grep -rn '__dirname' src/ server/ --include='*.ts' --include='*.js' | grep -v 'fileURLToPath'

# 检测 require()
grep -rn 'require\s*(' src/ server/ --include='*.ts' --include='*.js' | grep -v 'createRequire' | grep -v '//'

# 检测 module.exports
grep -rn 'module\.exports' src/ server/ --include='*.ts' --include='*.js'
```
