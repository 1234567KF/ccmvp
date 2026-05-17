#!/usr/bin/env node
/**
 * sync-from-transcript.cjs — 从 Claude Code 会话转录同步数据到 perf-tracker
 *
 * 读取 Claude Code 的 session transcript JSONL，解析每条消息的真实 Token 使用量，
 * 写入 perf-tracker 的 turns.jsonl，然后自动生成 HTML 看板。
 *
 * 用法:
 *   node sync-from-transcript.cjs                    # 查找最新转录并同步
 *   node sync-from-transcript.cjs --file <path>      # 指定转录文件
 *   node sync-from-transcript.cjs --list             # 列出所有可用会话
 *   node sync-from-transcript.cjs --help             # 帮助
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Paths ─────────────────────────────────────────────────────
const CWD = process.cwd();
const ROOT = path.resolve(__dirname, '..', '..');
const PERF_DIR = path.join(ROOT, '.claude-flow', 'perf');
const TURNS_FILE = path.join(PERF_DIR, 'turns.jsonl');
const HOME = os.homedir();

// ─── Find transcript ──────────────────────────────────────────

function findLatestTranscript() {
  const projName = CWD.replace(/[^a-zA-Z0-9\-._~]/g, '-');
  const projDir = path.join(HOME, '.claude', 'projects', projName);
  if (fs.existsSync(projDir)) return findLatestJsonl(projDir);

  // Fallback: fuzzy match
  const base = path.join(HOME, '.claude', 'projects');
  if (!fs.existsSync(base)) return null;
  const dirs = fs.readdirSync(base).filter(d => {
    try { return fs.statSync(path.join(base, d)).isDirectory(); } catch { return false; }
  });
  const normCwd = CWD.replace(/[:/\\]/g, '-').toLowerCase();
  for (const d of dirs) {
    if (normCwd.includes(d.replace(/-/g, '').toLowerCase())) {
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

function listAllTranscripts() {
  const base = path.join(HOME, '.claude', 'projects');
  if (!fs.existsSync(base)) return [];
  const results = [];
  const dirs = fs.readdirSync(base).filter(d => {
    try { return fs.statSync(path.join(base, d)).isDirectory(); } catch { return false; }
  });
  for (const d of dirs) {
    const dirPath = path.join(base, d);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
    for (const f of files) {
      const fp = path.join(dirPath, f);
      try {
        results.push({ project: d, file: f, path: fp, mtime: fs.statSync(fp).mtimeMs });
      } catch {}
    }
  }
  return results.sort((a, b) => b.mtime - a.mtime);
}

// ─── Get model name ───────────────────────────────────────────

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

function detectModel(modelName) {
  const m = modelName.toLowerCase();
  if (m.includes('pro')) return 'pro';
  if (m.includes('flash')) return 'flash';
  if (m.includes('kimi')) return 'kimi';
  if (m.includes('mini')) return 'minimax';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'unknown';
}

// ─── Parse transcript → per-turn entries ─────────────────────

function parseTranscript(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const turns = [];
  let turnIdx = 0;
  let phase = '';

  // Try to extract phase/task name from transcript context
  // Claude Code transcripts may contain task labels in message content

  for (const l of lines) {
    try {
      const j = JSON.parse(l);
      const msg = j.message || {};
      const ts = j.timestamp || '';

      // Detect phase from assistant messages (look for phase markers in content)
      if (j.type === 'assistant' && msg.content && typeof msg.content === 'string') {
        const pMatch = msg.content.match(/[Pp]hase\s*(\d[\d.]*)/);
        if (pMatch) phase = 'Phase ' + pMatch[1];
      }

      if (j.type === 'user' && msg.content) {
        // Human turn
        turnIdx++;
      }

      if (j.type === 'assistant' && msg.usage) {
        turnIdx++;
        const u = msg.usage;
        const uncached = (u.input_tokens || 0) - (u.cache_read_input_tokens || 0);
        const cached = u.cache_read_input_tokens || 0;

        turns.push({
          type: 'turn',
          id: 't' + String(turnIdx).padStart(3, '0'),
          session_id: path.basename(filePath, '.jsonl').slice(0, 30),
          phase: phase || '',
          timestamp: ts || new Date().toISOString(),
          role: 'ai',
          model_used: detectModel(getModelName()),
          tokens: {
            input_uncached: Math.max(0, uncached),
            input_cached: cached,
            output: u.output_tokens || 0
          },
          message_size_bytes: 0,
          opt_id: null,
          note: ''
        });
      }
    } catch {}
  }

  return turns;
}

// ─── Write to turns.jsonl (append) ────────────────────────────

function writeTurns(turns) {
  if (!fs.existsSync(PERF_DIR)) {
    fs.mkdirSync(PERF_DIR, { recursive: true });
  }

  let count = 0;
  for (const t of turns) {
    fs.appendFileSync(TURNS_FILE, JSON.stringify(t) + '\n', 'utf-8');
    count++;
  }
  return count;
}

// ─── Generate HTML dashboard ──────────────────────────────────

function generateDashboard() {
  try {
    require('child_process').execSync(
      'node "' + path.join(__dirname, 'perf-tracker.cjs') + '" web',
      { cwd: ROOT, stdio: 'inherit' }
    );
  } catch (e) {
    console.error('[sync] 生成看板失败:', e.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('sync-from-transcript.cjs — 从 Claude Code 转录同步 perf 数据');
    console.log('');
    console.log('用法:');
    console.log('  node sync-from-transcript.cjs              查找最新转录并同步');
    console.log('  node sync-from-transcript.cjs --file <path> 指定转录文件');
    console.log('  node sync-from-transcript.cjs --list        列出所有可用会话');
    console.log('  node sync-from-transcript.cjs --help        帮助');
    process.exit(0);
  }

  if (args.includes('--list')) {
    const all = listAllTranscripts();
    if (all.length === 0) {
      console.log('⚠️  未找到 Claude Code 会话转录。');
      console.log('   请确认你已在 Claude Code 中运行过会话。');
      process.exit(0);
    }
    console.log('📋 可用会话转录:');
    console.log('');
    all.forEach((a, i) => {
      const date = new Date(a.mtime).toLocaleString('zh-CN');
      console.log(`  [${i + 1}] ${a.project}\\${a.file}`);
      console.log(`       更新: ${date}`);
      console.log(`       路径: ${a.path}`);
    });
    process.exit(0);
  }

  // Find transcript
  let transcriptPath = null;
  const fileIdx = args.indexOf('--file');
  if (fileIdx >= 0 && fileIdx + 1 < args.length) {
    transcriptPath = args[fileIdx + 1];
    if (!fs.existsSync(transcriptPath)) {
      console.error('❌ 文件不存在:', transcriptPath);
      process.exit(1);
    }
  } else {
    transcriptPath = findLatestTranscript();
  }

  if (!transcriptPath) {
    console.error('❌ 未找到 Claude Code 会话转录。');
    console.error('');
    console.error('  确保你已在 Claude Code 中运行过会话。');
    console.error('  转录文件位于: ~/.claude/projects/<project>/<会话>.jsonl');
    console.error('');
    console.error('  或使用 --file 指定路径:');
    console.error('    node ' + __filename.split(ROOT)[1] + ' --file "C:/Users/xxx/.claude/projects/xxx/xxx.jsonl"');
    console.error('');
    console.error('  查看所有可用会话:');
    console.error('    node ' + __filename.split(ROOT)[1] + ' --list');
    process.exit(1);
  }

  console.log('[sync] 读取转录:', transcriptPath);

  const turns = parseTranscript(transcriptPath);
  if (turns.length === 0) {
    console.log('[sync] ⚠️  转录中未找到 AI 响应轮次（无 usage 数据）。');
    console.log('       确认该会话是 Claude Code 实际调用了 API 的会话。');
    process.exit(0);
  }

  const count = writeTurns(turns);
  const model = detectModel(getModelName());

  // Aggregate stats
  const totalInUncached = turns.reduce((s, t) => s + t.tokens.input_uncached, 0);
  const totalInCached = turns.reduce((s, t) => s + t.tokens.input_cached, 0);
  const totalOut = turns.reduce((s, t) => s + t.tokens.output, 0);
  const cacheRate = (totalInUncached + totalInCached) > 0
    ? ((totalInCached / (totalInUncached + totalInCached)) * 100).toFixed(1)
    : '0.0';

  console.log('[sync] ✅ 同步完成!');
  console.log('');
  console.log(`  会话:     ${turns[0].session_id}`);
  console.log(`  模型:     ${model}`);
  console.log(`  轮次:     ${count} 条`);
  console.log(`  输入:     ${(totalInUncached + totalInCached).toLocaleString()} tok (缓存率 ${cacheRate}%)`);
  console.log(`  输出:     ${totalOut.toLocaleString()} tok`);
  console.log('');

  console.log('[sync] 正在生成 HTML 看板...');
  generateDashboard();
  console.log('[sync] ✅ 完成! 双击 scripts/view-perf.bat 查看。');
}

main();
