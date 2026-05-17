---
name: kf-add-skill
description: |
  Use when the user wants to add, install, or integrate a new skill/plugin to this project — search by keyword, GitHub URL, or npm package. Syncs installation to {IDE_ROOT}/ directory, updates all related documentation ({IDE_CONFIG}, 安装或更新/AICoding.md, 安装或更新/README.md, 安装或更新/docs/INSTALL.md, 安装或更新/docs/MANUAL.md), and patches SKILL.md frontmatter of calling/called skills.
  Triggers: "install skill", "add skill", "add plugin", "search skill", "find skill", "integrate skill", "安装技能", "添加技能", "搜索技能", "装个技能".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - WebSearch
  - WebFetch
metadata:
  pattern: pipeline + inversion
  interaction: multi-turn
  steps: "7"
  integrated-skills:
    - kf-model-router
    - kf-skill-design-expert
    - kf-doc-consistency
  recommended_model: pro
graph:
  dependencies:
    - target: kf-skill-design-expert
      type: workflow  # 设计评审
    - target: kf-doc-consistency
      type: workflow  # 一致性检查
    - target: kf-model-router
      type: workflow  # 自动路由

---

# kf-add-skill — 技能安装管家

You are a skill installation orchestrator. Your job: search → clarify → download → install → configure → document → sync. Execute each step in order. Do NOT skip steps or proceed if a step gate fails.

---

## Step 0 — Auto-detection & Model Routing

Before starting, invoke kf-model-router to ensure the correct model is active for this task (pro for architectural decisions).

Then check: did the user provide keywords? A GitHub URL? A skill name? An npm package?

- **GitHub URL** (e.g. `https://github.com/user/skill-name`) → skip to Step 2
- **npm package** (e.g. `@scope/skill-name`) → use `npm search` + web search
- **Keywords only** → proceed to Step 1

---

## Step 1 — Search & Discover

### 1a. Clarify scope (if ambiguous)

Ask one question at a time. Do not proceed until answered.

- Q1: "Where should I search?"
  - GitHub repositories (topic: claude-code-skill, anthropic-skill)
  - npm registry (@anthropic-ai/skill-*, @claude-code/*)
  - Claude Code plugin marketplace
  - General web search for "{keywords} skill for Claude Code"
  - All of the above

- Q2 (if no URL given): "Any preference on source? (GitHub stars, recent updates, author reputation, license type)"

### 1b. Execute search

Run search in parallel across chosen sources. For each candidate found, collect:

- Skill name / directory name
- Description / purpose
- Source URL (GitHub, npm)
- Dependencies (Node.js version, Python packages, other skills)
- Installation method (clone, npm install, plugin install)
- License type
- Last updated / maintenance status

### 1c. Present findings

Present candidates as a numbered table:

```
| # | Name | Description | Source | License | Updated | Deps |
|---|------|-------------|--------|---------|---------|------|
| 1 | ...  | ...         | ...    | ...     | ...     | ...  |
```

Then ask: "Which one should I install? (pick number, or 'none' to cancel)"

Gate: Do NOT proceed to Step 2 until user selects a candidate.

---

## Step 2 — Download & Verify

### 2a. Clone/Download

Depending on source type:

| Source | Command |
|--------|---------|
| GitHub repo | `git clone <url> {IDE_ROOT}/skills/<skill-name>/` |
| npm package | `npm install <package> --prefix {IDE_ROOT}/skills/<skill-name>/` |
| Single file | Download with curl to `{IDE_ROOT}/skills/<skill-name>/` |

If the directory already exists:
- Ask: "Skill `<name>` already exists. Overwrite? Merge? Skip?"
- Default to merge (keep existing, add missing files)

### 2b. Verify structure

Check the downloaded skill has at minimum:

- `SKILL.md` at root of the skill directory
- Valid YAML frontmatter with `name` and `description`

If `SKILL.md` is missing:
- Check if the repo uses a different layout (e.g. just a .md file, or nested structure)
- Try to identify the main instruction file
- If unfindable → report to user and abort

### 2c. Run skill's own install script (if exists)

Check for `install.sh`, `install.ps1`, `setup.sh`, or similar. If found, run it within the skill directory.

Gate: Do NOT proceed to Step 3 until download completes and structure is verified.

---

## Step 3 — Dual-Directory Installation

### 3a. Register in {IDE_ROOT}/

Create (or verify) the skill directory at `{IDE_ROOT}/skills/<skill-name>/`. This is already done if you cloned there in Step 2.

If the skill source is elsewhere (e.g. global `~/.qoder/skills/` or `~/.claude/skills/`), copy it:
```bash
cp -r ~/.qoder/skills/<skill-name> {IDE_ROOT}/skills/<skill-name>
# or: cp -r ~/.claude/skills/<skill-name> {IDE_ROOT}/skills/<skill-name>
```

### 3b. Register in {IDE_CONFIG}

If the skill is a standalone tool (not a meta/process skill), add a reference entry under a new `## 可用技能速查` section or append to an existing skill list in `{IDE_CONFIG}`.

Gate: Do NOT proceed until both skill directory and config are updated.

---

## Step 4 — Configuration Update

### 4a. Update CLAUDE.md skill table

Read `{IDE_CONFIG}`. Add entry to the kf- series table (or create a new row for non-kf skills):

```markdown
| `<skill-name>` | `<trigger-alias>` | `<principle>` | `<chain-type>` | `<auto-calls>` | `<called-by>` | `<model>` |
```

Follow the exact table format. Match principle to one of: 稳/省/准/测的准/快/懂.

### 4b. Update 安装或更新/AICoding.md calling chain

Read `安装或更新/AICoding.md`. Two places to update:

1. **kf- series table** (or upstream table for non-kf): add the new skill row
2. **Calling chain diagram**: if this skill calls or is called by others, add nodes/edges to the ASCII diagram

### 4c. Update settings.json (if needed)

If the skill requires new permissions (new domains for WebFetch, new allowed-tools), add them to `{IDE_ROOT}/settings.json` under the appropriate permission section.

Gate: Do NOT proceed until CLAUDE.md and 安装或更新/AICoding.md are updated.

---

## Step 5 — Documentation Sync

Load `references/doc-sync-rules.md` for the exact section templates and insertion points for each documentation file. Then update each file:

### 5a. 安装或更新/README.md

Add skill to the skill list/table in 安装或更新/README.md. If 安装或更新/README.md has no skill table, add the entry in the same format as existing skills.

### 5b. 安装或更新/docs/INSTALL.md

If the skill requires global dependencies or special install steps, add them to the dependency table and install instructions.

If the skill is self-contained (just cloned into `{IDE_ROOT}/skills/`), add a note in the "后续步骤" section.

### 5c. 安装或更新/docs/MANUAL.md

Add a trigger entry to the "功能触发速查" table in Section 四 of MANUAL.md:

```
| `<trigger phrase>` | `<what it does>` | kf-add-skill |
```

### 5d. .trae/rules.md

If the skill has constraints/patterns relevant to Trae Builder (beyond what was added in Step 3b), append them to the relevant section.

---

## Step 6 — Skill Metadata Sync

### 6a. Identify related skills

Scan ALL `SKILL.md` files in `{IDE_ROOT}/skills/` to find:

1. **Upstream skills** — skills whose `integrated-skills` metadata or body mentions the new skill (skills that auto-call or depend on this one)
2. **Downstream skills** — skills that the new skill's `integrated-skills` metadata declares it depends on

For each upstream skill found: add the new skill name to its `integrated-skills` metadata list in SKILL.md frontmatter.

For each downstream skill: verify the dependency exists. If the new skill's SKILL.md declares it calls `kf-xxx`, confirm that `kf-xxx` actually exists and is documented.

### 6b. Update integrated-skills chains

The key pattern to patch:

```yaml
metadata:
  integrated-skills:
    - <existing-skills>
    - <new-skill-name>    # ← add this line
```

Use exact YAML indentation matching the target file. Do NOT reformat the entire file.

---

## Step 7 — Run Install Scripts & Final Verification

### 7a. Run project install scripts

```bash
# Windows
.\{IDE_ROOT}\install-local.ps1

# Linux/macOS
bash {IDE_ROOT}/install-local.sh
```

This ensures any new directory registrations or configuration templates are applied.

### 7b. Gate check verification

Run the harness gate check to verify no forbidden patterns were introduced:

```bash
node {IDE_ROOT}/helpers/harness-gate-check.cjs --forbidden-patterns "TODO" "待定" "FIXME"
```

### 7c. Post-install consistency check

After all documentation updates are complete, trigger the document consistency check:

Say **"now do a doc consistency check"** to invoke `kf-doc-consistency`.

This verifies all updated files (CLAUDE.md, 安装或更新/AICoding.md, INSTALL.md, MANUAL.md) are internally consistent with:
- Every skill on disk has a row in every relevant table
- No stale entries for deleted skills
- Trigger words are consistent across all docs
- Directory structure trees match the actual filesystem

If `kf-doc-consistency` reports any ERROR items, fix them before proceeding.

### 7d. Summary

Output a structured summary:

```
## kf-add-skill 安装完成

| 项目 | 内容 |
|------|------|
| 技能名称 | <name> |
| 安装位置 | {IDE_ROOT}/skills/<name>/ |
| Trae 适配 | <yes / no / partial> |
| 触发的文档更新 | <list of files changed> |
| 元数据同步 | <list of skills patched> |
| 新增依赖 | <list or "none"> |

### 快速测试
- 触发词: `<trigger>`
- 或直接说: "<example phrase>"
```

---

## References

- Complete documentation sync templates and insertion points: [references/doc-sync-rules.md](references/doc-sync-rules.md)
- Skill engineering standards: load via kf-skill-design-expert when auditing this skill itself

---

## Gotchas

- When updating {IDE_CONFIG}, match the EXACT table column count and format. A misaligned pipe character breaks the markdown table.
- When patching `integrated-skills` in upstream SKILL.md files, preserve the existing YAML indentation (usually 2 or 4 spaces). Use Edit tool with exact string matching.
- Some skills are stored only globally (`~/.qoder/skills/` or `~/.claude/skills/`) and symlinked. Check for symlinks before copying.
- kf-model-router is a meta-skill. Never add it to user-facing trigger tables.
- The install-local scripts only handle gspowers and gstack copying — new kf- skills need manual addition to the script if they should be auto-installed.

