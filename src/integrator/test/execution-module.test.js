/**
 * @fileoverview 模块 G: 执行质量模块单元测试
 *
 * 测试覆盖:
 * - G1: ExecutionQualityEvaluator 实现
 * - G2: evaluate() 实现
 * - G3: 执行原因分析
 * - G4: 成本超支检测
 * - G5: 质量驱动的整合决策
 * - G6: 单元测试
 *
 * @requires ExecutionQualityEvaluator
 * @requires QualityFeedbackProcessor
 */

const { ExecutionQualityEvaluator } = require('../execution/quality_evaluator');
const { QualityFeedbackProcessor } = require('../execution/quality_feedback_processor');

// 测试统计
let passed = 0;
let failed = 0;
const failures = [];

/**
 * 断言函数
 */
function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    failures.push(testName);
    console.error(`  ✗ ${testName}`);
  }
}

/**
 * 断言相等
 */
function assertEqual(actual, expected, testName) {
  assert(actual === expected, `${testName} (期望：${expected}, 实际：${actual})`);
}

/**
 * 断言在范围内
 */
function assertInRange(value, min, max, testName) {
  assert(value >= min && value <= max, `${testName} (应在 ${min}-${max} 范围内，实际：${value})`);
}

// ==================== 模块 G 测试 ====================

async function runTests() {
  console.log('='.repeat(60));
  console.log('模块 G: 执行质量模块单元测试');
  console.log('='.repeat(60));
  console.log();

  // G1-G2: ExecutionQualityEvaluator 基本功能测试
  console.log('G1-G2: ExecutionQualityEvaluator 基本功能测试');
  testExecutionQualityEvaluator();
  console.log();

  // G3: 执行原因分析测试
  console.log('G3: 执行原因分析测试');
  testExecutionReasonsAnalysis();
  console.log();

  // G4: 成本超支检测测试
  console.log('G4: 成本超支检测测试');
  testCostVarianceDetection();
  console.log();

  // G5: 质量驱动的整合决策测试
  console.log('G5: 质量驱动的整合决策测试');
  testQualityBasedDecisions();
  console.log();

  // G5: 质量审核报告测试
  console.log('G5: 质量审核报告测试');
  testQualityAuditReport();
  console.log();

  // G5: 矫正措施测试
  console.log('G5: 矫正措施测试');
  testCorrectiveActions();
  console.log();

  // 输出测试结果
  console.log('='.repeat(60));
  console.log(`测试结果：${passed} 通过，${failed} 失败`);
  if (failures.length > 0) {
    console.log('失败的测试:');
    failures.forEach(f => console.error(`  - ${f}`));
  }
  console.log('='.repeat(60));
}

// ==================== G1-G2: ExecutionQualityEvaluator 测试 ====================

function testExecutionQualityEvaluator() {
  const evaluator = new ExecutionQualityEvaluator();

  assert(evaluator instanceof ExecutionQualityEvaluator, '应能创建 ExecutionQualityEvaluator 实例');
  assert(typeof evaluator.evaluate === 'function', '应有 evaluate 方法');

  // 测试成功执行的质量评估
  const successResult = {
    success: true,
    duration_ms: 5000,
    usage: { input: 100, output: 200 }
  };

  const successQuality = evaluator.evaluate(successResult);
  assert(typeof successQuality === 'object', '应返回质量评估对象');
  assert(successQuality.hasOwnProperty('score'), '结果应包含 score 属性');
  assert(successQuality.hasOwnProperty('issues'), '结果应包含 issues 属性');
  assert(successQuality.hasOwnProperty('recommendations'), '结果应包含 recommendations 属性');
  assertInRange(successQuality.score, 0, 100, '分数应在 0-100 范围内');

  // 测试失败执行的质量评估
  const failResult = {
    success: false,
    duration_ms: 1000
  };

  const failQuality = evaluator.evaluate(failResult);
  assert(failQuality.score < 100, '失败执行的分数应低于 100');
  assert(failQuality.issues.length > 0, '失败执行应有问题列表');

  // 测试执行时间过长的情况
  const slowResult = {
    success: true,
    duration_ms: 70000 // 70 秒
  };

  const slowQuality = evaluator.evaluate(slowResult);
  assert(slowQuality.issues.some(i => i.includes('执行时间')), '应检测到执行时间过长');
}

// ==================== G3: 执行原因分析测试 ====================

function testExecutionReasonsAnalysis() {
  const evaluator = new ExecutionQualityEvaluator();

  // 测试错误相关的 reason
  const errorResult = {
    success: true,
    execution_info: {
      execution_reasons: [
        { reason: 'Error: Connection timeout' },
        { reason: 'Retry after failure' }
      ]
    }
  };

  const errorQuality = evaluator.evaluate(errorResult);
  assert(errorQuality.issues.length > 0, '应检测到错误相关的 reason');
  assert(errorQuality.score < 100, '有错误时分数应降低');

  // 测试降级相关的 reason
  const fallbackResult = {
    success: true,
    execution_info: {
      execution_reasons: [
        { reason: 'Used fallback strategy' }
      ]
    }
  };

  const fallbackQuality = evaluator.evaluate(fallbackResult);
  assert(fallbackQuality.issues.some(i => i.includes('降级')), '应检测到降级策略使用');

  // 测试语法/安全/性能相关的 reason
  const syntaxResult = {
    success: true,
    execution_info: {
      execution_reasons: [
        { reason: 'Syntax warning detected' }
      ]
    }
  };

  const syntaxQuality = evaluator.evaluate(syntaxResult);
  assert(syntaxQuality.issues.some(i => i.toLowerCase().includes('syntax')), '应检测到语法问题');
}

// ==================== G4: 成本超支检测测试 ====================

function testCostVarianceDetection() {
  const evaluator = new ExecutionQualityEvaluator();

  // 测试成本超支
  const highCostResult = {
    success: true,
    execution_info: {
      cost_variance: 0.05 // 超出 5 美分
    }
  };

  const highCostQuality = evaluator.evaluate(highCostResult);
  assert(highCostQuality.issues.some(i => i.includes('成本')), '应检测到成本超支');
  assert(highCostQuality.score < 100, '成本超支应降低分数');

  // 测试正常成本
  const normalCostResult = {
    success: true,
    execution_info: {
      cost_variance: 0.005 // 正常范围内
    }
  };

  const normalCostQuality = evaluator.evaluate(normalCostResult);
  // 正常成本不应触发问题
  const costIssues = normalCostQuality.issues.filter(i => i.includes('成本'));
  assert(costIssues.length === 0, '正常成本不应触发问题');
}

// ==================== G5: 质量驱动的整合决策测试 ====================

function testQualityBasedDecisions() {
  // 准备测试数据
  const associatedResults = [
    {
      task_id: 'task-1',
      subtask: {
        integrationHints: { targetFile: 'components/Button.tsx' }
      }
    },
    {
      task_id: 'task-2',
      subtask: {
        integrationHints: { targetFile: 'components/Input.tsx' }
      }
    },
    {
      task_id: 'task-3',
      subtask: {
        integrationHints: { targetFile: 'components/Button.tsx' } // 与 task-1 冲突
      }
    }
  ];

  const executionQuality = new Map([
    ['task-1', { score: 95, issues: [], recommendations: [] }], // 高质量
    ['task-2', { score: 50, issues: ['performance issue'], recommendations: [] }], // 中等质量
    ['task-3', { score: 25, issues: ['syntax error'], recommendations: [] }] // 低质量
  ]);

  const config = {
    execution: {
      quality_threshold: 70,
      critical_quality_threshold: 40
    }
  };

  // 测试质量决策生成
  const decisions = QualityFeedbackProcessor.applyQualityBasedDecisions(
    associatedResults,
    executionQuality,
    config
  );

  assert(Array.isArray(decisions), '应返回决策数组');
  assert(decisions.length > 0, '决策数组不应为空');

  // 验证决策结构
  const decision = decisions[0];
  assert(decision.hasOwnProperty('taskId'), '决策应包含 taskId');
  assert(decision.hasOwnProperty('strategy'), '决策应包含 strategy');
  assert(decision.hasOwnProperty('priority'), '决策应包含 priority');
  assert(decision.hasOwnProperty('qualityScore'), '决策应包含 qualityScore');
  assert(decision.hasOwnProperty('qualityLabel'), '决策应包含 qualityLabel');

  // 验证高质量结果的策略
  const highQualityDecision = decisions.find(d => d.taskId === 'task-1');
  if (highQualityDecision) {
    assertEqual(highQualityDecision.qualityLabel, 'high', '高质量结果应有 high 标签');
    assert(['aggressive', 'default'].includes(highQualityDecision.strategy), '高质量结果应使用积极或默认策略');
  }

  // 验证低质量结果的策略
  const lowQualityDecision = decisions.find(d => d.taskId === 'task-3');
  if (lowQualityDecision) {
    assert(['low', 'critical'].includes(lowQualityDecision.qualityLabel), '低质量结果应有 low 或 critical 标签');
    assert(['conservative', 'audit_required'].includes(lowQualityDecision.strategy), '低质量结果应使用保守或审核策略');
  }
}

// ==================== G5: 质量审核报告测试 ====================

function testQualityAuditReport() {
  const decisions = [
    {
      taskId: 'task-1',
      qualityScore: 95,
      qualityLabel: 'high',
      auditRequired: false,
      qualityIssues: []
    },
    {
      taskId: 'task-2',
      qualityScore: 25,
      qualityLabel: 'critical',
      auditRequired: true,
      qualityIssues: ['syntax error', 'security issue']
    }
  ];

  const associatedResults = [
    { task_id: 'task-1', subtask: { integrationHints: { targetFile: 'a.tsx' } } },
    { task_id: 'task-2', subtask: { integrationHints: { targetFile: 'b.tsx' } } }
  ];

  const executionQuality = new Map([
    ['task-1', { score: 95, issues: [] }],
    ['task-2', { score: 25, issues: ['syntax error'] }]
  ]);

  // 测试生成审核报告
  const report = QualityFeedbackProcessor.generateQualityAuditReport(
    decisions,
    associatedResults,
    executionQuality
  );

  assert(typeof report === 'string', '应返回字符串报告');
  assert(report.includes('质量审核报告'), '报告应包含标题');

  // 测试无需审核的情况
  const noAuditDecisions = decisions.filter(d => !d.auditRequired);
  const noAuditReport = QualityFeedbackProcessor.generateQualityAuditReport(
    noAuditDecisions,
    [],
    new Map()
  );
  assert(noAuditReport.includes('无需质量审核'), '无需审核时应返回相应消息');
}

// ==================== G5: 矫正措施测试 ====================

function testCorrectiveActions() {
  const codeFile = {
    path: 'test.js',
    content: 'const x = 1;',
    language: 'javascript'
  };

  // 测试高质量代码不需要矫正
  const highQuality = { score: 95, issues: [] };
  const correctedHigh = QualityFeedbackProcessor.applyCorrectiveActions(
    codeFile,
    highQuality,
    {}
  );
  assert(typeof correctedHigh === 'object', '应返回文件对象');
  assert(correctedHigh.hasOwnProperty('content'), '结果应包含 content');

  // 测试低质量代码需要矫正
  const lowQuality = {
    score: 50,
    issues: ['syntax warning', 'security concern']
  };
  const correctedLow = QualityFeedbackProcessor.applyCorrectiveActions(
    codeFile,
    lowQuality,
    {}
  );
  assert(typeof correctedLow === 'object', '应返回文件对象');

  // 测试安全警告添加
  const securityQuality = {
    score: 40,
    issues: ['security issue with eval']
  };
  const fileWithEval = {
    path: 'test.js',
    content: 'eval("code");',
    language: 'javascript'
  };
  const correctedSecurity = QualityFeedbackProcessor.applyCorrectiveActions(
    fileWithEval,
    securityQuality,
    {}
  );
  assert(typeof correctedSecurity === 'object', '应返回文件对象');
}

// ==================== 运行测试 ====================

runTests().catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});
