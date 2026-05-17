#!/usr/bin/env node
/**
 * degradation-chain.cjs — 降级链编排
 *
 * 绿队安全保守设计：
 * - 每个模型必须有 ≥1 个降级备选
 * - 最后一级是明确的异常（绝不静默失败）
 * - 降级链根据断路器状态动态调整
 * - 记录每次降级决策
 *
 * 默认降级链：
 *   deepseek-v4-pro → deepseek-v4-flash → minimax-2.7 → codex → 抛异常
 *   deepseek-v4-flash → deepseek-v4-pro → minimax-2.7 → codex → 抛异常
 *   minimax-2.7 → deepseek-v4-flash → codex → 抛异常
 *   codex → deepseek-v4-flash → 抛异常
 */

const keyIsolator = require("./key-isolator.cjs");
const circuitBreaker = require("./circuit-breaker.cjs");
const rateLimiter = require("./rate-limiter.cjs");

// ============================================================
// 默认降级链
// ============================================================
const DEFAULT_CHAINS = {
  "deepseek-v4-pro": ["deepseek-v4-pro", "deepseek-v4-flash", "minimax-2.7", "codex"],
  "deepseek-v4-flash": ["deepseek-v4-flash", "deepseek-v4-pro", "minimax-2.7", "codex"],
  "minimax-2.7": ["minimax-2.7", "deepseek-v4-flash", "codex"],
  "codex": ["codex", "deepseek-v4-flash"],
};

// ============================================================
// 降级决策日志
// ============================================================
const _decisionLog = [];

function _logDecision(entry) {
  entry.timestamp = new Date().toISOString();
  _decisionLog.push(entry);
  if (_decisionLog.length > 1000) _decisionLog.shift();
}

// ============================================================
// 检查模型是否可用（断路器 + 密钥 + 限流）
// ============================================================
function _isModelUsable(modelName) {
  // 1. 密钥存在
  if (!keyIsolator.isModelAvailable(modelName)) return false;

  // 2. 断路器未 OPEN
  const cbStatus = circuitBreaker.query(modelName);
  if (!cbStatus.allowed) return false;

  // 3. 限流有令牌（非阻塞检查）
  const vendor = keyIsolator.getVendorForModel(modelName);
  if (vendor && !rateLimiter.tryConsume(vendor)) return false;

  return true;
}

// ============================================================
// 获取可用降级链（动态过滤不可用模型）
// ============================================================
/**
 * 获取模型的有效降级链，按优先级排序
 * @param {string} modelName - 请求的模型名
 * @returns {{ model: string, vendor: string, available: boolean, reason?: string }[]}
 */
function getChain(modelName) {
  const chain = DEFAULT_CHAINS[modelName];
  if (!chain) return [];

  return chain.map((m) => {
    const vendor = keyIsolator.getVendorForModel(m);
    if (!vendor) {
      return { model: m, vendor: null, available: false, reason: "未知模型" };
    }

    const checks = [];

    // 密钥检查
    if (!keyIsolator.isModelAvailable(m)) {
      checks.push("密钥缺失");
    }

    // 断路器检查
    const cbStatus = circuitBreaker.query(m);
    if (!cbStatus.allowed) {
      checks.push(`断路器 ${cbStatus.state}`);
    }

    return {
      model: m,
      vendor,
      available: checks.length === 0,
      reason: checks.length > 0 ? checks.join("; ") : undefined,
    };
  });
}

// ============================================================
// 查找下一个可用模型
// ============================================================
/**
 * 从降级链中找到第一个可用的模型
 * @param {string} originalModel - 请求的模型名
 * @param {object} [opts]
 * @param {boolean} [opts.bypassCircuitBreaker] - 是否跳过断路器检查
 * @returns {{ model: string|null, vendor: string|null, chain: object[], decision: object }}
 */
function findNextAvailable(originalModel, opts = {}) {
  const chain = DEFAULT_CHAINS[originalModel];
  if (!chain || chain.length === 0) {
    const decision = {
      original_model: originalModel,
      final_model: null,
      fallback_count: 0,
      reason: "无降级链定义",
    };
    _logDecision(decision);
    return { model: null, vendor: null, chain: [], decision };
  }

  const startIndex = chain.indexOf(originalModel);
  const searchChain = startIndex >= 0 ? chain.slice(startIndex) : chain;

  for (let i = 0; i < searchChain.length; i++) {
    const model = searchChain[i];
    const vendor = keyIsolator.getVendorForModel(model);

    if (!vendor) continue;
    if (!keyIsolator.isModelAvailable(model)) continue;

    if (!opts.bypassCircuitBreaker) {
      const cbStatus = circuitBreaker.query(model);
      if (!cbStatus.allowed) continue;
    }

    // 限流检查（不阻塞）
    if (!rateLimiter.tryConsume(vendor)) continue;

    // 找到可用模型
    const decision = {
      original_model: originalModel,
      final_model: model,
      vendor,
      fallback_count: searchChain.indexOf(model),
      chain: searchChain,
      reason: model === originalModel ? "直连" : `降级到 ${model}`,
    };
    _logDecision(decision);
    return { model, vendor, chain: searchChain.slice(0, i + 1), decision };
  }

  // 降级链耗尽
  const decision = {
    original_model: originalModel,
    final_model: null,
    vendor: null,
    fallback_count: searchChain.length,
    chain: searchChain,
    reason: "降级链耗尽，所有模型不可用",
  };
  _logDecision(decision);
  return { model: null, vendor: null, chain: searchChain, decision };
}

// ============================================================
// 获取降级决策日志
// ============================================================
function getDecisionLog(limit = 50) {
  return _decisionLog.slice(-limit);
}

// ============================================================
// 配置：注册或覆盖降级链
// ============================================================
function registerChain(modelName, chain) {
  if (!Array.isArray(chain) || chain.length === 0) {
    throw new Error(`[degradation-chain] 降级链必须是非空数组`);
  }
  // 验证链中所有模型都有供应商映射
  for (const m of chain) {
    if (!keyIsolator.getVendorForModel(m)) {
      throw new Error(`[degradation-chain] 未知模型 "${m}"，无法注册降级链`);
    }
  }
  // 确保链包含自身
  if (chain[0] !== modelName) {
    chain.unshift(modelName);
  }
  DEFAULT_CHAINS[modelName] = chain;
}

module.exports = {
  findNextAvailable,
  getChain,
  getDecisionLog,
  registerChain,
  DEFAULT_CHAINS,
};
