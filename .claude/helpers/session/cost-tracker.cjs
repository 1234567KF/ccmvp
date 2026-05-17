#!/usr/bin/env node
/**
 * Session Cost Tracker for Claude Code + Third-party Models
 *
 * Parses the session transcript JSONL for real API token counts,
 * applies model-specific pricing, and writes session-cost.json.
 *
 * Data source: ~/{IDE_ROOT}/projects/<project>/<sessionId>.jsonl
 *   → input_tokens, output_tokens, cache_read_input_tokens (dedup by message.id)
 *
 * Pricing in ¥/MTok (DeepSeek bills in RMB), USD via /7.2 conversion.
 *
 *   DeepSeek-V4-Flash:  ¥1.00 in  ¥2.00 out  ¥0.02 cache
 *   DeepSeek-V4-Pro:    ¥3.00 in  ¥6.00 out  ¥0.025 cache (2.5折, to 2026/5/31)
 *   Claude Sonnet:      $3/$15 (fallback)
 *
 * Usage:
 *   node cost-tracker.cjs              # display current
 *   node cost-tracker.cjs --update     # parse transcript & write
 *   node cost-tracker.cjs --reset      # zero out cost data
 *   node cost-tracker.cjs --json       # JSON output
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CWD = process.cwd();
const COST_FILE = path.join(CWD, '.claude', 'session-cost.json');
const HOME = os.homedir();
const FX = 7.2;

// ─── Pricing: ¥/MTok ───────────────────────────────────────────

const PRICING = {
  'deepseek-v4-pro':   { label: 'DS-V4-Pro',   input: 3.00, output: 6.00, cache_read: 0.025 },
  'deepseek-v4-flash': { label: 'DS-V4-Flash', input: 1.00, output: 2.00, cache_read: 0.02 },
  'deepseek-v4':       { label: 'DS-V4-Flash', input: 1.00, output: 2.00, cache_read: 0.02 },
  'deepseek-v3':       { label: 'DS-V3',       input: 2.00, output: 8.00 },
  'deepseek-r1':       { label: 'DS-R1',       input: 4.00, output: 16.00 },
  'kimi-k2.6':         { label: 'Kimi-K2.6',   input: 1.00, output: 4.00, cache_read: null },
  'kimi-k2.5':         { label: 'Kimi-K2.5',   input: 1.00, output: 4.00, cache_read: null },
  'kimi-k2':           { label: 'Kimi-K2',     input: 1.00, output: 4.00, cache_read: null },
  'minimax-m2.5':      { label: 'MM-M2.5',     input: 0.30, output: 2.40, cache_read: null },  // $0.3/$2.4 per MTok
  'minimax-m2':        { label: 'MM-M2',       input: 0.30, output: 2.40, cache_read: null },
  'claude-sonnet':     { label: 'Sonnet',      input: 21.60, output: 108.00 },  // $3/$15
  'claude-opus':       { label: 'Opus',        input: 108.00, output: 540.00 }, // $15/$75
  'claude-haiku':      { label: 'Haiku',       input: 5.76, output: 28.80 },    // $0.80/$4
};

function detectPricing(modelName) {
  const m = modelName.toLowerCase();
  if (m.includes('deepseek-v4-pro')) return PRICING['deepseek-v4-pro'];
  if (m.includes('deepseek-v4'))     return PRICING['deepseek-v4-flash'];
  if (m.includes('deepseek-v3'))     return PRICING['deepseek-v3'];
  if (m.includes('deepseek-r1'))     return PRICING['deepseek-r1'];
  if (m.includes('deepseek'))        return PRICING['deepseek-v4-flash'];
  if (m.includes('kimi-k2.6'))       return PRICING['kimi-k2.6'];
  if (m.includes('kimi-k2.5'))       return PRICING['kimi-k2.5'];
  if (m.includes('kimi-k2'))         return PRICING['kimi-k2'];
  if (m.includes('kimi'))            return PRICING['kimi-k2.6'];
  if (m.includes('minimax-m2.5'))    return PRICING['minimax-m2.5'];
  if (m.includes('minimax-m2'))      return PRICING['minimax-m2'];
  if (m.includes('minimax'))         return PRICING['minimax-m2.5'];
  if (m.includes('sonnet'))          return PRICING['claude-sonnet'];
  if (m.includes('opus'))            return PRICING['claude-opus'];
  if (m.includes('haiku'))           return PRICING['claude-haiku'];
  return PRICING['claude-sonnet'];
}

// ─── Helpers ────────────────────────────────────────────────────

function getModelName() {
  try {
    for (const f of ['settings.local.json', 'settings.json']) {
      const fp = path.join(CWD, '.claude', f);
      if (fs.existsSync(fp)) {
        const s = JSON.parse(fs.readFileSync(fp, 'utf-8'));
        if (s.model) return s.model;
      }
    }
  } catch {}
  return '';
}

function readCostFile() {
  try { return JSON.parse(fs.readFileSync(COST_FILE, 'utf-8')); }
  catch { return { version: 3, cost_usd: 0, cost_rmb: 0 }; }
}

function writeCostFile(data) {
  fs.mkdirSync(path.dirname(COST_FILE), { recursive: true });
  fs.writeFileSync(COST_FILE, JSON.stringify(data, null, 2));
}

function cmdReset() {
  writeCostFile({
    version: 3,
    cost_usd: 0, cost_rmb: 0,
    input_tokens: 0, output_tokens: 0,
    cache_read_tokens: 0, cache_create_tokens: 0,
    api_calls: 0,
    updated_at: new Date().toISOString(),
  });
}

// ─── Transcript ─────────────────────────────────────────────────

function findTranscript() {
  const projName = CWD.replace(/[^a-zA-Z0-9\-._~]/g, '-');
  const projDir = path.join(HOME, '.claude', 'projects', projName);
  if (fs.existsSync(projDir)) return findLatestJsonl(projDir);

  const base = path.join(HOME, '.claude', 'projects');
  if (!fs.existsSync(base)) return null;
  const dirs = fs.readdirSync(base).filter(d => {
    try { return fs.statSync(path.join(base, d)).isDirectory(); } catch { return false; }
  });
  for (const d of dirs) {
    if (CWD.replace(/[:/\\]/g, '-').includes(d.replace(/-/g, '').toLowerCase())) {
      return findLatestJsonl(path.join(base, d));
    }
  }
  return null;
}

function findLatestJsonl(dir) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? path.join(dir, files[0].name) : null;
  } catch { return null; }
}

function parseTranscript(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const calls = new Map();

  for (const l of lines) {
    try {
      const j = JSON.parse(l);
      if (j.type !== 'assistant' || !j.message || !j.message.usage) continue;
      const id = j.message.id;
      const u = j.message.usage;
      const ex = calls.get(id);
      if (!ex) {
        calls.set(id, {
          input: u.input_tokens || 0,
          output: u.output_tokens || 0,
          cacheCreate: u.cache_creation_input_tokens || 0,
          cacheRead: u.cache_read_input_tokens || 0,
        });
      } else {
        if ((u.input_tokens || 0) > ex.input) ex.input = u.input_tokens;
        if ((u.output_tokens || 0) > ex.output) ex.output = u.output_tokens;
        if ((u.cache_creation_input_tokens || 0) > ex.cacheCreate) ex.cacheCreate = u.cache_creation_input_tokens;
        if ((u.cache_read_input_tokens || 0) > ex.cacheRead) ex.cacheRead = u.cache_read_input_tokens;
      }
    } catch {}
  }

  let tIn = 0, tOut = 0, tCC = 0, tCR = 0;
  for (const u of calls.values()) {
    tIn += u.input; tOut += u.output;
    tCC += u.cacheCreate; tCR += u.cacheRead;
  }
  return { input: tIn, output: tOut, cacheCreate: tCC, cacheRead: tCR, apiCalls: calls.size };
}

// ─── Cost ───────────────────────────────────────────────────────

function computeCost(usage, pricing) {
  const costIn = usage.input * pricing.input / 1_000_000;
  const costOut = usage.output * pricing.output / 1_000_000;
  const costCache = pricing.cache_read
    ? usage.cacheRead * pricing.cache_read / 1_000_000
    : 0;
  const totalRmb = costIn + costOut + costCache;
  return {
    cost_rmb: parseFloat(totalRmb.toFixed(6)),
    cost_usd: parseFloat((totalRmb / FX).toFixed(8)),
    cost_in: parseFloat(costIn.toFixed(6)),
    cost_out: parseFloat(costOut.toFixed(6)),
    cost_cache: parseFloat(costCache.toFixed(6)),
  };
}

// ─── Lean-ctx savings ───────────────────────────────────────────

function getLCSavings(pricing) {
  try {
    const raw = execSync('lean-ctx.exe gain --json', {
      encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const g = JSON.parse(raw);
    const saved = (g.summary || {}).tokens_saved || 0;
    if (saved === 0) return { tokens_saved: 0, savings_rmb: 0, savings_usd: 0 };

    const savingsRmb = saved * pricing.input / 1_000_000;
    return {
      tokens_saved: saved,
      savings_rmb: parseFloat(savingsRmb.toFixed(6)),
      savings_usd: parseFloat((savingsRmb / FX).toFixed(8)),
    };
  } catch {
    return { tokens_saved: 0, savings_rmb: 0, savings_usd: 0 };
  }
}

// ─── Update ─────────────────────────────────────────────────────

function update() {
  const transcriptPath = findTranscript();
  if (!transcriptPath) {
    console.error('Cannot find session transcript');
    process.exit(1);
  }

  const usage = parseTranscript(transcriptPath);
  const modelName = getModelName();
  const pricing = detectPricing(modelName);
  const cost = computeCost(usage, pricing);
  const savings = getLCSavings(pricing);

  const data = readCostFile();
  data.version = 3;
  data.model = modelName;
  data.pricing = pricing;
  data.input_tokens = usage.input;
  data.output_tokens = usage.output;
  data.cache_read_tokens = usage.cacheRead;
  data.cache_create_tokens = usage.cacheCreate;
  data.api_calls = usage.apiCalls;
  data.cost_in = cost.cost_in;
  data.cost_out = cost.cost_out;
  data.cost_cache = cost.cost_cache;
  data.cost_usd = cost.cost_usd;
  data.cost_rmb = cost.cost_rmb;
  data.savings = savings;
  data.updated_at = new Date().toISOString();
  writeCostFile(data);
  return data;
}

// ─── Display ────────────────────────────────────────────────────

function display(format) {
  const data = readCostFile();
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const p = data.pricing || { label: '?', input: 0, output: 0, cache_read: 0 };
  const s = data.savings || {};
  console.log(`Model:   ${data.model || 'unknown'}`);
  console.log(`Pricing: ${p.label}  in=¥${p.input}/M  out=¥${p.output}/M  cache=¥${p.cache_read || 0}/M`);
  console.log(`Tokens:  ${(data.input_tokens || 0).toLocaleString()} in  ${(data.output_tokens || 0).toLocaleString()} out  ${(data.cache_read_tokens || 0).toLocaleString()} cache`);
  console.log(`Calls:   ${data.api_calls || 0} API calls`);
  console.log(`Cost:    ¥${(data.cost_rmb || 0).toFixed(4)}  ($${(data.cost_usd || 0).toFixed(6)})`);
  if (s.savings_rmb > 0) {
    const pct = data.cost_rmb > 0 ? (s.savings_rmb / (data.cost_rmb + s.savings_rmb) * 100).toFixed(0) : 0;
    console.log(`Saved:   ¥${s.savings_rmb.toFixed(4)}  (${(s.tokens_saved || 0).toLocaleString()} tokens, ${pct}% of would-be cost)`);
  }
}

// ─── CLI ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes('--reset')) {
  cmdReset();
  console.log('Cost data cleared.');
} else if (args.includes('--update')) {
  update();
  display(args.includes('--json') ? 'json' : 'text');
} else if (args.includes('--json')) {
  display('json');
} else {
  display('text');
}

