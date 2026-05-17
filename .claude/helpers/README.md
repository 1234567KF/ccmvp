# helpers/ 目录结构

> Blue Team refactor - 2026-05-06

## 目录说明

| 子目录 | 职责 | 文件数 |
|--------|------|--------|
| hooks/ | Hook处理器（PreToolUse/PostToolUse等） | 11 |
| session/ | 会话生命周期（状态栏/成本追踪/记忆） | 9 |
| ops/ | 运维工具（守护进程/健康监控/部署脚本） | 25 |

## 代理文件

根目录保留以下代理文件（被settings.json直接引用，不可删除）：

- `hook-handler.cjs` → `hooks/hook-handler.cjs`
- `model-router-hook.cjs` → `hooks/model-router-hook.cjs`
- `token-tracker.cjs` → `hooks/token-tracker.cjs`
- `statusline.cjs` → `session/statusline.cjs`

## 回滚

```powershell
git checkout -- {IDE_ROOT}/helpers/
```

