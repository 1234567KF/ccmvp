#!/usr/bin/env node
// kf-saver-hook.cjs — 自动缓存检测
// 读取 token-tracker 数据，分析缓存命中率
// 命中率 < 30% 时输出优化建议

const fs = require('fs');
const path = require('path');

const TRACES_FILE = path.join(__dirname, '..', '..', '.claude-flow', 'data', 'skill-traces.jsonl');

function analyzeCacheHitRate() {
  if (!fs.existsSync(TRACES_FILE)) {
    console.log('{"cacheHitRate": null, "status": "no_data"}');
    return;
  }

  const lines = fs.readFileSync(TRACES_FILE, 'utf-8').trim().split('\n').filter(Boolean);
  const recentLines = lines.slice(-50); // 最近 50 条

  let totalHit = 0;
  let totalMiss = 0;

  for (const line of recentLines) {
    try {
      const entry = JSON.parse(line);
      totalHit += entry.cache_hit || 0;
      totalMiss += (entry.tokens_in || 0) - (entry.cache_hit || 0);
    } catch (e) {
      // skip malformed lines
    }
  }

  const totalTokens = totalHit + totalMiss;
  const cacheHitRate = totalTokens > 0 ? (totalHit / totalTokens) * 100 : null;

  console.log(JSON.stringify({
    cacheHitRate: cacheHitRate ? Math.round(cacheHitRate * 100) / 100 : null,
    totalTokens,
    cacheHitTokens: totalHit,
    status: cacheHitRate === null ? 'no_data' : cacheHitRate < 30 ? 'low' : 'good',
    recommendation: cacheHitRate < 30
      ? '缓存命中率低于 30%。建议检查 system prompt 是否统一前缀，或使用长文档预热策略。详见 {IDE_ROOT}/rules/cache-optimization.md'
      : undefined
  }));
}

function main() {
  const cmd = process.argv[2];

  switch (cmd) {
    case 'auto-detect':
      analyzeCacheHitRate();
      break;
    case 'analyze':
      // 从 stdin 读取 token-tracker 输出并分析
      let input = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => { input += chunk; });
      process.stdin.on('end', () => {
        try {
          const data = JSON.parse(input);
          console.log(JSON.stringify({ analyzed: true, input: data }, null, 2));
        } catch {
          console.log(JSON.stringify({ analyzed: true, raw: input.trim() }));
        }
      });
      break;
    default:
      console.log(`Usage: node ${path.basename(__filename)} <auto-detect|analyze>`);
      process.exit(1);
  }
}

main();

