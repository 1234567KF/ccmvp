#!/usr/bin/env node
// kf-monitor-bridge.cjs — 监测者桥接脚本
// 连接 token-tracker 数据和 monitor 面板

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const command = process.argv[2];

function getCacheStats() {
  // 从 token-tracker 读取最新数据
  const summaryPath = path.join(__dirname, '..', '..', '.claude-flow', 'data', 'token-usage-summary.json');
  if (!fs.existsSync(summaryPath)) {
    return { error: 'no_data' };
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

  // 计算缓存命中率
  const totalHit = summary.token_total ? summary.token_total.cache_hit : 0;
  const totalIn = summary.token_total ? summary.token_total.input : 0;
  const hitRate = totalIn > 0 ? (totalHit / totalIn) * 100 : 0;

  return {
    cacheHitRate: Math.round(hitRate * 100) / 100,
    cacheHitTokens: totalHit,
    totalInputTokens: totalIn,
    status: hitRate > 50 ? 'good' : hitRate > 20 ? 'warning' : 'critical'
  };
}

function getCostByModel() {
  try {
    const trackerPath = path.join(__dirname, 'token-tracker.cjs');
    if (fs.existsSync(trackerPath)) {
      const output = execSync('node ' + trackerPath + ' cost', { encoding: 'utf-8', timeout: 10000 });
      return output;
    }
    return { error: 'token-tracker.cjs not found' };
  } catch (e) {
    return { error: e.message };
  }
}

function showStatus() {
  const stats = getCacheStats();
  if (stats.error) {
    console.log('监测者状态: 无数据（token-tracker 尚未收集数据）');
    return;
  }

  const statusEmoji = stats.status === 'good' ? '良好' : stats.status === 'warning' ? '偏低' : '过低';
  console.log('===== 监测者状态 =====');
  console.log('');
  console.log('缓存命中率: ' + stats.cacheHitRate + '% [' + statusEmoji + ']');
  console.log('缓存命中: ' + (stats.cacheHitTokens || 0).toLocaleString() + ' / 总输入: ' + (stats.totalInputTokens || 0).toLocaleString());
  console.log('');

  // 读取 token-tracker summary 获取更多信息
  const summaryPath = path.join(__dirname, '..', '..', '.claude-flow', 'data', 'token-usage-summary.json');
  if (fs.existsSync(summaryPath)) {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    if (summary.token_total) {
      console.log('Token 总计:');
      console.log('  输入: ' + (summary.token_total.input || 0).toLocaleString());
      console.log('  输出: ' + (summary.token_total.output || 0).toLocaleString());
      console.log('  缓存命中: ' + (summary.token_total.cache_hit || 0).toLocaleString());
      console.log('  缓存率: ' + (summary.token_total.cache_rate || '0%'));
    }
    if (summary.savings) {
      console.log('');
      console.log('Token 节省机制:');
      Object.entries(summary.savings).forEach(([key, val]) => {
        console.log('  ' + key + ': ' + (val || 0).toLocaleString() + ' tokens');
      });
    }
  }
}

switch (command) {
  case 'cache':
    console.log(JSON.stringify(getCacheStats(), null, 2));
    break;
  case 'cost':
    console.log(getCostByModel());
    break;
  case 'status':
    showStatus();
    break;
  default:
    console.log('使用方法: node kf-monitor-bridge.cjs [cache|cost|status]');
    console.log('');
    console.log('  cache   — 缓存命中率统计');
    console.log('  cost    — 按模型的成本汇总');
    console.log('  status  — 运行时状态概览');
}
