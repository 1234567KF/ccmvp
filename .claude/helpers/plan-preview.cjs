#!/usr/bin/env node
/**
 * plan-preview.cjs — 浅层 Plan 注入引擎
 *
 * 从 quality_signals 数据聚合生成 10-15 行结构化任务拆解预览，
 * 注入到 agent prompt 的共享前缀之后、角色定义之前。
 *
 * 消费端: P0.3 浅层 Plan 注入 / P1.3 聚合 Plan
 *
 * 用法:
 *   node {IDE_ROOT}/helpers/plan-preview.cjs                     # 扫描全部信号生成 Plan
 *   node {IDE_ROOT}/helpers/plan-preview.cjs --team red          # 按队伍过滤
 *   node {IDE_ROOT}/helpers/plan-preview.cjs --skill kf-spec     # 按技能过滤
 *   node {IDE_ROOT}/helpers/plan-preview.cjs --json              # JSON 输出
 *   node {IDE_ROOT}/helpers/plan-preview.cjs --inject            # 输出可直接注入 prompt 的 markdown
 *
 * API:
 *   const pp = require('./plan-preview.cjs');
 *   pp.generate({ team, skill }) → { preview, meta }
 *   pp.injectMarkdown(team) → string  # ready for agent prompt
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SIGNALS_DIR = path.join(ROOT, '.claude-flow', 'quality-signals');
const SIGNALS_LOG = path.join(ROOT, '.claude', 'logs', 'quality-signals.jsonl');

// ─── Risk estimation by file type ───
const HIGH_RISK_PATTERNS = [
  /auth/i, /security/i, /login/i, /token/i, /password/i,
  /db/i, /database/i, /migration/i, /schema/i,
  /payment/i, /billing/i, /transaction/i,
  /config/i, /deploy/i, /docker/i, /env/i,
];

const RISK_WEIGHT_BY_ARTIFACT = {
  review_report: 2.0,    // already reviewed → lower risk
  spec_doc: 1.0,          // spec is neutral
  alignment_record: 0.5,  // alignment is discussion
  test_report: 1.5,
  stage_artifact: 1.0,
  code_files: 2.5,
  extraction_report: 1.0,
};

// ─── Estimate risk for a changed file ───
function estimateRisk(file) {
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(file)) return '高';
  }
  return '低';
}

// ─── Estimate total lines from signals ───
function estimateLines(signals) {
  let total = 0;
  for (const s of signals) {
    const qs = s.quality_signals || s;
    total += qs.line_count_total || 0;
  }
  return total;
}

// ─── Estimate execution time from lines ───
function estimateTime(totalLines) {
  if (totalLines > 500) return '~8 分钟';
  if (totalLines > 200) return '~5 分钟';
  if (totalLines > 50) return '~3 分钟';
  return '~2 分钟';
}

// ─── Determine quality mode ───
function qualityMode(signals) {
  const p0Count = signals.reduce((sum, s) => {
    const qs = s.quality_signals || s;
    return sum + (qs.severity?.P0 || 0);
  }, 0);
  return p0Count > 0 ? 'strict（P0 强制闭环）' : 'balanced（标准审查）';
}

// ─── Read all signals ───
function readAllSignals() {
  const signals = [];
  if (fs.existsSync(SIGNALS_LOG)) {
    const lines = fs.readFileSync(SIGNALS_LOG, 'utf8').trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try { signals.push(JSON.parse(line)); } catch {}
    }
  }
  if (fs.existsSync(SIGNALS_DIR)) {
    const files = fs.readdirSync(SIGNALS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SIGNALS_DIR, f), 'utf8'));
        // Avoid duplicates with log
        const existing = signals.find(s => {
          const qsA = s.quality_signals || {};
          const qsB = data.quality_signals || {};
          return qsA.execution_id === qsB.execution_id;
        });
        if (!existing) signals.push(data);
      } catch {}
    }
  }
  return signals.sort((a, b) => {
    const tsA = (a.quality_signals || a).timestamp || '';
    const tsB = (b.quality_signals || b).timestamp || '';
    return new Date(tsB) - new Date(tsA);
  });
}

// ─── Filter signals ───
function filterSignals(signals, { team, skill } = {}) {
  let filtered = signals;
  if (team) {
    filtered = filtered.filter(s => {
      const qs = s.quality_signals || s;
      const name = (qs.skill_name || '').toLowerCase();
      // Team matching: check if skill_name or changed_files reference team
      return name.includes(team.toLowerCase()) ||
        (qs.changed_files || []).some(f => f.toLowerCase().includes(team.toLowerCase()));
    });
  }
  if (skill) {
    filtered = filtered.filter(s => {
      const qs = s.quality_signals || s;
      return (qs.skill_name || '').toLowerCase().includes(skill.replace('kf-', '').toLowerCase());
    });
  }
  return filtered;
}

// ─── Deduplicate changed files ───
function deduplicateFiles(signals) {
  const fileMap = {};
  for (const s of signals) {
    const qs = s.quality_signals || s;
    for (const f of (qs.changed_files || [])) {
      if (!fileMap[f]) {
        fileMap[f] = { file: f, risk: estimateRisk(f), sourceCount: 0, sources: [] };
      }
      fileMap[f].sourceCount++;
      if (!fileMap[f].sources.includes(qs.skill_name)) {
        fileMap[f].sources.push(qs.skill_name);
      }
    }
  }
  return Object.values(fileMap).sort((a, b) => {
    // Sort: high risk first, then by source count
    if (a.risk !== b.risk) return a.risk === '高' ? -1 : 1;
    return b.sourceCount - a.sourceCount;
  });
}

// ─── Group by module ───
function groupByModule(files) {
  const modules = {};
  for (const f of files) {
    // Extract module from path: src/auth/login.ts → auth, api/user.ts → api
    const parts = f.file.replace(/\\/g, '/').split('/');
    let module = 'other';
    if (parts.includes('src') && parts.length > parts.indexOf('src') + 2) {
      module = parts[parts.indexOf('src') + 1];
    } else if (parts.includes('docs')) {
      module = 'docs';
    } else if (parts.length >= 2) {
      module = parts[0];
    }
    for (const part of parts) {
      if (part.includes('auth') || part.includes('login') || part.includes('token')) module = 'auth';
      if (part.includes('api') || part.includes('route') || part.includes('handler')) module = 'api';
      if (part.includes('db') || part.includes('model') || part.includes('schema') || part.includes('migration')) module = 'db';
      if (part.includes('component') || part.includes('page') || part.includes('view') || part.includes('ui')) module = 'ui';
      if (part.includes('test') || part.includes('spec')) module = 'test';
    }

    if (!modules[module]) modules[module] = [];
    modules[module].push(f);
  }
  return modules;
}

// ─── Determine action per file ───
function detectAction(file, totalFiles) {
  const basename = path.basename(file);
  // Heuristic: if file matches signals sources, it was changed
  if (basename.startsWith('new_') || basename.includes('.new.')) return '新增';
  // Check if file exists on disk
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) return '新增';
  return '修改';
}

// ─── Generate preview ───
function generate({ team, skill, maxEntries } = {}) {
  const allSignals = readAllSignals();
  const signals = filterSignals(allSignals, { team, skill });
  const files = deduplicateFiles(signals);
  const modules = groupByModule(files);

  if (files.length === 0) {
    return {
      preview: null,
      meta: { totalFiles: 0, totalSignals: allSignals.length, filteredSignals: 0 },
    };
  }

  const totalLines = estimateLines(signals);
  const estimatedTime = estimateTime(totalLines);
  const qualityModeStr = qualityMode(signals);
  const entries = files.slice(0, maxEntries || 15);

  // Build the preview markdown table
  const tableRows = [];
  let idx = 1;
  for (const [module, moduleFiles] of Object.entries(modules)) {
    const limited = moduleFiles.slice(0, 3); // Max 3 per module
    for (const f of limited) {
      const action = detectAction(f.file, files.length);
      const sources = f.sources.slice(0, 2).join(', ');
      const riskIcon = f.risk === '高' ? '🔴' : '🟢';
      tableRows.push(`| ${idx} | ${module} | ${action} | ${f.file} | ${riskIcon} ${f.risk} |`);
      idx++;
      if (idx > (maxEntries || 15)) break;
    }
    if (idx > (maxEntries || 15)) break;
  }

  const preview = `## 任务拆解预览

| # | 模块 | 动作 | 文件 | 风险 |
|---|------|------|------|------|
${tableRows.join('\n')}

**预估总影响**: ${files.length} 文件, ~${totalLines} 行代码
**预估执行时间**: ${estimatedTime}
**质量模式**: ${qualityModeStr}

${team ? `**队伍**: ${team === 'red' ? '红队(激进创新)' : team === 'blue' ? '蓝队(稳健工程)' : team === 'green' ? '绿队(安全保守)' : team}` : ''}

如有修改意见请回复，30s 后自动继续执行...
`;

  return {
    preview,
    meta: {
      totalFiles: files.length,
      totalLines,
      estimatedTime,
      qualityMode: qualityModeStr,
      totalSignals: allSignals.length,
      filteredSignals: signals.length,
      modules: Object.keys(modules).length,
      team,
      skill,
    },
  };
}

// ─── Generate injection-ready markdown ───
function injectMarkdown(team) {
  const result = generate({ team });
  if (!result.preview) return '<!-- No quality signals available for plan preview -->';
  return result.preview;
}

// ─── CLI ───
function cli() {
  const args = process.argv.slice(2);

  const teamIdx = args.indexOf('--team');
  const team = teamIdx !== -1 ? args[teamIdx + 1] : null;

  const skillIdx = args.indexOf('--skill');
  const skill = skillIdx !== -1 ? args[skillIdx + 1] : null;

  const asJson = args.includes('--json');

  const result = generate({ team, skill });

  if (args.includes('--inject')) {
    if (result.preview) console.log(result.preview);
    else console.log('<!-- No quality signals available — plan preview skipped -->');
    process.exit(0);
  }

  if (asJson) {
    console.log(JSON.stringify({
      preview: result.preview,
      meta: result.meta,
    }, null, 2));
    process.exit(0);
  }

  // Default: show meta + preview
  console.log(`📊 浅层 Plan 预览 (${result.meta.filteredSignals} 信号 → ${result.meta.totalFiles} 文件)`);
  console.log(`   模块: ${result.meta.modules} 个 | 预估行数: ~${result.meta.totalLines} | 预估时间: ${result.meta.estimatedTime}`);
  if (result.preview) {
    console.log('');
    console.log(result.preview);
  } else {
    console.log('\n⚠️ 无 quality_signals 数据，跳过 Plan 注入（EC3: 5s 超时跳过）');
    process.exit(2);
  }

  // Check for 30s interrupt window
  console.log('\n⏱️ 30s 内回复"改"或"停"可打断，超时自动继续...');
}

if (require.main === module) {
  cli();
}

module.exports = { generate, injectMarkdown, readAllSignals, filterSignals, deduplicateFiles, groupByModule };

