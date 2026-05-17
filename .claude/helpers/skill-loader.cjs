#!/usr/bin/env node
/**
 * skill-loader.cjs v1 — 按需技能加载控制器（多级缓存 L3 实现）
 *
 * 核心功能：
 * - 扫描所有技能，仅提取元数据（frontmatter）放入上下文
 * - 根据当前阶段/查询，决定哪些技能需要「完整加载」
 * - 生成上下文优化报告，指导 AI 管理 token 预算
 * - 不影响 L1 共享前缀缓存（系统提示词前缀不变）
 *
 * 用法：
 *   node skill-loader.cjs --stage <stage-name> [--role <role>]    # 返回当前阶段推荐加载的技能
 *   node skill-loader.cjs --query "<用户输入>"                    # 匹配可能触发的技能
 *   node skill-loader.cjs --load <skill-name>                     # 输出技能完整内容（供 lean-ctx 压缩传递）
 *   node skill-loader.cjs --unload <skill-name>                   # 标记技能为已卸载
 *   node skill-loader.cjs --context-report                        # 上下文 token 消耗报告
 *   node skill-loader.cjs --list-meta                             # 列出所有技能元数据（轻量）
 *   node skill-loader.cjs --optimize-for <stage> [--loaded a,b,c] # 生成最优加载方案
 *
 * API：
 *   const loader = require('./skill-loader.cjs');
 *   loader.scanAllSkills() → { skillName: meta }
 *   loader.getLoadPlan({ stage, role, currentlyLoaded }) → { load, keep, unload, report }
 *   loader.loadSkillContent(name) → { ok, content, tokens }
 *   loader.contextReport() → report
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');
const STATE_DIR = path.join(ROOT, '.claude', '.skill-loader-state');
const CONTEXT_STATE_FILE = path.join(STATE_DIR, 'context-state.json');
const STAGE_MAP_PATH = path.join(ROOT, '.claude', 'helpers', 'stage-skill-map.json');

// ─── Helpers ───────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function now() { return new Date().toISOString(); }

function readJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback || {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback || {}; }
}

function writeJSON(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// Simple YAML frontmatter parser (subset, no external deps)
function parseFrontmatter(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) return { _raw: content, _hasFm: false };

    const lines = fmMatch[1].split('\n');
    const fm = {};
    let currentKey = null;
    let currentArr = null;
    let indentStack = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
      if (keyMatch && !line.startsWith(' ') && !line.startsWith('\t')) {
        currentKey = keyMatch[1];
        const val = keyMatch[2].trim();
        if (val === '' || val === '|' || val === '>') {
          fm[currentKey] = '';
        } else if (val.startsWith('[') && val.endsWith(']')) {
          try { fm[currentKey] = JSON.parse(val); } catch { fm[currentKey] = val; }
        } else if (val.startsWith("'") && val.endsWith("'")) {
          fm[currentKey] = val.slice(1, -1);
        } else if (val.startsWith('"') && val.endsWith('"')) {
          fm[currentKey] = val.slice(1, -1);
        } else {
          fm[currentKey] = val;
        }
        currentArr = null;
        continue;
      }

      const arrItem = line.match(/^(\s*)-\s+(.*)$/);
      if (arrItem) {
        const item = arrItem[2].trim();
        if (currentKey) {
          if (!Array.isArray(fm[currentKey])) fm[currentKey] = [];
          fm[currentKey].push(item.replace(/^["']|["']$/g, ''));
        }
        continue;
      }

      // Continuation of multi-line string
      if (currentKey && line.startsWith('  ')) {
        const continuation = line.trim();
        if (typeof fm[currentKey] === 'string') {
          fm[currentKey] += (fm[currentKey] ? '\n' : '') + continuation;
        }
      }
    }

    return { ...fm, _raw: content, _hasFm: true, _bodyStart: fmMatch[0].length };
  } catch (e) {
    return { _error: e.message, _raw: '', _hasFm: false };
  }
}

// ─── Mutual Exclusion Map ────────────────────────────────────────────
// When a pipeline skill is loaded, explicitly exclude skills that would conflict
// or cause context pollution. Static prototype ≠ prototype system.
const MUTUAL_EXCLUSION = {
  'kf-mvp': ['kf-brainstorm'],
};

// ─── Core Functions ────────────────────────────────────────────────

function getSkillMeta(skillName) {
  const skillDir = path.join(SKILLS_DIR, skillName);
  const mdPath = path.join(skillDir, 'SKILL.md');
  const enPath = path.join(skillDir, 'SKILL-en.md');

  const targetPath = fs.existsSync(mdPath) ? mdPath : (fs.existsSync(enPath) ? enPath : null);
  if (!targetPath) return null;

  const fm = parseFrontmatter(targetPath);
  if (fm._error) return null;

  const stats = fs.statSync(targetPath);

  // Parse dependencies from graph.dependencies (can be string or object)
  const rawDeps = fm.graph?.dependencies || [];
  const dependencies = rawDeps.map(d => typeof d === 'string' ? d : d?.target).filter(Boolean);

  // Parse integrated-skills
  const integrated = fm['integrated-skills'] || fm.metadata?.['integrated-skills'] || [];

  return {
    name: skillName,
    path: targetPath,
    description: fm.description || fm.metadata?.description || '',
    triggers: Array.isArray(fm.triggers) ? fm.triggers : [],
    integrated: Array.isArray(integrated) ? integrated : [],
    dependencies,
    load_mode: fm.metadata?.['load-mode'] || fm.metadata?.load_mode || 'lazy',
    recommended_model: fm.metadata?.['recommended-model'] || fm.metadata?.recommended_model || 'pro',
    domain: fm.metadata?.domain || 'general',
    estimated_tokens: Math.max(50, Math.round(stats.size / 3.5)),
    size_kb: Math.round(stats.size / 1024 * 10) / 10,
    lines: fm._raw ? fm._raw.split('\n').length : 0,
  };
}

function scanAllSkills() {
  const skills = {};
  if (!fs.existsSync(SKILLS_DIR)) return skills;

  const dirs = fs.readdirSync(SKILLS_DIR).filter(d => {
    const p = path.join(SKILLS_DIR, d);
    return fs.statSync(p).isDirectory();
  });

  for (const dir of dirs) {
    const meta = getSkillMeta(dir);
    if (meta) skills[dir] = meta;
  }

  return skills;
}

function loadStageMap() {
  if (!fs.existsSync(STAGE_MAP_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(STAGE_MAP_PATH, 'utf8')); }
  catch { return null; }
}

function getSkillsForStage(stageName) {
  const map = loadStageMap();
  if (!map || !map.stages) return { required: [], recommended: [], contextual: [], always_on: [] };

  const stage = map.stages[stageName];
  if (!stage) return { required: [], recommended: [], contextual: [], always_on: [] };

  return {
    required: stage.required || [],
    recommended: stage.recommended || [],
    contextual: stage.contextual || [],
    always_on: (map.always_on_skills && map.always_on_skills.skills) || [],
  };
}

function getLoadPlan({ stage, currentlyLoaded = [], userQuery = '', role = 'general' }) {
  const allSkills = scanAllSkills();
  const stageSkills = stage ? getSkillsForStage(stage) : { required: [], recommended: [], contextual: [], always_on: [] };

  // Determine which skills should be fully loaded
  const shouldLoad = new Set([
    ...stageSkills.required,
    ...stageSkills.always_on,
  ]);

  // ─── kf-go unified entry routing ───
  // When kf-go is triggered, only load the matching pipeline (not all three)
  const kfGoTriggered = currentlyLoaded.includes('kf-go') || shouldLoad.has('kf-go');
  if (kfGoTriggered && userQuery) {
    try {
      const { detectTaskType } = require('./skill-router.cjs');
      const detected = detectTaskType(userQuery);
      if (detected.taskType === '原型生成') {
        shouldLoad.add('kf-mvp');
        shouldLoad.delete('kf-brainstorm');
      } else if (detected.taskType === '文档生成') {
        shouldLoad.add('kf-sdd');
        shouldLoad.delete('kf-mvp');
        shouldLoad.delete('kf-brainstorm');
      } else {
        // coding/review mode (default) → MVP
        shouldLoad.add('kf-mvp');
        shouldLoad.delete('kf-brainstorm');
      }
    } catch (_) {
      // Fallback: if skill-router not available, load kf-mvp
      shouldLoad.add('kf-mvp');
    }
  }

  // Query-trigger matching (lightweight)
  if (userQuery) {
    const q = userQuery.toLowerCase();
    for (const [name, meta] of Object.entries(allSkills)) {
      const triggerMatch = meta.triggers.some(t => q.includes(t.toLowerCase()));
      const descMatch = meta.description && meta.description.toLowerCase().includes(q);
      if (triggerMatch || descMatch) {
        shouldLoad.add(name);
      }
    }
  }

  // ─── Apply mutual exclusions (pipeline-conflicting skills) ───
  for (const [pipelineSkill, excludedSkills] of Object.entries(MUTUAL_EXCLUSION)) {
    if (shouldLoad.has(pipelineSkill) || currentlyLoaded.includes(pipelineSkill)) {
      for (const excluded of excludedSkills) {
        shouldLoad.delete(excluded);
      }
    }
  }

  // Resolve transitive dependencies (one level deep for required skills)
  for (const name of Array.from(shouldLoad)) {
    const meta = allSkills[name];
    if (meta && meta.dependencies) {
      for (const dep of meta.dependencies) {
        if (allSkills[dep]) shouldLoad.add(dep);
      }
    }
    if (meta && meta.integrated) {
      for (const int of meta.integrated) {
        if (allSkills[int]) shouldLoad.add(int);
      }
    }
  }

  const load = Array.from(shouldLoad).filter(s => !currentlyLoaded.includes(s));
  const keep = currentlyLoaded.filter(s => shouldLoad.has(s));
  const unload = currentlyLoaded.filter(s => !shouldLoad.has(s));

  const loadedTokens = [...keep, ...load].reduce((s, n) => s + (allSkills[n]?.estimated_tokens || 0), 0);
  const standbySkills = Object.keys(allSkills).filter(n => !shouldLoad.has(n) && !currentlyLoaded.includes(n));
  const standbyTokens = standbySkills.length * 25; // ~25 tokens per metadata stub
  const totalEstimate = loadedTokens + standbyTokens;
  const fullLoadEstimate = Object.values(allSkills).reduce((s, m) => s + m.estimated_tokens, 0);
  const savedTokens = fullLoadEstimate - totalEstimate;
  const compressionRatio = fullLoadEstimate > 0 ? (savedTokens / fullLoadEstimate * 100).toFixed(1) : '0.0';

  return {
    load,
    keep,
    unload,
    stage,
    all_available: Object.keys(allSkills),
    loaded_details: [...keep, ...load].map(n => ({
      name: n,
      tokens: allSkills[n]?.estimated_tokens || 0,
      size_kb: allSkills[n]?.size_kb || 0,
      mode: stageSkills.required.includes(n) ? 'required' : stageSkills.always_on.includes(n) ? 'always_on' : 'recommended',
    })),
    standby_details: standbySkills.map(n => ({
      name: n,
      triggers: (allSkills[n]?.triggers || []).slice(0, 3),
      size_kb: allSkills[n]?.size_kb || 0,
    })),
    token_report: {
      loaded_tokens: loadedTokens,
      standby_metadata_tokens: standbyTokens,
      total_estimate: totalEstimate,
      full_load_estimate: fullLoadEstimate,
      saved_tokens: savedTokens,
      compression_ratio_percent: compressionRatio,
    },
  };
}

function loadSkillContent(skillName) {
  const meta = getSkillMeta(skillName);
  if (!meta) return { ok: false, error: `Skill not found: ${skillName}` };

  try {
    const content = fs.readFileSync(meta.path, 'utf8');
    return {
      ok: true,
      name: skillName,
      content,
      size_kb: meta.size_kb,
      tokens: meta.estimated_tokens,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function loadContextState() {
  return readJSON(CONTEXT_STATE_FILE, { loaded: [], history: [] });
}

function saveContextState(state) {
  ensureDir(STATE_DIR);
  writeJSON(CONTEXT_STATE_FILE, state);
}

function contextReport() {
  const allSkills = scanAllSkills();
  const state = loadContextState();
  const loaded = state.loaded || [];
  const unloaded = Object.keys(allSkills).filter(n => !loaded.includes(n));

  const loadedMeta = loaded.map(n => allSkills[n]).filter(Boolean);
  const standbyMeta = unloaded.map(n => allSkills[n]).filter(Boolean);

  const loadedTokens = loadedMeta.reduce((s, m) => s + m.estimated_tokens, 0);
  const standbyTokens = standbyMeta.length * 25;
  const totalEstimate = loadedTokens + standbyTokens;
  const fullLoadEstimate = Object.values(allSkills).reduce((s, m) => s + m.estimated_tokens, 0);

  return {
    timestamp: now(),
    loaded_count: loaded.length,
    unloaded_count: unloaded.length,
    loaded_skills: loadedMeta.map(m => ({
      name: m.name,
      size_kb: m.size_kb,
      tokens: m.estimated_tokens,
      mode: m.load_mode,
    })),
    standby_skills: standbyMeta.map(m => ({
      name: m.name,
      triggers: m.triggers.slice(0, 3),
      size_kb: m.size_kb,
      mode: m.load_mode,
    })),
    token_report: {
      loaded_tokens: loadedTokens,
      standby_metadata_tokens: standbyTokens,
      total_estimate: totalEstimate,
      full_load_estimate: fullLoadEstimate,
      saved_tokens: fullLoadEstimate - totalEstimate,
      compression_ratio_percent: fullLoadEstimate > 0 ? (((fullLoadEstimate - totalEstimate) / fullLoadEstimate) * 100).toFixed(1) : '0.0',
    },
    history: state.history.slice(-10),
  };
}

function recordLoadEvent(action, skillNames) {
  const state = loadContextState();
  state.history = state.history || [];
  state.history.push({
    time: now(),
    action,
    skills: Array.isArray(skillNames) ? skillNames : [skillNames],
  });
  if (state.history.length > 50) state.history = state.history.slice(-50);

  if (action === 'load') {
    state.loaded = [...new Set([...(state.loaded || []), ...state.history.slice(-1)[0].skills])];
  } else if (action === 'unload') {
    const toUnload = state.history.slice(-1)[0].skills;
    state.loaded = (state.loaded || []).filter(s => !toUnload.includes(s));
  }

  saveContextState(state);
}

// ─── CLI ───────────────────────────────────────────────────────────

function cli() {
  const args = process.argv.slice(2);

  function getopt(name, fallback) {
    const idx = args.indexOf(name);
    if (idx === -1) return fallback;
    return args[idx + 1] || fallback;
  }

  function hasopt(name) { return args.includes(name); }

  if (args.length === 0 || hasopt('--help') || hasopt('-h')) {
    console.log(`skill-loader.cjs v1 — 按需技能加载控制器

用法:
  --stage <stage>           按阶段生成加载方案
  --role <role>             指定 Agent 角色（影响推荐技能）
  --query "<text>"          按用户输入匹配触发技能
  --load <skill>            输出技能完整内容
  --unload <skill>          标记卸载技能
  --loaded <a,b,c>          当前已加载技能（逗号分隔）
  --context-report          输出上下文 token 消耗报告
  --list-meta               列出所有技能元数据（轻量）
  --optimize-for <stage>    生成最优加载方案（综合 stage + query）

示例:
  node skill-loader.cjs --stage "phase-5" --loaded kf-mvp,kf-model-router
  node skill-loader.cjs --load kf-spec
  node skill-loader.cjs --context-report`);
    process.exit(0);
  }

  try {
    if (hasopt('--list-meta')) {
      const skills = scanAllSkills();
      const output = Object.values(skills).map(s => ({
        name: s.name,
        size_kb: s.size_kb,
        tokens: s.estimated_tokens,
        triggers: s.triggers.slice(0, 3),
        load_mode: s.load_mode,
      }));
      console.log(JSON.stringify({ count: output.length, skills: output }, null, 2));
      process.exit(0);
    }

    if (hasopt('--context-report')) {
      console.log(JSON.stringify(contextReport(), null, 2));
      process.exit(0);
    }

    if (hasopt('--load')) {
      const name = getopt('--load');
      const result = loadSkillContent(name);
      if (!result.ok) {
        console.error(JSON.stringify(result, null, 2));
        process.exit(1);
      }
      recordLoadEvent('load', name);
      console.log(result.content);
      process.exit(0);
    }

    if (hasopt('--unload')) {
      const name = getopt('--unload');
      recordLoadEvent('unload', name);
      console.log(JSON.stringify({ ok: true, action: 'unload', skill: name, loaded: loadContextState().loaded }, null, 2));
      process.exit(0);
    }

    if (hasopt('--optimize-for') || hasopt('--stage')) {
      const stage = getopt('--optimize-for') || getopt('--stage');
      const loadedRaw = getopt('--loaded', '');
      const currentlyLoaded = loadedRaw ? loadedRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
      const query = getopt('--query', '');
      const role = getopt('--role', 'general');

      const plan = getLoadPlan({ stage, currentlyLoaded, userQuery: query, role });
      console.log(JSON.stringify(plan, null, 2));
      process.exit(0);
    }

    console.error('未知命令。使用 --help 查看用法。');
    process.exit(1);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message, stack: e.stack }, null, 2));
    process.exit(1);
  }
}

// ─── Module Exports ────────────────────────────────────────────────

module.exports = {
  scanAllSkills,
  getSkillMeta,
  getLoadPlan,
  loadSkillContent,
  contextReport,
  loadContextState,
  saveContextState,
  recordLoadEvent,
};

// Run CLI if executed directly
if (require.main === module) {
  cli();
}
