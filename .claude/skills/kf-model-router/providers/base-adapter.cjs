#!/usr/bin/env node
/**
 * base-adapter.cjs — 供应商适配器基类
 *
 * 定义统一适配器接口，各供应商适配器需继承此类。
 */

class BaseAdapter {
  /**
   * @param {Object} model - 模型注册信息
   */
  constructor(model) {
    this.model = model;
  }

  /**
   * 将统一请求格式转为供应商专用格式
   * @param {Object} request - 统一请求 { model, messages, temperature, max_tokens, stream }
   * @returns {Object} 供应商专用请求
   */
  transformRequest(request) {
    throw new Error('子类必须实现 transformRequest()');
  }

  /**
   * 将供应商响应转为统一格式
   * @param {Object} response - 供应商原始响应
   * @returns {Object} 统一响应 { content, usage, ... }
   */
  transformResponse(response) {
    throw new Error('子类必须实现 transformResponse()');
  }

  /**
   * 获取 API 基础 URL
   * @returns {string}
   */
  getBaseUrl() {
    return this.model.api?.base_url || '';
  }

  /**
   * 获取请求头
   * @returns {Object}
   */
  getHeaders() {
    const apiKey = process.env[this.model.api?.api_key_env] || '';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
  }

  /**
   * 获取模型名称（供应商格式）
   * @returns {string}
   */
  getModelName() {
    return this.model.api?.model_name || this.model.id;
  }

  /**
   * 健康探测
   * @returns {Promise<{alive: boolean, latency: number}>}
   */
  async ping() {
    return { alive: true, latency: 0 };
  }
}

module.exports = BaseAdapter;
