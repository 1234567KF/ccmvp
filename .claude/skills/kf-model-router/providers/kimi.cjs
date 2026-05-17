#!/usr/bin/env node
/**
 * kimi.cjs — Kimi (Moonshot) 供应商适配器
 *
 * Kimi API 与 OpenAI API 兼容，使用标准 chat completions 格式。
 */

const BaseAdapter = require('./base-adapter.cjs');

class KimiAdapter extends BaseAdapter {
  transformRequest(request) {
    return {
      model: this.getModelName(),
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 8192,
      stream: request.stream ?? false,
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
        cache_hit_tokens: 0,
        cache_miss_tokens: 0,
      },
      model: response.model || this.model.id,
      finish_reason: response.choices?.[0]?.finish_reason || 'stop',
    };
  }

  async ping() {
    const start = Date.now();
    try {
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

module.exports = KimiAdapter;
