#!/usr/bin/env node
/**
 * gate-keeper.cjs — Claude Code Hook: 阶段门禁强制验证
 *
 * 挂载点: PreToolUse(Skill)
 * 职责:
 *   1. 从 stdin 解析正在加载的 Skill 名称
 *   2. 读取当前 Pipeline 状态（.current-phase.json）
 *   3. 判定目标 Skill 属于哪个 Phase
 *   4. 验证前置 Gate 是否已全部通过
 *   5. 前置 Gate 未通过 → exit 1 阻止加载
 *
 * 门禁定义（来源: kf-mvp SKILL.md "Harness 反馈闭环" 表）:
 *   Gate 0 → 技术栈确认书存在
 *   Gate 1 → 三队对齐文件存在
 *   Gate 2 → PRD.md 存在且通过机械化验证
 *   Gate 3 → 三队 Spec 通过质量门禁
 *   Gate 4 → spec.md 已生成（用户已决策）
 *   Gate 4.5 → 任务拆分完成（tasks/ + progress.md）
 *   Gate 5 → TDD 全部 GREEN + 编译通过 + 浏览器验证
 *   Gate 6 → 暗门注释注入完成
 *   Gate 7 → USAGE.md 自检通过
 *
 * Skill → Phase 映射表（从 kf-mvp SKILL.md Pipeline 架构推导）:
 *   kf-go          → 可随时加载（路由入口）
 *   kf-alignment   → Phase 1（无前置 Gate）
 *   kf-prd-generator → Phase 2（需要 Gate 1）
 *   kf-spec        → Phase 3（需要 Gate 2）
 *   kf-browser-ops → Phase 5 Stage 3（需要 Gate 2.5）
 *   kf-annotate    → Phase 6（需要 Gate 5）
 *
 * 状态存储: .claude-flow/mvp-state/.current-phase.json
 *
 * 退出码:
 *   0 = 门禁通过，允许加载
 *   1 = 门禁未通过，阻止加载（Claude Code 会跳过 Skill 调用）
 *   2 = 非 MVP 上下文，不干预
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const STATE_DIR = path.join(ROOT, '.claude-flow', 'mvp-state');
const CURRENT_PHASE_FILE = path.join(STATE_DIR, '.current-phase.json');
const PROGRESS_FILE = path.join(STATE_DIR, '.progress.json');

// ─── Gate 定义 ──────────────────────────────────────────────────────
// 每个 Gate: { id, name, verify(): boolean, description }
const GATES = {
  'gate-0': {
    id: 'gate-0',
    phase: 'phase-0',
    name: '技术栈确认',
    verify() {
      return fs.existsSync(path.join(ROOT, 'docs', 'tech-stack-confirmed.md'))
        || existsAny(/tech-stack/);
    },
    description: 'docs/tech-stack-confirmed.md 必须存在',
  },
  'gate-1': {
    id: 'gate-1',
    phase: 'phase-1',
    name: '三队需求对齐',
    verify() {
      const alignments = ['red-00-alignment.md', 'blue-00-alignment.md', 'green-00-alignment.md'];
      return alignments.every(f => fs.existsSync(path.join(ROOT, f)));
    },
    description: '三队对齐文件必须全部存在',
  },
  'gate-2': {
    id: 'gate-2',
    phase: 'phase-2',
    name: 'PRD 生成',
    verify() {
      const prd = path.join(ROOT, 'docs', 'prd.md');
      if (!fs.existsSync(prd)) return false;
      try {
        const content = fs.readFileSync(prd, 'utf8');
        const required = ['## 需求背景', '## 业务规则', '## 验收标准'];
        return required.every(s => content.includes(s));
      } catch { return false; }
    },
    description: 'docs/prd.md 必须存在且包含必填章节',
  },
  'gate-3': {
    id: 'gate-3',
    phase: 'phase-3',
    name: '三队 Spec 质量',
    verify() {
      const specs = ['red-spec.md', 'blue-spec.md', 'green-spec.md'];
      for (const s of specs) {
        const p = path.join(ROOT, s);
        if (!fs.existsSync(p)) return false;
        try {
          const content = fs.readFileSync(p, 'utf8');
          if (!content.includes('## 技术方案') && !content.includes('## 数据模型') && !content.includes('## API 契约')) {
            return false;
          }
        } catch { return false; }
      }
      return true;
    },
    description: '三队 Spec 必须全部存在且包含技术方案/数据模型/API契约',
  },
  'gate-4': {
    id: 'gate-4',
    phase: 'phase-4',
    name: '人类决策',
    verify() {
      return fs.existsSync(path.join(ROOT, 'docs', 'spec.md'));
    },
    description: 'docs/spec.md 必须已生成（用户已选择队伍）',
  },
  'gate-4.5': {
    id: 'gate-4.5',
    phase: 'phase-4.5',
    name: 'SDD 任务拆分',
    verify() {
      const tasksDir = path.join(ROOT, 'docs', 'tasks');
      const progressMd = path.join(tasksDir, 'progress.md');
      return fs.existsSync(tasksDir) && fs.existsSync(progressMd);
    },
    description: 'docs/tasks/ 目录和 progress.md 必须存在',
  },
  'gate-5': {
    id: 'gate-5',
    phase: 'phase-5',
    name: 'TDD + 编译 + 浏览器',
    verify() {
      // 检查是否有物化的测试报告
      const testReports = findFiles(ROOT, /-\d{2}-test-report\.md$/, 2);
      const buildReports = findFiles(ROOT, /-\d{2}-build-report\.md$/, 2);
      const browserReports = findFiles(ROOT, /-\d{2}-browser-report\.md$/, 2);
      return testReports.length > 0 && buildReports.length > 0 && browserReports.length > 0;
    },
    description: '必须存在 TDD 报告 + 编译报告 + 浏览器测试报告',
  },
  'gate-6': {
    id: 'gate-6',
    phase: 'phase-6',
    name: '暗门注释注入',
    verify() {
      const report = path.join(ROOT, 'annotate-validation-report.md');
      if (fs.existsSync(report)) {
        try {
          const content = fs.readFileSync(report, 'utf8');
          return !content.includes('FAILED') && !content.includes('X]');
        } catch { return false; }
      }
      return existsAny(/dashboard\.html$/);
    },
    description: 'annotate-validation-report.md 必须通过',
  },
};

// ─── Skill → 需要的 Gate ────────────────────────────────────────────
// "加载某个 Skill 前，必须通过哪个 Gate"
const SKILL_GATE_REQUIREMENTS = {
  'kf-prd-generator': { requiresGate: 'gate-1', phase: 'phase-2' },
  'kf-spec':           { requiresGate: 'gate-2', phase: 'phase-3' },
  'kf-sdd':            { requiresGate: 'gate-4', phase: 'phase-4.5' },
  'kf-browser-ops':    { requiresGate: 'gate-2.5', phase: 'phase-5' },
  'kf-annotate':       { requiresGate: 'gate-5', phase: 'phase-6' },
};

// ─── 始终允许加载的 Skill（不受门禁约束） ───
const ALWAYS_ALLOWED = new Set([
  'kf-go', 'kf-model-router', 'kf-alignment', 'kf-web-search',
  'kf-mvp',  // kf-mvp 本身是入口，不做门禁
  'kf-scrapling', 'kf-opencli', 'kf-exa-code',
  'kf-code-review-graph', 'kf-skill-design-expert',
  'kf-add-skill', 'kf-brainstorm', 'kf-grant-research',
]);

// ─── Helpers ───────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback || {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback || {}; }
}

function writeJSON(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function existsAny(pattern, maxDepth = 3) {
  try {
    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (entry.isFile() && pattern.test(entry.name)) return true;
      if (entry.isDirectory() && maxDepth > 0 && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const subDir = path.join(ROOT, entry.name);
        try {
          for (const f of fs.readdirSync(subDir)) {
            if (pattern.test(f)) return true;
          }
        } catch {}
        maxDepth--;
      }
    }
  } catch {}
  return false;
}

function findFiles(dir, pattern, maxDepth) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && pattern.test(entry.name)) results.push(path.join(dir, entry.name));
      else if (entry.isDirectory() && maxDepth > 0 && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...findFiles(path.join(dir, entry.name), pattern, maxDepth - 1));
      }
    }
  } catch {}
  return results;
}

function readStdinSync(timeoutMs = 3000) {
  if (process.stdin.isTTY) return '';
  try {
    const chunks = [];
    const buf = Buffer.alloc(65536);
    let total = 0;
    const deadline = Date.now() + timeoutMs;
    while (total < buf.length && Date.now() < deadline) {
      try {
        const n = fs.readSync(0, buf, total, buf.length - total, total);
        if (n === 0) break;
        total += n;
      } catch (e) {
        if (e.code === 'EAGAIN') break;
        break;
      }
    }
    return buf.toString('utf8', 0, total);
  } catch { return ''; }
}

function getSkillNameFromHookData(hookData) {
  // Claude Code hook format
  const toolInput = hookData.tool_input || hookData.toolInput || {};
  return toolInput.skill || hookData.skill || hookData.args?.skill || '';
}

function isPipelineActive() {
  return !!(process.env.MVP_SESSION_ID || process.env.MVP_PIPELINE_ACTIVE);
}

// ─── 进度状态管理 ────────────────────────────────────────────────

function getCurrentState() {
  return readJSON(CURRENT_PHASE_FILE, {
    currentPhase: 'phase-0',
    gatePassed: {},
    artifactsProduced: [],
    startedAt: null,
    pipelineActive: false,
  });
}

function saveState(state) {
  ensureDir(STATE_DIR);
  writeJSON(CURRENT_PHASE_FILE, state);
}

function updateGateStatus(state, gateId, passed) {
  state.gatePassed = state.gatePassed || {};
  state.gatePassed[gateId] = {
    passed,
    verifiedAt: new Date().toISOString(),
  };

  // 如果通过，自动推进 Phase
  if (passed) {
    const gate = GATES[gateId];
    if (gate && !state.gatePassed[`next-${gateId}`]) {
      state.currentPhase = gate.phase;
    }
  }

  saveState(state);
}

// ─── 主流程 ─────────────────────────────────────────────────────────

function main() {
  const stdinRaw = readStdinSync(3000);
  let hookData = {};
  try {
    if (stdinRaw.trim()) hookData = JSON.parse(stdinRaw);
  } catch { /* ignore parse errors */ }

  const skillName = getSkillNameFromHookData(hookData);

  if (!skillName) {
    process.exit(0); // 无 skill → 放行
  }

  // ── 始终允许加载的技能 ──
  if (ALWAYS_ALLOWED.has(skillName)) {
    process.exit(0);
  }

  // ── 检查是否有管线下文 ──
  if (!isPipelineActive()) {
    // 无管线下文，不做门禁约束（独立调用场景）
    process.exit(0);
  }

  // ── 查找该 Skill 需要的 Gate ──
  const requirement = SKILL_GATE_REQUIREMENTS[skillName];
  if (!requirement) {
    // 不在已知映射表中 → 放行
    process.exit(0);
  }

  const requiredGateId = requirement.requiresGate;
  const gate = GATES[requiredGateId];

  if (!gate) {
    // Gate 定义缺失（如 gate-2.5）→ 放行但警告
    console.error(`[gate-keeper] WARN: Gate "${requiredGateId}" not defined, allowing ${skillName}`);
    process.exit(0);
  }

  // ── 检查 Gate 状态 ──
  const state = getCurrentState();

  // 如果已缓存通过状态，直接放行
  if (state.gatePassed[requiredGateId]?.passed) {
    process.exit(0);
  }

  // ── 执行 Gate 验证 ──
  const passed = gate.verify();

  if (passed) {
    updateGateStatus(state, requiredGateId, true);
    console.error(`[gate-keeper] ${requiredGateId} passed → allowing ${skillName}`);
    process.exit(0);
  }

  // ── 门禁未通过 → 阻止 ──
  console.error(`[gate-keeper] BLOCKED: ${skillName} requires ${requiredGateId} (${gate.name})`);
  console.error(`[gate-keeper] Reason: ${gate.description}`);
  console.error(`[gate-keeper] Hint: 请先完成上一阶段并通过对应 Gate，或运行: node .claude/helpers/harness-gate-check.cjs --stage ${gate.phase}`);

  // 记录被阻止的尝试
  try {
    const blockLog = readJSON(path.join(STATE_DIR, '.blocked-skills.json'), []);
    blockLog.push({
      time: new Date().toISOString(),
      skill: skillName,
      requiredGate: requiredGateId,
      reason: gate.description,
    });
    writeJSON(path.join(STATE_DIR, '.blocked-skills.json'), blockLog.slice(-20));
  } catch {}

  process.exit(1);
}

main();
