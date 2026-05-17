---
name: kf-brainstorm
type: collaboration
description: 头脑风暴式多角度评审协作 — 红队/蓝队/裁判三视角串行评估
trigger: 头脑风暴
capabilities:
  - multi_role_coordination
  - red_team_attack
  - blue_team_defense
  - judge_synthesis
  - consensus_building
recommended_model: pro
graph:
  dependencies:
    - target: kf-mvp
      type: semantic  # 都是多方案评审

---

# kf-brainstorm — 头脑风暴三方协作（通用 IDE 串行适配版）

## 概念

头脑风暴（Brainstorm）是一种多角度评审模式，通过三个专业角色的串行协作，实现更全面的决策。

【通用 IDE 适配说明】
- 红队分析 → 蓝队评估 → 裁判综合决策
- 每队产物写入独立文件，裁判阶段读取前两队产物
- 共享前缀缓存优化：红队完成后前缀落盘，蓝队/裁判高概率命中缓存

## 角色定义

### 红队 (Red Team) - 攻击分析
- **职责**: 寻找弱点、风险、漏洞
- **视角**: 如果我要攻击这个方案，我会怎么做？

### 蓝队 (Blue Team) - 防御评估
- **职责**: 评估鲁棒性、安全性、可维护性
- **视角**: 如何确保这个方案稳定运行？

### 裁判 (Judge) - 综合决策
- **职责**: 汇总双方观点，做出平衡决策
- **输出**: 最终决策、利弊分析、行动建议

## 触发词

| 触发词 | 说明 |
|--------|------|
| `头脑风暴` | 启动三方评审协作 |
| `/brainstorm` | 同上 |

## Harness 反馈闭环（铁律 3）

| Step | 验证动作 | 失败处理 |
|------|---------|---------|
| 三方方案生成 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --skill kf-brainstorm --stage solutions --required-sections "## 方案 A" "## 方案 B" "## 方案 C" --forbidden-patterns TODO 待定` | 回退补充 |
| 裁判评分 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --skill kf-brainstorm --stage judge --required-sections "## 评分卡" "## 排名"` | 补充评分 |
| 最终融合 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --skill kf-brainstorm --stage fusion --required-sections "## 最终方案" "## 优势汇总"` | 补充融合 |

验证原则：**Plan → Build → Verify → Fix** 强制循环，不接受主观"我觉得好了"。

## 关键实现要求

1. **串行执行**：红队 → 蓝队 → 裁判，在当前 AI 会话中按角色切换执行
2. **产物隔离**：红队产物写入 `brainstorm-red-analysis.md`，蓝队产物写入 `brainstorm-blue-defense.md`，裁判读取后输出 `brainstorm-judge-decision.md`
3. **共享上下文**：通过文件系统共享任务进度（通用 IDE 无 TaskUpdate）
