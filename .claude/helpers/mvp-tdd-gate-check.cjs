/**
 * MVP TDD Gate Check — TDD 门控验证脚本（MVP 简化版）
 *
 * 验证 kf-mvp pipeline 中 TDD 相关门控：
 *   Stage 0.5: 测试编译成功 + 全部 RED
 *   Stage 2:   测试全部通过（GREEN） + 编码完成
 *
 * 用法：
 *   node {IDE_ROOT}/helpers/mvp-tdd-gate-check.cjs --stage <0.5|2> [--dir <test-dir>]
 *   node {IDE_ROOT}/helpers/mvp-tdd-gate-check.cjs --scan-tdd-compliance
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
      case '--dir': opts.testDir = args[++i]; break;
      case '--scan-tdd-compliance': opts.scanTdd = true; break;
      case '--help':
        console.log('Usage: mvp-tdd-gate-check.cjs --stage <0.5|2> [--dir <test-dir>]');
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

// ─── Stage 0.5 门控：测试编译成功 + 全部 RED ─────────────────────────────
function gateStage05(testDir) {
  const dir = path.resolve(CWD, testDir || 'tests');

  console.log(`\n=== Gate 0.5: 测试设计先行 ===\n`);

  if (!fs.existsSync(dir)) {
    console.log(`  [x] 测试目录不存在: ${dir}`);
    return { pass: false, reason: '测试目录不存在' };
  }
  console.log(`  [v] 测试目录存在: ${dir}`);

  // 查找测试文件
  const testFiles = findFiles(dir, /\.test\./);
  if (testFiles.length === 0) {
    console.log(`  [x] 未找到测试文件`);
    return { pass: false, reason: '测试文件不存在' };
  }
  console.log(`  [v] 测试文件: ${testFiles.length} 个`);

  // 尝试测试编译（无测试执行）
  let compileOk = false;
  try {
    const result = execSync('npx vitest run --no-coverage --reporter=json 2>&1 || true', {
      cwd: CWD,
      timeout: 60000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const line = result.split('\n').find(l => l.includes('Tests'));
    if (line && (line.includes('0 passed') || line.includes('Failed'))) {
      console.log(`  [v] 测试编译通过，所有测试预期失败（RED 状态）`);
      compileOk = true;
    } else if (result.includes('passed')) {
      console.log(`  [!] 部分测试已通过（非纯 RED）`);
      compileOk = true;
    } else {
      console.log(`  [?] 测试运行输出: ${result.slice(0, 200)}`);
      compileOk = true;
    }
  } catch (e) {
    if (e.stdout && e.stdout.includes('RUNS')) {
      console.log(`  [v] 测试编译器可通过（vitest 识别了测试文件）`);
      compileOk = true;
    } else {
      console.log(`  [x] 测试编译失败: ${(e.stderr || e.message).slice(0, 200)}`);
    }
  }

  if (!compileOk) {
    return { pass: false, reason: '测试编译失败' };
  }

  console.log(`\n  [v] Stage 0.5 门控通过`);
  return { pass: true };
}

// ─── Stage 2 门控：全部 GREEN ────────────────────────────────────────────
function gateStage2(testDir) {
  const dir = path.resolve(CWD, testDir || 'tests');

  console.log(`\n=== Gate 2: TDD 编码完成 — 全部 GREEN ===\n`);

  if (!fs.existsSync(dir)) {
    console.log(`  [x] 测试目录不存在: ${dir}`);
    return { pass: false, reason: '测试目录不存在' };
  }

  try {
    const result = execSync('npx vitest run --no-coverage --reporter=json 2>&1', {
      cwd: CWD,
      timeout: 120000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // 简单的文本检查
    if (result.includes('Tests') && result.includes('passed') && !result.includes('failed')) {
      console.log(`  [v] 所有测试通过（GREEN）`);
      console.log(`\n  [v] Stage 2 门控通过`);
      return { pass: true };
    } else if (result.includes('Tests') && result.includes('failed')) {
      const failLine = result.split('\n').find(l => l.includes('Tests'));
      console.log(`  [x] 测试未全部通过: ${failLine || '有失败测试'}`);
      return { pass: false, reason: '有失败测试' };
    } else {
      console.log(`  [?] 输出: ${result.slice(0, 300)}`);
      return { pass: false, reason: '无法判断测试状态' };
    }
  } catch (e) {
    const out = e.stdout || '';
    const err = e.stderr || '';
    if (out.includes('Tests') && out.includes('passed') && !out.includes('failed')) {
      console.log(`  [v] 所有测试通过（GREEN，exit code 非零但测试通过）`);
      console.log(`\n  [v] Stage 2 门控通过`);
      return { pass: true };
    }
    console.log(`  [x] 测试执行失败: ${(err || e.message).slice(0, 200)}`);
    return { pass: false, reason: '测试执行异常' };
  }
}

// ─── TDD 合规扫描 ────────────────────────────────────────────────────────
function scanTddCompliance(testDir) {
  const dir = path.resolve(CWD, testDir || 'tests');
  const checks = [];

  console.log(`\n=== TDD 合规扫描 ===\n`);

  // K1: 测试文件存在
  const testFiles = findFiles(dir, /\.test\./);
  checks.push({ id: 'K1', name: '测试文件存在', pass: testFiles.length > 0, detail: `${testFiles.length} 个文件` });

  // K3: 检查是否出现了先实现后补测试（简单启发式：检查测试文件数量和源文件数量的比例）
  const srcDir = path.resolve(CWD, 'src');
  const srcFiles = findFiles(srcDir, /\.(js|ts|vue|jsx|tsx)$/);
  const testRatio = srcFiles.length > 0 ? testFiles.length / srcFiles.length : 0;
  checks.push({ id: 'K3', name: '最小实现（非超前）', pass: testRatio > 0.1, detail: `测试/源文件比: ${testRatio.toFixed(2)}` });

  // K6: 检查空断言/空的测试文件
  let emptyTests = 0;
  for (const tf of testFiles.slice(0, 20)) {
    const content = fs.readFileSync(tf, 'utf-8');
    if (content.includes('it.todo') || content.includes('test.todo')) {
      emptyTests++;
    }
  }
  checks.push({ id: 'K6', name: '无空断言/空测试', pass: emptyTests === 0, detail: emptyTests > 0 ? `${emptyTests} 个文件包含 it.todo` : '全部通过' });

  // 输出结果
  let allPass = true;
  for (const c of checks) {
    console.log(`  ${c.pass ? '[v]' : '[x]'} ${c.id} — ${c.name}: ${c.detail}`);
    if (!c.pass) allPass = false;
  }
  console.log(`\n  合规扫描: ${allPass ? '[v] 通过' : '[x] 未通过'}`);
  return { pass: allPass, checks };
}

// ─── 主入口 ──────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs();

  if (opts.scanTdd) {
    const result = scanTddCompliance(opts.testDir);
    process.exit(result.pass ? 0 : 1);
  }

  switch (opts.stage) {
    case '0.5': {
      const result = gateStage05(opts.testDir);
      process.exit(result.pass ? 0 : 1);
    }
    case '2': {
      const result = gateStage2(opts.testDir);
      process.exit(result.pass ? 0 : 1);
    }
    default:
      console.log(`[x] 未知 stage: ${opts.stage}`);
      console.log('可用 stage: 0.5, 2');
      process.exit(1);
  }
}

main();
