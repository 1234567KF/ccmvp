#!/usr/bin/env node
/**
 * kf-token-tracker v3.0 - 技能调用链路追踪 + Token成本追踪（通用 IDE 手动触发版）
 * 
 * 追踪 {IDE_ROOT}/skills/ 下所有技能（kf-定制 + 通用下载 + MCP工具）
 * 追踪输入/输出 token，区分缓存命中/未命中
 * 
 * 【通用 IDE 适配说明】
 * 原 Claude Code 版通过 PreToolUse hook 自动捕获每次工具调用，
 * 本版改为手动触发：在技能执行前后调用 log 命令记录 Token 消耗。
 * 
 * Usage:
 *   node token-tracker.cjs log       --agent <a> --skill <s> [options]
 *   node token-tracker.cjs pre-tool  (手动传入 JSON 模拟 hook 输入)
 *   node token-tracker.cjs status     (real-time status)
 *   node token-tracker.cjs tree       (call chain tree)
 *   node token-tracker.cjs report     (generate markdown report)
 *   node token-tracker.cjs inventory  (scan all skills in {IDE_ROOT}/skills/)
 *   node token-tracker.cjs cost       (token cost summary)
 *   node token-tracker.cjs reset      (clear logs)
 */

const fs = require("fs");
const path = require("path");

const MONITOR_URL = "http://localhost:3456";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(PROJECT_ROOT, ".claude-flow", "data");
const SKILLS_DIR = path.join(PROJECT_ROOT, ".claude", "skills");
const LOG_PATH = path.join(DATA_DIR, "skill-traces.jsonl");
const REPORT_PATH = path.join(PROJECT_ROOT, "监测者", "token测评", "token-usage-report.md");
const SUMMARY_PATH = path.join(DATA_DIR, "token-usage-summary.json");
const INVENTORY_PATH = path.join(DATA_DIR, "skill-inventory.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ============================================================
// Skill Registry - scan all skills from {IDE_ROOT}/skills/
// ============================================================
function scanInventory() {
  const inventory = { kf_skills: [], general_skills: [], mcp_skills: [], total: 0, scanned_at: new Date().toISOString() };
  if (!fs.existsSync(SKILLS_DIR)) { return inventory; }
  const dirs = fs.readdirSync(SKILLS_DIR).filter(d => {
    try { return fs.statSync(path.join(SKILLS_DIR, d)).isDirectory(); } catch { return false; }
  });
  dirs.forEach(d => {
    const skillFile = path.join(SKILLS_DIR, d, "SKILL.md");
    let meta = { name: d, has_skill_md: fs.existsSync(skillFile) };
    if (fs.existsSync(skillFile)) {
      try {
        const content = fs.readFileSync(skillFile, "utf-8");
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const modelMatch = content.match(/^recommended_model:\s*(.+)$/m);
        const catMatch = content.match(/^  category:\s*(.+)$/m);
        if (nameMatch) meta.name = nameMatch[1].trim();
        if (modelMatch) meta.model = modelMatch[1].trim();
        if (catMatch) meta.category = catMatch[1].trim();
      } catch {}
    }
    if (d.startsWith("kf-")) {
      inventory.kf_skills.push(meta);
    } else {
      inventory.general_skills.push(meta);
    }
  });
  inventory.total = dirs.length;
  try { fs.writeFileSync(INVENTORY_PATH, JSON.stringify(inventory, null, 2), "utf-8"); } catch {}
  return inventory;
}

function showInventory() {
  const inv = scanInventory();
  console.log("\n=== Skill Inventory (" + inv.total + " total) ===\n");
  console.log("kf- Skills (" + inv.kf_skills.length + "):");
  inv.kf_skills.forEach(s => console.log("  " + s.name + (s.model ? " [" + s.model + "]" : "") + (s.category ? " (" + s.category + ")" : "")));
  console.log("\nGeneral Skills (" + inv.general_skills.length + "):");
  inv.general_skills.forEach(s => console.log("  " + s.name + (s.model ? " [" + s.model + "]" : "") + (s.category ? " (" + s.category + ")" : "")));
  console.log("\nInventory saved: " + INVENTORY_PATH);
}

// ============================================================
// Classify skill by prefix
// ============================================================
function classifySkill(skillName) {
  if (!skillName) return "unknown";
  if (skillName.startsWith("kf-")) return "kf-custom";
  if (skillName.startsWith("mcp__")) return "mcp-tool";
  // Check against inventory
  if (fs.existsSync(INVENTORY_PATH)) {
    try {
      const inv = JSON.parse(fs.readFileSync(INVENTORY_PATH, "utf-8"));
      if (inv.general_skills && inv.general_skills.some(s => s.name === skillName)) return "general";
      if (inv.kf_skills && inv.kf_skills.some(s => s.name === skillName)) return "kf-custom";
    } catch {}
  }
  return "other";
}

// ============================================================
// Token cost model (per MTok, CNY)
// ============================================================
const MODEL_PRICING = {
  "opus":              { input: 15,     output: 75,   cache_read: 1.875  },
  "sonnet":            { input: 3,      output: 15,   cache_read: 0.375  },
  "haiku":             { input: 0.25,   output: 1.25, cache_read: 0.03   },
  "pro":               { input: 3,      output: 6,    cache_read: 0.025  },
  "deepseek-v4-pro":   { input: 3,      output: 6,    cache_read: 0.025  },
  "flash":             { input: 1,      output: 2,    cache_read: 0.02   },
  "deepseek-v4-flash": { input: 1,      output: 2,    cache_read: 0.02   },
};

function calcCost(tokensIn, tokensOut, cacheHit, model) {
  const p = MODEL_PRICING[model] || MODEL_PRICING["sonnet"];
  // Anthropic 格式: tokensIn=未缓存新token, cacheHit=缓存命中token, 两者相加=总输入
  const uncachedIn = tokensIn || 0;
  const cachedTokens = cacheHit || 0;
  return {
    input_cost: (uncachedIn / 1000000) * p.input,
    cache_cost: (cachedTokens / 1000000) * p.cache_read,
    output_cost: (tokensOut / 1000000) * p.output,
    total_cost: (uncachedIn / 1000000) * p.input + (cachedTokens / 1000000) * p.cache_read + (tokensOut / 1000000) * p.output
  };
}

// ============================================================
// log - append trace entry
// ============================================================
function logEntry(args) {
  const p = parseArgs(args);
  const entry = {
    trace_id: p.trace || getActiveTraceId(),
    span_id: p.span || Math.random().toString(36).slice(2, 10),
    parent_span_id: p.parent || null,
    timestamp: new Date().toISOString(),
    agent: p.agent || "unknown",
    team: inferTeam(p.agent),
    skill: p.skill || "unknown",
    skill_type: classifySkill(p.skill),
    trigger: p.trigger || "agent",
    call_level: parseInt(p.level) || 1,
    phase: p.phase || "",
    result: p.result || "running",
    duration_ms: parseInt(p.duration) || 0,
    model_used: p.model || "",
    tokens_in: parseInt(p.tokensIn) || 0,
    tokens_out: parseInt(p.tokensOut) || 0,
    cache_hit: parseInt(p.cacheHit) || 0,
    note: p.note || ""
  };
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n"); } catch {}
  // Silent output - no console.log to avoid interfering with hooks
}

// ============================================================
// pre-tool hook - auto-capture via stdin (Claude Code hook protocol)
// ============================================================
let _inputProcessed = false;

function processInputSafe(hookInput) {
  if (_inputProcessed) return Promise.resolve();
  _inputProcessed = true;
  return processInput(hookInput);
}

// ── Get real session ID (from env or state file) ────────────────────
function getSessionId() {
  // Try env vars first (set by Claude Code during hook execution)
  const envId = process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_FLOW_SESSION_ID;
  if (envId) return envId;
  // Fallback: read from session-state.json (written by monitor-session start)
  try {
    const statePath = path.join(DATA_DIR, 'session-state.json');
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      if (state.sessionId) return state.sessionId;
    }
  } catch {}
  return null;
}

// ── Push skill entry to monitor dashboard ───────────────────────────
async function pushToMonitor(entry) {
  try {
    const health = await fetch(MONITOR_URL + "/api/health");
    if (!health.ok) return;
  } catch { return; }

  const sessionId = getSessionId() || entry.trace_id || "trace_" + Date.now();
  try {
    await fetch(MONITOR_URL + "/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        title: '',
        model: entry.model_used || "unknown",
        messages: [{
          role: "assistant",
          content: `Skill: ${entry.skill || 'unknown'}`,
          input_tokens: 0,
          output_tokens: 0,
          cache_hit: 0,
          created_at: entry.timestamp || new Date().toISOString(),
        }],
        skillCalls: [{
          name: entry.skill,
          type: entry.skill_type,
          input_tokens: entry.tokens_in || 0,
          output_tokens: entry.tokens_out || 0,
          duration_ms: entry.duration_ms || null,
          status: "running",
        }],
      }),
    });
  } catch {}
}

async function preToolHook() {
  // Claude Code hooks pass data via stdin as JSON
  let hookInput = {};
  try {
    const chunks = [];
    const timer = setTimeout(async () => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      await processInputSafe(hookInput);
      process.exit(0);
    }, 2000);
    // NOTE: intentionally NOT unref'd — on Windows, unref + stdin.resume()
    // creates a race: process may hang when stdin never closes (common on Windows pipes).
    // The 2s timeout ensures clean exit even when stdin doesn't signal 'end'.

    if (!process.stdin.isTTY) {
      await new Promise((resolve) => {
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => chunks.push(chunk));
        process.stdin.on("end", () => { clearTimeout(timer); resolve(); });
        process.stdin.on("error", () => { clearTimeout(timer); resolve(); });
        process.stdin.resume();
      });
    }

    const raw = chunks.join("").trim();
    if (raw) {
      try { hookInput = JSON.parse(raw); } catch {}
    }
  } catch {}

  // Fallback: read from env var if stdin was empty
  if (!hookInput || Object.keys(hookInput).length === 0) {
    const envData = process.env.CLAUDE_TOOL_USE_REQUEST || process.env.CLAUDE_EXTRA_CONTEXT;
    if (envData) {
      try {
        const parsed = JSON.parse(envData);
        // Normalize to hookInput format: { tool_name, tool_input: {...} }
        hookInput = {
          tool_name: parsed.name || parsed.tool || parsed.toolName || 'Skill',
          tool_input: parsed.args || parsed.arguments || parsed.toolInput || parsed,
        };
      } catch {}
    }
  }

  await processInputSafe(hookInput);
  process.exit(0);
}

function processInput(hookInput) {
  // Extract tool name and input
  const toolName = hookInput.tool_name || hookInput.toolName || "";
  const toolInput = hookInput.tool_input || hookInput.toolInput || {};
  
  // Determine if this is a skill invocation
  let skillName = "unknown";
  if (toolName === "Skill" || toolName === "skill") {
    skillName = toolInput.skill_name || toolInput.name || toolInput.skill || "unknown";
  } else if (toolName === "Bash" || toolName === "bash") {
    // Check if bash command is invoking a skill
    const cmd = (toolInput.command || "").trim();
    const skillMatch = cmd.match(/\/(?:kf-)?(\S+)/);
    if (skillMatch && classifySkill(skillMatch[1]) !== "other") {
      skillName = skillMatch[1];
    } else {
      // Not a skill invocation, skip logging
      return Promise.resolve();
    }
  } else {
    // Not a skill-related tool call, exit silently
    return Promise.resolve();
  }
  
  const entry = {
    trace_id: getActiveTraceId(),
    span_id: Math.random().toString(36).slice(2, 10),
    parent_span_id: null,
    timestamp: new Date().toISOString(),
    agent: process.env.CLAUDE_AGENT_NAME || process.env.CLAUDE_SESSION_ID || "hook",
    team: inferTeam(process.env.CLAUDE_AGENT_NAME || process.env.CLAUDE_SESSION_ID || ""),
    skill: skillName,
    skill_type: classifySkill(skillName),
    trigger: "hook",
    call_level: 1,
    phase: "",
    result: "running",
    duration_ms: 0,
    model_used: "",
    tokens_in: 0,
    tokens_out: 0,
    cache_hit: 0,
    note: "auto-captured"
  };
  
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n"); } catch {}
  // Push to monitor (fire & forget — return promise for callers to await)
  return pushToMonitor(entry);
}

// ============================================================
// status
// ============================================================
function showStatus() {
  if (!fs.existsSync(LOG_PATH)) { console.log("[token-tracker] no log"); return; }
  const entries = readLog();
  if (entries.length === 0) { console.log("[token-tracker] empty log"); return; }
  const start = entries[0];
  const dur = Math.round((Date.now() - new Date(start.timestamp)) / 60000);
  const teams = [...new Set(entries.map(e => e.team).filter(t => t && t !== "unknown"))];
  const skills = [...new Set(entries.map(e => e.skill))];
  const agents = [...new Set(entries.map(e => e.agent))];
  const kfCalls = entries.filter(e => e.skill_type === "kf-custom").length;
  const genCalls = entries.filter(e => e.skill_type === "general").length;
  const mcpCalls = entries.filter(e => e.skill_type === "mcp-tool").length;
  
  // Token stats
  const totalIn = entries.reduce((s, e) => s + (e.tokens_in || 0), 0);
  const totalOut = entries.reduce((s, e) => s + (e.tokens_out || 0), 0);
  const totalCache = entries.reduce((s, e) => s + (e.cache_hit || 0), 0);
  
  console.log("\n=== kf-token-tracker Status ===");
  console.log("Task: " + start.trace_id);
  console.log("Duration: " + dur + " min");
  console.log("Agents: " + agents.length + " | Teams: " + (teams.join("/") || "unknown"));
  console.log("Total calls: " + entries.length);
  console.log("  kf-custom: " + kfCalls + " | general: " + genCalls + " | mcp: " + mcpCalls);
  console.log("Unique skills: " + skills.length);
  if (totalIn || totalOut) {
    console.log("\nToken Usage:");
    console.log("  Input: " + totalIn.toLocaleString() + " | Output: " + totalOut.toLocaleString() + " | Cache Hit: " + totalCache.toLocaleString());
    const totalInputAll = totalIn + totalCache;
    console.log("  Cache Rate: " + (totalInputAll > 0 ? (totalCache / totalInputAll * 100).toFixed(1) : 0) + "%");
  }
  
  console.log("\nRecent (last 15):");
  entries.slice(-15).forEach(e => {
    const ts = e.timestamp.slice(11, 19);
    const emoji = { red: "R", blue: "B", green: "G", judge: "J", coordinator: "C" }[e.team] || "?";
    const tag = { "kf-custom": "kf", general: "gen", "mcp-tool": "mcp", other: "???", unknown: "?" }[e.skill_type] || "?";
    const res = e.result === "success" ? "OK" : e.result === "failure" ? "FAIL" : "...";
    const tokInfo = (e.tokens_in || e.tokens_out) ? " " + (e.tokens_in || 0) + "/" + (e.tokens_out || 0) + "tok" : "";
    console.log("  [" + ts + "] " + emoji + " " + e.agent + " -> " + e.skill + " [" + tag + "] " + res + tokInfo + (e.note ? " (" + e.note + ")" : ""));
  });
}

// ============================================================
// tree
// ============================================================
function showTree() {
  if (!fs.existsSync(LOG_PATH)) { console.log("[token-tracker] no log"); return; }
  const entries = readLog();
  if (entries.length === 0) { console.log("[token-tracker] empty"); return; }
  console.log(buildTree(entries));
}

// ============================================================
// cost summary
// ============================================================
function showCost() {
  if (!fs.existsSync(LOG_PATH)) { console.log("[token-tracker] no log"); return; }
  const entries = readLog();
  if (entries.length === 0) { console.log("[token-tracker] empty"); return; }
  
  console.log("\n=== Token Cost Summary ===\n");
  
  // By model
  const byModel = {};
  entries.forEach(e => {
    const model = e.model_used || "unknown";
    if (!byModel[model]) byModel[model] = { calls: 0, tokensIn: 0, tokensOut: 0, cacheHit: 0 };
    byModel[model].calls++;
    byModel[model].tokensIn += e.tokens_in || 0;
    byModel[model].tokensOut += e.tokens_out || 0;
    byModel[model].cacheHit += e.cache_hit || 0;
  });
  
  console.log("| Model | Calls | Input Tok | Output Tok | Cache Hit | Cache% | Est. Cost |");
  console.log("|-------|-------|----------|-----------|-----------|--------|-----------|");
  let totalCost = 0;
  Object.entries(byModel).sort((a, b) => b[1].calls - a[1].calls).forEach(([model, d]) => {
    const cost = calcCost(d.tokensIn, d.tokensOut, d.cacheHit, model);
    totalCost += cost.total_cost;
    const totalIn = d.tokensIn + d.cacheHit;
    const cachePct = totalIn > 0 ? (d.cacheHit / totalIn * 100).toFixed(1) : "0";
    console.log("| " + model + " | " + d.calls + " | " + d.tokensIn.toLocaleString() + " | " + d.tokensOut.toLocaleString() + " | " + d.cacheHit.toLocaleString() + " | " + cachePct + "% | ¥" + cost.total_cost.toFixed(4) + " |");
  });
  console.log("\nTotal estimated cost: ¥" + totalCost.toFixed(4));
  
  // By skill
  console.log("\n| Skill | Type | Input Tok | Output Tok | Model |");
  console.log("|-------|------|----------|-----------|-------|");
  const bySkill = {};
  entries.forEach(e => {
    if (!bySkill[e.skill]) bySkill[e.skill] = { type: e.skill_type, tokensIn: 0, tokensOut: 0, models: new Set() };
    bySkill[e.skill].tokensIn += e.tokens_in || 0;
    bySkill[e.skill].tokensOut += e.tokens_out || 0;
    if (e.model_used) bySkill[e.skill].models.add(e.model_used);
  });
  Object.entries(bySkill).sort((a, b) => b[1].tokensIn - a[1].tokensIn).forEach(([skill, d]) => {
    console.log("| " + skill + " | " + d.type + " | " + d.tokensIn.toLocaleString() + " | " + d.tokensOut.toLocaleString() + " | " + [...d.models].join(",") + " |");
  });
}

// ============================================================
// report
// ============================================================
function generateReport() {
  if (!fs.existsSync(LOG_PATH)) { console.log("[token-tracker] no log"); return; }
  const entries = readLog();
  if (entries.length === 0) { console.log("[token-tracker] empty"); return; }
  
  const traceId = entries[0].trace_id;
  const startTime = entries[0].timestamp;
  const endTime = entries[entries.length - 1].timestamp;
  const durMin = Math.max(1, Math.round((new Date(endTime) - new Date(startTime)) / 60000));
  const agents = [...new Set(entries.map(e => e.agent))];
  const teams = [...new Set(entries.map(e => e.team).filter(Boolean))];
  const skills = [...new Set(entries.map(e => e.skill))];
  const okCount = entries.filter(e => e.result === "success").length;
  const failCount = entries.filter(e => e.result === "failure").length;
  
  // Token totals
  const totalIn = entries.reduce((s, e) => s + (e.tokens_in || 0), 0);
  const totalOut = entries.reduce((s, e) => s + (e.tokens_out || 0), 0);
  const totalCache = entries.reduce((s, e) => s + (e.cache_hit || 0), 0);
  
  // Skill frequency
  const skillFreq = {};
  entries.forEach(e => {
    if (!skillFreq[e.skill]) skillFreq[e.skill] = { count: 0, type: e.skill_type || classifySkill(e.skill), agents: new Set(), success: 0, fail: 0, totalMs: 0, tokIn: 0, tokOut: 0, cacheHit: 0 };
    const s = skillFreq[e.skill];
    s.count++; s.agents.add(e.agent);
    if (e.result === "success") s.success++;
    if (e.result === "failure") s.fail++;
    s.totalMs += e.duration_ms; s.tokIn += e.tokens_in || 0; s.tokOut += e.tokens_out || 0; s.cacheHit += e.cache_hit || 0;
  });
  
  const agentMatrix = {};
  entries.forEach(e => {
    if (!agentMatrix[e.agent]) agentMatrix[e.agent] = {};
    agentMatrix[e.agent][e.skill] = (agentMatrix[e.agent][e.skill] || 0) + 1;
  });
  
  // Token savings
  const savings = { lean_ctx: 0, model_router: 0, ccp_skip: 0, lambda_lang: 0 };
  entries.forEach(e => {
    if (e.skill === "lean-ctx") savings.lean_ctx += e.cache_hit || 0;
    if (e.skill === "kf-model-router") savings.model_router += e.tokens_in || 0;
    if (e.skill === "claude-code-pro") savings.ccp_skip += e.tokens_in || 0;
    if (e.skill === "lambda-lang") savings.lambda_lang += e.tokens_in || 0;
  });
  
  // Skill type breakdown
  const typeBreakdown = {};
  entries.forEach(e => {
    const t = e.skill_type || classifySkill(e.skill);
    if (!typeBreakdown[t]) typeBreakdown[t] = { count: 0, skills: new Set() };
    typeBreakdown[t].count++;
    typeBreakdown[t].skills.add(e.skill);
  });
  
  const sorted = Object.entries(skillFreq).sort((a, b) => b[1].count - a[1].count);
  const now = new Date().toISOString().slice(0, 19);
  
  const inv = fs.existsSync(INVENTORY_PATH) ? JSON.parse(fs.readFileSync(INVENTORY_PATH, "utf-8")) : scanInventory();
  
  let md = "# kf-token-tracker Report\n\n> Generated: " + now + " | Task: " + traceId + "\n\n";
  
  // Overview
  md += "## Overview\n\n| Metric | Value |\n|---|---|\n";
  md += "| Task | " + traceId + " |\n| Start | " + startTime + " |\n| End | " + endTime + " |\n";
  md += "| Duration | " + durMin + " min |\n| Agents | " + agents.length + " |\n| Teams | " + teams.join(" / ") + " |\n";
  md += "| Skills used | " + skills.length + " / " + inv.total + " installed |\n| Calls | " + entries.length + " |\n";
  md += "| Success Rate | " + (entries.length > 0 ? Math.round(okCount / entries.length * 100) : 0) + "% |\n\n";
  
  // Token overview
  md += "## Token Usage\n\n| Metric | Value |\n|---|---|\n";
  md += "| Total Input Tokens | " + totalIn.toLocaleString() + " |\n";
  md += "| Total Output Tokens | " + totalOut.toLocaleString() + " |\n";
  md += "| Cache Hit Tokens | " + totalCache.toLocaleString() + " |\n";
  const totalAll = totalIn + totalCache;
  md += "| Cache Hit Rate | " + (totalAll > 0 ? (totalCache / totalAll * 100).toFixed(1) : 0) + "% |\n";
  md += "| Effective Input (uncached) | " + totalIn.toLocaleString() + " |\n\n";
  
  // Skill type breakdown
  md += "## Skill Type Breakdown\n\n| Type | Calls | Unique Skills | Input Tok | Output Tok | Cache Hit |\n|---|---|---|---|---|---|\n";
  Object.entries(typeBreakdown).sort((a, b) => b[1].count - a[1].count).forEach(([t, d]) => {
    const tIn = entries.filter(e => (e.skill_type || classifySkill(e.skill)) === t).reduce((s, e) => s + (e.tokens_in || 0), 0);
    const tOut = entries.filter(e => (e.skill_type || classifySkill(e.skill)) === t).reduce((s, e) => s + (e.tokens_out || 0), 0);
    const tCache = entries.filter(e => (e.skill_type || classifySkill(e.skill)) === t).reduce((s, e) => s + (e.cache_hit || 0), 0);
    md += "| " + t + " | " + d.count + " | " + d.skills.size + " | " + tIn.toLocaleString() + " | " + tOut.toLocaleString() + " | " + tCache.toLocaleString() + " |\n";
  });
  
  // Skill coverage
  md += "\n## Skill Coverage\n\n- **kf-custom skills**: " + inv.kf_skills.length + " installed, " + new Set(entries.filter(e => e.skill_type === "kf-custom").map(e => e.skill)).size + " called\n";
  md += "- **General skills**: " + inv.general_skills.length + " installed, " + new Set(entries.filter(e => e.skill_type === "general").map(e => e.skill)).size + " called\n";
  md += "- **Uncalled skills**: " + Math.max(0, inv.total - skills.length) + " (not used in this task)\n\n";
  
  // Call chain tree
  md += "## Call Chain Tree\n\n```\n" + buildTree(entries) + "\n```\n\n";
  
  // Skill frequency with token detail
  md += "## Skill Frequency\n\n| Skill | Type | Calls | Agents | OK | Fail | Input Tok | Output Tok | Cache Hit | Cache% |\n|---|---|---|---|---|---|---|---|---|---|\n";
  sorted.forEach(([skill, d]) => {
    const totalTokIn = d.tokIn + d.cacheHit;
    const cachePct = totalTokIn > 0 ? (d.cacheHit / totalTokIn * 100).toFixed(1) : "0";
    md += "| " + skill + " | " + d.type + " | " + d.count + " | " + d.agents.size + " | " + d.success + " | " + d.fail + " | " + d.tokIn.toLocaleString() + " | " + d.tokOut.toLocaleString() + " | " + d.cacheHit.toLocaleString() + " | " + cachePct + "% |\n";
  });
  
  // Agent x Skill matrix
  md += "\n## Agent x Skill Matrix\n\n| Agent | Skills (count) |\n|---|---|\n";
  Object.entries(agentMatrix).forEach(([agent, sk]) => {
    const list = Object.entries(sk).sort((a, b) => b[1] - a[1]).map(([s, c]) => s + "(" + c + ")").join(", ");
    md += "| " + agent + " | " + list + " |\n";
  });
  
  // Token savings
  md += "\n## Token Savings\n\n| Mechanism | Tokens Saved | Cache Hit | Note |\n|---|---|---|---|\n";
  md += "| lean-ctx | " + savings.lean_ctx.toLocaleString() + " | " + savings.lean_ctx.toLocaleString() + " | checkpoint/ctx_read |\n";
  md += "| model-router | " + savings.model_router.toLocaleString() + " | — | pro->flash auto |\n";
  md += "| ccp skip | " + savings.ccp_skip.toLocaleString() + " | — | skip unnecessary spawn |\n";
  md += "| lambda-lang | " + savings.lambda_lang.toLocaleString() + " | — | 3x agent comm |\n";
  md += "| **Total** | **" + Object.values(savings).reduce((a, b) => a + b, 0).toLocaleString() + "** | | |\n\n";
  
  // Full log
  md += "## Full Log\n\n| Time | Agent | Skill | Type | Result | Phase | Model | In Tok | Out Tok | Cache | Note |\n|---|---|---|---|---|---|---|---|---|---|---|\n";
  entries.forEach(e => {
    const ts = e.timestamp.slice(11, 19);
    const r = e.result === "success" ? "OK" : e.result === "failure" ? "FAIL" : "...";
    md += "| " + ts + " | " + e.agent + " | " + e.skill + " | " + (e.skill_type || "?") + " | " + r + " | " + e.phase + " | " + e.model_used + " | " + (e.tokens_in || 0) + " | " + (e.tokens_out || 0) + " | " + (e.cache_hit || 0) + " | " + e.note + " |\n";
  });
  
  const reportDir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(REPORT_PATH, md, "utf-8");
  
  const summary = {
    trace_id: traceId, start: startTime, end: endTime, duration_min: durMin,
    agents: agents.length, calls: entries.length, success_rate: entries.length > 0 ? Math.round(okCount / entries.length * 100) : 0,
    skills_used: skills.length, skills_installed: inv.total,
    token_total: { input: totalIn + totalCache, output: totalOut, cache_hit: totalCache, cache_rate: (totalIn + totalCache) > 0 ? (totalCache / (totalIn + totalCache) * 100).toFixed(1) + "%" : "0%" },
    kf_called: entries.filter(e => e.skill_type === "kf-custom").length,
    general_called: entries.filter(e => e.skill_type === "general").length,
    top: sorted.slice(0, 5).map(([s, d]) => ({ skill: s, count: d.count, type: d.type })),
    savings: savings, report: REPORT_PATH
  };
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf-8");
  console.log("[token-tracker] Report: " + REPORT_PATH);
}

// ============================================================
// reset
// ============================================================
function resetLog() {
  if (fs.existsSync(LOG_PATH)) fs.unlinkSync(LOG_PATH);
  if (fs.existsSync(SUMMARY_PATH)) fs.unlinkSync(SUMMARY_PATH);
  console.log("[token-tracker] log reset");
}

// ============================================================
// Helpers
// ============================================================
function parseArgs(a) { const r = {}; for (let i = 0; i < a.length; i++) { if (a[i].startsWith("--") && i + 1 < a.length) { r[a[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[++i]; } } return r; }
function readLog() { if (!fs.existsSync(LOG_PATH)) return []; return fs.readFileSync(LOG_PATH, "utf-8").trim().split("\n").filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
function getActiveTraceId() { const n = new Date(); return "mvp-" + n.toISOString().slice(0, 10).replace(/-/g, "") + "-" + n.toTimeString().slice(0, 5).replace(":", ""); }
function inferTeam(agent) { if (!agent) return "unknown"; const a = agent.toLowerCase(); if (a.includes("red") || a.includes("\u7ea2")) return "red"; if (a.includes("blue") || a.includes("\u84dd")) return "blue"; if (a.includes("green") || a.includes("\u7eff")) return "green"; if (a.includes("judge") || a.includes("\u88c1\u5224")) return "judge"; if (a.includes("coordinator") || a.includes("\u534f\u8c03")) return "coordinator"; return "unknown"; }

function buildTree(entries) {
  const byAgent = {};
  entries.forEach(e => { if (!byAgent[e.agent]) byAgent[e.agent] = []; byAgent[e.agent].push(e); });
  const traceId = entries[0].trace_id;
  const ts = entries[0].timestamp.slice(0, 19);
  const teamOrder = ["coordinator", "red", "blue", "green", "judge", "unknown"];
  const emoji = { coordinator: "C", red: "R", blue: "B", green: "G", judge: "J", unknown: "?" };
  const byTeam = {};
  Object.keys(byAgent).forEach(a => { const t = inferTeam(a); if (!byTeam[t]) byTeam[t] = []; byTeam[t].push(a); });
  let lines = ["/hang (" + traceId + ", " + ts + ")"];
  const st = teamOrder.filter(t => byTeam[t]);
  st.forEach((team, ti) => {
    const isLast = ti >= st.length - 1;
    const pfx = isLast ? "... " : "|-- ";
    const child = isLast ? "    " : "|   ";
    byTeam[team].forEach((agent, ai) => {
      const isLastA = ai >= byTeam[team].length - 1;
      lines.push(pfx + (emoji[team] || "?") + " " + agent);
      const calls = byAgent[agent];
      calls.forEach((c, ci) => {
        const isLastC = ci >= calls.length - 1;
        const cp = isLastC ? "... " : "|-- ";
        const indent = child + (isLastA ? "    " : "|   ");
        const tag = { "kf-custom": "kf", general: "gen", "mcp-tool": "mcp", other: "???", unknown: "?" }[c.skill_type || "?"] || "?";
        const r = c.result === "success" ? "OK" : c.result === "failure" ? "FAIL" : "...";
        const m = c.model_used ? " [" + c.model_used + "]" : "";
        const tokInfo = (c.tokens_in || c.tokens_out) ? " " + (c.tokens_in || 0) + "/" + (c.tokens_out || 0) : "";
        const n = c.note ? " (" + c.note + ")" : "";
        lines.push(indent + cp + c.skill + " [" + tag + "]" + m + " " + r + tokInfo + n);
      });
    });
  });
  return lines.join("\n");
}

// ============================================================
// CLI
// ============================================================
const cmd = process.argv[2];
const args = process.argv.slice(3);

if (cmd === "pre-tool") {
  preToolHook(); // async, reads stdin
} else {
  switch (cmd) {
    case "log": logEntry(args); break;
    case "status": showStatus(); break;
    case "tree": showTree(); break;
    case "report": generateReport(); break;
    case "inventory": showInventory(); break;
    case "cost": showCost(); break;
    case "reset": resetLog(); break;
    default: console.log("Usage: node token-tracker.cjs <log|pre-tool|status|tree|report|inventory|cost|reset>"); break;
  }
}

