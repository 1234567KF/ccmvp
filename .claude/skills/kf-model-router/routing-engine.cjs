#!/usr/bin/env node
/**
 * routing-engine.cjs — 动态路由引擎
 *
 * 加权评分 → 选择最佳模型
 *
 * 策略：
 *   - cost_optimized: 性价比优先
 *   - performance_optimized: 性能优先
 *   - balanced: 平衡（默认）
 *   - fallback_only: 仅使用降级模型
 */

// ─── 默认路由映射（快速路径，置信度 > 0.85 时直接查表） ─────────────

const FAST_ROUTE_TABLE = [
  // ── coding 场景 ──
  // simple/medium coding → DeepSeek V4-Flash (百万上下文，接近Pro推理，缓存降低成本)
  { type: 'coding', complexity: 'simple', model: 'deepseek-v4-flash', minConfidence: 0.85 },
  { type: 'coding', complexity: 'medium', model: 'deepseek-v4-flash', minConfidence: 0.85 },
  // complex/very_complex coding → MiniMax M2.5 (SWE-Bench 80.2% SOTA，编程顶尖，成本极低)
  { type: 'coding', complexity: 'complex', model: 'minimax-m2.5', minConfidence: 0.85 },
  { type: 'coding', complexity: 'very_complex', model: 'minimax-m2.5', minConfidence: 0.85 },

  // ── architecture / planning → DeepSeek V4-Pro (Agentic Coding开源最佳，推理顶尖) ──
  { type: 'architecture', complexity: '*', model: 'deepseek-v4-pro', minConfidence: 0.85 },
  { type: 'planning', complexity: '*', model: 'deepseek-v4-pro', minConfidence: 0.85 },

  // ── review → MiniMax M2.5 (编程review顶尖，100TPS极速) ──
  { type: 'review', complexity: '*', model: 'minimax-m2.5', minConfidence: 0.85 },

  // ── debug → Kimi K2.6 (工具调用稳定，长上下文排查彻底) ──
  { type: 'debug', complexity: '*', model: 'kimi-k2.6', minConfidence: 0.75 },

  // ── doc → Kimi K2.5 (长文本读写/文档生成专长) ──
  { type: 'doc', complexity: '*', model: 'kimi-k2.5', minConfidence: 0.85 },

  // ── question → Kimi K2.5 (中文对话+长上下文+多模态) ──
  { type: 'question', complexity: '*', model: 'kimi-k2.5', minConfidence: 0.85 },

  // ── testing → DeepSeek V4-Flash (平衡选择，缓存降低成本) ──
  { type: 'testing', complexity: '*', model: 'deepseek-v4-flash', minConfidence: 0.85 },

  // ── math / algorithm → DeepSeek V4-Pro (推理/数学/STEM顶尖) ──
  { type: 'math', complexity: '*', model: 'deepseek-v4-pro', minConfidence: 0.85 },

  // ── frontend / ui-prototype → Kimi K2.6 (前端/多模态/视觉理解强) ──
  { type: 'frontend', complexity: '*', model: 'kimi-k2.6', minConfidence: 0.85 },

  // ── creative-writing → Kimi K2.5 (创意/长文/中文表达) ──
  { type: 'creative', complexity: '*', model: 'kimi-k2.5', minConfidence: 0.80 },
];

// ─── 策略权重配置 ──────────────────────────────────────────────────────

const STRATEGIES = {
  cost_optimized: {
    reasoning: 0.10,
    coding: 0.15,
    speed: 0.20,
    cost: 0.40,
    cache: 0.15,
  },
  performance_optimized: {
    reasoning: 0.30,
    coding: 0.30,
    speed: 0.20,
    cost: 0.05,
    cache: 0.15,
  },
  balanced: {
    reasoning: 0.20,
    coding: 0.20,
    speed: 0.20,
    cost: 0.25,
    cache: 0.15,
  },
  fallback_only: {
    reasoning: 0.10,
    coding: 0.10,
    speed: 0.40,
    cost: 0.30,
    cache: 0.10,
  },
};

class RoutingEngine {
  /**
   * @param {Object} registry - ModelRegistry 实例
   */
  constructor(registry) {
    this._registry = registry;
    this.routeCount = 0;
  }

  /**
   * 路由决策
   * @param {Object} taskProfile - TaskClassifier 的输出
   * @param {string} [strategy='balanced'] - 路由策略
   * @returns {Promise<Object>} 路由决策
   */
  async decide(taskProfile, strategy = 'balanced') {
    this.routeCount++;

    // Step 1: 尝试快速路径
    const fastRoute = this._tryFastRoute(taskProfile);
    if (fastRoute) {
      return {
        model: this._registry.get(fastRoute.model),
        fallbackChain: this._registry.getFallbackChain(fastRoute.model),
        taskProfile,
        strategy,
        confidence: 1.0,
        route: 'fast_path',
      };
    }

    // Step 2: 获取可用模型
    const availableModels = this._registry.list({ available: true });
    if (availableModels.length === 0) {
      // 无可用模型 → 智能选择（非 down 模型中按任务类型优选）
      const allModels = this._registry.list({}).filter(m =>
        m.health.status !== 'down'
      );

      // 简单任务优先选 flash/chat 类型，复杂任务优先选 reasoning 类型
      const isComplex = ['complex', 'very_complex'].includes(taskProfile.complexity);
      const preferredType = isComplex ? 'reasoning' : 'chat';

      let chosen = allModels.find(m => m.type === preferredType);
      if (!chosen) chosen = allModels[0];

      if (!chosen) {
        return {
          model: null,
          fallbackChain: [],
          taskProfile,
          strategy,
          confidence: 0,
          route: 'no_model',
          error: '没有可用模型',
        };
      }
      return {
        model: chosen,
        fallbackChain: this._registry.getFallbackChain(chosen.id),
        taskProfile,
        strategy,
        confidence: 0.3,
        route: 'emergency_fallback',
      };
    }

    // Step 3: 加权评分
    const weights = STRATEGIES[strategy] || STRATEGIES.balanced;
    const scored = availableModels.map(model => {
      const score = this._scoreModel(model, taskProfile, weights);
      return { model, score };
    });

    // 按评分降序排列
    scored.sort((a, b) => b.score - a.score);

    const winner = scored[0];
    const runnerUp = scored[1];

    return {
      model: winner.model,
      fallbackChain: this._registry.getFallbackChain(winner.model.id),
      alternative: runnerUp ? runnerUp.model.id : null,
      taskProfile,
      strategy,
      confidence: this._calcDecisionConfidence(scored),
      route: 'weighted_score',
      scores: scored.slice(0, 3).map(s => ({ id: s.model.id, score: s.score })),
    };
  }

  /**
   * 尝试快速路径匹配
   */
  _tryFastRoute(taskProfile) {
    for (const entry of FAST_ROUTE_TABLE) {
      // 类型匹配
      if (entry.type !== taskProfile.type) continue;

      // 复杂度匹配（* = 任意）
      if (entry.complexity !== '*' && entry.complexity !== taskProfile.complexity) continue;

      // 置信度检查
      if (taskProfile.confidence < entry.minConfidence) continue;

      // 模型可用性检查
      const model = this._registry.get(entry.model);
      if (model && this._registry.isAvailable(entry.model)) {
        return entry;
      }
    }
    return null;
  }

  /**
   * 对模型进行加权评分
   */
  _scoreModel(model, taskProfile, weights) {
    let score = 0;

    // 推理能力评分
    const reasoningWeight = this._mapNeedToWeight(taskProfile.reasoning_need);
    score += model.capabilities.reasoning * weights.reasoning * reasoningWeight;

    // 编码能力评分（coding / debug / review 均强化编码权重）
    const isCodeHeavy = ['coding', 'debug', 'review'].includes(taskProfile.type);
    score += model.capabilities.coding * weights.coding * (isCodeHeavy ? 1.5 : 0.5);

    // 速度评分
    score += model.capabilities.speed * weights.speed;

    // 成本效率评分（性价比）
    const costPerf = model.capabilities.cost_efficiency;
    score += costPerf * weights.cost;

    // 缓存加成（DeepSeek 独有优势）
    if (model.api && model.api.supports_cache) {
      score += 0.15 * weights.cache;
    }

    // 上下文长度加成（doc / review / architecture 类任务偏好长上下文）
    const isLongContextHeavy = ['doc', 'review', 'architecture', 'question'].includes(taskProfile.type);
    if (isLongContextHeavy && model.capabilities.context > 0.90) {
      score += 0.10;
    }

    // 任务类型匹配加分
    if (model.suitable_for.includes(taskProfile.type)) {
      score += 0.20;
    }

    // 健康状态扣分
    if (model.health.status === 'degraded') score *= 0.7;
    if (model.health.circuit_breaker === 'half-open') score *= 0.5;

    return Math.round(score * 100) / 100;
  }

  /**
   * 将需求等级转为权重系数
   */
  _mapNeedToWeight(need) {
    switch (need) {
      case 'critical': return 2.0;
      case 'high': return 1.5;
      case 'medium': return 1.0;
      case 'low': return 0.5;
      default: return 1.0;
    }
  }

  /**
   * 计算决策置信度
   */
  _calcDecisionConfidence(scored) {
    if (scored.length === 0) return 0;
    if (scored.length === 1) return scored[0].score > 0.5 ? 0.8 : 0.4;

    const topScore = scored[0].score;
    const secondScore = scored[1].score;

    // 分差越大，置信度越高
    const gap = topScore - secondScore;
    if (gap > 0.5) return 0.95;
    if (gap > 0.3) return 0.85;
    if (gap > 0.15) return 0.75;

    return 0.65;
  }
}

module.exports = RoutingEngine;
