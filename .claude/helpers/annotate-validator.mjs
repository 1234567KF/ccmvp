#!/usr/bin/env node
/**
 * annotate-validator.mjs — 注释完整性验证器（Phase 6 Gate B 工具）
 *
 * 验证 HTML 页面中的注释 JSON 数据块的完整性和 PRD 可追溯性。
 * 检查项：
 *   1. 是否存在 `kf-ann-data` JSON 数据块
 *   2. JSON 格式是否正确
 *   3. 必填层级是否完整
 *   4. 每个注释条目是否有 `prdRef` 字段
 *   5. PRD 引用是否可追溯（引用的章节在 PRD 文件中是否存在）
 *
 * 用法:
 *   node {IDE_ROOT}/helpers/annotate-validator.mjs \
 *     --target public/index.html \
 *     --layers l0,l0_ops,l1,l2,l3,l4,l6 \
 *     --output annotate-validation-report.md
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, relative } from 'path';

const CWD = process.env.CLAUDE_PROJECT_DIR || process.env.QODER_PROJECT_DIR || process.cwd();

// ─── 必填层级定义 ─────────────────────────────────────────────────────
const REQUIRED_LAYERS = ['l0', 'l0_ops', 'l1', 'l2', 'l4', 'l6'];

// 按页面类型的必填层级
const PAGE_TYPE_LAYERS = {
  list:    ['l0', 'l0_ops', 'l0_search', 'l1', 'l2', 'l4', 'l6'],
  form:    ['l0', 'l0_ops', 'l1', 'l1_bounds', 'l2', 'l4', 'l6'],
  stats:   ['l0', 'l1_stats', 'l2', 'l4', 'l6'],
  special: ['l0', 'l0_ops', 'l1', 'l2', 'l4', 'l6']
};

// L1 增强字段（v2）
const L1_V2_FIELDS = ['inputType', 'dataSource', 'conditionalDisplay', 'linkageRules', 'modeDiff', 'appliesTo'];
const L1_REQUIRED_V2 = ['inputType'];
const VALID_INPUT_TYPES = ['text','number','select','multiSelect','radio','checkbox','file','date','dateRange','numberRange','datetime','textarea','switch','cascader'];
const VALID_PAGE_TYPES = ['list','form','stats','special'];

// ─── 参数解析 ──────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { layers: REQUIRED_LAYERS.join(',') };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--target': opts.target = args[++i]; break;
      case '--layers': opts.layers = args[++i]; break;
      case '--output': opts.output = args[++i]; break;
      case '--help':
        console.log('Usage: annotate-validator.mjs --target <html-file> [--layers l0,l1,...] [--output <report-file>]');
        process.exit(0);
    }
  }
  return opts;
}

function resolvePath(p) {
  if (!p) return null;
  return resolve(CWD, p);
}

function safeRead(filePath, label) {
  const full = resolvePath(filePath);
  if (!full || !existsSync(full)) {
    return { error: `${label} 文件不存在: ${full}`, content: '' };
  }
  return { content: readFileSync(full, 'utf-8'), path: full };
}

// ─── 提取 JSON 注释数据 ───────────────────────────────────────────────
function extractAnnotationData(html) {
  // 匹配 <script id="kf-ann-data" type="application/json">...</script>
  const re = /<script\s+id=["']kf-ann-data["']\s+type=["']application\/json["']\s*>([\s\S]*?)<\/script>/i;
  const match = html.match(re);
  if (!match) return { error: '未找到 kf-ann-data JSON 数据块' };

  try {
    const data = JSON.parse(match[1].trim());
    return { data };
  } catch (e) {
    return { error: `JSON 解析失败: ${e.message}` };
  }
}

// ─── 检查层级完整性 ───────────────────────────────────────────────────
function checkLayers(data, requiredLayers) {
  const issues = [];
  const present = new Set(data.layers ? Object.keys(data.layers) : []);

  for (const layer of requiredLayers) {
    if (!present.has(layer)) {
      issues.push({
        type: 'missing_layer',
        severity: 'P0',
        message: `缺少必填层级: ${layer}`,
        layer
      });
    }
  }

  if (data.layers) {
    for (const [key, layer] of Object.entries(data.layers)) {
      if (!layer.title) {
        issues.push({
          type: 'missing_title',
          severity: 'P1',
          message: `层级 ${key} 缺少 title`,
          layer: key
        });
      }
      if (!layer.content && !layer.states) {
        issues.push({
          type: 'empty_layer',
          severity: 'P1',
          message: `层级 ${key} 无内容 (content/states 均为空)`,
          layer: key
        });
      }
    }
  }

  return { present: [...present], missing: requiredLayers.filter(l => !present.has(l)), issues };
}

// ─── 检查 PRD 引用可追溯性 ────────────────────────────────────────────
function checkPrdReferences(data, prdContent) {
  const issues = [];
  const refs = [];

  // 提取 PRD 章节标题用于交叉引用
  const prdHeadings = new Set();
  if (prdContent) {
    const headingRe = /^#{1,4}\s+([^\n]+)/gm;
    let m;
    while ((m = headingRe.exec(prdContent)) !== null) {
      prdHeadings.add(m[1].trim());
    }
  }

  // 递归收集所有 prdRef 字段
  function collectRefs(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => collectRefs(item, `${path}[${i}]`));
      return;
    }
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'prdRef' && typeof val === 'string' && val.trim()) {
        refs.push({ path, ref: val.trim() });
      } else if (typeof val === 'object' && val !== null) {
        collectRefs(val, `${path}.${key}`);
      }
    }
  }
  collectRefs(data, 'root');

  // 验证每个引用
  let unmatchedCount = 0;
  let emptyCount = 0;

  for (const { path, ref } of refs) {
    if (ref === '[PRD 待补充]' || ref === '待补充' || ref === '') {
      emptyCount++;
      continue;
    }
    // 提取 PRD 章节号
    const chapterMatch = ref.match(/\[PRD\s+([^\]]+)\]/);
    if (chapterMatch && prdContent) {
      const chapter = chapterMatch[1].trim();
      // 检查 PRD 中是否有匹配的标题
      let found = false;
      for (const h of prdHeadings) {
        if (h.includes(chapter)) {
          found = true;
          break;
        }
      }
      if (!found) {
        unmatchedCount++;
        issues.push({
          type: 'unmatched_prd_ref',
          severity: 'P1',
          message: `PRD 引用不可追溯: "${ref}" (位于 ${path})，PRD 中未找到匹配章节 "${chapter}"`,
          ref,
          path
        });
      }
    }
  }

  return { total: refs.length, empty: emptyCount, unmatched: unmatchedCount, issues };
}

// ─── 检查模板合规性 ───────────────────────────────────────────────────
function checkTemplateCompliance(data) {
  const issues = [];
  const detailChecks = {};

  if (!data.layers) return { issues, detailChecks };

  // L0 必填字段检查
  if (data.layers.l0 && data.layers.l0.content) {
    const l0Keys = new Set(data.layers.l0.content.map(c => c.key));
    const requiredL0Keys = ['页面名称', '所属模块', '业务说明', '目标用户', 'PRD 来源'];
    const missingL0 = requiredL0Keys.filter(k => !l0Keys.has(k));
    detailChecks.l0 = { required: requiredL0Keys, present: [...l0Keys], missing: missingL0 };
    if (missingL0.length > 0) {
      issues.push({
        type: 'template_compliance',
        severity: 'P1',
        message: `L0 模板字段不完整，缺少: ${missingL0.join(', ')}`,
        layer: 'l0'
      });
    }
  }

  // L1 必填字段检查
  if (data.layers.l1 && data.layers.l1.content) {
    const missingFields = [];
    for (const item of data.layers.l1.content) {
      if (!item.field || !item.type || !item.description) {
        missingFields.push(item.field || '(匿名)');
      }
    }
    detailChecks.l1 = { total: data.layers.l1.content.length, incomplete: missingFields.length };
    if (missingFields.length > 0) {
      issues.push({
        type: 'template_compliance',
        severity: 'P2',
        message: `L1 有 ${missingFields.length} 个字段定义不完整`,
        layer: 'l1'
      });
    }
  }

  // L2 必填字段检查
  if (data.layers.l2 && data.layers.l2.content) {
    const missingRules = data.layers.l2.content.filter(
      r => !r.ruleId || !r.name || !r.logic
    );
    detailChecks.l2 = { total: data.layers.l2.content.length, incomplete: missingRules.length };
    if (missingRules.length > 0) {
      issues.push({
        type: 'template_compliance',
        severity: 'P2',
        message: `L2 有 ${missingRules.length} 条规则定义不完整（缺少 ruleId/name/logic）`,
        layer: 'l2'
      });
    }
  }

  // L4 必填字段检查
  if (data.layers.l4 && data.layers.l4.content) {
    const missingApis = data.layers.l4.content.filter(
      a => !a.endpoint || !a.method || !a.description
    );
    detailChecks.l4 = { total: data.layers.l4.content.length, incomplete: missingApis.length };
    if (missingApis.length > 0) {
      issues.push({
        type: 'template_compliance',
        severity: 'P2',
        message: `L4 有 ${missingApis.length} 个 API 定义不完整`,
        layer: 'l4'
      });
    }
  }

  // L6 必填字段检查
  if (data.layers.l6 && data.layers.l6.content) {
    const missingQuestions = data.layers.l6.content.filter(
      q => !q.id || !q.question || !q.status
    );
    detailChecks.l6 = { total: data.layers.l6.content.length, incomplete: missingQuestions.length };
    if (missingQuestions.length > 0) {
      issues.push({
        type: 'template_compliance',
        severity: 'P2',
        message: `L6 有 ${missingQuestions.length} 个开放问题定义不完整`,
        layer: 'l6'
      });
    }
  }

  return { issues, detailChecks };
}

// ─── 页面类型验证（v2） ───────────────────────────────────────────────
function checkPageType(data) {
  const issues = [];
  const pageType = data.pageType || '';

  if (!pageType) {
    issues.push({ type: 'missing_page_type', severity: 'P1',
      message: '顶层缺少 pageType 字段，无法按页面类型校验必填层级' });
    return { issues, pageType: 'unknown', requiredLayers: REQUIRED_LAYERS };
  }

  if (!VALID_PAGE_TYPES.includes(pageType)) {
    issues.push({ type: 'invalid_page_type', severity: 'P1',
      message: 'pageType 值无效: ' + pageType + '（有效值: ' + VALID_PAGE_TYPES.join(', ') + '）' });
    return { issues, pageType: 'unknown', requiredLayers: REQUIRED_LAYERS };
  }

  return { issues, pageType, requiredLayers: PAGE_TYPE_LAYERS[pageType] || REQUIRED_LAYERS };
}

// ─── L1 增强字段验证（v2） ─────────────────────────────────────────────
function checkL1Enhanced(data) {
  const issues = [];
  const stats = { totalFields: 0, withInputType: 0, withDataSource: 0, withConditionalDisplay: 0, withLinkageRules: 0, withModeDiff: 0, withAppliesTo: 0, invalidInputType: 0 };

  if (!data.layers || !data.layers.l1 || !data.layers.l1.content) {
    return { issues, stats };
  }

  const fields = data.layers.l1.content;
  stats.totalFields = fields.length;

  for (const item of fields) {
    if (!item.inputType) {
      issues.push({ type: 'missing_inputType', severity: 'P1',
        message: 'L1 字段 ' + (item.field || '(匿名)') + ' 缺少 inputType', layer: 'l1' });
    } else {
      stats.withInputType++;
      if (!VALID_INPUT_TYPES.includes(item.inputType)) {
        stats.invalidInputType++;
        issues.push({ type: 'invalid_inputType', severity: 'P2',
          message: 'L1 字段 ' + (item.field || '(匿名)') + ' 的 inputType 值无效: ' + item.inputType, layer: 'l1' });
      }
    }

    if (item.dataSource) stats.withDataSource++;
    if (item.conditionalDisplay) stats.withConditionalDisplay++;
    if (item.linkageRules && item.linkageRules.length > 0) stats.withLinkageRules++;
    if (item.modeDiff) stats.withModeDiff++;
    if (item.appliesTo && item.appliesTo.length > 0) stats.withAppliesTo++;
  }

  if (stats.totalFields > 0 && stats.withInputType === 0) {
    issues.push({ type: 'missing_all_inputType', severity: 'P0',
      message: 'L1 全部 ' + stats.totalFields + ' 个字段均缺少 inputType（v2 模板要求每个字段必须标注输入控件类型）', layer: 'l1' });
  }

  return { issues, stats };
}

// ─── L0.ops 条件显示验证（v2） ────────────────────────────────────────
function checkOpsConditions(data) {
  const issues = [];
  const stats = { totalOps: 0, withCondition: 0 };

  if (!data.layers || !data.layers.l0_ops || !data.layers.l0_ops.content) {
    return { issues, stats };
  }

  const ops = data.layers.l0_ops.content;
  stats.totalOps = ops.length;

  for (const op of ops) {
    if (op.condition) stats.withCondition++;
    if (!op.roles || op.roles.length === 0) {
      issues.push({ type: 'missing_roles', severity: 'P2',
        message: 'L0.ops 操作 "' + (op.name || '(匿名)') + '" 缺少 roles 定义', layer: 'l0_ops' });
    }
  }

  return { issues, stats };
}

// ─── 生成验证报告 ─────────────────────────────────────────────────────
function generateReport(targetFile, extractResult, layerResult, prdResult, templateResult, pageTypeResult, l1EnhancedResult, opsResult) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const allIssues = [
    ...pageTypeResult.issues,
    ...layerResult.issues,
    ...prdResult.issues,
    ...templateResult.issues,
    ...l1EnhancedResult.issues,
    ...opsResult.issues
  ];
  const p0Count = allIssues.filter(i => i.severity === 'P0').length;
  const p1Count = allIssues.filter(i => i.severity === 'P1').length;
  const p2Count = allIssues.filter(i => i.severity === 'P2').length;
  const passed = p0Count === 0;

  let report = `# 注释验证报告

> 目标文件: ${targetFile}
> 生成时间: ${now}
> 验证结果: ${passed ? '✅ PASS' : '❌ FAIL'}

---

## 1. 数据提取

`;

  if (extractResult.error) {
    report += `**❌ 提取失败**: ${extractResult.error}

> 页面未包含 ` + '`<script id="kf-ann-data" type="application/json">` 数据块。' + `
> 请先运行 ` + '`annotate-generator.mjs --mode inject`' + ` 注入注释数据。

`;
    return { report, passed: false };
  }

  const data = extractResult.data;
  report += `✅ 成功提取 JSON 注释数据
- pageId: \`${data.pageId || '(未定义)'}\`
- pageTitle: \`${data.pageTitle || '(未定义)'}\`
- 层级数: ${data.layers ? Object.keys(data.layers).length : 0}

---

## 2. 层级完整性

| 检查项 | 结果 |
|--------|------|
| 已包含层级 | ${layerResult.present.join(', ') || '(无)'} |
| 缺失层级 | ${layerResult.missing.length > 0 ? '❌ ' + layerResult.missing.join(', ') : '✅ 无缺失'} |

`;

  if (allIssues.length > 0) {
    report += `## 3. 问题清单

| 严重级别 | 数量 |
|---------|------|
| P0 (阻断) | ${p0Count} |
| P1 (告警) | ${p1Count} |
| P2 (建议) | ${p2Count} |

`;

    for (const issue of allIssues) {
      const icon = issue.severity === 'P0' ? '❌' : issue.severity === 'P1' ? '⚠️' : '💡';
      report += `- ${icon} **[${issue.severity}]** ${issue.type}: ${issue.message}\n`;
    }
    report += '\n';
  } else {
    report += `## 3. 问题清单

✅ 无问题发现

`;
  }

  // PRD 引用统计
  report += `## 4. PRD 引用交叉验证

| 指标 | 数值 |
|------|------|
| 总引用数 | ${prdResult.total} |
| 空引用（待补充） | ${prdResult.empty} |
| 不可追溯引用 | ${prdResult.unmatched} |

`;

  // 模板合规详情
  report += `## 5. 模板合规详情

`;
  if (templateResult.detailChecks.l0) {
    const c = templateResult.detailChecks.l0;
    report += `### L0 页面概览
- 必填字段: ${c.required.join(', ')}
- 已包含: ${c.present.join(', ') || '(无)'}
- 缺失: ${c.missing.length > 0 ? c.missing.join(', ') : '✅ 无缺失'}
`;
  }
  if (templateResult.detailChecks.l1) {
    report += `### L1 字段说明
- 总字段数: ${templateResult.detailChecks.l1.total}
- 定义不完整: ${templateResult.detailChecks.l1.incomplete}
`;
  }
  if (templateResult.detailChecks.l2) {
    report += `### L2 业务规则
- 总规则数: ${templateResult.detailChecks.l2.total}
- 定义不完整: ${templateResult.detailChecks.l2.incomplete}
`;
  }
  if (templateResult.detailChecks.l4) {
    report += `### L4 API 契约
- 总 API 数: ${templateResult.detailChecks.l4.total}
- 定义不完整: ${templateResult.detailChecks.l4.incomplete}
`;
  }

  // v2 增强检查
  report += '\n## 6. L1 字段增强（v2）\n\n';
  report += '| 指标 | 数值 |\n|------|------|\n';
  report += '| 总字段数 | ' + l1EnhancedResult.stats.totalFields + ' |\n';
  report += '| 含 inputType | ' + l1EnhancedResult.stats.withInputType + ' |\n';
  report += '| 含 dataSource | ' + l1EnhancedResult.stats.withDataSource + ' |\n';
  report += '| 含 conditionalDisplay | ' + l1EnhancedResult.stats.withConditionalDisplay + ' |\n';
  report += '| 含 linkageRules | ' + l1EnhancedResult.stats.withLinkageRules + ' |\n';
  report += '| 含 modeDiff | ' + l1EnhancedResult.stats.withModeDiff + ' |\n';
  report += '| 含 appliesTo | ' + l1EnhancedResult.stats.withAppliesTo + ' |\n';
  if (l1EnhancedResult.stats.invalidInputType > 0) {
    report += '| 无效 inputType | ' + l1EnhancedResult.stats.invalidInputType + ' |\n';
  }
  report += '\n';

  report += '## 7. L0.ops 条件显示（v2）\n\n';
  report += '| 操作总数 | ' + opsResult.stats.totalOps + ' |\n';
  report += '| 含 condition | ' + opsResult.stats.withCondition + ' |\n';

  report += '\n---\n\n## 结论\n\n';
  report += '**' + (passed ? '✅ 验证通过 — 所有 P0 检查项通过，可进入下一阶段' : '❌ 验证失败 — 存在 P0 阻断项，必须修复后重新验证') + '**';

  report += '\n';

  if (!passed) {
    report += '### 修复建议\n\n';
    for (const issue of allIssues.filter(i => i.severity === 'P0')) {
      report += `- 修复 \`${issue.type}\`: ${issue.message}\n`;
    }
    report += '\n修复后请重新运行:\n';
    report += '```bash\n';
    report += `node {IDE_ROOT}/helpers/annotate-validator.mjs --target ${targetFile} --output annotate-validation-report.md\n`;
    report += '```\n';
  }

  return { report, passed };
}

// ─── 主流程 ────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs();

  if (!opts.target) {
    console.error('[x] 缺少 --target 参数');
    process.exit(1);
  }

  const requiredLayers = opts.layers ? opts.layers.split(',').map(s => s.trim()).filter(Boolean) : REQUIRED_LAYERS;
  const outPath = resolvePath(opts.output || 'annotate-validation-report.md');

  console.log('=== annotate-validator.mjs ===\n');
  console.log(`[i] 目标文件: ${opts.target}`);
  console.log(`[i] 必填层级: ${requiredLayers.join(', ')}`);

  // 1. 读取目标文件
  const targetResult = safeRead(opts.target, '目标文件');
  if (targetResult.error) {
    console.error(`[x] ${targetResult.error}`);
    process.exit(1);
  }

  // 2. 提取注释 JSON 数据
  const extractResult = extractAnnotationData(targetResult.content);
  if (extractResult.error) {
    console.error(`[x] ${extractResult.error}`);
    const emptyLayer = { present: [], missing: requiredLayers, issues: [] };
    const emptyPrd = { total: 0, empty: 0, unmatched: 0, issues: [] };
    const emptyTemplate = { issues: [], detailChecks: {} };
    const emptyPageType = { issues: [], pageType: 'unknown', requiredLayers: REQUIRED_LAYERS };
    const emptyL1Enhanced = { issues: [], stats: { totalFields: 0, withInputType: 0, withDataSource: 0, withConditionalDisplay: 0, withLinkageRules: 0, withModeDiff: 0, withAppliesTo: 0, invalidInputType: 0 } };
    const emptyOps = { issues: [], stats: { totalOps: 0, withCondition: 0 } };
    const { report, passed } = generateReport(opts.target, extractResult, emptyLayer, emptyPrd, emptyTemplate, emptyPageType, emptyL1Enhanced, emptyOps);
    writeFileSync(outPath, report, 'utf-8');
    console.log(report);
    process.exit(passed ? 0 : 1);
  }

  console.log(`[v] 成功提取 JSON 数据: pageId=${extractResult.data.pageId}, ${Object.keys(extractResult.data.layers || {}).length} 层`);

  // 3. v2 页面类型验证
  const pageTypeResult = checkPageType(extractResult.data);
  const effectiveLayers = pageTypeResult.pageType !== 'unknown' ? pageTypeResult.requiredLayers : requiredLayers;
  console.log(`[i] 页面类型: ${pageTypeResult.pageType}, 必填层级: [${effectiveLayers.join(', ')}]`);

  // 4. 检查层级完整性（使用页面类型对应的必填层级）
  const layerResult = checkLayers(extractResult.data, effectiveLayers);
  console.log(`[i] 层级: 已有 [${layerResult.present.join(', ')}], 缺失 [${layerResult.missing.join(', ') || '无'}]`);

  // 5. 尝试读取 PRD 进行交叉引用验证
  let prdContent = '';
  const prdPaths = ['docs/PRD.md', 'docs/prd.md', 'PRD.md', 'prd.md'];
  for (const p of prdPaths) {
    const r = safeRead(p, 'PRD');
    if (r.content && !r.error) {
      prdContent = r.content;
      console.log(`[i] PRD 文件: ${r.path}`);
      break;
    }
  }

  // 6. 检查 PRD 引用
  const prdResult = checkPrdReferences(extractResult.data, prdContent);
  console.log(`[i] PRD 引用: ${prdResult.total} 个, 空引用 ${prdResult.empty} 个, 不可追溯 ${prdResult.unmatched} 个`);

  // 7. 检查模板合规性
  const templateResult = checkTemplateCompliance(extractResult.data);
  console.log(`[i] 模板合规: ${templateResult.issues.length} 个问题`);

  // 8. v2 L1 增强字段验证
  const l1EnhancedResult = checkL1Enhanced(extractResult.data);
  console.log(`[i] L1 增强: ${l1EnhancedResult.stats.totalFields} 字段, ${l1EnhancedResult.stats.withInputType} 含 inputType`);

  // 9. v2 L0.ops 条件显示验证
  const opsResult = checkOpsConditions(extractResult.data);
  console.log(`[i] L0.ops 条件: ${opsResult.stats.totalOps} 操作, ${opsResult.stats.withCondition} 含 condition`);

  // 10. 生成报告
  const { report, passed } = generateReport(opts.target, extractResult, layerResult, prdResult, templateResult, pageTypeResult, l1EnhancedResult, opsResult);
  writeFileSync(outPath, report, 'utf-8');
  console.log(`[v] 验证报告已写入: ${outPath}`);
  console.log(`[${passed ? 'v' : 'x'}] 验证结果: ${passed ? 'PASS' : 'FAIL'}`);

  if (!passed) {
    console.log('\n--- 报告摘要 ---');
    const allIssues = [...pageTypeResult.issues, ...layerResult.issues, ...prdResult.issues, ...templateResult.issues, ...l1EnhancedResult.issues, ...opsResult.issues];
    for (const issue of allIssues.filter(i => i.severity === 'P0')) {
      console.log('[x] ' + issue.message);
    }
  }

  process.exit(passed ? 0 : 1);
}

main();
