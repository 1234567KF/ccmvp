// Auto-generated proxy - Blue Team refactor
// Real file: ../hooks/auto-memory-hook.mjs
// Uses child_process to avoid ESM top-level await require() issue
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const result = spawnSync('node', [join(__dirname, '..', 'hooks', 'auto-memory-hook.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env },
});
process.exit(result.status ?? 0);
