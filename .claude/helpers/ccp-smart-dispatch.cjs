#!/usr/bin/env node
/**
 * ccp-smart-dispatch.cjs — claude-code-pro 智能调度桥接
 *
 * 在 spawn agent / 阶段切换前注入跳过判断，避免 <3 文件的简单任务浪费
 * 10K-15K token 启动子阶段。
 *
 * 引用: claude-code-pro SKILL.md → {IDE_ROOT}/helpers/ccp-smart-dispatch.cjs
 *
 * 用法:
 *   node ccp-smart-dispatch.cjs should-skip --files 2 --deps simple
 *   node ccp-smart-dispatch.cjs inject-lambda <agent-prompt>
 *   node ccp-smart-dispatch.cjs estimate <file-count> [--deps <simple|complex>]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ─── Lambda-lang 协议前缀 ───
const LAMBDA_PREFIX = [
  '## Λ Protocol (Agent-to-Agent)',
  '可用指令（压缩格式）：',
  '  !ta ct @task <name>       创建/切换任务',
  '  !ta st @status <status>   报告状态 (active|done|blocked|fail)',
  '  !ta q @ask <text>         向主 Agent 提问',
  '  !ta r @result <text>      返回结果',
  '  @v2.0#h                   握手确认',
  '  @ctx <path>               引用上下文文件',
  '  原子指令: a2a/evo/code/swarm/mcp/obs/kv',
  '压缩率: ~3x',
  '---',
].join('\n');

// ─── 核心跳过判断 ───

function shouldSkipStage({ fileCount, hasComplexDependencies, stageName } = {}) {
  const count = parseInt(fileCount, 10) || 0;
  const complex = hasComplexDependencies === true || hasComplexDependencies === 'true';

  // 明确需要子阶段的场景：
  // 1. 测试阶段 → 始终需要子阶段（浏览器自动化等）
  if (stageName === 'testing' || stageName === '3') return false;

  // 2. 安全审查阶段 → 不跳过
  if (stageName === 'security' || stageName === 'review') return false;

  // 跳过条件：文件 < 3 且无复杂依赖
  const skip = count < 3 && !complex;

  return {
    skip,
    reason: skip
      ? `文件数 ${count} < 3 且依赖简单，跳过子阶段（节省 ~15K token）`
      : `需要子阶段：文件数 ${count}，复杂依赖: ${complex}`,
    fileCount: count,
    hasComplexDependencies: complex,
    estimated_savings: skip ? '12K-15K tokens' : '0',
  };
}

// ─── Lambda-lang 协议注入 ───

function injectLambda(agentPrompt) {
  if (!agentPrompt) return LAMBDA_PREFIX;
  // 避免重复注入
  if (agentPrompt.includes('@v2.0#h') || agentPrompt.includes('Λ Protocol')) {
    return agentPrompt;
  }
  return LAMBDA_PREFIX + '\n\n' + agentPrompt;
}

// ─── Token 节省估算 ───

function estimate(fileCount, { deps } = {}) {
  const result = shouldSkipStage({ fileCount, hasComplexDependencies: deps === 'complex' });
  if (!result.skip) return { skip: false, savings: 0 };

  const base = 12000; // baseline: 12K token/sub-stage
  const countPenalty = Math.max(0, fileCount - 1) * 500; // per extra file overhead
  return {
    skip: true,
    saved_tokens: base + countPenalty,
    saved_cost: ((base + countPenalty) * 1.0) / 1_000_000, // Flash ¥1/M tokens
    note: '仅在当前会话直接执行，跳过 spawn agent 开销',
  };
}

// ─── CLI ───

function cli() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`ccp-smart-dispatch.cjs — 智能调度桥接

用法:
  should-skip --files <N> [--deps simple|complex] [--stage <name>]
  inject-lambda "<agent-prompt>"
  estimate <file-count> [--deps simple|complex]

示例:
  node ccp-smart-dispatch.cjs should-skip --files 2 --deps simple
  node ccp-smart-dispatch.cjs inject-lambda "你是前端专家..."
  node ccp-smart-dispatch.cjs estimate 5 --deps complex`);
    process.exit(0);
  }

  function getopt(name, fallback) {
    const idx = args.indexOf(name);
    if (idx === -1) return fallback;
    return args[idx + 1] || fallback;
  }

  const cmd = args[0];

  switch (cmd) {
    case 'should-skip': {
      const result = shouldSkipStage({
        fileCount: parseInt(getopt('--files', '0'), 10),
        hasComplexDependencies: getopt('--deps', 'simple'),
        stageName: getopt('--stage', ''),
      });
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.skip ? 0 : 1);
    }

    case 'inject-lambda': {
      const prompt = args.slice(1).join(' ');
      const injected = injectLambda(prompt);
      console.log(injected);
      process.exit(0);
    }

    case 'estimate': {
      const fc = parseInt(args[1] || '0', 10);
      const deps = getopt('--deps', 'simple');
      console.log(JSON.stringify(estimate(fc, { deps }), null, 2));
      process.exit(0);
    }

    default: {
      console.error(`未知命令: ${cmd}`);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  cli();
}

module.exports = { shouldSkipStage, injectLambda, estimate, LAMBDA_PREFIX };
