#!/usr/bin/env node
/**
 * review-rerun-check.cjs — 条件重审触发判断
 *
 * 职责:
 *   读取 kf-code-review-graph 产出的 review JSON，
 *   根据 severity 分布判断是否需要触发重审（上限 3 轮）。
 *
 * 触发规则:
 *   1. P0 数量 > 0 → 触发重审
 *   2. P1 密度 > 3/KLOC (每千行 > 3 个 P1) → 触发重审
 *   3. 已达 3 轮上限 → 不触发，标记 UNRESOLVED
 *   4. 以上都不满足 → 一次通过
 *
 * 用法:
 *   node {IDE_ROOT}/helpers/review-rerun-check.cjs <review-json-path>
 *   node {IDE_ROOT}/helpers/review-rerun-check.cjs <review-json-path> --round <N>
 *   node {IDE_ROOT}/helpers/review-rerun-check.cjs --demo  # 演示模式
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MAX_ROUNDS = 3;
const P1_DENSITY_THRESHOLD = 3; // P1 issues per KLOC

// ─── Parse review JSON ───
function parseReview(filePath) {
  if (!fs.existsSync(filePath)) {
    return { error: `Review JSON not found: ${filePath}` };
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const report = data.review_report || data;
    return { report };
  } catch (e) {
    return { error: `Failed to parse JSON: ${e.message}` };
  }
}

// ─── Calculate P1 density (per KLOC) ───
function calcP1Density(report) {
  const p1Count = (report.issues || [])
    .filter(i => i.severity === 'P1').length;
  const totalLines = report.total_lines || report.line_count_total || 0;
  if (totalLines === 0) return 0;
  return (p1Count / totalLines) * 1000; // per KLOC
}

// ─── Check re-review trigger ───
function checkRerun(report, round) {
  const currentRound = round || 1;
  const issues = report.issues || [];
  const p0Count = issues.filter(i => i.severity === 'P0').length;
  const p1Count = issues.filter(i => i.severity === 'P1').length;
  const p1Density = calcP1Density(report);

  const triggers = [];

  // Rule 1: P0 > 0
  if (p0Count > 0) {
    triggers.push({ rule: 'P0_COUNT_GT_0', detail: `P0 问题 ${p0Count} 个 > 0` });
  }

  // Rule 2: P1 density > 3/KLOC
  if (p1Density > P1_DENSITY_THRESHOLD) {
    triggers.push({ rule: 'P1_DENSITY_GT_3', detail: `P1 密度 ${p1Density.toFixed(1)}/KLOC > ${P1_DENSITY_THRESHOLD}/KLOC` });
  }

  // Rule 3: Max rounds check
  const atMaxRounds = currentRound >= MAX_ROUNDS;

  const shouldRerun = triggers.length > 0 && !atMaxRounds;

  return {
    shouldRerun,
    triggers,
    atMaxRounds,
    currentRound,
    maxRounds: MAX_ROUNDS,
    stats: {
      p0Count,
      p1Count,
      p1Density: parseFloat(p1Density.toFixed(2)),
      totalIssues: issues.length,
      totalLines: report.total_lines || report.line_count_total || 0,
    },
    decision: shouldRerun
      ? `触发第 ${currentRound + 1}/${MAX_ROUNDS} 轮重审`
      : (atMaxRounds && triggers.length > 0
        ? `已达上限 ${MAX_ROUNDS} 轮，标记 UNRESOLVED，不触发重审`
        : '一次通过，无需重审'),
  };
}

// ─── Write escalation log ───
function writeEscalation(report, result) {
  const logPath = path.join(ROOT, '.claude', 'logs', 'escalation.jsonl');
  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const entry = {
    timestamp: new Date().toISOString(),
    type: 'review_rerun_max_rounds',
    review_branch: report.branch || 'unknown',
    stats: result.stats,
    unresolved_issues: (report.issues || [])
      .filter(i => i.severity === 'P0' || i.severity === 'P1')
      .map(i => ({ file: i.file, line: i.line, severity: i.severity, description: i.description })),
  };

  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  return logPath;
}

// ─── Write re-review trigger log ───
function writeTriggerLog(report, result, reviewPath) {
  const logPath = path.join(ROOT, '.claude', 'logs', 'review-rerun.jsonl');
  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const entry = {
    timestamp: new Date().toISOString(),
    review_path: reviewPath,
    should_rerun: result.shouldRerun,
    round: result.currentRound,
    max_rounds: result.maxRounds,
    triggers: result.triggers,
    stats: result.stats,
    decision: result.decision,
  };

  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  return logPath;
}

// ─── CLI ───
function cli() {
  const args = process.argv.slice(2);

  if (args.includes('--demo')) {
    // Demo: simulate a review with issues
    const demoReport = {
      review_report: {
        branch: 'demo-branch',
        total_files: 5,
        total_lines: 500,
        issues: [
          { file: 'src/auth.js', line: 42, severity: 'P0', description: '未验证 token' },
          { file: 'src/api.js', line: 15, severity: 'P1', description: '无错误处理' },
          { file: 'src/api.js', line: 30, severity: 'P1', description: 'N+1 查询' },
          { file: 'src/db.js', line: 8, severity: 'P2', description: '命名不规范' },
        ],
      },
    };

    const result = checkRerun(demoReport.review_report, 1);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (args.length === 0) {
    console.log('review-rerun-check.cjs — 条件重审触发判断');
    console.log('  node {IDE_ROOT}/helpers/review-rerun-check.cjs <review-json-path>');
    console.log('  node {IDE_ROOT}/helpers/review-rerun-check.cjs <review-json-path> --round <N>');
    console.log('  node {IDE_ROOT}/helpers/review-rerun-check.cjs --demo');
    process.exit(0);
  }

  const filePath = args[0];
  const roundIdx = args.indexOf('--round');
  const round = roundIdx !== -1 ? parseInt(args[roundIdx + 1], 10) : 1;

  const parsed = parseReview(filePath);
  if (parsed.error) {
    console.error(`❌ ${parsed.error}`);
    process.exit(1);
  }

  const result = checkRerun(parsed.report, round);
  console.log(JSON.stringify(result, null, 2));

  // Write trigger log
  writeTriggerLog(parsed.report, result, filePath);

  // Write escalation if at max rounds with unresolved issues
  if (result.atMaxRounds && result.triggers.length > 0) {
    const escPath = writeEscalation(parsed.report, result);
    console.log(`\n⚠️  Escalation written: ${escPath}`);
  }

  process.exit(result.shouldRerun ? 2 : 0);
  // Exit code 2 = re-review needed, 0 = pass, 1 = error
}

if (require.main === module) {
  cli();
}

module.exports = { checkRerun, parseReview, calcP1Density, MAX_ROUNDS, P1_DENSITY_THRESHOLD };

