#!/usr/bin/env node
/**
 * task-classifier.cjs — 语义任务分类器
 *
 * 分析任务描述 → 任务类型 + 复杂度 + 各维度评分
 *
 * 分类算法：
 *   Step 1: 关键词匹配（快速预分类）
 *   Step 2: 长度+术语密度分析
 *   Step 3: 加权综合评分
 */

// ─── 关键词映射表 ────────────────────────────────────────────────────

const KEYWORD_MAP = {
  // 类型关键词
  type: {
    architecture: [
      '架构', '设计', '权衡', '选型', '模块划分', '系统设计',
      '技术栈', '方案对比', 'architecture', 'design', 'trade-off',
      'system design', 'tech stack',
    ],
    coding: [
      '编码', '实现', '开发', '写一个', '创建', '新增', '编写',
      '重构', '实现功能', 'coding', 'implement', 'develop',
      'refactor', '代码', 'programming',
    ],
    review: [
      '审查', '评审', 'review', 'code review', '审计',
      '检查代码', 'audit',
    ],
    debug: [
      '调试', 'bug', '修复', '排查', '问题', '错误', '异常',
      'debug', 'fix', 'issue', 'bug修复', '故障',
    ],
    doc: [
      '文档', '说明', 'readme', '文档编写', 'api文档',
      'documentation', 'doc', '写文档', '注释',
    ],
    question: [
      '什么是', '怎么', '如何', '为什么', '解释',
      'what is', 'how to', 'why', 'explain', '区别',
      '对比', 'vs', '比较',
    ],
    planning: [
      '计划', '规划', '路线图', 'roadmap', '里程碑',
      'planning', 'sprint', '迭代',
    ],
    testing: [
      '测试', '单元测试', '集成测试', 'e2e', 'test',
      'testing', 'jest', 'pytest', '覆盖率',
    ],
  },

  // 复杂度关键词
  complexity: {
    simple: [
      '简单', '快速', '小修改', '重命名', '格式', 'simple',
      'quick', 'minor', 'tiny', 'trivial',
    ],
    complex: [
      '复杂', '大规模', '多模块', '跨系统', '分布式',
      'complex', '大规模', 'multiple modules', 'distributed',
    ],
  },

  // 推理需求关键词
  reasoning: {
    high: [
      '深度分析', '权衡', '利弊', '最优', '优化',
      'deep analysis', 'trade-off', 'optimization', '瓶颈',
    ],
  },

  // 上下文需求关键词
  context: {
    high: [
      '全局', '全系统', '项目范围', '多文件', '跨模块',
      'global', 'full system', 'project-wide', 'multiple files',
    ],
  },

  // 创新需求关键词
  creativity: {
    high: [
      '创新', '创意', '新颖', '新方案', '全新',
      'innovative', 'creative', 'novel', 'new approach',
    ],
  },
};

// ─── 技术术语列表（用于密度计算） ──────────────────────────────────────

const TECH_TERMS = [
  'api', 'rest', 'graphql', 'sql', 'nosql', 'redis', 'kafka',
  'docker', 'kubernetes', 'aws', 'azure', 'gcp', '微服务',
  '分布式', '缓存', '数据库', '中间件', '消息队列',
  'typescript', 'javascript', 'python', 'go', 'rust', 'java',
  'react', 'vue', 'angular', 'node', 'deno', 'next',
  'ci/cd', 'devops', '单元测试', '集成测试', 'e2e',
  'mvc', 'mvvm', 'ddd', 'tdd', 'clean architecture',
   '高并发', '高性能', '高可用', '负载均衡',
];

class TaskClassifier {
  constructor() {
    this._cache = new Map(); // 缓存分类结果
  }

  /**
   * 分类任务描述
   * @param {string} description - 任务描述文本
   * @returns {Object} taskProfile
   */
  classify(description) {
    if (!description || description.trim().length === 0) {
      return this._defaultProfile();
    }

    const desc = description.toLowerCase();

    // 检查缓存
    const cacheKey = desc.slice(0, 200);
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    // Step 1: 关键词匹配
    const typeScores = this._matchKeywords(desc, 'type');
    const complexityScores = this._matchKeywords(desc, 'complexity');
    const reasoningScores = this._matchKeywords(desc, 'reasoning');
    const contextScores = this._matchKeywords(desc, 'context');
    const creativityScores = this._matchKeywords(desc, 'creativity');

    // Step 2: 长度 + 术语密度分析
    // 支持中文：对 CJK 文本按字符数估算词数
    const wordCount = desc.split(/\s+/).length;
    const cjkChars = (desc.match(/[一-鿿㐀-䶿豈-﫿]/g) || []).length;
    const effectiveWordCount = wordCount + Math.ceil(cjkChars / 2);
    const charCount = desc.length;
    const termDensity = this._calcTermDensity(desc);

    // Step 3: 复杂度修正（传入 taskType 做类型加成）
    let complexity = this._inferComplexity(effectiveWordCount, termDensity, complexityScores, typeScores);

    // Step 4: 类型判定
    const taskType = this._inferType(typeScores, desc);

    // Step 5: 推理需求
    const reasoningNeed = this._inferLevel(desc, reasoningScores.high, effectiveWordCount > 100, effectiveWordCount);

    // Step 6: 上下文需求
    const contextNeed = this._inferLevel(desc, contextScores.high, effectiveWordCount > 150, effectiveWordCount);

    // Step 7: 创造性需求
    const creativityNeed = this._inferLevel(desc, creativityScores.high, false, effectiveWordCount);

    // Step 8: 置信度
    const confidence = this._calcConfidence(typeScores, desc);

    const profile = {
      type: taskType,
      complexity: complexity,
      reasoning_need: reasoningNeed,
      context_need: contextNeed,
      creativity_need: creativityNeed,
      word_count: wordCount,
      effective_word_count: effectiveWordCount,
      char_count: charCount,
      term_density: termDensity,
      confidence: confidence,
      raw_scores: {
        type: typeScores,
        complexity: complexityScores,
        reasoning: reasoningScores,
        context: contextScores,
        creativity: creativityScores,
      },
    };

    // 缓存结果
    this._cache.set(cacheKey, profile);
    if (this._cache.size > 200) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }

    return profile;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this._cache.clear();
  }

  // ─── 私有方法 ──────────────────────────────────────────────────────

  _defaultProfile() {
    return {
      type: 'question',
      complexity: 'simple',
      reasoning_need: 'low',
      context_need: 'low',
      creativity_need: 'low',
      word_count: 0,
      char_count: 0,
      term_density: 0,
      confidence: 0,
      raw_scores: {},
    };
  }

  /**
   * 关键词匹配，返回各子类匹配数
   */
  _matchKeywords(desc, category) {
    const result = {};
    const map = KEYWORD_MAP[category];
    if (!map) return result;

    for (const [key, keywords] of Object.entries(map)) {
      result[key] = 0;
      for (const kw of keywords) {
        if (desc.includes(kw.toLowerCase())) {
          result[key]++;
        }
      }
    }
    return result;
  }

  /**
   * 计算技术术语密度
   */
  _calcTermDensity(desc) {
    let termCount = 0;
    for (const term of TECH_TERMS) {
      if (/[一-鿟㐀-䶿豈-﫿]/.test(term)) {
        // CJK 术语直接使用 includes（无 word boundary）
        let idx = 0;
        const lowerDesc = desc.toLowerCase();
        while ((idx = lowerDesc.indexOf(term, idx)) !== -1) {
          termCount++;
          idx += term.length;
        }
      } else {
        // ASCII 术语使用 word boundary
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        const matches = desc.match(regex);
        if (matches) termCount += matches.length;
      }
    }
    const totalWords = desc.split(/\s+/).length;
    const cjkChars = (desc.match(/[一-鿟㐀-䶿豈-﫿]/g) || []).length;
    const effectiveWords = totalWords + cjkChars;
    return effectiveWords > 0 ? termCount / effectiveWords : 0;
  }

  /**
   * 推断复杂度
   */
  _inferComplexity(wordCount, termDensity, complexityScores, typeScores = {}) {
    let score = 0;

    // 长度因素
    if (wordCount > 200) score += 3;
    else if (wordCount > 100) score += 2;
    else if (wordCount > 50) score += 1;

    // 术语密度因素
    if (termDensity > 0.5) score += 2;
    else if (termDensity > 0.3) score += 1;

    // 关键词因素
    if (complexityScores.simple > 0) score -= 1;
    if (complexityScores.complex > 0) score += 2;

    // 类型加成：architecture/planning 类任务自动提升复杂度
    if (typeScores.architecture > 0) score += 2;
    if (typeScores.planning > 0) score += 2;
    if (typeScores.debug > 0) score += 1;

    // 文件引用
    const fileRefs = (description => {
      const refs = [];
      // 简单估算：包含文件路径或引用
      if (description.includes('/') || description.includes('\\')) refs.push('path');
      if (description.includes('.js') || description.includes('.ts') ||
          description.includes('.py') || description.includes('.go')) refs.push('ext');
      return refs;
    })(this._lastDesc);
    if (fileRefs.length > 2) score += 1;

    if (score >= 4) return 'very_complex';
    if (score >= 2) return 'complex';
    if (score >= 1) return 'medium';
    return 'simple';
  }

  /**
   * 推断任务类型
   * 排他性逻辑：某些类型关键词比另一些更具体
   */
  _inferType(typeScores, desc) {
    // 类型优先级（值越小优先级越高）：某些类型关键词更具体，应优先匹配
    const TYPE_PRIORITY = [
      'review',      // 审查/评审 → 最高优先级（比 coding 更具体）
      'debug',       // 调试/bug 修复
      'architecture', // 架构设计
      'planning',    // 计划
      'testing',     // 测试
      'doc',         // 文档
      'coding',      // 编码
      'question',    // 问答 → 最低
    ];

    // 过滤出有匹配的类型
    const matched = Object.entries(typeScores)
      .filter(([, score]) => score > 0);

    if (matched.length === 0) {
      // 默认 fallback
      if (desc.includes('code') || desc.includes('function') || desc.includes('class')) {
        return 'coding';
      }
      return 'question';
    }

    if (matched.length === 1) {
      return matched[0][0];
    }

    // 多类型匹配 → 按优先级排序
    for (const type of TYPE_PRIORITY) {
      if (typeScores[type] > 0) {
        return type;
      }
    }

    // 按匹配数降序
    matched.sort((a, b) => b[1] - a[1]);
    return matched[0][0];
  }

  /**
   * 推断需求等级
   */
  _inferLevel(desc, hasHighKeywords, hasLongContext, wordCount) {
    if (hasHighKeywords) return 'high';
    if (hasLongContext || wordCount > 150) return 'medium';
    return 'low';
  }

  /**
   * 计算置信度
   */
  _calcConfidence(typeScores, desc) {
    const totalMatches = Object.values(typeScores).reduce((s, v) => s + v, 0);

    // 有明确关键词 → 置信度高
    if (totalMatches >= 3) return 0.9;
    if (totalMatches >= 2) return 0.8;
    if (totalMatches >= 1) return 0.7;

    // 描述很短 → 置信度低
    if (desc.length < 20) return 0.4;

    return 0.6;
  }
}

// 保存最近一次描述用于文件引用检测
TaskClassifier.prototype._lastDesc = '';

const _origClassify = TaskClassifier.prototype.classify;
TaskClassifier.prototype.classify = function(description) {
  this._lastDesc = description || '';
  return _origClassify.call(this, description);
};

module.exports = TaskClassifier;
