#!/usr/bin/env node
/**
 * model-provider-registry.cjs
 *
 * Loads and validates the model provider configuration from model-registry.json.
 * Provides query methods for model lookup, compatibility mappings, and cost analysis.
 *
 * Usage:
 *   const registry = require('./model-provider-registry.cjs');
 *   const allModels = registry.getAllModels();
 *   const model = registry.findModel('deepseek-v4-pro');
 *   const best = registry.findBestForTask('coding', availableModels);
 */

const fs = require("fs");
const path = require("path");

const REGISTRY_PATH = path.resolve(
  __dirname,
  "..",
  "skills",
  "kf-model-router",
  "model-registry.json"
);

// New unified config path (checked first, fallback to REGISTRY_PATH)
const CONFIG_PATH = path.resolve(
  __dirname,
  "..",
  "model-config.json"
);

let _registry = null;

/**
 * Load the model provider configuration.
 * Priority: model-config.json (unified) → model-registry.json (legacy).
 * Returns null if neither file exists.
 */
function loadRegistry() {
  if (_registry) return _registry;

  // Try new unified config first
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      const config = JSON.parse(raw);
      _registry = transformConfigToRegistry(config);
      return _registry;
    } catch (err) {
      console.error(`[model-provider-registry] Failed to load model-config.json: ${err.message}`);
    }
  }

  // Fall back to legacy model-registry.json
  try {
    if (!fs.existsSync(REGISTRY_PATH)) return null;
    const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
    _registry = JSON.parse(raw);
    return _registry;
  } catch (err) {
    console.error(`[model-provider-registry] Failed to load model-registry.json: ${err.message}`);
    return null;
  }
}

/**
 * Transform the new unified config format (model-config.json) to the internal registry format.
 * Supports `${ENV_VAR}` apiKey syntax and model-level adapter fields.
 */
function transformConfigToRegistry(config) {
  const providers = (config.providers || []).map((p) => {
    // Extract env var name from "${ENV_VAR}" syntax
    let envKey = "";
    if (p.apiKey) {
      const match = p.apiKey.match(/^\$\{(\w+)\}$/);
      envKey = match ? match[1] : p.apiKey;
    }

    // Collect unique model-level adapters
    const modelAdapters = [
      ...new Set((p.models || []).map((m) => m.adapter).filter(Boolean)),
    ];
    const adapter = modelAdapters.length > 0 ? modelAdapters[0] : null;

    return {
      id: p.name,
      name: p.name,
      baseUrl: p.baseUrl,
      envKey,
      healthEndpoint: p.healthEndpoint || "/models",
      adapter,
      adapterPath: p.adapterPath || "skills/kf-model-router/providers/",
      rateLimit: p.rateLimit || null,
      models: (p.models || []).map((m) => ({
        id: m.id,
        family: m.family || "general",
        description: m.description || "",
        capabilities: m.capabilities || [],
        costPer1KInput: m.costPer1KInput != null ? m.costPer1KInput : 1.0,
        costPer1KOutput: m.costPer1KOutput != null ? m.costPer1KOutput : 5.0,
        cacheHitCostPer1KInput:
          m.supportsCache && m.cacheHitCostPer1KInput != null
            ? m.cacheHitCostPer1KInput
            : m.supportsCache
              ? 0.02
              : null,
        supportsCache: m.supportsCache || false,
        priority: m.priority != null ? m.priority : 10,
        defaultFor: m.defaultFor || [],
        providerModelId: m.providerModelId || m.id,
      })),
    };
  });

  return {
    schemaVersion: "2.0",
    description:
      "Auto-converted from model-config.json",
    providers,
    routingFallback: config.routing || {
      strategy: "cost-first",
      defaultProvider: providers[0]?.id || "deepseek",
      defaultModel:
        providers.find((p) => p.models.length > 0)?.models?.[0]?.id ||
        "deepseek-v4-flash",
    },
    compatMappings: config.compatMappings || {
      pro: "deepseek-v4-pro",
      flash: "deepseek-v4-flash",
      sonnet: "deepseek-v4-flash",
      opus: "deepseek-v4-pro",
    },
  };
}

/**
 * Reload registry (clear cache).
 */
function reloadRegistry() {
  _registry = null;
  return loadRegistry();
}

/**
 * Get all models from all providers, flat array.
 */
function getAllModels() {
  const reg = loadRegistry();
  if (!reg) return [];
  const models = [];
  for (const provider of reg.providers) {
    for (const model of provider.models) {
      models.push({
        ...model,
        providerId: provider.id,
        providerName: provider.name,
        providerBaseUrl: provider.baseUrl,
        envKey: provider.envKey,
      });
    }
  }
  return models;
}

/**
 * Get all providers.
 */
function getAllProviders() {
  const reg = loadRegistry();
  if (!reg) return [];
  return reg.providers.map((p) => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    envKey: p.envKey,
    healthEndpoint: p.healthEndpoint,
    adapter: p.adapter || null,
    rateLimit: p.rateLimit || null,
  }));
}

/**
 * Find a model by its ID (e.g., "deepseek-v4-pro").
 */
function findModel(modelId) {
  const reg = loadRegistry();
  if (!reg) return null;
  for (const provider of reg.providers) {
    for (const model of provider.models) {
      if (model.id === modelId) {
        return {
          ...model,
          providerId: provider.id,
          providerName: provider.name,
          providerBaseUrl: provider.baseUrl,
          envKey: provider.envKey,
        };
      }
    }
  }
  return null;
}

/**
 * Find models by capability (e.g., "deep-reasoning", "code").
 */
function findModelsByCapability(capability) {
  const reg = loadRegistry();
  if (!reg) return [];
  const results = [];
  for (const provider of reg.providers) {
    for (const model of provider.models) {
      if ((model.capabilities || []).includes(capability)) {
        results.push({
          ...model,
          providerId: provider.id,
          providerName: provider.name,
          providerBaseUrl: provider.baseUrl,
          envKey: provider.envKey,
        });
      }
    }
  }
  // Sort by priority (lower number = higher priority)
  results.sort((a, b) => (a.priority || 999) - (b.priority || 999));
  return results;
}

/**
 * Find the best model for a task type.
 * @param {string} taskType - e.g., "coding", "architecture", "simple-qa"
 * @param {string[]} [excludeModelIds] - Model IDs to exclude (e.g., unhealthy ones)
 * @returns {object|null} Best model object, or null
 */
function findBestForTask(taskType, excludeModelIds = []) {
  const reg = loadRegistry();
  if (!reg) return null;

  const candidates = [];

  for (const provider of reg.providers) {
    for (const model of provider.models) {
      if (excludeModelIds.includes(model.id)) continue;

      const defaults = model.defaultFor || [];
      const capabilities = model.capabilities || [];
      let score = 0;

      // Primary: model has this task as defaultFor
      if (defaults.includes(taskType)) {
        score += 100;
      }

      // Secondary: model has capability matching the task
      if (capabilities.includes(taskType)) {
        score += 50;
      }

      // Tertiary: general capability match
      if (taskType === "architecture" && capabilities.includes("deep-reasoning")) score += 20;
      if (taskType === "bug-debug" && capabilities.includes("deep-reasoning")) score += 20;
      if (taskType === "coding" && capabilities.includes("code")) score += 20;
      if (taskType === "review" && capabilities.includes("review")) score += 20;
      if (taskType === "testing" && capabilities.includes("testing")) score += 20;
      if (taskType === "docs" && capabilities.includes("docs")) score += 20;
      if (taskType === "simple-qa" && (capabilities.includes("chat") || capabilities.includes("simple-qa"))) score += 20;
      if (taskType === "ui-prototype" && capabilities.includes("ui-prototype")) score += 20;
      if (taskType === "planning" && capabilities.includes("planning")) score += 20;

      if (score > 0) {
        candidates.push({
          ...model,
          providerId: provider.id,
          providerName: provider.name,
          providerBaseUrl: provider.baseUrl,
          envKey: provider.envKey,
          score,
        });
      }
    }
  }

  // Sort by score descending, then by cost ascending (cheaper = better),
  // then by priority ascending (lower = preferred for same cost).
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const costA = a.costPer1KInput || 999;
    const costB = b.costPer1KInput || 999;
    if (costA !== costB) return costA - costB;
    return (a.priority || 999) - (b.priority || 999);
  });

  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * Get the compatibility mapping (pro → deepseek-v4-pro, etc.)
 */
function getCompatMapping() {
  const reg = loadRegistry();
  if (!reg) return { pro: "deepseek-v4-pro", flash: "deepseek-v4-flash" };
  return reg.compatMappings || {};
}

/**
 * Resolve a compatibility name to a model ID.
 * e.g., "pro" → "deepseek-v4-pro", "sonnet" → "deepseek-v4-flash"
 */
function resolveCompatName(name) {
  const mapping = getCompatMapping();
  return mapping[name] || name;
}

/**
 * Get the routing fallback config.
 */
function getFallbackConfig() {
  const reg = loadRegistry();
  if (!reg) {
    return {
      strategy: "cost-first",
      defaultProvider: "deepseek",
      defaultModel: "deepseek-v4-flash",
    };
  }
  return reg.routingFallback || {};
}

/**
 * Get the default fallback model (always DeepSeek flash as ultimate fallback).
 */
function getDefaultFallback() {
  return {
    modelId: "deepseek-v4-flash",
    providerId: "deepseek",
    providerName: "DeepSeek",
  };
}

/**
 * Get a provider by its ID (with all extended fields).
 * @param {string} providerId
 * @returns {object|null}
 */
function getProvider(providerId) {
  const reg = loadRegistry();
  if (!reg) return null;
  const p = reg.providers.find((prov) => prov.id === providerId);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    envKey: p.envKey,
    healthEndpoint: p.healthEndpoint,
    adapter: p.adapter || null,
    adapterPath: p.adapterPath || "skills/kf-model-router/providers/",
    rateLimit: p.rateLimit || null,
  };
}

/**
 * Get the adapter ID for a provider.
 * @param {string} providerId
 * @returns {string|null}
 */
function getProviderAdapter(providerId) {
  const p = getProvider(providerId);
  return p ? p.adapter : null;
}

/**
 * Get the adapter path for a provider.
 * @param {string} providerId
 * @returns {string}
 */
function getProviderAdapterPath(providerId) {
  const p = getProvider(providerId);
  return p ? p.adapterPath : "skills/kf-model-router/providers/";
}

/**
 * Get the rate limit config for a provider.
 * @param {string} providerId
 * @returns {object|null}
 */
function getProviderRateLimit(providerId) {
  const p = getProvider(providerId);
  return p ? p.rateLimit : null;
}

module.exports = {
  loadRegistry,
  reloadRegistry,
  getAllModels,
  getAllProviders,
  getProvider,
  getProviderAdapter,
  getProviderAdapterPath,
  getProviderRateLimit,
  findModel,
  findModelsByCapability,
  findBestForTask,
  getCompatMapping,
  resolveCompatName,
  getFallbackConfig,
  getDefaultFallback,
};
