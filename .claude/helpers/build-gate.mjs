#!/usr/bin/env node
/**
 * build-gate.mjs — Stage 2.5 编译门禁
 *
 * 四项检查：TypeScript 编译 | 前端构建 | 组件存在性（按选定框架） | ESM 兼容性
 *
 * 用法:
 *   node {IDE_ROOT}/helpers/build-gate.mjs \
 *     --tsconfig ./tsconfig.json \
 *     --build-cmd "npm run build" \
 *     --framework <antd|element-plus|arco|vant|shadcn|tailwind> \
 *     --component-inventory <path> \
 *     --esm-check \
 *     --output {team}-25-build-report.md
 *
 * --framework 参数说明：
 *   Phase 0 选定的 UI 框架，用于选择对应的组件清单进行校验。
 *   若省略，自动从 memory/mvp-generation-log.md 读取。
 *   可选值: antd, element-plus, arco, vant, shadcn, tailwind
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative, extname } from 'path';
import { execSync } from 'child_process';

const CWD = process.env.CLAUDE_PROJECT_DIR || process.env.QODER_PROJECT_DIR || process.cwd();

// ─── 框架→组件清单路径映射 ───────────────────────────────────────────────
const FRAMEWORK_MAP = {
  'antd':          { dir: 'ant-design-vue',    package: 'ant-design-vue',        label: 'Ant Design Vue 4.x' },
  'element-plus':  { dir: 'element-plus',      package: 'element-plus',          label: 'Element Plus 2.x' },
  'arco':          { dir: 'arco-design',       package: '@arco-design/web-vue',  label: 'Arco Design Vue 2.x' },
  'vant':          { dir: 'vant',              package: 'vant',                  label: 'Vant 4.x' },
  'shadcn':        { dir: 'shadcn-vue',        package: 'radix-vue',             label: 'shadcn/vue' },
  'tailwind':      { dir: 'tailwind',          package: 'tailwindcss',           label: 'Tailwind CSS 4.x' },
};

const MEMORY_FILE = resolve(CWD, 'memory/mvp-generation-log.md');
const DEFAULT_FRAMEWORK = 'antd';

// ─── 参数解析 ──────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { esmCheck: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--tsconfig':             opts.tsconfig = args[++i]; break;
      case '--build-cmd':            opts.buildCmd = args[++i]; break;
      case '--framework':            opts.framework = args[++i]; break;
      case '--component-inventory':  opts.inventory = args[++i]; break;
      case '--esm-check':            opts.esmCheck = true; break;
      case '--output':               opts.output = args[++i]; break;
      default:
        console.warn(`[build-gate] 忽略未知参数: ${args[i]}`);
    }
  }
  return opts;
}

// ─── 读取选定框架 ───────────────────────────────────────────────────────
function resolveFramework(opts) {
  if (opts.framework) {
    const key = opts.framework.toLowerCase();
    if (FRAMEWORK_MAP[key]) return key;
    console.warn(`[build-gate] 未知框架 "${opts.framework}"，使用默认 ${DEFAULT_FRAMEWORK}`);
    return DEFAULT_FRAMEWORK;
  }

  // 从 memory 文件读取
  if (existsSync(MEMORY_FILE)) {
    const content = readFileSync(MEMORY_FILE, 'utf-8');
    const match = content.match(/UI Framework:\s*(.+)/i);
    if (match) {
      const name = match[1].trim().toLowerCase();
      for (const [key, val] of Object.entries(FRAMEWORK_MAP)) {
        if (val.label.toLowerCase().includes(name) || name.includes(key)) return key;
      }
    }
  }

  console.warn(`[build-gate] 未检测到框架选择，使用默认 ${DEFAULT_FRAMEWORK}`);
  return DEFAULT_FRAMEWORK;
}

// ─── 框架组件清单路径 ───────────────────────────────────────────────────
function getFrameworkComponentPath(opts, frameworkKey) {
  const info = FRAMEWORK_MAP[frameworkKey];
  if (!info) return null;

  // 优先 --component-inventory 参数
  if (opts.inventory) {
    const fullPath = resolve(CWD, opts.inventory);
    if (existsSync(fullPath)) return fullPath;
  }

  // 自动解析: references/ui-templates/{dir}/components.md
  const autoPath = resolve(CWD, `.claude/skills/kf-mvp/references/ui-templates/${info.dir}/components.md`);
  if (existsSync(autoPath)) return autoPath;

  // fallback: 当前目录
  const fallback = resolve(CWD, `ui-templates/${info.dir}/components.md`);
  return existsSync(fallback) ? fallback : null;
}

// ─── TypeScript 编译检查 ───────────────────────────────────────────────
function checkTs(opts) {
  const result = { passed: false, detail: '' };
  if (!opts.tsconfig) {
    result.passed = true;
    result.detail = '未指定 tsconfig，跳过 TypeScript 编译检查';
    return result;
  }

  const tsconfigPath = resolve(CWD, opts.tsconfig);
  if (!existsSync(tsconfigPath)) {
    result.detail = `tsconfig 文件不存在: ${opts.tsconfig}`;
    return result;
  }

  try {
    execSync('npx tsc --noEmit', { cwd: CWD, stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000, encoding: 'utf-8' });
    result.passed = true;
    result.detail = 'TypeScript 编译通过，无类型错误';
  } catch (e) {
    const stderr = e.stderr || '';
    const stdout = e.stdout || '';
    const lines = (stderr + stdout).split('\n').filter(l => l.trim()).slice(0, 20);
    result.detail = `TypeScript 编译失败 (${lines.length} 个错误):\n\`\`\`\n${lines.join('\n')}\n\`\`\``;
  }
  return result;
}

// ─── 前端构建检查 ───────────────────────────────────────────────────────
function checkBuild(opts) {
  const result = { passed: false, detail: '' };
  if (!opts.buildCmd) {
    result.passed = true;
    result.detail = '未指定构建命令，跳过构建检查';
    return result;
  }

  try {
    execSync(opts.buildCmd, { cwd: CWD, stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000, encoding: 'utf-8', shell: true });
    result.passed = true;
    result.detail = '前端构建成功';
  } catch (e) {
    const lines = (e.stderr || e.stdout || '').split('\n').filter(l => l.trim()).slice(0, 15);
    result.detail = `构建失败:\n\`\`\`\n${lines.join('\n')}\n\`\`\``;
  }
  return result;
}

// ─── 组件存在性校验 ─────────────────────────────────────────────────────
function checkComponents(opts, frameworkKey) {
  const result = { passed: true, detail: [], total: 0, found: 0, missing: [] };
  const info = FRAMEWORK_MAP[frameworkKey];

  const componentPath = getFrameworkComponentPath(opts, frameworkKey);
  if (!componentPath) {
    result.passed = true;
    result.detail.push(`组件清单文件未找到，跳过组件校验 (框架: ${info.label})`);
    return result;
  }

  // 读取组件清单
  const content = readFileSync(componentPath, 'utf-8');

  // 提取表格中的组件名和导入路径
  const componentRegex = /\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/g;
  const components = [];
  let match;
  while ((match = componentRegex.exec(content)) !== null) {
    const name = match[1].split('/')[0].trim(); // "Button" or "Form / Form.Item" → "Button"
    const pkg = match[2].trim();
    if (pkg !== '-' && !components.find(c => c.name === name)) {
      components.push({ name, pkg });
    }
  }

  if (components.length === 0) {
    result.passed = true;
    result.detail.push('组件清单中未解析到有效组件，跳过组件校验');
    return result;
  }

  result.total = components.length;

  // 扫描 src/ 下的 .vue/.ts/.js 文件
  function scanDirectory(dir) {
    const entries = [];
    try {
      const list = readdirSync(dir);
      for (const entry of list) {
        const full = resolve(dir, entry);
        try {
          const stat = statSync(full);
          if (stat.isDirectory()) {
            entries.push(...scanDirectory(full));
          } else if (/\.(vue|ts|js|tsx|jsx)$/.test(entry)) {
            entries.push(full);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return entries;
  }

  const srcDir = resolve(CWD, 'src');
  let sourceFiles = [];
  if (existsSync(srcDir)) {
    sourceFiles = scanDirectory(srcDir);
  }

  if (sourceFiles.length === 0) {
    result.detail.push('未找到源文件 (src/)，跳过组件校验');
    return result;
  }

  // 读取所有源文件，搜索组件导入
  const allSourceText = sourceFiles.map(f => {
    try { return readFileSync(f, 'utf-8'); } catch { return ''; }
  }).join('\n');

  // 检查每个组件是否被导入
  for (const comp of components) {
    const importPattern = comp.pkg === info.package
      ? new RegExp(`(?:import|from)\\s+['"\`].*${escapeRegex(comp.name)}.*['"\`]|[<]${escapeRegex(comp.name)}`, 'i')
      : new RegExp(`[<]${escapeRegex(comp.name)}`, 'i');

    if (importPattern.test(allSourceText)) {
      result.found++;
    } else {
      result.missing.push(comp.name);
    }
  }

  if (result.missing.length > 0) {
    result.passed = false;
    result.detail.push(`组件校验: ${result.found}/${result.total} 已使用`);
    result.detail.push(`未检测到使用的组件 (${result.missing.length}): ${result.missing.join(', ')}`);
    result.detail.push('注意: 未使用不一定是错误 — 组件可能按需加载或条件渲染。请人工确认。');
  } else {
    result.detail.push(`组件校验通过: ${result.found}/${result.total} 组件在代码中使用`);
  }

  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── ESM 兼容性检查 ────────────────────────────────────────────────────
function checkEsm() {
  const result = { passed: true, detail: '' };
  const warnings = [];

  // 检查 package.json 是否有 type: module
  const pkgPath = resolve(CWD, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.type !== 'module') {
        warnings.push('package.json 未设置 "type": "module"');
      }
    } catch { /* ignore */ }
  }

  // 检查是否存在 require() 在 .mjs 文件中
  const srcDir = resolve(CWD, 'src');
  if (existsSync(srcDir)) {
    function scanForRequire(dir) {
      try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const full = resolve(dir, entry);
          try {
            const stat = statSync(full);
            if (stat.isDirectory()) {
              scanForRequire(full);
            } else if (/\.m?js$/.test(entry)) {
              const content = readFileSync(full, 'utf-8');
              const lines = content.split('\n');
              lines.forEach((line, i) => {
                if (/require\s*\(/.test(line) && !/\/\/|['"]require['"]/.test(line)) {
                  warnings.push(`${relative(CWD, full)}:${i + 1} — 使用 require() (ESM 不兼容)`);
                }
              });
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
    scanForRequire(srcDir);
  }

  if (warnings.length > 0) {
    result.passed = false;
    result.detail = `ESM 兼容性问题 (${warnings.length} 项):\n- ${warnings.join('\n- ')}`;
  } else {
    result.detail = 'ESM 兼容性检查通过';
  }
  return result;
}

// ─── 生成报告 ──────────────────────────────────────────────────────────
function generateReport(results) {
  const info = FRAMEWORK_MAP[results.framework] || { label: results.framework };
  const allPassed = results.allPassed;
  const relativePath = relative(CWD, results.output).replace(/\\/g, '/');

  const generateSection = (name, check) => {
    if (check.skipped) return '';
    const icon = check.passed ? '✅' : '❌';
    return `### ${icon} ${name}\n\n${check.detail}\n\n`;
  };

  const report = `# Stage 2.5 编译门禁报告

${allPassed ? '## ✅ 全部通过' : '## ❌ 存在未通过项'}

| 检查项 | 状态 |
|--------|------|
| **选定 UI 框架** | ${info.label} |
| **TypeScript 编译** | ${results.ts.passed ? '✅ 通过' : '❌ 失败'} |
| **前端构建** | ${results.build.passed ? '✅ 通过' : '❌ 失败'} |
| **组件校验** | ${results.components.passed ? '✅ 通过' : `❌ 失败 (${results.components.found}/${results.components.total})`} |
| **ESM 兼容性** | ${results.esm.passed ? '✅ 通过' : '❌ 告警'} |

---

${generateSection('TypeScript 编译', results.ts)}
${generateSection('前端构建', results.build)}
${generateSection(`组件校验 — ${info.label} (${results.components.found}/${results.components.total})`, results.components)}
${generateSection('ESM 兼容性', results.esm)}

---

*生成时间: ${new Date().toISOString()}*
*输出文件: ${relativePath}*
`;

  return report;
}

// ─── 主流程 ────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs();
  const frameworkKey = resolveFramework(opts);
  const info = FRAMEWORK_MAP[frameworkKey];

  console.log(`[build-gate] 开始编译门禁检查`);
  console.log(`[build-gate] 选定 UI 框架: ${info.label}`);
  console.log(`[build-gate] 输出: ${opts.output || '(stdout)'}`);

  // 执行检查
  const ts = checkTs(opts);
  console.log(`[build-gate] TypeScript: ${ts.passed ? '✅' : '❌'}`);

  const build = checkBuild(opts);
  console.log(`[build-gate] 构建: ${build.passed ? '✅' : '❌'}`);

  const components = checkComponents(opts, frameworkKey);
  console.log(`[build-gate] 组件: ${components.passed ? '✅' : '❌'} (${components.found}/${components.total})`);

  let esm = { passed: true, detail: '跳过', skipped: true };
  if (opts.esmCheck) {
    esm = checkEsm();
    console.log(`[build-gate] ESM: ${esm.passed ? '✅' : '❌'}`);
  }

  const allPassed = ts.passed && build.passed && components.passed && esm.passed;
  const results = { framework: frameworkKey, ts, build, components, esm, output: opts.output || 'stdout', allPassed };
  const report = generateReport(results);

  if (opts.output) {
    const outputPath = resolve(CWD, opts.output);
    writeFileSync(outputPath, report, 'utf-8');
    console.log(`[build-gate] 报告已写入: ${relative(CWD, outputPath)}`);
  } else {
    console.log(`\n${report}`);
  }

  // 退出码
  if (!allPassed) process.exitCode = 1;
}

main();
