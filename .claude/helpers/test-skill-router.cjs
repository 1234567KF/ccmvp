#!/usr/bin/env node
/**
 * test-skill-router.cjs — 技能路由器单元测试
 *
 * 用法: node {IDE_ROOT}/helpers/test-skill-router.cjs
 */

const { generateRoutingTable, verifySkillUsage, getSkillsForStage } = require('./skill-router.cjs');

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ─── Test: getSkillsForStage ─────────────────────────────────────────

console.log('\n1. getSkillsForStage');

const s1 = getSkillsForStage({ stage: 1 });
assert('Stage 1 exists', !!s1 && !s1.error);
assert('Stage 1 has required skills', s1.required.length > 0);
assert('Stage 1 required includes kf-alignment', s1.required.includes('kf-alignment'));
assert('Stage 1 required includes kf-web-search', s1.required.includes('kf-web-search'));

const s0 = getSkillsForStage({ stage: 0 });
assert('Stage 0 exists', !!s0 && !s0.error);
assert('Stage 0 required includes kf-alignment', s0.required.includes('kf-alignment'));
assert('Stage 0 required includes kf-spec', s0.required.includes('kf-spec'));

const s2_frontend = getSkillsForStage({ stage: 2, agentRole: '前端专家' });
assert('Stage 2 frontend has role skills', s2_frontend.role_skills.length > 0);
assert('Stage 2 frontend includes react-expert', s2_frontend.role_skills.includes('react-expert'));

const s2_backend = getSkillsForStage({ stage: 2, agentRole: '后端专家' });
assert('Stage 2 backend has role skills', s2_backend.role_skills.length > 0);
assert('Stage 2 backend includes python-pro', s2_backend.role_skills.includes('python-pro'));

assert('Stage 3 required includes kf-browser-ops', getSkillsForStage({ stage: 3 }).required.includes('kf-browser-ops'));
assert('Stage 4 required includes kf-code-review-graph', getSkillsForStage({ stage: 4 }).required.includes('kf-code-review-graph'));

// ─── Test: generateRoutingTable ───────────────────────────────────────

console.log('\n2. generateRoutingTable');

const rt1 = generateRoutingTable({ stage: 1, agentRole: '前端专家' });
assert('Stage 1 routing table non-empty', rt1.length > 100);
assert('Stage 1 table has header', rt1.includes('技能路由指引'));
assert('Stage 1 table has P0 skills', rt1.includes('🔴 P0'));
assert('Stage 1 table has P1 skills', rt1.includes('🟡 P1'));
assert('Stage 1 table has role skills', rt1.includes('react-expert') || rt1.includes('vue-expert'));
assert('Stage 1 table has triggers', rt1.includes('kf-web-search') || rt1.includes('kf-alignment'));

const rt0 = generateRoutingTable({ stage: 0 });
assert('Stage 0 table generated', rt0.length > 50);
assert('Stage 0 has kf-alignment', rt0.includes('kf-alignment'));

const rt3 = generateRoutingTable({ stage: 3, agentRole: 'QA 专家' });
assert('Stage 3 QA table has browser-ops', rt3.includes('kf-browser-ops'));

// ─── Test: verifySkillUsage ──────────────────────────────────────────

console.log('\n3. verifySkillUsage');

// Test with non-existent dir (should produce issues but not crash)
const vNoDir = verifySkillUsage({ stage: 1, team: 'test', outputDir: '/nonexistent' });
assert('Verify with bad dir returns result', !!vNoDir);
assert('Verify with bad dir has issues', (vNoDir.issues || []).length > 0);

// Test with a dir that has no .md files
const vEmpty = verifySkillUsage({ stage: 1, team: 'test', outputDir: __dirname });
assert('Verify with this dir returns result', !!vEmpty);

// ─── Test: error handling ────────────────────────────────────────────

console.log('\n4. Error handling');

const unknownStage = getSkillsForStage({ stage: 99 });
assert('Unknown stage returns error', unknownStage.error && unknownStage.error.includes('not defined'));

const unknownRole = getSkillsForStage({ stage: 1, agentRole: '外星人' });
assert('Unknown role returns empty role_skills', unknownRole.role_skills.length === 0);

// ─── Summary ─────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`);
console.log(`结果: ${passed} 通过, ${failed} 失败, ${passed + failed} 总计`);
process.exit(failed > 0 ? 1 : 0);

