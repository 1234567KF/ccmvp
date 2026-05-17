#!/usr/bin/env node
/**
 * test-cycle-manager.cjs — 测试专家循环管理器 (Phase 1.5)
 *
 * 实现多角色、多权限、多数据状态的测试矩阵构建和 3 轮闭环测试。
 *
 * 用法:
 *   node {IDE_ROOT}/helpers/test-cycle-manager.cjs matrix <team> [--output <path>]
 *   node {IDE_ROOT}/helpers/test-cycle-manager.cjs round <team> <round-N> [--output <path>]
 *   node {IDE_ROOT}/helpers/test-cycle-manager.cjs check <team> [--round N]
 *   node {IDE_ROOT}/helpers/test-cycle-manager.cjs issues <team> [--json]
 *   node {IDE_ROOT}/helpers/test-cycle-manager.cjs fix <team> <round-N> --issues "<file>"
 *   node {IDE_ROOT}/helpers/test-cycle-manager.cjs status <team>
 *
 * 测试矩阵维度:
 *   - 角色: 管理员、普通用户、游客
 *   - 权限: 全部权限、部分权限、无权限
 *   - 数据状态: 空数据、正常数据(临界值)、异常数据(超长/特殊字符)
 *   - 操作路径: Happy Path + Error Path
 *
 * API:
 *   const tcm = require('./test-cycle-manager.cjs');
 *   tcm.buildMatrix() → { scenarios, count }
 *   tcm.startRound({ team, round }) → { scenarios, report }
 *   tcm.checkRound({ team, round }) → { passed, shouldRerun, issues }
 *   tcm.getIssues({ team, round }) → issues[]
 *   tcm.applyFix({ team, round, issueFile }) → { ok, fixes }
 *   tcm.getStatus({ team }) → { round, passed, total }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const TEST_DIR = path.join(ROOT, '.claude-flow', 'test-cycles');
const MAX_ROUNDS = 3;

// ─── Dimension definitions ───
const ROLES = [
  { id: 'admin', label: '管理员', icon: '👑' },
  { id: 'user', label: '普通用户', icon: '👤' },
  { id: 'guest', label: '游客', icon: '👁️' },
];

const PERMISSIONS = [
  { id: 'full', label: '全部权限' },
  { id: 'partial', label: '部分权限' },
  { id: 'none', label: '无权限' },
];

const DATA_STATES = [
  { id: 'empty', label: '空数据', desc: '首次使用，无历史数据' },
  { id: 'normal', label: '正常数据', desc: '临界值数据，刚好达标' },
  { id: 'abnormal', label: '异常数据', desc: '超长/特殊字符/格式错误' },
];

const PATHS = [
  { id: 'happy', label: 'Happy Path', icon: '✅' },
  { id: 'error', label: 'Error Path', icon: '❌' },
];

// ─── Matrix construction ───
function buildMatrix() {
  const scenarios = [];
  let id = 0;

  for (const role of ROLES) {
    for (const perm of PERMISSIONS) {
      for (const data of DATA_STATES) {
        for (const path_ of PATHS) {
          id++;
          scenarios.push({
            id: `TC-${String(id).padStart(3, '0')}`,
            role: role.id,
            role_label: role.label,
            permission: perm.id,
            permission_label: perm.label,
            data_state: data.id,
            data_label: data.label,
            data_desc: data.desc,
            path: path_.id,
            path_label: path_.label,
            description: `${role.label}/${perm.label}/${data.label}/${path_.label}`,
            status: 'pending',
            result: null,
            error: null,
            screenshot: null,
          });
        }
      }
    }
  }

  return { scenarios, count: scenarios.length, dimensions: { roles: ROLES.length, permissions: PERMISSIONS.length, dataStates: DATA_STATES.length, paths: PATHS.length } };
}

// ─── Get team state ───
function getTeamDir(team) {
  return path.join(TEST_DIR, team);
}

function getRoundFile(team, round) {
  return path.join(getTeamDir(team), `round-${round}.json`);
}

function getStateFile(team) {
  return path.join(getTeamDir(team), 'state.json');
}

function ensureTeamDir(team) {
  const dir = getTeamDir(team);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getTeamState(team) {
  const file = getStateFile(team);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function writeTeamState(team, state) {
  ensureTeamDir(team);
  state.last_updated = new Date().toISOString();
  fs.writeFileSync(getStateFile(team), JSON.stringify(state, null, 2), 'utf8');
}

// ─── Start round ───
function startRound({ team, round, outputPath } = {}) {
  if (!team) return { ok: false, error: 'team is required' };

  const currentRound = round || 1;
  const matrix = buildMatrix();

  // Create or update team state
  let state = getTeamState(team);
  if (!state) {
    state = {
      team,
      current_round: currentRound,
      completed_rounds: [],
      total_scenarios: matrix.count,
      passed_scenarios: 0,
      failed_scenarios: 0,
      p0_issues: [],
      p1_issues: [],
      started_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      round_history: [],
    };
  }

  state.current_round = currentRound;
  state.last_updated = new Date().toISOString();

  // Write round scenarios
  const roundData = {
    team,
    round: currentRound,
    max_rounds: MAX_ROUNDS,
    total: matrix.count,
    scenarios: matrix.scenarios,
    started_at: new Date().toISOString(),
    dimensions: matrix.dimensions,
    status: 'in_progress',
    issues: [],
    summary: {
      passed: 0,
      failed: 0,
      pending: matrix.count,
      blocked: 0,
    },
  };

  // Ensure directory exists
  ensureTeamDir(team);
  const roundFile = getRoundFile(team, currentRound);
  fs.writeFileSync(roundFile, JSON.stringify(roundData, null, 2), 'utf8');
  writeTeamState(team, state);

  // Write matrix output
  if (outputPath) {
    const matrixMarkdown = `# ${team === 'red' ? '红队' : team === 'blue' ? '蓝队' : '绿队'} 测试矩阵 (Round ${currentRound}/${MAX_ROUNDS})

## 维度
| 维度 | 取值数 | 取值 |
|------|--------|------|
| 角色 | ${ROLES.length} | ${ROLES.map(r => r.label).join(', ')} |
| 权限 | ${PERMISSIONS.length} | ${PERMISSIONS.map(p => p.label).join(', ')} |
| 数据状态 | ${DATA_STATES.length} | ${DATA_STATES.map(d => d.label).join(', ')} |
| 操作路径 | ${PATHS.length} | ${PATHS.map(p => p.label).join(', ')} |

## 测试场景 (${matrix.count} 个)

| ID | 角色 | 权限 | 数据 | 路径 | 描述 | 状态 |
|----|------|------|------|------|------|------|
${matrix.scenarios.map(s => `| ${s.id} | ${s.role_label} | ${s.permission_label} | ${s.data_label} | ${s.path_label} | ${s.description} | ⏳ |`).join('\n')}

## 覆盖要求
- 至少 3×3×2 = 18 个组合场景（核心组合）
- 全矩阵: ${matrix.count} 个组合
- Happy Path + Error Path 各占 50%
`;
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, matrixMarkdown, 'utf8');
  }

  return {
    ok: true,
    team,
    round: currentRound,
    total: matrix.count,
    scenarios: matrix.scenarios,
    dimensions: matrix.dimensions,
    round_file: roundFile,
  };
}

// ─── Check round ───
function checkRound({ team, round } = {}) {
  if (!team) return { ok: false, error: 'team is required' };

  const currentRound = round || 1;
  const roundFile = getRoundFile(team, currentRound);

  if (!fs.existsSync(roundFile)) {
    return { ok: false, error: `Round ${currentRound} data not found for team ${team}. Use start-round first.` };
  }

  const roundData = JSON.parse(fs.readFileSync(roundFile, 'utf8'));
  const state = getTeamState(team) || {};

  const p0Issues = roundData.issues.filter(i => i.severity === 'P0');
  const p1Issues = roundData.issues.filter(i => i.severity === 'P1');
  const p2Issues = roundData.issues.filter(i => i.severity === 'P2');

  const allPassed = p0Issues.length === 0;
  const majorIssues = p0Issues.length > 0 || p1Issues.length > 3;
  const atMaxRounds = currentRound >= MAX_ROUNDS;
  const shouldRerun = majorIssues && !atMaxRounds;

  // Update state
  state.p0_issues = p0Issues;
  state.p1_issues = p1Issues;
  state.current_round = currentRound;

  if (!state.round_history) state.round_history = [];
  state.round_history.push({
    round: currentRound,
    p0: p0Issues.length,
    p1: p1Issues.length,
    passed: allPassed,
    checked_at: new Date().toISOString(),
  });

  writeTeamState(team, state);

  return {
    ok: true,
    team,
    round: currentRound,
    passed: allPassed,
    should_rerun: shouldRerun,
    at_max_rounds: atMaxRounds,
    passed_scenarios: roundData.summary.passed,
    failed_scenarios: roundData.summary.failed,
    pending_scenarios: roundData.summary.pending,
    total_scenarios: roundData.total,
    issues: {
      p0: p0Issues.length,
      p1: p1Issues.length,
      p2: p2Issues.length,
      total: roundData.issues.length,
    },
    p0_issues: p0Issues,
    p1_issues: p1Issues,
  };
}

// ─── Get issues ───
function getIssues({ team, round, asJson } = {}) {
  const currentRound = round || 1;
  const roundFile = getRoundFile(team, currentRound);

  if (!fs.existsSync(roundFile)) {
    return { ok: false, error: `Round ${currentRound} data not found for team ${team}` };
  }

  const roundData = JSON.parse(fs.readFileSync(roundFile, 'utf8'));
  const issues = roundData.issues || [];

  // Group by severity
  const bySeverity = {};
  for (const iss of issues) {
    const sev = iss.severity || 'P3';
    if (!bySeverity[sev]) bySeverity[sev] = [];
    bySeverity[sev].push(iss);
  }

  return {
    ok: true,
    team,
    round: currentRound,
    total: issues.length,
    by_severity: bySeverity,
    issues,
    json: asJson ? JSON.stringify(issues, null, 2) : null,
  };
}

// ─── Apply fix and record ───
function applyFix({ team, round, issueFile } = {}) {
  if (!team || !issueFile) return { ok: false, error: 'team and issueFile are required' };
  if (!fs.existsSync(issueFile)) return { ok: false, error: `Issue file not found: ${issueFile}` };

  const currentRound = round || 1;
  const roundFile = getRoundFile(team, currentRound);
  if (!fs.existsSync(roundFile)) return { ok: false, error: `Round ${currentRound} data not found for team ${team}` };

  const issues = JSON.parse(fs.readFileSync(issueFile, 'utf8'));
  const issuesList = Array.isArray(issues) ? issues : (issues.issues || [issues]);

  // Record each P0/P1 as fix protocol
  const fixed = [];
  for (const iss of issuesList) {
    if (iss.severity === 'P0' || iss.severity === 'P1') {
      // fix-record: 记录在 .claude-flow/mvp-state/（原 hammer-bridge 功能已移除，直接跳过）
      fixed.push(iss);
    }
  }

  // Update round data
  const roundData = JSON.parse(fs.readFileSync(roundFile, 'utf8'));
  roundData.fix_applied = true;
  roundData.fix_recorded = fixed.length;
  roundData.fixed_issues = fixed.map(i => i.id || i.desc);
  fs.writeFileSync(roundFile, JSON.stringify(roundData, null, 2), 'utf8');

  return {
    ok: true,
    team,
    round: currentRound,
    fixes_applied: fixed.length,
    fixed,
  };
}

// ─── Update scenario result ───
function updateScenario({ team, round, scenarioId, status, error, screenshot } = {}) {
  if (!team || !scenarioId) return { ok: false, error: 'team and scenarioId are required' };

  const currentRound = round || 1;
  const roundFile = getRoundFile(team, currentRound);
  if (!fs.existsSync(roundFile)) return { ok: false, error: `Round ${currentRound} data not found for team ${team}` };

  const roundData = JSON.parse(fs.readFileSync(roundFile, 'utf8'));
  const scenario = roundData.scenarios.find(s => s.id === scenarioId);
  if (!scenario) return { ok: false, error: `Scenario ${scenarioId} not found` };

  scenario.status = status || 'completed';
  scenario.result = status === 'passed' ? 'passed' : (status === 'failed' ? 'failed' : null);
  scenario.error = error || null;
  scenario.screenshot = screenshot || null;
  scenario.completed_at = new Date().toISOString();

  // Update summary
  const summary = roundData.summary;
  summary.pending = roundData.scenarios.filter(s => s.status === 'pending').length;
  summary.passed = roundData.scenarios.filter(s => s.result === 'passed').length;
  summary.failed = roundData.scenarios.filter(s => s.result === 'failed').length;
  summary.blocked = roundData.scenarios.filter(s => s.status === 'blocked').length;

  // Add issue if failed
  if (status === 'failed' && error) {
    roundData.issues = roundData.issues || [];
    roundData.issues.push({
      id: `ISSUE-${roundData.issues.length + 1}`,
      scenario_id: scenarioId,
      description: `${scenario.description}: ${error}`,
      severity: 'P2', // Default, can be escalated
      team,
      round: currentRound,
      timestamp: new Date().toISOString(),
    });
  }

  roundData.status = summary.pending > 0 ? 'in_progress' : (summary.failed > 0 ? 'completed_with_failures' : 'completed');
  fs.writeFileSync(roundFile, JSON.stringify(roundData, null, 2), 'utf8');

  return { ok: true, scenario: scenario, summary };
}

// ─── Add issue ───
function addIssue({ team, round, scenarioId, severity, description, rootCause, fix } = {}) {
  if (!team || !description) return { ok: false, error: 'team and description are required' };

  const currentRound = round || 1;
  const roundFile = getRoundFile(team, currentRound);
  if (!fs.existsSync(roundFile)) return { ok: false, error: `Round ${currentRound} data not found` };

  const roundData = JSON.parse(fs.readFileSync(roundFile, 'utf8'));
  roundData.issues = roundData.issues || [];

  const issue = {
    id: `ISSUE-${roundData.issues.length + 1}`,
    scenario_id: scenarioId || 'N/A',
    severity: severity || 'P2',
    desc: description,
    root_cause: rootCause || null,
    fix: fix || null,
    team,
    round: currentRound,
    timestamp: new Date().toISOString(),
  };

  roundData.issues.push(issue);
  fs.writeFileSync(roundFile, JSON.stringify(roundData, null, 2), 'utf8');

  return { ok: true, issue };
}

// ─── Get team test status ───
function getTestStatus({ team } = {}) {
  if (!team) return { ok: false, error: 'team is required' };

  const state = getTeamState(team);
  if (!state) return { ok: true, team, active: false, message: `No test cycle for team ${team}` };

  const rounds = [];
  for (let r = 1; r <= MAX_ROUNDS; r++) {
    const file = getRoundFile(team, r);
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        rounds.push({
          round: r,
          status: data.status,
          total: data.total,
          passed: data.summary.passed,
          failed: data.summary.failed,
          pending: data.summary.pending,
          issue_count: (data.issues || []).length,
        });
      } catch {}
    }
  }

  return {
    ok: true,
    team,
    active: true,
    current_round: state.current_round,
    rounds,
    total_issues: (state.p0_issues?.length || 0) + (state.p1_issues?.length || 0),
    p0_count: state.p0_issues?.length || 0,
    p1_count: state.p1_issues?.length || 0,
    started_at: state.started_at,
  };
}

// ─── CLI ───
function cli() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('test-cycle-manager.cjs — 测试专家循环管理器 (Phase 1.5)');
    console.log('');
    console.log('命令:');
    console.log('  matrix <team> [--output <path>]   构建测试矩阵');
    console.log('  round <team> <N> [--output <path>] 开始第 N 轮测试');
    console.log('  check <team> [--round N]           检查测试结果');
    console.log('  issues <team> [--round N] [--json]  获取问题列表');
    console.log('  fix <team> <N> --issues <file>     记录修复');
    console.log('  pass <team> <round> <tc-id>         标记用例通过');
    console.log('  fail <team> <round> <tc-id> --error 标记用例失败');
    console.log('  add-issue <team> ...                添加问题');
    console.log('  status <team>                       查看测试状态');
    process.exit(0);
  }

  const cmd = args[0];
  const rest = args.slice(1);

  function getopt(name, fallback) {
    const idx = rest.indexOf(name);
    return idx !== -1 && rest[idx + 1] ? rest[idx + 1] : fallback;
  }

  function hasopt(name) {
    return rest.includes(name);
  }

  try {
    switch (cmd) {
      case 'matrix':
      case 'm': {
        const team = rest[0];
        if (!team) { console.error('Usage: test-cycle-manager.cjs matrix <team> [--output <path>]'); process.exit(1); }
        const result = startRound({ team, round: 0, outputPath: getopt('--output') });
        console.log(JSON.stringify({ ok: true, dimensions: result.dimensions, total: result.total }, null, 2));
        process.exit(0);
      }

      case 'round':
      case 'r': {
        const team = rest[0];
        const round = parseInt(rest[1], 10);
        if (!team || isNaN(round)) { console.error('Usage: test-cycle-manager.cjs round <team> <N> [--output <path>]'); process.exit(1); }
        const result = startRound({ team, round, outputPath: getopt('--output') });
        console.log(JSON.stringify({ ok: true, team, round: result.round, total: result.total }, null, 2));
        process.exit(0);
      }

      case 'check':
      case 'c': {
        const team = rest[0];
        if (!team) { console.error('Usage: test-cycle-manager.cjs check <team> [--round N]'); process.exit(1); }
        const result = checkRound({ team, round: parseInt(getopt('--round', '1')) });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.passed ? 0 : (result.should_rerun ? 2 : 3));
      }

      case 'issues':
      case 'i': {
        const team = rest[0];
        if (!team) { console.error('Usage: test-cycle-manager.cjs issues <team> [--round N] [--json]'); process.exit(1); }
        const result = getIssues({ team, round: parseInt(getopt('--round', '1')), asJson: hasopt('--json') });
        if (hasopt('--json')) console.log(result.json);
        else console.log(JSON.stringify({ ok: true, total: result.total, by_severity: result.by_severity }, null, 2));
        process.exit(0);
      }

      case 'fix':
      case 'f': {
        const team = rest[0];
        const round = parseInt(rest[1], 10);
        const issueFile = getopt('--issues');
        if (!team || isNaN(round) || !issueFile) { console.error('Usage: test-cycle-manager.cjs fix <team> <N> --issues <file>'); process.exit(1); }
        const result = applyFix({ team, round, issueFile });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.ok ? 0 : 1);
      }

      case 'pass': {
        const team = rest[0];
        const round = parseInt(rest[1], 10);
        const tcId = rest[2];
        if (!team || isNaN(round) || !tcId) { console.error('Usage: test-cycle-manager.cjs pass <team> <round> <tc-id>'); process.exit(1); }
        const result = updateScenario({ team, round, scenarioId: tcId, status: 'passed' });
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      }

      case 'fail': {
        const team = rest[0];
        const round = parseInt(rest[1], 10);
        const tcId = rest[2];
        const error = getopt('--error', 'Unknown failure');
        if (!team || isNaN(round) || !tcId) { console.error('Usage: test-cycle-manager.cjs fail <team> <round> <tc-id> --error <reason>'); process.exit(1); }
        const result = updateScenario({ team, round, scenarioId: tcId, status: 'failed', error });
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      }

      case 'add-issue':
      case 'ai': {
        const team = rest[0];
        const severity = getopt('--severity', 'P2');
        const desc = getopt('--desc', getopt('-d', ''));
        const rootCause = getopt('--root-cause', getopt('--root', ''));
        const fix = getopt('--fix', getopt('-f', ''));
        const round = parseInt(getopt('--round', '1'));
        if (!team || !desc) { console.error('Usage: test-cycle-manager.cjs add-issue <team> --desc <description> [--severity P0|P1|P2] [--root-cause <text>] [--fix <text>] [--round N]'); process.exit(1); }
        const result = addIssue({ team, round, severity, description: desc, rootCause, fix });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.ok ? 0 : 1);
      }

      case 'status':
      case 's': {
        const team = rest[0];
        if (!team) { console.error('Usage: test-cycle-manager.cjs status <team>'); process.exit(1); }
        const result = getTestStatus({ team });
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      }

      default: {
        console.error(`Unknown command: ${cmd}`);
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

module.exports = {
  buildMatrix,
  startRound,
  checkRound,
  getIssues,
  applyFix,
  updateScenario,
  addIssue,
  getTestStatus,
  ROLES,
  PERMISSIONS,
  DATA_STATES,
  PATHS,
  MAX_ROUNDS,
};

