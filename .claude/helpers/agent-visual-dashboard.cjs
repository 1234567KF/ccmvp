#!/usr/bin/env node
/**
 * agent-visual-dashboard.cjs v1 — 多智能体可视化状态看板
 *
 * 聚合 hang-state-manager 状态，生成适合在 Qoder 对话框中
 * 直接呈现的 Markdown 看板。支持 /mvp 单队流水线模式，
 * 以及用户自定义 Agent 的可视化追踪。
 *
 * 用法:
 *   node agent-visual-dashboard.cjs --mode mvp            # MVP 模式看板
 *   node agent-visual-dashboard.cjs --mode auto           # 自动检测当前活跃会话
 *   node agent-visual-dashboard.cjs --mode custom --agents "a1,a2,a3"
 *   node agent-visual-dashboard.cjs --compact             # 紧凑模式（单行状态条）
 *   node agent-visual-dashboard.cjs --phase <name>        # 更新当前阶段并刷新看板
 *   node agent-visual-dashboard.cjs --agent-spawn --team <T> --agent <A> --task <ID>
 *   node agent-visual-dashboard.cjs --agent-done --team <T> --agent <A>
 *   node agent-visual-dashboard.cjs --agent-fail --team <T> --agent <A> --error "<msg>"
 *
 * 输出:
 *   纯 Markdown 文本，可直接由 AI 输出到对话中呈现。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR = path.join(ROOT, '.claude-flow', 'mvp-state');
const HANG_STATE_FILE = path.join(ROOT, '.claude-flow', 'hang-state.json');
const STATUS_FILE = path.join(STATE_DIR, '.mvp-status.json');

// ─── Helpers ───────────────────────────────────────────────────────

function readJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback || null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback || null; }
}

function now() { return new Date().toISOString(); }
function nowMs() { return Date.now(); }

function progressBar(percent, width = 16) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m${s}s`;
}

function formatTokens(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

// ─── State Readers ─────────────────────────────────────────────────

function readMvpState() {
  return readJSON(STATUS_FILE);
}

function readHangState() {
  return readJSON(HANG_STATE_FILE);
}

function readCustomAgents() {
  const customFile = path.join(STATE_DIR, '.custom-agents.json');
  return readJSON(customFile, { agents: [] });
}

// ─── Dashboard Generators ──────────────────────────────────────────

function generateHangDashboard(state, statusState, compact = false) {
  const lines = [];

  if (!state) {
    lines.push('> ⚠️ **无活跃的 MVP 会话**。请先触发 `/mvp [任务]` 开始。');
    return lines.join('\n');
  }

  const W = 64;
  const task = state.task_name || '未命名任务';
  const depth = state.depth || 'C';
  const depthLabel = { A: '需求分析+方案评审', B: '需求+设计', C: '全流程编码交付' }[depth] || depth;

  lines.push(`### 🔨 MVP · 多团队竞争看板`);
  lines.push('');

  // Header box
  lines.push(`| 维度 | 状态 |`);
  lines.push(`|------|------|`);
  lines.push(`| 任务 | **${task}** |`);
  lines.push(`| 深度 | ${depth} (${depthLabel}) |`);
  lines.push(`| 阶段 | ${state.current_phase || '未开始'} |`);
  lines.push(`| 模式 | ${state.execution_mode || 'serial'} |`);
  lines.push('');

  // Phase chain
  lines.push('#### 📋 阶段流水线');
  const phases = state.phases || ['alignment', 'architecture', 'coding', 'testing', 'review', 'done'];
  const phaseLabels = {
    alignment: '对齐', architecture: '架构', coding: '编码',
    testing: '测试', review: '审查', done: '完成',
    planning: '规划', spec: '设计',
  };
  const chain = phases.map(p => {
    const label = phaseLabels[p] || p;
    if (state.completed_phases?.includes(p) || p === 'done') return `✅ ${label}`;
    if (p === state.current_phase) return `🔄 **${label}**`;
    return `⏳ ${label}`;
  });
  lines.push(chain.join(' → '));
  lines.push('');

  // Team progress
  lines.push('#### 🏆 各队进度');
  lines.push('');
  lines.push(`| 队伍 | 进度 | Stage | 状态 |`);
  lines.push(`|------|------|-------|------|`);
  for (const [team, prog] of Object.entries(state.team_progress || {})) {
    const teamName = team === 'red' ? '🔴 红队' : team === 'blue' ? '🔵 蓝队' : '🟢 绿队';
    const bar = progressBar(prog.percent || 0, 10);
    const stage = prog.stage || '-';
    const status = prog.percent >= 100 ? '✅ 完成' : prog.percent > 0 ? '🔄 进行中' : '⏳ 待启动';
    lines.push(`| ${teamName} | ${bar} ${prog.percent || 0}% | ${stage} | ${status} |`);
  }
  lines.push('');

  // Agent execution status (if any)
  if (statusState && statusState.active) {
    lines.push('#### 🤖 Agent 执行状态');
    lines.push('');
    lines.push(`| Agent | 队伍 | 阶段 | 状态 | 耗时 |`);
    lines.push(`|-------|------|------|------|------|`);
    for (const a of statusState.running_agents || []) {
      const elapsed = formatDuration(parseInt(a.elapsed) * 1000 || 0);
      lines.push(`| ${a.agent} | ${a.team} | ${a.task_id || a.stage || '-'} | 🔄 运行中 | ${elapsed} |`);
    }
    for (const a of statusState.completed || []) {
      lines.push(`| ${a.agent} | ${a.team} | ${a.task_id || a.stage || '-'} | ✅ 已完成 | ${formatTokens(a.tokens_in || 0)}+${formatTokens(a.tokens_out || 0)} tok |`);
    }
    for (const a of statusState.failed || []) {
      lines.push(`| ${a.agent} | ${a.team} | ${a.task_id || a.stage || '-'} | ❌ 失败 | ${a.error || ''} |`);
    }
    lines.push('');

    // Token summary
    lines.push('#### 💰 Token 消耗');
    lines.push(`- 输入: ${formatTokens(statusState.tokens?.total_in || 0)} | 输出: ${formatTokens(statusState.tokens?.total_out || 0)} | 总计: ~${formatTokens((statusState.tokens?.total_in || 0) + (statusState.tokens?.total_out || 0))}`);
    lines.push('');
  }

  // Artifacts
  const artifacts = Object.entries(state.artifacts || {});
  if (artifacts.length > 0) {
    lines.push('#### 📦 阶段产物');
    for (const [key, fp] of artifacts) {
      lines.push(`- **${key}**: ${fp}`);
    }
    lines.push('');
  }

  // Compact footer
  if (compact) {
    const r = state.team_progress?.red?.percent || 0;
    const b = state.team_progress?.blue?.percent || 0;
    const g = state.team_progress?.green?.percent || 0;
    const avg = Math.round((r + b + g) / 3);
    lines.push(`> 📊 总进度: ${progressBar(avg, 12)} ${avg}% | 输入 "/mvp status" 刷新`);
  }

  return lines.join('\n');
}

function generateMVPDashboard(state, statusState, compact = false) {
  const lines = [];

  if (!state) {
    lines.push('> ⚠️ **无活跃的 MVP 会话**。请先触发 `/mvp [任务]` 开始。');
    return lines.join('\n');
  }

  const phases = [
    { id: 'phase-0', label: '0️⃣ 技术栈锁定', emoji: '⚙️' },
    { id: 'phase-1', label: '1️⃣ 需求对齐', emoji: '📋' },
    { id: 'phase-2', label: '2️⃣ PRD 生成', emoji: '📝' },
    { id: 'phase-3', label: '3️⃣ Spec 设计', emoji: '🏗️' },
    { id: 'phase-4', label: '4️⃣ 任务拆分', emoji: '📐' },
    { id: 'phase-4.5', label: '4.5 Gate', emoji: '🚦' },
    { id: 'phase-5', label: '5️⃣ TDD 开发', emoji: '💻' },
    { id: 'phase-6', label: '6️⃣ 原型生成', emoji: '🎨' },
    { id: 'phase-7', label: '7️⃣ 演示验收', emoji: '🎬' },
  ];

  const currentPhase = state.current_phase || 'phase-0';
  const completed = state.completed_phases || [];

  lines.push(`### 🚀 MVP 快速通道看板`);
  lines.push('');
  lines.push(`| 维度 | 状态 |`);
  lines.push(`|------|------|`);
  lines.push(`| 任务 | **${state.task_name || '未命名任务'}** |`);
  lines.push(`| 当前 | ${currentPhase} |`);
  lines.push(`| 模式 | ${state.execution_mode || 'serial'} |`);
  lines.push('');

  // Phase pipeline
  lines.push('#### 📋 Phase 流水线');
  lines.push('');
  for (const phase of phases) {
    const isDone = completed.includes(phase.id);
    const isCurrent = phase.id === currentPhase;
    const icon = isDone ? '✅' : isCurrent ? '🔄' : '⏳';
    const bar = isDone ? progressBar(100, 8) : isCurrent ? progressBar(state.current_percent || 50, 8) : progressBar(0, 8);
    lines.push(`${icon} **${phase.label}** ${bar}`);
  }
  lines.push('');

  // Agent status
  if (statusState && statusState.active) {
    const running = statusState.running_agents || [];
    if (running.length > 0) {
      lines.push('#### 🤖 活跃 Agent');
      lines.push('');
      lines.push(`| Agent | 阶段 | 状态 | 耗时 |`);
      lines.push(`|-------|------|------|------|`);
      for (const a of running) {
        const elapsed = formatDuration(parseInt(a.elapsed) * 1000 || 0);
        lines.push(`| **${a.agent}** | ${a.task_id || a.stage || '-'} | 🔄 运行中 | ${elapsed} |`);
      }
      lines.push('');
    }

    // Module progress
    if (state.modules) {
      lines.push('#### 📦 模块进度');
      lines.push('');
      lines.push(`| 模块 | 状态 | 测试 |`);
      lines.push(`|------|------|------|`);
      for (const [modName, mod] of Object.entries(state.modules)) {
        const status = mod.status === 'done' ? '✅' : mod.status === 'running' ? '🔄' : '⏳';
        const test = mod.test_status === 'pass' ? '✅ 通过' : mod.test_status === 'fail' ? '❌ 失败' : '⏳ 未测';
        lines.push(`| ${modName} | ${status} ${mod.status} | ${test} |`);
      }
      lines.push('');
    }

    // Token efficiency
    lines.push('#### 💰 效率指标');
    lines.push(`- Token 输入: ${formatTokens(statusState.tokens?.total_in || 0)}`);
    lines.push(`- Token 输出: ${formatTokens(statusState.tokens?.total_out || 0)}`);
    lines.push(`- CCP 跳过节省: ~${formatTokens(state.ccp_saved_tokens || 0)}`);
    lines.push(`- lean-ctx 压缩率: ${state.lean_ctx_ratio || 'N/A'}`);
    lines.push('');
  }

  // Artifacts
  const artifacts = Object.entries(state.artifacts || {});
  if (artifacts.length > 0) {
    lines.push('#### 📦 交付产物');
    for (const [key, fp] of artifacts.slice(-6)) {
      lines.push(`- **${key}**: ${fp}`);
    }
    if (artifacts.length > 6) {
      lines.push(`- ... 共 ${artifacts.length} 个产物`);
    }
    lines.push('');
  }

  if (compact) {
    const phaseIdx = phases.findIndex(p => p.id === currentPhase);
    const total = phases.length;
    const pct = Math.round((phaseIdx / total) * 100);
    lines.push(`> 📊 总进度: ${progressBar(pct, 12)} ${pct}% | 输入 "/mvp status" 刷新`);
  }

  return lines.join('\n');
}

function generateCustomDashboard(statusState, customAgents) {
  const lines = [];
  lines.push(`### 🤖 自定义 Agent 集群看板`);
  lines.push('');

  const allAgents = [
    ...(statusState?.running_agents || []),
    ...(statusState?.completed || []),
    ...(statusState?.failed || []),
    ...(customAgents?.agents || []),
  ];

  if (allAgents.length === 0) {
    lines.push('> 暂无活跃 Agent。');
    return lines.join('\n');
  }

  // Group by status
  const running = allAgents.filter(a => a.status === 'running');
  const done = allAgents.filter(a => a.status === 'done');
  const failed = allAgents.filter(a => a.status === 'failed');

  lines.push('#### 执行概览');
  lines.push(`| 状态 | 数量 |`);
  lines.push(`|------|------|`);
  lines.push(`| 🔄 运行中 | ${running.length} |`);
  lines.push(`| ✅ 已完成 | ${done.length} |`);
  lines.push(`| ❌ 失败 | ${failed.length} |`);
  lines.push('');

  if (running.length > 0) {
    lines.push('#### 运行中 Agent');
    lines.push(`| Agent | 任务 | 启动时间 | 耗时 |`);
    lines.push(`|-------|------|----------|------|`);
    for (const a of running) {
      const elapsed = a.spawned_at ? formatDuration(nowMs() - new Date(a.spawned_at).getTime()) : '-';
      lines.push(`| **${a.agent}** | ${a.task_id || a.task || '-'} | ${a.spawned_at?.slice(11, 19) || '-'} | ${elapsed} |`);
    }
    lines.push('');
  }

  if (done.length > 0) {
    lines.push('#### 已完成 Agent');
    lines.push(`| Agent | 任务 | 产出 |`);
    lines.push(`|-------|------|------|`);
    for (const a of done.slice(-5)) {
      lines.push(`| ${a.agent} | ${a.task_id || a.task || '-'} | ${a.output || '-'} |`);
    }
    lines.push('');
  }

  if (failed.length > 0) {
    lines.push('#### ⚠️ 失败 Agent');
    lines.push(`| Agent | 任务 | 错误 |`);
    lines.push(`|-------|------|------|`);
    for (const a of failed) {
      lines.push(`| ${a.agent} | ${a.task_id || a.task || '-'} | ${(a.error || '').slice(0, 40)} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateCompactBar(statusState, hangState) {
  const parts = [];
  if (hangState) {
    const phases = hangState.phases || [];
    const completed = hangState.completed_phases || [];
    const pct = phases.length > 0 ? Math.round((completed.length / phases.length) * 100) : 0;
    parts.push(`📊 ${progressBar(pct, 8)} ${pct}%`);
  }
  if (statusState?.active) {
    const r = statusState.running_agents?.length || 0;
    const d = statusState.counts?.completed || 0;
    const f = statusState.counts?.failed || 0;
    parts.push(`🤖 ${r}↻ ${d}✓ ${f}✗`);
    const t = (statusState.tokens?.total_in || 0) + (statusState.tokens?.total_out || 0);
    parts.push(`💰${formatTokens(t)}`);
  }
  return parts.length > 0 ? `> ${parts.join(' | ')}` : '> 无活跃会话';
}

// ─── CLI ───────────────────────────────────────────────────────────

function cli() {
  const args = process.argv.slice(2);

  function getopt(name, fallback) {
    const idx = args.indexOf(name);
    if (idx === -1) return fallback;
    return args[idx + 1] || fallback;
  }

  function hasopt(name) { return args.includes(name); }

  if (args.length === 0 || hasopt('--help') || hasopt('-h')) {
    console.log(`agent-visual-dashboard.cjs v1 — 多智能体可视化状态看板

用法:
  --mode hang|mvp|auto|custom    看板模式（默认 auto）
  --compact                      紧凑单行模式
  --phase <name>                 更新当前阶段（自动写入 hang-state）
  --percent <N>                  更新当前阶段百分比
  --agent-spawn                  记录 Agent 创建
  --agent-done                   标记 Agent 完成
  --agent-fail                   标记 Agent 失败
  --team <T>                     队伍名（red/blue/green）
  --agent <name>                 Agent 名
  --task <id>                    任务/阶段 ID
  --error "<msg>"                错误信息
  --agents "a1,a2"               自定义 Agent 列表

示例:
  node agent-visual-dashboard.cjs --mode hang --compact
  node agent-visual-dashboard.cjs --phase phase-5 --percent 60
  node agent-visual-dashboard.cjs --agent-spawn --team red --agent "spec-designer" --task stage-2`);
    process.exit(0);
  }

  // State mutations
  if (hasopt('--phase')) {
    const phase = getopt('--phase');
    const percent = parseInt(getopt('--percent', '0'));
    const hangState = readJSON(HANG_STATE_FILE, {});
    if (phase !== hangState.current_phase && hangState.current_phase) {
      if (!hangState.completed_phases) hangState.completed_phases = [];
      if (!hangState.completed_phases.includes(hangState.current_phase)) {
        hangState.completed_phases.push(hangState.current_phase);
      }
    }
    hangState.current_phase = phase;
    hangState.current_percent = percent;
    hangState.last_updated = now();
    fs.mkdirSync(path.dirname(HANG_STATE_FILE), { recursive: true });
    fs.writeFileSync(HANG_STATE_FILE, JSON.stringify(hangState, null, 2), 'utf8');
  }

  if (hasopt('--agent-spawn')) {
    const team = getopt('--team', 'default');
    const agent = getopt('--agent');
    const task = getopt('--task');
    if (!agent) { console.error('Missing --agent'); process.exit(1); }

    const state = readJSON(STATUS_FILE, { session_id: 'mvp-' + Date.now(), running_agents: [], completed: [], failed: [] });
    const entry = {
      agent_id: `${team}/${agent}/${task || 'unknown'}`,
      team, agent, task_id: task || 'unknown',
      status: 'running', spawned_at: now(), last_event_at: now(),
      tokens_in: 0, tokens_out: 0,
    };
    state.running_agents = (state.running_agents || []).filter(a => a.agent_id !== entry.agent_id);
    state.running_agents.push(entry);
    state.active = true;
    state.last_updated = now();
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    fs.writeFileSync(STATUS_FILE, JSON.stringify(state, null, 2), 'utf8');
    console.log(JSON.stringify({ ok: true, event: 'spawn', agent, team, task }));
    process.exit(0);
  }

  if (hasopt('--agent-done')) {
    const team = getopt('--team', 'default');
    const agent = getopt('--agent');
    if (!agent) { console.error('Missing --agent'); process.exit(1); }

    const state = readJSON(STATUS_FILE);
    if (!state) { console.error('No active session'); process.exit(1); }
    const idx = (state.running_agents || []).findIndex(a => a.agent === agent && a.team === team);
    if (idx !== -1) {
      const entry = state.running_agents[idx];
      entry.status = 'done';
      entry.completed_at = now();
      state.completed = state.completed || [];
      state.completed.push(entry);
      state.running_agents.splice(idx, 1);
      state.last_updated = now();
      fs.writeFileSync(STATUS_FILE, JSON.stringify(state, null, 2), 'utf8');
    }
    console.log(JSON.stringify({ ok: true, event: 'done', agent, team }));
    process.exit(0);
  }

  if (hasopt('--agent-fail')) {
    const team = getopt('--team', 'default');
    const agent = getopt('--agent');
    const error = getopt('--error', 'Unknown error');
    if (!agent) { console.error('Missing --agent'); process.exit(1); }

    const state = readJSON(STATUS_FILE);
    if (!state) { console.error('No active session'); process.exit(1); }
    const idx = (state.running_agents || []).findIndex(a => a.agent === agent && a.team === team);
    if (idx !== -1) {
      const entry = state.running_agents[idx];
      entry.status = 'failed';
      entry.error = error;
      entry.failed_at = now();
      state.failed = state.failed || [];
      state.failed.push(entry);
      state.running_agents.splice(idx, 1);
      state.last_updated = now();
      fs.writeFileSync(STATUS_FILE, JSON.stringify(state, null, 2), 'utf8');
    }
    console.log(JSON.stringify({ ok: true, event: 'fail', agent, team, error }));
    process.exit(0);
  }

  // Dashboard generation
  const mode = getopt('--mode', 'auto');
  const compact = hasopt('--compact');

  const statusState = readMvpState();
  const hangState = readHangState();

  if (mode === 'auto') {
    if (hangState && hangState.task_name) {
      console.log(generateHangDashboard(hangState, statusState, compact));
    } else if (statusState && statusState.active) {
      console.log(generateCustomDashboard(statusState, readCustomAgents()));
    } else {
      console.log('> ⚠️ 无活跃会话。使用 `--mode hang` 或 `--mode mvp` 指定模式。');
    }
    process.exit(0);
  }

  if (mode === 'hang') {
    console.log(generateHangDashboard(hangState, statusState, compact));
    process.exit(0);
  }

  if (mode === 'mvp') {
    console.log(generateMVPDashboard(hangState, statusState, compact));
    process.exit(0);
  }

  if (mode === 'custom') {
    const customAgents = readCustomAgents();
    console.log(generateCustomDashboard(statusState, customAgents));
    process.exit(0);
  }

  console.error(`未知模式: ${mode}`);
  process.exit(1);
}

// ─── Module Exports ────────────────────────────────────────────────

module.exports = {
  generateHangDashboard,
  generateMVPDashboard,
  generateCustomDashboard,
  generateCompactBar,
  readMvpState,
  readHangState,
};

if (require.main === module) {
  cli();
}
