#!/usr/bin/env node
/**
 * ccswitch — Claude Code Provider/Multi-vendor Switch
 *
 * 全自动多供应商切换：在 DeepSeek / MiniMax / Kimi 之间一键切换，
 * 同时修改 settings.local.json（持久化）和 process.env（当前会话子进程继承）。
 *
 * Usage:
 *   ccswitch                          → 显示当前状态和可用模型
 *   ccswitch <model-id>               → 切换到指定模型
 *   ccswitch list                     → 列出所有可用模型
 *   ccswitch status                   → 显示当前供应商/模型信息
 *   ccswitch auto [task description]  → 自动路由到最优模型
 *   ccswitch reload                   → 重新加载配置
 */

const fs = require('fs');
const path = require('path');

const IDE_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(IDE_ROOT, 'model-config.json');
const LOCAL_SETTINGS_PATH = path.join(IDE_ROOT, 'settings.local.json');
const USER_SETTINGS_PATH = path.join(require('os').homedir(), '.claude', 'settings.local.json');

// ─── Load Config ─────────────────────────────────────────────────

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function resolveApiKey(raw) {
  const m = raw.match(/^\$\{(\w+)\}$/);
  if (!m) return raw;
  return process.env[m[1]] || '';
}

// ─── Settings IO ─────────────────────────────────────────────────

function readLocalSettings() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_SETTINGS_PATH, 'utf-8'));
  } catch {
    return { env: {}, model: 'deepseek-v4-flash' };
  }
}

function writeLocalSettings(settings) {
  fs.writeFileSync(LOCAL_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
  // Also try user-level
  try {
    const dir = path.dirname(USER_SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
  } catch {}
}

// ─── Anthropic URL per provider ──────────────────────────────────

function getAnthropicUrl(provider) {
  if (provider.anthropic_url) return provider.anthropic_url;
  const base = provider.baseUrl.replace(/\/+$/, '');
  // Convention: most providers have /anthropic or /v1/anthropic path
  if (provider.name === 'deepseek') return base + '/anthropic';
  return base; // fallback: raw base URL (user may need to configure)
}

// ─── Display ─────────────────────────────────────────────────────

function showStatus() {
  const config = loadConfig();
  const settings = readLocalSettings();
  const currentModel = settings.model || 'unknown';
  const currentUrl = settings.env?.ANTHROPIC_BASE_URL || 'unknown';

  console.log('\n  ✦ ccswitch — 当前状态\n');

  // Find current model info
  let currentProvider = null;
  for (const p of config.providers) {
    for (const m of p.models) {
      if (m.id === currentModel) {
        currentProvider = p;
        break;
      }
    }
    if (currentProvider) break;
  }

  console.log(`  当前模型: ${currentModel}`);
  console.log(`  供应商:   ${currentProvider?.name || 'unknown'}`);
  console.log(`  API:      ${currentUrl}`);
  console.log('');

  // Available models table
  console.log('  ── 可用模型 ──');
  console.log('');
  console.log('  MODEL ID'.padEnd(22) + '供应商'.padEnd(12) + '成本'.padEnd(10) + '缓存');
  console.log('  ' + '─'.repeat(56));

  for (const p of config.providers) {
    const key = resolveApiKey(p.apiKey);
    const hasKey = key.length > 0;
    for (const m of p.models) {
      const active = m.id === currentModel ? ' ◀' : '';
      const cost = `¥${m.costPer1KInput}/K`;
      const cache = m.supportsCache ? '✓' : '✗';
      const keyMark = hasKey ? '' : ' ⚠️ 无 Key';
      console.log(`  ${(m.id + active).padEnd(22)}${p.name.padEnd(12)}${cost.padEnd(10)}${cache}${keyMark}`);
    }
  }

  console.log('');
  console.log('  切换: ccswitch <model-id>');
  console.log('  自动: ccswitch auto <任务描述>');
  console.log('');
}

function showList() {
  const config = loadConfig();
  console.log('\n  可用模型:\n');
  for (const p of config.providers) {
    const key = resolveApiKey(p.apiKey);
    const hasKey = key.length > 0;
    console.log(`  ${p.name} [${hasKey ? '✓ Key 已配' : '✗ Key 缺失'}]`);
    for (const m of p.models) {
      console.log(`    ${m.id.padEnd(22)} ¥${m.costPer1KInput}/K ${m.supportsCache ? '缓存✓' : '缓存✗'}  ${m.description.slice(0, 50)}`);
    }
    console.log('');
  }
}

// ─── Switch ──────────────────────────────────────────────────────

function doSwitch(modelId) {
  const config = loadConfig();

  // Find model
  let targetModel = null;
  let targetProvider = null;
  for (const p of config.providers) {
    for (const m of p.models) {
      if (m.id === modelId) {
        targetModel = m;
        targetProvider = p;
        break;
      }
    }
    if (targetModel) break;
  }

  if (!targetModel) {
    console.error(`✗ 未知模型: ${modelId}`);
    console.error(`  可用: ccswitch list`);
    process.exit(1);
  }

  const apiKey = resolveApiKey(targetProvider.apiKey);
  if (!apiKey) {
    console.error(`✗ ${targetProvider.name} API Key 未配置 (${targetProvider.apiKey})`);
    process.exit(1);
  }

  const anthropicUrl = getAnthropicUrl(targetProvider);

  // Update settings.local.json (persistent)
  // 直接读取，避免 readLocalSettings 的破坏性 fallback
  let settings = { env: {} };
  try {
    settings = JSON.parse(fs.readFileSync(LOCAL_SETTINGS_PATH, 'utf-8'));
  } catch {
    // 文件不存在或 JSON 解析失败，用空对象从头构建
    settings = { env: {} };
  }
  if (typeof settings.env !== 'object' || settings.env === null) {
    settings.env = {};
  }
  settings.model = targetModel.id;
  settings.env.ANTHROPIC_BASE_URL = anthropicUrl;
  settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;
  settings.env.ANTHROPIC_MODEL = targetModel.id;
  writeLocalSettings(settings);

  // Update process.env (for current session's sub-processes)
  process.env.ANTHROPIC_BASE_URL = anthropicUrl;
  process.env.ANTHROPIC_AUTH_TOKEN = apiKey;
  process.env.ANTHROPIC_MODEL = targetModel.id;

  // Update model field in settings.json too (for good measure)
  try {
    const userSettingsPath = path.join(require('os').homedir(), '.claude', 'settings.json');
    if (fs.existsSync(userSettingsPath)) {
      const us = JSON.parse(fs.readFileSync(userSettingsPath, 'utf-8'));
      us.model = targetModel.id;
      us.env = us.env || {};
      us.env.ANTHROPIC_BASE_URL = anthropicUrl;
      us.env.ANTHROPIC_AUTH_TOKEN = apiKey;
      us.env.ANTHROPIC_MODEL = targetModel.id;
      fs.writeFileSync(userSettingsPath, JSON.stringify(us, null, 2) + '\n');
    }
  } catch {}

  console.log(`\n  ✓ 已切换到 ${targetModel.id} (${targetProvider.name})`);
  console.log(`  API: ${anthropicUrl}`);
  console.log(`  当前会话已生效，重启 Claude Code 永久生效\n`);
}

// ─── Auto Route ──────────────────────────────────────────────────

async function doAuto(taskDesc) {
  try {
    const routerPath = path.join(IDE_ROOT, 'skills', 'kf-model-router', 'index.cjs');
    if (!fs.existsSync(routerPath)) {
      console.error('✗ 模型路由模块未找到');
      process.exit(1);
    }
    const router = require(routerPath);
    const desc = taskDesc || process.argv.slice(3).join(' ') || 'general coding task';
    const decision = await router.route({ description: desc });
    if (decision?.model?.id) {
      console.log(`  → 路由推荐: ${decision.model.id} (置信度: ${decision.confidence})`);
      doSwitch(decision.model.id);
    } else {
      console.error('✗ 路由决策失败');
    }
  } catch (e) {
    console.error(`✗ 路由错误: ${e.message}`);
  }
}

// ─── Reload ──────────────────────────────────────────────────────

function doReload() {
  // Reload env vars from settings.local.json into process.env
  const settings = readLocalSettings();
  if (settings.env) {
    for (const [k, v] of Object.entries(settings.env)) {
      process.env[k] = v;
    }
  }
  if (settings.model) {
    process.env.ANTHROPIC_MODEL = settings.model;
  }
  console.log(`\n  ✓ 已从 settings.local.json 重新加载环境变量\n`);
  showStatus();
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const cmd = process.argv[2] || 'status';

  switch (cmd) {
    case 'status':
    case '-s':
    case '--status':
      showStatus();
      break;

    case 'list':
    case '-l':
    case '--list':
      showList();
      break;

    case 'auto':
    case '-a':
    case '--auto':
      await doAuto();
      break;

    case 'reload':
    case '-r':
    case '--reload':
      doReload();
      break;

    default:
      // Assume it's a model ID
      doSwitch(cmd);
      break;
  }
}

main().catch(e => { console.error('ccswitch error:', e.message); process.exit(1); });
