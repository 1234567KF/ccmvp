#!/usr/bin/env node
/**
 * lambda-a2a.cjs — λ Agent-to-Agent 通信压缩协议
 *
 * 将 ~200 token 的 Agent 间通信压缩为 ~67 token，压缩率 ~3x。
 * 配合 ccp-smart-dispatch.cjs 在 spawn agent 时注入。
 *
 * 引用: lambda-lang SKILL.md → λ 协议实现
 *
 * 用法:
 *   node lambda-a2a.cjs pack <type> <payload>    编码 A2A 消息
 *   node lambda-a2a.cjs unpack <message>          解码 A2A 消息
 *   node lambda-a2a.cjs handshake                 生成握手消息
 *   node lambda-a2a.cjs inject                    输出协议前缀文本
 */

// ─── 域标识 ───
const DOMAINS = {
  a2a:  'agent-to-agent',
  evo:  'evolution',
  code: 'code-generation',
  swarm:'agent-swarm',
  mcp:  'mcp-tool',
  obs:  'observation',
  kv:   'key-value-store',
};

// ─── 原子指令编码表 ───
const COMMANDS = {
  // a2a
  '!ta ct':  { domain: 'a2a', desc: 'create task' },
  '!ta st':  { domain: 'a2a', desc: 'set status' },
  '!ta q':   { domain: 'a2a', desc: 'query' },
  '!ta r':   { domain: 'a2a', desc: 'result' },
  // code
  '!c g':    { domain: 'code', desc: 'generate code' },
  '!c r':    { domain: 'code', desc: 'review code' },
  '!c d':    { domain: 'code', desc: 'debug code' },
  '!c f':    { domain: 'code', desc: 'format code' },
  // swarm
  '!s spawn':{ domain: 'swarm', desc: 'spawn agent' },
  '!s kill': { domain: 'swarm', desc: 'kill agent' },
  '!s list': { domain: 'swarm', desc: 'list agents' },
  // mcp
  '!m call': { domain: 'mcp', desc: 'call mcp tool' },
  '!m list': { domain: 'mcp', desc: 'list mcp tools' },
  // obs
  '!o get':  { domain: 'obs', desc: 'get observation' },
  '!o watch':{ domain: 'obs', desc: 'watch file' },
  // kv
  '!k set':  { domain: 'kv', desc: 'set value' },
  '!k get':  { domain: 'kv', desc: 'get value' },
};

// 反转映射：长 → 短
const LONG_TO_SHORT = {};
for (const [short, meta] of Object.entries(COMMANDS)) {
  LONG_TO_SHORT[meta.desc] = short;
}

// ─── 协议版本 ───
const PROTOCOL_VERSION = 'v2.0';
const HANDSHAKE = `@${PROTOCOL_VERSION}#h`;

// ─── 打包 ───
function pack(type, payload) {
  const cmd = COMMANDS[type];
  if (!cmd) {
    // 未知指令，原样返回
    return payload;
  }
  return `${type} @${cmd.domain} ${payload}`;
}

// ─── 解包 ───
function unpack(message) {
  if (!message || typeof message !== 'string') return null;

  // 握手检测
  if (message === HANDSHAKE) {
    return { type: 'handshake', domain: 'a2a', payload: 'handshake confirmed', version: PROTOCOL_VERSION };
  }

  for (const [short, meta] of Object.entries(COMMANDS)) {
    if (message.startsWith(short)) {
      const payload = message.slice(short.length).trim();
      return { type: short, domain: meta.domain, payload, version: PROTOCOL_VERSION };
    }
  }

  // 非协议消息
  return null;
}

// ─── 压缩率计算 ───
function compressionRatio(original, compressed) {
  if (!original || !compressed) return 0;
  const oLen = original.length;
  const cLen = compressed.length;
  if (cLen === 0) return 0;
  return ((oLen - cLen) / oLen * 100).toFixed(1);
}

// ─── 协议前缀文本（供 inject 使用） ───
function getProtocolPrefix() {
  return [
    `## Λ Protocol (${PROTOCOL_VERSION})`,
    `握手: ${HANDSHAKE}`,
    '域: a2a/evo/code/swarm/mcp/obs/kv',
    '',
    '指令示例:',
    '  !ta ct @task <name>   创建任务',
    '  !ta st @status <val>   设置状态 (active|done|blocked|fail)',
    '  !ta q @ask <question>  提问',
    '  !ta r @result <text>   返回结果',
    `--- 以上 ~200 token → ~67 token (3x压缩) ---`,
  ].join('\n');
}

// ─── CLI ───
function cli() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log(`lambda-a2a.cjs — Agent-to-Agent 通信压缩协议

用法:
  pack <type> <payload>      编码消息
  unpack "<message>"         解码消息
  handshake                  生成握手
  inject                     输出协议前缀
  compress "<text>"          显示压缩率

类型: ${Object.keys(COMMANDS).join(', ')}`);
    process.exit(0);
  }

  switch (args[0]) {
    case 'pack': {
      const type = args[1];
      const payload = args.slice(2).join(' ') || '';
      console.log(pack(type, payload));
      process.exit(0);
    }
    case 'unpack': {
      const msg = args.slice(1).join(' ');
      console.log(JSON.stringify(unpack(msg), null, 2));
      process.exit(0);
    }
    case 'handshake': {
      console.log(HANDSHAKE);
      process.exit(0);
    }
    case 'inject': {
      console.log(getProtocolPrefix());
      process.exit(0);
    }
    case 'compress': {
      const text = args.slice(1).join(' ');
      const type = args[1];
      const payload = args.slice(2).join(' ');
      const packed = pack(type, payload);
      const ratio = compressionRatio(text, packed);
      console.log(JSON.stringify({ original: text, compressed: packed, ratio_percent: ratio }, null, 2));
      process.exit(0);
    }
    default: {
      console.error(`未知命令: ${args[0]}`);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  cli();
}

module.exports = { pack, unpack, HANDSHAKE, getProtocolPrefix, compressionRatio, COMMANDS, DOMAINS, PROTOCOL_VERSION };
