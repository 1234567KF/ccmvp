#!/usr/bin/env node
/**
 * spec-reviewer.cjs — Spec Review AI 自动审查系统
 *
 * 实现 Phase 1.x Spec Reviewer: 自动审查 spec.md 质量，
 * 生成质量评分卡，支持 3 轮修复循环。
 *
 * 用法:
 *   node {IDE_ROOT}/helpers/spec-reviewer.cjs review <spec-path> [--round N] [--output <path>]
 *   node {IDE_ROOT}/helpers/spec-reviewer.cjs check <spec-path>      # Quick check: 70% pass?
 *   node {IDE_ROOT}/helpers/spec-reviewer.cjs score <spec-path>      # Score only
 *   node {IDE_ROOT}/helpers/spec-reviewer.cjs diff <v1-path> <v2-path>  # Spec diff
 *
 * 评分维度:
 *   - AC 可测性 (25%): 验收条件是否可验证
 *   - 边界覆盖 (20%): 边界情况和异常路径
 *   - 依赖完整 (15%): 外部依赖和前置条件
 *   - 结构清晰 (15%): 内容组织和可读性
 *   - 功能完整 (25%): 功能列表是否完整
 *
 * API:
 *   const sr = require('./spec-reviewer.cjs');
 *   sr.review({ specPath, round }) → { score, passed, issues, report }
 *   sr.quickCheck({ specPath }) → { passed, score, issues }
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PASS_THRESHOLD = 70;
const MAX_ROUNDS = 3;
const VALID_SEVERITIES = ['P0', 'P1', 'P2', 'P3'];

// ─── Scoring dimensions ───
const DIMENSIONS = [
  { key: 'ac_testability', label: 'AC 可测性', weight: 0.25, desc: '验收条件是否可验证、无歧义' },
  { key: 'boundary_coverage', label: '边界覆盖', weight: 0.20, desc: '边界情况和异常路径覆盖' },
  { key: 'dependency_completeness', label: '依赖完整', weight: 0.15, desc: '外部依赖和前置条件' },
  { key: 'structure_clarity', label: '结构清晰', weight: 0.15, desc: '内容组织和可读性' },
  { key: 'feature_completeness', label: '功能完整', weight: 0.25, desc: '功能列表是否完整' },
];

// ─── Analyze spec content ───
function analyzeSpec(content) {
  const issues = [];
  const lines = content.split('\n');

  // Detect sections
  const hasFeatures = /##\s*(功能|feature|requirement)/i.test(content);
  const hasAC = /##\s*(验收|acceptance|ac|criteria)/i.test(content);
  const hasBoundary = /##\s*(边界|edge|boundary|异常|error|边界情况)/i.test(content);
  const hasDeps = /##\s*(依赖|depend|prerequisite|前置)/i.test(content);
  const hasTestStrategy = /##\s*(测试|test strategy|测试策略)/i.test(content);
  const hasConstraints = /##\s*(约束|constraint|限制|limit)/i.test(content);

  // Line count checks
  const lineCount = lines.length;
  const sectionCount = content.split(/^##\s/m).length - 1;

  // AC analysis
  const acLines = [];
  let inACSection = false;
  for (const line of lines) {
    if (/^##\s*(验收|acceptance|ac|criteria)/i.test(line)) inACSection = true;
    else if (/^##\s/.test(line) && inACSection) inACSection = false;
    if (inACSection && /^- /.test(line.trim())) acLines.push(line.trim());
  }

  const hasGivenWhenThen = /Given|When|Then|GIVEN|WHEN|THEN/i.test(content);

  // Score each dimension
  let acTestability = 5;
  let boundaryCoverage = 5;
  let depCompleteness = 5;
  let structureClarity = 5;
  let featureCompleteness = 5;

  // AC Testability scoring
  if (hasAC) acTestability += 2;
  if (acLines.length >= 3) acTestability += 2;
  if (hasGivenWhenThen) acTestability += 2;
  if (hasAC && lineCount > 30) acTestability += 1;
  else if (!hasAC) { issues.push({ severity: 'P1', dim: 'ac_testability', desc: '缺少验收条件(Acceptance Criteria)章节', suggestion: '添加 ## Acceptance Criteria 章节，包含具体可验证的验收条件' }); }

  // Boundary coverage
  if (hasBoundary) boundaryCoverage += 3;
  if (/空|空数据|null|undefined|empty/i.test(content)) boundaryCoverage += 1;
  if (/超长|特殊字符|invalid|异常|error/i.test(content)) boundaryCoverage += 1;
  if (/并发|race|竞争|conflict/i.test(content)) boundaryCoverage += 1;
  if (boundaryCoverage < 7) { issues.push({ severity: 'P1', dim: 'boundary_coverage', desc: '边界情况和异常路径覆盖不足', suggestion: '添加 ## 边界情况 章节，覆盖空数据、超长、特殊字符、并发等场景' }); }

  // Dependency completeness
  if (hasDeps) depCompleteness += 3;
  if (hasConstraints) depCompleteness += 2;
  if (/API|接口|service|外部|third.?party/i.test(content)) depCompleteness += 1;
  if (depCompleteness < 7) { issues.push({ severity: 'P2', dim: 'dependency_completeness', desc: '依赖和前置条件不够明确', suggestion: '添加 ## 依赖 章节，列出所有外部依赖和前置条件' }); }

  // Structure clarity
  if (sectionCount >= 5) structureClarity += 2;
  else if (sectionCount < 3) { issues.push({ severity: 'P2', dim: 'structure_clarity', desc: `章节数过少(${sectionCount})，缺少必要的功能描述`, suggestion: '确保包含 功能列表/验收条件/边界情况/依赖 等核心章节' }); }
  if (lineCount > 50) structureClarity += 1;
  if (hasTestStrategy) structureClarity += 1;
  if (/^\s*[-*]\s*\[.?\]/.test(content)) structureClarity += 1; // Has checkboxes
  if (/表格|table|matrix/i.test(lines.slice(0, 60).join('\n'))) structureClarity += 1;

  // Feature completeness
  if (hasFeatures) featureCompleteness += 2;
  if (hasAC) featureCompleteness += 1;
  if (hasBoundary) featureCompleteness += 1;
  if (content.split(/^- /m).length > 5) featureCompleteness += 1;
  if (/MVP|里程碑|phase|v1|v2|迭代/i.test(content)) featureCompleteness += 1;

  // Clamp to 1-10
  const clamp = v => Math.min(10, Math.max(1, v));
  acTestability = clamp(acTestability);
  boundaryCoverage = clamp(boundaryCoverage);
  depCompleteness = clamp(depCompleteness);
  structureClarity = clamp(structureClarity);
  featureCompleteness = clamp(featureCompleteness);

  const dimScores = {
    ac_testability: acTestability,
    boundary_coverage: boundaryCoverage,
    dependency_completeness: depCompleteness,
    structure_clarity: structureClarity,
    feature_completeness: featureCompleteness,
  };

  // Feature list detection
  const featureItems = [];
  let inFeatureSection = false;
  for (const line of lines) {
    if (/^##\s*(功能|feature|requirement)/i.test(line)) inFeatureSection = true;
    else if (/^##\s/.test(line) && inFeatureSection) inFeatureSection = false;
    if (inFeatureSection && /^- /.test(line.trim())) featureItems.push(line.trim().replace(/^- /, ''));
  }

  const hasUnclearItems = featureItems.some(f => f.includes('待定') || f.includes('TODO') || f.includes('?'));

  // P0 checks
  if (!hasFeatures && !hasAC) {
    issues.push({ severity: 'P0', dim: 'feature_completeness', desc: '缺少功能列表和验收条件，Spec 不完整', suggestion: '添加功能列表章节，列出所有功能点并关联验收条件' });
  }
  if (hasUnclearItems) {
    issues.push({ severity: 'P0', dim: 'feature_completeness', desc: '功能列表包含待定项(TODO/待定/?)，需要明确', suggestion: '替换所有待定项为具体功能描述' });
  }
  if (lineCount < 20) {
    issues.push({ severity: 'P0', dim: 'structure_clarity', desc: `Spec 过短(${lineCount}行)，不足以完整描述功能需求`, suggestion: '扩充 Spec 内容，使其覆盖各核心维度' });
  }

  return { dimScores, issues, featureItems, sectionCount, lineCount, stats: { hasFeatures, hasAC, hasBoundary, hasDeps, hasTestStrategy, hasConstraints, hasGivenWhenThen, acLineCount: acLines.length } };
}

// ─── Calculate weighted score ───
function calcScore(dimScores) {
  let total = 0;
  for (const dim of DIMENSIONS) {
    const score = dimScores[dim.key] || 5;
    total += score * dim.weight * 10; // Scale to 0-100
  }
  return Math.round(total);
}

// ─── Review spec ───
function review({ specPath, round, outputPath } = {}) {
  if (!specPath || !fs.existsSync(specPath)) {
    return { ok: false, error: `Spec file not found: ${specPath}` };
  }

  const content = fs.readFileSync(specPath, 'utf8');
  const currentRound = round || 1;

  const analysis = analyzeSpec(content);
  const score = calcScore(analysis.dimScores);
  const p0Count = analysis.issues.filter(i => i.severity === 'P0').length;
  const p1Count = analysis.issues.filter(i => i.severity === 'P1').length;
  const passed = score >= PASS_THRESHOLD && p0Count === 0;
  const atMaxRounds = currentRound >= MAX_ROUNDS;
  const shouldRerun = !passed && !atMaxRounds;

  // Dimension scores table
  const dimRows = DIMENSIONS.map(d => {
    const s = analysis.dimScores[d.key];
    return `| ${d.label} | ${s}/10 | ${(s * d.weight * 10).toFixed(1)} | ${d.desc} |`;
  }).join('\n');

  // Issues table
  const issueRows = analysis.issues.length > 0
    ? analysis.issues.map((iss, i) => `| ${i + 1} | ${iss.dim} | ${iss.severity} | ${iss.desc} | ${iss.suggestion} |`).join('\n')
    : '| — | — | — | 无问题 | — |';

  const report = `## Spec 质量审查报告

### 基本信息
- **Spec 文件**: ${specPath}
- **审查轮次**: ${currentRound}/${MAX_ROUNDS}
- **行数**: ${analysis.lineCount}
- **章节数**: ${analysis.sectionCount}

### 评分
| 维度 | 得分 | 加权分 | 说明 |
|------|------|--------|------|
${dimRows}

| **总分** | **${score}/100** | | **阈值: ${PASS_THRESHOLD}/100** |

### 判定
- **达标**: ${passed ? '✅ 是' : '❌ 否'}
- **P0 缺陷**: ${p0Count} 个 ${p0Count > 0 ? '🔴' : '✅'}
- **P1 建议**: ${p1Count} 个

### Issue 清单
| # | 维度 | 严重度 | 问题 | 建议 |
|---|------|--------|------|------|
${issueRows}

### 分析统计
- 功能列表: ${analysis.stats.hasFeatures ? '✅' : '❌'} ${analysis.featureItems.length} 项
- 验收条件: ${analysis.stats.hasAC ? '✅' : '❌'} ${analysis.stats.acLineCount} 条
- 边界情况: ${analysis.stats.hasBoundary ? '✅' : '❌'}
- 依赖声明: ${analysis.stats.hasDeps ? '✅' : '❌'}
- 测试策略: ${analysis.stats.hasTestStrategy ? '✅' : '❌'}
- 约束定义: ${analysis.stats.hasConstraints ? '✅' : '❌'}
- GWT 格式: ${analysis.stats.hasGivenWhenThen ? '✅' : '❌'}

### ${shouldRerun ? `🔄 需要第 ${currentRound + 1} 轮修复` : atMaxRounds && !passed ? '⚠️ 已达上限，标记 UNRESOLVED' : passed ? '✅ 通过' : ''}
`;

  // Write report
  if (outputPath) {
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, report, 'utf8');
  }

  return {
    ok: true,
    score,
    passed,
    p0_count: p0Count,
    p1_count: p1Count,
    should_rerun: shouldRerun,
    at_max_rounds: atMaxRounds,
    current_round: currentRound,
    max_rounds: MAX_ROUNDS,
    issue_count: analysis.issues.length,
    feature_count: analysis.featureItems.length,
    section_count: analysis.sectionCount,
    line_count: analysis.lineCount,
    issues: analysis.issues,
    dim_scores: analysis.dimScores,
    stats: analysis.stats,
    report,
  };
}

// ─── Quick check: pass/fail ───
function quickCheck({ specPath } = {}) {
  const result = review({ specPath });
  return {
    passed: result.passed,
    score: result.score,
    p0_count: result.p0_count,
    issues: result.issues,
  };
}

// ─── Score only ───
function scoreOnly({ specPath } = {}) {
  const result = review({ specPath });
  return { score: result.score, dim_scores: result.dim_scores, passed: result.passed };
}

// ─── Spec diff ───
function specDiff(v1Path, v2Path) {
  if (!fs.existsSync(v1Path)) return { ok: false, error: `v1 not found: ${v1Path}` };
  if (!fs.existsSync(v2Path)) return { ok: false, error: `v2 not found: ${v2Path}` };

  const v1 = review({ specPath: v1Path });
  const v2 = review({ specPath: v2Path });

  const scoreDiff = v2.score - v1.score;
  return {
    ok: true,
    v1: { score: v1.score, p0: v1.p0_count, p1: v1.p1_count },
    v2: { score: v2.score, p0: v2.p0_count, p1: v2.p1_count },
    score_change: scoreDiff >= 0 ? `+${scoreDiff}` : `${scoreDiff}`,
    passed: v2.passed,
    improvement: scoreDiff > 0 || v2.p0_count < v1.p0_count,
  };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── CLI ───
function cli() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('spec-reviewer.cjs — Spec Review AI 自动审查系统');
    console.log('  review <path> [--round N] [--output <path>]  审查 Spec');
    console.log('  check <path>                                  快速检查');
    console.log('  score <path>                                  仅评分');
    console.log('  diff <v1> <v2>                                Spec 对比');
    process.exit(0);
  }

  const cmd = args[0];
  const rest = args.slice(1);

  function getopt(name, fallback) {
    const idx = rest.indexOf(name);
    return idx !== -1 && rest[idx + 1] ? rest[idx + 1] : fallback;
  }

  try {
    switch (cmd) {
      case 'review':
      case 'r': {
        const specPath = rest[0];
        if (!specPath) { console.error('Usage: spec-reviewer.cjs review <spec-path> [--round N] [--output <path>]'); process.exit(1); }
        const result = review({
          specPath,
          round: parseInt(getopt('--round', '1')),
          outputPath: getopt('--output'),
        });
        if (getopt('--output')) console.log(JSON.stringify({ ok: result.ok, score: result.score, passed: result.passed, report_written: result.report }, null, 2));
        else console.log(result.report);
        process.exit(result.passed ? 0 : 2);
      }

      case 'check':
      case 'c': {
        const specPath = rest[0];
        if (!specPath) { console.error('Usage: spec-reviewer.cjs check <spec-path>'); process.exit(1); }
        const result = quickCheck({ specPath });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.passed ? 0 : 2);
      }

      case 'score':
      case 's': {
        const specPath = rest[0];
        if (!specPath) { console.error('Usage: spec-reviewer.cjs score <spec-path>'); process.exit(1); }
        const result = scoreOnly({ specPath });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.passed ? 0 : 2);
      }

      case 'diff':
      case 'd': {
        const v1 = rest[0];
        const v2 = rest[1];
        if (!v1 || !v2) { console.error('Usage: spec-reviewer.cjs diff <v1-path> <v2-path>'); process.exit(1); }
        const result = specDiff(v1, v2);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.passed ? 0 : 2);
      }

      default: {
        console.error(`Unknown command: ${cmd}`);
        console.error('Run without arguments to see usage.');
        process.exit(1);
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message, stack: e.stack }, null, 2));
    process.exit(1);
  }
}

if (require.main === module) {
  cli();
}

module.exports = { review, quickCheck, scoreOnly, specDiff, DIMENSIONS, PASS_THRESHOLD, MAX_ROUNDS };

