/**
 * Harness Gate Check Hook
 *
 * 机械化门控验证——Harness Engineering 铁律 2（约束）+ 铁律 3（反馈）的实现。
 *
 * 用法：技能通过环境变量 HARNESS_GATE 或 args 指定门控规则，此 Hook 验证。
 *
 * 门控类型：
 *   - required-files: 必须产出的文件列表
 *   - min-lines: 文件最小行数
 *   - required-sections: Markdown 必须包含的章节标题
 *   - forbidden-patterns: 不允许出现的模式（如 "TODO"、"待定"）
 */

const fs = require('fs');
const path = require('path');

const CWD = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/**
 * Parse gate rules from args or env
 */
function parseRules(args = []) {
  const rules = { checks: [] };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--required-files': {
        const files = [];
        while (args[i + 1] && !args[i + 1].startsWith('--')) {
          files.push(args[++i]);
        }
        if (files.length) rules.checks.push({ type: 'required-files', files });
        break;
      }
      case '--required-sections': {
        const sections = [];
        while (args[i + 1] && !args[i + 1].startsWith('--')) {
          sections.push(args[++i]);
        }
        if (sections.length) rules.checks.push({ type: 'required-sections', sections });
        break;
      }
      case '--min-lines': {
        const file = args[++i];
        const min = parseInt(args[++i]);
        if (file && !isNaN(min)) rules.checks.push({ type: 'min-lines', file, min });
        break;
      }
      case '--forbidden-patterns': {
        const patterns = [];
        while (args[i + 1] && !args[i + 1].startsWith('--')) {
          patterns.push(args[++i]);
        }
        if (patterns.length) rules.checks.push({ type: 'forbidden-patterns', patterns });
        break;
      }
      case '--skill':
        rules.skill = args[++i];
        break;
      case '--stage':
        rules.stage = args[++i];
        break;
      case '--team':
        rules.team = args[++i];
        break;
    }
  }

  return rules;
}

function checkRequiredFiles(files) {
  const missing = [];
  for (const f of files) {
    const fullPath = path.resolve(CWD, f);
    if (!fs.existsSync(fullPath)) missing.push(f);
  }
  return { pass: missing.length === 0, missing };
}

function checkRequiredSections(sections) {
  // Find the most recently modified markdown file
  const mdFiles = findRecentFiles(CWD, '.md', 5);
  const missing = [];

  for (const section of sections) {
    let found = false;
    for (const f of mdFiles) {
      try {
        const content = fs.readFileSync(f, 'utf-8');
        if (content.includes(section)) { found = true; break; }
      } catch (_) {}
    }
    if (!found) missing.push(section);
  }

  return { pass: missing.length === 0, missing };
}

function checkMinLines(file, min) {
  const fullPath = path.resolve(CWD, file);
  try {
    const lines = fs.readFileSync(fullPath, 'utf-8').split('\n').length;
    return { pass: lines >= min, actual: lines, min };
  } catch (_) {
    return { pass: false, error: `File not found: ${file}` };
  }
}

function checkForbiddenPatterns(patterns) {
  const mdFiles = findRecentFiles(CWD, '.md', 5);
  const violations = [];

  for (const f of mdFiles) {
    try {
      const content = fs.readFileSync(f, 'utf-8');
      for (const pattern of patterns) {
        if (content.includes(pattern)) {
          violations.push({ file: path.relative(CWD, f), pattern });
        }
      }
    } catch (_) {}
  }

  return { pass: violations.length === 0, violations };
}

function findRecentFiles(dir, ext, count) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(ext)) {
        const fullPath = path.join(entry.parentPath || entry.path, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          results.push({ path: fullPath, mtime: stat.mtimeMs });
        } catch (_) {}
      }
    }
  } catch (_) {}

  return results
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, count)
    .map(r => r.path);
}

function main() {
  const args = process.argv.slice(2);
  const rules = parseRules(args);

  if (rules.checks.length === 0) {
    console.log('[HARNESS] No checks defined — gate passed');
    process.exit(0);
  }

  const results = [];
  let allPassed = true;

  for (const check of rules.checks) {
    let result;
    switch (check.type) {
      case 'required-files': result = checkRequiredFiles(check.files); break;
      case 'required-sections': result = checkRequiredSections(check.sections); break;
      case 'min-lines': result = checkMinLines(check.file, check.min); break;
      case 'forbidden-patterns': result = checkForbiddenPatterns(check.patterns); break;
      default: continue;
    }
    results.push({ type: check.type, ...result });
    if (!result.pass) allPassed = false;
  }

  const context = [
    rules.skill && `skill=${rules.skill}`,
    rules.stage && `stage=${rules.stage}`,
    rules.team && `team=${rules.team}`
  ].filter(Boolean).join(' ');

  if (allPassed) {
    console.log(`[HARNESS] ${context} — all gates passed ✓`);
    process.exit(0);
  } else {
    console.error(`[HARNESS] ${context} — GATE FAILED ✗`);
    for (const r of results) {
      if (!r.pass) {
        if (r.missing) console.error(`  Missing: ${r.missing.join(', ')}`);
        if (r.violations) console.error(`  Violations: ${JSON.stringify(r.violations)}`);
        if (r.error) console.error(`  Error: ${r.error}`);
      }
    }
    process.exit(1);
  }
}

main();
