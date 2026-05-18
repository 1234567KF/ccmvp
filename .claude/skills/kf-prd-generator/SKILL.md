---
name: kf-prd-generator
description: >-
  Transform business requirements (verbal/Excel/document) into structured
  Markdown PRD documents that AI agents can execute. Use when the user asks to
  write a PRD, generate a requirements document, convert requirements, or
  create a product spec. Triggers: "写PRD", "需求文档", "生成PRD", "需求转化".
metadata:
  pattern: inversion + generator
  interaction: multi-turn
  called_by:
    - kf-mvp
integrated-skills:
  - kf-alignment
recommended_model: flash
graph:
  dependencies:
    - target: kf-spec
      type: semantic  # 都是需求/文档生成
    - target: kf-alignment
      type: workflow  # 产出后自动动后对齐
    - target: kf-model-router
      type: workflow  # 自动路由

---

PRD generation expert. Conduct structured requirements interview before generating any PRD. DO NOT generate PRD content until all requirements are gathered and confirmed.

## Memory Baseline Load (Iron Rule 4)

On each startup, MUST read the latest 3 entries from `memory/prd-generation-log.md` (if exists) to understand recent PRD input sources, outstanding issues, and confirmation patterns. Avoid re-asking about already-confirmed items.

---

## Phase 1 — Requirements Interview (Inversion Phase)

Ask the following questions one at a time. Wait for each answer before continuing.

- Q1: "Provide the requirement source document (via @file: verbal notes/Excel/Word/meeting minutes). What business module does this cover?"

### SDD Routing

After Q1, if user provided `.xlsx` file, **MUST immediately check if it's an SDD requirements collection Excel template** (ReadMe Sheet first line contains `SDD需求采集模板`, and Sheet names follow `SheetN-ChineseName` format):

- **Is SDD template**: Load `assets/sdd-excel-parsing-rules.md`, extract Sheet1 (project basics) and Sheet14 (AI instruction config) data, **skip Q2-Q7 verbal questions**, proceed directly to Phase 1.5 for cross-validation with SDD data
- **Not SDD template**: Continue with Q2-Q7 verbal questions

- Q2: "What are the target user roles? List them (e.g., regular employee, department manager, HR admin)"
- Q3: "What is the core business objective? What quantifiable results are expected?"
- Q4: "What are the technical constraints? Specify:\n  - Backend: framework and version (e.g., Spring Boot 3.x + Kotlin 1.9)\n  - Frontend: framework, UI component library and version (e.g., Vue 3 + ant-design-vue 4.1.2)\n  - Database and middleware\n  (System will auto-scan project dependency files; you can answer 'use current tech stack')\n  (For quick prototype validation, choose **MVP mode**: Node.js + Express + SQLite + Vue 3 + Vite, see `安装或更新/docs/mvp技术栈.md`)"
- Q5: "Are there existing systems or APIs to integrate? If yes, specify"
- Q6: "What is explicitly out of scope for this phase?"
- Q7: "Any special UI specification requirements? (component library, design system, brand colors)"

For any unclear or ambiguous answers, follow up for clarification. MUST NOT assume or fabricate requirements.

---

### Phase 1.5 — Project Context Auto-Detection

After collecting user answers, MUST auto-scan workspace dependency files to extract actual tech stack:

**Scan targets:**
- Frontend: Read `package.json` → extract vue/react/angular version, UI component library name and version, build tool
- Backend: Read `build.gradle.kts` or `pom.xml` → extract framework version, language version, ORM framework
- Other: Read corresponding dependency files (`requirements.txt`, `Cargo.toml`, etc.)

**MVP fallback:** If no dependency files exist (new project or prototype-only stage), MUST check `安装或更新/docs/mvp技术栈.md`:
- **Exists**: Use as default tech constraint, output MVP tech stack comparison table with `[MVP 默认]` labels
- **Not exists**: MUST ask user for complete tech stack info (can recommend MVP mode)

**Output tech constraint comparison table (MUST output before continuing):**

| Dimension | Detected Value | Source File | User Answer | Status |
|-----------|---------------|-------------|-------------|--------|
| Frontend framework | Vue 3.x | package.json | "current stack" | ✅ Match |
| UI component library | ant-design-vue@4.1.2 | package.json | Not specified | ⚠️ Need confirm |
| Backend framework | Spring Boot 3.x | build.gradle.kts | "current stack" | ✅ Match |

**Rules:**
- Detected version conflicts with user answer → MUST ask which takes priority
- User answer vague ("current stack") → MUST use detected value
- Cannot detect dependency files → MUST ask for specific version numbers
- If SDD Excel source: cross-compare Phase 1.5 detected values with Sheet14 data, conflicts resolved by user confirmation
- **MVP mode or no dependency files falling back to `安装或更新/docs/mvp技术栈.md`**: Tech constraints table uses MVP defaults, PRD Chapter 8 auto-fills MVP tech stack, Mock strategy noted in remarks
- Confirmed values from this table become the basis for PRD Chapters 8 and 9

### Gate 1 — DO NOT generate PRD until all Phase 1 questions are fully answered and confirmed by user.

### Gate 1.5 — Tech Constraint Completeness Verification

Before generating PRD, MUST verify:
- [ ] Chapter 8 "UI Specification Constraints" component library field includes name + version number (e.g., "Ant Design Vue 4.1.2", not "Ant Design Vue 3.x" or just "Ant Design Vue")
- [ ] Chapter 9 "Technical Constraints" all framework fields filled with specific version numbers
- [ ] All version numbers from project auto-detection or user explicit confirmation (Phase 1.5 table status ✅)
- [ ] No unconfirmed ⚠️ status items

Any item fails → return to Phase 1.5 for user confirmation

---

## Phase 2 — PRD Document Generation (Generator Phase)

After confirming all requirements, generate PRD following these steps:

### Step 1: Requirement Information Extraction

- Read user-specified requirement source document
- **Word format (.docx)**: Use `docx` Skill to extract content
- **Excel format (.xlsx)**:
  - Check if SDD template (ReadMe Sheet first line contains `SDD需求采集模板`, has `Sheet14-AI指令配置` or `Sheet1-项目基础信息`, Sheet names follow `SheetN-中文名称` format)
  - **Is SDD template**: Already loaded `assets/sdd-excel-parsing-rules.md` in Phase 1 routing, parse structured rules and fill PRD chapters. Note: Sheet3 (data relationships) and Sheet4 (state transitions) are technical design content, optional reference only, not mandatory PRD output
  - **Not SDD template**: Read table data in general way
- **PDF format**: Use `pdf` Skill to extract text content
- Combine with Phase 1 interview results, extract core business objectives, user roles, main features
- If new ambiguities or gaps found, ask supplementary questions before continuing

### Step 2: Business Rule Organization

- Organize business rules by functional module, number each rule (e.g., R001, R002)
- Identify rule dependencies and conflicts
- Mark ambiguous rules needing human confirmation — do NOT assume

### Step 3: Field Definition Tabulation

- Extract all data fields, output in table format
- Each field includes: field name, type, required, validation rules, default value, notes

### Step 4: Functional Requirements by Module

Generate per-module functional requirements tables. Each first-level module MUST have a dedicated subsection with this table format:

| 功能项 | 优先级 | 描述 | 验收标准 |
|--------|--------|------|---------|
| FEATURE | P0/P1/P2 | Brief description | Specific verifiable acceptance |

- Reference the flash PRD format (Chapter 5): each module table lists features as rows with inline acceptance criteria
- 优先级: P0 (core/must-have), P1 (important/should-have), P2 (nice-to-have)
- 验收标准 MUST be specific and verifiable (e.g., "列表展示标识编号、类型、申请数量"), NOT vague like "功能正常"
- Second-level modules (sub-modules) can use separate tables under the first-level heading
- Cover ALL features identified in Phase 1 Q1 sources + Phase 2 Step 1 extraction

### Step 5: Page Interaction Logic

- Describe interaction flows by page dimension (list page, detail page, form page, etc.)
- MUST cover ALL pages derived from the functional requirements (Step 4) — no omissions
- Every page MUST include: list/search/view/create/edit operations as applicable
- Use "user action → system response" format for each interaction step
- MUST cover three states for each page:
  - **Loading**: skeleton/spinner behavior
  - **Empty**: what user sees when no data exists
  - **Error**: error message, retry mechanism
- Core flows (payment, approval, ordering, code binding, packaging) MUST output Mermaid `stateDiagram-v2` state diagrams
- Non-core flows optional but at minimum MUST describe the interaction steps in table format
- State diagrams must include all state nodes, transition conditions, exception rollback paths
- Include state-permission mapping table

### Step 6: Exception Handling Plan

- List at least 5 exception scenarios and handling plans
- Include: network error, insufficient permissions, data conflict, concurrent operations, data not found

### Step 7: Acceptance Criteria

- Write verifiable acceptance criteria for each feature point
- MUST use standard Gherkin `Scenario:` format (not table format)
- Each `Then`/`And` line MUST mark `(Frontend)` or `(Backend)` execution boundary
- **Coverage requirements per module:**
  - At least 3 Happy Path scenarios (covering: normal flow, boundary conditions, multi-role)
  - At least 2 Exception Path scenarios (covering: permission denied, data not found, concurrent conflict, network failure, invalid input)
  - Exception Path MUST include at least one scenario with error response code verification
- Mark priority (P0/P1/P2)
- The combined acceptance criteria across all modules MUST be sufficient to generate complete test cases

**Gate**: All modules MUST have ≥3 Happy Path + ≥2 Exception Path. If any module is short, return to Step 7 to supplement.

### Step 8: Function Structure Matrix

Generate two comprehensive matrices mapping the full system structure:

**Table 1 — Function Hierarchy:**
| 一级模块 | 二级模块 | 三级功能 | 对应界面 | 界面中的操作按钮 |
|---------|---------|---------|---------|----------------|
| Top menu | Sub-menu | Feature | Screen/page | Buttons/actions |

- 一级 = top-level navigation menu item
- 二级 = sub-menu or module section
- 三级 = specific feature/function
- 对应界面 = which screen/page hosts this feature
- 界面中的操作按钮 = all interactive elements on that screen

**Table 2 — Role-Permission Matrix:**
| 角色 | 一级模块 | 二级模块 | 操作权限 | 数据范围 |
|------|---------|---------|---------|---------|
| ROLE | MODULE | SUB-MODULE | create/read/update/delete/approve | all/org/self |

- Include ALL roles identified in Phase 1 Q2
- 操作权限: granular per-feature, not per-page
- 数据范围: what data scope this role can access

### Step 9: Data Permissions Analysis

Generate a dedicated section analyzing data access control:

- **Data isolation model**: how data is segmented between organizations/roles
  - Row-level vs column-level isolation
  - Organization hierarchy: parent org can view child org data? (recursive sub-set visibility)
  - Cross-org data sharing rules
- **Operation scope**: what each role can do with data
  - View only / View + operate / View + operate + approve
  - Hierarchical scope: self data → department data → all data
- **Approval scope**: which operations require approval and who can approve
  - Approval chain definition
  - Escalation rules (auto-escalate after timeout)
  - Delegation rules
- **Special cases**:
  - Admin bypass of data isolation
  - Audit trail for all data-access operations
  - Data export/import permission controls

### Step 10: Output Complete PRD Document

Load `assets/prd-template.md` for PRD document standard template.

Output complete PRD following template structure. File path rules:

1. **User specified path** → Use user's path
2. **No specification** → Suggest default path based on project structure:
   - **Monorepo**: `docs/{version}/prd.md`
   - **Split-repo**: `{project}-docs/{version}/prd.md`
   - `{version}` confirmed by user in Phase 1 (e.g., `v1.2.0`), ask if not mentioned
3. Output path, wait for user confirmation

---

## Output Format

**Required chapters (1-12, no omissions):**

1. **Requirement Background** (business objective, target users, core value)
2. **Business Rules** (numbered rule list by module)
3. **Data Field Definitions** (table format with types and validation rules)
4. **Functional Requirements** (per-module table: 功能项 | 优先级 | 描述 | 验收标准)
5. **Page Interaction Logic** (action→response format, core flows with Mermaid state diagrams + state-permission mapping; MUST cover all pages)
6. **Exception Handling Plan** (≥5 scenarios)
7. **Acceptance Criteria** (Gherkin Scenario format with execution boundary labels and priority; ≥3 Happy Path + ≥2 Exception Path per module)
8. **UI Specification Constraints** (component library, colors, spacing, fonts)
9. **Technical Constraints** (tech stack, reference specifications)
10. **Function Structure Matrix** (feature hierarchy 1/2/3-level → UI → buttons + role-permission matrix)
11. **Data Permissions** (data isolation model, operation scope, approval scope)
12. **Pending Items** (all unresolved questions list)

**Conditional chapters (output only when applicable):**

13. **Fund Flow Analysis** — only when requirements involve fund flow
14. **Compliance Process** — only when requirements involve compliance constraints

> Complete output template: `assets/prd-template.md`

---

## Harness Feedback Loop

| Gate | Verification Action | Failure Handling |
|------|-------------------|------------------|
| Gate 1 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --skill kf-prd-generator --stage gate1 --required-sections "## 目标用户" "## 核心业务目标" "## 技术约束" --forbidden-patterns TODO 待定` | Return to Phase 1 |
| Gate 1.5 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --skill kf-prd-generator --stage gate1_5 --required-sections "## UI 规范约束" "## 技术约束" --forbidden-patterns "未确认" "⚠️"` | Return to Phase 1.5 |
| Phase 2 | `node {IDE_ROOT}/helpers/harness-gate-check.cjs --skill kf-prd-generator --stage phase2 --required-sections "## 需求背景" "## 业务规则" "## 数据字段定义" "## 验收标准" --forbidden-patterns TODO 待定` | Supplement missing chapters |

Verification principle: **Plan → Build → Verify → Fix** forced loop.

## Memory Persistence (Iron Rule 4)

After each PRD generation, MUST write summary to `memory/prd-generation-log.md`:

```markdown
### {date} — {project} v{version}
- **Input source**: {SDD Excel / verbal / document}
- **Core modules**: {module list}
- **Outstanding issues**: {unconfirmed items}
```

## Iron Rules

1. MUST NOT generate PRD before Phase 1 completes — stop and ask when requirements incomplete
2. MUST follow directory conventions — user-specified path first, then project-based defaults
3. MUST NOT assume unconfirmed information — stop and output question list on ambiguity or missing info
4. Escalate after 2 unresolved attempts — mark as blocker and submit to user
5. MUST NOT introduce unconfirmed information — only reference user-specified documents
6. Field definitions MUST be tabular — no pure-text field descriptions
7. Acceptance criteria MUST be verifiable — no vague descriptions (e.g., "good user experience")
8. Business rules MUST be numbered — for downstream task reference
9. Core flows MUST output state diagrams — payment/approval/ordering/code-binding/packaging flows must include Mermaid `stateDiagram-v2` + state-permission mapping table
10. Acceptance criteria MUST use Gherkin format — standard `Scenario:` format, each Then/And marked `(Frontend)` or `(Backend)`, at least 3 Happy Path + at least 2 Exception Path per module
11. Conditional chapters output as needed — Chapter 13 (fund flow) only when fund flow involved, Chapter 14 (compliance) only when compliance involved
12. Gate mechanization (Harness Engineering Iron Rule 2) — Gate 1 and Gate 1.5 MUST pass mechanized verification, block generation on failure
13. Functional Requirements chapter MUST use 4-column table format (功能项 | 优先级 | 描述 | 验收标准), each first-level module gets its own table
14. Function Structure Matrix MUST generate both hierarchy table (1/2/3-level → UI → buttons) and role-permission matrix
15. Data Permissions chapter MUST be generated when the system involves multiple roles with different data access levels
16. Each feature's acceptance criteria in the 功能需求 table MUST be specific and verifiable — no vague descriptions like "功能正常"

## Reference Files

| File | Load When | Purpose |
|------|-----------|---------|
| `assets/prd-template.md` | Step 10 | PRD document standard template |
| `assets/sdd-excel-parsing-rules.md` | Phase 1 SDD routing | SDD requirements collection Excel structured parsing rules |
| `安装或更新/docs/mvp技术栈.md` | Phase 1.5 (no dependency files) | MVP minimal dev tech stack defaults |
