#!/usr/bin/env node
/**
 * perf-server.cjs — 实时 Perf Dashboard HTTP 服务器
 *
 * 自动读取 JSONL 数据，每次请求重新生成 HTML，浏览器每 5 秒自动刷新。
 * 后台运行，无需手动执行任何命令。
 *
 * 用法:
 *   node perf-server.cjs                   默认端口 3456
 *   node perf-server.cjs --port 8080       指定端口
 *   node perf-server.cjs --daemon         后台运行 (Windows用 start)
 *
 * 然后在浏览器打开: http://localhost:3456
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const portArg = process.argv.find(a => a.startsWith('--port='));
const portVal = portArg ? portArg.split('=')[1] : '3456';
const PORT = parseInt(portVal, 10) || 3456;
const DAEMON = process.argv.includes('--daemon');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PERF_DIR = path.join(ROOT, '.claude-flow', 'perf');
const TURNS_FILE = path.join(PERF_DIR, 'turns.jsonl');
const OPTS_FILE = path.join(PERF_DIR, 'optimizations.jsonl');
const SESSIONS_FILE = path.join(PERF_DIR, 'sessions.json');

// ─── Data loaders (synchronous, called per-request) ───
function readJSONL(fp) {
  try {
    if (!fs.existsSync(fp)) return [];
    return fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function readJSON(fp, fallback) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return fallback || {}; }
}

function fmtTok(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ─── Generate HTML ───
function generateHTML() {
  const turns = readJSONL(TURNS_FILE);
  const opts = readJSONL(OPTS_FILE);
  const sessions = readJSON(SESSIONS_FILE, {});
  const convTurns = turns.filter(e => e.type === 'turn');
  const a2aMsgs = turns.filter(e => e.type === 'a2a');

  // Aggregate optimizations
  const totalSavings = {};
  opts.forEach(o => {
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

  const totalInput = totalUncached + totalCached;
  const cacheRate = totalInput > 0 ? (totalCached / totalInput * 100).toFixed(1) : '0.0';

  // Model switch count
  const modelSwitchCount = opts.filter(o => o.model_switched).length;

  // Per-model cost
  const byModel = {};
  turns.forEach(e => {
    const m = e.model_used || 'unknown';
    if (!byModel[m]) byModel[m] = { calls: 0, input_uncached: 0, input_cached: 0, output: 0 };
    byModel[m].calls++;
    byModel[m].input_uncached += e.tokens?.input_uncached || 0;
    byModel[m].input_cached += e.tokens?.input_cached || 0;
    byModel[m].output += e.tokens?.output || 0;
  });

  // ─── Build HTML ───
  let html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">';
  // Auto-refresh every 5 seconds
  html += '<meta http-equiv="refresh" content="5">';
  html += '<title>⚡ Perf Dashboard (Live)</title>';
  html += '<style>';
  html += ':root{--bg:#0a0a0f;--bg2:#101018;--surface:#161625;--surf2:#1c1c30;--surf3:#22223a;--bdr:#2a2a42;--bdr-l:#333355;--txt:#e8e8ed;--txt2:#9494b0;--txt3:#5a5a78;--grn:#22c55e;--grn2:#16a34a;--grn-g:rgba(34,197,94,.12);--grn-b:rgba(34,197,94,.3);--amber:#f59e0b;--red:#ef4444;--blue:#3b82f6;--purple:#a855f7;--cyan:#06b6d4;--r:6px}';
  html += '*{margin:0;padding:0;box-sizing:border-box}';
  html += 'body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--txt);padding:24px;line-height:1.5}';
  html += 'h1{font-size:22px;margin-bottom:2px;color:#fff;font-weight:600}';
  html += 'h2{font-size:15px;margin:24px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--bdr);color:var(--txt);font-weight:500;letter-spacing:.3px}';
  html += '.status-bar{display:flex;gap:12px;align-items:center;margin:8px 0 14px;font-size:12px;color:var(--txt3)}';
  html += '.live-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--grn);animation:pulse 2s infinite}';
  html += '@keyframes pulse{0%{opacity:1}50%{opacity:.3}100%{opacity:1}}';
  html += '.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:14px 0}';
  html += '.card{background:var(--surface);border:1px solid var(--bdr);border-radius:var(--r);padding:14px 12px;text-align:center}';
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
  html += '.badge{display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;letter-spacing:.3px}';
  html += '.badge-h2a{background:var(--grn-g);color:var(--grn);border:1px solid var(--grn-b)}';
  html += '.badge-a2a{background:rgba(168,85,247,.15);color:var(--purple);border:1px solid rgba(168,85,247,.3)}';
  html += '.badge-role-human{background:rgba(59,130,246,.12);color:var(--blue);margin-left:3px}';
  html += '.badge-role-ai{background:rgba(34,197,94,.1);color:var(--grn);margin-left:3px}';
  html += '.badge-skill{background:rgba(6,182,212,.12);color:var(--cyan);margin-left:3px}';
  html += '.badge-switch{background:rgba(245,158,11,.15);color:var(--amber);border:1px solid rgba(245,158,11,.25);margin-left:3px}';
  html += '.mtag{display:inline-block;padding:1px 7px;border-radius:8px;font-size:10.5px;font-weight:500}';
  html += '.mtag-pro{background:rgba(245,158,11,.15);color:var(--amber);border:1px solid rgba(245,158,11,.25)}';
  html += '.mtag-flash{background:var(--grn-g);color:var(--grn);border:1px solid var(--grn-b)}';
  html += '.mtag-kimi{background:rgba(239,68,68,.1);color:var(--red);border:1px solid rgba(239,68,68,.2)}';
  html += '.mtag-minimax{background:rgba(6,182,212,.1);color:var(--cyan);border:1px solid rgba(6,182,212,.2)}';
  html += '.mtag-unknown{color:var(--txt3);border:1px solid var(--bdr)}';
  html += '.cell-sub{color:var(--txt3);font-size:10.5px;margin-top:2px;line-height:1.4}';
  html += '.saving-wrap{background:var(--surface);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden}';
  html += '.saving-row{padding:8px 12px;display:flex;justify-content:space-between;border-bottom:1px solid var(--bdr);font-size:13px}';
  html += '.saving-row:last-child{border-bottom:none}';
  html += '.saving-total{font-size:14px;font-weight:600;color:var(--grn);text-align:right;padding:10px 12px 4px;border-top:1px solid var(--grn-b)}';
  html += '.footer{text-align:center;color:var(--txt3);font-size:11px;margin-top:30px;padding:20px 0;border-top:1px solid var(--bdr)}';
  html += '::-webkit-scrollbar{width:6px;height:6px}';
  html += '::-webkit-scrollbar-track{background:var(--bg2)}';
  html += '::-webkit-scrollbar-thumb{background:var(--surf3);border-radius:3px}';
  html += '@media(max-width:768px){td,th{padding:4px 6px;font-size:11px}.summary{grid-template-columns:repeat(2,1fr)}}';
  html += '</style></head><body>';

  // Header with live indicator
  html += '<div style="display:flex;align-items:center;justify-content:space-between">';
  html += '<h1>⚡ Perf Dashboard</h1>';
  html += '<div class="status-bar"><span class="live-dot"></span> LIVE · 每 5 秒自动刷新</div>';
  html += '</div>';
  html += '<p style="color:var(--txt3);font-size:12px">' + new Date().toISOString().slice(0,19).replace('T',' ') + ' · ' + (convTurns.length + a2aMsgs.length) + ' 条记录</p>';

  // Summary cards
  html += '<div class="summary">';
  html += '<div class="card"><div class="val">' + (convTurns.length + a2aMsgs.length) + '</div><div class="lbl">总调用</div></div>';
  html += '<div class="card"><div class="val">' + fmtTok(totalInput) + '</div><div class="lbl">输入 Token</div></div>';
  html += '<div class="card"><div class="val">' + cacheRate + '%</div><div class="lbl">缓存命中</div></div>';
  html += '<div class="card"><div class="val">' + fmtTok(totalOutput) + '</div><div class="lbl">输出 Token</div></div>';
  html += '<div class="card warn"><div class="val">' + modelSwitchCount + '</div><div class="lbl">模型切换</div></div>';
  html += '<div class="card good"><div class="val">' + Object.keys(byModel).length + '</div><div class="lbl">模型数</div></div>';
  html += '</div>';

  // Build opt lookup for live savings display
  const optMap = {};
  opts.forEach(o => { optMap[o.opt_id] = o; });

  // Per-turn table
  html += '<h2>📋 最近轮次</h2>';
  html += '<div style="overflow-x:auto"><table><thead><tr>';
  html += '<th>ID</th><th>类型</th><th>方向</th><th>模型</th><th class="num">输入</th><th class="num">缓存</th><th class="num">输出</th><th>优化节省</th><th>消息内容</th></tr></thead><tbody>';

  const displayTurns = turns.slice(-50).reverse();
  displayTurns.forEach(e => {
    const tok = e.tokens || {};
    const model = e.model_used || '?';
    const modelLower = model.toLowerCase();
    let mtag = 'mtag';
    if (modelLower.includes('flash')) mtag += ' mtag-flash';
    else if (modelLower.includes('pro')) mtag += ' mtag-pro';
    else if (modelLower.includes('kimi')) mtag += ' mtag-kimi';
    else if (modelLower.includes('mini')) mtag += ' mtag-minimax';
    else mtag += ' mtag-unknown';

    let typeHtml, dirHtml;
    const isHuman = e.type === 'turn' && e.role === 'human';
    const isAI = e.type === 'turn' && e.role === 'ai';
    if (isHuman) { typeHtml = '<span class="badge badge-h2a">H2A</span>'; dirHtml = '👤→🤖'; }
    else if (isAI) { typeHtml = '<span class="badge badge-role-ai" style="background:rgba(34,197,94,.1);color:var(--grn);border:1px solid rgba(34,197,94,.3)">A2H</span>'; dirHtml = '🤖→👤'; }
    else if (e.type === 'a2a') { typeHtml = '<span class="badge badge-a2a">A2A</span>'; dirHtml = (e.from_agent||'?')+'→'+(e.to_agent||'?'); }
    else { typeHtml = '<span class="badge badge-h2a">H2A</span>'; dirHtml = '👤→🤖'; }

    // Parse note for message content display
    const note = e.note || '';
    let msgDisplay = '', badgeDisplay = '';
    // Format: "switch: old→new ✓ | <message>" or "taskType (no switch) | <message>"
    const pipeIdx = note.indexOf(' | ');
    if (pipeIdx !== -1) {
      badgeDisplay = note.slice(0, pipeIdx);
      msgDisplay = esc(note.slice(pipeIdx + 3));
    } else if (note.includes('switch:')) {
      badgeDisplay = note;
      msgDisplay = '';
    } else {
      msgDisplay = esc(note);
    }

    // Truncate long messages
    if (msgDisplay.length > 80) msgDisplay = msgDisplay.slice(0, 80) + '…';

    // Opt savings string
    let optStr = '';
    if (e.opt_id && optMap[e.opt_id]) {
      const mechs = optMap[e.opt_id].mechanisms || {};
      const parts = [];
      Object.entries(mechs).forEach(([mId, mData]) => {
        if (mData.saved > 0) parts.push(mId + ':-' + fmtTok(mData.saved));
      });
      if (parts.length > 0) optStr = parts.join('<br>');
    }

    html += '<tr>';
    html += '<td style="color:var(--txt3);font-size:11px;font-family:monospace">' + esc(e.id) + '</td>';
    html += '<td>' + typeHtml + '</td>';
    html += '<td style="font-size:12px">' + dirHtml + '</td>';
    html += '<td><span class="' + mtag + '">' + esc(model) + '</span></td>';
    html += '<td class="num">' + fmtTok(tok.input_uncached || 0) + '</td>';
    html += '<td class="num" style="color:var(--grn)">' + fmtTok(tok.input_cached || 0) + '</td>';
    html += '<td class="num">' + fmtTok(tok.output || 0) + '</td>';
    html += '<td style="font-size:10.5px;color:var(--grn);line-height:1.5">' + optStr + '</td>';
    html += '<td style="font-size:11px;max-width:300px;overflow:hidden;text-overflow:ellipsis">';
    if (badgeDisplay) {
      html += '<span class="badge badge-switch" style="font-size:9px">' + esc(badgeDisplay) + '</span> ';
    }
    html += '<span style="color:var(--txt2)">' + msgDisplay + '</span>';
    if (e.message_size_bytes) {
      html += ' <span style="color:var(--txt3);font-size:9px">(' + fmtTok(e.message_size_bytes) + 'B)</span>';
    }
    html += '</td>';
    html += '</tr>';
  });

  if (displayTurns.length === 0) {
    html += '<tr><td colspan="9" style="text-align:center;color:var(--txt3);padding:20px">暂无数据 — 发送消息后自动出现</td></tr>';
  }

  html += '</tbody></table></div>';

  // Model breakdown
  html += '<h2>💰 模型分布</h2>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:10px">';
  Object.entries(byModel).forEach(([model, d]) => {
    const modelLower = model.toLowerCase();
    let color = 'var(--amber)';
    if (modelLower.includes('flash')) color = 'var(--grn)';
    else if (modelLower.includes('kimi')) color = 'var(--red)';
    else if (modelLower.includes('mini')) color = 'var(--cyan)';
    html += '<div class="card"><div class="val" style="color:' + color + '">' + d.calls + '</div><div class="lbl">' + esc(model) + '</div></div>';
  });
  html += '</div>';

  // Savings breakdown
  html += '<h2>📊 优化节省 (不含模型切换)</h2>';
  html += '<div class="saving-wrap">';
  const savingMechLabels = {
    lean_ctx: 'lean-ctx 上下文压缩',
    l1_cache: 'L1 共享前缀缓存',
    l2_warmup: 'L2 长上下文预热',
    l3_skill_stub: 'L3 技能按需加载',
    ccp_skip: 'CCP Skip — 阶段跳过',
    lambda_lang: 'lambda-lang A2A 压缩',
  };
  let hasAnySaving = false;
  Object.keys(savingMechLabels).forEach(mechId => {
    const saved = totalSavings[mechId] || 0;
    if (saved > 0) {
      hasAnySaving = true;
      html += '<div class="saving-row"><span>' + savingMechLabels[mechId] + '</span><span style="color:var(--grn)">' + fmtTok(saved) + ' tok</span></div>';
    }
  });
  Object.keys(savingMechLabels).forEach(mechId => {
    const saved = totalSavings[mechId] || 0;
    if (saved === 0) {
      html += '<div class="saving-row" style="color:var(--txt3)"><span>' + savingMechLabels[mechId] + '</span><span>— 无数据</span></div>';
    }
  });
  const grandTotal = Object.values(totalSavings).reduce((s, v) => s + v, 0);
  html += '<div class="saving-total">总计节约: ' + fmtTok(grandTotal) + ' tok</div>';
  html += '</div>';

  // Footer
  html += '<div class="footer">⚡ Live Perf Dashboard · 数据来源: turns.jsonl + optimizations.jsonl · 启动: ' + new Date().toISOString().slice(0,19).replace('T',' ') + '</div>';

  html += '</body></html>';
  return html;
}

// ─── HTTP Server ───
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }

  const html = generateHTML();
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.end(html);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ⚡ Perf Dashboard (Live)');
  console.log('  ─────────────────────────');
  console.log(`  → http://localhost:${PORT}`);
  console.log('  → 每 5 秒自动刷新');
  console.log('  → Ctrl+C 停止服务');
  console.log('');
});
