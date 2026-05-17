#!/usr/bin/env node
/**
 * kf-model-router — 全自动多模型智能调度系统
 *
 * 核心入口，暴露统一 API。
 *
 * Usage:
 *   const router = require('./index.cjs');
 *   await router.route({ description: "写一个用户登录模块" });
 *   await router.dispatcher.spawn({ description: "...", context: {...} });
 */

const ModelRegistry = require('./model-registry.cjs');
const TaskClassifier = require('./task-classifier.cjs');
const RoutingEngine = require('./routing-engine.cjs');
const Dispatcher = require('./dispatcher.cjs');
const HealthChecker = require('./health-checker.cjs');

// ─── 单例 ───────────────────────────────────────────────────────────
let registry = null;
let classifier = null;
let engine = null;
let dispatcher = null;
let checker = null;
let initialized = false;

/**
 * 初始化智能路由系统（幂等）
 */
async function init(options = {}) {
  if (initialized) return;
  initialized = true;

  registry = new ModelRegistry();
  classifier = new TaskClassifier();
  engine = new RoutingEngine(registry);
  checker = new HealthChecker(registry, {
    probeInterval: options.probeInterval || 60000,
    failureThreshold: options.failureThreshold || 5,
    recoveryTimeout: options.recoveryTimeout || 30000,
  });
  dispatcher = new Dispatcher(registry, engine, checker);

  // 注册默认模型
  registry.registerDefaultModels();

  // 启动健康检查（后台定时器）
  checker.start();

  // 打印初始化摘要
  const modelCount = registry.list().length;
  console.error(`[kf-model-router] 初始化完成: ${modelCount} 个模型, 路由引擎就绪`);
}

/**
 * 路由接口：分析任务描述，返回推荐模型
 * @param {Object} opts
 * @param {string} opts.description - 任务描述
 * @param {string} [opts.strategy] - 路由策略
 * @returns {Promise<{model: Object, fallbackChain: Array, taskProfile: Object, confidence: number}>}
 */
async function route(opts = {}) {
  await init();

  const description = opts.description || '';
  const strategy = opts.strategy || 'balanced';

  // Step 1: 任务分类
  const taskProfile = classifier.classify(description);
  console.error(`[kf-model-router] 任务分类: type=${taskProfile.type}, complexity=${taskProfile.complexity}, confidence=${taskProfile.confidence}`);

  // Step 2: 路由决策
  const decision = await engine.decide(taskProfile, strategy);
  console.error(`[kf-model-router] 路由决策: 推荐=${decision.model.id}, 置信度=${decision.confidence}`);

  return decision;
}

/**
 * 调度接口：路由 + 直接返回 agent model 参数
 * @param {Object} opts
 * @param {string} opts.description - 任务描述
 * @returns {Promise<{model: string, env: Object}>}
 */
async function dispatch(opts = {}) {
  await init();
  const decision = await route(opts);
  return dispatcher.resolveAgentModel(decision.model.id, opts);
}

/**
 * 获取路由统计
 */
function getStats() {
  if (!registry) return {};
  return {
    models: registry.list().map(m => ({
      id: m.id,
      provider: m.provider,
      status: m.health.status,
      circuit_breaker: m.health.circuit_breaker,
      failure_count: m.health.failure_count,
    })),
    routeCount: engine ? engine.routeCount : 0,
  };
}

/**
 * 手动触发健康检查
 */
async function healthCheckAll() {
  await init();
  return checker.checkAll();
}

/**
 * 重置系统（重新初始化）
 */
function reset() {
  if (checker) checker.stop();
  initialized = false;
  registry = null;
  classifier = null;
  engine = null;
  dispatcher = null;
  checker = null;
}

module.exports = {
  init,
  route,
  dispatch,
  getStats,
  healthCheckAll,
  reset,

  // 直接访问内部组件（用于测试）
  get registry() { return registry; },
  get classifier() { return classifier; },
  get engine() { return engine; },
  get dispatcher() { return dispatcher; },
  get checker() { return checker; },
};

// ─── CLI 模式 ────────────────────────────────────────────────────────
if (require.main === module) {
  const cmd = process.argv[2];
  const args = process.argv.slice(3);

  (async () => {
    try {
      switch (cmd) {
        case 'route':
        case 'dispatch': {
          const desc = args.join(' ') || '未指定任务';
          const result = await module.exports[cmd]({ description: desc });
          console.log(JSON.stringify(result, null, 2));
          break;
        }
        case 'stats':
          console.log(JSON.stringify(getStats(), null, 2));
          break;
        case 'health-check':
          await init();
          const results = await checker.checkAll();
          console.log(JSON.stringify(results, null, 2));
          break;
        case 'init':
          await init();
          console.error('[kf-model-router] 初始化完成');
          break;
        default:
          console.error('用法: node index.cjs <route|dispatch|stats|health-check|init> [任务描述]');
          process.exit(1);
      }
    } catch (err) {
      console.error(`[kf-model-router] 错误: ${err.message}`);
      process.exit(1);
    }
  })();
}
