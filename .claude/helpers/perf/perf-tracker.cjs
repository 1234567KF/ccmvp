#!/usr/bin/env node
/**
 * perf-tracker.cjs v1.0 — MVP 执行追踪面板
 *
 * 追踪 per-conversation-turn + per-A2A-message 的模型、Token、优化节省。
 * 数据存储于 .claude-flow/perf/，与 token-tracker 的 skill-traces 隔离。
 *
 * 用法:
 *   log-turn  记录一次人机对话轮次
 *   log-a2a   记录一次 Agent→Agent 消息
 *   log-opt   记录某轮次的优化节省明细
 *   dashboard 输出实时看板（stdout）
 *   report    生成 Markdown 报告文件
 *   list      列出所有会话
 *   reset     清空 perf 数据
 *
 * 优化节省规则:
 *   - exclude_from_savings=true 的机制（如 model_switch）不计入 Token 节省
 *   - 仅 token_saving 类别的机制参与节省汇总
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PERF_DIR = path.join(ROOT, '.claude-flow', 'perf');
const TURNS_FILE = path.join(PERF_DIR, 'turns.jsonl');
const OPTS_FILE = path.join(PERF_DIR, 'optimizations.jsonl');
const SESSIONS_FILE = path.join(PERF_DIR, 'sessions.json');
const REGISTRY_FILE = path.join(__dirname, 'optimization-registry.json');
const PRICING_FILE = path.join(__dirname, 'pricing.json');

// ─── Ensure directory ───
function ensureDir() {
  if (!fs.existsSync(PERF_DIR)) fs.mkdirSync(PERF_DIR, { recursive: true });
}

// ─── Read registry ───
let _registry = null;
function getRegistry() {
  if (_registry) return _registry;
  try {
    _registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch {
    _registry = { mechanisms: [], categories: { token_saving: [], cost_only: [] } };
  }
  return _registry;
}

function getSavingMechanisms() {
  const reg = getRegistry();
  return reg.mechanisms.filter(m => !m.exclude_from_savings);
}

// ─── Read pricing ───
let _pricingCache = null;
function getPricing() {
  if (_pricingCache) return _pricingCache;
  try {
    _pricingCache = JSON.parse(fs.readFileSync(PRICING_FILE, 'utf8'));
  } catch {
    _pricingCache = { models: [], currency: '¥', updated: 'unknown' };
  }
  return _pricingCache;
}

function lookupPricing(modelId) {
  const p = getPricing();
  // Try exact match, then short name, then fuzzy
  const m = p.models.find(m => m.id === modelId || m.short === modelId || modelId.includes(m.short) || m.id.includes(modelId));
  return m || null;
}

function calcCost(modelId, uncachedTokens, cachedTokens, outputTokens) {
  const pr = lookupPricing(modelId);
  if (!pr) return null;
  const inputCost = (uncachedTokens / 1e6) * pr.input_per_mtok + (cachedTokens / 1e6) * pr.cache_read_per_mtok;
  const outputCost = (outputTokens / 1e6) * pr.output_per_mtok;
  return { model: pr.name, input: inputCost, output: outputCost, total: inputCost + outputCost };
}

// ─── Session helpers ───
function readSessions() {
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); }
  catch { return {}; }
}

function writeSessions(sessions) {
  ensureDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

function touchSession(sessionId) {
  const sessions = readSessions();
  if (!sessions[sessionId]) {
    sessions[sessionId] = { created: new Date().toISOString(), last_activity: new Date().toISOString(), turn_count: 0, a2a_count: 0 };
  } else {
    sessions[sessionId].last_activity = new Date().toISOString();
  }
  writeSessions(sessions);
  return sessionId;
}

function bumpSessionCount(sessionId, type) {
  const sessions = readSessions();
  if (sessions[sessionId]) {
    if (type === 'turn') sessions[sessionId].turn_count++;
    if (type === 'a2a') sessions[sessionId].a2a_count++;
    sessions[sessionId].last_activity = new Date().toISOString();
    writeSessions(sessions);
  }
}

function getActiveSessionId() {
  // Use env var, or generate from date
  return process.env.MVP_SESSION_ID || ('mvp-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + new Date().toTimeString().slice(0, 5).replace(':', ''));
}

function nextTurnId(sessionId) {
  const sessions = readSessions();
  const s = sessions[sessionId];
  const count = s ? (s.turn_count + (s.a2a_count || 0) + 1) : 1;
  return 't' + String(count).padStart(3, '0');
}

function genId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

// ─── Append to JSONL ───
function appendToFile(filePath, entry) {
  ensureDir();
  try { fs.appendFileSync(filePath, JSON.stringify(entry) + '\n'); }
  catch (e) { console.error('[perf-tracker] write error:', e.message); }
}

// ─── Read JSONL ───
function readJSONL(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// ════════════════════════════════════════════════════════════
// COMMAND: log-turn
// ════════════════════════════════════════════════════════════
function cmdLogTurn(args) {
  const p = parseArgs(args);
  const sessionId = p.session || getActiveSessionId();
  const parentTurnId = p.parent || null;

  touchSession(sessionId);
  const id = nextTurnId(sessionId);

  const entry = {
    type: 'turn',
    id,
    session_id: sessionId,
    parent_turn_id: parentTurnId,
    phase: p.phase || '',
    timestamp: new Date().toISOString(),
    role: p.role || 'ai',
    model_used: p.model || 'unknown',
    tokens: {
      input_uncached: parseInt(p.tokensInUncached) || 0,
      input_cached: parseInt(p.tokensInCached) || 0,
      output: parseInt(p.tokensOut) || 0
    },
    message_size_bytes: parseInt(p.messageSize) || 0,
    opt_id: p.optId || null,
    note: p.note || ''
  };

  appendToFile(TURNS_FILE, entry);
  bumpSessionCount(sessionId, 'turn');
  console.log(JSON.stringify({ ok: true, id, session_id: sessionId }));
}

// ════════════════════════════════════════════════════════════
// COMMAND: log-a2a
// ════════════════════════════════════════════════════════════
function cmdLogA2A(args) {
  const p = parseArgs(args);
  const sessionId = p.session || getActiveSessionId();
  const parentTurnId = p.parent || null;

  touchSession(sessionId);
  const id = genId('a2a');

  const entry = {
    type: 'a2a',
    id,
    session_id: sessionId,
    parent_turn_id: parentTurnId,
    phase: p.phase || '',
    timestamp: new Date().toISOString(),
    from_agent: p.from || 'unknown',
    to_agent: p.to || 'unknown',
    skill: p.skill || '',
    model_used: p.model || 'unknown',
    tokens: {
      input_uncached: parseInt(p.tokensInUncached) || 0,
      input_cached: parseInt(p.tokensInCached) || 0,
      output: parseInt(p.tokensOut) || 0
    },
    protocol: p.protocol || 'native',
    opt_id: p.optId || null,
    note: p.note || ''
  };

  appendToFile(TURNS_FILE, entry);
  bumpSessionCount(sessionId, 'a2a');
  console.log(JSON.stringify({ ok: true, id, session_id: sessionId }));
}

// ════════════════════════════════════════════════════════════
// COMMAND: log-opt
// ════════════════════════════════════════════════════════════
function cmdLogOpt(args) {
  const p = parseArgs(args);
  const turnId = p.turnId || genId('opt');
  const sessionId = p.session || '';

  const mechanisms = {};

  // lean-ctx
  const lcRaw = parseInt(p.leanCtxRaw);
  const lcComp = parseInt(p.leanCtxCompressed);
  if (lcRaw > 0 || lcComp > 0) {
    const saved = lcRaw - lcComp;
    mechanisms.lean_ctx = {
      raw_input: lcRaw || 0,
      compressed_input: lcComp || 0,
      saved: Math.max(0, saved),
      ratio: lcRaw > 0 ? ((lcRaw - lcComp) / lcRaw * 100).toFixed(1) + '%' : '0%'
    };
  }

  // L1 cache
  const l1Hit = parseInt(p.l1CacheHit);
  if (l1Hit > 0) {
    mechanisms.l1_cache = {
      prefix_hit_tokens: l1Hit,
      saved: l1Hit
    };
  }

  // L3 skill stub
  const l3Stubs = parseInt(p.l3Stubs);
  if (l3Stubs > 0) {
    const TOKENS_PER_STUB = 25;
    const FULL_SKILL_TOKENS = 15000;
    const saved = l3Stubs * (FULL_SKILL_TOKENS - TOKENS_PER_STUB);
    mechanisms.l3_skill_stub = {
      stubs_count: l3Stubs,
      tokens_per_stub: TOKENS_PER_STUB,
      full_skill_avg: FULL_SKILL_TOKENS,
      saved
    };
  }

  // CCP skip
  const ccpSkipped = parseInt(p.ccpSkipped);
  if (ccpSkipped > 0) {
    const EST_PER_STAGE = 12000;
    mechanisms.ccp_skip = {
      skipped_stages: ccpSkipped,
      estimated_per_stage: EST_PER_STAGE,
      saved: ccpSkipped * EST_PER_STAGE
    };
  }

  // lambda-lang
  const lbRaw = parseInt(p.lambdaRaw);
  const lbComp = parseInt(p.lambdaCompressed);
  if (lbRaw > 0 || lbComp > 0) {
    const saved = lbRaw - lbComp;
    mechanisms.lambda_lang = {
      raw_size: lbRaw || 0,
      compressed_size: lbComp || 0,
      saved: Math.max(0, saved),
      ratio: lbRaw > 0 ? (lbRaw / Math.max(1, lbComp)).toFixed(1) + 'x' : '0x'
    };
  }

  // L2 warmup
  const l2Warmup = parseInt(p.l2Warmup);
  if (l2Warmup > 0) {
    mechanisms.l2_warmup = {
      warmup_tokens: l2Warmup,
      saved: l2Warmup
    };
  }

  const entry = {
    opt_id: turnId,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    model_switched: p.modelSwitched === 'true' || p.modelSwitched === '1',
    mechanisms
  };

  appendToFile(OPTS_FILE, entry);
  console.log(JSON.stringify({ ok: true, opt_id: turnId }));
}

// ════════════════════════════════════════════════════════════
// COMMAND: list
// ════════════════════════════════════════════════════════════
function cmdList() {
  const sessions = readSessions();
  const ids = Object.keys(sessions);
  if (ids.length === 0) {
    console.log('(no sessions)');
    return;
  }
  console.log('=== MVP Perf Sessions ===\n');
  console.log('| Session | Turns | A2A | Created | Last Activity |');
  console.log('|---------|-------|-----|---------|---------------|');
  Object.entries(sessions).forEach(([id, s]) => {
    const created = (s.created || '').slice(0, 19);
    const last = (s.last_activity || '').slice(0, 19);
    console.log('| ' + id + ' | ' + (s.turn_count || 0) + ' | ' + (s.a2a_count || 0) + ' | ' + created + ' | ' + last + ' |');
  });
  console.log('\n' + ids.length + ' session(s)');
}

// ════════════════════════════════════════════════════════════
// COMMAND: models
// ════════════════════════════════════════════════════════════
function cmdModels() {
  const p = getPricing();
  console.log('=== Model Pricing (' + p.currency + '/MTok) ===');
  console.log('Updated: ' + p.updated);
  console.log('');
  console.log('| Model | Input | Output | Cache Read |');
  console.log('|-------|-------|--------|------------|');
  p.models.forEach(m => {
    console.log('| ' + m.short.padEnd(18) + ' | ' + p.currency + m.input_per_mtok.toFixed(2) + ' | ' + p.currency + m.output_per_mtok.toFixed(2) + ' | ' + p.currency + m.cache_read_per_mtok.toFixed(3) + ' |');
  });
  console.log('');
  console.log('来源: ' + p.source);
}

// ════════════════════════════════════════════════════════════
// COMMAND: dashboard
// ════════════════════════════════════════════════════════════
function cmdDashboard(args) {
  const p = parseArgs(args);
  const targetSession = p.session || '';

  const allTurns = readJSONL(TURNS_FILE);
  const allOpts = readJSONL(OPTS_FILE);
  const reg = getRegistry();

  let turns = allTurns;
  if (targetSession) {
    turns = allTurns.filter(e => e.session_id === targetSession);
  }
  const opts = allOpts; // show all optimizations

  // Separate turns and a2a
  const convTurns = turns.filter(e => e.type === 'turn');
  const a2aMsgs = turns.filter(e => e.type === 'a2a');

  // Build opt lookup
  const optMap = {};
  opts.forEach(o => { optMap[o.opt_id] = o; });

  // Aggregate savings
  const totalSavings = {};
  let modelSwitchCount = 0;

  opts.forEach(o => {
    if (o.model_switched) { modelSwitchCount++; }
    Object.entries(o.mechanisms || {}).forEach(([mechId, data]) => {
      if (!totalSavings[mechId]) totalSavings[mechId] = 0;
      totalSavings[mechId] += data.saved || 0;
    });
  });

  // Aggregate tokens
  let totalUncached = 0, totalCached = 0, totalOutput = 0;
  turns.forEach(e => {
    totalUncached += e.tokens?.input_uncached || 0;
    totalCached += e.tokens?.input_cached || 0;
    totalOutput += e.tokens?.output || 0;
  });

  // ─── OUTPUT ───
  const totalLen = 72;
  const hr = '─'.repeat(totalLen);

  console.log('=== MVP Perf Dashboard ===\n');

  // Session header
  const sessionLabel = targetSession || '(all sessions)';
  console.log('会话: ' + sessionLabel);
  console.log('条目: ' + convTurns.length + ' 轮次 + ' + a2aMsgs.length + ' A2A');
  const totalInput = totalUncached + totalCached;
  const cacheRate = totalInput > 0 ? (totalCached / totalInput * 100).toFixed(1) : '0.0';
  console.log('Token: 总输入=' + fmtTok(totalInput) + ' (未命中=' + fmtTok(totalUncached) + ' 命中=' + fmtTok(totalCached) + '/' + cacheRate + '%) 输出=' + fmtTok(totalOutput));
  console.log('');

  // Per-turn breakdown (last 20)
  const displayTurns = turns.slice(-20);
  console.log('--- 对话轮次明细 (最近 ' + displayTurns.length + ' 条) ---');
  console.log('');
  displayTurns.forEach(e => {
    const tok = e.tokens || {};
    const t = e.type === 'turn' ? (e.role === 'human' ? 'H→AI' : 'AI→H') : 'A2A';
    const dir = e.type === 'a2a' ? ' ' + (e.from_agent || '?') + '→' + (e.to_agent || '?') : '';
    const model = (e.model_used || '?').padEnd(18);
    const uncached = fmtTok(tok.input_uncached || 0);
    const cached = fmtTok(tok.input_cached || 0);
    const out = fmtTok(tok.output || 0);
    const phase = (e.phase || '').padEnd(10);

    // Get optimizations for this entry
    let optStr = '';
    if (e.opt_id && optMap[e.opt_id]) {
      const mechs = optMap[e.opt_id].mechanisms || {};
      const parts = [];
      Object.entries(mechs).forEach(([mId, mData]) => {
        const regMech = reg.mechanisms.find(r => r.id === mId);
        const label = regMech ? (regMech.name || mId) : mId;
        if (mData.saved > 0) parts.push(label + ':-' + fmtTok(mData.saved));
      });
      if (parts.length > 0) optStr = '  ' + parts.join(' ');
    }

    const line = e.id + ' [' + t + dir + ' ' + model + '] In:' + uncached + '+' + cached + '(缓存)/Out:' + out + (phase ? ' [' + phase.trim() + ']' : '') + optStr;
    console.log(line);
  });
  console.log('');

  // ─── Savings breakdown ───
  console.log('--- 优化节省汇总 (不含模型切换) ---');
  console.log('');

  const tokenSavingMechanisms = reg.mechanisms.filter(m => !m.exclude_from_savings);
  let grandTotal = 0;
  tokenSavingMechanisms.forEach(mech => {
    const saved = totalSavings[mech.id] || 0;
    if (saved > 0) {
      grandTotal += saved;
      const desc = mech.measurement || '';
      console.log(mech.name.padEnd(20) + ' ' + fmtTok(saved).padStart(12) + ' tok     ← ' + desc);
    }
  });

  // Show mechanisms with zero savings too (for visibility)
  tokenSavingMechanisms.forEach(mech => {
    const saved = totalSavings[mech.id] || 0;
    if (saved === 0) {
      console.log(mech.name.padEnd(20) + ' ' + '        0 tok     ← (no data)');
    }
  });

  // Model switch (cost-only)
  const modelSwitchMech = reg.mechanisms.find(m => m.id === 'model_switch');
  if (modelSwitchMech && totalSavings['model_switch']) {
    console.log(hr);
    console.log((modelSwitchMech.name || '模型切换').padEnd(20) + ' ' + fmtTok(totalSavings['model_switch']).padStart(12) + ' tok     ← 不计入节省 (仅成本)');
  }

  if (grandTotal > 0) {
    console.log(hr);
    console.log('总节省'.padEnd(20) + ' ' + fmtTok(grandTotal).padStart(12) + ' tok');
  }
  console.log('');

  // ─── Cost estimate ───
  console.log('--- 成本估算 ---');
  console.log('');
  const pricing = getPricing();
  const byModel = {};
  turns.forEach(e => {
    const m = e.model_used || 'unknown';
    if (!byModel[m]) byModel[m] = { calls: 0, input_uncached: 0, input_cached: 0, output: 0 };
    byModel[m].calls++;
    byModel[m].input_uncached += e.tokens?.input_uncached || 0;
    byModel[m].input_cached += e.tokens?.input_cached || 0;
    byModel[m].output += e.tokens?.output || 0;
  });

  let totalCostValue = 0;
  Object.entries(byModel).forEach(([model, d]) => {
    const costInfo = calcCost(model, d.input_uncached, d.input_cached, d.output);
    const cost = costInfo ? costInfo.total : 0;
    totalCostValue += cost;
    const modelLabel = costInfo ? costInfo.model : model;
    console.log('| ' + modelLabel.padEnd(18) + ' | 调用:' + d.calls + ' | 未命中:' + fmtTok(d.input_uncached).padStart(8) + ' | 缓存:' + fmtTok(d.input_cached).padStart(8) + ' | 输出:' + fmtTok(d.output).padStart(8) + ' | ' + pricing.currency + cost.toFixed(4) + ' |');
  });
  console.log('|' + hr.slice(1) + '|');
  const totalCalls = Object.values(byModel).reduce((s, d) => s + d.calls, 0);
  const totalUncachedAll = Object.values(byModel).reduce((s, d) => s + d.input_uncached, 0);
  const totalCachedAll = Object.values(byModel).reduce((s, d) => s + d.input_cached, 0);
  const totalOutAll = Object.values(byModel).reduce((s, d) => s + d.output, 0);
  console.log('| 总计'.padEnd(24) + ' | 调用:' + totalCalls + ' | 未命中:' + fmtTok(totalUncachedAll).padStart(8) + ' | 缓存:' + fmtTok(totalCachedAll).padStart(8) + ' | 输出:' + fmtTok(totalOutAll).padStart(8) + ' | ' + pricing.currency + totalCostValue.toFixed(4) + ' |');
  console.log('');
  console.log('定价来源: ' + pricing.source);
  console.log('定价更新: ' + pricing.updated);
}

// ════════════════════════════════════════════════════════════
// COMMAND: report
// ════════════════════════════════════════════════════════════
function cmdReport(args) {
  const p = parseArgs(args);
  const targetSession = p.session || '';

  const allTurns = readJSONL(TURNS_FILE);
  const allOpts = readJSONL(OPTS_FILE);
  const reg = getRegistry();

  let turns = allTurns;
  if (targetSession) {
    turns = allTurns.filter(e => e.session_id === targetSession);
  }

  const convTurns = turns.filter(e => e.type === 'turn');
  const a2aMsgs = turns.filter(e => e.type === 'a2a');

  const optMap = {};
  allOpts.forEach(o => { optMap[o.opt_id] = o; });

  // Aggregate
  const totalSavings = {};
  allOpts.forEach(o => {
    Object.entries(o.mechanisms || {}).forEach(([mechId, data]) => {
      if (!totalSavings[mechId]) totalSavings[mechId] = 0;
      totalSavings[mechId] += data.saved || 0;
    });
  });

  let totalUncached = 0, totalCached = 0, totalOutput = 0;
  turns.forEach(e => {
    totalUncached += e.tokens?.input_uncached || 0;
    totalCached += e.tokens?.input_cached || 0;
    totalOutput += e.tokens?.output || 0;
  });

  // Generate Markdown
  const sessionLabel = targetSession || 'all-sessions';
  const ts = new Date().toISOString().slice(0, 19);
  let md = '# MVP Perf Report\n\n> Generated: ' + ts + ' | Session: ' + sessionLabel + '\n\n';

  md += '## Overview\n\n| Metric | Value |\n|---|---|\n';
  md += '| Conversation Turns | ' + convTurns.length + ' |\n';
  md += '| A2A Messages | ' + a2aMsgs.length + ' |\n';
  md += '| Total Input (uncached) | ' + totalUncached.toLocaleString() + ' |\n';
  md += '| Total Input (cached) | ' + totalCached.toLocaleString() + ' |\n';
  const totalInput = totalUncached + totalCached;
  const cacheRate = totalInput > 0 ? (totalCached / totalInput * 100).toFixed(1) : '0.0';
  md += '| Cache Rate | ' + cacheRate + '% |\n';
  md += '| Total Output | ' + totalOutput.toLocaleString() + ' |\n\n';

  // Per-turn table
  md += '## Per-Turn Breakdown\n\n';
  md += '| ID | Type | Direction | Model | Phase | In(Uncached) | In(Cached) | Out | Optimizations |\n';
  md += '|----|------|-----------|-------|-------|-------------|------------|-----|---------------|\n';
  turns.forEach(e => {
    const t = e.type;
    const dir = e.type === 'turn' ? (e.role === 'human' ? 'H->AI' : 'AI->H') : (e.from_agent + '->' + e.to_agent);
    const model = e.model_used || '?';
    const phase = e.phase || '';
    const tok = e.tokens || {};
    let optStr = '';
    if (e.opt_id && optMap[e.opt_id]) {
      const mechs = optMap[e.opt_id].mechanisms || {};
      optStr = Object.entries(mechs).filter(([_, d]) => d.saved > 0).map(([mId, d]) => mId + ':-' + fmtTok(d.saved)).join(' ');
    }
    md += '| ' + e.id + ' | ' + t + ' | ' + dir + ' | ' + model + ' | ' + phase + ' | ' + (tok.input_uncached || 0).toLocaleString() + ' | ' + (tok.input_cached || 0).toLocaleString() + ' | ' + (tok.output || 0).toLocaleString() + ' | ' + optStr + ' |\n';
  });
  md += '\n';

  // Savings table
  md += '## Token Savings (Excluding Model Switch)\n\n';
  md += '| Mechanism | Tokens Saved | Description |\n';
  md += '|-----------|-------------|-------------|\n';
  let grandTotal = 0;
  reg.mechanisms.filter(m => !m.exclude_from_savings).forEach(mech => {
    const saved = totalSavings[mech.id] || 0;
    if (saved > 0) grandTotal += saved;
    md += '| ' + mech.name + ' | ' + (saved > 0 ? saved.toLocaleString() : '0') + ' | ' + mech.measurement + ' |\n';
  });
  md += '| **Total** | **' + grandTotal.toLocaleString() + '** | |\n\n';

  // Cost estimate
  md += '## Cost Estimate\n\n';
  md += '| Model | Calls | In(Uncached) | In(Cached) | Out | Est. Cost |\n';
  md += '|-------|-------|-------------|------------|-----|-----------|\n';
  const costPricing = getPricing();
  const byModel = {};
  turns.forEach(e => {
    const m = e.model_used || 'unknown';
    if (!byModel[m]) byModel[m] = { calls: 0, input_uncached: 0, input_cached: 0, output: 0 };
    byModel[m].calls++;
    byModel[m].input_uncached += e.tokens?.input_uncached || 0;
    byModel[m].input_cached += e.tokens?.input_cached || 0;
    byModel[m].output += e.tokens?.output || 0;
  });
  let totalCostValue = 0;
  Object.entries(byModel).forEach(([model, d]) => {
    const costInfo = calcCost(model, d.input_uncached, d.input_cached, d.output);
    const cost = costInfo ? costInfo.total : 0;
    totalCostValue += cost;
    const modelLabel = costInfo ? costInfo.model : model;
    md += '| ' + modelLabel + ' | ' + d.calls + ' | ' + d.input_uncached.toLocaleString() + ' | ' + d.input_cached.toLocaleString() + ' | ' + d.output.toLocaleString() + ' | ' + costPricing.currency + cost.toFixed(4) + ' |\n';
  });
  const totalCalls = Object.values(byModel).reduce((s, d) => s + d.calls, 0);
  const totalUncachedAll = Object.values(byModel).reduce((s, d) => s + d.input_uncached, 0);
  const totalCachedAll = Object.values(byModel).reduce((s, d) => s + d.input_cached, 0);
  const totalOutAll = Object.values(byModel).reduce((s, d) => s + d.output, 0);
  md += '| **Total** | **' + totalCalls + '** | **' + totalUncachedAll.toLocaleString() + '** | **' + totalCachedAll.toLocaleString() + '** | **' + totalOutAll.toLocaleString() + '** | **' + costPricing.currency + totalCostValue.toFixed(4) + '** |\n\n';

  md += '> Note: Model switching (Pro <-> Flash) is excluded from Token savings.\n';

  // Write to report file
  const reportDir = path.join(ROOT, '.claude-flow', 'perf');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportFile = path.join(reportDir, 'perf-report-' + sessionLabel + '.md');
  fs.writeFileSync(reportFile, md, 'utf8');
  console.log('[perf-tracker] Report: ' + reportFile);
}

// ════════════════════════════════════════════════════════════
// COMMAND: reset
// ════════════════════════════════════════════════════════════
function cmdReset() {
  if (fs.existsSync(TURNS_FILE)) fs.unlinkSync(TURNS_FILE);
  if (fs.existsSync(OPTS_FILE)) fs.unlinkSync(OPTS_FILE);
  if (fs.existsSync(SESSIONS_FILE)) fs.unlinkSync(SESSIONS_FILE);
  console.log('[perf-tracker] data cleared');
}

// ════════════════════════════════════════════════════════════
// COMMAND: web — 生成独立 HTML 可视化看板
// ════════════════════════════════════════════════════════════
function cmdWeb(args) {
  const p = parseArgs(args);
  const targetSession = p.session || '';

  const allTurns = readJSONL(TURNS_FILE);
  const allOpts = readJSONL(OPTS_FILE);
  const sessions = readSessions();
  const reg = getRegistry();
  const pricingData = getPricing();

  let turns = allTurns;
  if (targetSession) {
    turns = allTurns.filter(e => e.session_id === targetSession);
  }

  const convTurns = turns.filter(e => e.type === 'turn');
  const a2aMsgs = turns.filter(e => e.type === 'a2a');

  // Build opt lookup
  const optMap = {};
  allOpts.forEach(o => { optMap[o.opt_id] = o; });

  // Aggregate savings
  const totalSavings = {};
  allOpts.forEach(o => {
    Object.entries(o.mechanisms || {}).forEach(([mechId, data]) => {
      if (!totalSavings[mechId]) totalSavings[mechId] = 0;
      totalSavings[mechId] += data.saved || 0;
    });
  });

  // Aggregate tokens
  let totalUncached = 0, totalCached = 0, totalOutput = 0;
  turns.forEach(e => {
    totalUncached += e.tokens?.input_uncached || 0;
    totalCached += e.tokens?.input_cached || 0;
    totalOutput += e.tokens?.output || 0;
  });

  // Cost by model
  const byModel = {};
  turns.forEach(e => {
    const m = e.model_used || 'unknown';
    if (!byModel[m]) byModel[m] = { calls: 0, input_uncached: 0, input_cached: 0, output: 0 };
    byModel[m].calls++;
    byModel[m].input_uncached += e.tokens?.input_uncached || 0;
    byModel[m].input_cached += e.tokens?.input_cached || 0;
    byModel[m].output += e.tokens?.output || 0;
  });

  let totalCostValue = 0;
  const modelCostRows = [];
  Object.entries(byModel).forEach(([model, d]) => {
    const info = calcCost(model, d.input_uncached, d.input_cached, d.output);
    const cost = info ? info.total : 0;
    totalCostValue += cost;
    modelCostRows.push({ name: info ? info.model : model, raw: model, calls: d.calls, uncached: d.input_uncached, cached: d.input_cached, output: d.output, cost });
  });

  // Token saving mechanisms
  const tokenSavingMechs = reg.mechanisms.filter(m => !m.exclude_from_savings);
  let grandTotalSaved = 0;
  tokenSavingMechs.forEach(m => {
    const s = totalSavings[m.id] || 0;
    if (s > 0) grandTotalSaved += s;
  });

  // Session info
  const sessionIds = Object.keys(sessions);
  const sessionLabel = targetSession || 'all-sessions';

  // ─── Build HTML ───
  const totalInput = totalUncached + totalCached;
  const cacheRate = totalInput > 0 ? (totalCached / totalInput * 100).toFixed(1) : '0.0';
  const htmlFile = path.join(PERF_DIR, 'perf-dashboard-' + sessionLabel + '.html');

  function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function fmtTokHtml(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }

  let html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Claude Code Perf Dashboard</title>';
  html += '<style>';
  html += ':root{--bg:#0a0a0f;--bg2:#101018;--surface:#161625;--surf2:#1c1c30;--surf3:#22223a;--bdr:#2a2a42;--bdr-l:#333355;--txt:#e8e8ed;--txt2:#9494b0;--txt3:#5a5a78;--grn:#22c55e;--grn2:#16a34a;--grn-g:rgba(34,197,94,.12);--grn-b:rgba(34,197,94,.3);--amber:#f59e0b;--red:#ef4444;--blue:#3b82f6;--purple:#a855f7;--cyan:#06b6d4;--r:6px}';
  html += '*{margin:0;padding:0;box-sizing:border-box}';
  html += 'body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--txt);padding:24px;line-height:1.5}';
  html += 'h1{font-size:22px;margin-bottom:2px;color:#fff;font-weight:600}';
  html += 'h2{font-size:15px;margin:24px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--bdr);color:var(--txt);font-weight:500;letter-spacing:.3px}';
  html += '.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}';
  html += '.card{background:var(--surface);border:1px solid var(--bdr);border-radius:var(--r);padding:14px 12px;text-align:center;transition:border-color .2s}';
  html += '.card:hover{border-color:var(--grn-b)}';
  html += '.card .val{font-size:20px;font-weight:600;color:var(--grn);font-variant-numeric:tabular-nums}';
  html += '.card .lbl{font-size:11px;color:var(--txt3);margin-top:3px}';
  html += '.card.warn .val{color:var(--amber)}.card.good .val{color:var(--grn)}';
  html += 'table{width:100%;border-collapse:separate;border-spacing:0;background:var(--surface);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;margin-bottom:10px}';
  html += 'th{background:var(--surf2);color:var(--txt2);padding:8px 10px;text-align:left;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;border-bottom:1px solid var(--bdr)}';
  html += 'td{padding:7px 10px;font-size:12.5px;border-bottom:1px solid var(--bdr);white-space:nowrap;color:var(--txt)}';
  html += 'tr:last-child td{border-bottom:none}';
  html += 'tr:hover td{background:var(--surf2)}';
  html += '.num{text-align:right;font-variant-numeric:tabular-nums;font-family:"JetBrains Mono","Fira Code",monospace;font-size:12px}';
  html += '/* badges */';
  html += '.badge{display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;letter-spacing:.3px}';
  html += '.badge-h2a{background:var(--grn-g);color:var(--grn);border:1px solid var(--grn-b)}';
  html += '.badge-a2a{background:rgba(168,85,247,.15);color:var(--purple);border:1px solid rgba(168,85,247,.3)}';
  html += '.badge-role-human{background:rgba(59,130,246,.12);color:var(--blue);margin-left:3px}';
  html += '.badge-role-ai{background:rgba(34,197,94,.1);color:var(--grn);margin-left:3px}';
  html += '.badge-skill{background:rgba(6,182,212,.12);color:var(--cyan);margin-left:3px}';
  html += '/* direction arrows */';
  html += '.dir-wrap{display:inline-flex;align-items:center;gap:5px}';
  html += '.dir-name{font-size:12px;color:var(--txt)}';
  html += '.dir-arrow{color:var(--txt3);font-size:13px;margin:0 1px}';
  html += '.dir-ai{color:var(--grn)}.dir-human{color:var(--blue)}.dir-agent{color:var(--purple)}';
  html += '/* model tags */';
  html += '.mtag{display:inline-block;padding:1px 7px;border-radius:8px;font-size:10.5px;font-weight:500}';
  html += '.mtag-pro{background:rgba(245,158,11,.15);color:var(--amber);border:1px solid rgba(245,158,11,.25)}';
  html += '.mtag-flash{background:var(--grn-g);color:var(--grn);border:1px solid var(--grn-b)}';
  html += '.mtag-kimi{background:rgba(239,68,68,.1);color:var(--red);border:1px solid rgba(239,68,68,.2)}';
  html += '.mtag-minimax{background:rgba(6,182,212,.1);color:var(--cyan);border:1px solid rgba(6,182,212,.2)}';
  html += '/* content cell */';
  html += '.cell-phase{color:var(--txt2);font-size:12px}';
  html += '.cell-sub{color:var(--txt3);font-size:10.5px;margin-top:2px;line-height:1.4}';
  html += '.cell-sub .proto{color:var(--cyan)}';
  html += '.saving-row{padding:8px 12px;display:flex;justify-content:space-between;border-bottom:1px solid var(--bdr);font-size:13px}';
  html += '.saving-row:last-child{border-bottom:none}';
  html += '.saving-total{font-size:14px;font-weight:600;color:var(--grn);text-align:right;padding:10px 12px 4px;border-top:1px solid var(--grn-b)}';
  html += '.price-note{font-size:10.5px;color:var(--txt3);margin-top:4px}';
  html += '.filter-bar{margin:10px 0;display:flex;gap:6px;align-items:center;flex-wrap:wrap}';
  html += '.filter-bar select,.filter-bar input{background:var(--surf2);color:var(--txt);border:1px solid var(--bdr);border-radius:var(--r);padding:5px 9px;font-size:12px;outline:none}';
  html += '.filter-bar select:focus,.filter-bar input:focus{border-color:var(--grn-b)}';
  html += '.filter-bar label{font-size:12px;color:var(--txt3)}';
  html += '.cost-positive{color:var(--grn)}.cost-negative{color:var(--red)}';
  html += '.sub{font-size:10.5px;color:var(--txt3);margin-left:8px}';
  html += '.footer{text-align:center;color:var(--txt3);font-size:11px;margin-top:30px;padding:20px 0;border-top:1px solid var(--bdr)}';
  html += '/* scrollbar */';
  html += '::-webkit-scrollbar{width:6px;height:6px}';
  html += '::-webkit-scrollbar-track{background:var(--bg2)}';
  html += '::-webkit-scrollbar-thumb{background:var(--surf3);border-radius:3px}';
  html += '::-webkit-scrollbar-thumb:hover{background:var(--bdr)}';
  html += '@media(max-width:768px){td,th{padding:4px 6px;font-size:11px}.summary{grid-template-columns:repeat(2,1fr)}}';
  html += '</style></head><body>';

  // Header
  html += '<h1>🔍 Claude Code 执行追踪</h1>';
  html += '<p style="color:var(--txt3);font-size:12px">会话: ' + esc(sessionLabel) + ' · 生成: ' + new Date().toISOString().slice(0,19).replace('T',' ') + '</p>';

  // Summary cards
  html += '<div class="summary">';
  html += '<div class="card"><div class="val">' + (convTurns.length + a2aMsgs.length) + '</div><div class="lbl">总调用次数</div></div>';
  html += '<div class="card"><div class="val">' + fmtTokHtml(totalInput) + '</div><div class="lbl">总输入 Token</div></div>';
  html += '<div class="card"><div class="val">' + cacheRate + '%</div><div class="lbl">缓存命中率</div></div>';
  html += '<div class="card"><div class="val">' + fmtTokHtml(totalOutput) + '</div><div class="lbl">总输出 Token</div></div>';
  html += '<div class="card warn"><div class="val">' + pricingData.currency + totalCostValue.toFixed(4) + '</div><div class="lbl">估算总成本</div></div>';
  html += '<div class="card good"><div class="val">' + fmtTokHtml(grandTotalSaved) + '</div><div class="lbl">优化节省 Token</div></div>';
  html += '</div>';

  // Pricing info
  html += '<p class="price-note">定价来源: ' + esc(pricingData.source) + ' | 更新: ' + esc(pricingData.updated) + '</p>';

  // Per-turn table
  html += '<h2>📋 对话轮次明细</h2>';
  html += '<div class="filter-bar">';
  html += '<label>过滤:</label>';
  html += '<select id="modelFilter" onchange="filterTable()"><option value="">全部模型</option>';
  const seenModels = {};
  turns.forEach(e => { const m = e.model_used || 'unknown'; if (!seenModels[m]) { seenModels[m] = true; html += '<option value="' + esc(m) + '">' + esc(m) + '</option>'; } });
  html += '</select>';
  html += '<select id="typeFilter" onchange="filterTable()"><option value="">全部类型</option><option value="turn">仅轮次</option><option value="a2a">仅A2A</option></select>';
  html += '<input type="text" id="searchFilter" placeholder="搜索ID/Agent..." oninput="filterTable()" style="width:180px">';
  html += '<span style="font-size:12px;color:#888" id="rowCount"></span>';
  html += '</div>';

  html += '<div style="overflow-x:auto"><table id="turnTable"><thead><tr>';
  html += '<th>ID</th><th>类型</th><th>方向</th><th>模型</th><th>阶段</th><th class="num">输入(未命中)</th><th class="num">输入(缓存)</th><th class="num">输出</th><th class="num">估算成本</th><th>优化节省</th></tr></thead><tbody>';

  turns.forEach(e => {
    const tok = e.tokens || {};
    const t = e.type;
    const model = e.model_used || '?';

    // Determine model tag
    const modelLower = model.toLowerCase();
    let mtag = 'mtag';
    if (modelLower.includes('flash')) mtag += ' mtag-flash';
    else if (modelLower.includes('pro') || modelLower === 'pro') mtag += ' mtag-pro';
    else if (modelLower.includes('kimi')) mtag += ' mtag-kimi';
    else if (modelLower.includes('mini')) mtag += ' mtag-minimax';

    // Cost
    const costInfo = calcCost(model, tok.input_uncached || 0, tok.input_cached || 0, tok.output || 0);
    const cost = costInfo ? costInfo.total : 0;

    // Opt string
    let optStr = '';
    if (e.opt_id && optMap[e.opt_id]) {
      const mechs = optMap[e.opt_id].mechanisms || {};
      const parts = [];
      Object.entries(mechs).forEach(([mId, mData]) => {
        const regMech = reg.mechanisms.find(r => r.id === mId);
        const label = regMech ? (regMech.name || mId) : mId;
        if (mData.saved > 0) parts.push(label + ':-' + fmtTokHtml(mData.saved));
      });
      if (parts.length > 0) optStr = parts.join('<br>');
    }

    // ── Enhanced H2A / A2A display ──
    let typeHtml, dirHtml, phaseHtml;
    const searchStr = esc(e.id + ' ' + (e.from_agent||'') + ' ' + (e.to_agent||'') + ' ' + (e.role||'') + ' ' + (e.skill||'') + ' ' + (e.phase||''));

    if (e.type === 'turn') {
      // H2A — Human/Agent 对话轮次
      const isHuman = e.role === 'human';
      typeHtml = '<span class="badge badge-h2a">H2A</span><span class="badge badge-role-' + (isHuman ? 'human' : 'ai') + '">' + (isHuman ? '用户' : 'AI') + '</span>';
      dirHtml = isHuman
        ? '<span class="dir-wrap"><span class="dir-human">👤 您</span><span class="dir-arrow">→</span><span class="dir-ai">🤖 AI</span></span>'
        : '<span class="dir-wrap"><span class="dir-ai">🤖 AI</span><span class="dir-arrow">→</span><span class="dir-human">👤 您</span></span>';
      phaseHtml = '<span class="cell-phase">' + esc(e.phase || '-') + '</span>';
      if (e.note) phaseHtml += '<div class="cell-sub">' + esc(e.note) + '</div>';
      if (e.message_size_bytes) phaseHtml += '<div class="cell-sub">消息 ' + fmtTokHtml(e.message_size_bytes) + 'B</div>';
    } else {
      // A2A — Agent→Agent 通信
      typeHtml = '<span class="badge badge-a2a">A2A</span>';
      if (e.skill) typeHtml += '<span class="badge badge-skill">' + esc(e.skill) + '</span>';
      dirHtml = '<span class="dir-wrap"><span class="dir-agent">🤖 ' + esc(e.from_agent || '?') + '</span><span class="dir-arrow">→</span><span class="dir-agent">🤖 ' + esc(e.to_agent || '?') + '</span></span>';
      phaseHtml = '<span class="cell-phase">' + esc(e.phase || '-') + '</span>';
      if (e.protocol && e.protocol !== 'native') phaseHtml += '<div class="cell-sub">协议: <span class="proto">' + esc(e.protocol) + '</span></div>';
      if (e.note) phaseHtml += '<div class="cell-sub">' + esc(e.note) + '</div>';
    }

    html += '<tr class="row-' + t + '" data-model="' + esc(model) + '" data-type="' + t + '" data-search="' + searchStr + '">';
    html += '<td style="color:var(--txt3);font-size:11px;font-family:monospace">' + esc(e.id) + '</td>';
    html += '<td>' + typeHtml + '</td>';
    html += '<td>' + dirHtml + '</td>';
    html += '<td><span class="' + mtag + '">' + esc(model) + '</span></td>';
    html += '<td>' + phaseHtml + '</td>';
    html += '<td class="num">' + fmtTokHtml(tok.input_uncached || 0) + '</td>';
    html += '<td class="num cost-positive">' + fmtTokHtml(tok.input_cached || 0) + '</td>';
    html += '<td class="num">' + fmtTokHtml(tok.output || 0) + '</td>';
    html += '<td class="num" style="color:var(--amber)">' + pricingData.currency + cost.toFixed(4) + '</td>';
    html += '<td style="font-size:10.5px;color:var(--grn);line-height:1.5">' + optStr + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';

  // Cost breakdown
  html += '<h2>💰 成本明细 (按模型)</h2>';
  html += '<table><thead><tr><th>模型</th><th class="num">调用</th><th class="num">未命中 Token</th><th class="num">缓存 Token</th><th class="num">输出 Token</th><th class="num">输入成本</th><th class="num">输出成本</th><th class="num">总成本</th></tr></thead><tbody>';
  modelCostRows.forEach(r => {
    const inputCost = (r.uncached / 1e6) * (lookupPricing(r.raw)?.input_per_mtok || 0) + (r.cached / 1e6) * (lookupPricing(r.raw)?.cache_read_per_mtok || 0);
    const outputCost = (r.output / 1e6) * (lookupPricing(r.raw)?.output_per_mtok || 0);
    html += '<tr><td>' + esc(r.name) + '</td><td class="num">' + r.calls + '</td><td class="num">' + fmtTokHtml(r.uncached) + '</td><td class="num cost-positive">' + fmtTokHtml(r.cached) + '</td><td class="num">' + fmtTokHtml(r.output) + '</td><td class="num" style="color:var(--amber)">' + pricingData.currency + inputCost.toFixed(4) + '</td><td class="num" style="color:var(--amber)">' + pricingData.currency + outputCost.toFixed(4) + '</td><td class="num" style="color:var(--grn);font-weight:600">' + pricingData.currency + r.cost.toFixed(4) + '</td></tr>';
  });
  html += '<tr style="font-weight:600;background:var(--surf3);color:var(--grn)"><td>总计</td><td class="num">' + modelCostRows.reduce((s,r) => s + r.calls, 0) + '</td><td class="num">' + fmtTokHtml(modelCostRows.reduce((s,r) => s + r.uncached, 0)) + '</td><td class="num cost-positive">' + fmtTokHtml(modelCostRows.reduce((s,r) => s + r.cached, 0)) + '</td><td class="num">' + fmtTokHtml(modelCostRows.reduce((s,r) => s + r.output, 0)) + '</td><td class="num" style="color:var(--amber)">' + pricingData.currency + modelCostRows.reduce((s,r) => s + Math.max(0, (r.uncached/1e6) * (lookupPricing(r.raw)?.input_per_mtok||0) + (r.cached/1e6) * (lookupPricing(r.raw)?.cache_read_per_mtok||0)), 0).toFixed(4) + '</td><td class="num" style="color:var(--amber)">' + pricingData.currency + modelCostRows.reduce((s,r) => s + Math.max(0, (r.output/1e6) * (lookupPricing(r.raw)?.output_per_mtok||0)), 0).toFixed(4) + '</td><td class="num" style="color:var(--grn);font-weight:600">' + pricingData.currency + totalCostValue.toFixed(4) + '</td></tr>';
  html += '</tbody></table>';

  // Optimization savings
  html += '<h2>📊 优化节省 (不含模型切换)</h2>';
  html += '<div class="saving" style="background:var(--surface);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden">';
  let hasSavings = false;
  tokenSavingMechs.forEach(mech => {
    const saved = totalSavings[mech.id] || 0;
    if (saved > 0) {
      hasSavings = true;
      const pct = grandTotalSaved > 0 ? (saved / grandTotalSaved * 100).toFixed(1) : '0.0';
      html += '<div class="saving-row"><span>' + esc(mech.name) + ' <span class="sub">' + esc(mech.measurement) + '</span></span><span class="cost-positive">' + fmtTokHtml(saved) + ' tok (' + pct + '%)</span></div>';
    }
  });
  tokenSavingMechs.forEach(mech => {
    const saved = totalSavings[mech.id] || 0;
    if (saved === 0) {
      html += '<div class="saving-row" style="color:var(--txt3)"><span>' + esc(mech.name) + '</span><span>— 无数据</span></div>';
    }
  });
  html += '<div class="saving-total">总计节约: ' + fmtTokHtml(grandTotalSaved) + ' tok</div>';

  // Show model switch if any
  const modelSwitchMech = reg.mechanisms.find(m => m.id === 'model_switch');
  if (modelSwitchMech && (totalSavings['model_switch'] || 0) > 0) {
    html += '<div class="saving-row" style="color:var(--txt3);border-top:1px dashed var(--bdr)"><span>' + esc(modelSwitchMech.name) + ' <span class="sub">不计入节省 (仅成本反映)</span></span><span>' + fmtTokHtml(totalSavings['model_switch']) + '</span></div>';
  }

  html += '</div>';

  // Sessions list
  html += '<h2>📁 会话列表</h2>';
  html += '<table><thead><tr><th>会话 ID</th><th class="num">轮次</th><th class="num">A2A</th><th>创建时间</th><th>最后活跃</th></tr></thead><tbody>';
  Object.entries(sessions).forEach(([id, s]) => {
    html += '<tr><td>' + esc(id) + '</td><td class="num">' + (s.turn_count||0) + '</td><td class="num">' + (s.a2a_count||0) + '</td><td style="color:var(--txt3);font-size:11.5px">' + (s.created||'').slice(0,19) + '</td><td style="color:var(--txt3);font-size:11.5px">' + (s.last_activity||'').slice(0,19) + '</td></tr>';
  });
  if (Object.keys(sessions).length === 0) {
    html += '<tr><td colspan="5" style="text-align:center;color:var(--txt3)">暂无会话</td></tr>';
  }
  html += '</tbody></table>';

  // Pricing table
  html += '<h2>💵 模型定价参考</h2>';
  html += '<table><thead><tr><th>模型</th><th class="num">输入 (¥/M)</th><th class="num">缓存 (¥/M)</th><th class="num">输出 (¥/M)</th><th>备注</th></tr></thead><tbody>';
  pricingData.models.forEach(m => {
    html += '<tr><td>' + esc(m.name) + ' (' + esc(m.short) + ')</td><td class="num">' + pricingData.currency + m.input_per_mtok.toFixed(2) + '</td><td class="num cost-positive">' + pricingData.currency + m.cache_read_per_mtok.toFixed(3) + '</td><td class="num">' + pricingData.currency + m.output_per_mtok.toFixed(2) + '</td><td style="font-size:10.5px;color:var(--txt3)">' + esc(m.note||'') + '</td></tr>';
  });
  html += '</tbody></table>';

  // Footer
  html += '<div class="footer">⚡ Claude Code Perf Tracker · 数据: ' + esc(TURNS_FILE) + ' · 定价: ' + esc(PRICING_FILE) + '<br>修改 helpers/perf/pricing.json 更新实时价格, 改后重新生成即可</div>';

  // Filter script
  html += '<script>function filterTable(){var m=document.getElementById("modelFilter").value;var t=document.getElementById("typeFilter").value;var q=document.getElementById("searchFilter").value.toLowerCase();var rows=document.querySelectorAll("#turnTable tbody tr");var cnt=0;rows.forEach(function(r){var show=true;if(m&&r.getAttribute("data-model")!==m)show=false;if(t&&r.getAttribute("data-type")!==t)show=false;if(q&&r.getAttribute("data-search").indexOf(q)===-1)show=false;r.style.display=show?"":"none";if(show)cnt++;});document.getElementById("rowCount").textContent="("+cnt+" 行)"}filterTable();</script>';

  html += '</body></html>';

  // Write
  ensureDir();
  fs.writeFileSync(htmlFile, html, 'utf8');
  console.log('[perf-tracker] 已生成 HTML 看板: ' + htmlFile);
  console.log('  → 直接在浏览器打开此文件即可查看');
}

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════
function parseArgs(arr) {
  const r = {};
  for (let i = 0; i < (arr || []).length; i++) {
    if ((arr[i] || '').startsWith('--') && i + 1 < arr.length) {
      const key = arr[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      r[key] = arr[++i];
    }
  }
  return r;
}

function fmtTok(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

// ════════════════════════════════════════════════════════════
// CLI
// ════════════════════════════════════════════════════════════
function main() {
  const cmd = process.argv[2];
  const args = process.argv.slice(3);

  switch (cmd) {
    case 'log-turn':
      cmdLogTurn(args);
      break;
    case 'log-a2a':
      cmdLogA2A(args);
      break;
    case 'log-opt':
      cmdLogOpt(args);
      break;
    case 'dashboard':
      cmdDashboard(args);
      break;
    case 'report':
      cmdReport(args);
      break;
    case 'list':
      cmdList();
      break;
    case 'models':
      cmdModels();
      break;
    case 'reset':
      cmdReset();
      break;
    case 'web':
      cmdWeb(args);
      break;
    default:
      console.log('MVP Perf Tracker — 执行追踪与优化节省面板');
      console.log('');
      console.log('命令:');
      console.log('  log-turn   记录一次人机对话轮次  --role <human|ai> --model <m> [--tokens-in-uncached N] [--tokens-in-cached N] [--tokens-out N] [--phase <p>] [--session <s>]');
      console.log('  log-a2a    记录一次 A2A 消息     --from <a> --to <b> [--skill <s>] --model <m> [--tokens-in-uncached N] [--tokens-in-cached N] [--tokens-out N] [--session <s>]');
      console.log('  log-opt    记录优化节省明细      --turn-id <id> [--lean-ctx-raw N --lean-ctx-compressed N] [--l1-cache-hit N] [--l3-stubs N] [--ccp-skipped N] [--lambda-raw N --lambda-compressed N] [--model-switched]');
      console.log('  web        生成 HTML 可视化看板   [--session <s>]');
      console.log('  dashboard  输出实时看板           [--session <s>]');
      console.log('  report     生成 Markdown 报告     [--session <s>]');
      console.log('  list       列出所有会话');
      console.log('  models     显示模型定价表');
      console.log('  reset      清空 perf 数据');
      process.exit(0);
  }
}

main();
