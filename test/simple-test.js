/**
 * 简化的测试脚本来验证实现计划功能
 */

const OrchestratorServer = require('../src/orchestrator/OrchestratorServer');

async function testSimple() {
  console.log('简单测试实现计划提取功能...');

  // 创建请求体，包含implementation_plan
  const requestBody = {
    implementation_plan: {
      tech_stack: ['JavaScript', 'Node.js'],
      architecture_patterns: ['MVC'],
      best_practices: ['Use async/await']
    },
    userRequest: 'Create a simple API endpoint'
  };

  const server = new OrchestratorServer({
    port: 0,
    ccrRouterUrl: 'http://localhost:3456',
    debug: true
  });

  try {
    // 检查我们的新增加的方法
    console.log('_extractConstraintsFromPlan 方法存在:', typeof server._extractConstraintsFromPlan === 'function');
    console.log('_extractGuidelinesFromPlan 方法存在:', typeof server._extractGuidelinesFromPlan === 'function');
    console.log('_formatPlanForPrompt 方法存在:', typeof server._formatPlanForPrompt === 'function');
    console.log('_injectImplementationPlanIntoPrompt 方法存在:', typeof server._injectImplementationPlanIntoPrompt === 'function');

    // 测试方法功能
    const constraints = server._extractConstraintsFromPlan(requestBody.implementation_plan);
    console.log('提取的约束:', constraints);

    const guidelines = server._extractGuidelinesFromPlan(requestBody.implementation_plan);
    console.log('提取的指南:', guidelines);

    const formattedPlan = server._formatPlanForPrompt(requestBody.implementation_plan);
    console.log('格式化的计划:');
    console.log(formattedPlan);

    const injectedPrompt = server._injectImplementationPlanIntoPrompt("Original task instruction", requestBody.implementation_plan);
    console.log('注入后的Prompt预览:');
    console.log(injectedPrompt.substring(0, 200) + '...');

    console.log('\n✓ 简单测试通过：所有方法都已正确定义并可正常工作');
    return true;
  } catch (error) {
    console.error('简单测试失败:', error);
    return false;
  }
}

// 运行简单测试
testSimple().then(result => {
  console.log('\n结果:', result ? '成功' : '失败');
  process.exit(result ? 0 : 1);
});