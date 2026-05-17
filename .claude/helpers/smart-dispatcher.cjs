#!/usr/bin/env node
/**
 * smart-dispatcher.cjs
 *
 * Lightweight rule engine for task classification and model assignment.
 *
 * Features:
 *  - Keyword-based task classification (no LLM needed)
 *  - CJK-aware complexity estimation (中文感知复杂度估算)
 *  - Multi-vendor model selection with cost-awareness
 *  - Optional adapter loading (when registry configures adapter)
 *  - Degradation chain: preferred → fallback → DeepSeek default
 *  - Zero config: works entirely off model-registry.json
 */

const registry = require("./model-provider-registry.cjs");

/**
 * Task classification rules:
 * Maps task description keywords to task types.
 * First match wins (priority order).
 */
const CLASSIFICATION_RULES = [
  // UI/Prototype (specific patterns first to avoid being caught by generic "设计")
  {
    type: "ui-prototype",
    keywords: [
      "UI", "原型", "界面布局", "组件设计",
      "prototype", "interface", "ui design",
      "页面设计", "交互设计",
      "frontend", "前端界面",
    ],
  },
  // High-complexity tasks (need deep reasoning)
  {
    type: "architecture",
    keywords: [
      "架构设计", "系统架构", "方案选型",
      "architecture", "system design", "technical decision",
      "方案对比", "技术选型", "权衡",
      "架构", "设计模式",
    ],
  },
  {
    type: "bug-debug",
    keywords: [
      "bug", "错误", "排查", "调试", "堆栈", "异常",
      "debug", "crash", "fix", "broken", "error",
      "stack trace", "exception", "故障",
      "修bug", "修错误", "排错", "修复",
    ],
  },
  {
    type: "planning",
    keywords: [
      "计划", "需求", "分析", "PRD", "Spec",
      "plan", "requirement", "analysis", "规划",
      "里程碑", "roadmap", "路线图",
      "story", "user story", "用户故事",
    ],
  },
  // Medium-complexity tasks (more specific before generic)
  {
    type: "review",
    keywords: [
      "code review", "代码审查", "代码评审",
      "review", "CR", "审查",
      "审计", "audit", "检查代码",
    ],
  },
  {
    type: "testing",
    keywords: [
      "单元测试", "集成测试", "e2e",
      "unit test", "integration test", "e2e test",
      "test", "testing", "测试",
      "jest", "vitest", "mocha", "cypress",
      "playwright", "pytest", "assert",
    ],
  },
  {
    type: "coding",
    keywords: [
      "编码", "实现", "开发", "功能", "feature",
      "code", "implement", "开发", "coding",
      "编写", "写代码", "编程",
      "add", "create", "写一个",
    ],
  },
  // Low-complexity tasks
  {
    type: "docs",
    keywords: [
      "文档", "README", "注释", "文档生成",
      "doc", "documentation", "readme",
      "markdown", "help", "manual",
      "更新文档", "写文档",
    ],
  },
  {
    type: "simple-qa",
    keywords: [
      "问答", "查询", "解释", "是什么",
      "what is", "how to", "explain",
      "简单问题", "quick question",
      "定义", "概念",
    ],
  },
  // Default: coding
  {
    type: "coding",
    keywords: [],
  },
];

/**
 * CJK character regex for counting Chinese/Japanese/Korean characters.
 */
const CJK_REGEX = /[一-鿿㐀-䶿豈-﫿]/g;

/**
 * Estimate CJK-aware word count and complexity.
 * CJK characters are counted at ~2 tokens each (conservative estimate).
 *
 * @param {string} text
 * @returns {{ totalChars: number, cjkChars: number, effectiveWords: number, complexity: string }}
 */
function estimateTextComplexity(text) {
  if (!text) return { totalChars: 0, cjkChars: 0, effectiveWords: 0, complexity: "simple" };

  const totalChars = text.length;
  const cjkChars = (text.match(CJK_REGEX) || []).length;
  const asciiWords = text.split(/\s+/).filter(Boolean).length;
  // CJK chars count as ~2 tokens each (conservative); ASCII words count as-is.
  // Effective word count = ASCII words + CJK chars / 2
  const effectiveWords = asciiWords + Math.ceil(cjkChars / 2);

  let complexity = "simple";
  if (effectiveWords > 150 || cjkChars > 200) {
    complexity = "complex";
  } else if (effectiveWords > 60 || cjkChars > 80) {
    complexity = "medium";
  }

  return { totalChars, cjkChars, effectiveWords, complexity };
}

/**
 * Classify a task description into a task type.
 *
 * @param {string} taskDescription - The task text to classify
 * @returns {{ type: string, complexity: object }}
 */
function classifyTask(taskDescription) {
  if (!taskDescription || typeof taskDescription !== "string") {
    return { type: "coding", complexity: estimateTextComplexity("") };
  }

  const lower = taskDescription.toLowerCase();
  const complexity = estimateTextComplexity(taskDescription);

  for (const rule of CLASSIFICATION_RULES) {
    // Skip the catch-all default rule
    if (rule.keywords.length === 0) continue;

    for (const keyword of rule.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return { type: rule.type, complexity };
      }
    }
  }

  return { type: "coding", complexity };
}

/**
 * Load an adapter module for a provider.
 * Adapter modules are discovered from the registry's `adapter` field.
 * Falls back to null if no adapter is configured.
 *
 * @param {string} providerId
 * @returns {object|null} Adapter instance or null
 */
function loadAdapter(providerId) {
  const adapterId = registry.getProviderAdapter(providerId);
  if (!adapterId) return null;

  try {
    // Resolve adapter path from registry's adapterPath field
    const adapterRelPath = registry.getProviderAdapterPath(providerId);
    const adapterPath = require("path").resolve(
      __dirname, "../..", adapterRelPath, `${adapterId}.cjs`
    );
    const fs = require("fs");
    if (!fs.existsSync(adapterPath)) return null;

    const AdapterClass = require(adapterPath);
    // If it's a class (adapter), find a model from this provider to instantiate
    if (typeof AdapterClass === "function") {
      const allModels = registry.getAllModels();
      const model = allModels.find(m => m.providerId === providerId) || null;
      if (model && AdapterClass.prototype && AdapterClass.prototype.transformRequest) {
        return new AdapterClass(model);
      }
    }
    return null;
  } catch (err) {
    // Silently fail — adapter is optional
    return null;
  }
}

/**
 * Assign the best model for a given task description.
 *
 * @param {string} taskDescription - Task text to classify
 * @param {object} [options]
 * @param {string[]} [options.excludeModels] - Model IDs to exclude (unhealthy)
 * @param {boolean} [options.deepseekOnly] - If true, only use DeepSeek models
 * @returns {object} { modelId, providerId, providerName, taskType, isFallback, complexity, adapter }
 */
function assignModel(taskDescription, options = {}) {
  const { type: taskType, complexity } = classifyTask(taskDescription);
  const excludeModels = options.excludeModels || [];
  const deepseekOnly = options.deepseekOnly || false;

  let best = null;

  if (!deepseekOnly) {
    // Try multi-vendor routing
    best = registry.findBestForTask(taskType, excludeModels);
  }

  let result;

  // For CJK-heavy complex tasks, find the cheapest capable model
  // across all providers instead of hardcoding to DeepSeek pro
  let cjkHandled = false;
  if (!best && complexity.complexity === "complex" && taskType !== "simple-qa") {
    // Gather all models with deep-reasoning or complex-code capability
    const capable = [
      ...registry.findModelsByCapability("deep-reasoning"),
      ...registry.findModelsByCapability("complex-code"),
    ];
    // Deduplicate by model ID
    const seen = new Set();
    const unique = capable.filter(m => {
      const key = m.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Filter to models whose env keys are available (and not excluded)
    const available = unique.filter(m =>
      m.envKey && process.env[m.envKey] && !excludeModels.includes(m.id)
    );
    if (available.length > 0) {
      // Sort by input cost ascending (cheapest first)
      available.sort((a, b) => (a.costPer1KInput || 999) - (b.costPer1KInput || 999));
      const cheapest = available[0];
      result = {
        modelId: cheapest.id,
        providerId: cheapest.providerId,
        providerName: cheapest.providerName,
        taskType,
        complexity,
        isFallback: true,
        costPer1KInput: cheapest.costPer1KInput,
        costPer1KOutput: cheapest.costPer1KOutput,
        supportsCache: cheapest.supportsCache,
      };
      cjkHandled = true;
    }
  }

  // Fallback to compat name mapping (pro/flash/sonnet → DeepSeek)
  if (!best && !cjkHandled) {
    const compatMap = registry.getCompatMapping();

    // Map task type to a compat name
    let compatName = "flash";
    if (["architecture", "bug-debug", "planning"].includes(taskType)) {
      compatName = "pro";
    }

    const modelId = compatMap[compatName] || "deepseek-v4-flash";
    const model = registry.findModel(modelId);

    if (model) {
      result = {
        modelId: model.id,
        providerId: model.providerId,
        providerName: model.providerName,
        taskType,
        complexity,
        isFallback: true,
        compatName,
      };
    } else {
      // Ultimate fallback
      const fb = registry.getDefaultFallback();
      result = {
        modelId: fb.modelId,
        providerId: fb.providerId,
        providerName: fb.providerName,
        taskType,
        complexity,
        isFallback: true,
        compatName: "flash",
      };
    }
  } else if (best) {
    // Model found by findBestForTask (or CJK cost-aware handler sets result directly above)
    result = {
      modelId: best.id,
      providerId: best.providerId,
      providerName: best.providerName,
      taskType,
      complexity,
      isFallback: false,
      costPer1KInput: best.costPer1KInput,
      costPer1KOutput: best.costPer1KOutput,
      supportsCache: best.supportsCache,
    };
  }

  // Attach optional adapter
  result.adapter = loadAdapter(result.providerId);

  return result;
}

/**
 * Generate a human-readable routing instruction.
 *
 * @param {object} assignment - Result from assignModel()
 * @param {string} skillName - Skill being routed
 * @returns {string} Instruction string for model routing
 */
function formatRoutingInstruction(assignment, skillName = "") {
  const tag = skillName ? `技能 "${skillName}"` : "当前任务";
  const modelDisplay = `${assignment.providerName} / ${assignment.modelId}`;
  const taskTypeDisplay = assignment.taskType;
  const fallbackNote = assignment.isFallback ? " (降级路由)" : "";

  let instruction = `[model-router] ${tag} 任务类型: ${taskTypeDisplay}，分配模型: ${modelDisplay}${fallbackNote}。`;

  // Complexity info
  const comp = assignment.complexity || {};
  if (comp.cjkChars > 0 || comp.effectiveWords > 0) {
    instruction += ` 文本估算: ${comp.effectiveWords} 有效词 (含 ${comp.cjkChars} 个 CJK 字符)，复杂度 ${comp.complexity}。`;
  }

  if (assignment.supportsCache) {
    instruction += ` 支持 KV Cache（注意保持前缀一致性以降低成本）。`;
  }

  if (assignment.costPer1KInput) {
    instruction += ` 输入成本: ¥${assignment.costPer1KInput}/K tokens。`;
  }

  if (assignment.adapter) {
    instruction += ` 已加载 ${assignment.providerId} 适配器。`;
  }

  return instruction;
}

module.exports = {
  classifyTask,
  assignModel,
  formatRoutingInstruction,
  loadAdapter,
  estimateTextComplexity,
  CLASSIFICATION_RULES,
};
