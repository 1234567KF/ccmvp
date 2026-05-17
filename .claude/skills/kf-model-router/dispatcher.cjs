#!/usr/bin/env node
/**
 * dispatcher.cjs — 并发调度器
 *
 * 为 Agent spawn 分配模型：
 *   1. 路由引擎决定推荐模型
 *   2. 检查模型负载（限流）
 *   3. 密钥隔离注入
 *   4. 返回 agent model 参数
 */

// ─── Agent Model 映射 ────────────────────────────────────────────────
//
// kf-model-router model ID → Claude Code Agent model string
//

class Dispatcher {
  /**
   * @param {Object} registry - ModelRegistry 实例
   * @param {Object} engine - RoutingEngine 实例
   * @param {Object} checker - HealthChecker 实例
   */
  constructor(registry, engine, checker) {
    this._registry = registry;
    this._engine = engine;
    this._checker = checker;
    this._activeAllocations = new Map(); // modelId -> count
    this._maxConcurrency = 50; // 全局最大并发
  }

  /**
   * 为 Agent spawn 解析模型参数
   * @param {string} modelId - 推荐模型 ID
   * @param {Object} [opts]
   * @returns {Object} { model: string, env: Object, modelId: string, fallbacks: string[] }
   */
  resolveAgentModel(modelId, opts = {}) {
    const model = this._registry.get(modelId);
    if (!model) {
      // fallback 到默认 flash
      return {
        model: 'sonnet',
        env: {},
        modelId: 'deepseek-v4-flash',
        fallbacks: ['sonnet', 'haiku'],
      };
    }

    // 检查负载
    if (!this._checkConcurrency(modelId)) {
      // 超限流 → 走降级链
      const fallbackChain = this._registry.getFallbackChain(modelId);
      for (const fbId of fallbackChain.slice(1)) {
        if (this._registry.isAvailable(fbId) && this._checkConcurrency(fbId)) {
          const fbModel = this._registry.get(fbId);
          console.error(`[dispatcher] ${modelId} 超限流，降级到 ${fbId}`);
          return this._buildResult(fbModel);
        }
      }
      // 全部降级失败 → 仍用原模型但标记警告
      console.error(`[dispatcher] 警告: ${modelId} 超限流且无可用降级`);
    }

    return this._buildResult(model);
  }

  /**
   * 从路由决策构建调度结果
   * @param {Object} decision - RoutingEngine 的决策结果
   * @returns {Object}
   */
  fromDecision(decision) {
    if (!decision.model) {
      return {
        model: 'sonnet',
        env: {},
        modelId: 'deepseek-v4-flash',
        fallbacks: ['sonnet', 'haiku'],
        error: decision.error || 'no model available',
      };
    }

    return this.resolveAgentModel(decision.model.id);
  }

  /**
   * 获取所有模型的当前并发分配
   */
  getAllocations() {
    return Object.fromEntries(this._activeAllocations);
  }

  /**
   * 释放模型并发槽位
   * @param {string} modelId
   */
  release(modelId) {
    const count = this._activeAllocations.get(modelId) || 0;
    if (count > 1) {
      this._activeAllocations.set(modelId, count - 1);
    } else {
      this._activeAllocations.delete(modelId);
    }
  }

  /**
   * 重置所有分配
   */
  resetAllocations() {
    this._activeAllocations.clear();
  }

  // ─── 私有方法 ──────────────────────────────────────────────────────

  _buildResult(model) {
    // 记录分配
    this._activeAllocations.set(
      model.id,
      (this._activeAllocations.get(model.id) || 0) + 1
    );

    const result = {
      model: model.agent_model_map || 'sonnet',
      modelId: model.id,
      provider: model.provider,
      fallbacks: this._registry.getFallbackChain(model.id).slice(1).map(fbId => {
        const fb = this._registry.get(fbId);
        return fb ? fb.agent_model_map || 'sonnet' : 'sonnet';
      }),
    };

    // 密钥信息 (不包含密钥本身)
    if (model.api) {
      result.apiKeyEnv = model.api.api_key_env;
      result.hasApiKey = !!this._registry.getApiKey(model.id);
    }

    return result;
  }

  /**
   * 检查模型是否达到并发限制
   */
  _checkConcurrency(modelId) {
    const model = this._registry.get(modelId);
    if (!model) return false;

    const currentCount = this._activeAllocations.get(modelId) || 0;
    const maxConcurrency = model.rate_limit?.concurrency || 10;

    return currentCount < maxConcurrency;
  }
}

module.exports = Dispatcher;
