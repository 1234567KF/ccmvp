#!/usr/bin/env node
/**
 * isolation-enforcer.cjs — Claude Code Hook: 多 Agent 写入隔离强制
 *
 * 挂载点: PreToolUse(Write|Edit)
 * 职责:
 *   1. 解析 stdin 获取目标文件路径
 *   2. 从 agent registry / 环境变量判定 Agent 身份
 *   3. 检查文件命名空间是否匹配 Agent 权限
 *   4. 违规则 exit 1 阻止写入
 *
 * 隔离规则（来源: kf-mvp SKILL.md Phase 3 隔离机制 + Phase 5 子Agent契约）:
 *   - 红队 Agent → 只能写 red-* 前缀文件
 *   - 蓝队 Agent → 只能写 blue-* 前缀文件
 *   - 绿队 Agent → 只能写 green-* 前缀文件
 *   - 主 Agent (coordinator) → 可写 docs/、scripts/、公共文件
 *   - 共享输入文档 docs/prd.md、docs/CONTEXT.md → 只读（禁止任何 Agent 写入）
 *   - 子 Agent 禁止跨模块写入
 *
 * 状态存储: .claude-flow/mvp-state/.agent-registry.json
 *
 * 退出码:
 *   0 = 允许写入
 *   1 = 拒绝写入（Claude Code 会临时跳过该调用）
 *   2 = 警告但允许（非阻断）
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const STATE_DIR = path.join(ROOT, '.claude-flow', 'mvp-state');
const AGENT_REGISTRY = path.join(STATE_DIR, '.agent-registry.json');
const CURRENT_PHASE = path.join(STATE_DIR, '.current-phase.json');

// ─── 共享输入文档（任何 Agent 都不可写入） ───
const SHARED_INPUT_DOCS = new Set([
  'docs/prd.md',
  'docs/CONTEXT.md',
]);

// ─── 公共区域（只有主 Agent / coordinator 可写） ───
const SHARED_WRITABLE = new Set([
  'docs/tasks',
  'docs/spec.md',
  'docs/tasks/progress.md',
  'docs/USAGE.md',
  'scripts',
  'prototypes',
]);

// ─── 禁止修改的系统文件 ───
const PROTECTED_PATTERNS = [
  /\.claude-flow\//,
  /\.claude\/(?!helpers\/perf\/)(?!rules\/)/,
  /node_modules\//,
  /\.env$/,
  /\.git\//,
];

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

function relativeToRoot(filePath) {
  const abs = path.resolve(ROOT, filePath);
  return path.relative(ROOT, abs).replace(/\\/g, '/');
}

function readStdinSync(timeoutMs = 3000) {
  if (process.stdin.isTTY) return '';
  try {
    const chunks = [];
    const fd = 0;
    const buf = Buffer.alloc(65536);
    let total = 0;
    const deadline = Date.now() + timeoutMs;
    while (total < buf.length && Date.now() < deadline) {
      try {
        const n = fs.readSync(fd, buf, total, buf.length - total, total);
        if (n === 0) break;
        total += n;
      } catch (e) {
        if (e.code === 'EAGAIN') {
          require('child_process').execSync('sleep 0.05', { stdio: 'ignore' });
          continue;
        }
        break;
      }
    }
    return buf.toString('utf8', 0, total);
  } catch {
    return '';
  }
}

// ─── Agent 身份判定 ────────────────────────────────────────────────

/**
 * 判定当前 Agent 身份。
 * 优先级: 环境变量 > 注册表 > stdin 中的 agent_name
 */
function identifyAgent(hookData) {
  // 1. 环境变量
  const teamColor = process.env.MVP_TEAM_COLOR || process.env.CLAUDE_FLOW_AGENT_TEAM || '';
  const agentName = process.env.MVP_AGENT_NAME || process.env.CLAUDE_FLOW_AGENT_NAME || '';

  // 标准化 team color
  if (teamColor && ['red', 'blue', 'green'].includes(teamColor.toLowerCase())) {
    return {
      team: teamColor.toLowerCase(),
      name: agentName || `${teamColor}-agent`,
      role: 'sub-agent',
      isMain: false,
    };
  }

  // 2. 尝试从注册表匹配
  const registry = readJSON(AGENT_REGISTRY, { agents: {} });
  for (const [name, info] of Object.entries(registry.agents || {})) {
    if (agentName && name === agentName) return { ...info, name, isMain: false };
  }

  // 3. 检查是否为主 Agent（未设置 team color 且不在 registry 中）
  //    主 Agent 的特征：环境变量无 team color，但可能设置 MVP_ROLE=coordinator
  if (process.env.MVP_ROLE === 'coordinator' || process.env.MVP_IS_MAIN === 'true') {
    return {
      team: process.env.MVP_SELECTED_TEAM || 'blue',
      name: 'coordinator',
      role: 'coordinator',
      isMain: true,
    };
  }

  // 4. 默认：主 Agent（无限制）
  return {
    team: 'unknown',
    name: 'unknown',
    role: 'coordinator',
    isMain: true,
  };
}

// ─── 隔离规则检查 ────────────────────────────────────────────────

/**
 * 核心: 检查 Agent 是否有权写入目标文件。
 * @returns {{ allowed: boolean, reason?: string, level: 'allow'|'warn'|'block' }}
 */
function checkWritePermission(agent, filePath) {
  const rel = relativeToRoot(filePath);

  // ── 系统文件保护 ──
  for (const pattern of PROTECTED_PATTERNS) {
    if (pattern.test(rel)) {
      // .claude-flow/perf/* 允许写入（perf tracker 日志）
      if (rel.startsWith('.claude-flow/perf/')) continue;
      // .claude/helpers/perf/* 允许写入
      if (rel.startsWith('.claude/helpers/perf/')) continue;
      // .claude/rules/* 允许主 Agent 写入
      if (rel.startsWith('.claude/rules/') && agent.isMain) continue;
      // .claude/hooks/* 允许主 Agent 写入（Hook 脚本部署）
      if (rel.startsWith('.claude/hooks/') && agent.isMain) continue;
      // .claude/settings.json 允许主 Agent 写入（Hook 配置）
      if (rel === '.claude/settings.json' && agent.isMain) continue;
      return { allowed: false, reason: `系统保护区域: ${rel}`, level: 'block' };
    }
  }

  // ── 共享输入文档保护（任何 Agent 禁止写入） ──
  if (SHARED_INPUT_DOCS.has(rel)) {
    return { allowed: false, reason: `共享输入文档禁止写入: ${rel}`, level: 'block' };
  }

  // ── 主 Agent 可写任何非保护区域 ──
  if (agent.isMain) {
    return { allowed: true, level: 'allow' };
  }

  // ── 子 Agent 隔离规则 ──
  // 规则1: 只能写本队前缀文件
  if (agent.team !== 'unknown') {
    const teamPrefix = `${agent.team}-`;

    // 检查是否匹配本队前缀
    const fileName = path.basename(rel);
    const dirPrefix = rel.split('/')[0];

    if (fileName.startsWith(teamPrefix) || dirPrefix.startsWith(teamPrefix)) {
      return { allowed: true, level: 'allow' };
    }

    // 子 Agent 可以写 src/（Phase 5 编码阶段），但要检查模块范围
    if (rel.startsWith('src/') && agent.allowedModules) {
      const moduleMatch = agent.allowedModules.some(mod => rel.includes(`/${mod}/`) || rel.startsWith(`${mod}/`));
      if (moduleMatch) return { allowed: true, level: 'allow' };
    }

    // 子 Agent 可以写测试文件（本队前缀的测试）
    if (rel.startsWith(`${teamPrefix}05-tests/`)) {
      return { allowed: true, level: 'allow' };
    }

    return {
      allowed: false,
      reason: `Agent "${agent.name}" (${agent.team}) 无权写入 ${rel}。只允许 ${teamPrefix}* 前缀文件。`,
      level: 'block',
    };
  }

  // 未知身份 → 允许但警告
  return { allowed: true, reason: 'Agent 身份未知，放行但建议注册', level: 'warn' };
}

// ─── 主流程 ─────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const isRegisterMode = args.includes('--register-agent');

  const stdinRaw = readStdinSync(3000);
  let hookData = {};
  try {
    if (stdinRaw.trim()) hookData = JSON.parse(stdinRaw);
  } catch { /* ignore parse errors */ }

  // ── 注册模式（SubagentStart） ──
  if (isRegisterMode) {
    const agent = identifyAgent(hookData);
    if (!agent.isMain && agent.name !== 'unknown') {
      const registry = readJSON(AGENT_REGISTRY, { agents: {} });
      registry.agents = registry.agents || {};
      registry.agents[agent.name] = {
        team: agent.team,
        role: agent.role,
        registeredAt: new Date().toISOString(),
        writeCount: 0,
        status: 'running',
      };
      writeJSON(AGENT_REGISTRY, registry);
      console.error(`[isolation-enforcer] Registered agent: ${agent.name} (${agent.team})`);
    }
    process.exit(0);
  }

  // ── 写入检查模式（PreToolUse Write|Edit） ──
  // 提取文件路径
  const toolInput = hookData.tool_input || hookData.toolInput || {};
  const filePath = toolInput.file_path || toolInput.filePath
    || hookData.file_path || hookData.filePath || '';

  if (!filePath) {
    // 没有文件路径 → 无法判断 → 放行（让其他 hook 处理）
    process.exit(0);
  }

  const agent = identifyAgent(hookData);

  // 如果还未注册，自动注册
  if (!agent.isMain && agent.name !== 'unknown') {
    const registry = readJSON(AGENT_REGISTRY, { agents: {} });
    if (!registry.agents[agent.name]) {
      registry.agents[agent.name] = {
        team: agent.team,
        role: agent.role,
        registeredAt: new Date().toISOString(),
        writeCount: 0,
      };
      writeJSON(AGENT_REGISTRY, registry);
    }
  }

  const result = checkWritePermission(agent, filePath);

  if (!result.allowed) {
    console.error(`[isolation-enforcer] BLOCKED: ${result.reason}`);
    // 写入拒绝记录
    try {
      const registry = readJSON(AGENT_REGISTRY, { agents: {}, violations: [] });
      registry.violations = registry.violations || [];
      registry.violations.push({
        time: new Date().toISOString(),
        agent: agent.name,
        team: agent.team,
        file: relativeToRoot(filePath),
        reason: result.reason,
      });
      writeJSON(AGENT_REGISTRY, registry);
    } catch {}
    process.exit(1);
  }

  if (result.level === 'warn') {
    console.error(`[isolation-enforcer] WARN: ${result.reason || ''}`);
  }

  // 记录写入计数
  try {
    const registry = readJSON(AGENT_REGISTRY, { agents: {} });
    if (registry.agents[agent.name]) {
      registry.agents[agent.name].writeCount = (registry.agents[agent.name].writeCount || 0) + 1;
      registry.agents[agent.name].lastWrite = new Date().toISOString();
      registry.agents[agent.name].lastFile = relativeToRoot(filePath);
      writeJSON(AGENT_REGISTRY, registry);
    }
  } catch {}

  process.exit(0);
}

main();
