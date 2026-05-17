/**
 * skill-router.cjs — 技能路由表生成 + 门控验证 + 任务类型检测
 *
 * 用法:
 *   node {IDE_ROOT}/helpers/skill-router.cjs --inject --stage 1 --role "前端专家"
 *   node {IDE_ROOT}/helpers/skill-router.cjs --verify --stage 1 --team red --dir ./
 *   node {IDE_ROOT}/helpers/skill-router.cjs --list --stage 1 --role "后端专家"
 *   node {IDE_ROOT}/helpers/skill-router.cjs detect-task --task "<描述>"
 *   node {IDE_ROOT}/helpers/skill-router.cjs detect-task --task "<描述>" --verbose
 */

const fs = require('fs');
const path = require('path');

// 复用 work-estimator.cjs 的复杂度分析逻辑
let workEstimator = null;
try {
  workEstimator = require('./work-estimator.cjs');
} catch (e) {
  // work-estimator 不存在时降级运行
}

const STAGE_MAP_PATH = path.resolve(__dirname, 'stage-skill-map.json');
const REGISTRY_PATH = path.resolve(__dirname, '..', 'skill-registry.json');

// ─── Cache ──────────────────────────────────────────────────────────

let _stageMap = null;
let _registry = null;

function loadStageMap() {
  if (_stageMap) return _stageMap;
  if (!fs.existsSync(STAGE_MAP_PATH)) return null;
  _stageMap = JSON.parse(fs.readFileSync(STAGE_MAP_PATH, 'utf-8'));
  return _stageMap;
}

function loadRegistry() {
  if (_registry) return _registry;
  if (!fs.existsSync(REGISTRY_PATH)) return null;
  _registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  return _registry;
}

// ─── Core: get skills for a stage ─────────────────────────────────────

function getSkillsForStage({ stage, agentRole }) {
  const stageMap = loadStageMap();
  if (!stageMap) return { error: 'stage-skill-map.json not found' };

  const stageDef = stageMap.stages[String(stage)];
  if (!stageDef) return { error: `Stage ${stage} not defined` };

  const required = [...(stageDef.required || [])];
  const recommended = [...(stageDef.recommended || [])];
  const contextual = [...(stageDef.contextual || [])];
  const alwaysOn = [...(stageMap.always_on_skills?.skills || [])];
  const globalSkills = [...(stageMap.global_skills?.skills || [])];

  // Add role-specific agent skills
  const roleSkills = [];
  if (agentRole && stageDef.agent_skills) {
    for (const [role, skills] of Object.entries(stageDef.agent_skills)) {
      if (role === agentRole) {
        roleSkills.push(...skills);
      }
    }
  }

  return {
    required,
    recommended,
    contextual,
    role_skills: roleSkills,
    always_on: alwaysOn,
    global: globalSkills,
    all: [...new Set([...required, ...recommended, ...contextual, ...roleSkills, ...alwaysOn, ...globalSkills])],
  };
}

// ─── Inject: generate routing table for agent prompt ─────────────────

function generateRoutingTable({ stage, agentRole }) {
  const result = getSkillsForStage({ stage, agentRole });
  if (result.error) return `<!--\n  ⚠ ${result.error}\n-->`;

  const stageDef = loadStageMap().stages[String(stage)];
  const stageName = stageDef?.name || `Stage ${stage}`;
  const registry = loadRegistry();
  const nameMap = {};
  if (registry) {
    registry.entries.forEach(e => { nameMap[e.name] = e; });
  }

  // Build rows: [severity, name, triggers, description]
  const rows = [];

  function pushSkill(name, priority) {
    const entry = nameMap[name];
    if (!entry) {
      rows.push({ priority, name, triggers: '', desc: '' });
      return;
    }
    const triggerText = entry.triggers?.length > 0
      ? entry.triggers.slice(0, 3).join(', ')
      : '';
    const shortDesc = entry.description_short?.length > 50
      ? entry.description_short.slice(0, 47) + '...'
      : (entry.description_short || '');
    rows.push({ priority, name, triggers: triggerText, desc: shortDesc });
  }

  // Priority: P0 required, P1 recommended, then contextual, role_skills
  for (const name of (result.required || [])) pushSkill(name, '🔴 P0');
  for (const name of (result.recommended || [])) pushSkill(name, '🟡 P1');
  for (const name of (result.contextual || [])) pushSkill(name, '🟢 —');
  for (const name of (result.role_skills || [])) pushSkill(name, '🔵');

  if (rows.length === 0) return `<!-- Stage ${stage}: 无可用技能 -->`;

  // Format as markdown table
  let lines = [`## 技能路由指引 — ${stageName}`, '', '| 优先级 | 技能 | 触发词 | 用途 |', '|--------|------|--------|------|'];
  for (const r of rows) {
    const name = r.name;
    const triggers = r.triggers || '—';
    const desc = r.desc || '—';
    lines.push(`| ${r.priority} | \`${name}\` | ${triggers} | ${desc} |`);
  }
  lines.push('', '**使用**: 输出中引用技能名即可（如 "用 kf-web-search 搜索方案"）', '');

  return lines.join('\n');
}

// ─── Verify: gate check after stage completion ───────────────────────

function verifySkillUsage({ stage, team, outputDir }) {
  const result = getSkillsForStage({ stage });
  if (result.error) return { passed: false, issues: [result.error] };

  const issues = [];
  const passEntries = [];

  // Collect all output files in the directory
  let files = [];
  if (outputDir && fs.existsSync(outputDir)) {
    try {
      files = fs.readdirSync(outputDir)
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(outputDir, f));
    } catch (e) {
      issues.push(`Cannot read output dir: ${e.message}`);
    }
  }

  if (files.length === 0) {
    issues.push('No output files found for gate verification');
  }

  // Scan output files for skill usage by P0 priority
  const allText = files.map(f => {
    try { return fs.readFileSync(f, 'utf-8'); }
    catch { return ''; }
  }).join('\n');

  const registry = loadRegistry();
  const nameMap = {};
  if (registry) {
    registry.entries.forEach(e => { nameMap[e.name] = e; });
  }

  // Check P0 skills
  for (const name of (result.required || [])) {
    const entry = nameMap[name];
    const patterns = [name, ...(entry?.triggers || [])].filter(Boolean);
    const found = patterns.some(p => allText.includes(p));
    if (found) {
      passEntries.push({ name, status: 'pass', severity: 'P0' });
    } else {
      issues.push(`P0 技能未使用: ${name} — 输出中未找到技能名或触发词`);
    }
  }

  // Check P1 recommended (warn only)
  for (const name of (result.recommended || [])) {
    const entry = nameMap[name];
    const patterns = [name, ...(entry?.triggers || [])].filter(Boolean);
    const found = patterns.some(p => allText.includes(p));
    if (found) {
      passEntries.push({ name, status: 'pass', severity: 'P1' });
    } else {
      passEntries.push({ name, status: 'warn', severity: 'P1' });
    }
  }

  return {
    passed: issues.length === 0,
    stage,
    team: team || 'unknown',
    total_files: files.length,
    required_p0: (result.required || []).length,
    recommended_p1: (result.recommended || []).length,
    checked_entries: passEntries,
    issues: issues.length > 0 ? issues : undefined,
  };
}

// ─── Task Type Detection ────────────────────────────────────────────

/**
 * KEYWORD_RULES（从 work-estimator.cjs 同步精简版）
 * 用于无 work-estimator 时的降级关键词匹配。
 */
const TASK_TYPE_RULES = [
  // 原型/快速验证信号
  { regex: /原型|MVP|mvp|demo|快速验证|演示|原型生成|prototype/i, type: '原型生成', weight: 3 },
  { regex: /极简|最小|快速|简单.*原型/i, type: '原型生成', weight: 2 },
  // 文档/方案/评审信号
  { regex: /文档|方案.*评审|设计.*文档|README|使用说明|手册|guide|api.*文档/i, type: '文档生成', weight: 3 },
  { regex: /评审|审查|review|评估方案|方案对比|技术选型/i, type: '方案评审', weight: 3 },
  // 编码开发信号
  { regex: /接口|API|数据表|表结构|数据库|路由|功能.*实现|开发|编码|实现/i, type: '编码开发', weight: 1 },
];

/**
 * 检测任务类型，返回路由建议。
 * 复用 work-estimator.cjs 的 analyzeTask() 进行复杂度分析，
 * 结合关键词匹配输出任务类型和推荐技能。
 *
 * @param {string} taskDesc - 任务描述
 * @param {object} [options]
 * @param {boolean} [options.verbose=false] - 输出详细分析
 * @returns {{ taskType: string, recommendedSkill: string, confidence: string, signals?: object }}
 */
function detectTaskType(taskDesc, options = {}) {
  const verbose = options.verbose || false;
  if (!taskDesc || taskDesc.trim().length === 0) {
    return { taskType: '原型生成', recommendedSkill: 'kf-mvp', confidence: 'unknown', reason: '空输入，默认路由到 MVP' };
  }

  const result = { taskType: '原型生成', recommendedSkill: 'kf-mvp', confidence: 'medium' };

  // ─── Step 1: 关键词类型投票 ───
  const votes = { '编码开发': 0, '原型生成': 0, '文档生成': 0, '方案评审': 0 };
  for (const rule of TASK_TYPE_RULES) {
    const matches = taskDesc.match(new RegExp(rule.regex.source, 'gi'));
    if (matches) {
      votes[rule.type] = (votes[rule.type] || 0) + matches.length * rule.weight;
    }
  }

  // ─── Step 2: 复用 work-estimator 的复杂度分析 ───
  let signals = null;
  let complexityMultiplier = 1.0;
  let scaleSum = 0;

  if (workEstimator && typeof workEstimator.analyzeTask === 'function') {
    signals = workEstimator.analyzeTask(taskDesc);
    complexityMultiplier = signals.complexityMultiplier || 1.0;
    scaleSum = (signals.apiCount || 0) + (signals.tableCount || 0) + (signals.pageCount || 0);

    // 复杂度加成：复杂任务强化编码开发票数
    if (complexityMultiplier >= 1.3 || scaleSum > 6) {
      votes['编码开发'] += 2;
    }
    // 简单/CRUD 任务：加分原型生成
    if (complexityMultiplier <= 0.6 && scaleSum <= 4) {
      votes['原型生成'] += 2;
    }
  }

  // ─── Step 3: 取最高票类型 ───
  const maxVotes = Math.max(...Object.values(votes));
  const topTypes = Object.entries(votes).filter(([, v]) => v === maxVotes);

  if (topTypes.length === 1) {
    result.taskType = topTypes[0][0];
  } else {
    // 平票时按优先级：原型生成 > 方案评审 > 编码开发 > 文档生成
    const priority = ['原型生成', '方案评审', '编码开发', '文档生成'];
    for (const t of priority) {
      if (votes[t] === maxVotes) {
        result.taskType = t;
        break;
      }
    }
  }

  // ─── Step 4: 映射到推荐技能 ───
  const skillMap = {
    '编码开发': 'kf-mvp',
    '原型生成': 'kf-mvp',
    '文档生成': 'kf-sdd',
    '方案评审': 'kf-mvp',
  };
  result.recommendedSkill = skillMap[result.taskType] || 'kf-mvp';

  // ─── Step 5: 置信度 ───
  if (maxVotes >= 6) result.confidence = 'high';
  else if (maxVotes >= 3) result.confidence = 'medium';
  else result.confidence = 'low';

  // ─── 附加详细分析（verbose 模式） ───
  if (verbose) {
    result.signals = signals || null;
    result.votes = votes;
    result.topTypes = topTypes;
  }

  return result;
}

// ─── CLI ─────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--inject')) {
    const stageIdx = args.indexOf('--stage');
    const roleIdx = args.indexOf('--role');
    const stage = stageIdx >= 0 ? args[stageIdx + 1] : '1';
    const role = roleIdx >= 0 ? args[roleIdx + 1] : '';

    console.log(generateRoutingTable({ stage, agentRole: role }));
    return;
  }

  if (args.includes('--verify')) {
    const stage = args[args.indexOf('--stage') + 1] || '1';
    const team = args[args.indexOf('--team') + 1] || 'unknown';
    const dir = args[args.indexOf('--dir') + 1] || '.';

    const result = verifySkillUsage({ stage, team, outputDir: dir });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.passed ? 0 : 1);
  }

  if (args.includes('--list')) {
    const stage = args[args.indexOf('--stage') + 1] || '1';
    const role = args[args.indexOf('--role') + 1] || '';

    const result = getSkillsForStage({ stage, agentRole: role });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // --- detect-task ---
  if (args[0] === 'detect-task') {
    const taskIdx = args.indexOf('--task');
    const verbose = args.includes('--verbose');
    const taskDesc = taskIdx >= 0 ? args.slice(taskIdx + 1).join(' ') : args.slice(1).join(' ');

    const result = detectTaskType(taskDesc, { verbose });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Default: print usage
  console.log(`skill-router.cjs — 技能路由表生成 + 门控验证 + 任务类型检测

用法:
  --inject --stage <N> --role "<角色>"           生成路由表（注入 agent prompt）
  --verify --stage <N> --team <name> --dir <path>  门控检查
  --list   --stage <N> --role "<角色>"           列出阶段可用技能
  detect-task --task "<描述>" [--verbose]        检测任务类型，输出路由建议

示例:
  node {IDE_ROOT}/helpers/skill-router.cjs --inject --stage 1 --role "前端专家"
  node {IDE_ROOT}/helpers/skill-router.cjs --verify --stage 1 --team default --dir .
  node {IDE_ROOT}/helpers/skill-router.cjs --list --stage 2 --role "后端专家"
  node {IDE_ROOT}/helpers/skill-router.cjs detect-task --task "写一个电商MVP原型"
  node {IDE_ROOT}/helpers/skill-router.cjs detect-task --task "实现支付网关重构" --verbose`);
}

// Run if called directly
if (require.main === module) {
  main();
}

// ─── Exports ─────────────────────────────────────────────────────────

module.exports = { generateRoutingTable, verifySkillUsage, getSkillsForStage, detectTaskType };

