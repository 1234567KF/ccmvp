#!/usr/bin/env node
/**
 * perf-capture.cjs — 一键消息捕获工具
 *
 * 同时完成两件事:
 *   1. 写 last-message.txt（供 PreToolUse hook 后续读取）
 *   2. 直接调用 perf-tracker log-turn（实时记录，无延迟）
 *
 * 用法: node perf-capture.cjs <message>
 * 环境变量: MODEL, PHASE 可选
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const message = process.argv.slice(2).join(' ').trim();
if (!message) process.exit(0);

const IDE_ROOT = path.resolve(__dirname, '..', '..');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const STATE_DIR = path.join(ROOT, '.claude-flow', 'perf');
const MSG_FILE = path.join(STATE_DIR, 'last-message.txt');

const model = process.env.MODEL || 'deepseek-v4-flash';
const phase = process.env.PHASE || '';
const sessionId = process.env.MVP_SESSION_ID || (
  'mvp-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' +
  new Date().toTimeString().slice(0,5).replace(':','')
);

if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });

// 1. Write message file (for hook)
fs.writeFileSync(MSG_FILE, message, 'utf8');

// 2. Direct log to perf-tracker (immediate)
const snippet = message.trim().slice(0, 120).replace(/["\n\r]/g, '');
const msgSize = Buffer.byteLength(message, 'utf8');
const note = 'capture' + (snippet ? ' | ' + snippet : '');

try {
  const out = execSync(
    `node "${path.join(IDE_ROOT, 'helpers', 'perf', 'perf-tracker.cjs')}" log-turn ` +
    `--session "${sessionId}" --role human --model "${model}" ` +
    `--phase "${phase}" --message-size "${msgSize}" ` +
    `--note "${note.replace(/"/g, "'")}"`,
    { stdio: 'pipe', timeout: 5000 }
  );
  process.stdout.write(out);
} catch {}
