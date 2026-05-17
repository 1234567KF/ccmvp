#!/usr/bin/env node
/**
 * artifact-tracker.cjs — Claude Code Hook: 产物自动登记 + 冲突检测
 *
 * 挂载点: PostToolUse(Write|Edit)
 * 职责:
 *   1. 每次写入后自动记录文件路径到 .claude-flow/mvp-state/.artifacts.json
 *   2. 检测同一文件是否被不同 Agent 写入（冲突告警）
 *   3. 检测关键产物文件是否被写入（自动触发 Gate 扫描委托 phase-tracker）
 *   4. 检测 progress.md 是否被更新（同步更新 .progress.json）
 *   5. 支持 --list 和 --conflicts 查询
 *
 * 设计原则: 每次记录 < 500ms，不阻塞编辑流。
 *
 * 退出码: 始终 0（此 Hook 不阻断，仅记录）
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const STATE_DIR = path.join(ROOT, '.claude-flow', 'mvp-state');
const ARTIFACTS_FILE = path.join(STATE_DIR, '.artifacts.json');
const PROGRESS_FILE = path.join(STATE_DIR, '.progress.json');
const CURRENT_PHASE_FILE = path.join(STATE_DIR, '.current-phase.json');

// ─── 关键产物文件清单（写入后会触发 Gate 检查扫描） ───
const GATE_ARTIFACTS = [
  'docs/tech-stack-confirmed.md',
  'red-00-alignment.md', 'blue-00-alignment.md', 'green-00-alignment.md',
  'docs/prd.md',
  'red-spec.md', 'blue-spec.md', 'green-spec.md',
  'docs/spec.md',
  'docs/tasks/progress.md',
  'docs/USAGE.md',
  'annotate-validation-report.md',
];

// ─── 已知模块任务文件 → 对应 progress.md checklist 行 ───
const MODULE_TASK_PATTERN = /^docs\/tasks\/(.+)\.md$/;

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

function relativeToRoot(filePath) {
  if (!filePath) return '';
  return path.relative(ROOT, path.resolve(ROOT, filePath)).replace(/\\/g, '/');
}

function readStdinSync(timeoutMs = 2000) {
  if (process.stdin.isTTY) return '';
  try {
    const buf = Buffer.alloc(32768);
    let total = 0;
    const deadline = Date.now() + timeoutMs;
    while (total < buf.length && Date.now() < deadline) {
      try {
        const n = fs.readSync(0, buf, total, buf.length - total, total);
        if (n === 0) break;
        total += n;
      } catch { break; }
    }
    return buf.toString('utf8', 0, total);
  } catch { return ''; }
}

function now() { return new Date().toISOString(); }

function getAgentId(hookData) {
  return process.env.MVP_AGENT_NAME
    || process.env.CLAUDE_FLOW_AGENT_NAME
    || process.env.MVP_TEAM_COLOR
    || 'unknown';
}

// ─── Artifact 记录 ──────────────────────────────────────────────────

function recordFile(filePath, agentId, hookData = {}) {
  const artifacts = readJSON(ARTIFACTS_FILE, {
    files: [],
    agents: {},
    conflicts: [],
    summary: { totalWrites: 0, lastWrite: null },
  });

  const rel = relativeToRoot(filePath);
  if (!rel) return artifacts;

  // ── 记录 ──
  const entry = {
    file: rel,
    agent: agentId,
    tool: hookData.tool_name || 'Write',
    time: now(),
    size: getFileSize(path.resolve(ROOT, rel)),
  };

  artifacts.files.push(entry);
  artifacts.summary.totalWrites = (artifacts.summary.totalWrites || 0) + 1;
  artifacts.summary.lastWrite = now();

  // ── Agent 统计 ──
  artifacts.agents = artifacts.agents || {};
  artifacts.agents[agentId] = artifacts.agents[agentId] || { writeCount: 0, files: [] };
  artifacts.agents[agentId].writeCount++;
  if (!artifacts.agents[agentId].files.includes(rel)) {
    artifacts.agents[agentId].files.push(rel);
  }

  // ── 冲突检测: 同一文件被不同 Agent 写入 ──
  const otherAgents = artifacts.files
    .filter(f => f.file === rel && f.agent !== agentId)
    .map(f => f.agent);

  if (otherAgents.length > 0) {
    const conflict = {
      file: rel,
      agents: [...new Set([...otherAgents, agentId])],
      detectedAt: now(),
    };
    // 去重
    const exists = (artifacts.conflicts || []).some(c => c.file === rel
      && JSON.stringify(c.agents.sort()) === JSON.stringify(conflict.agents.sort()));
    if (!exists) {
      artifacts.conflicts = artifacts.conflicts || [];
      artifacts.conflicts.push(conflict);
      console.error(`[artifact-tracker] CONFLICT: ${rel} written by ${conflict.agents.join(', ')}`);
    }
  }

  // 只保留最近 200 条记录
  if (artifacts.files.length > 200) {
    artifacts.files = artifacts.files.slice(-200);
  }

  writeJSON(ARTIFACTS_FILE, artifacts);
  return artifacts;
}

function getFileSize(absPath) {
  try { return fs.statSync(absPath).size; }
  catch { return 0; }
}

// ─── progress.md 同步 ───────────────────────────────────────────────

/**
 * 如果写入的是 progress.md 或 tasks/<module>.md，
 * 尝试解析 checklist 状态，更新 .progress.json 镜像。
 */
function syncProgress(filePath) {
  const rel = relativeToRoot(filePath);
  if (!rel) return;

  // 处理 progress.md
  if (rel === 'docs/tasks/progress.md') {
    try {
      const content = fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
      const progress = parseProgressChecklist(content);
      writeJSON(PROGRESS_FILE, progress);
    } catch {}
  }

  // 处理 tasks/<module>.md
  const moduleMatch = rel.match(MODULE_TASK_PATTERN);
  if (moduleMatch) {
    try {
      const content = fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
      const moduleProgress = parseModuleChecklist(moduleMatch[1], content);
      const current = readJSON(PROGRESS_FILE, { modules: {} });
      current.modules = current.modules || {};
      current.modules[moduleMatch[1]] = moduleProgress;
      writeJSON(PROGRESS_FILE, current);
    } catch {}
  }
}

function parseProgressChecklist(content) {
  const modules = {};
  const regex = /- \[(.)\] (.+?) — (\d+) 个子任务 — 预估 (.+?) — 🔗 依赖：(.+?) — 📎 (.+)?/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    modules[match[2]] = {
      status: match[1] === 'x' ? 'done' : match[1] === '~' ? 'in_progress' : 'pending',
      subtaskCount: parseInt(match[3]),
      estimated: match[4],
      dependency: match[5].trim(),
      link: match[6] || null,
    };
  }
  return { modules, syncedAt: now() };
}

function parseModuleChecklist(name, content) {
  const tasks = [];
  const regex = /- \[(.)\] (T\d+): (.+?) — 预估 (.+?) — 产出 `(.+?)`/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tasks.push({
      id: match[2],
      status: match[1] === 'x' ? 'done' : 'pending',
      description: match[3],
      estimated: match[4],
      output: match[5],
    });
  }
  return { name, tasks, syncedAt: now() };
}

// ─── Gate artifact 检测 ─────────────────────────────────────────────

function isGateArtifact(filePath) {
  const rel = relativeToRoot(filePath);
  return GATE_ARTIFACTS.some(a => rel === a || rel.endsWith(a));
}

// ─── CLI 查询模式 ───────────────────────────────────────────────────

function listArtifacts(args) {
  const artifacts = readJSON(ARTIFACTS_FILE, { files: [], conflicts: [] });
  const phase = args.includes('--phase') ? args[args.indexOf('--phase') + 1] : null;
  const team = args.includes('--team') ? args[args.indexOf('--team') + 1] : null;

  let files = artifacts.files || [];
  if (phase) {
    files = files.filter(f => f.file.includes(`phase-${phase}`) || f.file.includes(`-${phase}-`));
  }
  if (team) {
    files = files.filter(f => f.agent === team || f.agent.startsWith(team));
  }

  console.log(JSON.stringify({
    total: files.length,
    writes: artifacts.summary?.totalWrites || 0,
    conflicts: artifacts.conflicts || [],
    recent: files.slice(-30),
  }, null, 2));
}

function listConflicts() {
  const artifacts = readJSON(ARTIFACTS_FILE, { files: [], conflicts: [] });
  if ((artifacts.conflicts || []).length === 0) {
    console.log(JSON.stringify({ conflicts: [], message: 'No conflicts detected' }, null, 2));
    return;
  }
  console.log(JSON.stringify({ conflicts: artifacts.conflicts }, null, 2));
}

// ─── 主流程 ─────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  // CLI 查询模式
  if (args.includes('--list') || args.includes('list')) {
    listArtifacts(args);
    return;
  }
  if (args.includes('--conflicts') || args.includes('conflicts')) {
    listConflicts();
    return;
  }

  // ── Hook 模式 ──
  const stdinRaw = readStdinSync(2000);
  let hookData = {};
  try {
    if (stdinRaw.trim()) hookData = JSON.parse(stdinRaw);
  } catch {}

  const toolInput = hookData.tool_input || hookData.toolInput || {};
  let filePath = toolInput.file_path || toolInput.filePath || hookData.file_path || hookData.filePath || '';

  // 多个文件（MultiEdit 场景）
  if (!filePath && toolInput.edits) {
    // edits = [{file_path: ..., ...}, ...]
    const edits = Array.isArray(toolInput.edits) ? toolInput.edits : [];
    if (edits.length === 1) filePath = edits[0].file_path || edits[0].filePath || '';
    else {
      for (const edit of edits) {
        const fp = edit.file_path || edit.filePath || '';
        if (fp) recordFile(fp, getAgentId(hookData), hookData);
      }
      process.exit(0);
    }
  }

  if (!filePath) {
    process.exit(0);
  }

  const agentId = getAgentId(hookData);

  // ── 记录 ──
  recordFile(filePath, agentId, hookData);

  // ── 同步 progress ──
  syncProgress(filePath);

  // ── Gate artifact 触发标记 ──
  if (isGateArtifact(filePath)) {
    const state = readJSON(CURRENT_PHASE_FILE, { gateArtifactHits: [] });
    state.gateArtifactHits = state.gateArtifactHits || [];
    const rel = relativeToRoot(filePath);
    if (!state.gateArtifactHits.includes(rel)) {
      state.gateArtifactHits.push(rel);
      writeJSON(CURRENT_PHASE_FILE, state);
    }
    console.error(`[artifact-tracker] Gate artifact written: ${rel}`);
  }

  process.exit(0);
}

main();
