#!/usr/bin/env node
/**
 * health-probe.cjs — 健康探测
 *
 * 绿队安全保守设计：
 * - 主动探测：每 60s 对可用供应商发轻量请求验证模型可达
 * - 被动探测：从实际调用失败中学习
 * - 状态广播：全局共享健康状态
 * - 非 DeepSeek 供应商使用通用探测方式
 *
 * 探测方式：
 *   - DeepSeek：发最短 completion（"ok"）
 *   - MiniMax：发最短 completion
 *   - Codex：发最短 completion
 *   统一为：发送 model list 或 completions 请求验证可达性
 */

const keyIsolator = require("./key-isolator.cjs");
const circuitBreaker = require("./circuit-breaker.cjs");

// ============================================================
// 健康状态存储
// ============================================================
const _healthState = new Map(); // vendorName → { healthy, lastCheck, lastSuccess, lastFailure, consecutiveFailures }
let _probeInterval = null;
let _probeRunning = false;

// ============================================================
// 探测配置
// ============================================================
const PROBE_INTERVAL = 60000; // 60s
const PROBE_TIMEOUT = 10000; // 10s
const CONSECUTIVE_FAILURE_LIMIT = 2; // 连续失败 N 次标记不健康

// ============================================================
// 获取或创建健康状态
// ============================================================
function _getHealth(vendorName) {
  if (!_healthState.has(vendorName)) {
    _healthState.set(vendorName, {
      vendor: vendorName,
      healthy: false, // 初始未知
      lastCheck: null,
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
      totalProbes: 0,
      totalSuccesses: 0,
      totalFailures: 0,
    });
  }
  return _healthState.get(vendorName);
}

// ============================================================
// 执行单次探测
// ============================================================
async function _probeVendor(vendorName) {
  const state = _getHealth(vendorName);

  // 如果供应商无密钥，跳过探测
  if (!keyIsolator.isVendorAvailable(vendorName)) {
    state.healthy = false;
    state.lastCheck = new Date().toISOString();
    state.lastFailure = state.lastCheck;
    return false;
  }

  try {
    const client = keyIsolator.getClient(vendorName);
    state.totalProbes++;

    // 统一探测方式：发送短 completion 请求
    // 使用 chat/completions 端点（所有供应商都支持）
    const response = await client.post("/chat/completions", {
      model: vendorName === "deepseek" ? "deepseek-chat" :
             vendorName === "minimax" ? "minimax-2.7" :
             "gpt-3.5-turbo",
      messages: [{ role: "user", content: "ok" }],
      max_tokens: 2,
      temperature: 0,
    }, {
      timeout: PROBE_TIMEOUT,
      // 不抛出 HTTP 错误，由我们自己处理
      validateStatus: () => true,
    });

    const now = new Date().toISOString();
    state.lastCheck = now;

    if (response.status >= 200 && response.status < 500) {
      // 2xx-4xx 都算可达（4xx 可能是鉴权问题，但网络可达）
      state.healthy = true;
      state.lastSuccess = now;
      state.consecutiveFailures = 0;
      state.totalSuccesses++;
      return true;
    }

    // 5xx 服务端错误
    state.lastFailure = now;
    state.consecutiveFailures++;
    state.totalFailures++;

    if (state.consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
      state.healthy = false;
      console.error(`[health-probe] ${vendorName} 连续 ${state.consecutiveFailures} 次探测失败，标记不健康`);
    }

    return false;
  } catch (err) {
    const now = new Date().toISOString();
    state.lastCheck = now;
    state.lastFailure = now;
    state.consecutiveFailures++;
    state.totalFailures++;

    if (state.consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
      state.healthy = false;
      console.error(`[health-probe] ${vendorName} 探测异常: ${err.message}`);
    }

    return false;
  }
}

// ============================================================
// 探测所有可用供应商
// ============================================================
async function probeAll() {
  if (_probeRunning) return;
  _probeRunning = true;

  const results = {};
  for (const vendorName of keyIsolator.VENDOR_NAMES) {
    try {
      results[vendorName] = await _probeVendor(vendorName);
    } catch (err) {
      results[vendorName] = false;
      console.error(`[health-probe] ${vendorName} 探测异常: ${err.message}`);
    }
  }

  _probeRunning = false;
  return results;
}

// ============================================================
// 启动周期性探测
// ============================================================
function start(interval) {
  if (_probeInterval) {
    console.error("[health-probe] 探测已启动，忽略重复启动");
    return;
  }

  // 立即执行首次探测
  probeAll().catch((err) => {
    console.error(`[health-probe] 首次探测失败: ${err.message}`);
  });

  _probeInterval = setInterval(() => {
    probeAll().catch((err) => {
      console.error(`[health-probe] 定时探测失败: ${err.message}`);
    });
  }, interval || PROBE_INTERVAL);

  // 不阻止进程退出
  if (_probeInterval && _probeInterval.unref) {
    _probeInterval.unref();
  }

  console.error(`[health-probe] 健康探测已启动，间隔 ${interval || PROBE_INTERVAL}ms`);
}

// ============================================================
// 停止周期性探测
// ============================================================
function stop() {
  if (_probeInterval) {
    clearInterval(_probeInterval);
    _probeInterval = null;
    console.error("[health-probe] 健康探测已停止");
  }
}

// ============================================================
// 查询健康状态
// ============================================================
function isHealthy(vendorName) {
  const state = _healthState.get(vendorName);
  if (!state) {
    // 未探测过，默认可用（有密钥则标记未知）
    if (keyIsolator.isVendorAvailable(vendorName)) {
      return true; // 乐观假设
    }
    return false;
  }
  return state.healthy;
}

/**
 * 查询模型健康状态
 * @param {string} modelName
 * @returns {boolean}
 */
function isModelHealthy(modelName) {
  const vendor = keyIsolator.getVendorForModel(modelName);
  if (!vendor) return false;
  return isHealthy(vendor);
}

// ============================================================
// 获取健康状态详情
// ============================================================
function getStatus(vendorName) {
  return _healthState.get(vendorName) || {
    vendor: vendorName,
    healthy: null,
    lastCheck: null,
    lastSuccess: null,
    lastFailure: null,
    consecutiveFailures: 0,
    totalProbes: 0,
  };
}

function getAllStatus() {
  const result = {};
  for (const vendorName of keyIsolator.VENDOR_NAMES) {
    result[vendorName] = getStatus(vendorName);
  }
  return result;
}

// ============================================================
// 被动失败记录（从实际调用中学习）
// ============================================================
function recordFailure(vendorName) {
  const state = _getHealth(vendorName);
  state.consecutiveFailures++;
  state.totalFailures++;
  state.lastFailure = new Date().toISOString();

  if (state.consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
    state.healthy = false;
    console.error(`[health-probe] ${vendorName} 被动探测：连续 ${state.consecutiveFailures} 次失败，标记不健康`);
  }
}

function recordSuccess(vendorName) {
  const state = _getHealth(vendorName);
  state.healthy = true;
  state.consecutiveFailures = 0;
  state.lastSuccess = new Date().toISOString();
  state.totalSuccesses++;
}

module.exports = {
  start,
  stop,
  probeAll,
  isHealthy,
  isModelHealthy,
  getStatus,
  getAllStatus,
  recordFailure,
  recordSuccess,
};
