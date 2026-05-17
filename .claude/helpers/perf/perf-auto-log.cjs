#!/usr/bin/env node
/**
 * perf-auto-log.cjs — 通用对话追踪钩子（全工具覆盖）
 *
 * PreToolUse 阶段自动运行，记录用户消息到 perf-tracker。
 * 不依赖技能触发，覆盖所有工具类型（Bash/Read/Write/Edit/Grep/Glob 等）。
 *
 * 数据来源（优先级）:
 *   1. last-message.txt 文件（AI 在回复前写入的用户消息原文）
 *   2. 纯自动记录（仅模型/时间戳，无消息内容）
 *
 * 去重: 同一会话 30 秒内只记 1 次（避免同一条消息的多次工具调用重复记录）
 */

const fs = require('fs');
const path = require('path');

const IDE_ROOT = path.resolve(__dirname, '..', '..');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SETTINGS_PATH = path.join(IDE_ROOT, 'settings.local.json');
const PERF_TRACKER = path.join(IDE_ROOT, 'helpers', 'perf', 'perf-tracker.cjs');
const STATE_DIR = path.join(ROOT, '.claude-flow', 'perf');
const STATE_FILE = path.join(STATE_DIR, 'hook-state.json');
const MSG_FILE = path.join(STATE_DIR, 'last-message.txt');

const SESSION_ID = process.env.MVP_SESSION_ID || (
  'mvp-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' +
  new Date().toTimeString().slice(0,5).replace(':','')
);

// ─── 读取当前模型 ───
function getCurrentModel() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')).model || 'deepseek-v4-flash';
  } catch {}
  return process.env.ANTHROPIC_MODEL || 'deepseek-v4-flash';
}

// ─── 状态管理 ───
function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {}
  return { sessions: {} };
}

function writeState(state) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
  } catch {}
}

// ─── 读取用户消息 ───
function readUserMessage() {
  try {
    if (fs.existsSync(MSG_FILE)) {
      const msg = fs.readFileSync(MSG_FILE, 'utf8').trim();
      if (msg) {
        fs.unlinkSync(MSG_FILE);
        return msg;
      }
    }
  } catch {}
  return '';
}

// ─── 去重检查 ───
function shouldLog(state) {
  const now = Date.now();
  const session = state.sessions[SESSION_ID];
  if (!session) return true;
  return (now - session.last_logged_at) > 30000;
}

// ─── 执行日志 ───
function logTurn(message) {
  const model = getCurrentModel();
  const snippet = message.trim().slice(0, 120).replace(/["\n\r]/g, '');
  const msgSize = Buffer.byteLength(message || '', 'utf8');
  const note = 'auto' + (snippet ? ' | ' + snippet : '');
  const phase = process.env.CLAUDE_PHASE || '';

  try {
    require('child_process').execSync(
      `node "${PERF_TRACKER}" log-turn --session "${SESSION_ID}" --role human --model "${model}" --phase "${phase}" --message-size "${msgSize}" --note "${note.replace(/"/g, "'")}"`,
      { stdio: 'pipe', timeout: 5000 }
    );
  } catch {}
}

// ─── 主流程 ───
function main() {
  const state = readState();
  if (!shouldLog(state)) return;

  const message = readUserMessage();
  logTurn(message);

  if (!state.sessions[SESSION_ID]) state.sessions[SESSION_ID] = {};
  state.sessions[SESSION_ID].last_logged_at = Date.now();
  writeState(state);
}

main();
