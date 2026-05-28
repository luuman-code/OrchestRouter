/**
 * Model Selector 测试文件
 *
 * 测试所有功能块的 functionality
 */

const ModelSelector = require('./ModelSelector');

async function runTests() {
  console.log('='.repeat(60));
  console.log('Model Selector 功能测试');
  console.log('='.repeat(60));
  console.log();

  // 创建模型选择器实例
  const selector = new ModelSelector({
    daily_budget: 5.00,  // 测试预算 $5
    max_cost_per_task: 0.50
  });

  console.log();
  console.log('--- 测试 1: UI 任务模型选择 ---');
  const uiTask = {
    id: 'task_ui_001',
    type: 'ui',
    description: '创建登录页面组件，包含表单和验证功能'
  };
  const uiResult = selector.select(uiTask);
  console.log(`任务类型：${uiTask.type}`);
  console.log(`选择模型：${uiResult.selected_model}`);
  console.log(`原因：${uiResult.reason}`);
  console.log(`预计成本：$${uiResult.estimated_cost.toFixed(6)}`);
  console.log(`预计 Token: ${uiResult.estimated_tokens.input} input / ${uiResult.estimated_tokens.output} output`);
  console.log();

  console.log('--- 测试 2: 逻辑任务模型选择 ---');
  const logicTask = {
    id: 'task_logic_001',
    type: 'logic',
    description: '实现用户权限验证的业务逻辑，包含角色判断和访问控制'
  };
  const logicResult = selector.select(logicTask);
  console.log(`任务类型：${logicTask.type}`);
  console.log(`选择模型：${logicResult.selected_model}`);
  console.log(`原因：${logicResult.reason}`);
  console.log(`预计成本：$${logicResult.estimated_cost.toFixed(6)}`);
  console.log();

  console.log('--- 测试 3: API 任务模型选择 ---');
  const apiTask = {
    id: 'task_api_001',
    type: 'api',
    description: '编写 RESTful API 接口，实现用户认证和数据传输功能'
  };
  const apiResult = selector.select(apiTask);
  console.log(`任务类型：${apiTask.type}`);
  console.log(`选择模型：${apiResult.selected_model}`);
  console.log(`原因：${apiResult.reason}`);
  console.log(`预计成本：$${apiResult.estimated_cost.toFixed(6)}`);
  console.log();

  console.log('--- 测试 4: 测试任务模型选择 ---');
  const testTask = {
    id: 'task_test_001',
    type: 'test',
    description: '编写单元测试，覆盖登录功能的所有边界情况'
  };
  const testResult = selector.select(testTask);
  console.log(`任务类型：${testTask.type}`);
  console.log(`选择模型：${testResult.selected_model}`);
  console.log(`原因：${testResult.reason}`);
  console.log(`预计成本：$${testResult.estimated_cost.toFixed(6)}`);
  console.log();

  console.log('--- 测试 5: 数据模型任务选择 ---');
  const modelTask = {
    id: 'task_model_001',
    type: 'model',
    description: '设计数据库表结构，创建用户实体模型和关联关系'
  };
  const modelResult = selector.select(modelTask);
  console.log(`任务类型：${modelTask.type}`);
  console.log(`选择模型：${modelResult.selected_model}`);
  console.log(`原因：${modelResult.reason}`);
  console.log(`预计成本：$${modelResult.estimated_cost.toFixed(6)}`);
  console.log();

  console.log('--- 测试 6: 批量任务选择 ---');
  const allTasks = [uiTask, logicTask, apiTask, testTask, modelTask];
  const batchResults = selector.batchSelect(allTasks);
  console.log(`批量处理 ${allTasks.length} 个任务:`);
  batchResults.forEach((result, index) => {
    console.log(`  ${index + 1}. ${allTasks[index].type} -> ${result.selected_model} ($${result.estimated_cost.toFixed(6)})`);
  });
  console.log();

  console.log('--- 测试 7: 预算状态查询 ---');
  const budgetStatus = selector.getBudgetStatus();
  console.log(`初始预算：$${budgetStatus.initialBudget.toFixed(2)}`);
  console.log(`已使用：$${budgetStatus.spent.toFixed(6)}`);
  console.log(`剩余：$${budgetStatus.remaining.toFixed(2)}`);
  console.log(`使用率：${(budgetStatus.utilization * 100).toFixed(1)}%`);
  console.log();

  console.log('--- 测试 8: 模型状态查询 ---');
  const modelInfo = selector.getModelInfo('claude-sonnet-4-6');
  console.log(`模型 ID: ${modelInfo.id}`);
  console.log(`名称：${modelInfo.name}`);
  console.log(`提供商：${modelInfo.provider}`);
  console.log(`能力：${modelInfo.capabilities.join(', ')}`);
  console.log(`质量评分：${modelInfo.qualityScore}`);
  console.log();

  console.log('--- 测试 9: 记录反馈（学习功能） ---');
  selector.recordFeedback('task_ui_001', uiResult.selected_model, 8.5, {
    executionTime: 1200,
    userSatisfaction: 9
  });
  console.log('已记录任务反馈，用于优化后续选择');
  console.log();

  console.log('--- 测试 10: 系统状态报告 ---');
  const statusReport = selector.getStatusReport();
  console.log(`报告时间：${statusReport.timestamp}`);
  console.log(`可用模型数：${statusReport.models.available}/${statusReport.models.total}`);
  console.log(`预算使用率：${(statusReport.budget.utilization * 100).toFixed(1)}%`);
  if (statusReport.learning) {
    console.log('学习功能：已启用');
  } else {
    console.log('学习功能：未启用');
  }
  console.log();

  console.log('='.repeat(60));
  console.log('所有测试完成!');
  console.log('='.repeat(60));

  // 输出可用模型列表
  console.log();
  console.log('--- 注册模型列表 ---');
  const models = selector.getAvailableModels();
  models.forEach(model => {
    console.log(`  ${model.id.padEnd(20)} | ${model.provider.padEnd(12)} | 质量：${model.qualityScore} | 成本：$${((model.pricing.input + model.pricing.output) * 1000).toFixed(4)}/K`);
  });
}

// 运行测试
runTests().catch(console.error);
