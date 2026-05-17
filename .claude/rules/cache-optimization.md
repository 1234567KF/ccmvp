---
trigger: always_on
---
# DeepSeek KV Cache 缓存优化

> **价格杠杆**：Pro 模型缓存命中 ¥0.025/M tokens vs 未命中 ¥3/M（120x 差价）。
> Flash 模型缓存命中 ¥0.02/M vs 未命中 ¥1/M（50x 差价）。
> **缓存在 DeepSeek API 上默认开启**，但命中率取决于 prompt 前缀一致性。

---

## 缓存原理

### 缓存命中条件

服务器端 KV Cache 通过**公共前缀检测**实现。后续请求的 messages 前缀必须与已缓存的请求逐字相同（包括空格、换行、标点）才能命中。

### 三种落盘时机

| 机制 | 说明 | 首次请求影响 |
|------|------|-------------|
| **请求结束落盘** | 请求完成时，整个 session 的 KV Cache 落盘 | 首请求完整收费，后续命中 |
| **固定 token 间隔落盘** | 每 N 个 token 设置 checkpoint | 长文档可在中途 checkpoint 落盘 |
| **前缀检测** | 新请求的 messages 与缓存前缀匹配 → 从 checkpoint 恢复 | — |

### TTL

缓存 TTL 为 **5 分钟**。两次请求间隔超过 5min 则缓存失效。

---

## 优化策略

### 1. 全局 System Prompt 统一

所有技能/agent 的 system prompt 前 200-500 token 必须逐字相同：

```
### SHARED PREFIX START
[统一的项目上下文、工具约束、通信协议、输出格式 — 所有 agent 共享]
### SHARED PREFIX END

[差异化内容 — 角色、阶段、任务描述]
```

**规则**：
- 共享部分 MUST 放在最前面（前 200-500 token）
- MUST 逐字相同（空格、换行、标点、中英文符号全角/半角）
- 差异化内容 MUST 放在 `### SHARED PREFIX END` 之后
- 所有技能/agent 的共享前缀 MUST 从同一模板复制（禁止手动输入）

### 2. 长上下文预热策略

当首次请求涉及长文档（如 PRD.md、Spec 文件）时：

```
Step 1: 预热请求（带长文档的 system prompt，无实际任务）
  → systemPrompt 包含统一前缀 + 长文档
  → 请求发出，cache 在请求结束时落盘
Step 2: 真实请求（system prompt 前缀与预热请求完全一致）
  → 共享前缀部分命中缓存
  → 仅差异化部分按全价计费
```

**预热约束**：
- 预热请求的 messages 结构 MUST 与真实请求的前缀完全一致（role 顺序、内容排列）
- 预热请求的内容可以部分取巧（无需完整推理），但前缀 MUST 匹配
- 预热在第一个请求发出前执行（通用 IDE 串行模式下，首请求自然充当预热）

### 3. 多轮对话缓存保持

多轮对话场景下：

```
# 第一轮所有 agent 共享前缀 → 缓存命中
# 第二轮 messages 追加了历史对话 → 前缀变了 → 缓存失效
```

**保持策略**：
- 每轮都 append 到 messages（不清除历史），保持前缀连续性
- 避免 messages 结构变化：固定 system/user/assistant 轮换顺序
- 若必须清历史 → 重新预热

### 4. 串行模式缓存优势

通用 IDE 串行执行 `/mvp` 时，缓存命中率优于 Claude 真并行：

```
Claude 真并行：
  红队 + 蓝队 + 绿队 同时发请求
  → 三个请求前缀相同，但服务端可能只缓存其中一个
  → 其他两个"同时到达"的请求可能错过缓存落盘时机
  → 命中率不稳定

通用 IDE 串行：
  红队请求先发出 → 共享前缀缓存落盘完成
  蓝队请求后发出 → 前缀逐字匹配 → 高概率命中
  绿队请求最后发 → 前缀逐字匹配 → 高概率命中
  
  只要间隔 < TTL（DeepSeek 5分钟），命中率反而更高
```

### 5. 缓存命中率监控

从 API 响应中读取缓存指标：

```python
usage.prompt_cache_hit_tokens    # 命中缓存的 prompt token 数
usage.prompt_cache_miss_tokens   # 未命中的 prompt token 数
```

**缓存命中率公式**：

```
cache_hit_rate = hit_tokens / (hit_tokens + miss_tokens)
```

| 命中率 | 判定 | 动作 |
|--------|------|------|
| > 70% | 优秀 | 维持现状 |
| 30-70% | 一般 | 检查前缀一致性（空格/换行/顺序） |
| < 30% | 差 | 触发优化提示，检查预热策略和前缀一致性 |

---

## L3 按需加载缓存（skill-loader）

> 在 L1 共享前缀缓存 + L2 长上下文预热的基础上，引入 **L3 技能内容按需加载**，将上下文 token 消耗再降低 60-85%。

### 三级缓存架构

```
L1: 共享前缀缓存（200-500 tokens）
  └─ 所有技能/agent 的 system prompt 前缀逐字相同
  └─ 命中率 > 90%，成本降低 67%

L2: 长上下文预热（长文档一次性加载）
  └─ PRD/Spec/进度文件在首请求中预热
  └─ 后续请求命中 checkpoint

L3: 技能内容按需加载（skill-loader 控制）
  └─ 当前阶段 required 技能 → 完整加载
  └─ 当前阶段 recommended/contextual → 按需触发
  └─ 非当前阶段技能 → 元数据 stub（~25 tokens/技能）
```

### 按需加载规则

| 技能状态 | 处理方式 | Token 代价 | 切换时机 |
|---------|---------|-----------|---------|
| **required / always_on** | 完整内容入上下文 | 实际大小 | 始终 |
| **recommended / contextual** | 用户输入匹配 triggers 时加载 | 0（未触发） | 关键词匹配 |
| **非当前阶段** | 元数据 stub（name + triggers + 描述） | ~25 tokens | Phase/Stage 切换 |

**不影响 L1 缓存**：skill-loader 只控制 `### SHARED PREFIX END` 之后的差异化内容，共享前缀始终不变。

### 使用方式

```bash
# 按阶段生成最优加载方案
node {IDE_ROOT}/helpers/skill-loader.cjs --optimize-for <stage> --loaded <当前已加载技能>

# 输出上下文压缩报告
node {IDE_ROOT}/helpers/skill-loader.cjs --context-report
```

### 压缩效果

以 24 个技能、总计 ~1,300KB（~370K tokens）为例：

| 加载模式 | 加载技能数 | 上下文 tokens | 压缩率 |
|---------|-----------|-------------|--------|
| 全量加载 | 24 | ~370K | 0% |
| 按需加载（stage-5） | 5-8 | ~45K + 400（元数据） | **~88%** |
| 按需加载（stage-0） | 2-3 | ~15K + 525（元数据） | **~96%** |

---

## 收益估算

以 `/mvp` Pipeline 串行为例：

| 场景 | 无缓存优化 | 有缓存优化 | 节省 |
|------|-----------|-----------|------|
| 总输入 tokens | 3 × 8K = 24K | 1 × 8K + 2 × 0.5K(前缀命中) + 2 × 2K(suffix 全价) = 13K | 46% |
| 成本 (Pro) | 24K × ¥3/M = ¥0.072 | 8K × ¥3 + 5K × ¥0.025 = ¥0.0241 | **67%** |
| 成本 (Flash) | 24K × ¥1/M = ¥0.024 | 8K × ¥1 + 5K × ¥0.02 = ¥0.0081 | **66%** |

---

## 检查清单

- [ ] 所有 agent 共享前缀从前 200-500 token 开始，逐字相同
- [ ] 共享前缀与差异化内容之间有明确的边界标记
- [ ] 串行模式下首请求自然预热，后续请求间隔 < 5min
- [ ] 预热请求的 messages 结构与真实请求匹配
- [ ] 多轮对话保持 messages 连续性（不中途清历史）
- [ ] 从 API 响应读取 `usage.prompt_cache_hit_tokens` 监控命中率
- [ ] 命中率 < 30% 时自动触发优化告警
- [ ] 每个 Phase/Stage 切换时调用 `skill-loader.cjs` 更新加载方案
- [ ] 非当前阶段技能仅保留元数据 stub，禁止全量膨胀
- [ ] `agent-visual-dashboard.cjs` 在关键节点输出状态看板，监控执行进度
