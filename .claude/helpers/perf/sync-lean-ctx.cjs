#!/usr/bin/env node
/**
 * sync-lean-ctx.cjs — lean-ctx gain → perf-tracker 桥接
 *
 * Stop 时运行。拉取 lean-ctx gain --json（全局压缩累积数据），
 * 计算本 session 增量，写入 perf-tracker optimizations。
 *
 * lean-ctx gain 追踪的是命令输出压缩（非 API token），
 * 但它是目前唯一有真实 token 节省数据的来源。
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PERF_DIR = path.join(ROOT, '.claude-flow', 'perf');
const OPTS_FILE = path.join(PERF_DIR, 'optimizations.jsonl');
const SESSIONS_FILE = path.join(PERF_DIR, 'sessions.json');
const BASELINE_FILE = path.join(PERF_DIR, '.lean-ctx-baseline.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function getActiveSessionId() {
  const sessions = readJSON(SESSIONS_FILE, {});
  const ids = Object.keys(sessions);
  if (ids.length === 0) return null;
  let latest = ids[0];
  let latestTime = sessions[ids[0]].last_activity || sessions[ids[0]].created || '';
  for (const id of ids) {
    const t = sessions[id].last_activity || sessions[id].created || '';
    if (t > latestTime) { latestTime = t; latest = id; }
  }
  return latest;
}

function getGainData() {
  try {
    const raw = execSync('lean-ctx gain --json', {
      timeout: 5000, encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const data = JSON.parse(raw);
    return data.summary || null;
  } catch (e) {
    console.error('[sync-lean-ctx] lean-ctx gain query failed:', e.message);
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const sessionId = args.includes('--session')
    ? args[args.indexOf('--session') + 1]
    : getActiveSessionId();

  if (!sessionId) {
    process.exit(0);
  }

  const gain = getGainData();
  if (!gain || !gain.total_commands) {
    process.exit(0);
  }

  // 读取上次基线，计算本 session 增量
  const baseline = readJSON(BASELINE_FILE, {
    input_tokens: 0,
    output_tokens: 0,
    tokens_saved: 0,
    total_commands: 0,
    avoided_usd: 0,
  });

  const deltaInput = Math.max(0, (gain.input_tokens || 0) - (baseline.input_tokens || 0));
  const deltaOutput = Math.max(0, (gain.output_tokens || 0) - (baseline.output_tokens || 0));
  const deltaSaved = Math.max(0, (gain.tokens_saved || 0) - (baseline.tokens_saved || 0));
  const deltaCommands = Math.max(0, (gain.total_commands || 0) - (baseline.total_commands || 0));
  const deltaUSD = Math.max(0, (gain.avoided_usd || 0) - (baseline.avoided_usd || 0));

  // 更新基线
  writeJSON(BASELINE_FILE, {
    input_tokens: gain.input_tokens || 0,
    output_tokens: gain.output_tokens || 0,
    tokens_saved: gain.tokens_saved || 0,
    total_commands: gain.total_commands || 0,
    avoided_usd: gain.avoided_usd || 0,
    updated_at: new Date().toISOString(),
  });

  // 没有增量就算了
  if (deltaSaved === 0 && deltaCommands === 0) {
    process.exit(0);
  }

  // 写入 optimization 条目
  const entry = {
    opt_id: 'lean-ctx-' + sessionId,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    model_switched: false,
    mechanisms: {
      lean_ctx: {
        commands: deltaCommands,
        input_tokens: deltaInput,
        output_tokens: deltaOutput,
        saved: deltaSaved,
        avoided_usd: parseFloat(deltaUSD.toFixed(6)),
        gain_rate_pct: gain.gain_rate_pct || 0,
        source: 'lean-ctx gain (command output compression)',
      }
    }
  };

  fs.appendFileSync(OPTS_FILE, JSON.stringify(entry) + '\n');
  console.error(`[sync-lean-ctx] +${deltaCommands} cmds, +${deltaSaved} tok saved, +$${deltaUSD.toFixed(4)}`);
}

main();
