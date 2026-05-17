#!/usr/bin/env node
/**
 * work-estimator.cjs — 任务工作量预估与缓存风险分析
 *
 * 轻量关键词匹配算法，快速评估任务复杂度，输出：
 * - 预估总耗时和各阶段耗时
 * - 缓存 TTL 风险评估
 * - 分批调度建议
 *
 * 设计原则：轻量化 — 不读取全文、不调 LLM、单次 < 10ms。
 * 精度：允许 ±50% 误差，作为调度决策参考而非精确度量。
 *
 * 用法:
 *   node work-estimator.cjs estimate --task "<任务描述>" [--prd <path>] [--file-count N] [--estimate N]
 *   node work-estimator.cjs batch-plan --task "<描述>" --max-batch-ms 240000
 *
 * 退出码:
 *   estimate: 0=成功
 *   batch-plan: 0=成功
 */

const fs = require('fs');
const path = require('path');

// ─── 常量配置 ───

// DeepSeek KV Cache TTL = 5min，保留 1min 安全缓冲
const CACHE_TTL_MS = 4 * 60 * 1000;

// 单阶段默认耗时（分钟），6 个 Stage（0→5）
const BASE_STAGE_MINUTES = {
  0:  1.2,  // Stage 0: 需求对齐 — 较轻
  0.5: 1.0,  // Stage 0.5: 测试设计 — 中等
  1:  1.5,  // Stage 1: 架构设计 — 较重
  1.5: 0.8,  // Stage 1.5: SDD任务拆分 — 较轻
  2:  2.5,  // Stage 2: TDD微循环 — 最重
  3:  1.5,  // Stage 3: 集成测试 — 较重
  3.5: 1.0,  // Stage 3.5: 运行时验证
  4:  1.0,  // Stage 4: 代码审查
  5:  0.8,  // Stage 5: 方案汇总
};

// 关键词匹配规则 { regex, field, multiplier, description }
const KEYWORD_RULES = [
  // ─── 复杂度信号（乘法因子） ───
  { regex: /模糊|不确定|大概|可能|暂定|待定|TBD|TODO/, field: 'complexity', multiplier: 1.3, desc: '需求不确定性加成' },
  { regex: /简单|极简|最小|MVP|demo|原型|快速/, field: 'complexity', multiplier: 0.5, desc: '简单/原型任务打折' },
  { regex: /CRUD|增删改查|列表.*表单|标准.*管理/, field: 'complexity', multiplier: 0.6, desc: '标准 CRUD 任务打折' },
  { regex: /支付|交易|金融|安全|加密|权限|鉴权|认证/, field: 'complexity', multiplier: 1.4, desc: '敏感/安全领域加成' },
  { regex: /实时|WebSocket|消息队列|流式|推送/, field: 'complexity', multiplier: 1.3, desc: '实时通信加成' },

  // ─── 规模信号（数量计数） ───
  { regex: /接口|API|端点|endpoint|路由.*定义/, field: 'apiCount', multiplier: 1, desc: 'API 端点' },
  { regex: /数据表|模型|entity|模型定义|schema|表结构/, field: 'tableCount', multiplier: 1, desc: '数据表/模型' },
  { regex: /页面|列表页|表单页|详情页|页面.*跳转|路由.*页面/, field: 'pageCount', multiplier: 1, desc: '前端页面' },
  { regex: /组件|component|公共组件|复用/, field: 'componentCount', multiplier: 0.5, desc: '前端组件（折半计数）' },
  { regex: /模块|module|子系统|微服务/, field: 'moduleCount', multiplier: 1, desc: '功能模块' },
  { regex: /角色|权限.*组|用户.*角色/, field: 'roleCount', multiplier: 1, desc: '用户角色' },
];

// 每单位规模对应的分钟数
const SCALE_MINUTES = {
  apiCount:       1.5,  // 每个 API 端点约 1.5 min
  tableCount:     1.0,  // 每个数据表约 1.0 min
  pageCount:      2.0,  // 每个页面约 2.0 min
  componentCount: 0.8,  // 每个组件约 0.8 min（已经 0.5 计数）
  moduleCount:    3.0,  // 每个模块约 3.0 min
  roleCount:      0.5,  // 每个角色约 0.5 min
};

// ─── Helpers ───

function countMatches(text, regex) {
  const matches = text.match(new RegExp(regex.source, 'gi'));
  return matches ? matches.length : 0;
}

function extractNumber(text) {
  // 尝试从文本中提取数字，如 "3个接口" "5张表"
  const m = text.match(/(\d+)\s*(个|张|条|项|处)/);
  return m ? parseInt(m[1], 10) : null;
}

// ─── 核心算法 ───

/**
 * 分析任务描述，提取规模信号和复杂度信号
 */
function analyzeTask(taskDesc, fileCount = 0) {
  const signals = {
    apiCount: 0,
    tableCount: 0,
    pageCount: 0,
    componentCount: 0,
    moduleCount: 0,
    roleCount: 0,
    complexityMultiplier: 1.0,
    fileCount: fileCount || 0,
    details: [],
  };

  for (const rule of KEYWORD_RULES) {
    const count = countMatches(taskDesc, rule.regex);
    if (count === 0) continue;

    if (rule.field === 'complexity') {
      // 复杂度信号用乘法：取最大值作为乘数因子
      if (rule.multiplier > 1 && rule.multiplier > signals.complexityMultiplier) {
        signals.complexityMultiplier = rule.multiplier;
      } else if (rule.multiplier < 1 && rule.multiplier < signals.complexityMultiplier) {
        signals.complexityMultiplier = rule.multiplier;
      }
    } else if (signals.hasOwnProperty(rule.field)) {
      signals[rule.field] += count * rule.multiplier;
    }

    signals.details.push({
      rule: rule.desc,
      field: rule.field,
      count,
      multiplier: rule.multiplier,
    });
  }

  // 尝试从描述文本中提取精确数字
  const exactNum = extractNumber(taskDesc);
  if (exactNum !== null) {
    // 如果提取到精确数字，取 max(exact, keyword_count)
    // 优先信任精确数字
    if (signals.apiCount > 0) signals.apiCount = Math.max(signals.apiCount, exactNum);
    else if (signals.pageCount > 0) signals.pageCount = Math.max(signals.pageCount, exactNum);
  }

  // 无任何信号时给一个基础猜测
  if (signals.apiCount === 0 && signals.tableCount === 0 &&
      signals.pageCount === 0 && signals.moduleCount === 0) {
    // 默认假设：小任务
    signals.apiCount = 2;
    signals.tableCount = 2;
    signals.pageCount = 1;
    signals.moduleCount = 1;
    signals.details.push({ rule: '默认推断（小型任务）', field: 'default', count: 1, multiplier: 1 });
  }

  return signals;
}

/**
 * 根据信号估算各阶段耗时
 */
function estimateStageMinutes(signals, fileCount) {
  // 规模总量
  const scaleScore =
    signals.apiCount * SCALE_MINUTES.apiCount +
    signals.tableCount * SCALE_MINUTES.tableCount +
    signals.pageCount * SCALE_MINUTES.pageCount +
    signals.componentCount * SCALE_MINUTES.componentCount +
    signals.moduleCount * SCALE_MINUTES.moduleCount +
    signals.roleCount * SCALE_MINUTES.roleCount;

  // 已有代码的时间加成
  const fileBonus = fileCount > 0 ? fileCount * 0.3 : 0;

  // 阶段耗时 = 基础耗时 × 复杂度系数 + 规模分摊
  const stages = {};
  let total = 0;

  const stageKeys = Object.keys(BASE_STAGE_MINUTES);
  for (const key of stageKeys) {
    const base = BASE_STAGE_MINUTES[key];
    // 规模主要影响 Stage 1（架构）、2（编码）、3（测试）
    let scaleShare = 0;
    if (key === '1' || key === '1.5') scaleShare = scaleScore * 0.15;
    else if (key === '2') scaleShare = scaleScore * 0.35 + fileBonus;
    else if (key === '3' || key === '3.5') scaleShare = scaleScore * 0.20;
    else if (key === '4') scaleShare = scaleScore * 0.10;
    else scaleShare = scaleScore * 0.05;

    const raw = (base + scaleShare) * signals.complexityMultiplier;
    const rounded = Math.round(raw * 10) / 10; // 保留 1 位小数
    stages[key] = rounded;
    total += rounded;
  }

  return {
    stages,
    totalMinutes: Math.round(total * 10) / 10,
    signals,
  };
}

/**
 * 评估缓存风险并生成分批建议
 */
function assessCacheRisk(totalMinutes, stageMinutes, maxBatchMs) {
  const totalMs = totalMinutes * 60 * 1000;
  const ttlMs = maxBatchMs || CACHE_TTL_MS;

  let risk, recommendation;

  if (totalMs <= ttlMs * 0.8) {
    risk = 'low';
    recommendation = '单批执行即可 — 预估总耗时在缓存 TTL 安全范围内';
  } else if (totalMs <= ttlMs * 2) {
    risk = 'medium';
    recommendation = '建议分 2 批执行 — 设计阶段 (Stage 0-1.5) 一批，编码+测试 (Stage 2-5) 一批';
  } else {
    risk = 'high';
    recommendation = '建议并行执行 + cache-warmup 预热，或分 3+ 批执行';
  }

  // 生成分批计划
  const batchPlan = [];
  if (risk === 'low') {
    batchPlan.push({
      batch: 1,
      stages: Object.keys(stageMinutes),
      label: '全部阶段',
      estimatedMs: totalMs,
      estimatedMinutes: totalMinutes,
    });
  } else if (risk === 'medium') {
    // 分 2 批：设计阶段 + 编码测试阶段
    const designStages = ['0', '0.5', '1', '1.5'];
    const codeStages = ['2', '3', '3.5', '4', '5'];

    const designMs = designStages.reduce((sum, s) => sum + (stageMinutes[s] || 0) * 60 * 1000, 0);
    const codeMs = codeStages.reduce((sum, s) => sum + (stageMinutes[s] || 0) * 60 * 1000, 0);

    batchPlan.push({
      batch: 1,
      stages: designStages,
      label: '设计阶段 (Stage 0-1.5)',
      estimatedMs: designMs,
      estimatedMinutes: Math.round(designMs / 60000 * 10) / 10,
    });
    batchPlan.push({
      batch: 2,
      stages: codeStages,
      label: '编码测试阶段 (Stage 2-5)',
      estimatedMs: codeMs,
      estimatedMinutes: Math.round(codeMs / 60000 * 10) / 10,
    });
  } else {
    // 分 3 批
    const batch1 = ['0', '0.5', '1'];
    const batch2 = ['1.5', '2'];
    const batch3 = ['3', '3.5', '4', '5'];

    for (const [i, stages] of [batch1, batch2, batch3].entries()) {
      const ms = stages.reduce((sum, s) => sum + (stageMinutes[s] || 0) * 60 * 1000, 0);
      batchPlan.push({
        batch: i + 1,
        stages,
        label: i === 0 ? '需求对齐+架构 (Stage 0-1)' :
               i === 1 ? '任务拆分+TDD编码 (Stage 1.5-2)' :
                         '测试+审查+汇总 (Stage 3-5)',
        estimatedMs: ms,
        estimatedMinutes: Math.round(ms / 60000 * 10) / 10,
      });
    }
  }

  return {
    risk,
    recommendation,
    cacheTtlMs: ttlMs,
    totalEstimatedMs: totalMs,
    totalEstimatedMinutes: totalMinutes,
    batchPlan,
  };
}

// ─── PRD 文件轻量读取 ───

function readPrdIfExists(prdPath) {
  if (!prdPath) return null;

  const candidates = [
    prdPath,
    path.resolve(prdPath),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        // 只读前 5000 字符（轻量）
        const fd = fs.openSync(p, 'r');
        const buf = Buffer.alloc(5000);
        const bytesRead = fs.readSync(fd, buf, 0, 5000, 0);
        fs.closeSync(fd);
        return buf.toString('utf8', 0, bytesRead);
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ─── CLI ───

function cli() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('work-estimator.cjs — 任务工作量预估与缓存风险分析');
    console.log('');
    console.log('命令:');
    console.log('  estimate     预估任务耗时     --task "<描述>" [--prd <path>] [--file-count N] [--estimate N]');
    console.log('  batch-plan   生成分批计划     --task "<描述>" [--max-batch-ms 240000]');
    process.exit(0);
  }

  const cmd = args[0];
  const rest = args.slice(1);

  function getopt(name, fallback) {
    const idx = rest.indexOf(name);
    if (idx === -1) return fallback;
    return rest[idx + 1] || fallback;
  }

  try {
    switch (cmd) {
      case 'estimate': {
        const taskDesc = getopt('--task', '');
        const prdPath = getopt('--prd', null);
        const fileCount = parseInt(getopt('--file-count', '0'), 10) || 0;
        const manualEstimate = getopt('--estimate', null);

        if (manualEstimate !== null) {
          // 用户显式指定预估时间，跳过所有分析
          const mins = parseFloat(manualEstimate) || 5;
          const stages = {};
          const stageKeys = Object.keys(BASE_STAGE_MINUTES);
          const perStage = mins / stageKeys.length;
          for (const key of stageKeys) {
            stages[key] = Math.round(perStage * 10) / 10;
          }

          const result = {
            mode: 'manual',
            estimatedMinutes: mins,
            stages,
            cacheRisk: assessCacheRisk(mins, stages, CACHE_TTL_MS),
          };
          console.log(JSON.stringify(result, null, 2));
          process.exit(0);
        }

        if (!taskDesc) {
          console.error('错误: 缺少 --task 参数');
          process.exit(1);
        }

        // 尝试读取 PRD（如果有）
        let fullDesc = taskDesc;
        if (prdPath) {
          const prdContent = readPrdIfExists(prdPath);
          if (prdContent) {
            fullDesc = taskDesc + '\n' + prdContent;
          }
        }

        const signals = analyzeTask(fullDesc, fileCount);
        const estimate = estimateStageMinutes(signals, fileCount);
        const cacheRisk = assessCacheRisk(estimate.totalMinutes, estimate.stages, CACHE_TTL_MS);

        const result = {
          mode: 'auto',
          estimatedMinutes: estimate.totalMinutes,
          stages: estimate.stages,
          inputs: {
            taskLength: taskDesc.length,
            prdUsed: prdPath ? !!readPrdIfExists(prdPath) : false,
            fileCount,
          },
          signals: {
            apiCount: signals.apiCount,
            tableCount: signals.tableCount,
            pageCount: signals.pageCount,
            moduleCount: signals.moduleCount,
            complexityMultiplier: signals.complexityMultiplier,
          },
          cacheRisk,
        };

        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      }

      case 'batch-plan': {
        const taskDesc = getopt('--task', '');
        const maxBatchMs = parseInt(getopt('--max-batch-ms', String(CACHE_TTL_MS)), 10);

        if (!taskDesc) {
          console.error('错误: 缺少 --task 参数');
          process.exit(1);
        }

        const signals = analyzeTask(taskDesc);
        const estimate = estimateStageMinutes(signals, 0);
        const cacheRisk = assessCacheRisk(estimate.totalMinutes, estimate.stages, maxBatchMs);

        console.log(JSON.stringify({
          totalEstimatedMinutes: estimate.totalMinutes,
          cacheRisk: cacheRisk.risk,
          recommendation: cacheRisk.recommendation,
          batchPlan: cacheRisk.batchPlan,
        }, null, 2));
        process.exit(0);
      }

      default: {
        console.error(`未知命令: ${cmd}`);
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(`[work-estimator] 错误: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  cli();
}

module.exports = {
  analyzeTask,
  estimateStageMinutes,
  assessCacheRisk,
  readPrdIfExists,
  CACHE_TTL_MS,
  BASE_STAGE_MINUTES,
};
