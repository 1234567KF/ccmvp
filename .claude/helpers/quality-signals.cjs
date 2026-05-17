#!/usr/bin/env node
/**
 * quality-signals.cjs — 统一技能产出质量信号注入层
 *
 * 职责:
 *   所有 kf- 技能在 artifact 输出前调用 emit()，追加标准化质量信号块。
 *   消费端: P0.3 浅层Plan注入、P1.2 条件review触发、Phase 2 质量信号聚合。
 *
 * 用法:
 *   const qs = require('./quality-signals.cjs');
 *   qs.emit({ skillName, artifactType, changedFiles, severity, testStatus, artifactPath });
 *
 * 验证:
 *   node {IDE_ROOT}/helpers/quality-signals.cjs --validate <json-file>
 *   node {IDE_ROOT}/helpers/schema-check.cjs --skill kf-code-review-graph
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const SIGNALS_DIR = path.join(ROOT, '.claude-flow', 'quality-signals');

// ─── Required fields ───
const REQUIRED_FIELDS = ['skillName', 'artifactType', 'changedFiles'];

const VALID_ARTIFACT_TYPES = [
  'review_report',
  'spec_doc',
  'code_files',
  'test_report',
  'alignment_record',
  'extraction_report',
  'stage_artifact',
];

const VALID_SEVERITIES = ['P0', 'P1', 'P2', 'P3'];
const VALID_TEST_STATUSES = ['none', 'passed', 'failed', 'skipped'];

// ─── Generate UUID v4 ───
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── Validate a quality_signals object ───
function validate(signals) {
  const errors = [];

  if (!signals || typeof signals !== 'object') {
    return ['signals must be an object'];
  }

  for (const field of REQUIRED_FIELDS) {
    if (!signals[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (signals.artifactType && !VALID_ARTIFACT_TYPES.includes(signals.artifactType)) {
    errors.push(`Invalid artifactType: "${signals.artifactType}". Valid: ${VALID_ARTIFACT_TYPES.join(', ')}`);
  }

  if (signals.severity && typeof signals.severity === 'object') {
    for (const [k, v] of Object.entries(signals.severity)) {
      if (!VALID_SEVERITIES.includes(k)) {
        errors.push(`Invalid severity key: "${k}". Valid: ${VALID_SEVERITIES.join(', ')}`);
      }
      if (typeof v !== 'number' || v < 0) {
        errors.push(`Severity "${k}" must be a non-negative number`);
      }
    }
  }

  if (signals.testStatus && !VALID_TEST_STATUSES.includes(signals.testStatus)) {
    errors.push(`Invalid testStatus: "${signals.testStatus}". Valid: ${VALID_TEST_STATUSES.join(', ')}`);
  }

  if (signals.changedFiles && !Array.isArray(signals.changedFiles)) {
    errors.push('changedFiles must be an array');
  }

  return errors;
}

// ─── Build the standardized quality_signals block ───
function build(signals) {
  const execId = signals.executionId || uuid();

  const block = {
    quality_signals: {
      artifact_type: signals.artifactType || 'unknown',
      timestamp: signals.timestamp || new Date().toISOString(),
      execution_id: execId,
      skill_name: signals.skillName,
      changed_files: signals.changedFiles || [],
      line_count_total: signals.lineCountTotal || 0,
      severity: {
        P0: signals.severity?.P0 ?? 0,
        P1: signals.severity?.P1 ?? 0,
        P2: signals.severity?.P2 ?? 0,
        P3: signals.severity?.P3 ?? 0,
      },
      test_status: signals.testStatus || 'none',
    },
  };

  return { block, execId };
}

// ─── Emit: validate, build, write ───
function emit(signals) {
  // 1. Validate
  const errors = validate(signals);
  if (errors.length > 0) {
    console.error(`[quality-signals] Validation errors for ${signals.skillName}:`);
    errors.forEach(e => console.error(`  - ${e}`));
    return { ok: false, errors };
  }

  // 2. Build block
  const { block, execId } = build(signals);

  // 3. Write to individual file
  if (!fs.existsSync(SIGNALS_DIR)) {
    fs.mkdirSync(SIGNALS_DIR, { recursive: true });
  }

  const signalPath = path.join(SIGNALS_DIR, `${execId}.json`);
  fs.writeFileSync(signalPath, JSON.stringify(block, null, 2), 'utf8');

  // 4. Append to aggregated log
  const logPath = path.join(ROOT, '.claude', 'logs', 'quality-signals.jsonl');
  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.appendFileSync(logPath, JSON.stringify(block) + '\n', 'utf8');

  // 5. Optionally append to artifact file
  if (signals.artifactPath && fs.existsSync(signals.artifactPath)) {
    const artifactContent = fs.readFileSync(signals.artifactPath, 'utf8');
    if (!artifactContent.includes('"quality_signals"')) {
      const appendBlock = '\n\n<!-- quality_signals -->\n```json\n' +
        JSON.stringify(block, null, 2) + '\n```\n';
      fs.appendFileSync(signals.artifactPath, appendBlock, 'utf8');
    }
  }

  return { ok: true, execId, path: signalPath };
}

// ─── Read signals by execution ID ───
function read(executionId) {
  const signalPath = path.join(SIGNALS_DIR, `${executionId}.json`);
  if (!fs.existsSync(signalPath)) return null;
  return JSON.parse(fs.readFileSync(signalPath, 'utf8'));
}

// ─── Scan all signals ───
function list() {
  if (!fs.existsSync(SIGNALS_DIR)) return [];
  return fs.readdirSync(SIGNALS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(SIGNALS_DIR, f), 'utf8'));
      return { id: f.replace('.json', ''), ...data };
    })
    .sort((a, b) => new Date(b.quality_signals?.timestamp || 0) - new Date(a.quality_signals?.timestamp || 0));
}

// ─── CLI: validate a signals file ───
function cli() {
  const args = process.argv.slice(2);

  if (args.includes('--validate')) {
    const fileIdx = args.indexOf('--validate') + 1;
    const filePath = args[fileIdx];
    if (!filePath || !fs.existsSync(filePath)) {
      console.error('Usage: node quality-signals.cjs --validate <json-file>');
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const signals = data.quality_signals
      ? { ...data.quality_signals, skillName: data.quality_signals.skill_name, artifactType: data.quality_signals.artifact_type, changedFiles: data.quality_signals.changed_files, timestamp: data.quality_signals.timestamp }
      : data;
    const errors = validate(signals);
    if (errors.length > 0) {
      console.log('❌ Validation failed:');
      errors.forEach(e => console.log(`  - ${e}`));
      process.exit(1);
    } else {
      console.log('✅ Valid quality_signals');
      process.exit(0);
    }
  }

  if (args.includes('--from-review')) {
    // Usage: node quality-signals.cjs --from-review <review-json-path> --skill-name ... --artifact-type ...
    const fileIdx = args.indexOf('--from-review') + 1;
    const filePath = args[fileIdx];
    const skillIdx = args.indexOf('--skill-name');
    const skillName = skillIdx !== -1 ? args[skillIdx + 1] : 'kf-code-review-graph';
    const typeIdx = args.indexOf('--artifact-type');
    const artifactType = typeIdx !== -1 ? args[typeIdx + 1] : 'review_report';

    if (!filePath || !fs.existsSync(filePath)) {
      console.error('Usage: node quality-signals.cjs --from-review <review-json-path> [--skill-name ...] [--artifact-type ...]');
      process.exit(1);
    }

    const reviewData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const report = reviewData.review_report || reviewData;

    const issues = report.issues || [];
    const severity = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const issue of issues) {
      if (severity.hasOwnProperty(issue.severity)) {
        severity[issue.severity]++;
      }
    }

    const changedFiles = issues.map(i => i.file).filter((v, i, a) => a.indexOf(v) === i);

    const result = emit({
      skillName,
      artifactType,
      changedFiles,
      lineCountTotal: report.total_files || changedFiles.length,
      severity,
      testStatus: report.checklist_audit?.errors?.length > 0 ? 'failed' : 'passed',
    });

    if (result.ok) {
      console.log(`✅ quality_signals emitted: ${result.execId}`);
      process.exit(0);
    } else {
      console.error('❌ Failed to emit quality_signals:', result.errors);
      process.exit(1);
    }
  }

  if (args.includes('--list')) {
    const signals = list();
    console.log(`Total signals: ${signals.length}`);
    signals.slice(0, 10).forEach(s => {
      const qs = s.quality_signals || {};
      console.log(`  ${s.id} | ${qs.skill_name || '?'} | ${qs.artifact_type || '?'} | ${new Date(qs.timestamp).toISOString()}`);
    });
    process.exit(0);
  }

  // Default: show usage
  console.log('quality-signals.cjs — 质量信号注入层');
  console.log('  node {IDE_ROOT}/helpers/quality-signals.cjs --validate <file>');
  console.log('  node {IDE_ROOT}/helpers/quality-signals.cjs --list');
}

if (require.main === module) {
  cli();
}

module.exports = { emit, validate, build, read, list, uuid, VALID_ARTIFACT_TYPES, VALID_SEVERITIES, VALID_TEST_STATUSES };

