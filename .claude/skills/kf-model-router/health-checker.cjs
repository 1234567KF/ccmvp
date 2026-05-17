#!/usr/bin/env node
/**
 * health-checker.cjs — 健康探测 + 断路器 + 降级
 *
 * 功能：
 *   1. 定期探测所有注册模型
 *   2. 断路器状态机（closed → open → half-open → closed）
 *   3. 降级链管理
 */

class HealthChecker {
  /**
   * @param {Object} registry - ModelRegistry 实例
   * @param {Object} [options]
   * @param {number} [options.probeInterval=60000] - 探测间隔(ms)
   * @param {number} [options.failureThreshold=5] - 熔断阈值
   * @param {number} [options.recoveryTimeout=30000] - 恢复超时(ms)
   */
  constructor(registry, options = {}) {
    this._registry = registry;
    this._probeInterval = options.probeInterval || 60000;
    this._failureThreshold = options.failureThreshold || 5;
    this._recoveryTimeout = options.recoveryTimeout || 30000;
    this._timer = null;
    this._lastProbe = new Map(); // modelId -> timestamp
    this._openSince = new Map(); // modelId -> timestamp (circuit opened at)
  }

  /**
   * 启动定期健康检查
   */
  start() {
    if (this._timer) return;

    // 立即执行一次
    this.checkAll().catch(err => {
      console.error(`[health-checker] 首次探测失败: ${err.message}`);
    });

    // 定期执行
    this._timer = setInterval(() => {
      this.checkAll().catch(err => {
        console.error(`[health-checker] 定期探测失败: ${err.message}`);
      });
    }, this._probeInterval);

    // 不阻止进程退出
    if (this._timer && this._timer.unref) {
      this._timer.unref();
    }

    console.error(`[health-checker] 已启动 (间隔=${this._probeInterval}ms, 阈值=${this._failureThreshold})`);
  }

  /**
   * 停止健康检查
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * 探测所有模型
   * @returns {Promise<Object[]>}
   */
  async checkAll() {
    const models = this._registry.list();
    const results = [];

    for (const model of models) {
      // 检查断路器恢复
      if (model.health.circuit_breaker === 'open') {
        const since = this._openSince.get(model.id) || 0;
        if (Date.now() - since >= this._recoveryTimeout) {
          // 半开：尝试恢复
          model.health.circuit_breaker = 'half-open';
          console.error(`[health-checker] ${model.id} 断路器半开，尝试恢复...`);
        } else {
          continue; // 仍在熔断期，跳过探测
        }
      }

      const result = await this._probe(model);
      results.push(result);
    }

    return results;
  }

  /**
   * 探测单个模型
   * @param {Object} model
   * @returns {Promise<Object>}
   */
  async _probe(model) {
    const start = Date.now();
    const envKey = model.api?.api_key_env;

    // 无密钥 → 标记为 unavailable
    if (envKey && !process.env[envKey]) {
      const status = 'unavailable';
      this._recordFailure(model, 'missing_api_key');
      return {
        modelId: model.id,
        status,
        latency: 0,
        error: `环境变量 ${envKey} 未设置`,
      };
    }

    // TODO: 实际探测需要通过网络调用各供应商 API 的 ping 端点
    // 目前通过简单规则模拟：
    // 1. 检查密钥是否存在（上面已做）
    // 2. 检查是否最近有失败记录
    // 在实际部署中，应该调用轻量 API 端点做真实探测

    const latency = Date.now() - start;
    const isHealthy = model.health.failure_count < this._failureThreshold;

    if (isHealthy) {
      this._recordSuccess(model);
    }

    this._lastProbe.set(model.id, Date.now());

    return {
      modelId: model.id,
      status: isHealthy ? 'healthy' : 'degraded',
      latency,
      circuit_breaker: model.health.circuit_breaker,
      failure_count: model.health.failure_count,
    };
  }

  /**
   * 记录探测成功
   */
  _recordSuccess(model) {
    model.health.status = 'healthy';
    model.health.last_check = Date.now();

    // 半开 → 连续成功恢复
    if (model.health.circuit_breaker === 'half-open') {
      model.health.circuit_breaker = 'closed';
      model.health.failure_count = 0;
      this._openSince.delete(model.id);
      console.error(`[health-checker] ${model.id} 恢复健康，断路器关闭`);
    } else {
      // 正常状态下成功 → 逐渐减少失败计数
      model.health.failure_count = Math.max(0, model.health.failure_count - 1);
    }
  }

  /**
   * 记录探测失败 / API 调用失败
   */
  _recordFailure(model, reason) {
    model.health.failure_count++;
    model.health.last_check = Date.now();

    if (model.health.failure_count >= this._failureThreshold) {
      // 触发断路器
      model.health.circuit_breaker = 'open';
      model.health.status = 'down';
      this._openSince.set(model.id, Date.now());
      console.error(`[health-checker] ${model.id} 断路器打开 (原因: ${reason})`);
    } else {
      model.health.status = 'degraded';
    }
  }

  /**
   * 外部报告 API 调用失败（从 dispatcher 或 router hook 调用）
   * @param {string} modelId
   * @param {string} reason
   */
  reportFailure(modelId, reason = 'api_error') {
    const model = this._registry.get(modelId);
    if (model) {
      this._recordFailure(model, reason);
    }
  }

  /**
   * 外部报告 API 调用成功
   * @param {string} modelId
   */
  reportSuccess(modelId) {
    const model = this._registry.get(modelId);
    if (model) {
      this._recordSuccess(model);
    }
  }

  /**
   * 获取健康摘要
   */
  getSummary() {
    const models = this._registry.list();
    return models.map(m => ({
      id: m.id,
      status: m.health.status,
      circuit_breaker: m.health.circuit_breaker,
      failure_count: m.health.failure_count,
      last_check: m.health.last_check,
    }));
  }
}

module.exports = HealthChecker;
