#!/usr/bin/env node
/**
 * gate-executor.cjs — 反转门控硬性阻断自动化执行器（通用 IDE 适配版）
 *
 * 实现 AC0.5 定义的反转门控硬 Gate。
 * 从"Team Lead 手动执行"变为可自动化、可测试的独立脚本。
 *
 * 【通用 IDE 适配说明】
 * 原 Claude Code 版使用 AskUserQuestion API 弹窗交互，本版改为：
 * - 问卷输出到控制台 + 文件（gate-questionnaire.md）供用户查看
 * - 用户手动回答后通过 --answer <json-file> 提交
 * - 或直接在对话中回答，由 AI 解析后调用 submitAnswers
 * - 无弹窗、无阻塞等待，完全基于文件系统状态机
 *
 * 状态机:
 *   IDLE → SCANNING → [有 CRITICAL? → WAITING_ANSWER → BROADCAST] → PASSED
 *                    [无 CRITICAL? → PASSED (零延迟)]
 *
 * 用法:
 *   node {IDE_ROOT}/helpers/gate-executor.cjs --scan <red-alignment.md> <blue-alignment.md> <green-alignment.md>
 *   node {IDE_ROOT}/helpers/gate-executor.cjs --status              # 查看当前 Gate 状态
 *   node {IDE_ROOT}/helpers/gate-executor.cjs --answer <json-file>  # 用户回答问卷
 *   node {IDE_ROOT}/helpers/gate-executor.cjs --check-spawn          # spawnStage1 前置检查
 *   node {IDE_ROOT}/helpers/gate-executor.cjs --reset               # 重置 Gate 状态
 *
 * API:
 *   const gate = require('./gate-executor.cjs');
 *   gate.execute({ red, blue, green }) → { status, blocked, questions }
 *   gate.checkSpawnAllowed() → true/false
 *   gate.submitAnswers(answers) → { status }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const GATE_STATE_DIR = path.join(ROOT, '.claude-flow', 'gate-state');
const GATE_BROADCAST_DIR = path.join(ROOT, '.claude-flow', 'gate-broadcast');
const GATE_LOG_PATH = path.join(ROOT, '.claude', 'logs', 'inversion-gate.jsonl');
const LATEST_STATE_FILE = path.join(GATE_STATE_DIR, 'latest.json');

const STATE_IDLE = 'IDLE';
const STATE_SCANNING = 'SCANNING';
const STATE_WAITING_ANSWER = 'WAITING_ANSWER';
const STATE_BROADCAST = 'BROADCAST';
const STATE_PASSED = 'PASSED';

const CRITICAL_MARKER = /\[ASSUMPTION:CRITICAL\]/gi;
const MAX_CRITICAL_PER_TEAM = 3;
const MAX_MERGED_QUESTIONS = 5;
const ANSWER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─── UUID ───
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── Ensure directories ───
function ensureDirs() {
  [GATE_STATE_DIR, GATE_BROADCAST_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  const logDir = path.dirname(GATE_LOG_PATH);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
}

// ─── Read Gate state ───
function readState() {
  if (!fs.existsSync(LATEST_STATE_FILE)) return { status: STATE_IDLE };
  try {
    return JSON.parse(fs.readFileSync(LATEST_STATE_FILE, 'utf8'));
  } catch {
    return { status: STATE_IDLE };
  }
}

// ─── Write Gate state ───
function writeState(state) {
  ensureDirs();
  state.last_updated = new Date().toISOString();
  fs.writeFileSync(LATEST_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ─── Write Gate log ───
function appendLog(entry) {
  ensureDirs();
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(GATE_LOG_PATH, JSON.stringify(logEntry) + '\n', 'utf8');
}

// ─── Scan a single alignment.md for CRITICAL markers ───
function scanFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { file: filePath, error: 'File not found', criticals: [] };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const criticals = [];

  for (let i = 0; i < lines.length; i++) {
    if (CRITICAL_MARKER.test(lines[i])) {
      // Extract the assumption text — look at surrounding lines
      const contextStart = Math.max(0, i - 2);
      const contextEnd = Math.min(lines.length, i + 3);
      const context = lines.slice(contextStart, contextEnd).join('\n').trim();

      criticals.push({
        line: i + 1,
        markerLine: lines[i].trim(),
        context,
        hash: crypto.createHash('sha256').update(context).digest('hex').substring(0, 12),
      });
    }
  }

  // Limit per team
  const limited = criticals.slice(0, MAX_CRITICAL_PER_TEAM);
  const dropped = criticals.length > MAX_CRITICAL_PER_TEAM
    ? criticals.slice(MAX_CRITICAL_PER_TEAM).length : 0;

  return { file: filePath, criticals: limited, dropped };
}

// ─── Deduplicate and merge criticals across teams ───
function mergeCriticals(redResult, blueResult, greenResult) {
  const teamMap = {
    red: redResult,
    blue: blueResult,
    green: greenResult,
  };

  // Collect all criticals with team labels
  const all = [];
  for (const [team, result] of Object.entries(teamMap)) {
    if (result.error) continue;
    for (const c of result.criticals) {
      all.push({ ...c, team });
    }
  }

  if (all.length === 0) return { questions: [], hasCritical: false };

  // Semantically merge by grouping similar criticals
  // Simple approach: group by hash similarity (first 8 chars)
  const groups = {};
  for (const c of all) {
    const shortHash = c.hash.substring(0, 8);
    if (!groups[shortHash]) groups[shortHash] = [];
    groups[shortHash].push(c);
  }

  // Build questionnaire: each group becomes one question
  const questions = [];
  for (const [hash, items] of Object.entries(groups)) {
    // Generate question from the group's context
    const primaryItem = items[0];
    const teams = items.map(i => i.team).join('/');

    // Extract the core question from the marker line
    const markerText = primaryItem.markerLine.replace(/\[ASSUMPTION:CRITICAL\]\s*/gi, '').trim();

    // Generate 2+ options based on the assumption
    const options = [
      { label: 'A', text: markerText || '保持当前假设', consequence: '按此方向继续' },
      { label: 'B', text: '需要调整（请在下方说明）', consequence: '暂停等待调整' },
    ];

    // Default selection: 红队 > 蓝队 > 绿队
    const priorityOrder = ['red', 'blue', 'green'];
    const defaultTeam = priorityOrder.find(t => teams.includes(t)) || 'unknown';

    questions.push({
      id: `Q-${hash.substring(0, 6)}`,
      text: markerText || `[${teams}] 关键假设需要确认`,
      teams_involved: teams,
      team_items: items.map(i => ({ team: i.team, line: i.line, file: i.file })),
      options,
      default_option: 'A',
      default_source: defaultTeam,
      merged_count: items.length,
    });
  }

  // Limit to TOP N questions by merged_count
  const sorted = questions.sort((a, b) => b.merged_count - a.merged_count);
  const limited = sorted.slice(0, MAX_MERGED_QUESTIONS);
  const skipped = sorted.length > MAX_MERGED_QUESTIONS
    ? sorted.slice(MAX_MERGED_QUESTIONS).length : 0;

  return { questions: limited, skipped, hasCritical: limited.length > 0 };
}

// ─── Main execution ───
function execute({ red, blue, green, taskName } = {}) {
  const execId = uuid();
  const currentState = readState();

  // State validation
  if (currentState.status !== STATE_IDLE && currentState.status !== STATE_PASSED) {
    return {
      ok: false,
      error: `Gate 当前状态为 ${currentState.status}，不允许重新扫描。请先 --reset`,
      currentState,
    };
  }

  // Transition to SCANNING
  writeState({ status: STATE_SCANNING, execId, taskName, startedAt: new Date().toISOString() });

  // Scan all three team files
  const redResult = scanFile(red);
  const blueResult = scanFile(blue);
  const greenResult = scanFile(green);

  // Merge and deduplicate
  const merged = mergeCriticals(redResult, blueResult, greenResult);

  const scanResults = {
    red: { file: red, count: redResult.criticals.length, dropped: redResult.dropped, error: redResult.error },
    blue: { file: blue, count: blueResult.criticals.length, dropped: blueResult.dropped, error: blueResult.error },
    green: { file: green, count: greenResult.criticals.length, dropped: greenResult.dropped, error: greenResult.error },
  };

  if (!merged.hasCritical) {
    // Zero questions → PASS immediately (zero delay)
    const state = {
      status: STATE_PASSED,
      execId,
      taskName,
      startedAt: new Date().toISOString(),
      passedAt: new Date().toISOString(),
      scanResults,
      hasCritical: false,
      questions: [],
      zeroQuestionPass: true,
    };
    writeState(state);
    appendLog({
      event: 'gate_passed',
      execId,
      taskName,
      hasCritical: false,
      zeroQuestion: true,
      scanResults,
    });
    return { ok: true, status: STATE_PASSED, execId, hasCritical: false, scanResults };
  }

  // Has CRITICAL → generate questionnaire → block
  const state = {
    status: STATE_WAITING_ANSWER,
    execId,
    taskName,
    startedAt: new Date().toISOString(),
    scanResults,
    hasCritical: true,
    questions: merged.questions,
    skipped: merged.skipped,
    answerTimeoutMs: ANSWER_TIMEOUT_MS,
    answerTimeoutAt: new Date(Date.now() + ANSWER_TIMEOUT_MS).toISOString(),
    zeroQuestionPass: false,
  };
  writeState(state);

  // Write broadcast placeholder (to be filled after answers)
  const broadcast = {
    execId,
    taskName,
    questions: merged.questions,
    answers: null,
    answeredAt: null,
  };
  const broadcastPath = path.join(GATE_BROADCAST_DIR, `${execId}.json`);
  fs.writeFileSync(broadcastPath, JSON.stringify(broadcast, null, 2), 'utf8');

  appendLog({
    event: 'gate_waiting_answer',
    execId,
    taskName,
    questionCount: merged.questions.length,
    skipped: merged.skipped,
    scanResults,
  });

  return {
    ok: true,
    status: STATE_WAITING_ANSWER,
    execId,
    hasCritical: true,
    questions: merged.questions,
    skipped: merged.skipped,
    scanResults,
  };
}

// ─── Submit answers ───
function submitAnswers(answers) {
  const state = readState();

  if (state.status !== STATE_WAITING_ANSWER) {
    return { ok: false, error: `Gate 当前状态为 ${state.status}，不允许提交答案`, state };
  }

  // Check timeout
  if (state.answerTimeoutAt && new Date() > new Date(state.answerTimeoutAt)) {
    // Timeout — auto-select defaults
    const autoAnswers = {};
    for (const q of (state.questions || [])) {
      autoAnswers[q.id] = q.default_option;
    }
    answers = autoAnswers;
    state.autoAnswered = true;
  }

  // Transition to BROADCAST
  state.status = STATE_BROADCAST;
  state.answers = answers;
  state.answeredAt = new Date().toISOString();
  state.autoAnswered = state.autoAnswered || false;
  writeState(state);

  // Update broadcast file
  const broadcastPath = path.join(GATE_BROADCAST_DIR, `${state.execId}.json`);
  if (fs.existsSync(broadcastPath)) {
    const broadcast = JSON.parse(fs.readFileSync(broadcastPath, 'utf8'));
    broadcast.answers = answers;
    broadcast.answeredAt = new Date().toISOString();
    broadcast.autoAnswered = state.autoAnswered;
    fs.writeFileSync(broadcastPath, JSON.stringify(broadcast, null, 2), 'utf8');
  }

  // Transition to PASSED
  state.status = STATE_PASSED;
  state.passedAt = new Date().toISOString();
  writeState(state);

  appendLog({
    event: 'gate_passed',
    execId: state.execId,
    taskName: state.taskName,
    hasCritical: true,
    questionCount: (state.questions || []).length,
    answerCount: Object.keys(answers).length,
    autoAnswered: state.autoAnswered,
  });

  return { ok: true, status: STATE_PASSED, execId: state.execId, autoAnswered: state.autoAnswered };
}

// ─── Check if spawn is allowed ───
function checkSpawnAllowed() {
  const state = readState();
  return state.status === STATE_PASSED;
}

// ─── Get broadcast answers for agent injection ───
function getBroadcastAnswers(execId) {
  if (execId) {
    const broadcastPath = path.join(GATE_BROADCAST_DIR, `${execId}.json`);
    if (!fs.existsSync(broadcastPath)) return null;
    return JSON.parse(fs.readFileSync(broadcastPath, 'utf8'));
  }
  // Return latest broadcast
  const state = readState();
  if (!state.execId) return null;
  const broadcastPath = path.join(GATE_BROADCAST_DIR, `${state.execId}.json`);
  if (!fs.existsSync(broadcastPath)) return null;
  return JSON.parse(fs.readFileSync(broadcastPath, 'utf8'));
}

// ─── Generate the questionnaire display for AskUserQuestion ───
function generateQuestionnaire(questions) {
  if (!questions || questions.length === 0) return null;

  return questions.map((q, idx) => ({
    question: q.text,
    header: `问题${idx + 1}`,
    options: q.options.map(o => ({
      label: o.label,
      description: o.consequence,
    })),
    multiSelect: false,
  }));
}

// ─── Generate agent constraint injection prompt ───
function generateConstraintPrompt(execId) {
  const state = readState();
  if (state.status !== STATE_PASSED) return null;

  const broadcast = getBroadcastAnswers(execId || state.execId);
  if (!broadcast || !broadcast.answers) return null;

  const lines = ['## Gate 2.0 反转门控 — 已确认约束'];
  lines.push('');
  for (const q of (state.questions || [])) {
    const answerKey = broadcast.answers[q.id];
    const option = q.options.find(o => o.label === answerKey);
    lines.push(`- **${q.text}** → ${option ? option.text : answerKey}`);
    lines.push(`  (来源: ${q.teams_involved}, 默认: ${q.default_source})`);
  }
  lines.push('');
  lines.push('以上为反转门控确认的约束，执行中 MUST 遵守。');

  return lines.join('\n');
}

// ─── Reset gate state ───
function reset() {
  ensureDirs();
  writeState({ status: STATE_IDLE });
  return { ok: true, status: STATE_IDLE };
}

// ─── Check answer timeout ───
function checkTimeout() {
  const state = readState();
  if (state.status !== STATE_WAITING_ANSWER) return { timedOut: false, state };

  const timeoutAt = new Date(state.answerTimeoutAt);
  const now = new Date();
  const timedOut = now > timeoutAt;
  const remaining = Math.max(0, timeoutAt - now);

  return {
    timedOut,
    remaining,
    timeoutAt: state.answerTimeoutAt,
    state,
  };
}

// ─── CLI ───
function cli() {
  const args = process.argv.slice(2);

  if (args.includes('--scan')) {
    const fileIdx = args.indexOf('--scan') + 1;
    const files = args.slice(fileIdx, fileIdx + 3);
    if (files.length < 3) {
      console.error('Usage: gate-executor.cjs --scan <red.md> <blue.md> <green.md> [--task "name"]');
      process.exit(1);
    }
    const taskIdx = args.indexOf('--task');
    const taskName = taskIdx !== -1 ? args[taskIdx + 1] : null;

    const result = execute({ red: files[0], blue: files[1], green: files[2], taskName });
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) process.exit(1);
    if (result.status === STATE_WAITING_ANSWER) {
      console.log('\n📋 问卷:');
      const questionnaire = generateQuestionnaire(result.questions);
      console.log(JSON.stringify(questionnaire, null, 2));
      process.exit(2); // Exit code 2 = gate blocked
    }
    process.exit(0);
  }

  if (args.includes('--status')) {
    const state = readState();
    const timeout = checkTimeout();
    console.log(JSON.stringify({ state, timeout }, null, 2));
    process.exit(0);
  }

  if (args.includes('--answer')) {
    const fileIdx = args.indexOf('--answer') + 1;
    const answersFile = args[fileIdx];
    if (!answersFile || !fs.existsSync(answersFile)) {
      console.error('Usage: gate-executor.cjs --answer <answers.json>');
      process.exit(1);
    }
    const answers = JSON.parse(fs.readFileSync(answersFile, 'utf8'));
    const result = submitAnswers(answers);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.includes('--check-spawn')) {
    const allowed = checkSpawnAllowed();
    console.log(JSON.stringify({ spawnAllowed: allowed, status: readState().status }));
    process.exit(allowed ? 0 : 1);
  }

  if (args.includes('--broadcast')) {
    const execIdx = args.indexOf('--broadcast');
    const execId = execIdx + 1 < args.length && !args[execIdx + 1].startsWith('--')
      ? args[execIdx + 1] : null;
    const broadcast = getBroadcastAnswers(execId);
    if (!broadcast) {
      console.log('No broadcast found.');
      process.exit(1);
    }
    console.log(JSON.stringify(broadcast, null, 2));
    process.exit(0);
  }

  if (args.includes('--constraint-prompt')) {
    const execIdx = args.indexOf('--constraint-prompt');
    const execId = execIdx + 1 < args.length && !args[execIdx + 1].startsWith('--')
      ? args[execIdx + 1] : null;
    const prompt = generateConstraintPrompt(execId);
    if (!prompt) {
      console.log('# No gate constraints (Gate not passed)');
      process.exit(1);
    }
    console.log(prompt);
    process.exit(0);
  }

  if (args.includes('--reset')) {
    const result = reset();
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (args.includes('--timeout-check')) {
    const result = checkTimeout();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.timedOut ? 2 : 0);
  }

  // Default: show usage
  console.log('gate-executor.cjs — 反转门控硬性阻断自动化执行器');
  console.log('  扫描:  node gate-executor.cjs --scan <red.md> <blue.md> <green.md> [--task "name"]');
  console.log('  状态:  node gate-executor.cjs --status');
  console.log('  回答:  node gate-executor.cjs --answer <answers.json>');
  console.log('  检查:  node gate-executor.cjs --check-spawn');
  console.log('  广播:  node gate-executor.cjs --broadcast [execId]');
  console.log('  约束:  node gate-executor.cjs --constraint-prompt [execId]');
  console.log('  超时:  node gate-executor.cjs --timeout-check');
  console.log('  重置:  node gate-executor.cjs --reset');

  if (args.length === 0) process.exit(0);
}

if (require.main === module) {
  cli();
}

module.exports = {
  execute,
  submitAnswers,
  checkSpawnAllowed,
  getBroadcastAnswers,
  generateQuestionnaire,
  generateConstraintPrompt,
  checkTimeout,
  readState,
  reset,
  STATE_IDLE,
  STATE_SCANNING,
  STATE_WAITING_ANSWER,
  STATE_BROADCAST,
  STATE_PASSED,
};

