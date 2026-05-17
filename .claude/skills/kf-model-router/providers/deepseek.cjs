#!/usr/bin/env node
/**
 * deepseek.cjs — DeepSeek 供应商适配器
 *
 * DeepSeek API 兼容 OpenAI 格式，但有额外参数：
 * - 支持 KV Cache（通过 prompt 前缀检测）
 * - 支持 streaming
 */

const BaseAdapter = require('./base-adapter.cjs');

class DeepSeekAdapter extends BaseAdapter {
  transformRequest(request) {
    return {
      model: this.getModelName(),
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 4096,
      stream: request.stream ?? false,
      // DeepSeek 特有参数：缓存优化
      // 默认启用，不需要额外设置
    };
  }

  transformResponse(response) {
    if (!response) return null;

    return {
      content: response.choices?.[0]?.message?.content || '',
      role: response.choices?.[0]?.message?.role || 'assistant',
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
        cache_hit_tokens: response.usage?.prompt_cache_hit_tokens || 0,
        cache_miss_tokens: response.usage?.prompt_cache_miss_tokens || 0,
      },
      model: response.model || this.model.id,
      finish_reason: response.choices?.[0]?.finish_reason || 'stop',
    };
  }

  async ping() {
    const start = Date.now();
    try {
      // 实际轻量调用
      const url = `${this.getBaseUrl()}/models`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const latency = Date.now() - start;
      return {
        alive: response.ok,
        latency,
        status: response.status,
      };
    } catch (err) {
      return {
        alive: false,
        latency: Date.now() - start,
        error: err.message,
      };
    }
  }
}

module.exports = DeepSeekAdapter;
