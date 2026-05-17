#!/usr/bin/env node
/**
 * message-router-hook.cjs — 消息级模型路由 Hook
 *
 * 每条用户消息提交前自动运行，分析任务类型，
 * 如果当前模型不是最优，自动切换供应商/模型。
 * 始终记录到 perf-tracker（切换和未切换都记录）。
 *
 * 挂载: PreToolUse 宽匹配器（Bash|Read|Grep|Glob|View|Write|Edit|Skill）
 * 节流: 60s 内最多切换一次，避免高频工具调用导致频繁换模型
 * 回退: stdin 为 Hook JSON 时，尝试从 last-message.txt 读取真实用户消息
 */

const fs = require('fs');
const path = require('path');

const HOOK_DIR = __dirname;
const IDE_ROOT = path.resolve(HOOK_DIR, '..');
const CCSWITCH = path.join(IDE_ROOT, 'helpers', 'ccswitch.cjs');
const PERF_TRACKER = path.join(IDE_ROOT, 'helpers', 'perf', 'perf-tracker.cjs');
const CLASSIFIER_PATH = path.join(IDE_ROOT, 'skills', 'kf-model-router', 'task-classifier.cjs');
const SETTINGS_PATH = path.join(IDE_ROOT, 'settings.local.json');
const ROOT = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');
const THROTTLE_FILE = path.join(ROOT, '.claude-flow', 'mvp-state', '.router-throttle.json');
const MSG_FILE = path.join(ROOT, '.claude-flow', 'perf', 'last-message.txt');

const SESSION_ID = process.env.MVP_SESSION_ID || 'mvp-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + new Date().toTimeString().slice(0,5).replace(':','');
const THROTTLE_MS = 60000; // 60s 节流

const TASK_MODEL_MAP = {
  architecture: { model: 'deepseek-v4-pro',      reason: '推理/架构设计需要强推理能力' },
  planning:     { model: 'kimi-for-planning',      reason: '规划用Kimi Planning' },
  coding:       { model: 'kimi-for-coding',        reason: '编码用Kimi Coding' },
  review:       { model: 'minimax-m2.5',           reason: '代码审查精度最高' },
  debug:        { model: 'kimi-for-coding',        reason: '调试用Kimi Coding' },
  testing:      { model: 'deepseek-v4-flash',      reason: '测试任务轻量，Flash性价比高' },
  doc:          { model: 'kimi-for-planning',      reason: '文档用Kimi Planning' },
  question:     { model: 'deepseek-v4-flash',      reason: '问答轻量，Flash足够' },
};
const DEFAULT_MODEL = 'deepseek-v4-flash';

/** 流式读取 stdin，超时后返回已读取内容 */
function readStdin(timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks = [];
    const timer = setTimeout(() => {
      process.stdin.removeAllListeners();
      try { process.stdin.destroy(); } catch {}
      resolve(Buffer.concat(chunks).toString('utf-8'));
    }, timeoutMs);
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    process.stdin.resume();
  });
}

function getCurrentModel() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')).model || 'deepseek-v4-pro';
  } catch {}
  return process.env.ANTHROPIC_MODEL || 'deepseek-v4-pro';
}

function switchModel(targetModel) {
  try {
    require('child_process').execSync(`node "${CCSWITCH}" "${targetModel}"`, { stdio: 'pipe', timeout: 10000 });
    return true;
  } catch { return false; }
}

function logTurn(sessionId, model, taskType, note, msg) {
  try {
    const snippet = (msg || '').trim().slice(0, 120).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    const msgSize = Buffer.byteLength(msg || '', 'utf8');
    const fullNote = note + ' | ' + snippet;
    const safeNote = fullNote.replace(/"/g, "'").replace(/[\n\r\t]/g, ' ');
    require('child_process').execSync(
      `node "${PERF_TRACKER}" log-turn --session "${sessionId}" --role human --model "${model}" --phase "${taskType}" --message-size "${msgSize}" --note "${safeNote}"`,
      { stdio: 'pipe', timeout: 5000 }
    );
  } catch {}
}

function logOpt(sessionId) {
  try {
    require('child_process').execSync(
      `node "${PERF_TRACKER}" log-opt --session "${sessionId}" --model-switched true`,
      { stdio: 'pipe', timeout: 5000 }
    );
  } catch {}
}

// ─── 节流检查 ────────────────────────────────────────────────────────
function throttleAllows() {
  try {
    if (fs.existsSync(THROTTLE_FILE)) {
      const data = JSON.parse(fs.readFileSync(THROTTLE_FILE, 'utf8'));
      if (data.lastCheck && (Date.now() - data.lastCheck) < THROTTLE_MS) {
        return false;
      }
    }
  } catch {}
  return true;
}

function throttleUpdate() {
  try {
    const dir = path.dirname(THROTTLE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(THROTTLE_FILE, JSON.stringify({ lastCheck: Date.now() }), 'utf8');
  } catch {}
}

// ─── 回退读取 last-message.txt ──────────────────────────────────────
function readLastMessage() {
  try {
    if (fs.existsSync(MSG_FILE)) {
      const msg = fs.readFileSync(MSG_FILE, 'utf8').trim();
      if (msg) return msg;
    }
  } catch {}
  return '';
}

// ─── 判断 stdin 是否为 Hook JSON ─────────────────────────────────────
function isHookJson(text) {
  if (!text || text.length < 3) return false;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.includes('"tool_name"')) return true;
  return false;
}

function quickClassify(text) {
  const t = text.toLowerCase();
  if (/架构|设计|权衡|选型|architecture|system design|trade-off/.test(t)) return 'architecture';
  if (/审查|评审|review|audit|审计/.test(t)) return 'review';
  if (/bug|调试|修复|debug|fix|排查|异常|错误/.test(t)) return 'debug';
  if (/测试|test|jest|pytest|覆盖率/.test(t)) return 'testing';
  if (/文档|readme|doc|documentation|说明/.test(t)) return 'doc';
  if (/计划|规划|roadmap|路线图|里程碑/.test(t)) return 'planning';
  if (/前端|ui|vue|react|css|html|界面|component|prototype/.test(t)) return 'coding';
  if (/编码|实现|写一个|创建|新增|开发|implement|code|function|class/.test(t)) return 'coding';
  if (t.length < 30) return 'question';
  return 'coding';
}

// ─── 主流程 ───
;(async () => {
  // ── 节流：60s 内不重复执行 ──
  if (!throttleAllows()) {
    process.exit(0);
  }
  throttleUpdate();

  const rawStdin = await readStdin();
  let userMessage = '';

  // ── 区分 Hook JSON vs 真实用户消息 ──
  if (isHookJson(rawStdin)) {
    // 尝试从 last-message.txt 读取真实的用户消息
    userMessage = readLastMessage();
    if (!userMessage) {
      // 回退：从 Hook JSON 中提取 skill_name 作为分类依据
      try {
        const hook = JSON.parse(rawStdin);
        const skillName = hook.tool_input?.skill || '';
        if (skillName) {
          userMessage = skillName;
        }
      } catch {}
    }
  } else {
    userMessage = rawStdin;
  }

  // ── 没有可用消息内容则跳过 ──
  if (!userMessage || userMessage.trim().length < 3) {
    process.exit(0);
  }

  let taskType = 'coding';
  try {
    if (fs.existsSync(CLASSIFIER_PATH)) {
      const TaskClassifier = require(CLASSIFIER_PATH);
      taskType = new TaskClassifier().classify(userMessage).type;
    } else {
      taskType = quickClassify(userMessage);
    }
  } catch { taskType = quickClassify(userMessage); }

  const mapping = TASK_MODEL_MAP[taskType] || TASK_MODEL_MAP[DEFAULT_MODEL];
  const currentModel = getCurrentModel();

  if (currentModel !== mapping.model) {
    console.error(`[model-router] ${taskType} → switching: ${currentModel} → ${mapping.model} (${mapping.reason})`);
    const ok = switchModel(mapping.model);
    if (ok) {
      console.error(`[model-router] switched to ${mapping.model} ✓`);
      logTurn(SESSION_ID, mapping.model, taskType, `switch: ${currentModel}→${mapping.model} ✓`, userMessage);
      logOpt(SESSION_ID);
    } else {
      console.error(`[model-router] switch failed, staying on ${currentModel}`);
      logTurn(SESSION_ID, currentModel, taskType, `switch: →${mapping.model} ✗ (failed)`, userMessage);
    }
  }
})();
