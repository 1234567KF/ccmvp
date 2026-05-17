# Doc Sync Rules — 文档同步规则

> 当 kf-add-skill 安装新技能时，按此文件中的模板和插入点更新各文档。
> 每个文件列出：定位方式、插入模板、注意事项。

---

## 1. {IDE_CONFIG}

### 1a. kf- 系列技能表（新增 kf- 技能）

**定位**：`### kf- 系列（团队自建）` 后的表格，在表格最后一行的 `| `kf-markdown-to-docx-skill` | ...` 之前插入。

**模板**：
```markdown
| `<skill-name>` | `<alias>` | `<principle>` | `<chain-type>` | `<description>` |
```

**字段填充规则**：
- `alias`: 有别名写 `/alias`，无别名写 `—`
- `principle`: 从 稳/省/准/测的准/快/懂 中选最匹配的一个
- `chain-type`: "独立" / "自动调用 X、Y" / "被 Z 调用" / "内部 spawn"
- `description`: 一句话，≤30 字

### 1b. 上游技能表（新增非 kf- 技能）

**定位**：`### 上游技能（非自建，不加 kf- 前缀）` 后的表格，插入新行。

**模板**：
```markdown
| `<skill-name>` | `<source>` | `<description>` |
```

### 1c. 目录结构树

**定位**：`└── skills/` 下的目录列表。

**插入**：在技能列表区域按字母序插入：
```
│   ├── <skill-name>/            # <brief desc>
```

### 1d. 常用触发词表

**定位**：`## 常用触发词` 后的表格。

**模板**：
```markdown
| `<trigger>` | <skill-name> | <principle> | <auto-call-info> |
```

### 1e. 自动调用链速览

**定位**：`## 自动调用链速览` 后的 ASCII 图。

如果新技能参与了 `/mvp` 调用链，添加对应节点。

---

## 2. AICoding.md

### 2a. kf- 系列表

**定位**：`### kf- 系列（团队自建）` 下的表格。在 `| `kf-markdown-to-docx-skill` | ... |` 行之前插入。

**模板**：
```markdown
| `<skill-name>` | `<alias>` | `<principle>` | `<chain-type>` | `<auto-calls>` | `<called-by>` | `<model>` |
```

**字段说明**：
- `chain-type`: "独立" / "自动调用" / "内部 spawn" / "自动触发"
- `auto-calls`: 该技能自动调用哪些其他技能，无则写"无"
- `called-by`: 哪些技能会调用该技能，无则写"用户手动"
- `model`: "pro" / "flash" / "pro→flash"

### 2b. `/mvp` 完整调用链 ASCII 图

**定位**：`### 主入口 `/mvp` 的完整调用链` 下的 ASCII 图。

如果新技能被 `/mvp` 在某个 Phase 自动调用，在对应位置添加节点：
```
  │   ├─ kf-xxx ← 说明（Stage N）
```

### 2c. 关键结论表（如有新的调用关系）

**定位**：`### 关键结论` 下的表格。

如果新技能引入了新的自动调用关系或回答了新的 FAQ，加一行。

---

## 3. README.md

### 3a. 技能列表

**定位**：查找 README 中的技能列表/表格区域（可能在"## Features"、"## Skills"、"## 技能"等章节下）。

**模板**：跟随 README 现有的格式。如果 README 采用了卡片式布局，延续该布局。如果是表格，延续表格。

如果没有明显的技能列表区域，在合适章节下创建。

---

## 4. 安装或更新/docs/INSTALL.md

### 4a. 全局依赖表（如果新技能需要新依赖）

**定位**：查找 INSTALL.md 中的依赖表格（通常在"一、环境检测与安装策略"或类似的章节）。

**模板**：
```markdown
| `<tool>` | `<install-command>` | `<description>` |
```

### 4b. 安装步骤（如果新技能有特殊安装流程）

**定位**：在安装步骤章节末尾追加。

仅在技能需要全局依赖（npm install -g）或特殊配置时追加。

### 4c. 验证步骤

**定位**：INSTALL.md 的验证章节。

添加新技能到验证清单：
```bash
ls {IDE_ROOT}/skills/<skill-name>/SKILL.md    # 应存在
```

---

## 5. 安装或更新/docs/MANUAL.md

### 5a. 功能触发速查表

**定位**：`## 四、功能触发速查` 或类似的触发词速查表。

**模板**：
```markdown
| `<trigger phrase>` | `<what it does>` | <skill-name> |
```

- `trigger phrase`: 用户在对话中可能会说的触发词（中文优先）
- `what it does`: 一句话描述技能做什么
- 第三列填 kf-add-skill（来源技能）

### 5b. 工作流步骤（如果改变了工作流）

**定位**：`## 三、项目开发工作流`。"路径1 — kf 系列"章节。

如果新技能是开发工作流中的一环，在对应阶段插入步骤。

---

## 6. {IDE_CONFIG} 补充

### 6a. 能力差异表（如果新技能影响差异）

**定位**：`## 与其他 IDE 完整版的能力差异` 下的表格。

如果新技能为当前 IDE 提供了新能力（之前标记为 `-`），更新对应行。

### 6b. 新技能简要说明

**定位**：在 {IDE_CONFIG} 末尾追加。

**模板**：
```markdown
### <skill-name> — <brief title>

<one-paragraph description of what this skill does and any IDE-specific notes>
```

仅当技能对当前 IDE 有实用价值时追加。纯内部流程技能（如 kf-model-router）不追加。

---

## 7. 相关技能 SKILL.md 的 integrated-skills 更新

### 7a. 识别需要更新的技能

扫描 `{IDE_ROOT}/skills/*/SKILL.md` 的 frontmatter，查找：

1. **上游**：`integrated-skills` 列表里应该包含新技能但没有的（例如：`kf-mvp` 维护了完整技能列表，新技能应该加入）
2. **下游**：新技能声明依赖的 `integrated-skills` 中的技能，确认它们存在

### 7b. 更新上游技能的 integrated-skills

**定位**：目标 SKILL.md 的 YAML frontmatter 中 `integrated-skills:` 列表。

**操作**：在列表末尾追加一行，保持缩进一致。

**需要检查的上游技能清单**（每次安装时重新扫描，以下为常见候选）：

| 上游技能 | 条件 |
|---------|------|
| kf-mvp | 始终（维护完整技能列表） |
| kf-mvp | 如果新技能被 `/mvp` 自动调用 |
| kf-brainstorm | 如果新技能被头脑风暴使用 |

### 7c. 更新 AICoding.md 中 kf-mvp 的 integrated-skills 引用

AICoding.md 中 kf-mvp 技能条目引用的 `integrated-skills` 列表可能也需要更新（如果该列表是硬编码的）。

---

## 通用规则

1. **不要在表中插入空行** — 保持 markdown 表格连续
2. **保持列对齐一致** — 如果现有表格用了紧凑格式（无空格填充），沿用该格式
3. **中文触发词优先** — 用户面向的文档使用中文
4. **技能名称一致** — 全篇统一使用 `kf-xxx` 格式，不混用别名
5. **先读后写** — 每次更新前先 Read 目标文件，确认当前内容后再 Edit
6. **幂等性** — 如果发现条目已存在，跳过不重复添加
