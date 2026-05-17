#!/usr/bin/env node
/**
 * model-registry.cjs — 模型注册中心
 *
 * 功能：
 *   1. 模型注册/注销
 *   2. 模型查询（按 ID、能力、任务类型）
 *   3. 供应商管理
 *   4. 密钥映射
 */

const DEFAULT_MODELS = [
  {
    id: 'deepseek-v4-pro',
    provider: 'deepseek',
    name: 'DeepSeek V4-Pro',
    type: 'reasoning',
    capabilities: {
      reasoning: 0.96,
      coding: 0.92,
      creativity: 0.75,
      speed: 0.65,
      context: 0.95,
      instruction: 0.94,
      cost_efficiency: 0.35,
    },
    cost: {
      input: 3.0,
      output: 15.0,
      cache_hit_input: 0.025,
      currency: 'CNY',
    },
    suitable_for: [
      'math', 'deep_reasoning', 'algorithm', 'complex_code',
      'architecture', 'planning', 'agent', 'tool_use',
    ],
    api: {
      base_url: 'https://api.deepseek.com/v1',
      model_name: 'deepseek-v4-pro',
      api_key_env: 'DEEPSEEK_API_KEY',
      supports_cache: true,
      supports_streaming: true,
    },
    agent_model_map: 'opus',
    rate_limit: { rpm: 100, tpm: 100000, concurrency: 10 },
    health: { status: 'unknown', last_check: null, failure_count: 0, circuit_breaker: 'closed' },
  },
  {
    id: 'deepseek-v4-flash',
    provider: 'deepseek',
    name: 'DeepSeek V4-Flash',
    type: 'chat',
    capabilities: {
      reasoning: 0.85,
      coding: 0.88,
      creativity: 0.70,
      speed: 0.90,
      context: 0.95,
      instruction: 0.90,
      cost_efficiency: 0.88,
    },
    cost: {
      input: 1.0,
      output: 5.0,
      cache_hit_input: 0.02,
      currency: 'CNY',
    },
    suitable_for: ['coding', 'documentation', 'simple_qa', 'code_review', 'testing', 'agent', 'tool_use', 'chat'],
    api: {
      base_url: 'https://api.deepseek.com/v1',
      model_name: 'deepseek-v4-flash',
      api_key_env: 'DEEPSEEK_API_KEY',
      supports_cache: true,
      supports_streaming: true,
    },
    agent_model_map: 'flash',
    rate_limit: { rpm: 200, tpm: 200000, concurrency: 20 },
    health: { status: 'unknown', last_check: null, failure_count: 0, circuit_breaker: 'closed' },
  },
  {
    id: 'kimi-k2.6',
    provider: 'kimi',
    name: 'Kimi K2.6',
    type: 'chat',
    capabilities: {
      reasoning: 0.88,
      coding: 0.95,
      creativity: 0.72,
      speed: 0.82,
      context: 0.95,
      instruction: 0.92,
      cost_efficiency: 0.80,
    },
    cost: {
      input: 1.0,
      output: 4.0,
      cache_hit_input: null,
      currency: 'CNY',
    },
    suitable_for: ['frontend', 'documentation', 'long_context', 'simple_qa', 'ui_prototype', 'translation', 'coding', 'agent', 'bug_debug', 'architecture', 'code_review', 'tool_use'],
    api: {
      base_url: 'https://api.moonshot.cn/v1',
      model_name: 'kimi-k2-0606',
      api_key_env: 'KIMI_API_KEY',
      supports_cache: false,
      supports_streaming: true,
    },
    agent_model_map: 'sonnet',
    rate_limit: { rpm: 60, tpm: 80000, concurrency: 5 },
    health: { status: 'unknown', last_check: null, failure_count: 0, circuit_breaker: 'closed' },
  },
  {
    id: 'kimi-k2.5',
    provider: 'kimi',
    name: 'Kimi K2.5',
    type: 'chat',
    capabilities: {
      reasoning: 0.80,
      coding: 0.85,
      creativity: 0.78,
      speed: 0.85,
      context: 0.95,
      instruction: 0.88,
      cost_efficiency: 0.80,
    },
    cost: {
      input: 1.0,
      output: 4.0,
      cache_hit_input: null,
      currency: 'CNY',
    },
    suitable_for: ['frontend', 'documentation', 'long_context', 'simple_qa', 'ui_prototype', 'translation', 'creative_writing', 'chat'],
    api: {
      base_url: 'https://api.moonshot.cn/v1',
      model_name: 'kimi-k2.5',
      api_key_env: 'KIMI_API_KEY',
      supports_cache: false,
      supports_streaming: true,
    },
    agent_model_map: 'sonnet',
    rate_limit: { rpm: 60, tpm: 80000, concurrency: 5 },
    health: { status: 'unknown', last_check: null, failure_count: 0, circuit_breaker: 'closed' },
  },
  {
    id: 'minimax-m2.5',
    provider: 'minimax',
    name: 'MiniMax M2.5',
    type: 'chat',
    capabilities: {
      reasoning: 0.88,
      coding: 0.94,
      creativity: 0.75,
      speed: 0.95,
      context: 0.90,
      instruction: 0.90,
      cost_efficiency: 0.95,
    },
    cost: {
      input: 0.3,
      output: 2.4,
      cache_hit_input: null,
      currency: 'USD',
    },
    suitable_for: ['coding', 'agent', 'tool_use', 'complex_code', 'architecture', 'code_review', 'testing', 'long_context', 'chat', 'documentation'],
    api: {
      base_url: 'https://api.minimax.chat/v1',
      model_name: 'minimax-m2.5',
      api_key_env: 'MINIMAX_API_KEY',
      supports_cache: false,
      supports_streaming: true,
    },
    agent_model_map: 'opus',
    rate_limit: { rpm: 100, tpm: 200000, concurrency: 10 },
    health: { status: 'unknown', last_check: null, failure_count: 0, circuit_breaker: 'closed' },
  },
];

/**
 * 降级链定义
 * primary → fallback[]
 */
const FALLBACK_CHAINS = {
  'deepseek-v4-pro':   ['minimax-m2.5', 'kimi-k2.6', 'deepseek-v4-flash'],
  'deepseek-v4-flash': ['minimax-m2.5', 'kimi-k2.6', 'kimi-k2.5', 'deepseek-v4-pro'],
  'kimi-k2.6':         ['deepseek-v4-flash', 'minimax-m2.5', 'kimi-k2.5', 'deepseek-v4-pro'],
  'kimi-k2.5':         ['deepseek-v4-flash', 'kimi-k2.6', 'minimax-m2.5'],
  'minimax-m2.5':      ['deepseek-v4-flash', 'kimi-k2.6', 'deepseek-v4-pro'],
};

class ModelRegistry {
  constructor() {
    /** @type {Map<string, Object>} modelId -> model */
    this._models = new Map();
    /** @type {Map<string, string[]>} provider -> modelIds */
    this._byProvider = new Map();
  }

  /**
   * 注册默认模型池
   */
  registerDefaultModels() {
    for (const model of DEFAULT_MODELS) {
      this.register(model);
    }
  }

  /**
   * 注册一个模型
   * @param {Object} modelDef - 模型定义
   * @returns {boolean} 是否成功
   */
  register(modelDef) {
    if (!modelDef.id || !modelDef.provider) {
      console.error(`[model-registry] 注册失败: 缺少 id 或 provider`);
      return false;
    }

    // 检查密钥是否存在
    const envKey = modelDef.api?.api_key_env;
    if (envKey && !process.env[envKey]) {
      console.error(`[model-registry] 模型 ${modelDef.id}: 环境变量 ${envKey} 未设置，标记为不可用`);
      modelDef.health = modelDef.health || {};
      modelDef.health.status = 'unavailable';
    }

    this._models.set(modelDef.id, modelDef);

    // 按供应商索引
    if (!this._byProvider.has(modelDef.provider)) {
      this._byProvider.set(modelDef.provider, []);
    }
    this._byProvider.get(modelDef.provider).push(modelDef.id);

    // 确保降级链存在
    if (!FALLBACK_CHAINS[modelDef.id]) {
      FALLBACK_CHAINS[modelDef.id] = [];
    }

    return true;
  }

  /**
   * 注销模型
   * @param {string} modelId
   */
  unregister(modelId) {
    const model = this._models.get(modelId);
    if (model) {
      const providerList = this._byProvider.get(model.provider);
      if (providerList) {
        const idx = providerList.indexOf(modelId);
        if (idx !== -1) providerList.splice(idx, 1);
      }
      this._models.delete(modelId);
    }
  }

  /**
   * 按 ID 获取模型
   * @param {string} modelId
   * @returns {Object|null}
   */
  get(modelId) {
    return this._models.get(modelId) || null;
  }

  /**
   * 列出所有已注册模型
   * @param {Object} [filters]
   * @returns {Object[]}
   */
  list(filters = {}) {
    let models = Array.from(this._models.values());

    if (filters.provider) {
      models = models.filter(m => m.provider === filters.provider);
    }
    if (filters.type) {
      models = models.filter(m => m.type === filters.type);
    }
    if (filters.status) {
      models = models.filter(m => m.health.status === filters.status);
    }
    if (filters.available !== undefined) {
      models = models.filter(m =>
        m.health.status !== 'down' && m.health.status !== 'unavailable'
      );
    }
    if (filters.suitable_for) {
      models = models.filter(m =>
        m.suitable_for.includes(filters.suitable_for)
      );
    }

    return models;
  }

  /**
   * 获取模型的降级链
   * @param {string} modelId
   * @returns {string[]} 降级链 modelId 列表（含自身）
   */
  getFallbackChain(modelId) {
    const chain = [modelId];
    const fallbacks = FALLBACK_CHAINS[modelId] || [];
    for (const fb of fallbacks) {
      if (this._models.has(fb)) {
        chain.push(fb);
      }
    }
    return chain;
  }

  /**
   * 查询支持指定任务类型的模型
   * @param {string} taskType
   * @param {Object} [options]
   * @param {boolean} [options.onlyAvailable=true] - 是否只返回可用模型
   * @returns {Object[]}
   */
  findByTaskType(taskType, options = { onlyAvailable: false }) {
    const models = options.onlyAvailable
      ? this.list({ available: true })
      : this.list();
    return models.filter(m =>
      m.suitable_for.includes(taskType)
    );
  }

  /**
   * 更新模型健康状态
   * @param {string} modelId
   * @param {Object} healthData
   */
  updateHealth(modelId, healthData) {
    const model = this._models.get(modelId);
    if (model) {
      model.health = { ...model.health, ...healthData };
    }
  }

  /**
   * 恢复模型的断路器状态
   * @param {string} modelId
   */
  resetCircuitBreaker(modelId) {
    const model = this._models.get(modelId);
    if (model) {
      model.health.circuit_breaker = 'closed';
      model.health.status = 'healthy';
      model.health.failure_count = 0;
    }
  }

  /**
   * 获取密钥
   * @param {string} modelId
   * @returns {string|null}
   */
  getApiKey(modelId) {
    const model = this._models.get(modelId);
    if (!model || !model.api) return null;
    return process.env[model.api.api_key_env] || null;
  }

  /**
   * 检查模型是否可用（健康 + 密钥存在）
   * @param {string} modelId
   * @returns {boolean}
   */
  isAvailable(modelId) {
    const model = this._models.get(modelId);
    if (!model) return false;
    if (model.health.status === 'down' || model.health.status === 'unavailable') return false;
    if (model.health.circuit_breaker === 'open') return false;

    // 检查密钥
    const envKey = model.api?.api_key_env;
    if (envKey && !process.env[envKey]) return false;

    return true;
  }
}

module.exports = ModelRegistry;
