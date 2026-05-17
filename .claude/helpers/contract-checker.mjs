#!/usr/bin/env node
/**
 * contract-checker.mjs - Contract Checker for API consistency
 *
 * Scans frontend API calls and backend route definitions, cross-references:
 *   1. Does each frontend API path have a matching backend route?
 *   2. Do HTTP methods match?
 *   3. Are path parameter formats consistent?
 *
 * Usage:
 *   node helpers/contract-checker.mjs --frontend src/api.ts --backend src/server/routes/ --output contract-check-report.md
 *   node helpers/contract-checker.mjs --frontend public/js/shop.js --backend server.js --output contract-check-report.md
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, extname, basename, relative } from 'path';

const CWD = process.env.CLAUDE_PROJECT_DIR || process.env.QODER_PROJECT_DIR || process.cwd();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--frontend': opts.frontend = args[++i]; break;
      case '--backend':  opts.backend = args[++i]; break;
      case '--output':   opts.output = args[++i]; break;
      case '--help':
        console.log('Usage: contract-checker.mjs --frontend <file|dir> --backend <file|dir> [--output <file>]');
        process.exit(0);
    }
  }
  return opts;
}

function resolvePath(p) {
  if (!p) return null;
  return resolve(CWD, p);
}

function collectFiles(fileOrDir) {
  const full = resolvePath(fileOrDir);
  if (!full || !existsSync(full)) return [];
  if (statSync(full).isFile()) return [full];
  const files = [];
  const stack = [full];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir)) {
      const p = resolve(dir, entry);
      if (statSync(p).isDirectory()) { stack.push(p); }
      else if (['.js', '.ts', '.mjs', '.cjs', '.vue'].includes(extname(p))) { files.push(p); }
    }
  }
  return files;
}

function extractBackendRoutes(content, filePath) {
  const routes = [];
  const methodRe = /(?:app|router)\.(get|post|put|delete|patch|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let m;
  while ((m = methodRe.exec(content)) !== null) {
    routes.push({ method: m[1].toUpperCase(), path: m[2], source: filePath,
      line: content.slice(0, m.index).split('\n').length });
  }
  return routes;
}

function extractFrontendCalls(content, filePath) {
  const calls = [];
  const apiRe = /(?:api|axios|fetch)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let m;
  while ((m = apiRe.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2], source: filePath,
      line: content.slice(0, m.index).split('\n').length });
  }
  const fetchRe = /fetch\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  while ((m = fetchRe.exec(content)) !== null) {
    const path = m[1];
    const nearby = content.slice(m.index, m.index + 200);
    const methodMatch = nearby.match(/method\s*:\s*['"`]([^'"`]+)['"`]/i);
    calls.push({ method: methodMatch ? methodMatch[1].toUpperCase() : 'GET', path,
      source: filePath, line: content.slice(0, m.index).split('\n').length });
  }
  return calls;
}

function normalizePath(p) {
  let np = p.replace(/\/+$/, '');
  if (!np.startsWith('/')) np = '/' + np;
  return np;
}

function pathPatternToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)/g, '[^/]+').replace(/\\\*/g, '.*');
  return new RegExp('^' + escaped + '$');
}

function pathsMatch(fp, bp) {
  if (normalizePath(fp) === normalizePath(bp)) return true;
  try { return pathPatternToRegex(bp).test(fp); }
  catch { return false; }
}

function checkContract(frontendCalls, backendRoutes) {
  const results = { matched: [], unmatched: [], methodMismatch: [],
    totalBackend: backendRoutes.length, totalFrontend: frontendCalls.length };
  for (const call of frontendCalls) {
    const match = backendRoutes.find(r => pathsMatch(call.path, r.path));
    if (match) {
      if (match.method === call.method || match.method === 'ALL') {
        results.matched.push({ frontend: call, backend: match });
      } else {
        results.methodMismatch.push({ frontend: call, backend: match,
          expectedMethod: call.method, actualMethod: match.method });
      }
    } else {
      results.unmatched.push(call);
    }
  }
  return results;
}

function generateReport(opts, results) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const totalIssues = results.unmatched.length + results.methodMismatch.length;
  const passed = totalIssues === 0;

  let report = '# API Contract Check Report\n\n';
  report += '> Check time: ' + now + '\n';
  report += '> Frontend: ' + opts.frontend + '\n';
  report += '> Backend: ' + opts.backend + '\n';
  report += '> Result: ' + (passed ? 'PASS' : 'FAIL') + '\n\n';
  report += '---\n\n';
  report += '## Summary\n\n';
  report += '| Metric | Value |\n|--------|-------|\n';
  report += '| Frontend API calls | ' + results.totalFrontend + ' |\n';
  report += '| Backend routes | ' + results.totalBackend + ' |\n';
  report += '| Matched | ' + results.matched.length + ' |\n';
  report += '| Method mismatch | ' + results.methodMismatch.length + ' |\n';
  report += '| Unmatched | ' + results.unmatched.length + ' |\n\n';
  report += '---\n\n';

  if (results.unmatched.length > 0) {
    report += '## Unmatched Routes\n\n';
    report += '| # | Method | Path | Frontend File | Line |\n';
    report += '|---|--------|------|---------------|------|\n';
    results.unmatched.forEach((c, i) => {
      report += '| ' + (i + 1) + ' | ' + c.method + ' | ' + c.path + ' | ' +
        basename(c.source) + ' | ' + c.line + ' |\n';
    });
    report += '\n';
  }

  if (results.methodMismatch.length > 0) {
    report += '## Method Mismatches\n\n';
    report += '| # | Path | Frontend | Backend | Frontend File | Backend File |\n';
    report += '|---|------|----------|---------|---------------|-------------|\n';
    results.methodMismatch.forEach((m, i) => {
      report += '| ' + (i + 1) + ' | ' + m.frontend.path + ' | ' + m.frontend.method +
        ' | ' + m.backend.method + ' | ' + basename(m.frontend.source) + ':' + m.frontend.line +
        ' | ' + basename(m.backend.source) + ':' + m.backend.line + ' |\n';
    });
    report += '\n';
  }

  if (results.matched.length > 0) {
    report += '## Matched\n\n';
    report += '| # | Method | Path | Frontend File | Backend File |\n';
    report += '|---|--------|------|---------------|-------------|\n';
    results.matched.forEach((m, i) => {
      report += '| ' + (i + 1) + ' | ' + m.frontend.method + ' | ' + m.frontend.path +
        ' | ' + basename(m.frontend.source) + ':' + m.frontend.line +
        ' | ' + basename(m.backend.source) + ':' + m.backend.line + ' |\n';
    });
    report += '\n';
  }

  report += '---\n\n## Conclusion\n\n';
  report += '**' + (passed ? 'PASS - All frontend API calls have matching backend routes' :
    'FAIL - Some API calls are unmatched or have method mismatches') + '**\n\n';

  if (!passed) {
    report += '### Fix Suggestions\n\n';
    report += '1. Check frontend API paths match backend route definitions\n';
    report += '2. Check HTTP methods (GET/POST/PUT/DELETE)\n';
    report += '3. Verify backend route files are properly loaded\n';
    report += '4. Use consistent path parameter names (e.g., :id vs :orderId)\n\n';
    report += 'Re-run after fixes:\n';
    report += '  node helpers/contract-checker.mjs --frontend ' + opts.frontend +
      ' --backend ' + opts.backend + ' --output contract-check-report.md\n';
  }

  return { report, passed };
}

function main() {
  const opts = parseArgs();

  if (!opts.frontend || !opts.backend) {
    console.error('Missing --frontend or --backend parameter');
    process.exit(1);
  }

  console.log('=== contract-checker.mjs ===\n');

  const frontendFiles = collectFiles(opts.frontend);
  const backendFiles = collectFiles(opts.backend);

  console.log('Frontend files: ' + frontendFiles.length);
  console.log('Backend files: ' + backendFiles.length);

  if (frontendFiles.length === 0) { console.error('No frontend source files found'); process.exit(1); }
  if (backendFiles.length === 0) { console.error('No backend source files found'); process.exit(1); }

  const frontendCalls = [];
  for (const f of frontendFiles) {
    frontendCalls.push(...extractFrontendCalls(readFileSync(f, 'utf-8'), f));
  }
  console.log('Frontend API calls: ' + frontendCalls.length);

  const backendRoutes = [];
  for (const f of backendFiles) {
    backendRoutes.push(...extractBackendRoutes(readFileSync(f, 'utf-8'), f));
  }
  console.log('Backend routes: ' + backendRoutes.length);

  const results = checkContract(frontendCalls, backendRoutes);
  console.log('Matched: ' + results.matched.length +
    ', Method mismatch: ' + results.methodMismatch.length +
    ', Unmatched: ' + results.unmatched.length);

  const { report, passed } = generateReport(opts, results);
  const outPath = resolvePath(opts.output || 'contract-check-report.md');
  writeFileSync(outPath, report, 'utf-8');
  console.log('Report written to: ' + outPath);
  console.log('Result: ' + (passed ? 'PASS' : 'FAIL'));

  process.exit(passed ? 0 : 1);
}

main();
