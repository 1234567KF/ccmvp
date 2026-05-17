#!/usr/bin/env node
/**
 * circuit-breaker.cjs — 断路器模式
 *
 * 绿队安全保守设计：
 * - 每个模型独立断路器（CLOSED / OPEN / HALF_OPEN）
 * - 连续失败达到阈值 → OPEN
 * - 超时后 → HALF_OPEN → 试探1个请求 → 成功则 CLOSED
 * - 线程安全：所有操作同步，无竞态
 * - 事件日志记录所有状态变更
 *
 * 状态机：
 *   CLOSED ──(连续失败 >= threshold)──▶ OPEN
 *   OPEN ──(timeout 到期)──▶ HALF_OPEN
 *   HALF_OPEN ──(试探成功)──▶ CLOSED
 *   HALF_OPEN ──(试探失败)──▶ OPEN
 */

// ============================================================
// 默认配置
// ============================================================
const DEFAULTS = {
  failureThreshold: 3,    // 连续失败次数 → OPEN
  successThreshold: 2,    // 半开状态连续成功次数 → CLOSED
  timeout: 30000,         // OPEN → HALF_OPEN 等待时间 (ms)
  halfOpenMaxRequests: 1, // 半开状态允许最大试探请求数
};

const STATE = {
  CLOSED: "CLOSED",
  OPEN: "OPEN",
  HALF_OPEN: "HALF_OPEN",
};

// ============================================================
// 断路器实例存储
// ============================================================
const _breakers = new Map();
const _eventLog = [];

// ============================================================
// 事件日志
// ============================================================
function _logEvent(entry) {
  entry.timestamp = new Date().toISOString();
  _eventLog.push(entry);
  // 最多保留 1000 条
  if (_eventLog.length > 1000) _eventLog.shift();
  console.error(`[circuit-breaker] ${entry.model}: ${entry.from} → ${entry.to} — ${entry.reason}`);
}

// ============================================================
// 创建或获取断路器
// ============================================================
function _getBreaker(modelName, opts = {}) {
  if (!_breakers.has(modelName)) {
    _breakers.set(modelName, {
      model: modelName,
      state: STATE.CLOSED,
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      lastOpenTime: 0,
      config: {
        failureThreshold: opts.failureThreshold || DEFAULTS.failureThreshold,
        successThreshold: opts.successThreshold || DEFAULTS.successThreshold,
        timeout: opts.timeout || DEFAULTS.timeout,
        halfOpenMaxRequests: opts.halfOpenMaxRequests || DEFAULTS.halfOpenMaxRequests,
      },
      halfOpenRequests: 0,
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
    });
  }
  return _breakers.get(modelName);
}

// ============================================================
// 查询断路器状态
// ============================================================
/**
 * 查询模型是否可用（可以放行请求）
 * @param {string} modelName
 * @param {object} [opts]
 * @returns {{ allowed: boolean, state: string, reason?: string }}
 */
function query(modelName, opts = {}) {
  const cb = _getBreaker(modelName, opts);
  const now = Date.now();

  if (cb.state === STATE.CLOSED) {
    return { allowed: true, state: STATE.CLOSED };
  }

  if (cb.state === STATE.OPEN) {
    // 检查 timeout 是否到期
    if (now - cb.lastOpenTime >= cb.config.timeout) {
      cb.state = STATE.HALF_OPEN;
      cb.halfOpenRequests = 0;
      _logEvent({
        model: modelName,
        from: STATE.OPEN,
        to: STATE.HALF_OPEN,
        reason: "timeout 到期，进入半开试探",
      });
      return { allowed: true, state: STATE.HALF_OPEN, note: "half-open probe" };
    }
    return { allowed: false, state: STATE.OPEN, reason: "断路器 OPEN，拒绝请求" };
  }

  // HALF_OPEN：只允许有限试探请求
  if (cb.state === STATE.HALF_OPEN) {
    if (cb.halfOpenRequests < cb.config.halfOpenMaxRequests) {
      cb.halfOpenRequests++;
      return { allowed: true, state: STATE.HALF_OPEN, note: "half-open probe" };
    }
    return { allowed: false, state: STATE.HALF_OPEN, reason: "半开状态，试探请求已达上限" };
  }

  return { allowed: false, state: cb.state, reason: "未知状态" };
}

// ============================================================
// 记录成功
// ============================================================
function recordSuccess(modelName) {
  const cb = _getBreaker(modelName);
  cb.totalCalls++;
  cb.totalSuccesses++;
  cb.failureCount = 0; // 重置失败计数

  if (cb.state === STATE.HALF_OPEN) {
    cb.successCount++;
    if (cb.successCount >= cb.config.successThreshold) {
      const oldState = cb.state;
      cb.state = STATE.CLOSED;
      cb.successCount = 0;
      cb.halfOpenRequests = 0;
      _logEvent({
        model: modelName,
        from: oldState,
        to: STATE.CLOSED,
        reason: `半开试探成功 ${cb.config.successThreshold} 次，恢复关闭`,
      });
    }
  }

  if (cb.state === STATE.CLOSED) {
    cb.successCount = Math.min(cb.successCount + 1, cb.config.successThreshold);
  }
}

// ============================================================
// 记录失败
// ============================================================
function recordFailure(modelName, reason = "unknown") {
  const cb = _getBreaker(modelName);
  cb.totalCalls++;
  cb.totalFailures++;
  cb.lastFailureTime = Date.now();
  cb.successCount = 0; // 重置半开成功计数

  if (cb.state === STATE.HALF_OPEN) {
    const oldState = cb.state;
    cb.state = STATE.OPEN;
    cb.lastOpenTime = Date.now();
    _logEvent({
      model: modelName,
      from: oldState,
      to: STATE.OPEN,
      reason: `半开试探失败: ${reason}`,
    });
    return;
  }

  cb.failureCount++;

  if (cb.state === STATE.CLOSED && cb.failureCount >= cb.config.failureThreshold) {
    const oldState = cb.state;
    cb.state = STATE.OPEN;
    cb.lastOpenTime = Date.now();
    _logEvent({
      model: modelName,
      from: oldState,
      to: STATE.OPEN,
      reason: `连续失败 ${cb.failureCount} 次 ≥ 阈值 ${cb.config.failureThreshold}`,
    });
  }
}

// ============================================================
// 手动重置断路器
// ============================================================
function reset(modelName) {
  if (_breakers.has(modelName)) {
    const cb = _breakers.get(modelName);
    const oldState = cb.state;
    cb.state = STATE.CLOSED;
    cb.failureCount = 0;
    cb.successCount = 0;
    cb.halfOpenRequests = 0;
    _logEvent({
      model: modelName,
      from: oldState,
      to: STATE.CLOSED,
      reason: "手动重置",
    });
  }
}

// ============================================================
// 获取断路器状态快照
// ============================================================
function getStatus(modelName) {
  const cb = _breakers.get(modelName);
  if (!cb) {
    return { model: modelName, state: STATE.CLOSED, initialized: false };
  }
  return {
    model: cb.model,
    state: cb.state,
    failureCount: cb.failureCount,
    successCount: cb.successCount,
    totalCalls: cb.totalCalls,
    totalFailures: cb.totalFailures,
    totalSuccesses: cb.totalSuccesses,
    lastFailureTime: cb.lastFailureTime ? new Date(cb.lastFailureTime).toISOString() : null,
    lastOpenTime: cb.lastOpenTime ? new Date(cb.lastOpenTime).toISOString() : null,
    config: { ...cb.config },
    initialized: true,
  };
}

/**
 * 获取所有断路器状态
 * @returns {Object}
 */
function getAllStatus() {
  const result = {};
  for (const [modelName] of _breakers) {
    result[modelName] = getStatus(modelName);
  }
  return result;
}

// ============================================================
// 获取事件日志
// ============================================================
function getEventLog(limit = 50) {
  return _eventLog.slice(-limit);
}

// ============================================================
// 重置所有断路器
// ============================================================
function resetAll() {
  for (const modelName of _breakers.keys()) {
    reset(modelName);
  }
}

module.exports = {
  query,
  recordSuccess,
  recordFailure,
  reset,
  resetAll,
  getStatus,
  getAllStatus,
  getEventLog,
  STATE,
};
