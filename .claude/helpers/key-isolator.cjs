#!/usr/bin/env node
/**
 * key-isolator.cjs — 密钥隔离 + HTTP 客户端工厂（简化版）
 *
 * 融合自绿队，但改为 registry 驱动（从 model-registry.json 读取供应商配置）。
 * 各供应商独立 Axios 实例，杜绝密钥串扰。
 *
 * 设计原则：
 *  - 轻量：只保留核心隔离功能
 *  - 与 registry 联动：供应商配置从 model-registry.json 自动读取
 *  - 懒加载：客户端在首次使用时创建
 *  - 缺失密钥时返回 null 而非抛异常
 */

const axios = require("axios");
const registry = require("./model-provider-registry.cjs");

// 客户端缓存：providerId → AxiosInstance
const _clientCache = new Map();

// 可用性缓存：providerId → boolean
const _availabilityCache = new Map();

/**
 * 检查供应商是否有可用 API Key。
 * @param {string} providerId
 * @returns {boolean}
 */
function isVendorAvailable(providerId) {
  const cached = _availabilityCache.get(providerId);
  if (cached !== undefined) return cached;

  const provider = registry.getProvider(providerId);
  if (!provider) {
    _availabilityCache.set(providerId, false);
    return false;
  }

  const apiKey = process.env[provider.envKey] || "";
  const available = apiKey.length > 0;
  _availabilityCache.set(providerId, available);
  return available;
}

/**
 * 获取供应商的独立 Axios 客户端。
 * @param {string} providerId
 * @returns {object|null} Axios 实例，或 null（密钥缺失）
 */
function getClient(providerId) {
  const cached = _clientCache.get(providerId);
  if (cached) return cached;

  const provider = registry.getProvider(providerId);
  if (!provider) return null;

  const apiKey = process.env[provider.envKey] || "";
  if (!apiKey) return null;

  const client = axios.create({
    baseURL: provider.baseUrl,
    timeout: 30000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    maxRedirects: 0,
    maxContentLength: 10 * 1024 * 1024,
    responseType: "json",
  });

  // 请求拦截器：记录开始时间
  client.interceptors.request.use(
    (config) => {
      config._startTime = Date.now();
      return config;
    },
    (error) => Promise.reject(error)
  );

  // 响应拦截器：注入延迟信息
  client.interceptors.response.use(
    (response) => {
      response._latency = Date.now() - (response.config._startTime || Date.now());
      return response;
    },
    (error) => {
      if (error.config) {
        error._latency = Date.now() - (error.config._startTime || Date.now());
      }
      return Promise.reject(error);
    }
  );

  _clientCache.set(providerId, client);
  return client;
}

/**
 * 刷新可用性缓存（环境变量动态注入后调用）。
 * @param {string} providerId
 */
function refreshAvailability(providerId) {
  _availabilityCache.delete(providerId);
  _clientCache.delete(providerId);
  return isVendorAvailable(providerId);
}

/**
 * 列出所有可用供应商（有 API Key 的）。
 * @returns {object[]}
 */
function listAvailableProviders() {
  const providers = registry.getAllProviders();
  return providers.filter((p) => isVendorAvailable(p.id));
}

/**
 * 列出所有供应商状态。
 * @returns {object}
 */
function listVendorStatus() {
  const providers = registry.getAllProviders();
  const result = {};
  for (const p of providers) {
    result[p.id] = {
      available: isVendorAvailable(p.id),
      baseURL: p.baseUrl,
      adapter: p.adapter,
      hasKey: !!process.env[p.envKey],
    };
  }
  return result;
}

module.exports = {
  getClient,
  isVendorAvailable,
  refreshAvailability,
  listAvailableProviders,
  listVendorStatus,
};
