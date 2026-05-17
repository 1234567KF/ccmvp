#!/usr/bin/env node
/**
 * safe-router.cjs — 全自动多模型智能调度系统主入口
 *
 * 整合 key-isolator + circuit-breaker + rate-limiter + degradation-chain + health-probe
 *
 * 绿队安全保守设计：
 * - 安全第一：密钥隔离是最高优先级，宁可降级不可泄露
 * - 容错优先：每次模型调用必须有降级方案
 * - 向后兼容：不影响现有任何功能
 *
 * 用法：
 *   const safeRouter = require("./safe-router.cjs");
 *   const result = await safeRouter.route("deepseek-v4-pro", { messages: [...] });
 *
 * CLI 模式：
 *   node {IDE_ROOT}/helpers/safe-router.cjs route --model deepseek-v4-pro --prompt "hello"
 *   node {IDE_ROOT}/helpers/safe-router.cjs status
 */

const keyIsolator = require("./key-isolator.cjs");
const circuitBreaker = require("./circuit-breaker.cjs");
const rateLimiter = require("./rate-limiter.cjs");
const degradationChain = require("./degradation-chain.cjs");
const healthProbe = require("./health-probe.cjs");

// ============================================================
// 路由日志
// ============================================================
const _routeLog = [];
const MAX_LOG = 1000;

function _logRoute(entry) {
  entry.timestamp = new Date().toISOString();
  _routeLog.push(entry);
  if (_routeLog.length > MAX_LOG) _routeLog.shift();
}

// ============================================================
// 向后兼容映射
// ============================================================
// 旧名 → 新名映射（保持现有 pro/flash 引用有效）
const _aliasMap = {
  "pro": "deepseek-v4-pro",
  "flash": "deepseek-v4-flash",
  "sonnet": "deepseek-v4-flash", // 原 sonnet 映射到 flash
  "opus": "deepseek-v4-pro",     // 原 opus 映射到 pro
};

// ============================================================
// 全局状态
// ============================================================
let _initialized = false;
let _enabled = false; // 默认关闭，需 env SAFE_ROUTER_ENABLED=true 开启

// ============================================================
// 初始化
// ============================================================
function init() {
  if (_initialized) return;

  // 是否启用：通过环境变量控制
  _enabled = process.env.SAFE_ROUTER_ENABLED === "true";

  if (_enabled) {
    // 启动健康探测（unref 模式，不阻止进程退出）
    healthProbe.start();
    console.error("[safe-router] kf-model-router 已启用 — 多供应商智能调度");
  } else {
    console.error("[safe-router] kf-model-router 未启用（SAFE_ROUTER_ENABLED != true），使用默认路由");
  }

  _initialized = true;
}

// ============================================================
// 解析模型名（处理别名和向后兼容）
// ============================================================
function resolveModelName(model) {
  if (!model) return "deepseek-v4-flash";
  // 直接匹配
  if (keyIsolator.getVendorForModel(model)) return model;
  // 别名映射
  if (_aliasMap[model]) return _aliasMap[model];
  // 未知模型，返回默认
  console.error(`[safe-router] 未知模型 "${model}"，使用默认 deepseek-v4-flash`);
  return "deepseek-v4-flash";
}

// ============================================================
// 核心路由函数
// ============================================================
/**
 * 执行模型路由：选择可用模型 → 发送请求 → 处理降级
 *
 * @param {string} modelName - 请求的模型名
 * @param {object} requestConfig - 请求配置
 * @param {object} [options]
 * @param {boolean} [options.allowFallback=true] - 是否允许降级
 * @param {number} [options.maxFallbacks] - 最大降级次数
 * @returns {Promise<{ success: boolean, data?: object, model: string, vendor: string, fallback: boolean, fallbackChain: string[], latency: number, error?: string }>}
 */
async function route(modelName, requestConfig, options = {}) {
  const startTime = Date.now();
  const allowFallback = options.allowFallback !== false;
  const resolvedModel = resolveModelName(modelName);

  if (!_initialized) init();

  // 未启用 safe-router：直通 DeepSeek（向后兼容）
  if (!_enabled) {
    // 直通模式：直接调用 DeepSeek
    return _routeDirect(resolvedModel, requestConfig, startTime);
  }

  // 启用 safe-router：使用降级链
  return _routeWithFallback(resolvedModel, requestConfig, options, startTime);
}

// ============================================================
// 直通模式（向后兼容 — 行为与旧 kf-model-router 一致）
// ============================================================
async function _routeDirect(modelName, requestConfig, startTime) {
  // 只走 DeepSeek
  const vendor = "deepseek";
  try {
    const client = keyIsolator.getClient(vendor);
    const response = await client.post("/chat/completions", {
      model: modelName,
      ...requestConfig,
    });

    const latency = Date.now() - startTime;

    _logRoute({
      model: modelName,
      vendor,
      decision: "direct",
      fallback: false,
      latency,
      success: true,
    });

    return {
      success: true,
      data: response.data,
      model: modelName,
      vendor,
      fallback: false,
      fallbackChain: [modelName],
      latency,
    };
  } catch (err) {
    const latency = Date.now() - startTime;
    const errorMessage = err.response?.data?.error?.message || err.message || "未知错误";

    circuitBreaker.recordFailure(modelName, errorMessage);
    healthProbe.recordFailure(vendor);

    _logRoute({
      model: modelName,
      vendor,
      decision: "error",
      fallback: false,
      latency,
      success: false,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      model: modelName,
      vendor,
      fallback: false,
      fallbackChain: [modelName],
      latency,
    };
  }
}

// ============================================================
// 降级模式（完整 safe-router 路由）
// ============================================================
async function _routeWithFallback(modelName, requestConfig, options, startTime) {
  const chain = degradationChain.DEFAULT_CHAINS[modelName] || [modelName];
  let lastError = null;
  const attemptedModels = [];

  for (const candidateModel of chain) {
    const vendor = keyIsolator.getVendorForModel(candidateModel);

    // 跳过无供应商映射的模型
    if (!vendor) continue;

    // 检查密钥
    if (!keyIsolator.isModelAvailable(candidateModel)) {
      attemptedModels.push({ model: candidateModel, reason: "密钥缺失" });
      continue;
    }

    // 检查健康状态
    if (!healthProbe.isModelHealthy(candidateModel)) {
      attemptedModels.push({ model: candidateModel, reason: "健康探测不通过" });
      continue;
    }

    // 检查断路器
    const cbStatus = circuitBreaker.query(candidateModel);
    if (!cbStatus.allowed) {
      attemptedModels.push({ model: candidateModel, reason: `断路器 ${cbStatus.state}` });
      continue;
    }

    // 限流
    const hasToken = await rateLimiter.consume(vendor);
    if (!hasToken) {
      attemptedModels.push({ model: candidateModel, reason: "限流（令牌不足）" });
      continue;
    }

    // 发送请求
    try {
      const client = keyIsolator.getClient(vendor);
      const response = await client.post("/chat/completions", {
        model: candidateModel,
        ...requestConfig,
      });

      const latency = Date.now() - startTime;

      // 记录成功
      circuitBreaker.recordSuccess(candidateModel);
      healthProbe.recordSuccess(vendor);

      const isFallback = candidateModel !== modelName;

      _logRoute({
        model: candidateModel,
        vendor,
        original_model: modelName,
        decision: isFallback ? "fallback" : "direct",
        fallback: isFallback,
        fallback_count: attemptedModels.length,
        chain: chain,
        latency,
        success: true,
      });

      return {
        success: true,
        data: response.data,
        model: candidateModel,
        vendor,
        fallback: isFallback,
        fallbackChain: attemptedModels.map((a) => a.model).concat(candidateModel),
        latency,
        _fallbackInfo: isFallback ? {
          original_model: modelName,
          attempts: attemptedModels,
          final_model: candidateModel,
        } : undefined,
      };
    } catch (err) {
      const errorMessage = err.response?.data?.error?.message || err.message || "未知错误";
      lastError = errorMessage;

      circuitBreaker.recordFailure(candidateModel, errorMessage);
      healthProbe.recordFailure(vendor);

      attemptedModels.push({ model: candidateModel, reason: errorMessage });
    }
  }

  // 所有模型都不可用
  const latency = Date.now() - startTime;

  _logRoute({
    model: modelName,
    vendor: null,
    decision: "exhausted",
    fallback: true,
    fallback_count: attemptedModels.length,
    chain,
    latency,
    success: false,
    error: lastError || "降级链耗尽",
  });

  return {
    success: false,
    error: lastError || "降级链耗尽，所有模型不可用",
    model: modelName,
    vendor: null,
    fallback: true,
    fallbackChain: attemptedModels.map((a) => a.model),
    latency,
  };
}

// ============================================================
// 状态查询
// ============================================================
function getStatus() {
  return {
    enabled: _enabled,
    initialized: _initialized,
    vendors: keyIsolator.listVendorStatus(),
    circuitBreakers: circuitBreaker.getAllStatus(),
    rateLimiters: rateLimiter.getAllStatus(),
    healthProbes: healthProbe.getAllStatus(),
    degradationChains: degradationChain.DEFAULT_CHAINS,
    availableModels: keyIsolator.listAvailableModels(),
  };
}

function getRouteLog(limit = 50) {
  return _routeLog.slice(-limit);
}

// ============================================================
// 手动刷新供应商可用性
// ============================================================
function refreshVendor(vendorName) {
  if (vendorName) {
    keyIsolator.refreshAvailability(vendorName);
    healthProbe.probeAll().catch(() => {});
    return;
  }
  // 刷新所有
  for (const v of keyIsolator.VENDOR_NAMES) {
    keyIsolator.refreshAvailability(v);
  }
  healthProbe.probeAll().catch(() => {});
}

// ============================================================
// CLI 模式
// ============================================================
async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case "route":
      await _cliRoute(args);
      break;
    case "status":
      console.log(JSON.stringify(getStatus(), null, 2));
      break;
    case "log":
      console.log(JSON.stringify(getRouteLog(parseInt(args[0]) || 50), null, 2));
      break;
    case "refresh":
      refreshVendor(args[0] || null);
      console.log(JSON.stringify({ refreshed: true }));
      break;
    default:
      console.log(`用法:
  node safe-router.cjs route --model <model> [--prompt <text>]
  node safe-router.cjs status
  node safe-router.cjs log [count]
  node safe-router.cjs refresh [vendor]
`);
  }
}

async function _cliRoute(args) {
  let model = "deepseek-v4-flash";
  let prompt = "hello";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) model = args[i + 1];
    if (args[i] === "--prompt" && args[i + 1]) prompt = args[i + 1];
  }

  console.error(`[safe-router] CLI route: model=${model}, prompt="${prompt.substring(0, 50)}..."`);
  const result = await route(model, {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 50,
  });
  console.log(JSON.stringify(result, null, 2));
}

// ============================================================
// 自动初始化（require 时）
// ============================================================
init();

// ============================================================
// 模块导出
// ============================================================
module.exports = {
  route,
  init,
  getStatus,
  getRouteLog,
  refreshVendor,
  keyIsolator,
  circuitBreaker,
  rateLimiter,
  degradationChain,
  healthProbe,
};

