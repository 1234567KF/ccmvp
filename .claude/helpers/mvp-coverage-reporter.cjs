/**
 * MVP Coverage Reporter — 覆盖率门控脚本（MVP 简化版）
 *
 * 采集 vitest --coverage 输出的覆盖率数据，按阈值门控。
 *
 * 用法：
 *   node {IDE_ROOT}/helpers/mvp-coverage-reporter.cjs gate [--min-branches 70] [--min-lines 80]
 *   node {IDE_ROOT}/helpers/mvp-coverage-reporter.cjs collect
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CWD = process.env.CLAUDE_PROJECT_DIR || process.env.QODER_PROJECT_DIR || process.cwd();

const DEFAULT_THRESHOLDS = {
  minBranches: 70,
  minLines: 80,
  minFunctions: 65
};

// ─── 参数解析 ──────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { command: args[0] || 'gate' };
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--min-branches': opts.minBranches = parseInt(args[++i]) || 70; break;
      case '--min-lines': opts.minLines = parseInt(args[++i]) || 80; break;
      case '--min-functions': opts.minFunctions = parseInt(args[++i]) || 65; break;
      case '--help':
        console.log('Usage: mvp-coverage-reporter.cjs <collect|gate> [options]');
        process.exit(0);
    }
  }
  return opts;
}

// ─── 采集覆盖率数据 ──────────────────────────────────────────────────────
function collectCoverage() {
  console.log(`\n=== 采集覆盖率数据 ===\n`);

  try {
    console.log('  运行 vitest --coverage...');
    execSync('npx vitest run --coverage --reporter=json 2>/dev/null', {
      cwd: CWD,
      timeout: 180000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log('  [v] vitest --coverage 运行完成');
  } catch (e) {
    const out = e.stdout || '';
    if (out) console.log('  [v] vitest --coverage 运行完成（exit code 非零但输出存在）');
    else console.log('  [w] vitest --coverage 未完成，尝试查找已有覆盖率数据');
  }

  // 尝试读取覆盖率摘要
  const coverageDir = path.resolve(CWD, 'coverage');
  const summaryFile = path.join(coverageDir, 'coverage-summary.json');

  if (fs.existsSync(summaryFile)) {
    const data = JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));
    console.log(`\n  覆盖率摘要已保存: ${summaryFile}`);
    return data;
  }

  // 尝试 v8 格式
  const v8File = path.join(coverageDir, 'coverage-final.json');
  if (fs.existsSync(v8File)) {
    console.log(`\n  覆盖率数据已保存: ${v8File}（v8 格式）`);
    return null;
  }

  console.log('  [w] 未找到覆盖率数据文件，需手动检查');
  return null;
}

// ─── 覆盖率门控 ──────────────────────────────────────────────────────────
function gateCoverage(thresholds) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  console.log(`\n=== 覆盖率门控 ===\n`);
  console.log(`  阈值: branches >= ${t.minBranches}%, lines >= ${t.minLines}%, functions >= ${t.minFunctions}%\n`);

  const coverageDir = path.resolve(CWD, 'coverage');
  const summaryFile = path.join(coverageDir, 'coverage-summary.json');

  if (!fs.existsSync(summaryFile)) {
    // 自动运行采集
    collectCoverage();
  }

  if (!fs.existsSync(summaryFile)) {
    console.log('  [x] 无覆盖率摘要文件。先运行 `npx vitest run --coverage`');
    return { pass: false, reason: '无覆盖率数据' };
  }

  const data = JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));
  const total = data.total || data;
  const branches = total.branches?.pct || 0;
  const lines = total.lines?.pct || 0;
  const funcs = total.functions?.pct || 0;
  const statements = total.statements?.pct || 0;

  console.log(`  覆盖率统计:`);
  console.log(`    Statements: ${statements.toFixed(1)}%`);
  console.log(`    Branches:   ${branches.toFixed(1)}% (阈值: ${t.minBranches}%)`);
  console.log(`    Functions:  ${funcs.toFixed(1)}% (阈值: ${t.minFunctions}%)`);
  console.log(`    Lines:      ${lines.toFixed(1)}% (阈值: ${t.minLines}%)`);

  const pass = branches >= t.minBranches && lines >= t.minLines && funcs >= t.minFunctions;

  console.log(`\n  门控结果: ${pass ? '[v] 通过' : '[x] 未通过'}`);

  if (!pass) {
    const fails = [];
    if (branches < t.minBranches) fails.push(`branches ${branches.toFixed(1)}% < ${t.minBranches}%`);
    if (lines < t.minLines) fails.push(`lines ${lines.toFixed(1)}% < ${t.minLines}%`);
    if (funcs < t.minFunctions) fails.push(`functions ${funcs.toFixed(1)}% < ${t.minFunctions}%`);
    return { pass: false, reason: fails.join(', ') };
  }

  return { pass: true };
}

// ─── 主入口 ──────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs();

  switch (opts.command) {
    case 'collect':
      collectCoverage();
      break;
    case 'gate':
    default: {
      const result = gateCoverage({
        minBranches: opts.minBranches,
        minLines: opts.minLines,
        minFunctions: opts.minFunctions
      });
      process.exit(result.pass ? 0 : 1);
    }
  }
}

main();
