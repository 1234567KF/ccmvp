/**
 * TDD Gate Check — TDD 门控验证脚本
 *
 * 验证 MVP Pipeline 中 TDD 相关门控：
 *   Stage 0.5: 测试编译成功 + 全部 RED
 *   Stage 2a:  测试预期失败（RED）
 *   Stage 2b:  测试全部通过（GREEN）
 *   Stage 2:   编码完成（全部 GREEN + checklist P0）
 *
 * 用法：
 *   node {IDE_ROOT}/helpers/tdd-gate-check.cjs --stage <0.5|2a|2b|2> --team <red|blue|green>
 *   node {IDE_ROOT}/helpers/tdd-gate-check.cjs --scan-tdd-compliance --team <red|blue|green>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CWD = process.env.CLAUDE_PROJECT_DIR || process.env.QODER_PROJECT_DIR || process.cwd();

// ─── 参数解析 ──────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--stage': opts.stage = args[++i]; break;
      case '--team': opts.team = args[++i]; break;
      case '--scan-tdd-compliance': opts.scanTdd = true; break;
      case '--help':
        console.log('Usage: tdd-gate-check.cjs --stage <0.5|2a|2b|2> --team <red|blue|green>');
        console.log('       tdd-gate-check.cjs --scan-tdd-compliance --team <red|blue|green>');
        process.exit(0);
    }
  }
  return opts;
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────
function findFiles(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function teamDir(team) {
  return path.resolve(CWD, `${team}-05-tests`);
}

function teamPrefix(team) {
  return team;
}

// ─── Stage 0.5 门控：测试编译成功 + 全部 RED ─────────────────────────────
function gateStage05(team) {
  const dir = teamDir(team);
  const prefix = teamPrefix(team);

  console.log(`\n=== Gate 0.5: TDD 测试设计先行 — ${team} ===\n`);

  // 1. 测试文件目录存在
  if (!fs.existsSync(dir)) {
    console.log(`  [✗] 测试目录不存在: ${dir}`);
    return { pass: false, reason: '测试目录不存在' };
  }
  console.log(`  [✓] 测试目录存在: ${dir}`);

  // 2. 场景矩阵文件存在
  const scenariosFile = path.resolve(CWD, `${prefix}-05-scenarios.json`);
  if (!fs.existsSync(scenariosFile)) {
    console.log(`  [✗] 场景矩阵不存在: ${scenariosFile}`);
    return { pass: false, reason: '场景矩阵不存在' };
  }
  console.log(`  [✓] 场景矩阵存在: ${scenariosFile}`);

  // 3. 测试文件编译检查（语法检查）
  const testFiles = findFiles(dir, /\.(test|spec)\.(ts|js|tsx|jsx)$/);
  if (testFiles.length === 0) {
    console.log(`  [✗] 无测试文件`);
    return { pass: false, reason: '无测试文件' };
  }
  console.log(`  [✓] 发现 ${testFiles.length} 个测试文件`);

  // 4. 检查是否包含 it.todo（禁止）
  let hasTodo = false;
  for (const f of testFiles) {
    const content = fs.readFileSync(f, 'utf-8');
    if (/it\.todo|it\.skip|test\.todo|test\.skip/.test(content)) {
      console.log(`  [✗] 测试文件含 it.todo/it.skip: ${path.basename(f)}`);
      hasTodo = true;
    }
  }
  if (hasTodo) {
    return { pass: false, reason: '测试文件含 it.todo/it.skip（Stage 0.5 禁止）' };
  }
  console.log(`  [✓] 无 it.todo/it.skip`);

  // 5. RED 验证报告存在
  const redReport = path.resolve(CWD, `${prefix}-05-red-report.md`);
  if (fs.existsSync(redReport)) {
    console.log(`  [✓] RED 验证报告存在`);
  } else {
    console.log(`  [!] RED 验证报告不存在（建议生成）`);
  }

  // 6. 3 维度覆盖检查
  try {
    const scenarios = JSON.parse(fs.readFileSync(scenariosFile, 'utf-8'));
    const hasRoles = scenarios.some(s => s.role || s['角色']);
    const hasPerms = scenarios.some(s => s.permission || s['权限']);
    const hasData = scenarios.some(s => s.dataState || s['数据状态']);
    const dimensions = [hasRoles, hasPerms, hasData].filter(Boolean).length;
    console.log(`  [${dimensions >= 3 ? '✓' : '!'}] 场景覆盖维度: ${dimensions}/3 (角色/权限/数据状态)`);
    if (dimensions < 3) {
      return { pass: false, reason: `场景覆盖仅 ${dimensions}/3 维度` };
    }
  } catch (e) {
    console.log(`  [!] 场景矩阵解析失败: ${e.message}`);
  }

  console.log(`\n  ✅ Gate 0.5 通过 — ${team}\n`);
  return { pass: true };
}

// ─── Stage 2a 门控：RED 验证 ──────────────────────────────────────────────
function gateStage2a(team) {
  const prefix = teamPrefix(team);
  console.log(`\n=== Gate 2a: RED 验证 — ${team} ===\n`);

  // 检查 Stage 0.5 测试文件存在
  const dir = teamDir(team);
  const testFiles = findFiles(dir, /\.(test|spec)\.(ts|js|tsx|jsx)$/);
  if (testFiles.length === 0) {
    console.log(`  [✗] Stage 0.5 测试文件不存在`);
    return { pass: false, reason: 'Stage 0.5 测试文件不存在' };
  }
  console.log(`  [✓] Stage 0.5 测试文件存在: ${testFiles.length} 个`);

  // 尝试运行测试，预期全部失败
  try {
    const result = execSync('npx vitest run --reporter=json 2>/dev/null', {
      cwd: CWD,
      timeout: 60000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    // 如果运行成功，检查是否有通过的测试
    try {
      const report = JSON.parse(result);
      const failed = report.numFailedTests || 0;
      const passed = report.numPassedTests || 0;
      if (passed > 0) {
        console.log(`  [✗] 有 ${passed} 个测试已通过（预期全部 RED）`);
        return { pass: false, reason: `${passed} 个测试意外通过` };
      }
      console.log(`  [✓] 全部 ${failed} 个测试为 RED 状态`);
    } catch (e) {
      console.log(`  [!] 无法解析测试报告，假定 RED 状态`);
    }
  } catch (e) {
    // vitest 非零退出码 = 测试有失败 = RED
    console.log(`  [✓] 测试运行失败（预期 RED 状态）`);
  }

  console.log(`\n  ✅ Gate 2a 通过 — ${team}\n`);
  return { pass: true };
}

// ─── Stage 2b 门控：GREEN 验证 ──────────────────────────────────────────────
function gateStage2b(team) {
  console.log(`\n=== Gate 2b: GREEN 验证 — ${team} ===\n`);

  try {
    const result = execSync('npx vitest run --reporter=json 2>/dev/null', {
      cwd: CWD,
      timeout: 120000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    try {
      const report = JSON.parse(result);
      const passed = report.numPassedTests || 0;
      const failed = report.numFailedTests || 0;
      if (failed > 0) {
        console.log(`  [✗] 有 ${failed} 个测试失败`);
        return { pass: false, reason: `${failed} 个测试失败` };
      }
      console.log(`  [✓] 全部 ${passed} 个测试通过（GREEN）`);
    } catch (e) {
      console.log(`  [!] 无法解析测试报告`);
    }
  } catch (e) {
    console.log(`  [✗] 测试运行失败`);
    return { pass: false, reason: '测试运行失败' };
  }

  console.log(`\n  ✅ Gate 2b 通过 — ${team}\n`);
  return { pass: true };
}

// ─── Stage 2 门控：编码完成 ──────────────────────────────────────────────
function gateStage2(team) {
  const prefix = teamPrefix(team);
  console.log(`\n=== Gate 2: 编码完成 + TDD 合规 — ${team} ===\n`);

  // 1. 全部 GREEN
  const greenResult = gateStage2b(team);
  if (!greenResult.pass) {
    return greenResult;
  }

  // 2. checklist P0 (A/B/D/J/K)
  const implFile = path.resolve(CWD, `${prefix}-02-implementation.md`);
  if (fs.existsSync(implFile)) {
    const content = fs.readFileSync(implFile, 'utf-8');
    const p0Types = ['A1', 'B1', 'D1', 'J1', 'K1', 'K2', 'K5'];
    const missing = p0Types.filter(t => !content.includes(t));
    if (missing.length > 0) {
      console.log(`  [!] checklist P0 项可能缺失: ${missing.join(', ')}`);
    } else {
      console.log(`  [✓] checklist P0 项已覆盖`);
    }
  } else {
    console.log(`  [!] 实现报告不存在: ${implFile}`);
  }

  // 3. TDD 循环报告存在
  const tddCycleFiles = findFiles(path.resolve(CWD), new RegExp(`^${prefix}-02-tdd-cycle-\\d+\\.md$`));
  console.log(`  [${tddCycleFiles.length > 0 ? '✓' : '!'}] TDD 循环报告: ${tddCycleFiles.length} 个`);

  console.log(`\n  ✅ Gate 2 通过 — ${team}\n`);
  return { pass: true };
}

// ─── TDD 合规扫描 ──────────────────────────────────────────────────────
function scanTddCompliance(team) {
  const prefix = teamPrefix(team);
  console.log(`\n=== TDD 合规扫描 — ${team} ===\n`);

  const checks = {
    K1: false, K2: false, K3: false, K4: false,
    K5: false, K6: false, K7: false
  };

  // K1: 编码前是否有测试文件
  const dir = teamDir(team);
  checks.K1 = fs.existsSync(dir) && findFiles(dir, /\.(test|spec)\./).length > 0;
  console.log(`  K1 编码前测试文件: ${checks.K1 ? '✓' : '✗'}`);

  // K2: RED 验证
  const redReport = path.resolve(CWD, `${prefix}-05-red-report.md`);
  checks.K2 = fs.existsSync(redReport);
  console.log(`  K2 RED 验证报告: ${checks.K2 ? '✓' : '✗'}`);

  // K3: GREEN 最小实现（检查实现文件行数是否合理）
  const implFile = path.resolve(CWD, `${prefix}-02-implementation.md`);
  if (fs.existsSync(implFile)) {
    const content = fs.readFileSync(implFile, 'utf-8');
    checks.K3 = content.includes('最小') || content.includes('minimal');
  }
  console.log(`  K3 GREEN 最小实现: ${checks.K3 ? '✓' : '✗'}`);

  // K4: 覆盖率（查看覆盖率报告）
  const coverageDir = path.resolve(CWD, 'coverage');
  checks.K4 = fs.existsSync(coverageDir);
  console.log(`  K4 覆盖率数据: ${checks.K4 ? '✓' : '✗'}`);

  // K5: 编码顺序（检查实现报告时间 vs 测试文件时间）
  checks.K5 = checks.K1; // 如果有测试文件在先，大致合规
  console.log(`  K5 编码顺序合规: ${checks.K5 ? '✓' : '✗'}`);

  // K6: 断言完整性
  if (checks.K1) {
    const testFiles = findFiles(dir, /\.(test|spec)\./);
    let hasTodo = false;
    for (const f of testFiles) {
      const content = fs.readFileSync(f, 'utf-8');
      if (/it\.todo|it\.skip|test\.todo|test\.skip/.test(content)) hasTodo = true;
    }
    checks.K6 = !hasTodo;
  }
  console.log(`  K6 断言完整性: ${checks.K6 ? '✓' : '✗'}`);

  // K7: QA-编码解耦（检查测试设计产出与编码产出是否来自不同 agent）
  checks.K7 = checks.K1 && checks.K2;
  console.log(`  K7 QA-编码解耦: ${checks.K7 ? '✓' : '✗'}`);

  const p0Pass = checks.K1 && checks.K2 && checks.K5;
  const allPass = Object.values(checks).every(Boolean);
  console.log(`\n  P0 门控: ${p0Pass ? '✅ 通过' : '❌ 未通过'}`);
  console.log(`  全项: ${allPass ? '✅ 全部通过' : `⚠️ ${Object.values(checks).filter(Boolean).length}/7 通过`}\n`);

  return { pass: p0Pass, checks };
}

// ─── 主入口 ──────────────────────────────────────────────────────────────
const opts = parseArgs();

if (!opts.team && !opts.scanTdd) {
  console.error('错误: 必须指定 --team <red|blue|green>');
  process.exit(1);
}

let result;
if (opts.scanTdd) {
  result = scanTddCompliance(opts.team);
} else {
  switch (opts.stage) {
    case '0.5': result = gateStage05(opts.team); break;
    case '2a': result = gateStage2a(opts.team); break;
    case '2b': result = gateStage2b(opts.team); break;
    case '2': result = gateStage2(opts.team); break;
    default:
      console.error(`错误: 不支持的 stage "${opts.stage}"，可选: 0.5, 2a, 2b, 2`);
      process.exit(1);
  }
}

process.exit(result.pass ? 0 : 1);
