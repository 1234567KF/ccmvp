#!/usr/bin/env node
/**
 * tokenforge-hook.cjs — PreToolUse hook that appends tokenforge piping
 * to Bash commands for automatic output compression.
 *
 * Usage in settings.json PreToolUse for Bash:
 *   "node .claude/helpers/tokenforge-hook.cjs"
 */

const TOKENFORGE = require('path').join(__dirname, 'tokenforge.cjs');

async function main() {
  let stdin = '';
  if (!process.stdin.isTTY) {
    stdin = await new Promise(resolve => {
      let d = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', c => { d += c; });
      process.stdin.on('end', () => resolve(d));
      process.stdin.resume();
      setTimeout(() => resolve(d), 300);
    });
  }

  if (!stdin.trim()) { process.exit(0); }

  try {
    const hook = JSON.parse(stdin);
    const command = hook.tool_input?.command || hook.tool_input?.cmd || '';
    if (!command) { process.exit(0); }

    // Skip if already piped to tokenforge or lean-ctx
    if (command.includes('tokenforge.cjs') || command.includes('lean-ctx')) {
      process.exit(0);
    }

    // Don't wrap interactive commands, editors, or package managers (output may be needed raw)
    if (/^(git\s+(push|commit|log|diff|show|stash|add|reset|checkout|switch|restore|merge|rebase)|npm\s+(install|uninstall|update|run)|yarn\s|pnpm\s|cargo\s|pip\s|docker\s+(build|run|compose)|ssh\s|scp\s|curl\s|wget\s|\w+\.(sh|ps1|bat)\s)/.test(command.trim())) {
      // These commands' output may be important to see raw — skip compression
      process.exit(0);
    }

    // Commands that benefit from compression: test runners, build tools, logs, grep, find, etc.
    const shouldCompress = /(test|spec|jest|mocha|vitest|pytest|go test|cargo test|npm test|yarn test|npm run|lint|eslint|prettier|check|build|compile|make|cmake|gcc|g\+\+|rustc|logs?|tail|cat|find|grep|rg|ls|dir|tree|du|df|ps|top|netstat|systemctl|journalctl|node\s|python\s|go\s+(run|build|test)|tsc)\b/.test(command.trim()) ||
                          command.includes('>') || command.includes('|');

    if (!shouldCompress) { process.exit(0); }

    // Modify command: append tokenforge piping (avoid duplicating 2>&1)
    const cleanCmd = command.replace(/\s*2>&1\s*$/g, '').trimEnd();
    const level = 'medium';
    const wrapped = `${cleanCmd} 2>&1 | node "${TOKENFORGE}" compress --type output --level ${level}`;
    process.stdout.write(JSON.stringify({ ...hook, tool_input: { ...hook.tool_input, command: wrapped } }));
  } catch {
    process.exit(0);
  }
}

main().catch(() => process.exit(0));
