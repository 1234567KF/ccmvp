#!/usr/bin/env node
/**
 * minimax.cjs — MiniMax 供应商适配器
 *
 * MiniMax M1 API 格式与 OpenAI 略有不同：
 * - 使用 model_version 而非 model
 * - 消息格式要求 role 为 'assistant'/'user'/'system'
 * - 不支持 KV Cache
 */

const BaseAdapter = require('./base-adapter.cjs');

class MiniMaxAdapter extends BaseAdapter {
  transformRequest(request) {
    return {
      model_version: this.getModelName(),
      messages: request.messages.map(m => ({
        sender_type: m.role === 'system' ? 'SYSTEM' :
                     m.role === 'user' ? 'USER' : 'ASSISTANT',
        text: m.content,
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 4096,
      stream: request.stream ?? false,
    };
  }

  transformResponse(response) {
    if (!response) return null;

    const reply = response.reply || response.choices?.[0]?.messages?.[0] || {};

    return {
      content: reply.text || '',
      role: 'assistant',
      usage: {
        input_tokens: response.usage?.total_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
        cache_hit_tokens: 0, // MiniMax 不支持 KV Cache
        cache_miss_tokens: 0,
      },
      model: this.model.id,
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

module.exports = MiniMaxAdapter;
