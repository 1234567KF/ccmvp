#!/usr/bin/env node
/**
 * build-skill-registry.cjs — 从所有 SKILL.md 文件生成 skill-registry.json
 *
 * 用法:
 *   node {IDE_ROOT}/helpers/build-skill-registry.cjs           # 生成 registry
 *   node {IDE_ROOT}/helpers/build-skill-registry.cjs --validate  # 检查一致性
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');
const STAGE_MAP_PATH = path.join(ROOT, '.claude', 'helpers', 'stage-skill-map.json');
const OUTPUT_PATH = path.join(ROOT, '.claude', 'skill-registry.json');

// ─── YAML Frontmatter Parser ───────────────────────────────────────

function parseFrontmatter(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) return {};
    return yaml.load(fmMatch[1]) || {};
  } catch (e) {
    console.error(`  ⚠ 无法解析 ${filePath}: ${e.message}`);
    return {};
  }
}

// ─── Normalizers ────────────────────────────────────────────────────

function normalizeTriggers(fm) {
  // kf format: triggers: [list]
  if (Array.isArray(fm.triggers) && fm.triggers.length > 0) {
    return fm.triggers.map(t => String(t).trim()).filter(Boolean);
  }
  // root-level string triggers
  if (typeof fm.triggers === 'string' && fm.triggers.trim()) {
    return fm.triggers.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  }
  // jeffallan format: metadata.triggers as comma-separated string
  const mt = fm.metadata?.triggers;
  if (typeof mt === 'string' && mt.trim()) {
    return mt.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  }
  if (Array.isArray(mt) && mt.length > 0) {
    return mt.map(t => String(t).trim()).filter(Boolean);
  }
  return [];
}

function normalizeIntegratedSkills(fm) {
  const skills = new Set();
  // root-level integrated-skills (kf-scrapling style)
  if (Array.isArray(fm['integrated-skills'])) {
    fm['integrated-skills'].forEach(s => skills.add(s));
  }
  // metadata.integrated-skills (kf-model-router style)
  const metaSkills = fm.metadata?.['integrated-skills'];
  if (Array.isArray(metaSkills)) {
    metaSkills.forEach(s => skills.add(s));
  }
  return Array.from(skills);
}

function normalizeRelatedSkills(fm) {
  const related = fm.metadata?.['related-skills'];
  if (typeof related === 'string' && related.trim()) {
    return related.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  }
  if (Array.isArray(related)) return related.map(String).filter(Boolean);
  return [];
}

function inferDomain(name, fm) {
  // jeffallan format already has metadata.domain
  if (fm.metadata?.domain) return fm.metadata.domain;

  // kf skill domain inference from name and description patterns
  const desc = fm.description || '';
  const nameAndDesc = name + ' ' + (typeof desc === 'string' ? desc : '');

  const patterns = [
    { domain: 'knowledge', match: /search|scrap|scrapl|爬虫|抓取|opencli|exa.code|exa-code|web.search|搜索|grant.research|论文|文献/ },
    { domain: 'quality', match: /browser.ops|browser-ops|test|测试|review.graph|review-graph|审查|qa|audit|debugging/ },
    { domain: 'planning', match: /spec|prd|prototype|原型|spec.驱动|reverse.spec|逆向/ },
    { domain: 'infrastructure', match: /router|safe.router|smart.router|模型路由|model.router|saver|节约|token.track|token-track|节省|监测|monitor/ },
    { domain: 'language', match: /-pro$|-expert$|python|java|golang|rust|typescript|javascript|react|vue|angular|flutter|swift|kotlin|csharp|php|ruby|laravel|django|spring|fastapi|nestjs|nextjs|rails|wordpress|shopify|dotnet|salesforce|embedded|game/ },
    { domain: 'backend', match: /api.design|api-designer|graphql|microservice|database|postgres|sql/ },
    { domain: 'devops', match: /devops|kubernetes|terraform|sre|ci.cd|ci-cd|docker|chaos|deploy|release/ },
    { domain: 'security', match: /security|secure|vulnerability|安全/ },
    { domain: 'data', match: /ml.pipeline|ml-pipeline|pandas|spark|data|tensorflow|pytorch|fine.tuning/ },
    { domain: 'platform', match: /kb.envoy|kb-envoy|doc.consist|doc-consistency|add.skill|add-skill|langextract|extract|evolution|进化|mcp|lambda|claude.code|claude-code|lean.ctx/ },
    { domain: 'architecture', match: /alignment|对齐|multi.team|multi-team|triple|协作|竞争|architecture|架构|design/ },
    { domain: 'frontend', match: /frontend|slides|vue-expert|react-expert|angular|nextjs|flutter|react-native|frontend/ },
  ];

  for (const { domain, match } of patterns) {
    if (match.test(nameAndDesc)) return domain;
  }
  return 'general';
}

function inferRole(name, fm) {
  if (fm.metadata?.role) return fm.metadata.role;
  const desc = (fm.description || '');
  if (/orchestrat|编排|lead|coordinator|多团队|multi.team|triple|协作/.test(name + ' ' + desc)) return 'orchestrator';
  if (/-expert$|-pro$/.test(name)) return 'specialist';
  if (/router|tracker|saver|monitor|check|audit|consistency|validator|gate/.test(name)) return 'utility';
  return 'tool';
}

function inferScope(name, fm) {
  if (fm.metadata?.scope) return fm.metadata.scope;
  const desc = (fm.description || '');
  if (/pipeline|pipeline|multi.team|triple|spec/.test(name + ' ' + desc)) return 'pipeline';
  if (/always|always-on|auto|自动/.test(name + ' ' + desc)) return 'always';
  if (/review|审查|audit|test|测试/.test(name + ' ' + desc)) return 'review';
  if (/implementation|pro$|expert$|code/.test(name + ' ' + desc)) return 'implementation';
  return 'on-demand';
}

function inferSeverity(name, fm) {
  const desc = (fm.description || '');
  const P0_PATTERNS = /alignment|对齐|browser.ops|browser-ops|code.review.graph|code-review-graph|spec.coding\b|prd.generator|prd-generator/;
  if (P0_PATTERNS.test(name + ' ' + desc) || name === 'kf-alignment' || name === 'kf-browser-ops' ||
      name === 'kf-code-review-graph' || name === 'kf-spec') {
    return 'P0';
  }
  return 'P1';
}

function inferStages(name, fm, stageMap) {
  // If stage-map has assignments, use those
  if (stageMap) {
    for (const [skey, sdef] of Object.entries(stageMap.stages || {})) {
      const stageNum = Number(skey);
      if (isNaN(stageNum)) continue;
      const allSkills = [
        ...(sdef.required || []),
        ...(sdef.recommended || []),
        ...(sdef.contextual || []),
      ];
      if (allSkills.includes(name)) return [stageNum];

      // Check agent_skills
      for (const roleSkills of Object.values(sdef.agent_skills || {})) {
        if (roleSkills.includes(name)) return [stageNum];
      }
    }
  }

  // Fallback: infer from skill description
  const desc = (fm.description || '');
  const stages = [];
  if (/stage\s*0|需求对齐|requirement|alignment/.test(desc)) stages.push(0);
  if (/stage\s*1|架构|architecture|调研|research|search/.test(desc)) stages.push(1);
  if (/stage\s*2|编码|coding|implement|prototype/.test(desc)) stages.push(2);
  if (/stage\s*3|测试|test|browser/.test(desc)) stages.push(3);
  if (/stage\s*4|审查|review/.test(desc)) stages.push(4);
  if (/stage\s*5|汇总|summary|final/.test(desc)) stages.push(5);

  return stages.length > 0 ? stages : [1, 2]; // default: useful in architecture + coding
}

// ─── Main Build Logic ──────────────────────────────────────────────

function buildRegistry() {
  console.log('🔍 扫描技能目录...');

  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(`  ✗ 技能目录不存在: ${SKILLS_DIR}`);
    process.exit(1);
  }

  const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  console.log(`  找到 ${skillDirs.length} 个技能目录`);

  // Load stage-skill-map if available
  let stageMap = null;
  if (fs.existsSync(STAGE_MAP_PATH)) {
    try {
      stageMap = JSON.parse(fs.readFileSync(STAGE_MAP_PATH, 'utf-8'));
      console.log('  ✓ 加载阶段技能映射');
    } catch (e) {
      console.warn(`  ⚠ 无法加载 ${STAGE_MAP_PATH}: ${e.message}`);
    }
  }

  const entries = [];
  const errors = [];

  for (const dir of skillDirs) {
    const skillMd = path.join(SKILLS_DIR, dir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      errors.push(`  ⚠ ${dir}/SKILL.md 不存在`);
      continue;
    }

    const fm = parseFrontmatter(skillMd);
    if (!fm.name) {
      errors.push(`  ⚠ ${dir}/SKILL.md 缺少 name 字段`);
      continue;
    }

    const name = fm.name;
    const description = typeof fm.description === 'string' ? fm.description : '';
    const shortDesc = description.length > 80 ? description.slice(0, 77) + '...' : description;

    const entry = {
      name,
      prefix: name.startsWith('kf-') ? 'kf' : '',
      source: /^(kf-|gspowers|gstack|lambda-lang|claude-code-pro|lean-ctx|atlassian)/.test(name)
        ? 'local' : 'jeffallan',
      description_short: shortDesc,
      triggers: normalizeTriggers(fm),
      domain: inferDomain(name, fm),
      role: inferRole(name, fm),
      scope: inferScope(name, fm),
      pattern: fm.metadata?.pattern || null,
      recommended_model: fm.recommended_model || null,
      severity: inferSeverity(name, fm),
      stages: inferStages(name, fm, stageMap),
      integrated_skills: normalizeIntegratedSkills(fm),
      related_skills: normalizeRelatedSkills(fm),
    };

    // Auto-infer agent_skills assignment for jeffallan domain skills
    if (entry.source === 'jeffallan') {
      entry.agent_for = inferAgentRole(name, fm);
    } else {
      entry.agent_for = null;
    }

    entries.push(entry);
  }

  // Stats
  const stats = {
    total: entries.length,
    by_source: { local: 0, jeffallan: 0, other: 0 },
    by_domain: {},
    by_severity: { P0: 0, P1: 0 },
  };

  for (const e of entries) {
    stats.by_source[e.source] = (stats.by_source[e.source] || 0) + 1;
    stats.by_domain[e.domain] = (stats.by_domain[e.domain] || 0) + 1;
    stats.by_severity[e.severity] = (stats.by_severity[e.severity] || 0) + 1;
  }

  const output = {
    generated: new Date().toISOString(),
    stats,
    entries,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✅ 技能注册表已生成: ${OUTPUT_PATH}`);
  console.log(`   总计 ${stats.total} 技能 (本地 ${stats.by_source.local}, JeffAllan ${stats.by_source.jeffallan})`);

  if (errors.length > 0) {
    console.log(`\n⚠ 问题:`);
    errors.forEach(e => console.log(e));
  }

  return output;
}

function inferAgentRole(name, fm) {
  // Map jeffallan skills to agent roles used in stage-skill-map
  // Order matters: more specific patterns first
  const desc = typeof fm.description === 'string' ? fm.description : '';
  const context = name + ' ' + desc.toLowerCase();

  const mappings = [
    // Code Review / Security Review first (before generic review hits)
    { role: 'Code Review 专家', test: /\bcode-review(er)?\b|security-review(er)?|code.quality|pr-review/i },
    { role: '安全专家', test: /security(?!.review)|penetration|pentest|firewall|encrypt/i },
    { role: 'QA 专家', test: /\b(test|tester|testing|playwright|qa|selenium|cypress|jest|pytest|mocha)\b/i },
    // Design
    { role: '前端设计师', test: /\b(design(?!er|ed|ing)|html|css|tailwind|material.ui|bootstrap|styled)\b/i },
    // Language-specific frontend
    { role: '前端专家', test: /\b(react|vue|angular|next\.?js|nuxt|svelte|flutter|react.native|ionic|frontend)\b/i },
    { role: '前端专家', test: /typescript(?!.pro$)|javascript(?!.pro$)/i },
    // Frontend pro/expert
    { role: '前端专家', test: /(typescript.pro|javascript.pro|react-expert|vue-expert|react-native-expert)/i },
    // Infrastructure
    { role: '基础设施专家', test: /\b(devops|kubernetes|docker|terraform|sre|ci.cd|cloud|aws|azure|gcp|infrastructure|deploy|release)\b/i },
    // Data/ML
    { role: '数据专家', test: /\b(pandas|spark|tensorflow|pytorch|ml.pipeline|fine.tune|rag|data)\b/i },
    // Documentation
    { role: '文档专家', test: /\b(documentation|documenter|docs|api.docs)\b/i },
    // Backend languages - specific matches
    { role: '后端专家', test: /\b(python|golang|java|spring|nestjs|fastapi|django|rails|laravel|php|ruby|dotnet|kotlin|swift|rust|cpp|csharp)\b/i },
    { role: '后端专家', test: /\b(sql|postgres|graphql|microservice|api.design|architecture|backend)\b/i },
    { role: '后端专家', test: /\b(embedded|game|shopify|salesforce|wordpress|websocket|cli)\b/i },
  ];

  for (const { role, test } of mappings) {
    if (test.test(context)) return role;
  }
  return '后端专家'; // default
}

// ─── Validate ──────────────────────────────────────────────────────

function validate() {
  if (!fs.existsSync(OUTPUT_PATH)) {
    console.error('  ✗ registry 尚未生成，先运行 build');
    process.exit(1);
  }
  const registry = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));

  if (!fs.existsSync(STAGE_MAP_PATH)) {
    console.warn('  ⚠ stage-skill-map.json 不存在，跳过阶段映射验证');
    return;
  }
  const stageMap = JSON.parse(fs.readFileSync(STAGE_MAP_PATH, 'utf-8'));

  const issues = [];
  const nameSet = new Set(registry.entries.map(e => e.name));

  // Check stage-map references exist in registry
  for (const [skey, sdef] of Object.entries(stageMap.stages || {})) {
    const allSkills = [
      ...(sdef.required || []),
      ...(sdef.recommended || []),
      ...(sdef.contextual || []),
    ];
    for (const ref of allSkills) {
      if (!nameSet.has(ref)) {
        issues.push(`  ⚠ Stage ${skey} 引用了不存在的技能: ${ref}`);
      }
    }
    // Check agent_skills references
    for (const [role, skills] of Object.entries(sdef.agent_skills || {})) {
      for (const ref of skills) {
        if (!nameSet.has(ref)) {
          issues.push(`  ⚠ Stage ${skey} agent_skills[${role}] 引用了不存在的技能: ${ref}`);
        }
      }
    }
  }

  if (issues.length > 0) {
    console.log(`⚠ 验证发现问题 (${issues.length}):`);
    issues.forEach(i => console.log(i));
    process.exit(0); // warnings only
  } else {
    console.log('✅ 所有阶段技能引用有效');
  }
}

// ─── Runner ─────────────────────────────────────────────────────────

const arg = process.argv[2];
if (arg === '--validate') {
  validate();
} else {
  buildRegistry();
}

