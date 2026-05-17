#!/usr/bin/env node
/**
 * phase-tracker.cjs — Claude Code Hook: Phase 切换自动检测 + 上下文优化触发
 *
 * 挂载点: PostToolUse(Write|Edit) + SubagentStop
 * 职责:
 *   1. 检测用户是否向关键产物文件写入内容（暗示 Gate 可能已通过）
 *   2. 扫描当前 Phase 的 Gate 条件是否已全部满足
 *   3. 若满足 → 标记 Gate 通过 → 推进当前 Phase
 *   4. Phase 切换时自动运行 skill-loader --optimize-for <new-phase>
 *   5. 自动记录 perf-tracker auto-log（如果 gate 通过）
 *   6. 更新 .claude-flow/mvp-state/.current-phase.json
 *
 * 设计原则: 轻量快速 — 每次 Write/Edit 后运行，必须 3s 内返回。
 *
 * 退出码:
 *   0 = 正常
 *   2 = Phase 切换已触发（供下游 hook 感知）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const STATE_DIR = path.join(ROOT, '.claude-flow', 'mvp-state');
const CURRENT_PHASE_FILE = path.join(STATE_DIR, '.current-phase.json');
const IDE_ROOT = path.join(ROOT, '.claude');
const SKILL_LOADER = path.join(IDE_ROOT, 'helpers', 'skill-loader.cjs');
const PERF_TRACKER = path.join(IDE_ROOT, 'helpers', 'perf', 'perf-tracker.cjs');

// ─── Phase → Gate → Artifact 映射 ─────────────────────────────────
// 当一个 Gate 的所有关键产物都存在时，认为 Gate 通过
const PHASE_GATE_MAP = {
  'phase-0': {
    gateId: 'gate-0',
    nextPhase: 'phase-1',
    artifacts: ['docs/tech-stack-confirmed.md'],
    fallbackCheck(gateVerifier) {
      // gate-keeper 的 GATE 对象提供的 verify()
      return false;
    },
  },
  'phase-1': {
    gateId: 'gate-1',
    nextPhase: 'phase-2',
    artifacts: ['red-00-alignment.md', 'blue-00-alignment.md', 'green-00-alignment.md'],
  },
  'phase-2': {
    gateId: 'gate-2',
    nextPhase: 'phase-3',
    artifacts: ['docs/prd.md'],
  },
  'phase-3': {
    gateId: 'gate-3',
    nextPhase: 'phase-4',
    artifacts: ['red-spec.md', 'blue-spec.md', 'green-spec.md'],
  },
  'phase-4': {
    gateId: 'gate-4',
    nextPhase: 'phase-4.5',
    artifacts: ['docs/spec.md'],
  },
  'phase-4.5': {
    gateId: 'gate-4.5',
    nextPhase: 'phase-5',
    artifacts: ['docs/tasks/progress.md'],
  },
  'phase-5': {
    gateId: 'gate-5',
    nextPhase: 'phase-6',
    artifacts: [/* 需要物化测试/编译/浏览器报告 */],
    // Special: check for existence of test-report + build-report + browser-report
    specialCheck() {
      const patterns = [
        /-\d{2}-test-report\.md$/,
        /-\d{2}-build-report\.md$/,
        /-\d{2}-browser-report\.md$/,
      ];
      return patterns.every(p => {
        try {
          const entries = fs.readdirSync(ROOT);
          return entries.some(f => p.test(f));
        } catch { return false; }
      });
    },
  },
  'phase-6': {
    gateId: 'gate-6',
    nextPhase: 'phase-7',
    artifacts: ['annotate-validation-report.md'],
  },
  'phase-7': {
    gateId: 'gate-7',
    nextPhase: null,
    artifacts: ['docs/USAGE.md'],
  },
};

// ─── Helpers ───────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback || {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback || {}; }
}

function writeJSON(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function readStdinSync(timeoutMs = 2000) {
  if (process.stdin.isTTY) return '';
  try {
    const buf = Buffer.alloc(32768);
    let total = 0;
    const deadline = Date.now() + timeoutMs;
    while (total < buf.length && Date.now() < deadline) {
      try {
        const n = fs.readSync(0, buf, total, buf.length - total, total);
        if (n === 0) break;
        total += n;
      } catch { break; }
    }
    return buf.toString('utf8', 0, total);
  } catch { return ''; }
}

function relativeToRoot(filePath) {
  return path.relative(ROOT, path.resolve(ROOT, filePath)).replace(/\\/g, '/');
}

function checkGateArtifacts(phaseConfig) {
  if (phaseConfig.specialCheck) {
    return phaseConfig.specialCheck();
  }
  if (!phaseConfig.artifacts || phaseConfig.artifacts.length === 0) return false;
  return phaseConfig.artifacts.every(artifact => {
    const abs = path.join(ROOT, artifact);
    if (fs.existsSync(abs)) return true;
    // 尝试 glob 匹配
    if (artifact.includes('*')) {
      const dir = path.dirname(abs);
      const pattern = new RegExp(path.basename(artifact).replace(/\*/g, '.*'));
      try {
        return fs.readdirSync(dir).some(f => pattern.test(f));
      } catch { return false; }
    }
    return false;
  });
}

function getState() {
  const defaultState = {
    currentPhase: 'phase-0',
    gatePassed: {},
    phaseHistory: [],
    artifactsProduced: [],
    startedAt: null,
    pipelineActive: false,
  };
  return readJSON(CURRENT_PHASE_FILE, defaultState);
}

function saveState(state) {
  ensureDir(STATE_DIR);
  writeJSON(CURRENT_PHASE_FILE, state);
}

/**
 * Advance phase: record, save, trigger skill-loader
 */
function advancePhase(state, fromPhase, toPhase) {
  const now = new Date().toISOString();

  state.currentPhase = toPhase;
  state.phaseHistory = state.phaseHistory || [];
  state.phaseHistory.push({
    from: fromPhase,
    to: toPhase,
    advancedAt: now,
  });

  saveState(state);

  // ── 触发 skill-loader 按需加载 ──
  const currentlyLoaded = state.currentlyLoadedSkills || [];

  console.error(`[phase-tracker] Phase: ${fromPhase} → ${toPhase}`);
  console.error(`[phase-tracker] Running skill-loader --optimize-for ${toPhase}`);

  try {
    const loaderArgs = [
      `"${SKILL_LOADER}"`,
      '--optimize-for', toPhase,
      '--loaded', currentlyLoaded.join(','),
    ];
    const result = execSync(`node ${loaderArgs.join(' ')}`, {
      cwd: ROOT,
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const plan = JSON.parse(result);
    console.error(`[phase-tracker] skill-loader: load=${plan.load?.length || 0}, ` +
      `keep=${plan.keep?.length || 0}, unload=${plan.unload?.length || 0}, ` +
      `saved=${plan.token_report?.saved_tokens || 0}tokens`);

    // 更新当前已加载技能列表
    state.currentlyLoadedSkills = [...(plan.keep || []), ...(plan.load || [])];
    saveState(state);
  } catch (e) {
    console.error(`[phase-tracker] skill-loader failed: ${e.message}`);
  }
}

// ─── 主流程 ─────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const isCompletionCheck = args.includes('--check-completion');

  const stdinRaw = readStdinSync(2000);
  let hookData = {};
  try {
    if (stdinRaw.trim()) hookData = JSON.parse(stdinRaw);
  } catch {}

  const state = getState();

  // 记录 pipeline 激活
  if (process.env.MVP_SESSION_ID && !state.pipelineActive) {
    state.pipelineActive = true;
    state.startedAt = state.startedAt || new Date().toISOString();
    saveState(state);
  }

  if (!state.pipelineActive) {
    process.exit(0);
  }

  // ── 完成检查模式（SubagentStop） ──
  if (isCompletionCheck) {
    // 更新 agent registry 状态
    const agentName = process.env.MVP_AGENT_NAME || process.env.CLAUDE_FLOW_AGENT_NAME || '';
    if (agentName) {
      try {
        const registryPath = path.join(STATE_DIR, '.agent-registry.json');
        const registry = readJSON(registryPath, { agents: {} });
        if (registry.agents?.[agentName]) {
          registry.agents[agentName].status = 'completed';
          registry.agents[agentName].completedAt = new Date().toISOString();
          writeJSON(registryPath, registry);
        }
      } catch {}
    }

    // 检查是否所有 agent 都完成了
    try {
      const registryPath = path.join(STATE_DIR, '.agent-registry.json');
      const registry = readJSON(registryPath, { agents: {} });
      const agents = Object.values(registry.agents || {});
      const allDone = agents.length > 0 && agents.every(a => a.status === 'completed');
      if (allDone) {
        console.error(`[phase-tracker] All ${agents.length} agents completed — scanning for gate advancement`);
        // Fall through to gate check below
      } else {
        process.exit(0); // Not all done yet
      }
    } catch {
      process.exit(0);
    }
  }

  // ── 检测刚写入的文件 ──
  const toolInput = hookData.tool_input || hookData.toolInput || {};
  const writtenFile = toolInput.file_path || toolInput.filePath || '';

  if (writtenFile) {
    const rel = relativeToRoot(writtenFile);

    // 记录产物
    if (!state.artifactsProduced) state.artifactsProduced = [];
    if (!state.artifactsProduced.includes(rel)) {
      state.artifactsProduced.push(rel);
      saveState(state);
    }
  }

  // ── 检查当前 Phase 的 Gate 是否已满足 ──
  const currentPhase = state.currentPhase || 'phase-0';
  const phaseConfig = PHASE_GATE_MAP[currentPhase];

  if (!phaseConfig) {
    process.exit(0);
  }

  const gateId = phaseConfig.gateId;

  // 如果已记录为通过，跳过
  if (state.gatePassed?.[gateId]?.passed) {
    process.exit(0);
  }

  // 检查 Gate 条件
  const gatePassed = checkGateArtifacts(phaseConfig);

  if (gatePassed) {
    // ── 记录 Gate 通过 ──
    state.gatePassed = state.gatePassed || {};
    state.gatePassed[gateId] = {
      passed: true,
      passedAt: new Date().toISOString(),
    };

    console.error(`[phase-tracker] ${gateId} passed ✓`);

    // ── Phase 推进 ──
    if (phaseConfig.nextPhase) {
      advancePhase(state, currentPhase, phaseConfig.nextPhase);
    } else {
      // 最终 Phase，标记完成
      state.completed = true;
      state.completedAt = new Date().toISOString();
      saveState(state);
      console.error(`[phase-tracker] MVP Pipeline complete ✓`);
    }

    // ── 自动记录 perf-tracker（如果可用） ──
    try {
      const phaseLabel = currentPhase.replace('phase-', 'Phase ');
      execSync(
        `node "${PERF_TRACKER}" auto-log --phase ${currentPhase} --role ai --model flash --input 0 --cache 0 --output 0 --summary "${phaseLabel}: ${phaseConfig.gateId} passed"`,
        { cwd: ROOT, timeout: 5000, stdio: 'ignore' }
      );
    } catch {}

    process.exit(2); // 2 = Phase 已切换（下游可感知）
  }

  process.exit(0);
}

main();
