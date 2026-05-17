#!/usr/bin/env node
/**
 * model-health.cjs
 *
 * Health probe + circuit breaker for multi-vendor model routing.
 *
 * Key design: NON-BLOCKING on first call.
 * First call assumes all models healthy (fast response for hook timeout).
 * Background probes populate the cache for subsequent calls.
 *
 * Features:
 *  - Lightweight health check against each provider's API
 *  - Circuit breaker: CLOSED → OPEN (N failures) → HALF_OPEN (timeout) → CLOSED (probe success)
 *  - Periodic cache to avoid hammering APIs on every hook call
 *  - Fire-and-forget background probes on first call
 *  - Graceful handling when API keys are missing
 *
 * Circuit Breaker State Machine (增强自绿队):
 *   CLOSED ──(连续失败 >= threshold)──▶ OPEN
 *   OPEN ──(timeout 到期)──▶ HALF_OPEN
 *   HALF_OPEN ──(试探成功)──▶ CLOSED
 *   HALF_OPEN ──(试探失败)──▶ OPEN
 */

const https = require("https");
const http = require("http");

// Circuit breaker state per model ID
const _circuitState = new Map();

// Health cache: model ID -> { healthy, timestamp }
const _healthCache = new Map();

// Track models that have started background probes (prevent duplicate probes)
const _backgroundProbes = new Set();

// Event log for state transitions
const _eventLog = [];

// Default thresholds
const DEFAULTS = {
  probeTimeoutMs: 3000,
  consecutiveFailThreshold: 3,
  circuitBreakMs: 120000,
  successThreshold: 2,      // HALF_OPEN → CLOSED needs N consecutive successes
  halfOpenMaxRequests: 1,   // Max probe requests in HALF_OPEN state
  cacheTtlMs: 60000,
};

// State constants
const STATE = { CLOSED: "CLOSED", OPEN: "OPEN", HALF_OPEN: "HALF_OPEN" };

/**
 * Log a circuit breaker event.
 */
function _logEvent(entry) {
  entry.timestamp = new Date().toISOString();
  _eventLog.push(entry);
  if (_eventLog.length > 1000) _eventLog.shift();
}

/**
 * Make a lightweight HTTP GET request to probe a provider endpoint.
 * Returns a promise resolving to true (healthy) or false (unhealthy).
 */
function probeEndpoint(url, timeoutMs, apiKey) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const headers = { "User-Agent": "kf-model-router/1.0" };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const req = lib.request(
      url,
      {
        method: "GET",
        timeout: timeoutMs,
        headers,
      },
      (res) => {
        const healthy = res.statusCode >= 200 && res.statusCode < 400;
        res.resume();
        resolve(healthy);
      }
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Internal: perform actual probe and update state.
 * Called both synchronously (on cache hit/circuit half-open) and
 * asynchronously (background probe on first call).
 */
async function doProbe(model) {
  const modelId = model.id || model.modelId;

  // If env key is missing, mark as healthy (won't be selected anyway)
  const apiKey = process.env[model.envKey];
  if (!apiKey) {
    _healthCache.set(modelId, { healthy: true, timestamp: Date.now() });
    return true;
  }

  const baseUrl = model.providerBaseUrl || "";
  const healthEndpoint = model.healthEndpoint || "/models";
  const probeUrl = `${baseUrl}${healthEndpoint}`;

  const healthy = await probeEndpoint(probeUrl, DEFAULTS.probeTimeoutMs, apiKey);

  // Update health cache
  _healthCache.set(modelId, { healthy, timestamp: Date.now() });

  // Update circuit breaker with state machine
  const currentCircuit = _circuitState.get(modelId) || {
    state: STATE.CLOSED,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    recoverAt: 0,
    halfOpenRequests: 0,
    totalCalls: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    lastStateChange: Date.now(),
  };

  currentCircuit.totalCalls++;

  if (healthy) {
    currentCircuit.totalSuccesses++;

    if (currentCircuit.state === STATE.HALF_OPEN) {
      currentCircuit.consecutiveSuccesses++;
      if (currentCircuit.consecutiveSuccesses >= DEFAULTS.successThreshold) {
        const oldState = currentCircuit.state;
        currentCircuit.state = STATE.CLOSED;
        currentCircuit.consecutiveFailures = 0;
        currentCircuit.halfOpenRequests = 0;
        currentCircuit.lastStateChange = Date.now();
        _logEvent({
          model: modelId,
          from: oldState,
          to: STATE.CLOSED,
          reason: `半开试探成功 ${DEFAULTS.successThreshold} 次，恢复关闭`,
        });
      }
    }

    if (currentCircuit.state === STATE.CLOSED) {
      currentCircuit.consecutiveFailures = 0;
      currentCircuit.consecutiveSuccesses = Math.min(
        currentCircuit.consecutiveSuccesses + 1,
        DEFAULTS.successThreshold
      );
    }
  } else {
    currentCircuit.totalFailures++;
    currentCircuit.consecutiveSuccesses = 0;
    currentCircuit.lastFailureTime = Date.now();

    if (currentCircuit.state === STATE.HALF_OPEN) {
      const oldState = currentCircuit.state;
      currentCircuit.state = STATE.OPEN;
      currentCircuit.lastOpenTime = Date.now();
      currentCircuit.recoverAt = Date.now() + DEFAULTS.circuitBreakMs;
      _logEvent({
        model: modelId,
        from: oldState,
        to: STATE.OPEN,
        reason: `半开试探失败`,
      });
    } else {
      currentCircuit.consecutiveFailures++;

      if (currentCircuit.state === STATE.CLOSED &&
          currentCircuit.consecutiveFailures >= DEFAULTS.consecutiveFailThreshold) {
        const oldState = currentCircuit.state;
        currentCircuit.state = STATE.OPEN;
        currentCircuit.lastOpenTime = Date.now();
        currentCircuit.recoverAt = Date.now() + DEFAULTS.circuitBreakMs;
        _logEvent({
          model: modelId,
          from: oldState,
          to: STATE.OPEN,
          reason: `连续失败 ${currentCircuit.consecutiveFailures} 次 >= 阈值 ${DEFAULTS.consecutiveFailThreshold}`,
        });
      }
    }
  }

  _circuitState.set(modelId, currentCircuit);
  return healthy;
}

/**
 * Fire a background health probe (non-blocking, fire-and-forget).
 */
function fireBackgroundProbe(model) {
  const modelId = model.id || model.modelId;
  if (_backgroundProbes.has(modelId)) return; // Already probing
  _backgroundProbes.add(modelId);

  doProbe(model).catch((err) => {
    _logEvent({ model: modelId, from: "probe", to: "error", reason: err.message });
  }).finally(() => {
    _backgroundProbes.delete(modelId);
  });
}

/**
 * Public: get model health status (fast path).
 *
 * NON-BLOCKING on first call:
 *  - If cached data exists and is fresh, return it.
 *  - If circuit breaker is OPEN (not yet timed out), return false.
 *  - If circuit breaker is HALF_OPEN, allow limited probes.
 *  - If no cache exists, assume true (optimistic) and fire background probe.
 */
async function isModelHealthy(model) {
  if (!model) return false;

  const modelId = model.id || model.modelId;

  // Check circuit breaker first (fast path)
  const circuit = _circuitState.get(modelId);
  if (circuit) {
    if (circuit.state === STATE.OPEN) {
      const now = Date.now();
      if (now < circuit.recoverAt && circuit.recoverAt > 0) {
        return false; // Circuit is open, not yet recoverable
      }
      // Timeout expired → transition to HALF_OPEN (will allow limited probes)
      const oldState = circuit.state;
      circuit.state = STATE.HALF_OPEN;
      circuit.halfOpenRequests = 0;
      circuit.lastStateChange = Date.now();
      _logEvent({
        model: modelId,
        from: oldState,
        to: STATE.HALF_OPEN,
        reason: "timeout 到期，进入半开试探",
      });
    }

    if (circuit.state === STATE.HALF_OPEN) {
      // In HALF_OPEN, only allow limited probe requests
      if (circuit.halfOpenRequests >= DEFAULTS.halfOpenMaxRequests) {
        return false; // Too many half-open probes in flight
      }
      circuit.halfOpenRequests++;
      // Fall through to allow probe
    }
  }

  // Check cache (fast path)
  const cached = _healthCache.get(modelId);
  if (cached && Date.now() - cached.timestamp < DEFAULTS.cacheTtlMs) {
    return cached.healthy;
  }

  // If env key is missing, assume healthy (won't be selected anyway)
  if (!process.env[model.envKey]) {
    _healthCache.set(modelId, { healthy: true, timestamp: Date.now() });
    return true;
  }

  // No cache => assume healthy on first call, fire background probe
  fireBackgroundProbe(model);
  return true; // Optimistic: assume healthy
}

/**
 * Public: filter models to only healthy ones.
 * Always keeps DeepSeek models as ultimate fallback.
 * Non-blocking: returns immediately with cached/optimistic results.
 */
async function filterHealthy(models) {
  if (!models || models.length === 0) return [];

  const results = await Promise.all(
    models.map(async (m) => ({
      model: m,
      healthy: await isModelHealthy(m),
    }))
  );

  // Always include DeepSeek models (they might work even if probe fails)
  const healthy = results
    .filter((r) => r.healthy || r.model.providerId === "deepseek")
    .map((r) => r.model);

  return healthy;
}

/**
 * Force an immediate (blocking) health check for a specific model.
 * Used for testing or manual verification.
 */
async function probeNow(model) {
  if (!model) return false;
  return doProbe(model);
}

/**
 * Get circuit breaker status for all tracked models.
 */
function getCircuitStatus() {
  const status = {};
  for (const [modelId, state] of _circuitState.entries()) {
    status[modelId] = {
      state: state.state,
      consecutiveFailures: state.consecutiveFailures,
      consecutiveSuccesses: state.consecutiveSuccesses,
      recoverAt: state.recoverAt,
      remainingMs: Math.max(0, state.recoverAt - Date.now()),
      totalCalls: state.totalCalls,
      totalFailures: state.totalFailures,
      totalSuccesses: state.totalSuccesses,
      halfOpenRequests: state.halfOpenRequests,
    };
  }
  return status;
}

/**
 * Get circuit breaker state for a specific model.
 */
function getModelCircuitStatus(modelId) {
  const cb = _circuitState.get(modelId);
  if (!cb) return null;
  return {
    model: modelId,
    state: cb.state,
    failureCount: cb.consecutiveFailures,
    successCount: cb.consecutiveSuccesses,
    totalCalls: cb.totalCalls,
    totalFailures: cb.totalFailures,
    totalSuccesses: cb.totalSuccesses,
    recoverAt: cb.recoverAt ? new Date(cb.recoverAt).toISOString() : null,
    lastStateChange: cb.lastStateChange ? new Date(cb.lastStateChange).toISOString() : null,
    halfOpenRequests: cb.halfOpenRequests,
  };
}

/**
 * Get event log.
 */
function getEventLog(limit = 50) {
  return _eventLog.slice(-limit);
}

/**
 * Reset circuit breaker and health cache for a specific model.
 */
function resetCircuit(modelId) {
  _circuitState.delete(modelId);
  _healthCache.delete(modelId);
  _backgroundProbes.delete(modelId);
}

/**
 * Reset all circuit breakers, health caches, and background probes.
 */
function resetAll() {
  _circuitState.clear();
  _healthCache.clear();
  _backgroundProbes.clear();
  _eventLog.length = 0;
}

module.exports = {
  isModelHealthy,
  filterHealthy,
  probeNow,
  getCircuitStatus,
  getModelCircuitStatus,
  getEventLog,
  resetCircuit,
  resetAll,
  DEFAULTS,
  STATE,
};
