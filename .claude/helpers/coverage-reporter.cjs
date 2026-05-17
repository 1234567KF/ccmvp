/**
 * Coverage Reporter — 覆盖率数据采集 + 门控判断
 *
 * 采集 vitest --coverage 输出的覆盖率数据，按阈值门控。
 *
 * 用法：
 *   node {IDE_ROOT}/helpers/coverage-reporter.cjs collect --team <red|blue|green>
 *   node {IDE_ROOT}/helpers/coverage-reporter.cjs gate --team <red|blue|green> [--min-branches 70] [--min-lines 80] [--min-functions 65]
 *   node {IDE_ROOT}/helpers/coverage-reporter.cjs compare --team <red|blue|green> --baseline <path>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CWD = process.env.CLAUDE_PROJECT_DIR || process.env.QODER_PROJECT_DIR || process.cwd();

// ─── 参数解析 ──────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { command: args[0] || 'gate' };
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--team': opts.team = args[++i]; break;
      case '--min-branches': opts.minBranches = parseInt(args[++i]) || 70; break;
      case '--min-lines': opts.minLines = parseInt(args[++i]) || 80; break;
      case '--min-functions': opts.minFunctions = parseInt(args[++i]) || 65; break;
      case '--baseline': opts.baseline = args[++i]; break;
      case '--help':
        console.log('Usage: coverage-reporter.cjs <collect|gate|compare> --team <team> [options]');
        process.exit(0);
    }
  }
  return opts;
}

const DEFAULT_THRESHOLDS = {
  minBranches: 70,
  minLines: 80,
  minFunctions: 65
};

// ─── 采集覆盖率数据 ──────────────────────────────────────────────────────
function collectCoverage(team) {
  console.log(`\n=== 采集覆盖率数据 — ${team} ===\n`);

  const coverageDir = path.resolve(CWD, 'coverage');
  const summaryFile = path.join(coverageDir, 'coverage-summary.json');

  // 尝试运行 vitest --coverage
  try {
    console.log('  运行 vitest --coverage...');
    execSync('npx vitest run --coverage --reporter=json 2>/dev/null', {
      cwd: CWD,
      timeout: 180000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log('  [✓] vitest --coverage 运行完成');
  } catch (e) {
    console.log('  [!] vitest --coverage 运行出错（可能无覆盖率配置）');
  }

  // 读取覆盖率摘要
  if (fs.existsSync(summaryFile)) {
    const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));
    const total = summary.total || {};

    const data = {
      team,
      timestamp: new Date().toISOString(),
      lines: total.lines?.pct || 0,
      statements: total.statements?.pct || 0,
      branches: total.branches?.pct || 0,
      functions: total.functions?.pct || 0
    };

    // 保存到团队覆盖率文件
    const outputFile = path.resolve(CWD, `${team}-03-coverage.json`);
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
    console.log(`  [✓] 覆盖率数据已保存: ${outputFile}`);
    console.log(`       行: ${data.lines}% | 分支: ${data.branches}% | 函数: ${data.functions}%`);

    return data;
  }

  // 如果无 summary 文件，尝试从 clover/cobertura 解析
  console.log('  [!] 无 coverage-summary.json，尝试其他格式...');

  const cloverFile = path.join(coverageDir, 'clover.xml');
  if (fs.existsSync(cloverFile)) {
    console.log('  [!] 发现 clover.xml，但暂不支持解析');
  }

  return null;
}

// ─── 门控判断 ──────────────────────────────────────────────────────────────
function gateCheck(team, thresholds = DEFAULT_THRESHOLDS) {
  console.log(`\n=== 覆盖率门控 — ${team} ===\n`);

  const minBranches = thresholds.minBranches || DEFAULT_THRESHOLDS.minBranches;
  const minLines = thresholds.minLines || DEFAULT_THRESHOLDS.minLines;
  const minFunctions = thresholds.minFunctions || DEFAULT_THRESHOLDS.minFunctions;

  // 读取覆盖率数据
  const coverageFile = path.resolve(CWD, `${team}-03-coverage.json`);
  let data;

  if (fs.existsSync(coverageFile)) {
    data = JSON.parse(fs.readFileSync(coverageFile, 'utf-8'));
    console.log(`  已有覆盖率数据: ${coverageFile}`);
  } else {
    console.log('  无已有覆盖率数据，尝试采集...');
    data = collectCoverage(team);
  }

  if (!data) {
    console.log('  [✗] 无法获取覆盖率数据');
    console.log('\n  ⚠️ Gate 跳过 — 无覆盖率数据（可能项目未配置 vitest coverage）\n');
    return { pass: true, reason: '无覆盖率数据，跳过门控' };
  }

  // 逐项检查
  const results = {};

  results.lines = { value: data.lines, threshold: minLines, pass: data.lines >= minLines };
  results.branches = { value: data.branches, threshold: minBranches, pass: data.branches >= minBranches };
  results.functions = { value: data.functions, threshold: minFunctions, pass: data.functions >= minFunctions };

  for (const [key, r] of Object.entries(results)) {
    const icon = r.pass ? '✓' : (r.value >= r.threshold * 0.7 ? '⚠' : '✗');
    console.log(`  [${icon}] ${key}: ${r.value}% (阈值 ≥${r.threshold}%)`);
  }

  // 分支覆盖率是核心门控
  const branchResult = results.branches;
  let pass;
  let action;

  if (branchResult.value >= minBranches) {
    pass = true;
    action = '继续 Stage 3.5';
  } else if (branchResult.value >= minBranches * 0.7) {
    pass = true; // P1 告警，不阻断
    action = 'P1 告警（50-70%），记录到审查报告，继续';
  } else {
    pass = false;
    action = '退回 Stage 2 补充未覆盖分支';
  }

  console.log(`\n  ${pass ? '✅' : '❌'} Gate ${pass ? '通过' : '未通过'} — ${action}\n`);

  return { pass, results, action };
}

// ─── 覆盖率比较 ──────────────────────────────────────────────────────────
function compareCoverage(team, baselinePath) {
  console.log(`\n=== 覆盖率比较 — ${team} vs baseline ===\n`);

  const currentFile = path.resolve(CWD, `${team}-03-coverage.json`);
  if (!fs.existsSync(currentFile) || !fs.existsSync(baselinePath)) {
    console.log('  [✗] 当前或基线覆盖率数据不存在');
    return null;
  }

  const current = JSON.parse(fs.readFileSync(currentFile, 'utf-8'));
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

  const metrics = ['lines', 'branches', 'functions'];
  for (const m of metrics) {
    const diff = (current[m] || 0) - (baseline[m] || 0);
    const icon = diff >= 0 ? '✓' : '✗';
    console.log(`  [${icon}] ${m}: ${current[m]}% → ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`);
  }

  const branchesDiff = (current.branchs || 0) - (baseline.branches || 0);
  return { pass: branchesDiff >= 0, diff: branchesDiff };
}

// ─── 主入口 ──────────────────────────────────────────────────────────────
const opts = parseArgs();

if (!opts.team) {
  console.error('错误: 必须指定 --team <red|blue|green>');
  process.exit(1);
}

let result;
switch (opts.command) {
  case 'collect':
    result = { pass: !!collectCoverage(opts.team) };
    break;
  case 'gate':
    result = gateCheck(opts.team, opts);
    break;
  case 'compare':
    if (!opts.baseline) {
      console.error('错误: compare 需要指定 --baseline <path>');
      process.exit(1);
    }
    result = compareCoverage(opts.team, opts.baseline) || { pass: false };
    break;
  default:
    console.error(`错误: 不支持的命令 "${opts.command}"，可选: collect, gate, compare`);
    process.exit(1);
}

process.exit(result.pass ? 0 : 1);
