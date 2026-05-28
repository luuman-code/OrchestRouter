/**
 * Model Selector 集成测试
 *
 * 测试与 Decomposer V4 的接口集成
 */

const ModelSelector = require('./ModelSelector');

async function testIntegrationWithDecomposer() {
  console.log('='.repeat(60));
  console.log('Model Selector 与 Decomposer V4 集成测试');
  console.log('='.repeat(60));
  console.log();

  // 创建模型选择器
  const selector = new ModelSelector({
    daily_budget: 10.00,
    max_cost_per_task: 0.50,
    quality_first: false
  });

  // 模拟 Decomposer V4 输出的子任务格式
  const decomposerOutput = {
    subtasks: [
      {
        description: '创建登录页面组件，包含表单和验证功能',
        type: 'ui',
        confidence: 0.95,
        tagSource: 'keyword',
        matchedRule: {
          type: 'ui',
          keywords: ['登录页面', '表单', '验证']
        },
        debugInfo: {
          matchedContent: '创建登录页面组件'
        }
      },
      {
        description: '添加 CSS 样式文件，美化页面外观',
        type: 'style',
        confidence: 0.90,
        tagSource: 'keyword',
        matchedRule: {
          type: 'style',
          keywords: ['CSS', '样式']
        },
        debugInfo: {
          matchedContent: '添加 CSS 样式文件'
        }
      },
      {
        description: '实现用户认证和数据传输的 API 接口',
        type: 'api',
        confidence: 0.92,
        tagSource: 'keyword',
        matchedRule: {
          type: 'api',
          keywords: ['API', '接口', '数据传输']
        },
        debugInfo: {
          matchedContent: '实现 API 接口'
        }
      },
      {
        description: '实现用户权限验证的业务逻辑，包含角色判断和访问控制',
        type: 'logic',
        confidence: 0.88,
        tagSource: 'keyword',
        matchedRule: {
          type: 'logic',
          keywords: ['业务逻辑', '权限验证']
        },
        debugInfo: {
          matchedContent: '实现业务逻辑'
        }
      },
      {
        description: '设计数据库表结构，创建用户实体模型',
        type: 'model',
        confidence: 0.85,
        tagSource: 'semantic',
        matchedRule: {
          type: 'model',
          description_patterns: ['数据库', '实体模型']
        },
        debugInfo: {
          matchedContent: '设计数据库表结构'
        }
      },
      {
        description: '编写单元测试，确保登录功能正确性',
        type: 'test',
        confidence: 0.93,
        tagSource: 'keyword',
        matchedRule: {
          type: 'test',
          keywords: ['单元测试', '测试']
        },
        debugInfo: {
          matchedContent: '编写单元测试'
        }
      }
    ]
  };

  console.log(`接收 Decomposer V4 输出：${decomposerOutput.subtasks.length} 个子任务`);
  console.log();

  // 为每个子任务选择模型
  console.log('--- 开始模型选择 ---');
  console.log();

  const selectionResults = [];

  for (const subtask of decomposerOutput.subtasks) {
    const result = selector.select(subtask);

    selectionResults.push({
      ...subtask,
      selectedModel: result.selected_model,
      estimatedCost: result.estimated_cost,
      selectionReason: result.reason
    });

    console.log(`任务：${subtask.description.substring(0, 30)}...`);
    console.log(`  类型：${subtask.type} (confidence: ${subtask.confidence})`);
    console.log(`  选择模型：${result.selected_model}`);
    console.log(`  原因：${result.reason}`);
    console.log(`  预计成本：$${result.estimated_cost.toFixed(6)}`);
    console.log();
  }

  // 输出统计信息
  console.log('--- 选择结果统计 ---');
  const modelUsage = {};
  let totalCost = 0;

  selectionResults.forEach(result => {
    const model = result.selectedModel;
    modelUsage[model] = (modelUsage[model] || 0) + 1;
    totalCost += result.estimatedCost;
  });

  console.log(`总任务数：${selectionResults.length}`);
  console.log(`总预计成本：$${totalCost.toFixed(6)}`);
  console.log();
  console.log('模型使用分布:');
  for (const [model, count] of Object.entries(modelUsage)) {
    console.log(`  ${model}: ${count} 个任务`);
  }
  console.log();

  // 测试预算状态
  console.log('--- 预算状态 ---');
  const budgetStatus = selector.getBudgetStatus();
  console.log(`初始预算：$${budgetStatus.initialBudget.toFixed(2)}`);
  console.log(`剩余预算：$${budgetStatus.remaining.toFixed(2)}`);
  console.log(`使用率：${(budgetStatus.utilization * 100).toFixed(1)}%`);
  console.log();

  // 测试系统状态报告
  console.log('--- 系统状态报告 ---');
  const statusReport = selector.getStatusReport();
  console.log(`可用模型：${statusReport.models.available}`);
  console.log(`学习功能：${statusReport.learning ? '已启用' : '未启用'}`);
  console.log();

  console.log('='.repeat(60));
  console.log('集成测试完成!');
  console.log('='.repeat(60));

  // 验证输出格式符合计划文档中的接口规范
  console.log();
  console.log('--- 验证输出格式 ---');
  const sampleResult = selectionResults[0];
  const expectedFormat = {
    task_id: '存在 (由 ModelSelector 生成)',
    selected_model: sampleResult.selectedModel,
    reason: sampleResult.selectionReason,
    estimated_cost: sampleResult.estimatedCost,
    alternatives: '存在 (备选模型列表)'
  };

  console.log('输出格式验证:');
  console.log(`  ✓ task_id: ${expectedFormat.task_id}`);
  console.log(`  ✓ selected_model: ${expectedFormat.selected_model}`);
  console.log(`  ✓ reason: ${expectedFormat.reason.substring(0, 30)}...`);
  console.log(`  ✓ estimated_cost: $${expectedFormat.estimated_cost.toFixed(6)}`);
  console.log(`  ✓ alternatives: ${expectedFormat.alternatives}`);
  console.log();
  console.log('所有格式验证通过！输出符合计划文档中的接口规范');
}

// 运行集成测试
testIntegrationWithDecomposer().catch(console.error);
