#!/usr/bin/env node
/**
 * cache-warmup.cjs — 共享前缀缓存预热（MVP Pipeline 专用）
 *
 * 并发 spawn 三队前先做一次预热请求，让共享前缀命中 DeepSeek/Kimi/MiniMax 的 KV 缓存。
 * 否则三队同时首发 → 全部 miss → 失去缓存优势。
 *
 * 【设计取舍】
 * 本脚本不直接调用 LLM API（避免引入 OpenAI SDK 依赖和密钥管理复杂度），
 * 而是：
 *   1. 将共享前缀（MVP prefix）+ 一个占位 user msg 写入一个"预热 prompt"文件
 *   2. 标记预热时间戳到 .cache-warm.json
 *   3. 提供 should-warm 查询：若最近 4 分钟内未预热（或首次）→ 推荐主会话执行一次
 *      真正的 API 调用由 Qoder 主会话通过 Agent 工具 / 模型路由隐式完成
 *
 * 这样既能让共享前缀在 spawn 前实际"被请求过"（由主会话的下一次 LLM 调用触发），
 * 又避免本脚本承担 API 密钥和网络调用责任（秩序原则：一个脚本一件事）。
 *
 * 用法:
 *   node helpers/cache-warmup.cjs emit-prompt                  生成预热 prompt 文本（stdout，可由主会话送入 LLM）
 *   node helpers/cache-warmup.cjs mark                         记录预热完成时间戳
 *   node helpers/cache-warmup.cjs should-warm [--ttl-ms 240000] 返回是否需要预热（exit 0=需要，1=不需要）
 *   node helpers/cache-warmup.cjs status                       查询预热状态
 *   node helpers/cache-warmup.cjs clear                        清除预热记录
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(ROOT, '.claude-flow', 'mvp-state');
const WARM_FILE = path.join(STATE_DIR, '.cache-warm.json');

// DeepSeek 缓存 TTL 5min，保留 1min 缓冲 → 默认 4min 内视为仍有效
const DEFAULT_TTL_MS = 4 * 60 * 1000;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

// ─── 获取共享前缀（从 canonical 源文件加载）───
const SHARED_PREFIX_FILE = path.join(ROOT, 'rules', 'shared-prefix.md');

function getSharedPrefix() {
  try {
    if (fs.existsSync(SHARED_PREFIX_FILE)) {
      return fs.readFileSync(SHARED_PREFIX_FILE, 'utf8').trim();
    }
  } catch {}
  // Fallback（仅当文件不存在）
  return [
    '### SHARED PREFIX START',
    '## Project',
    'You work in an AI coding IDE, multi-agent MVP rapid-prototyping system.',
    '## Tools & Constraints',
    'Available tools: Read/Write/Edit/Bash/Grep/Glob.',
    '## Communication',
    'Use clear, concise responses.',
    '### SHARED PREFIX END',
  ].join('\n');
}
function emitPrompt() {
  const prefix = getSharedPrefix();
  return [
    prefix,
    '',
    '## 预热占位',
    '这是一次缓存预热请求，请简单回复"ok"即可，无需实际处理任务。',
    '',
    'Context-id: /mvp warmup',
  ].join('\n');
}

// ─── 标记预热完成 ───
function mark() {
  const record = {
    warmed_at: new Date().toISOString(),
    warmed_at_ms: Date.now(),
    prefix_hash: hashPrefix(getSharedPrefix()),
  };
  writeJSON(WARM_FILE, record);
  return { ok: true, ...record };
}

function hashPrefix(s) {
  // 简易哈希（无需强加密），用于检测前缀是否变更
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}

// ─── 判断是否需要预热 ───
function shouldWarm({ ttlMs } = {}) {
  const ttl = parseInt(ttlMs, 10) || DEFAULT_TTL_MS;
  const record = readJSON(WARM_FILE, null);
  if (!record) return { warm_needed: true, reason: '首次执行，尚未预热' };

  const currentHash = hashPrefix(getSharedPrefix());
  if (record.prefix_hash !== currentHash) {
    return { warm_needed: true, reason: '共享前缀已变更，缓存失效' };
  }

  const elapsed = Date.now() - (record.warmed_at_ms || 0);
  if (elapsed > ttl) {
    return {
      warm_needed: true,
      reason: `上次预热已过期（${Math.round(elapsed / 1000)}s > ${Math.round(ttl / 1000)}s）`,
    };
  }

  return {
    warm_needed: false,
    reason: `缓存仍有效（距上次预热 ${Math.round(elapsed / 1000)}s，TTL ${Math.round(ttl / 1000)}s）`,
    warmed_at: record.warmed_at,
  };
}

// ─── 状态查询 ───
function status() {
  const record = readJSON(WARM_FILE, null);
  if (!record) return { active: false };

  const elapsed = Date.now() - (record.warmed_at_ms || 0);
  const currentHash = hashPrefix(getSharedPrefix());

  return {
    active: true,
    warmed_at: record.warmed_at,
    elapsed_seconds: Math.round(elapsed / 1000),
    prefix_hash: record.prefix_hash,
    current_prefix_hash: currentHash,
    prefix_match: record.prefix_hash === currentHash,
  };
}

// ─── 清除 ───
function clear() {
  if (fs.existsSync(WARM_FILE)) fs.unlinkSync(WARM_FILE);
  return { ok: true };
}

// ─── CLI ───
function cli() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('cache-warmup.cjs — 共享前缀缓存预热');
    console.log('');
    console.log('命令:');
    console.log('  emit-prompt   生成预热 prompt 文本（stdout）');
    console.log('  mark          记录预热完成时间戳');
    console.log('  should-warm   是否需要预热 [--ttl-ms 240000]');
    console.log('  status        查询预热状态');
    console.log('  clear         清除预热记录');
    process.exit(0);
  }

  const cmd = args[0];
  const rest = args.slice(1);

  function getopt(name, fallback) {
    const idx = rest.indexOf(name);
    if (idx === -1) return fallback;
    return rest[idx + 1] || fallback;
  }

  try {
    switch (cmd) {
      case 'emit-prompt': {
        process.stdout.write(emitPrompt());
        process.exit(0);
      }
      case 'mark': {
        console.log(JSON.stringify(mark(), null, 2));
        process.exit(0);
      }
      case 'should-warm': {
        const result = shouldWarm({ ttlMs: getopt('--ttl-ms') });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.warm_needed ? 0 : 1);
      }
      case 'status': {
        console.log(JSON.stringify(status(), null, 2));
        process.exit(0);
      }
      case 'clear': {
        console.log(JSON.stringify(clear(), null, 2));
        process.exit(0);
      }
      default: {
        console.error(`未知命令: ${cmd}`);
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(`[cache-warmup] 错误: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  cli();
}

module.exports = {
  emitPrompt,
  mark,
  shouldWarm,
  status,
  clear,
  getSharedPrefix,
};
