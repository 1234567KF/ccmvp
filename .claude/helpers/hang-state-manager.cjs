#!/usr/bin/env node
/**
 * hang-state-manager.cjs — MVP 执行状态持久化管理器（通用 IDE 串行适配版）
 *
 * 实现 P0.6 深度选择 + P0.7 进展看板。
 * 管理 .claude-flow/hang-state.json 的生命周期。
 *
 * 【通用 IDE 适配说明】
 * 原 Claude Code 版配合真并发 Agent 使用，本版适配串行模式：
 * - 状态文件仍按红/蓝/绿三队结构记录，但三队串行依次执行
 * - 看板显示当前执行中的队 + 已完成队的状态
 * - 中断恢复支持串行断点续传（从当前队当前 Stage 继续）
 * - handoff.md 生成逻辑不变，仍用于跨会话恢复
 *
 * 用法:
 *   node {IDE_ROOT}/helpers/hang-state-manager.cjs --init "任务名" --depth C
 *   node {IDE_ROOT}/helpers/hang-state-manager.cjs --phase stage-1 --stage coding
 *   node {IDE_ROOT}/helpers/hang-state-manager.cjs --team-progress red stage-2 70
 *   node {IDE_ROOT}/helpers/hang-state-manager.cjs --artifact alignment docs/red-00-alignment.md
 *   node {IDE_ROOT}/helpers/hang-state-manager.cjs --dashboard
 *   node {IDE_ROOT}/helpers/hang-state-manager.cjs --recovery
 *   node {IDE_ROOT}/helpers/hang-state-manager.cjs --status
 *   node {IDE_ROOT}/helpers/hang-state-manager.cjs --complete
 *   node {IDE_ROOT}/helpers/hang-state-manager.cjs --handoff
 *
 * API:
 *   const hang = require('./hang-state-manager.cjs');
 *   hang.init(taskName, depth) → state
 *   hang.dashboard() → string
 *   hang.recoveryOptions() → { needed, board }
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const STATE_FILE = path.join(ROOT, '.claude-flow', 'hang-state.json');
const HANDOFF_FILE = path.join(ROOT, '.claude-flow', 'hang-handoff.md');

const VALID_DEPTHS = ['A', 'B', 'C'];
const DEPTH_LABELS = { A: '需求分析+方案评审', B: '需求+设计', C: '全流程编码交付' };
const DEPTH_STAGES = {
  A: ['alignment', 'planning', 'done'],
  B: ['alignment', 'architecture', 'done'],
  C: ['alignment', 'architecture', 'coding', 'testing', 'review', 'done'],
};

const PHASE_LABELS = {
  alignment: '需求对齐',
  architecture: '架构设计',
  coding: '编码',
  testing: '测试',
  review: '审查',
  done: '完成',
};

// ─── SOP 26步定义 ───
const SOP_STEPS = [
  { num: 1, phase: "需求设计", role: "human", platform: "PC", op: "需求采集", output: "需求记录文档" },
  { num: 2, phase: "需求设计", role: "human", platform: "PC", op: "问题确认", output: "需求确认表格" },
  { num: 3, phase: "需求设计", role: "agent", platform: "IDE", op: "原型制作", output: "PRD" },
  { num: 4, phase: "需求设计", role: "agent", platform: "IDE", op: "原型制作", output: "原型" },
  { num: 5, phase: "需求设计", role: "human", platform: "PC", op: "需求确认", output: "需求确认记录" },
  { num: 6, phase: "需求设计", role: "human", platform: "PC", op: "需求宣讲", output: "会议问题记录" },
  { num: 7, phase: "需求设计", role: "agent", platform: "IDE", op: "原型注释追加", output: "原型注释+补充意见.md" },
  { num: 8, phase: "需求设计", role: "human", platform: "PC", op: "需求问题梳理", output: "PRD问题及提案" },
  { num: 9, phase: "需求设计", role: "human", platform: "PC", op: "人类问题方案汇总澄清", output: "PRD审定汇总意见" },
  { num: 10, phase: "需求设计", role: "human", platform: "PC", op: "人机澄清审定需求", output: "审定版PRD" },
  { num: 11, phase: "需求设计", role: "agent", platform: "IDE", op: "按存量代码生成wiki", output: "wiki及原始spec" },
  { num: 12, phase: "需求设计", role: "agent", platform: "IDE", op: "按PRD产生spec", output: "spec初版" },
  { num: 13, phase: "需求设计", role: "human", platform: "PC", op: "设计问题梳理", output: "spec问题及提案" },
  { num: 14, phase: "需求设计", role: "human", platform: "PC", op: "人类问题方案汇总澄清", output: "spec审定汇总意见" },
  { num: 15, phase: "需求设计", role: "agent", platform: "IDE", op: "按汇总意见生成定版spec", output: "审定版spec" },
  { num: 16, phase: "实现阶段", role: "agent", platform: "IDE", op: "测试用例设计", output: "测试文档" },
  { num: 17, phase: "实现阶段", role: "human", platform: "PC", op: "用例评审", output: "测试文档定版" },
  { num: 18, phase: "实现阶段", role: "agent", platform: "IDE", op: "测试脚本开发", output: "脚本" },
  { num: 19, phase: "实现阶段", role: "agent", platform: "IDE", op: "功能开发", output: "代码" },
  { num: 20, phase: "实现阶段", role: "agent", platform: "IDE", op: "codereview", output: "review记录" },
  { num: 21, phase: "实现阶段", role: "agent", platform: "IDE", op: "自动测试执行", output: "测试报告" },
  { num: 22, phase: "实现阶段", role: "agent", platform: "IDE", op: "checklist门控", output: "门控记录" },
  { num: 23, phase: "实现阶段", role: "agent", platform: "IDE", op: "产生使用手册", output: "使用手册" },
  { num: 24, phase: "实现阶段", role: "human", platform: "PC", op: "人类验收", output: "issue/变更" },
  { num: 25, phase: "实现阶段", role: "human", platform: "PC", op: "产品定版", output: "定版文档及代码" },
  { num: 26, phase: "实现阶段", role: "agent", platform: "IDE", op: "回写wiki及变动日志", output: "wiki更新" }
];

const DEPTH_MAP = {
  prototype: { maxStep: 4, label: "仅原型+PRD草稿" },
  prd: { maxStep: 10, label: "完成需求审定" },
  spec: { maxStep: 15, label: "完成技术设计" },
  mvp: { maxStep: 22, label: "最小可用产品" },
  full: { maxStep: 26, label: "TDD端到端完整交付" }
};

// ─── Ensure directory ───
function ensureDir() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Gate Log (Hardened Audit Trail) ───
const GATE_LOG_PATH = path.join(ROOT, '.claude-flow', 'gate-log.txt');

function gateLog({ team, stage, result, details }) {
  const dir = path.dirname(GATE_LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString();
  const line = `${timestamp} | hang-state | ${stage || '-'} | ${team || '-'} | ${result} | ${details || ''}\n`;
  fs.appendFileSync(GATE_LOG_PATH, line, 'utf8');
  return { ok: true };
}

function verifyGatePassed(team, stage) {
  if (!fs.existsSync(GATE_LOG_PATH)) return false;
  try {
    const content = fs.readFileSync(GATE_LOG_PATH, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    // Search backwards for most recent entry matching team+stage
    for (let i = lines.length - 1; i >= 0; i--) {
      const parts = lines[i].split(' | ');
      if (parts.length >= 5) {
        const logTeam = parts[3];
        const logStage = parts[2];
        const logResult = parts[4];
        if (logTeam === team && logStage === stage && (logResult === 'PASSED' || logResult === 'PASSED_SOFT')) {
          return true;
        }
        if (logTeam === team && logStage === stage && logResult === 'FAILED') {
          return false;
        }
      }
    }
  } catch (_) {}
  return false;
}

// ─── Read current state ───
function getState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// ─── Write state (atomic — transactional) ───
function writeState(state) {
  ensureDir();
  state.last_updated = new Date().toISOString();
  const tmpFile = STATE_FILE + '.tmp';
  const bakFile = STATE_FILE + '.bak';
  
  try {
    // 1. Write to temp file first
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
    
    // 2. Backup existing state (if any)
    if (fs.existsSync(STATE_FILE)) {
      try { fs.copyFileSync(STATE_FILE, bakFile); } catch (_) {}
    }
    
    // 3. Atomic rename
    fs.renameSync(tmpFile, STATE_FILE);
    
    // 4. Clean up backup on success
    try { if (fs.existsSync(bakFile)) fs.unlinkSync(bakFile); } catch (_) {}
  } catch (e) {
    // Recovery: try to restore from backup
    if (fs.existsSync(bakFile)) {
      try { fs.copyFileSync(bakFile, STATE_FILE); } catch (_) {}
    }
    throw e;
  } finally {
    // Clean up temp file
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
  }
  
  return state;
}

// ─── Recover from corrupt state ───
function recoverState() {
  const tmpFile = STATE_FILE + '.tmp';
  const bakFile = STATE_FILE + '.bak';
  
  // Try .tmp first (most recent), then .bak
  for (const src of [tmpFile, bakFile]) {
    if (fs.existsSync(src)) {
      try {
        const data = JSON.parse(fs.readFileSync(src, 'utf8'));
        writeState(data);
        return { ok: true, recovered: true, source: path.basename(src) };
      } catch (_) {}
    }
  }
  return { ok: false, recovered: false };
}

// ─── Init new hang session ───
function init(taskName, depth) {
  if (!VALID_DEPTHS.includes(depth)) {
    return { ok: false, error: `无效深度: ${depth}。有效值: ${VALID_DEPTHS.join(', ')}` };
  }

  const state = {
    depth,
    depth_label: DEPTH_LABELS[depth],
    task_name: taskName,
    current_phase: 'alignment',
    current_stage: 'stage_0',
    completed_phases: [],
    phases: DEPTH_STAGES[depth],
    team_progress: {
      red: { stage: 'stage_0', percent: 0, completed_stages: {} },
      blue: { stage: 'stage_0', percent: 0, completed_stages: {} },
      green: { stage: 'stage_0', percent: 0, completed_stages: {} },
    },
    artifacts: {},
    show_dashboard: true,
    execution_mode: 'serial', // 'serial' | 'concurrent' (Qoder)
    ide: null,                // 'claude-code' / 'qoder' / 'cursor' / 'trae' / ...
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };

  writeState(state);
  return { ok: true, state };
}

// ─── Update current phase ───
function updatePhase(phase, stage) {
  const state = getState();
  if (!state) return { ok: false, error: 'MVP: No active session. Run --init first.' };

  // Mark previous phase as completed if different
  if (phase !== state.current_phase && state.current_phase) {
    if (!state.completed_phases.includes(state.current_phase)) {
      state.completed_phases.push(state.current_phase);
    }
  }

  state.current_phase = phase;
  if (stage) state.current_stage = stage;
  writeState(state);
  return { ok: true, state };
}

// ─── Update team progress ───
function updateTeamProgress(team, stage, percent) {
  const state = getState();
  if (!state) return { ok: false, error: 'MVP: No active session. Run --init first.' };
  if (!['red', 'blue', 'green'].includes(team)) {
    return { ok: false, error: `无效队伍: ${team}。有效值: red, blue, green` };
  }

  state.team_progress[team] = { stage: stage || state.team_progress[team].stage, percent, completed_stages: state.team_progress[team].completed_stages || {} };
  writeState(state);
  return { ok: true, state };
}

// ─── Stage Completion (Idempotency) ───
function markStageComplete(team, stage, checksum) {
  const state = getState();
  if (!state) return { ok: false, error: 'MVP: No active session. Run --init first.' };
  if (!['red', 'blue', 'green'].includes(team)) {
    return { ok: false, error: `Invalid team: ${team}. Valid: red, blue, green` };
  }

  if (!state.team_progress[team]) {
    state.team_progress[team] = { stage: 'stage_0', percent: 0, completed_stages: {} };
  }
  if (!state.team_progress[team].completed_stages) {
    state.team_progress[team].completed_stages = {};
  }

  state.team_progress[team].completed_stages[stage] = {
    completed_at: new Date().toISOString(),
    checksum: checksum || null,
    verified_by: checksum ? 'harness-gate-check' : 'hang-state-manager',
  };

  writeState(state);
  
  // Also log to gate audit
  gateLog({ team, stage, result: 'COMPLETED', details: checksum ? `checksum=${checksum}` : 'no checksum' });
  
  return { ok: true, state };
}

function isStageComplete(team, stage) {
  const state = getState();
  if (!state) return false;
  if (!state.team_progress[team]) return false;
  const completed = state.team_progress[team].completed_stages || {};
  return !!completed[stage];
}

// ─── Add artifact reference ───
function addArtifact(key, filePath) {
  const state = getState();
  if (!state) return { ok: false, error: 'MVP: No active session. Run --init first.' };

  state.artifacts[key] = filePath;
  writeState(state);
  return { ok: true, state };
}

// ─── Set dashboard visibility ───
function setDashboard(show) {
  const state = getState();
  if (!state) return { ok: false, error: 'MVP: No active session. Run --init first.' };

  state.show_dashboard = show;
  writeState(state);
  return { ok: true, state };
}

// ─── Mark session complete ───
function complete() {
  const state = getState();
  if (!state) return { ok: false, error: 'MVP: No active session.' };

  state.current_phase = 'done';
  state.current_stage = 'done';
  if (!state.completed_phases.includes(state.current_phase)) {
    state.completed_phases.push(state.current_phase);
  }
  state.completed_at = new Date().toISOString();
  writeState(state);
  return { ok: true, state };
}

// ─── Sync progress from state files ───
function syncFromState() {
  const state = getState();
  if (!state) return { ok: false, error: 'MVP: No active session. Run --init first.' };

  const mvpStatusFile = path.join(ROOT, '.claude-flow', 'mvp-state', '.mvp-status.json');
  if (!fs.existsSync(mvpStatusFile)) {
    return { ok: false, error: 'No MVP state found. Start Phase 2 first.' };
  }

  try {
    const stateData = JSON.parse(fs.readFileSync(mvpStatusFile, 'utf8'));

    // Calculate team progress from completed/failed lists
    const completedByTeam = {};
    const failedByTeam = {};
    const totalByTeam = {};
    const teams = ['red', 'blue', 'green'];

    for (const team of teams) {
      completedByTeam[team] = 0;
      failedByTeam[team] = 0;
      totalByTeam[team] = 0;
    }

    // Count completed agents by team
    if (stateData.completed) {
      for (const agent of stateData.completed) {
        const team = agent.team;
        if (teams.includes(team)) completedByTeam[team]++;
      }
    }

    // Count failed agents by team
    if (stateData.failed) {
      for (const agent of stateData.failed) {
        const team = agent.team;
        if (teams.includes(team)) failedByTeam[team]++;
      }
    }

    // Count total agents for each team
    // Auto-infer total from batches or use completed+failed+running
    const allAgents = [
      ...(stateData.completed || []),
      ...(stateData.failed || []),
      ...(stateData.running_agents || []).map(id => {
        const parts = id.split('/');
        return { team: parts[0] || 'unknown' };
      })
    ];
    for (const agent of allAgents) {
      const team = agent.team;
      if (teams.includes(team)) totalByTeam[team]++;
    }

    // Fallback: if no agent-level counts, use total_agents equally distributed
    const hasAgentData = Object.values(totalByTeam).some(v => v > 0);
    if (!hasAgentData && stateData.total_agents) {
      const perTeam = Math.ceil(stateData.total_agents / 3);
      for (const team of teams) totalByTeam[team] = perTeam;
    }

    for (const team of teams) {
      const total = totalByTeam[team] || 1;
      const done = completedByTeam[team] || 0;
      const failed = failedByTeam[team] || 0;

      let percent = Math.round(((done * 100) + (failed * 50)) / total);

      state.team_progress[team] = {
        stage: state.current_stage || 'stage_0',
        percent: Math.min(100, Math.max(0, percent))
      };
    }

    // Update session-level stats
    if (stateData.completed_agents !== undefined) {
      state.completed_agents = stateData.completed_agents;
    }
    if (stateData.failed_agents !== undefined) {
      state.failed_agents = stateData.failed_agents;
    }
    if (stateData.total_agents !== undefined) {
      state.total_agents = stateData.total_agents;
    }
    state.session_id = stateData.session_id || state.session_id;

    writeState(state);
    return { ok: true, state };
  } catch (err) {
    return { ok: false, error: `Failed to sync MVP state: ${err.message}` };
  }
}

// ─── Sync from state file and force display ───
function syncAndShow() {
  const syncResult = syncFromState();
  const board = dashboard();
  return { sync: syncResult, board };
}

// ─── Check if recovery is needed ───
function isRecoveryNeeded() {
  const state = getState();
  if (!state) return false;
  if (state.current_phase === 'done' || state.current_stage === 'done') return false;
  return true;
}

// ─── Get session context stats ───
function getContextStats() {
  // Try multiple possible paths for session-cost.json
  const possiblePaths = [
    path.join(ROOT, '监测者', 'monitor', '.claude', 'session-cost.json'),
    path.join(ROOT, '.claude', 'session-cost.json'),
  ];

  let sessionData = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        sessionData = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
      } catch { /* try next */ }
    }
  }

  if (!sessionData) return null;

  const inputTokens = sessionData.input_tokens || 0;
  const outputTokens = sessionData.output_tokens || 0;
  const cacheRead = sessionData.cache_read_tokens || 0;
  const apiCalls = sessionData.api_calls || 0;

  // Compute derived stats
  const totalTokens = inputTokens + outputTokens;
  const cacheHitRate = (inputTokens + cacheRead) > 0
    ? Math.round((cacheRead / (inputTokens + cacheRead)) * 100)
    : 0;

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read: cacheRead,
    cache_hit_rate: cacheHitRate,
    api_calls: apiCalls,
    total_tokens: totalTokens,
    model: sessionData.model || 'unknown',
  };
}

// ─── Progress bar (ASCII) ───
function progressBar(percent, width) {
  const w = width || 16;
  const filled = Math.round((percent / 100) * w);
  const empty = w - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${percent}%`;
}

// ─── Generate progress dashboard ───
// ─── Set execution mode (serial | concurrent) ───
function setConcurrentMode(ide) {
  const state = getState();
  if (!state) return { ok: false, error: 'MVP: No active session. Run --init first.' };
  state.execution_mode = 'concurrent';
  state.ide = ide || state.ide || 'qoder';
  writeState(state);
  return { ok: true, state };
}

function setSerialMode() {
  const state = getState();
  if (!state) return { ok: false, error: 'MVP: No active session. Run --init first.' };
  state.execution_mode = 'serial';
  writeState(state);
  return { ok: true, state };
}

// ─── Generate concurrent side-by-side dashboard ───
function concurrentDashboard() {
  const state = getState();
  if (!state) return '⚠️ 无活跃的MVP会话。请先触发 /mvp [任务]。';

  const lines = [];
  const W = 72;
  const COL_W = 20; // 每列宽度

  lines.push(`┌${'─'.repeat(W - 2)}┐`);
  const title = state.execution_mode === 'concurrent'
    ? `MVP Claude Code 并发看板 (3路并行)`
    : `MVP 并排看板`;
  lines.push(`│  ${title.padEnd(W - 4)}│`);
  lines.push(`│${' '.repeat(W - 2)}│`);

  const taskLine = `  任务: ${(state.task_name || '未命名').substring(0, W - 10)}`;
  lines.push(`│${taskLine.padEnd(W - 2)}│`);

  const modeLabel = state.execution_mode === 'concurrent' ? '并发' : '串行';
  const ideLabel = state.ide ? ` @ ${state.ide}` : '';
  const depthLine = `  深度: ${state.depth} (${state.depth_label || ''})    模式: ${modeLabel}${ideLabel}`;
  lines.push(`│${depthLine.padEnd(W - 2)}│`);
  lines.push(`│${' '.repeat(W - 2)}│`);

  // 并排题头
  const header = `    红队              蓝队              绿队`;
  lines.push(`│${header.padEnd(W - 2)}│`);

  // 进度条并排
  const teams = ['red', 'blue', 'green'];
  const progress = state.team_progress || {};
  const bars = teams.map(t => {
    const p = progress[t] || { percent: 0, stage: 'stage_0' };
    return { bar: progressBar(p.percent || 0, 12), pct: p.percent || 0, stage: p.stage || 'stage_0' };
  });
  const barLine = `    ${bars[0].bar} ${String(bars[0].pct).padStart(3)}%  ${bars[1].bar} ${String(bars[1].pct).padStart(3)}%  ${bars[2].bar} ${String(bars[2].pct).padStart(3)}%`;
  lines.push(`│${barLine.padEnd(W - 2)}│`);
  const stageLine = `    ${bars[0].stage.padEnd(15)} ${bars[1].stage.padEnd(15)} ${bars[2].stage.padEnd(15)}`;
  lines.push(`│${stageLine.padEnd(W - 2)}│`);
  lines.push(`│${' '.repeat(W - 2)}│`);

  // 各阶段各队状态 (stage 0-5)
  const STAGE_ICONS = { done: '✅', running: '🔄', pending: '⏳' };
  const stages = ['stage_0', 'stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5'];
  lines.push(`│  各队阶段进度:${' '.repeat(W - 15)}│`);
  for (const s of stages) {
    const marks = teams.map(t => {
      const p = progress[t] || {};
      const curIdx = stages.indexOf(p.stage || 'stage_0');
      const thisIdx = stages.indexOf(s);
      if (thisIdx < curIdx) return STAGE_ICONS.done;
      if (thisIdx === curIdx) return (p.percent || 0) >= 100 ? STAGE_ICONS.done : STAGE_ICONS.running;
      return STAGE_ICONS.pending;
    });
    const sLabel = s.replace('stage_', 'S');
    const line = `    ${sLabel}  ${marks[0]}              ${marks[1]}              ${marks[2]}`;
    lines.push(`│${line.padEnd(W - 2)}│`);
  }
  lines.push(`│${' '.repeat(W - 2)}│`);

  // 产物概览
  const artifacts = Object.entries(state.artifacts || {});
  if (artifacts.length > 0) {
    const redN = artifacts.filter(([k]) => k.startsWith('red')).length;
    const blueN = artifacts.filter(([k]) => k.startsWith('blue')).length;
    const greenN = artifacts.filter(([k]) => k.startsWith('green')).length;
    const artLine = `  产物: 红${redN} | 蓝${blueN} | 绿${greenN}  共 ${artifacts.length} 个`;
    lines.push(`│${artLine.padEnd(W - 2)}│`);
    lines.push(`│${' '.repeat(W - 2)}│`);
  }

  lines.push(`│  输入 status 刷新 │ concurrent-status JSON 输出${' '.repeat(8)}│`);
  lines.push(`└${'─'.repeat(W - 2)}┘`);

  return lines.join('\n');
}

function dashboard() {
  const state = getState();
  if (!state) return '⚠️ 无活跃的MVP会话。请先触发 /mvp [任务]。';

  const lines = [];
  const W = 58;

  lines.push(`┌$ {'─'.repeat(W - 2)} ┐`);
  lines.push(`│  ${'MVP 执行看板'.padEnd(W - 4)}│`);
  lines.push(`│${' '.repeat(W - 2)}│`);

  const taskLine = `  任务: ${state.task_name || '未命名'}`;
  lines.push(`│${taskLine.padEnd(W - 2)}│`);

  const depthLine = `  深度: ${state.depth} (${state.depth_label || ''})    状态: ${state.current_phase === 'done' ? '已完成' : '执行中'}`;
  lines.push(`│${depthLine.padEnd(W - 2)}│`);
  lines.push(`│${' '.repeat(W - 2)}│`);

  // Stage chain
  const phases = state.phases || DEPTH_STAGES[state.depth] || [];
  const chainParts = [];
  for (const p of phases) {
    const label = PHASE_LABELS[p] || p;
    if (state.completed_phases.includes(p) || p === 'done') {
      chainParts.push(`[${label} ✅]`);
    } else if (p === state.current_phase) {
      chainParts.push(`[${label} 🔄]`);
    } else {
      chainParts.push(`[${label} ⏳]`);
    }
  }
  const chainLine = `  ${chainParts.join(' → ')}`;
  lines.push(`│${chainLine.padEnd(W - 2)}│`);
  lines.push(`│${' '.repeat(W - 2)}│`);

  // Team progress
  lines.push(`│  各队进度:`.padEnd(W - 2) + `│`);
  for (const [team, progress] of Object.entries(state.team_progress || {})) {
    const teamName = team === 'red' ? '红队' : team === 'blue' ? '蓝队' : '绿队';
    const bar = progressBar(progress.percent || 0, 14);
    const line = `    ${teamName} ${bar} ${progress.stage || ''}`;
    lines.push(`│${line.padEnd(W - 2)}│`);
  }
  lines.push(`│${' '.repeat(W - 2)}│`);

  // Session context stats
  const ctx = getContextStats();
  if (ctx) {
    const limit = state.context_limit || 200000;
    const usedPct = Math.min(100, Math.round((ctx.input_tokens / limit) * 100));
    const ctxBar = progressBar(usedPct, 12);
    const ctxLine = `  Context: ${ctxBar} (${(ctx.input_tokens / 1000).toFixed(0)}K/${(limit / 1000).toFixed(0)}K)`;
    lines.push(`│${ctxLine.padEnd(W - 2)}│`);

    const cacheStr = `  Cache: ${(ctx.cache_read / 1000000).toFixed(1)}M hits  ${ctx.cache_hit_rate}%  ${ctx.api_calls}calls`;
    lines.push(`│${cacheStr.padEnd(W - 2)}│`);
    lines.push(`│${' '.repeat(W - 2)}│`);
  }

  // Artifacts
  const artifacts = Object.entries(state.artifacts || {});
  if (artifacts.length > 0) {
    lines.push(`│  阶段产物:`.padEnd(W - 2) + `│`);
    const shown = artifacts.slice(-5); // last 5
    for (const [key, filePath] of shown) {
      const fp = typeof filePath === 'string' ? filePath : '';
      const line = `    • ${key}: ${fp}`;
      const truncated = line.length > W - 4 ? line.substring(0, W - 7) + '…' : line;
      lines.push(`│${truncated.padEnd(W - 2)}│`);
    }
    if (artifacts.length > 5) {
      lines.push(`│    ... 共 ${artifacts.length} 个产物`);
    }
  }

  lines.push(`│${' '.repeat(W - 2)}│`);
  lines.push(`│  输入 fast 跳过看板 │ status 刷新 │ compress 压缩  │`);
  lines.push(`│  stop 暂停                                      │`);
  lines.push(`└${'─'.repeat(W - 2)} ┘`);

  return lines.join('\n');
}

// ─── Generate recovery options board ───
function recoveryOptions() {
  const state = getState();
  if (!state || !isRecoveryNeeded()) {
    return { needed: false, board: null, state };
  }

  const lines = [];
  const W = 58;

  lines.push(`┌${'─'.repeat(W - 2)} ┐`);
  lines.push(`│  ${'MVP 恢复检测'.padEnd(W - 4)}│`);
  lines.push(`│${' '.repeat(W - 2)}│`);
  lines.push(`│  检测到上次任务「${(state.task_name || '').substring(0, 30)}」停在「${PHASE_LABELS[state.current_phase] || state.current_phase}」阶段`.padEnd(W - 2) + `│`);
  lines.push(`│${' '.repeat(W - 2)}│`);
  lines.push(`│  你要怎么继续？`);
  lines.push(`│    A. 继续对话（不调用技能，自然推进）`);
  lines.push(`│    B. 用 gspowers 引导我（分步导航模式）`);
  lines.push(`│    C. 用 MVP 启动编码 Pipeline（多 Agent 并发）`);
  lines.push(`│${' '.repeat(W - 2)}│`);
  lines.push(`│  请回复 A/B/C`);
  lines.push(`└${'─'.repeat(W - 2)} ┘`);

  return { needed: true, board: lines.join('\n'), state };
}

// ─── Generate handoff for gspowers ───
function generateHandoff() {
  const state = getState();
  if (!state) return { ok: false, error: 'MVP: No active session.' };

  const lines = [
    '# MVP 执行交接文件',
    '',
    `> 生成时间: ${new Date().toISOString()}`,
    `> 任务: ${state.task_name}`,
    `> 深度: ${state.depth} (${state.depth_label})`,
    '',
    '## 任务规格',
    state.task_name || '(未记录)',
    '',
    '## 已完成阶段',
    ...(state.completed_phases || []).map(p => `- [x] ${PHASE_LABELS[p] || p}`),
    '',
    '## 当前阶段',
    `- [ ] **${PHASE_LABELS[state.current_phase] || state.current_phase}** (进行中)`,
    '',
    '## 各队进度',
  ];

  for (const [team, progress] of Object.entries(state.team_progress || {})) {
    const teamName = team === 'red' ? '红队' : team === 'blue' ? '蓝队' : '绿队';
    lines.push(`- ${teamName}: ${progress.stage || '?'} (${progress.percent || 0}%)`);
  }

  lines.push('');
  lines.push('## 产物清单');
  for (const [key, filePath] of Object.entries(state.artifacts || {})) {
    lines.push(`- ${key}: \`${filePath}\``);
  }
  if (Object.keys(state.artifacts || {}).length === 0) {
    lines.push('(暂无产物)');
  }

  lines.push('');
  lines.push('## 恢复指南');
  lines.push('1. 执行 `/gspowers` 进入导航模式');
  lines.push('2. 基于上述已完成的阶段，从当前阶段继续');

  ensureDir();
  fs.writeFileSync(HANDOFF_FILE, lines.join('\n'), 'utf8');

  return { ok: true, path: HANDOFF_FILE };
}

// ─── Remove session ───
function remove() {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  if (fs.existsSync(HANDOFF_FILE)) fs.unlinkSync(HANDOFF_FILE);
  return { ok: true };
}

// ─── SOP: 初始化 ───
function initSop(depth) {
  const level = depth || 'full';
  if (!DEPTH_MAP[level]) {
    return { ok: false, error: `无效深度: ${level}。有效值: ${Object.keys(DEPTH_MAP).join(', ')}` };
  }

  const state = getState() || {};
  const maxStep = DEPTH_MAP[level].maxStep;

  const steps = SOP_STEPS.map(s => {
    let status = 'pending';
    if (s.num > maxStep) status = 'excluded';
    if (s.num === 1) status = 'current';
    return { num: s.num, status };
  });

  state.sopNav = {
    taskDepth: level,
    currentStep: 1,
    steps
  };

  writeState(state);
  return { ok: true, state };
}

// ─── SOP: 设置深度 ───
function sopSetDepth(level) {
  if (!DEPTH_MAP[level]) {
    return { ok: false, error: `无效深度: ${level}。有效值: ${Object.keys(DEPTH_MAP).join(', ')}` };
  }

  const state = getState();
  if (!state || !state.sopNav) {
    return { ok: false, error: '无活跃的 SOP 会话。请先执行 --init-sop。' };
  }

  const maxStep = DEPTH_MAP[level].maxStep;
  state.sopNav.taskDepth = level;

  for (const step of state.sopNav.steps) {
    if (step.num > maxStep && step.status !== 'done' && step.status !== 'skipped') {
      step.status = 'excluded';
    } else if (step.num <= maxStep && step.status === 'excluded') {
      step.status = 'pending';
    }
  }

  // If currentStep is now excluded, find next valid step
  const curStep = state.sopNav.steps.find(s => s.num === state.sopNav.currentStep);
  if (curStep && curStep.status === 'excluded') {
    const nextValid = state.sopNav.steps.find(s => s.num > 0 && s.status === 'pending');
    if (nextValid) {
      nextValid.status = 'current';
      state.sopNav.currentStep = nextValid.num;
    }
  }

  writeState(state);
  return { ok: true, state };
}

// ─── SOP: 跳过步骤 ───
function sopSkip(stepNum) {
  const state = getState();
  if (!state || !state.sopNav) {
    return { ok: false, error: '无活跃的 SOP 会话。请先执行 --init-sop。' };
  }

  const targetNum = stepNum || state.sopNav.currentStep;
  const targetStep = state.sopNav.steps.find(s => s.num === targetNum);
  if (!targetStep) {
    return { ok: false, error: `步骤 ${targetNum} 不存在。` };
  }
  if (targetStep.status === 'excluded') {
    return { ok: false, error: `步骤 ${targetNum} 已被排除（不在当前深度范围内）。` };
  }

  targetStep.status = 'skipped';

  // If skipping current step, advance to next valid
  if (targetNum === state.sopNav.currentStep) {
    const nextValid = state.sopNav.steps.find(s => s.num > targetNum && s.status !== 'excluded' && s.status !== 'skipped' && s.status !== 'done');
    if (nextValid) {
      nextValid.status = 'current';
      state.sopNav.currentStep = nextValid.num;
    } else {
      state.sopNav.currentStep = targetNum; // stay, all done
    }
  }

  writeState(state);
  return { ok: true, state };
}

// ─── SOP: 标记当前步骤完成 ───
function sopStepDone() {
  const state = getState();
  if (!state || !state.sopNav) {
    return { ok: false, error: '无活跃的 SOP 会话。请先执行 --init-sop。' };
  }

  const curStep = state.sopNav.steps.find(s => s.num === state.sopNav.currentStep);
  if (!curStep) {
    return { ok: false, error: '当前步骤不存在。' };
  }

  curStep.status = 'done';

  // Advance to next non-excluded/non-skipped step
  const nextValid = state.sopNav.steps.find(s => s.num > state.sopNav.currentStep && s.status !== 'excluded' && s.status !== 'skipped' && s.status !== 'done');
  if (nextValid) {
    nextValid.status = 'current';
    state.sopNav.currentStep = nextValid.num;
  }
  // else: all steps done, currentStep stays

  writeState(state);
  return { ok: true, state };
}

// ─── SOP: 回退上一步 ───
function sopStepBack() {
  const state = getState();
  if (!state || !state.sopNav) {
    return { ok: false, error: '无活跃的 SOP 会话。请先执行 --init-sop。' };
  }

  const currentNum = state.sopNav.currentStep;
  // Find previous non-excluded/non-skipped step
  let prevStep = null;
  for (let i = currentNum - 2; i >= 0; i--) {
    const s = state.sopNav.steps[i];
    if (s && s.status !== 'excluded' && s.status !== 'skipped') {
      prevStep = s;
      break;
    }
  }

  if (!prevStep) {
    return { ok: false, error: '已在第一步，无法回退。' };
  }

  // Reset current step to pending
  const curStep = state.sopNav.steps.find(s => s.num === currentNum);
  if (curStep && curStep.status === 'current') {
    curStep.status = 'pending';
  }

  // Set previous step as current
  prevStep.status = 'current';
  state.sopNav.currentStep = prevStep.num;

  writeState(state);
  return { ok: true, state };
}

// ─── SOP: 渲染导航面板 ───
function renderNavPanel(state) {
  if (!state || !state.sopNav) {
    return '⚠️ 无活跃的 SOP 导航。请先执行 --init-sop。';
  }

  const nav = state.sopNav;
  const depthInfo = DEPTH_MAP[nav.taskDepth] || { maxStep: 26, label: 'unknown' };
  const lines = [];
  const W = 68;

  lines.push(`\u250c${"\u2500".repeat(W - 2)}\u2510`);
  const headerLine = `  MVP SOP 导航面板          深度: [${nav.taskDepth}]    当前: Step ${nav.currentStep}/${depthInfo.maxStep}`;
  lines.push(`\u2502${headerLine.padEnd(W - 2)}\u2502`);
  lines.push(`\u251c${"\u2500".repeat(W - 2)}\u2524`);
  lines.push(`\u2502${' '.repeat(W - 2)}\u2502`);

  // Group steps by phase
  const phases = ['\u9700\u6c42\u8bbe\u8ba1', '\u5b9e\u73b0\u9636\u6bb5'];
  for (const phase of phases) {
    const phaseSteps = SOP_STEPS.filter(s => s.phase === phase);
    const phaseHeader = `  \u2500\u2500 ${phase} ${"\u2500".repeat(W - 8 - phase.length * 2)}`;
    lines.push(`\u2502${phaseHeader.padEnd(W - 2)}\u2502`);

    for (const step of phaseSteps) {
      const stepState = nav.steps.find(s => s.num === step.num);
      if (!stepState) continue;

      // Status icon
      let icon = '[ ]';
      if (stepState.status === 'done') icon = '[v]';
      else if (stepState.status === 'current') icon = '[>]';
      else if (stepState.status === 'skipped') icon = '[-]';
      else if (stepState.status === 'excluded') icon = '[x]';

      const roleLabel = step.role === 'agent' ? 'AI  ' : '\u4eba\u7c7b';
      const numStr = String(step.num).padEnd(2);
      const opStr = step.op.length > 12 ? step.op.substring(0, 12) : step.op.padEnd(12);
      const line = `  ${icon} ${numStr}. ${opStr}  ${roleLabel} | ${step.platform.padEnd(3)}  \u2192 ${step.output}`;
      const truncated = line.length > W - 4 ? line.substring(0, W - 4) : line;
      lines.push(`\u2502${truncated.padEnd(W - 2)}\u2502`);
    }
    lines.push(`\u2502${' '.repeat(W - 2)}\u2502`);
  }

  // Separator
  lines.push(`\u2502  ${"\u2500".repeat(W - 6)}  \u2502`);

  // Next step guidance
  const currentStepDef = SOP_STEPS.find(s => s.num === nav.currentStep);
  const allDoneInDepth = nav.steps.filter(s => s.num <= depthInfo.maxStep).every(s => s.status === 'done' || s.status === 'skipped' || s.status === 'excluded');

  let guideLine;
  if (allDoneInDepth) {
    guideLine = `  \u5f53\u524d\u6df1\u5ea6 [${nav.taskDepth}] \u5df2\u5b8c\u6210\u5168\u90e8\u6b65\u9aa4\uff01\u5982\u9700\u7ee7\u7eed\uff0c\u8f93\u5165 [depth X] \u6269\u5c55\u6df1\u5ea6`;
  } else if (currentStepDef) {
    if (currentStepDef.role === 'agent') {
      guideLine = `  \u4e0b\u4e00\u6b65: AI \u6267\u884c\u300c${currentStepDef.op}\u300d\u2192 \u4ea7\u51fa\u300c${currentStepDef.output}\u300d`;
    } else {
      guideLine = `  \u4e0b\u4e00\u6b65: \u9700\u8981\u4eba\u7c7b\u5728 ${currentStepDef.platform} \u6267\u884c\u300c${currentStepDef.op}\u300d\u2192 \u4ea7\u51fa\u300c${currentStepDef.output}\u300d`;
    }
  } else {
    guideLine = '  \u6240\u6709\u6b65\u9aa4\u5df2\u5b8c\u6210';
  }
  lines.push(`\u2502${guideLine.padEnd(W - 2)}\u2502`);

  const opLine = '  \u64cd\u4f5c: [next] \u7ee7\u7eed | [skip] \u8df3\u8fc7 | [depth X] \u8c03\u6574\u6df1\u5ea6';
  lines.push(`\u2502${opLine.padEnd(W - 2)}\u2502`);
  lines.push(`\u2514${"\u2500".repeat(W - 2)}\u2518`);

  return lines.join('\n');
}

// ─── CLI ───
function cli() {
  const args = process.argv.slice(2);

  if (args.includes('--sync')) {
    const result = syncFromState();
    console.log(JSON.stringify(result, null, 2));
    if (result.ok) console.log('\n' + dashboard());
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--sync-and-show')) {
    const result = syncAndShow();
    // Only output the dashboard (for Team Lead injection)
    console.log(syncAndShow().board);
    process.exit(0);
  }

  if (args.includes('--ctx')) {
    const ctx = getContextStats();
    if (!ctx) {
      console.log('⚠️ 无会话数据。请先开始一个 MVP 会话。');
      process.exit(0);
    }
    const limit = 200000;
    const usedPct = Math.min(100, Math.round((ctx.input_tokens / limit) * 100));
    console.log(`Context: ${usedPct}% (${(ctx.input_tokens/1000).toFixed(0)}K/${(limit/1000).toFixed(0)}K tokens)`);
    console.log(`Cache:   ${(ctx.cache_read/1000000).toFixed(1)}M hits @ ${ctx.cache_hit_rate}%`);
    console.log(`Calls:   ${ctx.api_calls} API calls`);
    console.log(`Model:   ${ctx.model}`);
    console.log('');
    console.log(`压缩提示: 输入 compress 让 Team Lead 调用 ctx_compress 精简上下文。`);
    process.exit(0);
  }

  if (args.includes('--init')) {
    const nameIdx = args.indexOf('--init') + 1;
    const taskName = args[nameIdx] || '未命名任务';
    const depthIdx = args.indexOf('--depth');
    const depth = depthIdx !== -1 ? args[depthIdx + 1] : 'C';
    const result = init(taskName, depth);
    console.log(JSON.stringify(result, null, 2));
    if (result.ok) console.log('\n' + dashboard());
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--phase')) {
    const phaseIdx = args.indexOf('--phase') + 1;
    const phase = args[phaseIdx];
    const stageIdx = args.indexOf('--stage');
    const stage = stageIdx !== -1 ? args[stageIdx + 1] : null;
    if (!phase) { console.error('Usage: hang-state-manager.cjs --phase <phase> [--stage <stage>]'); process.exit(1); }
    const result = updatePhase(phase, stage);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--team-progress')) {
    const idx = args.indexOf('--team-progress') + 1;
    const team = args[idx];
    const stage = args[idx + 1];
    const percent = parseInt(args[idx + 2], 10);
    if (!team || isNaN(percent)) { console.error('Usage: hang-state-manager.cjs --team-progress <red|blue|green> <stage> <percent>'); process.exit(1); }
    const result = updateTeamProgress(team, stage, percent);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--artifact')) {
    const idx = args.indexOf('--artifact') + 1;
    const key = args[idx];
    const filePath = args[idx + 1];
    if (!key || !filePath) { console.error('Usage: hang-state-manager.cjs --artifact <key> <path>'); process.exit(1); }
    const result = addArtifact(key, filePath);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--concurrent-dashboard') || args.includes('-c')) {
    console.log(concurrentDashboard());
    process.exit(0);
  }

  if (args.includes('--concurrent-mode')) {
    const idx = args.indexOf('--concurrent-mode') + 1;
    const ide = args[idx] && !args[idx].startsWith('-') ? args[idx] : 'qoder';
    const result = setConcurrentMode(ide);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--serial-mode')) {
    const result = setSerialMode();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--dashboard')) {
    console.log(dashboard());
    process.exit(0);
  }

  if (args.includes('--recovery')) {
    const result = recoveryOptions();
    if (result.needed && result.board) console.log(result.board);
    else console.log('✅ 无待恢复的 MVP 会话。');
    console.log('\n' + JSON.stringify({ needed: result.needed, state: result.state }, null, 2));
    process.exit(0);
  }

  if (args.includes('--status')) {
    const state = getState();
    if (!state) { console.log('{"status":"no_active_session"}'); }
    else console.log(JSON.stringify(state, null, 2));
    process.exit(0);
  }

  if (args.includes('--complete')) {
    const result = complete();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--mark-stage-complete')) {
    const idx = args.indexOf('--mark-stage-complete') + 1;
    const team = args[idx];
    const stage = args[idx + 1];
    const csumIdx = args.indexOf('--checksum');
    const checksum = csumIdx !== -1 ? args[csumIdx + 1] : null;
    if (!team || !stage) { console.error('Usage: hang-state-manager.cjs --mark-stage-complete <team> <stage> [--checksum <hash>]'); process.exit(1); }
    const result = markStageComplete(team, stage, checksum);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--is-stage-complete')) {
    const idx = args.indexOf('--is-stage-complete') + 1;
    const team = args[idx];
    const stage = args[idx + 1];
    if (!team || !stage) { console.error('Usage: hang-state-manager.cjs --is-stage-complete <team> <stage>'); process.exit(1); }
    const result = isStageComplete(team, stage);
    console.log(JSON.stringify({ complete: result, team, stage }, null, 2));
    process.exit(0);
  }

  if (args.includes('--handoff')) {
    const result = generateHandoff();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--dashboard-off')) {
    const result = setDashboard(false);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--dashboard-on')) {
    const result = setDashboard(true);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--remove')) {
    const result = remove();
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  // ─── SOP Commands ───
  if (args.includes('--init-sop')) {
    const idx = args.indexOf('--init-sop') + 1;
    const level = (args[idx] && !args[idx].startsWith('-')) ? args[idx] : 'full';
    const result = initSop(level);
    if (result.ok) {
      console.log(renderNavPanel(result.state));
    } else {
      console.error(result.error);
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--nav')) {
    const state = getState();
    console.log(renderNavPanel(state));
    process.exit(0);
  }

  if (args.includes('--skip')) {
    const idx = args.indexOf('--skip') + 1;
    const stepNum = (args[idx] && !args[idx].startsWith('-')) ? parseInt(args[idx], 10) : undefined;
    const result = sopSkip(isNaN(stepNum) ? undefined : stepNum);
    if (result.ok) {
      console.log(renderNavPanel(result.state));
    } else {
      console.error(result.error);
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--depth') && !args.includes('--init')) {
    const idx = args.indexOf('--depth') + 1;
    const level = args[idx];
    if (!level) { console.error('Usage: hang-state-manager.cjs --depth <prototype|prd|spec|mvp|full>'); process.exit(1); }
    const result = sopSetDepth(level);
    if (result.ok) {
      console.log(renderNavPanel(result.state));
    } else {
      console.error(result.error);
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--step-done')) {
    const result = sopStepDone();
    if (result.ok) {
      console.log(renderNavPanel(result.state));
    } else {
      console.error(result.error);
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--step-back')) {
    const result = sopStepBack();
    if (result.ok) {
      console.log(renderNavPanel(result.state));
    } else {
      console.error(result.error);
    }
    process.exit(result.ok ? 0 : 1);
  }

  // Default: show usage
  console.log('hang-state-manager.cjs — MVP 执行状态持久化管理器');
  console.log('');
  console.log('  初始化:   hang-state-manager.cjs --init "任务名" --depth C');
  console.log('  更新阶段: hang-state-manager.cjs --phase coding --stage stage_2');
  console.log('  队伍进度: hang-state-manager.cjs --team-progress red stage_2 70');
  console.log('  添加产物: hang-state-manager.cjs --artifact alignment docs/red-00-alignment.md');
  console.log('  看板:     hang-state-manager.cjs --dashboard');
  console.log('  恢复:     hang-state-manager.cjs --recovery');
  console.log('  状态:     hang-state-manager.cjs --status');
  console.log('  完成:     hang-state-manager.cjs --complete');
  console.log('  交接:     hang-state-manager.cjs --handoff');
  console.log('  并发看板: hang-state-manager.cjs --concurrent-dashboard');
  console.log('  开并发:   hang-state-manager.cjs --concurrent-mode qoder');
  console.log('  清理:     hang-state-manager.cjs --remove');
  console.log('');
  console.log('  SOP 导航:');
  console.log('  初始SOP:  hang-state-manager.cjs --init-sop [depth]');
  console.log('  导航:     hang-state-manager.cjs --nav');
  console.log('  跳过:     hang-state-manager.cjs --skip [stepNum]');
  console.log('  深度:     hang-state-manager.cjs --depth <prototype|prd|spec|mvp|full>');
  console.log('  完成步:   hang-state-manager.cjs --step-done');
  console.log('  回退:     hang-state-manager.cjs --step-back');
}

if (require.main === module) {
  cli();
}

module.exports = {
  init,
  updatePhase,
  updateTeamProgress,
  addArtifact,
  setDashboard,
  setConcurrentMode,
  setSerialMode,
  getState,
  isRecoveryNeeded,
  dashboard,
  concurrentDashboard,
  recoveryOptions,
  generateHandoff,
  complete,
  remove,
  syncFromState,
  syncAndShow,
  getContextStats,
  gateLog,
  verifyGatePassed,
  markStageComplete,
  isStageComplete,
  recoverState,
  initSop,
  sopSetDepth,
  sopSkip,
  sopStepDone,
  sopStepBack,
  renderNavPanel,
  VALID_DEPTHS,
  DEPTH_LABELS,
  DEPTH_STAGES,
  PHASE_LABELS,
  SOP_STEPS,
  DEPTH_MAP,
};

