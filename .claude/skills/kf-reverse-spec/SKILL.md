---
name: kf-reverse-spec
description: |
  Use when needing to understand an existing codebase, reverse-engineer project architecture from source code, generate technical specs or wiki documentation for refactoring/secondary development, or document legacy systems.
  Triggers: "逆向", "存量代码", "代码扫描", "逆向工程", "生成文档", "reverse spec", "document codebase", "继承代码".
metadata:
  pattern: pipeline
  principle: 准/省
  recommended_model: flash
  integrated-skills:
    - kf-model-router
    - kf-web-search
    - kf-alignment
    - kf-code-review-graph
graph:
  dependencies:
    - target: kf-spec
      type: semantic  # 正向/逆向 Spec
    - target: kf-web-search
      type: workflow  # 搜索技术资料
    - target: kf-alignment
      type: workflow  # 产出后对齐
    - target: kf-code-review-graph
      type: workflow  # 代码审查图谱
    - target: kf-model-router
      type: workflow  # 自动路由

---

# kf-reverse-spec — 存量代码→Spec/文档 逆向流水线

> **核心价值**：从存量代码中逆向提取架构、数据模型、API 契约、业务逻辑，生成结构化 Spec 和 Wiki 文档，让"看不懂的代码"变成可维护、可重构、可交接的知识资产。

---

## 架构总览

```
 输入: 存量代码目录 / Git 仓库
        │
  Stage 0 ─── 对齐 (kf-alignment)
        │      产出: 范围边界、目标定义、输出格式选择
        ▼
  Stage 1 ─── 侦察 (Scout)
        │      产出: 代码树、依赖图、复杂度指标
        ▼
  Stage 2 ─── 制图 (Map)
        │      产出: 11 节 Spec 文档、架构图、数据流
        ▼
  Stage 3 ─── 成文 (Doc)
        │      产出: Wiki 文档 / 功能文档 / API 文档
        ▼
  Stage 4 ─── 审查 (Review)
               产出: 质量报告 + 修复建议
```

---

## Stage 0 — 对齐（kf-alignment）

执行前调用 `kf-alignment` 做动前对齐，锁定：

```
## 范围
- 代码路径：{绝对路径或 Git 仓库}
- 目标语言：{Python/JS/TS/Go/Java/etc}
- 输出目标：{Spec / Wiki / 功能文档 / 全部}

## 输出格式选择
A. Spec（架构 + API + 数据模型 + 部署）
B. Wiki（GitHub Wiki 格式，多页）
C. 功能文档（面向业务理解）
D. 全部（A + B + C）

## 排除
- {明确不扫描的目录或模块}
- {不需要产出的文档类型}
```

**门控**：用户确认范围后进入 Stage 1。

---

## Stage 1 — 侦察（Scout）

扫描代码库的物理结构和静态指标。

### 动作

1. **代码树扫描**
   - 扫描目录结构，识别模块划分
   - 统计文件数、总行数、语言分布
   - 识别入口文件、配置文件、构建脚本

2. **依赖分析**
   - 分析模块间依赖关系
   - 识别外部依赖和版本

3. **复杂度指标**
   - 圈复杂度、继承深度、耦合度
   - 热点文件（高频修改 + 复杂逻辑）

### 产出：`{project}-scout-report.md`

```markdown
## 侦察报告

### 项目概览
- 总文件数：{N}，总行数：{N}
- 语言分布：{语言} {占比} ...
- 入口文件：{路径}

### 模块划分
| 模块 | 文件数 | 行数 | 说明 |
|------|--------|------|------|

### 依赖关系
- 内部模块依赖图：{描述或 Mermaid 图}
- 外部依赖：{包名/版本}

### 复杂度热点
| 文件 | 圈复杂度 | 行数 | 风险等级 |
|------|---------|------|---------|
```

**门控**：侦察报告产出后进入 Stage 2。

---

## Stage 2 — 制图（Map）

逆向分析架构、数据模型、API 表面和业务逻辑。

### 动作

1. **架构逆向**
   - 识别分层结构（Controller/Service/Repository 等）
   - 标注模块职责和边界
   - 生成架构图（Mermaid）

2. **数据模型**
   - 核心实体和关系
   - 数据库 Schema
   - 数据流（关键路径）

3. **API 表面**
   - 公开接口 / 端点
   - 请求/响应格式
   - 认证鉴权方式

4. **业务逻辑映射**
   - 核心业务流程
   - 状态机 / 状态流转
   - 关键算法

### 产出：`{project}-spec.md`（11 节 Spec 文档）

```markdown
## 1. 项目概述与定位
## 2. 架构总览与模块划分
## 3. 数据模型与存储
## 4. API / 接口契约
## 5. 核心业务流程
## 6. 关键算法与逻辑
## 7. 配置与环境
## 8. 构建与部署
## 9. 测试策略
## 10. 安全与边界
## 11. 技术债务与风险
```

**门控**：Spec 文档完整，所有章节非空。

---

## Stage 3 — 成文（Doc）

根据 Stage 0 选定的输出格式生成文档。

### 格式 A — Wiki（GitHub Wiki 风格）

```
{project}-wiki/
├── Home.md              # 项目首页
├── Architecture.md      # 架构概览
├── Modules/             # 模块说明
│   ├── module-a.md
│   └── module-b.md
├── API-Reference.md     # API 参考
├── Data-Model.md        # 数据模型
├── Setup.md             # 环境搭建
└── FAQ.md               # 常见问题
```

### 格式 B — 功能文档（面向业务）

```
{project}-functional.md
  ├── 业务背景与目标
  ├── 用户角色与权限
  ├── 功能清单与流程
  ├── 业务规则
  └── 验收场景
```

### 格式 C — 全部（A + B + Spec）

三份文档全部生成。

**门控**：文档完整，格式正确。

---

## Stage 4 — 审查（Review）

自我审查文档质量。

### 检查清单

- [ ] Spec 11 节是否完整，无空节？
- [ ] Wiki 页面是否覆盖所有模块？
- [ ] Mermaid 图表是否渲染正确（语法无错）？
- [ ] 关键 API/接口是否都有文档？
- [ ] 数据模型是否标注了核心字段和关系？
- [ ] 架构决策是否附带了理由（Why）？
- [ ] 技术债务/风险章节是否诚实标注了已知问题？

### 产出：`{project}-review-report.md`

```markdown
## 审查报告

| 检查项 | 状态 | 问题 |
|--------|------|------|

## 待改进
- {缺失项或质量问题}
```

---

## Gotchas

- 大仓库（> 5000 文件）需先确认是否要全量扫描，或按模块分批处理
- 扫描阶段可以不装额外工具（纯 Glob/Grep + 手动分析），但装 `repowise` + `codekritik` 可大幅提升扫描质量
- 文档中的 Mermaid 图表需注意 GitHub 渲染兼容性（`graph TD` 等基础语法必测）
- 如果是二进制/闭源项目，本技能不适用（需 MetysAI / Ghidra 等二进制逆向工具）
- 本技能不修改源代码，只产出文档。如需重构，配合 `/mvp` 进行

## Harness 反馈闭环

| Stage | 验证动作 | 失败处理 |
|-------|---------|---------|
| 0 | 用户确认范围和输出格式 | 回退继续对齐 |
| 1 | Scout 报告含完整代码树和依赖 | 补充扫描 |
| 2 | Spec 11 节全部非空 | 补充缺失章节 |
| 3 | Wiki/功能文档完整 | 补充缺失页面 |
| 4 | 审查清单全部通过 | 修复质量问题 |
