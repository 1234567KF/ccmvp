# kf-prd-generator

## 技能来源

- **基础模式**：Inversion + Generator 组合模式
  - 来源：kf-skill-design-expert 五大设计模式知识库
  - 核心理念：先通过 Inversion 结构化访谈收集需求，再通过 Generator 模板驱动生成
- **Kiro Spec 生成**：Spec-first 方法论
  - 来源：Kiro IDE (Amazon) 的 spec document generation 设计理念
  - PRD 本身即为"规格文档"，是下游任务的单一真实来源
- **SDD Excel 集成**：结构化需求采集模板解析
  - 来源：项目定制化 SDD 需求采集 Excel 模板
- **Harness Engineering**：五根铁律评审体系
  - 来源：`kf-skill-design-expert/references/harness-engineering-audit.md`

## 参考链接

1. OpenClaw Skill Creator — https://github.com/anthropics/claude-code-skills
2. Kiro IDE Spec Document Generation — Amazon Kiro IDE 设计理念
3. Inversion 模式参考 — kf-skill-design-expert `references/five-patterns-detail.md`
4. Generator 模式参考 — kf-skill-design-expert `references/five-patterns-detail.md`
5. Harness Engineering 五根铁律 — `kf-skill-design-expert/references/harness-engineering-audit.md`

## 改造说明

- `kf-` 前缀表示经过定制改造
- 本技能基于 Inversion + Generator 组合模式，增加了：
  - SDD Excel 模板自动分流（检测到 SDD 格式时跳过口述问询）
  - 项目上下文自动检测（扫描 package.json / build.gradle.kts 提取技术栈）
  - MVP 模式兜底（无依赖文件时回退到 `安装或更新/docs/mvp技术栈.md`）
  - Gate 1.5 技术约束完整性验证
  - Gherkin 验收标准格式（含 Frontend/Backend 执行边界标注）
  - Mermaid 状态图要求（核心流程）
  - Harness 门控验证（机械化验证每个 Gate）
  - 记忆持久化（prd-generation-log.md）
- 重构 v2 变更：精简 SKILL.md 主文件，将详细规则保留在核心流程中，遵循 Progressive Disclosure 原则。与 v1 相比移除了重复的 Harness 门控验证章节（合并到 Harness Feedback Loop 一处）
