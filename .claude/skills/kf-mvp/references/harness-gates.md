# Harness 反馈闭环

> 每个 Gate 的验证 MUST 由可执行脚本完成，禁止 AI 口头判断。输出物化到文件后读取判断。

| Gate | 验证命令 | 阻断条件 | 失败处理 |
|------|---------|---------|---------|
| Gate 0 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase0` | `docs/tech-stack-confirmed.md` 不存在 | 补充确认书 |
| Gate 1 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase1` | 三队对齐文件缺失 | 回退生成 |
| Gate 2 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase2 --required-sections "## 需求背景" "## 业务规则" "## 验收标准"` | PRD 缺失或章节不全 | 补充章节 |
| Gate 3 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase3 --required-sections "## 技术方案" "## 数据模型" "## API 契约"` | 三队 Spec 缺失 | 回退修复 |
| Gate 4 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase4` | `docs/spec.md` 未生成 | 等用户决策 |
| Gate 4.5 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase4_5` | 任务/进度文件缺失 | 回退补充 |
| Gate 2.5 | `node {IDE_ROOT}/helpers/build-gate.mjs --tsconfig ./tsconfig.json --build-cmd "npm run build" --component-inventory {IDE_ROOT}/skills/kf-mvp/references/component-inventory.md --esm-check --output {team}-25-build-report.md` | 编译失败/组件校验失败/ESM 不兼容 | 回退 Stage 2 修复 → 重新编译 |
| Gate 5 (TDD) | `node {IDE_ROOT}/helpers/test-gate.mjs --cmd "npm test" --expected-pass-rate 100 --output {team}-05-test-report.md` | 通过率 < 100% | 继续 TDD 微循环 |
| Gate 5 (浏览器) | `kf-browser-ops` 端到端验证 | Happy Path 失败 / P0 错误 > 0 | 回退 Stage 2 → `regression-runner.mjs` |
| Gate 5 (回放) | `node scripts/replay-classic-flows.js` + `kf-browser-ops` | 任一流程回放失败 | 回退 Stage 2 |
| Gate 6 | `node {IDE_ROOT}/helpers/annotate-validator.mjs --target public/index.html --layers l0,l0.ops,l1,l2,l3,l4,l6 --output annotate-validation-report.md` | 缺少必填层级/PRD 不可追溯 | 补充注释重新验证 |
| Gate 7 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --stage phase7` | 启动命令不可执行/账号缺失/流程不足/无验证矩阵 | 补充 USAGE.md |
