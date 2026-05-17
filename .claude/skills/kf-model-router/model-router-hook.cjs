#!/usr/bin/env node
/**
 * smart-router-hook.cjs — kf-model-router PreToolUse Hook
 *
 * 在技能调用时注入智能路由决策。
 * 配合 kf-model-router 使用（优先级更高）。
 *
 * 注册到 settings.json 的 PreToolUse Skill matcher:
 *   {
 *     "matcher": "Skill",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "node {IDE_ROOT}/skills/kf-model-router/smart-router-hook.cjs",
 *       "timeout": 5000
 *     }]
 *   }
 *
 * 输出格式（stderr -> 日志, stdout -> 路由指令）：
 *   stderr: [kf-model-router] 调试/状态信息
 *   stdout: [smart-router] 路由指令 → 模型可见
 */

const path = require('path');
const fs = require('fs');

const SKILLS_DIR = path.resolve(__dirname, '..');

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { metadata: {} };
  const yaml = match[1];
  const result = { metadata: {} };
  let meta = {};

  for (const line of yaml.split('\n')) {
    const metaKeyMatch = line.match(/^metadata:\s*$/);
    if (metaKeyMatch) continue;

    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kvMatch && !line.startsWith(' ')) {
      const key = kvMatch[1];
      const val = kvMatch[2].trim();
      result[key] = val || '';
      continue;
    }

    const metaKvMatch = line.match(/^\s{2}(\w[\w-]*):\s*(.*)/);
    if (metaKvMatch) {
      const key = metaKvMatch[1];
      const val = metaKvMatch[2].trim();
      meta[key] = val || '';
    }
  }

  result.metadata = meta;
  return result;
}

function getSkillName() {
  // 1. 命令行参数
  const idx = process.argv.indexOf('--skill');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];

  // 2. 环境变量（Claude Code 格式）
  const env = process.env.CLAUDE_TOOL_USE_REQUEST ||
              process.env.CLAUDE_EXTRA_CONTEXT;
  if (env) {
    try {
      const p = JSON.parse(env);
      const s = p?.skill || p?.args?.skill || p?.arguments?.skill;
      if (s) return s;
    } catch {}
  }

  // 3. stdin（Qoder PreToolUse hook 格式 or Claude Code 格式）
  try {
    const buf = fs.readFileSync(0, 'utf-8').trim();
    if (buf) {
      const p = JSON.parse(buf);
      // Qoder format: { tool_name: "Skill", tool_input: { skill: "kf-xxx" } }
      if (p?.tool_input?.skill) return p.tool_input.skill;
      // Claude Code format: { skill: "kf-xxx" } or { args: { skill: "kf-xxx" } }
      return p?.skill || p?.args?.skill || null;
    }
  } catch {}

  return null;
}

function main() {
  const skillName = getSkillName();
  if (!skillName) {
    process.exit(0);
  }

  const mdPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!fs.existsSync(mdPath)) {
    process.exit(0);
  }

  const content = fs.readFileSync(mdPath, 'utf-8');
  const fm = parseFrontmatter(content);
  const meta = fm.metadata || {};

  const integrated = (meta['integrated-skills'] || fm['integrated-skills'] || '');
  const recommended = (meta['recommended_model'] || fm['recommended_model'] || '');
  const hasSmartRouter = integrated.includes('kf-model-router');

  // 检测技能类型 → 推荐模型
  let smartRecommendation = null;

  const skillTypeMap = {
    'kf-spec': 'pro',           // spec 需要深度推理
    'kf-alignment': 'pro',      // 对齐需要深度理解
    'kf-mvp': 'pro', // MVP Pipeline 需要深度推理
    'kf-code-review-graph': 'flash',
    'kf-web-search': 'flash',
    'kf-browser-ops': 'flash',
    'kf-scrapling': 'flash',
    'kf-opencli': 'flash',
    'kf-prd-generator': 'flash',
    'kf-image-editor': 'flash',
    'kf-brainstorm': 'pro',
    'kf-reverse-spec': 'pro',
    'kf-grant-research': 'pro',
    'kf-langextract': 'flash',
    'kf-exa-code': 'flash',
    'kf-token-tracker': 'flash',
    'kf-doc-consistency': 'flash',
    'kf-add-skill': 'flash',
    'kf-go': 'flash',
    'kf-kb-envoy': 'flash',
  };

  if (hasSmartRouter || recommended || skillTypeMap[skillName]) {
    smartRecommendation = skillTypeMap[skillName] || null;

    console.error(
      `[kf-model-router] skill=${skillName} hasSmartRouter=${hasSmartRouter} rec="${recommended}" smart="${smartRecommendation}"`
    );

    // 输出路由指令
    if (smartRecommendation) {
      console.log(
        `[smart-router] 技能 "${skillName}" 智能推荐模型: ${smartRecommendation}。` +
        `（推理阶段用 pro，执行阶段用 flash，当前推荐 ${smartRecommendation}）`
      );
    } else if (recommended) {
      console.log(
        `[smart-router] 技能 "${skillName}" 推荐模型: ${recommended}。` +
        `请根据任务阶段选择合适模型。`
      );
    } else {
      console.log(
        `[smart-router] 技能 "${skillName}" 已集成智能路由。` +
        `系统将根据任务描述自动分配最优模型。`
      );
    }
  }
}

main();

