#!/usr/bin/env node
/**
 * rate-limiter.cjs — 令牌桶限流（简化版）
 *
 * 融合自绿队，但改为 registry 驱动。
 * 只保留令牌桶核心逻辑，移除可选参数重载的复杂性。
 *
 * 设计原则：
 *  - 按 providerId 独立令牌桶，互不干扰
 *  - rateLimit 配置自动从 model-registry.json 读取（有默认值兜底）
 *  - 提供 tryConsume（非阻塞）和 consume（可等待）两种模式
 */

const registry = require("./model-provider-registry.cjs");

// ─── 默认限流配置（当 registry 中未配置时使用） ────────────────────────
const DEFAULT_LIMITS = {
  deepseek: { capacity: 16, fillRate: 0.26, maxQueueTime: 5000, refillInterval: 1000 },
  minimax: { capacity: 24, fillRate: 0.4, maxQueueTime: 5000, refillInterval: 1000 },
  kimi: { capacity: 16, fillRate: 0.26, maxQueueTime: 5000, refillInterval: 1000 },
};

// ─── 令牌桶存储 ────────────────────────────────────────────────────────
const _buckets = new Map();
const _stats = { totalRequests: 0, totalThrottled: 0, totalWaited: 0, totalWaitedSuccess: 0, totalWaitedTimeout: 0 };

/**
 * 获取某供应商的限流配置（优先 registry，其次默认值）。
 */
function _getRateLimit(providerId) {
  const rl = registry.getProviderRateLimit(providerId);
  if (rl && rl.capacity != null) return rl;
  return DEFAULT_LIMITS[providerId] || { capacity: 10, fillRate: 0.1, maxQueueTime: 5000, refillInterval: 1000 };
}

/**
 * 获取或创建令牌桶。
 */
function _getBucket(providerId) {
  if (!_buckets.has(providerId)) {
    const limits = _getRateLimit(providerId);
    _buckets.set(providerId, {
      provider: providerId,
      tokens: limits.capacity,
      capacity: limits.capacity,
      fillRate: limits.fillRate,
      maxQueueTime: limits.maxQueueTime,
      refillInterval: limits.refillInterval,
      lastRefill: Date.now(),
      config: { ...limits },
    });
  }
  return _buckets.get(providerId);
}

/**
 * 填充令牌（按时间间隔补充）。
 */
function _refill(providerId) {
  const bucket = _getBucket(providerId);
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor((elapsed / 1000) * bucket.fillRate);
  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(bucket.tokens + tokensToAdd, bucket.capacity);
    bucket.lastRefill = now;
  }
}

/**
 * 尝试消耗令牌（非阻塞）。
 * @param {string} providerId
 * @returns {boolean} 是否成功获取令牌
 */
function tryConsume(providerId) {
  _refill(providerId);
  const bucket = _getBucket(providerId);
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    _stats.totalRequests++;
    return true;
  }
  return false;
}

/**
 * 消耗令牌（可等待，最多 maxQueueTime ms）。
 * @param {string} providerId
 * @returns {Promise<boolean>}
 */
async function consume(providerId) {
  if (tryConsume(providerId)) return true;

  const bucket = _getBucket(providerId);
  _stats.totalThrottled++;
  _stats.totalWaited++;

  return new Promise((resolve) => {
    const startTime = Date.now();
    const check = () => {
      _refill(providerId);
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        _stats.totalRequests++;
        _stats.totalWaitedSuccess++;
        resolve(true);
        return;
      }
      if (Date.now() - startTime >= bucket.maxQueueTime) {
        _stats.totalWaitedTimeout++;
        resolve(false);
        return;
      }
      setTimeout(check, bucket.refillInterval);
    };
    setTimeout(check, bucket.refillInterval);
  });
}

/**
 * 获取桶状态。
 */
function getStatus(providerId) {
  const bucket = _getBucket(providerId);
  _refill(providerId);
  return {
    provider: bucket.provider,
    tokens: bucket.tokens,
    capacity: bucket.capacity,
    utilization: 1 - bucket.tokens / bucket.capacity,
    fillRate: bucket.fillRate,
    maxQueueTime: bucket.maxQueueTime,
  };
}

/**
 * 获取所有桶状态。
 */
function getAllStatus() {
  const result = {};
  // 遍历所有已创建的桶 + 已知供应商
  const providerIds = new Set([..._buckets.keys(), ...Object.keys(DEFAULT_LIMITS)]);
  for (const pid of providerIds) {
    result[pid] = getStatus(pid);
  }
  return result;
}

/**
 * 获取统计。
 */
function getStats() {
  return { ..._stats };
}

/**
 * 重置桶。
 */
function reset(providerId) {
  _buckets.delete(providerId);
}

function resetAll() {
  _buckets.clear();
}

module.exports = {
  tryConsume,
  consume,
  getStatus,
  getAllStatus,
  getStats,
  reset,
  resetAll,
};
