#!/usr/bin/env node
// kf-alignment Hook — 文档产出对齐提醒（通用 IDE 手动触发版）
// 【通用 IDE 适配说明】原 Claude Code 版通过 PostEdit hook 自动检测文档产出，
// 本版改为手动调用：在生成文档后执行 node alignment-hook.cjs check <filepath>
// 用法: node alignment-hook.cjs check [filepath]

const fs = require('fs');
const path = require('path');

const DOC_PATTERNS = [
  /PRD.*\.md$/i,          // PRD 产出
  /prd.*\.md$/i,
  /spec.*\.md$/i,         // Spec 产出
  /需求.*\.md$/,
  /原型.*\.html$/,        // UI 原型产出
  /prototype.*\.html$/i,
  /review.*report/i,      // 审查报告
  /code-review.*\.md$/i,
  /对齐.*\.md$/i,
];

function isDocFile(filepath) {
  const basename = path.basename(filepath || '');
  return DOC_PATTERNS.some(p => p.test(basename));
}

function formatReminder(filepath, action) {
  const basename = path.basename(filepath || '');
  return `
<system-reminder>
kf-alignment Hook 检测到文档产出: ${basename}
请在回复中主动执行"动后对齐"：
1. 确认产出文档与原始需求的差异
2. 列出关键决策及原因
3. 标注遗留问题
触发词: "说下 diff" 或 "/对齐"
</system-reminder>`;
}

const argv = process.argv.slice(2);
const command = argv[0];
const filepath = argv[1];

if (command === 'check') {
  if (filepath && isDocFile(filepath)) {
    process.stdout.write(formatReminder(filepath));
  }
  // 静默退出，不阻塞（hook 超时不影响主流程）
  process.exit(0);
}

if (command === 'test') {
  // 测试模式：输出示例提醒
  process.stdout.write(formatReminder('/path/to/PRD-xxx.md'));
  process.exit(0);
}

// 未知命令，静默退出
process.exit(0);
