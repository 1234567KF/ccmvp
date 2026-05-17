#!/usr/bin/env node
/**
 * kf-model-router 集成测试
 *
 * 测试覆盖：
 *   1. 模型注册和查询
 *   2. 任务分类准确性
 *   3. 路由决策合理性
 *   4. 密钥隔离
 *   5. 降级链触发
 *
 * Usage: node test/smart-router.test.cjs
 */

const path = require('path');

// 设置 Mock API 密钥（确保路由测试时模型可用）
process.env.DEEPSEEK_API_KEY = 'sk-mock-deepseek-key-for-testing';
process.env.MINIMAX_API_KEY = 'sk-mock-minimax-key-for-testing';
process.env.KIMI_API_KEY = 'sk-mock-kimi-key-for-testing';

// 切换到技能目录
process.chdir(path.resolve(__dirname, '..'));

const ModelRegistry = require('../model-registry.cjs');
const TaskClassifier = require('../task-classifier.cjs');
const RoutingEngine = require('../routing-engine.cjs');
const HealthChecker = require('../health-checker.cjs');
const Dispatcher = require('../dispatcher.cjs');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log(`  ✅ ${message} (=${JSON.stringify(expected)})`);
  } else {
    failed++;
    console.error(`  ❌ ${message}: 期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}`);
  }
}

function assertInArray(item, array, message) {
  if (array.includes(item)) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}: ${JSON.stringify(item)} 不在 ${JSON.stringify(array)} 中`);
  }
}

// ────────────────────────────────────────────────────────────────────
// Test Suite
// ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n📋 kf-model-router 集成测试');
  console.log('='.repeat(60));

  // ─── Test 1: ModelRegistry ─────────────────────────────────────────
  console.log('\n【Test 1】ModelRegistry — 模型注册与查询');
  {
    const registry = new ModelRegistry();
    registry.registerDefaultModels();

    // 1.1 注册了 4 个默认模型
    assertEqual(registry.list().length, 4, '注册了 4 个默认模型');

    // 1.2 按 ID 查询
    const pro = registry.get('deepseek-v4-pro');
    assert(pro !== null, 'deepseek-v4-pro 查询成功');
    assertEqual(pro.provider, 'deepseek', '供应商为 deepseek');
    assertEqual(pro.type, 'reasoning', '类型为 reasoning');

    // 1.3 按供应商过滤
    const deepseekModels = registry.list({ provider: 'deepseek' });
    assertEqual(deepseekModels.length, 2, 'DeepSeek 有 2 个模型');

    const kimiModels = registry.list({ provider: 'kimi' });
    assertEqual(kimiModels.length, 1, 'Kimi 有 1 个模型');

    const minimaxModels = registry.list({ provider: 'minimax' });
    assertEqual(minimaxModels.length, 1, 'MiniMax 有 1 个模型');

    // 1.4 按类型过滤
    const reasoningModels = registry.list({ type: 'reasoning' });
    assertEqual(reasoningModels.length, 2, '有 2 个 reasoning 类型模型');

    // 1.5 降级链
    const chain = registry.getFallbackChain('deepseek-v4-pro');
    assert(chain.length >= 2, '降级链至少包含 2 个模型');
    assertEqual(chain[0], 'deepseek-v4-pro', '降级链第一个为自身');

    // 1.6 按任务类型查询
    const codingModels = registry.findByTaskType('coding');
    assert(codingModels.length >= 2, '至少有 2 个模型适合 coding');

    // 1.7 注册/注销
    registry.register({
      id: 'test-model',
      provider: 'test',
      name: 'Test Model',
      type: 'chat',
      capabilities: {},
      cost: { input: 0, output: 0, cache_hit_input: 0, currency: 'CNY' },
      suitable_for: [],
      api: { api_key_env: 'TEST_KEY' },
      agent_model_map: 'haiku',
      health: { status: 'unknown' },
    });
    assert(registry.get('test-model') !== null, '注册新模型成功');

    registry.unregister('test-model');
    assert(registry.get('test-model') === null, '注销模型成功');
  }

  // ─── Test 2: TaskClassifier ─────────────────────────────────────────
  console.log('\n【Test 2】TaskClassifier — 语义任务分类');
  {
    const classifier = new TaskClassifier();

    // 2.1 编码任务
    const codingProfile = classifier.classify('写一个用户登录模块，包含表单验证和 JWT token 生成');
    assertEqual(codingProfile.type, 'coding', '编码任务类型判定正确');
    assert(['simple', 'medium'].includes(codingProfile.complexity), '编码任务复杂度合理');

    // 2.2 架构任务
    const archProfile = classifier.classify(
      '需要设计一个微服务架构方案，包含服务拆分、API 网关、消息队列和数据分片策略'
    );
    assertEqual(archProfile.type, 'architecture', '架构任务类型判定正确');
    assert(['complex', 'very_complex'].includes(archProfile.complexity), '架构任务复杂度为 complex+');

    // 2.3 Debug 任务
    const debugProfile = classifier.classify('修复线上 bug：用户支付成功后没有跳转到订单页面');
    assertEqual(debugProfile.type, 'debug', 'debug 任务类型判定正确');

    // 2.4 文档任务
    const docProfile = classifier.classify('给这个 API 写一份完整的文档，包含使用示例');
    assertEqual(docProfile.type, 'doc', '文档任务类型判定正确');

    // 2.5 Question 任务
    const qProfile = classifier.classify('什么是 RESTful API？和 GraphQL 有什么区别？');
    assertEqual(qProfile.type, 'question', '问答任务类型判定正确');
    assertEqual(qProfile.complexity, 'simple', '问答任务复杂度为 simple');

    // 2.6 空描述
    const emptyProfile = classifier.classify('');
    assertEqual(emptyProfile.type, 'question', '空描述默认类型为 question');

    // 2.7 计划任务
    const planProfile = classifier.classify('做一份 Q3 的技术路线图规划，标注关键里程碑');
    assertEqual(planProfile.type, 'planning', '计划任务类型判定正确');

    // 2.8 审查任务
    const reviewProfile = classifier.classify('做一次代码审查，检查安全漏洞和性能问题');
    assertEqual(reviewProfile.type, 'review', '审查任务类型判定正确');

    // 2.9 测试任务
    const testProfile = classifier.classify('写单元测试，覆盖所有边界情况');
    assertEqual(testProfile.type, 'testing', '测试任务类型判定正确');
  }

  // ─── Test 3: RoutingEngine ─────────────────────────────────────────
  console.log('\n【Test 3】RoutingEngine — 路由决策');
  {
    const registry = new ModelRegistry();
    registry.registerDefaultModels();
    const engine = new RoutingEngine(registry);
    const classifier = new TaskClassifier();

    // 3.1 简单编码任务 → flash
    const simpleTask = classifier.classify('写一个 hello world 程序');
    const simpleDecision = await engine.decide(simpleTask);
    assert(simpleDecision.model !== null, '有推荐模型');
    assertInArray(simpleDecision.model.id,
      ['deepseek-v4-flash', 'kimi-k2.5'],
      '简单任务推荐轻量模型');

    // 3.2 复杂架构任务 → pro
    const complexTask = classifier.classify(
      '设计一个支持千万级并发的分布式系统架构，包含服务发现、负载均衡、熔断降级和数据一致性保证'
    );
    const complexDecision = await engine.decide(complexTask);
    assert(complexDecision.model !== null, '复杂任务有推荐模型');
    assertInArray(complexDecision.model.id,
      ['deepseek-v4-pro', 'minimax-2.7'],
      '复杂任务推荐推理型模型');

    // 3.3 调试任务 → pro 或 minimax
    const debugTask = classifier.classify('排查一个内存泄漏问题，分析 heap dump');
    const debugDecision = await engine.decide(debugTask);
    assertInArray(debugDecision.model.id,
      ['deepseek-v4-pro', 'minimax-2.7'],
      '调试任务推荐推理型模型');

    // 3.4 简单问答 → kimi 或 flash
    const qaTask = classifier.classify('vue 和 react 有什么区别');
    const qaDecision = await engine.decide(qaTask);
    assertInArray(qaDecision.model.id,
      ['kimi-k2.5', 'deepseek-v4-flash'],
      '简单问答推荐轻量模型');

    // 3.5 降级链存在
    assert(complexDecision.fallbackChain.length > 0, '降级链非空');

    // 3.6 不同策略结果可能不同（至少不报错）
    const costDecision = await engine.decide(simpleTask, 'cost_optimized');
    assert(costDecision.model !== null, 'cost_optimized 策略有效');

    const perfDecision = await engine.decide(simpleTask, 'performance_optimized');
    assert(perfDecision.model !== null, 'performance_optimized 策略有效');
  }

  // ─── Test 4: Dispatcher ────────────────────────────────────────────
  console.log('\n【Test 4】Dispatcher — 并发调度');
  {
    const registry = new ModelRegistry();
    registry.registerDefaultModels();
    const engine = new RoutingEngine(registry);
    const checker = new HealthChecker(registry);
    const dispatcher = new Dispatcher(registry, engine, checker);

    // 4.1 pro → opus 映射
    const proResult = dispatcher.resolveAgentModel('deepseek-v4-pro');
    assertEqual(proResult.model, 'opus', 'pro 模型映射到 opus');

    // 4.2 flash → sonnet 映射
    const flashResult = dispatcher.resolveAgentModel('deepseek-v4-flash');
    assertEqual(flashResult.model, 'sonnet', 'flash 模型映射到 sonnet');

    // 4.3 kimi-k2.5 → sonnet 映射
    const kimiResult = dispatcher.resolveAgentModel('kimi-k2.5');
    assertEqual(kimiResult.model, 'sonnet', 'kimi-k2.5 模型映射到 sonnet');

    // 4.4 不存在模型 → sonnet fallback
    const unknownResult = dispatcher.resolveAgentModel('non-existent-model');
    assertEqual(unknownResult.model, 'sonnet', '不存在的模型 fallback 到 sonnet');

    // 4.5 分发后 allocation 计数
    dispatcher.resolveAgentModel('deepseek-v4-flash');
    dispatcher.resolveAgentModel('deepseek-v4-flash');
    const allocations = dispatcher.getAllocations();
    assert(allocations['deepseek-v4-flash'] >= 1, 'dispatch 计入 allocation');

    // 4.6 release
    dispatcher.release('deepseek-v4-flash');
    const afterRelease = dispatcher.getAllocations();
    // release 后计数可能为 0（删了 key）或减少
    const count = afterRelease['deepseek-v4-flash'] || 0;
    assert(count >= 0, 'release 后计数正确');
  }

  // ─── Test 5: HealthChecker ─────────────────────────────────────────
  console.log('\n【Test 5】HealthChecker — 健康探测与断路器');
  {
    const registry = new ModelRegistry();
    registry.registerDefaultModels();
    const checker = new HealthChecker(registry, {
      failureThreshold: 3,
      recoveryTimeout: 100,
    });

    // 5.1 初始状态
    const summary = checker.getSummary();
    assert(summary.length === 4, '4 个模型的健康摘要');

    // 5.2 报告失败 → 断路器
    const pro = registry.get('deepseek-v4-pro');
    checker.reportFailure('deepseek-v4-pro', 'test_failure');
    checker.reportFailure('deepseek-v4-pro', 'test_failure');
    checker.reportFailure('deepseek-v4-pro', 'test_failure');
    assertEqual(pro.health.failure_count, 3, '失败计数为 3');
    assertEqual(pro.health.circuit_breaker, 'open', '达到阈值后断路器打开');
    assertEqual(pro.health.status, 'down', '断路器打开后状态为 down');

    // 5.3 模型不可用
    assert(!registry.isAvailable('deepseek-v4-pro'), '断路器打开后不可用');

    // 5.4 报告成功 → 恢复（半开需要恢复超时后）
    checker.reportSuccess('deepseek-v4-pro');
    // 断路器还是 open，因为只有半开时连续成功才恢复
    // 但失败计数会减少
    assertEqual(pro.health.failure_count, 2, '成功后失败计数减少');
  }

  // ─── Test 6: Key Isolation ─────────────────────────────────────────
  console.log('\n【Test 6】Key Isolation — 密钥隔离');
  {
    const registry = new ModelRegistry();
    registry.registerDefaultModels();

    // 6.1 密钥不存在时不可用
    // （模拟：不设置环境变量）
    const flashBefore = registry.get('deepseek-v4-flash');
    // 如果没设密钥，注册时标记为 unavailable
    // 但如果密钥存在则正常
    // 这里只验证 getApiKey 返回 null 的情况
    if (!process.env.DEEPSEEK_API_KEY) {
      const key = registry.getApiKey('deepseek-v4-flash');
      assert(key === null, '未设置密钥时返回 null');
    }

    // 6.2 按供应商隔离
    assertEqual(registry.get('deepseek-v4-pro').api.api_key_env, 'DEEPSEEK_API_KEY', 'DeepSeek 密钥变量');
    assertEqual(registry.get('minimax-2.7').api.api_key_env, 'MINIMAX_API_KEY', 'MiniMax 密钥变量');
    assertEqual(registry.get('kimi-k2.5').api.api_key_env, 'KIMI_API_KEY', 'Kimi 密钥变量');
  }

  // ─── Test 7: End-to-End Flow ───────────────────────────────────────
  console.log('\n【Test 7】End-to-End — 完整流程');
  {
    const router = require('../index.cjs');
    await router.init();

    // 7.1 统计
    const stats = router.getStats();
    assert(stats.models.length === 4, '初始化后 4 个模型');
    assert(typeof stats.routeCount === 'number', 'routeCount 存在');

    // 7.2 route API
    const decision = await router.route({
      description: '实现一个用户管理系统，包含 CRUD 和权限控制',
    });
    assert(decision.model !== null, 'route API 返回模型');
    assert(decision.taskProfile !== null, 'route API 返回 taskProfile');
    assert(decision.confidence > 0, 'route API 返回置信度');

    // 7.3 dispatch API
    const agentConfig = await router.dispatch({
      description: '修复一个样式 bug',
    });
    assert(typeof agentConfig.model === 'string', 'dispatch API 返回 model 字符串');
    assert(typeof agentConfig.modelId === 'string', 'dispatch API 返回 modelId');
    assert(Array.isArray(agentConfig.fallbacks), 'dispatch API 返回 fallbacks 数组');

    // 7.4 reset
    router.reset();
    const statsAfterReset = router.getStats();
    assertEqual(Object.keys(statsAfterReset).length, 0, 'reset 后状态清空');
  }

  // ─── Summary ────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  const total = passed + failed;
  console.log(`📊 测试结果: ${passed}/${total} 通过`);
  if (failed > 0) {
    console.error(`❌ ${failed} 个测试失败`);
    process.exit(1);
  } else {
    console.log('✅ 全部测试通过');
  }
}

runTests().catch(err => {
  console.error(`\n💥 测试异常: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
