#!/usr/bin/env node
/**
 * ac-adoption.cjs — kf-spec AC 字段采用率统计
 *
 * 从 quality-signals.jsonl 统计 artifact_type=spec_doc 的 AC 字段存在率。
 * 用于 P1.1 feature flag 生命周期闭环。
 *
 * 用法:
 *   node {IDE_ROOT}/helpers/ac-adoption.cjs                        # 全量统计
 *   node {IDE_ROOT}/helpers/ac-adoption.cjs --since "14 days ago"  # 时间范围
 *   node {IDE_ROOT}/helpers/ac-adoption.cjs --json                 # JSON 输出
 *   node {IDE_ROOT}/helpers/ac-adoption.cjs --verbose              # 详细输出
 *
 * 决策标准:
 *   采用率 > 30% → 建议会议讨论是否默认开启
 *   采用率 < 30% → 建议维持 feature flag 状态
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SIGNALS_LOG = path.join(ROOT, '.claude', 'logs', 'quality-signals.jsonl');

// ─── Parse fuzzy date string ───
function parseSince(value) {
  if (!value) return null;

  const now = new Date();
  const match = value.match(/^(\d+)\s*(day|week|month|hour|minute)s?\s*ago$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const ms = num * ({
      minute: 60 * 1000,
      hour: 3600 * 1000,
      day: 86400 * 1000,
      week: 604800 * 1000,
      month: 2592000 * 1000,
    })[unit] || 0;
    return new Date(now - ms);
  }

  // Try parse as ISO date
  const parsed = new Date(value);
  if (!isNaN(parsed)) return parsed;

  return null;
}

// ─── Read spec_doc signals ──
function readSpecSignals(since) {
  if (!fs.existsSync(SIGNALS_LOG)) return [];

  const lines = fs.readFileSync(SIGNALS_LOG, 'utf8').trim().split('\n');
  const signals = [];
  const sinceDate = parseSince(since);

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const qs = entry.quality_signals || entry;
      if (qs.artifact_type !== 'spec_doc') continue;

      if (sinceDate) {
        const ts = new Date(qs.timestamp);
        if (ts < sinceDate) continue;
      }

      signals.push(qs);
    } catch {}
  }

  return signals;
}

// ─── Check if a spec has AC chapter ──
// Since quality-signals doesn't track --ac flag directly, we check:
// 1. If spec file exists and contains "## 验收条件" header
// 2. Fall back to marking "unknown" if file can't be read
function checkACPresence(signals) {
  const results = [];

  for (const s of signals) {
    const changedFiles = s.changed_files || [];
    let hasAC = 'unknown';
    let source = null;

    for (const f of changedFiles) {
      const fullPath = path.join(ROOT, f);
      if (fs.existsSync(fullPath) && f.toLowerCase().includes('spec')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (/##\s*验收条件/i.test(content)) {
          hasAC = 'present';
          source = f;
        } else {
          hasAC = 'absent';
          source = f;
        }
        break;
      }
    }

    results.push({
      execution_id: s.execution_id,
      timestamp: s.timestamp,
      skill_name: s.skill_name,
      has_ac: hasAC,
      source_file: source,
      changed_files: changedFiles,
    });
  }

  return results;
}

// ─── Compute adoption rate ──
function computeAdoption(results) {
  const total = results.length;
  if (total === 0) return { total: 0, rate: 0, verdict: 'insufficient_data' };

  const present = results.filter(r => r.has_ac === 'present').length;
  const absent = results.filter(r => r.has_ac === 'absent').length;
  const unknown = results.filter(r => r.has_ac === 'unknown').length;

  // Rate computed based on known samples only (exclude unknown)
  const known = present + absent;
  const rate = known > 0 ? (present / known) * 100 : 0;

  return {
    total,
    present,
    absent,
    unknown,
    known,
    rate: parseFloat(rate.toFixed(1)),
    verdict: rate > 30 ? 'recommend_default_on' : 'recommend_keep_feature_flag',
  };
}

// ─── Generate recommendation ──
function recommendation(stats) {
  if (stats.total === 0) {
    return '📊 无 spec_doc 数据，无法计算采用率。建议继续收集数据。';
  }
  if (stats.known === 0) {
    return '📊 所有 spec_doc 样本的 AC 状态未知（无法读取源文件）。建议至少 10 个已知样本后评估。';
  }
  if (stats.rate > 30) {
    return `✅ 采用率 ${stats.rate}% > 30%，建议会议讨论是否默认开启 --ac 模式。`;
  }
  return `⚠️ 采用率 ${stats.rate}% < 30%，建议维持 feature flag（--ac）状态，调查低采用原因。`;
}

// ─── CLI ──
function cli() {
  const args = process.argv.slice(2);
  const sinceIdx = args.indexOf('--since');
  const since = sinceIdx !== -1 ? args[sinceIdx + 1] : null;
  const asJson = args.includes('--json');
  const verbose = args.includes('--verbose');

  const signals = readSpecSignals(since);
  const results = checkACPresence(signals);
  const stats = computeAdoption(results);

  if (asJson) {
    console.log(JSON.stringify({
      stats,
      samples: verbose ? results : results.slice(0, 10),
      since: since || 'all time',
      recommendation: recommendation(stats),
    }, null, 2));
    process.exit(0);
  }

  console.log('📊 kf-spec AC 字段采用率统计');
  console.log(`   时间范围: ${since || '全部历史'}`);
  console.log(`   总样本数: ${stats.total}`);
  console.log(`   AC 存在: ${stats.present} | AC 缺失: ${stats.absent} | 未知: ${stats.unknown}`);
  console.log(`   采用率: ${stats.rate}% (基于 ${stats.known} 个已知样本)`);
  console.log(`   结论: ${recommendation(stats)}`);

  if (verbose && results.length > 0) {
    console.log('\n📋 样本明细:');
    for (const r of results) {
      const date = new Date(r.timestamp).toISOString().substring(0, 10);
      const icon = r.has_ac === 'present' ? '✅' : r.has_ac === 'absent' ? '❌' : '❓';
      console.log(`   ${icon} ${date} | ${r.execution_id.substring(0, 8)} | ${r.has_ac} | ${r.source_file || 'N/A'}`);
    }
  }

  process.exit(0);
}

if (require.main === module) {
  cli();
}

module.exports = { readSpecSignals, checkACPresence, computeAdoption, recommendation };

