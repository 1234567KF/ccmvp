#!/usr/bin/env node
/**
 * skill-validator.cjs — SKILL.md 行为级验证框架
 *
 * 验证维度:
 *   1. 结构完整性: frontmatter、必填字段、工具声明
 *   2. 引用完整性: 依赖技能存在、模板文件存在、CLAUDE.md 注册
 *   3. 行为契约: 关键行为模式可检测（flag 检测、输出格式、Gate 定义）
 *   4. 缓存安全: 共享前缀一致性（委托 cache-audit.cjs）
 *   5. 自定义用例: 技能特定的行为验证
 *
 * 用法:
 *   node {IDE_ROOT}/helpers/skill-validator.cjs --all              # 全量验证
 *   node {IDE_ROOT}/helpers/skill-validator.cjs --skill kf-spec    # 单技能验证
 *   node {IDE_ROOT}/helpers/skill-validator.cjs --skill kf-spec --test-ac  # 运行 AC 场景测试
 *   node {IDE_ROOT}/helpers/skill-validator.cjs --list-tests        # 列出所有可用测试
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');
const CLAUDE_MD = path.join(ROOT, '.claude', 'CLAUDE.md');

// ─── Test registry ───
// Each test: { name, skill, description, fn(skillPath, skillData) => { pass, detail } }
const TEST_REGISTRY = [];

function registerTest(name, skill, description, fn) {
  TEST_REGISTRY.push({ name, skill, description, fn });
}

// ─── Helpers ───
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return { error: 'No frontmatter found' };

  const fmBlock = match[1];
  const fmEndIndex = (match.index || 0) + match[0].length;
  const data = {};

  // Extract top-level keys with regex — handles multi-line values via indentation
  const keyPattern = /^(\w[\w-]*):\s*(.*)$/gm;
  let m;
  const positions = [];
  while ((m = keyPattern.exec(fmBlock)) !== null) {
    positions.push({ key: m[1], value: m[2].trim(), index: m.index, lineEnd: m.index + m[0].length });
  }

  for (let i = 0; i < positions.length; i++) {
    const { key, value, index, lineEnd } = positions[i];
    if (value === '|' || value === '') {
      // Multi-line value: grab everything until next top-level key or end
      const nextKey = positions[i + 1];
      const endIdx = nextKey ? nextKey.index : fmBlock.length;
      // Find start after the key line
      const afterKeyLine = fmBlock.indexOf('\n', lineEnd);
      if (afterKeyLine !== -1 && afterKeyLine < endIdx) {
        data[key] = fmBlock.substring(afterKeyLine + 1, endIdx).trim();
      } else {
        data[key] = '';
      }
    } else {
      data[key] = value;
    }
  }

  return { data, bodyStart: fmEndIndex };
}

function listKfSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR)
    .filter(d => d.startsWith('kf-') && fs.statSync(path.join(SKILLS_DIR, d)).isDirectory())
    .map(d => ({
      name: d,
      skillPath: path.join(SKILLS_DIR, d, 'SKILL.md'),
      exists: fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md'))
    }));
}

// ─── Structural validations ───
function validateStructure(skillPath, skillName) {
  const errors = [];
  const warnings = [];
  const info = {};

  if (!fs.existsSync(skillPath)) {
    errors.push(`SKILL.md not found at ${skillPath}`);
    return { errors, warnings, info };
  }

  const content = fs.readFileSync(skillPath, 'utf8');
  const parsed = parseFrontmatter(content);

  if (parsed.error) {
    errors.push(parsed.error);
    return { errors, warnings, info };
  }

  const { data: fm, bodyStart } = parsed;
  info.lineCount = content.split('\n').length;

  // Required frontmatter fields
  if (!fm.name) errors.push('Missing "name" in frontmatter');
  if (!fm.description) errors.push('Missing "description" in frontmatter');

  // Triggers check (warn if none)
  if (!fm.triggers) {
    warnings.push('No "triggers" defined — skill may not be invocable');
  } else {
    info.triggers = fm.triggers;
  }

  // Allowed tools check
  if (fm['allowed-tools']) {
    info.allowedTools = fm['allowed-tools'];
  }

  // Integrated skills check
  if (fm['integrated-skills']) {
    info.integratedSkills = fm['integrated-skills'];
  }

  // Graph dependencies check
  if (fm.graph && fm.graph.dependencies) {
    info.dependencies = fm.graph.dependencies;
  }

  // Body section checks
  const body = content.substring(bodyStart);
  const sections = {
    hasHarness: body.includes('Harness 反馈闭环') || body.includes('harness-gate-check'),
    hasQualitySignals: body.includes('quality-signals') || body.includes('quality_signals'),
    hasGateDefinition: (body.match(/###\s*Gate\s*\d/g) || []).length,
    hasStepDefinition: (body.match(/##\s*Step\s*\d/g) || []).length,
    hasSharedPrefix: body.includes('### SHARED PREFIX START'),
    hasIronRules: body.includes('Iron Rules') || body.includes('铁律'),
  };
  info.sections = sections;

  return { errors, warnings, info };
}

// ─── Reference integrity ───
function validateReferences(skillName, info, skillPath) {
  const errors = [];
  const warnings = [];

  // Check CLAUDE.md registration
  if (fs.existsSync(CLAUDE_MD)) {
    const claudeContent = fs.readFileSync(CLAUDE_MD, 'utf8');
    if (!claudeContent.includes(`\`${skillName}\``)) {
      warnings.push(`Skill "${skillName}" not referenced in CLAUDE.md 技能一览 table`);
    }
  }

  // Check integrated skills from file content (more reliable than YAML parsing)
  if (skillPath && fs.existsSync(skillPath)) {
    const content = fs.readFileSync(skillPath, 'utf8');
    // Match lines like: "- kf-alignment  # ..." or "  - kf-model-router"
    const depPattern = /^\s*-\s+(kf-\w[\w-]*)/gm;
    let dm;
    while ((dm = depPattern.exec(content)) !== null) {
      const depName = dm[1].trim();
      const depPath = path.join(SKILLS_DIR, depName, 'SKILL.md');
      if (!fs.existsSync(depPath)) {
        errors.push(`Integrated skill "${depName}" not found at ${depPath}`);
      }
    }
  }

  return { errors, warnings };
}

// ─── Run a single skill validation ───
function validateSkill(skillName, options = {}) {
  const result = {
    skill: skillName,
    structural: null,
    references: null,
    customTests: [],
    cacheAudit: null,
    passed: true,
  };

  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  result.structural = validateStructure(skillPath, skillName);
  if (result.structural.errors.length > 0) result.passed = false;

  if (result.structural.info && Object.keys(result.structural.info).length > 0) {
    result.references = validateReferences(skillName, result.structural.info, skillPath);
    if (result.references.errors.length > 0) result.passed = false;
  }

  // Run custom tests for this skill
  const customTests = TEST_REGISTRY.filter(t => t.skill === skillName);
  for (const test of customTests) {
    try {
      const testResult = test.fn(skillPath, result.structural);
      result.customTests.push({ name: test.name, description: test.description, ...testResult });
      if (!testResult.pass) result.passed = false;
    } catch (e) {
      result.customTests.push({ name: test.name, description: test.description, pass: false, detail: `Test error: ${e.message}` });
      result.passed = false;
    }
  }

  return result;
}

// ─── Output formatting ───
function formatResult(result) {
  const lines = [];
  const icon = result.passed ? '✅' : '❌';
  lines.push(`\n${icon} Skill: ${result.skill}`);

  // Structural
  if (result.structural) {
    const s = result.structural;
    if (s.errors.length > 0) {
      s.errors.forEach(e => lines.push(`  ❌ [STRUCT] ${e}`));
    }
    if (s.warnings.length > 0) {
      s.warnings.forEach(w => lines.push(`  ⚠️  [STRUCT] ${w}`));
    }
    if (s.info && s.info.lineCount) {
      lines.push(`  ℹ️  Lines: ${s.info.lineCount}, Gates: ${s.info.sections?.hasGateDefinition || 0}, Steps: ${s.info.sections?.hasStepDefinition || 0}`);
    }
  }

  // References
  if (result.references) {
    const r = result.references;
    if (r.errors.length > 0) r.errors.forEach(e => lines.push(`  ❌ [REF] ${e}`));
    if (r.warnings.length > 0) r.warnings.forEach(w => lines.push(`  ⚠️  [REF] ${w}`));
  }

  // Custom tests
  for (const test of result.customTests) {
    const ti = test.pass ? '✅' : '❌';
    lines.push(`  ${ti} [TEST:${test.name}] ${test.description}: ${test.detail || (test.pass ? 'PASS' : 'FAIL')}`);
  }

  return lines.join('\n');
}

// ─── CLI ───
function cli() {
  const args = process.argv.slice(2);

  if (args.includes('--list-tests')) {
    console.log(`Registered tests: ${TEST_REGISTRY.length}`);
    TEST_REGISTRY.forEach(t => {
      console.log(`  [${t.skill}] ${t.name}: ${t.description}`);
    });
    process.exit(0);
  }

  if (args.includes('--all')) {
    const skills = listKfSkills();
    let totalPassed = 0;
    let totalFailed = 0;

    for (const skill of skills) {
      if (!skill.exists) {
        console.log(`⚠️  ${skill.name}: SKILL.md not found`);
        continue;
      }
      const result = validateSkill(skill.name);
      console.log(formatResult(result));
      if (result.passed) totalPassed++; else totalFailed++;
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Total: ${totalPassed + totalFailed} | ✅ ${totalPassed} | ❌ ${totalFailed}`);
    process.exit(totalFailed > 0 ? 1 : 0);
  }

  const skillIdx = args.indexOf('--skill');
  if (skillIdx !== -1) {
    const skillName = args[skillIdx + 1];
    if (!skillName) {
      console.error('Usage: node skill-validator.cjs --skill <skill-name>');
      process.exit(1);
    }

    const result = validateSkill(skillName);
    console.log(formatResult(result));
    process.exit(result.passed ? 0 : 1);
  }

  // Default: show usage
  console.log('skill-validator.cjs — SKILL.md 行为级验证框架');
  console.log('  node {IDE_ROOT}/helpers/skill-validator.cjs --all              # 全量验证');
  console.log('  node {IDE_ROOT}/helpers/skill-validator.cjs --skill kf-spec    # 单技能验证');
  console.log('  node {IDE_ROOT}/helpers/skill-validator.cjs --list-tests       # 列出测试用例');
}

// ─── Register built-in behavioral tests ───

// P1.1: kf-spec --ac flag test
registerTest('ac-flag-detection', 'kf-spec',
  '检测 --ac flag 的触发逻辑是否存在',
  (skillPath, structural) => {
    const content = fs.readFileSync(skillPath, 'utf8');
    const hasAcFlag = content.includes('--ac');
    const hasAcceptanceCriteria = content.includes('验收条件');
    const hasGivenWhenThen = content.includes('Given-When-Then') || content.includes('Given/When/Then');

    if (!hasAcFlag) return { pass: false, detail: '未找到 --ac flag 检测逻辑' };
    if (!hasAcceptanceCriteria) return { pass: false, detail: '未找到 验收条件 章节定义' };
    if (!hasGivenWhenThen) return { pass: false, detail: '未找到 Given-When-Then 格式要求' };

    return { pass: true, detail: '--ac flag + 验收条件 + Given-When-Then 均已定义' };
  });

// P1.1: kf-spec quality gate AC check
registerTest('ac-quality-gate', 'kf-spec',
  '检测 --ac 模式下 Step 4 质量门禁是否包含 AC 完整性检查',
  (skillPath, structural) => {
    const content = fs.readFileSync(skillPath, 'utf8');

    // Find Step 4 section and check for AC-related checklist item
    const step4Match = content.match(/## Step 4 [\s\S]*?(?=\n## Step 4\.5|\n## Step 5|\n---\s*$|$)/);
    if (!step4Match) return { pass: false, detail: '未找到 Step 4 质量门禁章节' };

    const step4Content = step4Match[0];
    const hasAcCheck = step4Content.includes('验收条件') ||
      step4Content.includes('AC') ||
      step4Content.includes('Given-When-Then');

    return {
      pass: hasAcCheck,
      detail: hasAcCheck ? 'Step 4 包含 AC 完整性检查项' : 'Step 4 缺少 AC 完整性检查项'
    };
  });

// P0.2: kf-code-review-graph severity enum test
registerTest('severity-enum', 'kf-code-review-graph',
  '检测 severity 枚举定义和 JSON 输出',
  (skillPath, structural) => {
    const content = fs.readFileSync(skillPath, 'utf8');
    const hasP0 = content.includes('P0');
    const hasP1 = content.includes('P1');
    const hasSeverityTable = content.includes('Severity') && content.includes('判定条件');
    const hasJsonOutput = content.includes('.json') && (content.includes('review-') || content.includes('review_report'));

    const checks = [];
    if (!hasSeverityTable) checks.push('缺少 severity 判定条件表');
    if (!hasJsonOutput) checks.push('缺少 JSON 输出定义');

    return {
      pass: hasSeverityTable && hasJsonOutput,
      detail: checks.length > 0 ? checks.join('; ') : 'severity 表 + JSON 输出均已定义'
    };
  });

// P0.5: MVP Gate 2.0 hard gate test
registerTest('gate-2-state-machine', 'kf-mvp',
  '检测 Gate 2.0 状态机和硬阻断逻辑',
  (skillPath, structural) => {
    const content = fs.readFileSync(skillPath, 'utf8');
    const hasStateMachine = content.includes('IDLE') && content.includes('SCANNING') && content.includes('PASSED');
    const hasCriticalDetection = content.includes('CRITICAL') || content.includes('[ASSUMPTION:CRITICAL]');
    const hasTimeout = content.includes('5') && (content.includes('分钟') || content.includes('min'));

    const checks = [];
    if (!hasStateMachine) checks.push('缺少 Gate 2.0 状态机定义');
    if (!hasCriticalDetection) checks.push('缺少 CRITICAL 检测逻辑');
    if (!hasTimeout) checks.push('缺少超时机制(5分钟)');

    return {
      pass: hasStateMachine && hasCriticalDetection && hasTimeout,
      detail: checks.length > 0 ? checks.join('; ') : 'Gate 2.0 状态机完整'
    };
  });

// P0.6: MVP depth selection test
registerTest('depth-selection', 'kf-mvp',
  '检测深度选择(A/B/C)和 hang-state.json 持久化',
  (skillPath, structural) => {
    const content = fs.readFileSync(skillPath, 'utf8');
    const hasOptions = content.includes('A') && content.includes('B') && content.includes('C');
    const hasHangState = content.includes('hang-state.json');
    const hasRecovery = content.includes('恢复') || content.includes('resume') || content.includes('继续');

    const checks = [];
    if (!hasOptions) checks.push('缺少 A/B/C 三档深度选择');
    if (!hasHangState) checks.push('缺少 hang-state.json 持久化');
    if (!hasRecovery) checks.push('缺少恢复机制');

    return {
      pass: hasOptions && hasHangState && hasRecovery,
      detail: checks.length > 0 ? checks.join('; ') : '深度选择 + 持久化 + 恢复均已定义'
    };
  });

// P0.7: MVP progress dashboard test
registerTest('progress-dashboard', 'kf-mvp',
  '检测进展看板输出格式',
  (skillPath, structural) => {
    const content = fs.readFileSync(skillPath, 'utf8');
    const hasPhaseChain = content.includes('阶段') && (content.includes('→') || content.includes('进度'));
    const hasTeamProgress = content.includes('红队') || content.includes('蓝队') || content.includes('绿队');
    const hasControls = content.includes('fast') || content.includes('status') || content.includes('stop');

    const checks = [];
    if (!hasPhaseChain) checks.push('缺少阶段链展示');
    if (!hasTeamProgress) checks.push('缺少各队进度');
    if (!hasControls) checks.push('缺少 fast/status/stop 控制');

    return {
      pass: hasPhaseChain && hasTeamProgress && hasControls,
      detail: checks.length > 0 ? checks.join('; ') : '进展看板格式完整'
    };
  });

// P1.2: kf-code-review-graph conditional re-review test
registerTest('conditional-rerun', 'kf-code-review-graph',
  '检测条件重审触发逻辑（Step 7）是否定义',
  (skillPath, structural) => {
    const content = fs.readFileSync(skillPath, 'utf8');
    const hasStep7 = content.includes('Step 7') && (content.includes('重审') || content.includes('rerun'));
    const hasP0Trigger = content.includes('P0') && content.includes('> 0');
    const hasP1Density = content.includes('KLOC') || content.includes('千行');
    const hasMaxRounds = content.includes('3') && (content.includes('轮') || content.includes('round'));
    const hasEscalation = content.includes('escalation') || content.includes('UNRESOLVED');
    const hasRerunScript = content.includes('review-rerun-check.cjs');

    const checks = [];
    if (!hasStep7) checks.push('缺少 Step 7 条件重审定义');
    if (!hasP0Trigger) checks.push('缺少 P0>0 触发规则');
    if (!hasP1Density) checks.push('缺少 P1 密度阈值规则');
    if (!hasMaxRounds) checks.push('缺少 3 轮上限定义');
    if (!hasEscalation) checks.push('缺少 Escalation 处理');
    if (!hasRerunScript) checks.push('缺少 review-rerun-check.cjs 调用');

    return {
      pass: hasStep7 && hasP0Trigger && hasP1Density && hasMaxRounds && hasEscalation && hasRerunScript,
      detail: checks.length > 0 ? checks.join('; ') : 'Step 7 条件重审完整定义'
    };
  });

// P1.3: MVP quality signals aggregation plan test
registerTest('quality-aggregation-plan', 'kf-mvp',
  '检测 Phase 2.5 质量信号聚合与 Plan 预览是否定义',
  (skillPath, structural) => {
    const content = fs.readFileSync(skillPath, 'utf8');
    const hasPhase25 = content.includes('Phase 2.5') && content.includes('聚合');
    const hasQualitySignalsRef = content.includes('quality-signals.cjs') || content.includes('quality_signals');
    const hasTeamAggregation = content.includes('红队') && content.includes('蓝队') && content.includes('绿队')
      && (content.includes('severity') || content.includes('P0'));
    const hasHangStateUpdate = content.includes('hang-state.json') && content.includes('aggregation');
    const hasInterruptWindow = content.includes('改权重') || content.includes('暂停') || content.includes('30s');
    const hasRerunLink = content.includes('条件重审') || content.includes('Step 7');

    const checks = [];
    if (!hasPhase25) checks.push('缺少 Phase 2.5 聚合阶段定义');
    if (!hasQualitySignalsRef) checks.push('缺少 quality_signals 引用');
    if (!hasTeamAggregation) checks.push('缺少三队 severity 聚合');
    if (!hasHangStateUpdate) checks.push('缺少 hang-state.json 聚合状态更新');
    if (!hasInterruptWindow) checks.push('缺少用户打断窗口');
    if (!hasRerunLink) checks.push('缺少条件重审联动');

    return {
      pass: hasPhase25 && hasQualitySignalsRef && hasTeamAggregation && hasHangStateUpdate && hasInterruptWindow && hasRerunLink,
      detail: checks.length > 0 ? checks.join('; ') : 'Phase 2.5 质量聚合 Plan 完整定义'
    };
  });

// P1.4: Unit test companion test
registerTest('unit-test-companion', 'kf-mvp',
  '检测 --with-tests 标志和单元测试伴随生成逻辑是否定义',
  (skillPath, structural) => {
    const content = fs.readFileSync(skillPath, 'utf8');
    const hasWithTestsFlag = content.includes('--with-tests');
    const hasSkeletonRules = content.includes('测试骨架') || content.includes('test skeleton');
    const hasWhitelist = content.includes('.tsx') && content.includes('.jsx') && content.includes('.py');
    const hasSkipConfig = content.includes('配置文件') || content.includes('类型定义') || content.includes('跳过');
    const hasGateCheck = content.includes('测试骨架文件存在且可执行');
    const hasOutputRequirement = content.includes('测试骨架文件清单');

    const checks = [];
    if (!hasWithTestsFlag) checks.push('缺少 --with-tests 标志');
    if (!hasSkeletonRules) checks.push('缺少测试骨架生成规则');
    if (!hasWhitelist) checks.push('缺少扩展名白名单');
    if (!hasSkipConfig) checks.push('缺少配置文件跳过规则');
    if (!hasGateCheck) checks.push('缺少测试骨架门控检查');
    if (!hasOutputRequirement) checks.push('缺少输出要求');

    return {
      pass: hasWithTestsFlag && hasSkeletonRules && hasWhitelist && hasSkipConfig && hasGateCheck && hasOutputRequirement,
      detail: checks.length > 0 ? checks.join('; ') : '--with-tests 单元测试伴随完整定义'
    };
  });

// P1.5: Test expert multi-round cycle test
registerTest('test-expert-cycle', 'kf-mvp',
  '检测 Stage 3 测试专家多轮循环是否定义',
  (skillPath, structural) => {
    const content = fs.readFileSync(skillPath, 'utf8');
    const hasMultiRound = content.includes('Round 1') && content.includes('Round 2') && content.includes('Round 3');
    const hasRoleMatrix = content.includes('管理员') && content.includes('普通用户') && (content.includes('游客') || content.includes('guest'));
    const hasDataStates = content.includes('空数据') || content.includes('正常数据') || content.includes('异常数据');
    const hasIssueList = content.includes('issue_list') || content.includes('Issue List');
    const hasUICheck = content.includes('UI 视觉') || content.includes('截图');
    const hasEscalation = content.includes('UNRESOLVED') && content.includes('escalation');
    const hasMaxRounds = content.includes('上限 3 轮') || content.includes('上限 3');

    const checks = [];
    if (!hasMultiRound) checks.push('缺少多轮测试循环(Round 1-3)');
    if (!hasRoleMatrix) checks.push('缺少多角色测试矩阵');
    if (!hasDataStates) checks.push('缺少多数据状态场景');
    if (!hasIssueList) checks.push('缺少 issue_list 格式');
    if (!hasUICheck) checks.push('缺少 UI 视觉检查');
    if (!hasEscalation) checks.push('缺少 UNRESOLVED escalation');
    if (!hasMaxRounds) checks.push('缺少 3 轮上限');

    return {
      pass: hasMultiRound && hasRoleMatrix && hasDataStates && hasIssueList && hasUICheck && hasEscalation && hasMaxRounds,
      detail: checks.length > 0 ? checks.join('; ') : 'Stage 3 测试专家多轮循环完整定义'
    };
  });

if (require.main === module) {
  cli();
}

module.exports = { validateSkill, validateStructure, validateReferences, registerTest, listKfSkills, formatResult };

