#!/usr/bin/env node
/**
 * tokenforge.cjs — LLM token compression engine (Node.js)
 *
 * Replicates TokenForge core without Rust dependency.
 * Compression engines: output, json, code, auto
 *
 * Usage:
 *   node tokenforge.cjs compress --type <output|json|code|auto> [--level light|medium|aggressive]
 *   node tokenforge.cjs hook                          # reads PostToolUse JSON from stdin
 *   node tokenforge.cjs stats                         # show compression stats
 *   echo "..." | node tokenforge.cjs compress --type output --level aggressive
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.env.HOME || process.env.USERPROFILE, '.tokenforge', 'stats.json');

// ── ANSI strip ────────────────────────────────────────────────────────────────
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
          .replace(/\x1b\][0-9;]*[^\x07]*\x07/g, '');
}

// ── Output compression ────────────────────────────────────────────────────────
function compressOutput(text, level) {
  const limits = { light: 300, medium: 120, aggressive: 60 };
  const maxLines = limits[level] || 120;

  let lines = text.split('\n');

  // Strip ANSI
  lines = lines.map(stripAnsi);

  // Collapse consecutive blank lines
  const deduped = [];
  let blankStreak = 0;
  for (const line of lines) {
    if (line.trim() === '') {
      blankStreak++;
      if (blankStreak <= 1) deduped.push(line);
    } else {
      blankStreak = 0;
      deduped.push(line);
    }
  }

  // Deduplicate repeated lines (test frameworks, build output)
  const seen = new Map();
  const result = [];
  for (const line of deduped) {
    const key = line.trim();
    if (key && seen.has(key)) {
      seen.set(key, seen.get(key) + 1);
      // Replace repeated line with counter placeholder
      if (seen.get(key) === 2) {
        // Already added first occurrence; replace last line with indicator
        const idx = result.lastIndexOf(line);
        if (idx >= 0) result[idx] = line;
      }
      continue;
    }
    if (key) seen.set(key, 1);
    result.push(line);
  }

  // Add dedup summary for repeated lines
  const repeated = [...seen.entries()].filter(([, c]) => c > 1);
  if (repeated.length > 0) {
    result.push(`[tokenforge] ${repeated.length} repeated line patterns (${repeated.reduce((s, [, c]) => s + c - 1, 0)} lines collapsed)`);
  }

  // Collapse consecutive stack traces into single-line summaries
  const stackCollapsed = [];
  let inTrace = false;
  for (const line of result) {
    const isTrace = /^\s+at\s/.test(line) || /^\s+\.{3}\s/.test(line);
    if (isTrace && !inTrace) {
      stackCollapsed.push(line);
      inTrace = true;
    } else if (isTrace && inTrace) {
      // Skip middle of stack trace
      if (stackCollapsed[stackCollapsed.length - 1] !== '...') {
        stackCollapsed.push('...');
      }
    } else {
      stackCollapsed.push(line);
      inTrace = false;
    }
  }

  // Truncate long lines
  const truncated = stackCollapsed.map(l => l.length > 300 ? l.slice(0, 297) + '...' : l);

  // Limit total lines
  if (truncated.length > maxLines) {
    const half = Math.floor((maxLines - 2) / 2);
    return [...truncated.slice(0, half),
            `[tokenforge] ... ${truncated.length - maxLines + 2} lines trimmed (${level})`,
            ...truncated.slice(-half)].join('\n');
  }

  return truncated.join('\n');
}

// ── JSON compression ──────────────────────────────────────────────────────────
function compressJSON(text, level) {
  const depthLimits = { light: 8, medium: 5, aggressive: 3 };
  const maxDepth = depthLimits[level] || 5;
  const maxArraySample = level === 'aggressive' ? 3 : level === 'medium' ? 8 : 20;

  let obj;
  try { obj = JSON.parse(text); } catch { return text; }

  function compress(node, depth) {
    if (depth > maxDepth) return '[...]';

    if (Array.isArray(node)) {
      if (node.length <= maxArraySample) {
        return node.map(item => compress(item, depth + 1));
      }
      return [
        ...node.slice(0, Math.floor(maxArraySample / 2)).map(item => compress(item, depth + 1)),
        `[tokenforge] ...+${node.length - maxArraySample} items`,
        ...node.slice(-Math.floor(maxArraySample / 2)).map(item => compress(item, depth + 1)),
      ];
    }
    if (node !== null && typeof node === 'object') {
      const keys = Object.keys(node);
      if (keys.length > 30) {
        return { '[tokenforge]': `${keys.length} keys: ${keys.slice(0, 10).join(', ')}...` };
      }
      const out = {};
      for (const k of keys) {
        out[k] = compress(node[k], depth + 1);
      }
      return out;
    }
    return node;
  }

  return JSON.stringify(compress(obj, 0), null, level === 'aggressive' ? 0 : 2);
}

// ── Code compression ──────────────────────────────────────────────────────────
function compressCode(text, level) {
  const lineLimits = { light: 80, medium: 40, aggressive: 15 };
  const maxLines = lineLimits[level] || 40;

  const lines = text.split('\n');
  const result = [];
  let braceDepth = 0;
  let folded = false;
  let skipped = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Track block comments
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      skipped++;
      continue;
    }
    if (/^\/\*/.test(trimmed) && !trimmed.includes('*/')) {
      inBlockComment = true;
      skipped++;
      continue;
    }

    // Keep imports/exports/package/use statements always
    if (/^(import|export|require|package\b|use\s|#include|from\s|module\s)/.test(trimmed)) {
      if (skipped > 0) { result.push(`  // ... ${skipped} lines folded`); skipped = 0; }
      folded = false;
      result.push(line);
      continue;
    }

    // Keep function/class signatures
    if (/^(export\s+)?(async\s+)?(function|class|def\s|fn\s|func\s|pub\s+fn|impl\b|struct\b|interface\b|type\s+\w+\s*[=<])/.test(trimmed) ||
        /^(public|private|protected|static|virtual|override)\s/.test(trimmed) ||
        /^(const|let|var)\s+\w+\s*=\s*\(/.test(trimmed)) {

      if (skipped > 0) { result.push(`  // ... ${skipped} lines folded`); skipped = 0; }
      folded = false;
      result.push(line);

      // If the signature opens a block, start folding
      if (/\{$/.test(trimmed) || (trimmed.endsWith(':') && !trimmed.includes('?'))) {
        braceDepth++;
        folded = true;
      }
      continue;
    }

    // Track brace depth
    if (folded) {
      for (const ch of trimmed) {
        if (ch === '{' || ch === '(' || ch === '[') braceDepth++;
        if (ch === '}' || ch === ')' || ch === ']') braceDepth--;
      }
      if (braceDepth <= 0) {
        braceDepth = 0;
        folded = false;
        result.push(`  // ... ${skipped} body lines folded`);
        result.push(line); // closing line
        skipped = 0;
      } else {
        skipped++;
      }
      continue;
    }

    // Track braces for non-function blocks
    for (const ch of trimmed) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    result.push(line);
  }

  if (skipped > 0) {
    result.push(`  // ... ${skipped} lines folded`);
  }

  // If still too long, trim from middle
  if (result.length > maxLines) {
    const half = Math.floor((maxLines - 2) / 2);
    return [...result.slice(0, half),
            `// [tokenforge] ... ${result.length - maxLines + 2} code lines trimmed (${level})`,
            ...result.slice(-half)].join('\n');
  }

  return result.join('\n');
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function loadStats() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch { return { total: 0, savings: 0, runs: 0 }; }
}
function saveStats(s) {
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch {}
  fs.writeFileSync(DB_PATH, JSON.stringify(s, null, 2), 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const [,, cmd, ...args] = process.argv;

  if (cmd === 'hook') {
    // Read PostToolUse JSON from stdin
    let stdin = '';
    if (!process.stdin.isTTY) {
      stdin = await new Promise(resolve => {
        let d = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', c => { d += c; });
        process.stdin.on('end', () => resolve(d));
        process.stdin.resume();
        // 500ms timeout
        setTimeout(() => resolve(d), 500);
      });
    }

    if (!stdin.trim()) { process.exit(0); }
    try {
      const hookData = JSON.parse(stdin);
      const toolName = hookData.tool_name || hookData.toolName || '';
      const toolInput = hookData.tool_input || hookData.toolInput || {};
      const toolOutput = hookData.tool_output || hookData.toolOutput || hookData.output || '';

      // Determine compression type from tool name
      let ctype = 'auto';
      if (/bash|shell|exec|terminal|command/i.test(toolName)) ctype = 'output';
      else if (/read|cat|view/i.test(toolName)) ctype = 'code';
      else if (/json|api|curl|fetch|http/i.test(toolName)) ctype = 'json';

      const level = 'medium';
      let compressed = toolOutput;
      if (ctype === 'output' || ctype === 'auto') compressed = compressOutput(String(toolOutput), level);
      else if (ctype === 'code') compressed = compressCode(String(toolOutput), level);
      else if (ctype === 'json') compressed = compressJSON(String(toolOutput), level);

      const originalTokens = Math.ceil(String(toolOutput).length / 4);
      const compressedTokens = Math.ceil(compressed.length / 4);
      const savings = originalTokens > 0 ? ((originalTokens - compressedTokens) / originalTokens * 100).toFixed(1) : 0;

      // Write compressed output (replace original in context)
      process.stdout.write(compressed);

      // Update stats
      const stats = loadStats();
      stats.runs++;
      stats.total += originalTokens;
      stats.savings += (originalTokens - compressedTokens);
      saveStats(stats);

      process.stderr.write(`[tokenforge] ${ctype} → ${compressedTokens} tokens (${savings}% saved, ${stats.runs} runs)\n`);
    } catch {
      process.stdout.write(stdin);
    }
    return;
  }

  if (cmd === 'stats') {
    const stats = loadStats();
    const avgSavings = stats.total > 0 ? (stats.savings / stats.total * 100).toFixed(1) : 0;
    console.log([
      '+--------------------+-----------+',
      '| TokenForge Stats             |',
      '+--------------------+-----------+',
      `| Runs               | ${String(stats.runs).padStart(9)} |`,
      `| Total input tokens | ${String(stats.total).padStart(9)} |`,
      `| Tokens saved       | ${String(stats.savings).padStart(9)} |`,
      `| Avg savings        | ${(avgSavings + '%').padStart(9)} |`,
      '+--------------------+-----------+',
    ].join('\n'));
    return;
  }

  if (cmd === 'compress') {
    const typeIdx = args.indexOf('--type');
    const levelIdx = args.indexOf('--level');
    const ctype = typeIdx >= 0 ? args[typeIdx + 1] : 'auto';
    const level = levelIdx >= 0 ? (args[levelIdx + 1] || 'medium') : 'medium';

    // Read from stdin
    let stdin = '';
    if (!process.stdin.isTTY) {
      stdin = await new Promise(resolve => {
        let d = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', c => { d += c; });
        process.stdin.on('end', () => resolve(d));
        process.stdin.resume();
        setTimeout(() => resolve(d), 500);
      });
    }

    if (!stdin.trim() && !args.length) {
      console.log('Usage: echo "..." | node tokenforge.cjs compress --type <output|json|code> [--level light|medium|aggressive]');
      process.exit(0);
    }

    let result;
    switch (ctype) {
      case 'output': result = compressOutput(stdin, level); break;
      case 'json':   result = compressJSON(stdin, level); break;
      case 'code':   result = compressCode(stdin, level); break;
      default:
        // Auto-detect by analyzing content
        const trimmed = stdin.trim();
        if (/^[\[{]/.test(trimmed)) result = compressJSON(stdin, level);
        else if (trimmed.split('\n').length > 3 && /^(import|export|function|class|def |fn |package )/m.test(trimmed)) result = compressCode(stdin, level);
        else result = compressOutput(stdin, level);
    }
    console.log(result);
    return;
  }

  // Default help
  console.log([
    'tokenforge — LLM token compression engine',
    '',
    'Commands:',
    '  compress --type output|json|code [--level light|medium|aggressive]',
    '  hook       PostToolUse hook mode (reads stdin)',
    '  stats      Show compression statistics',
    '',
    'Examples:',
    '  echo "..." | node tokenforge.cjs compress --type output --level aggressive',
    '  node tokenforge.cjs stats',
  ].join('\n'));
}

main().catch(e => {
  process.stderr.write(`[tokenforge] error: ${e.message}\n`);
  process.exit(0);
});
