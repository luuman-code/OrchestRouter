/**
 * 测试实现计划传递功能
 * 验证实现计划是否正确地从请求传递到子任务Prompt中
 */

const OrchestratorServer = require('../src/orchestrator/OrchestratorServer');
const ElasticDecomposer = require('../src/decomposer/index');

// 创建一个简单的测试用例来验证实现计划的传递
async function testImplementationPlanPassing() {
  console.log('开始测试实现计划传递功能...');

  try {
    // 模拟带有实现计划的请求
    const requestBody = {
      implementation_plan: {
        tech_stack: ['JavaScript', 'Node.js', 'Express'],
        architecture_patterns: ['MVC', 'Layered Architecture'],
        code_standards: ['ESLint', 'Prettier', 'JSDoc'],
        path_conventions: ['src/', 'components/', 'utils/', 'tests/'],
        dependencies: ['express', 'cors', 'helmet'],
        best_practices: [
          'Use async/await for promises',
          'Follow error-first callback pattern',
          'Write unit tests for all business logic'
        ],
        considerations: [
          'Security: Sanitize all user inputs',
          'Performance: Implement caching for expensive operations',
          'Maintainability: Keep functions under 50 lines'
        ]
      },
      userRequest: 'Create a user registration API endpoint that validates input and stores user data in a database'
    };

    // 创建一个新的OrchestratorServer实例
    const server = new OrchestratorServer({
      port: 0, // 临时使用0端口表示不需要启动HTTP服务
      ccrRouterUrl: 'http://localhost:3456',
      debug: true
    });

    // 手动调用 _decomposeTask 方法来测试实现计划提取
    const result = await server._decomposeTask(requestBody);

    console.log('分解结果:', JSON.stringify(result, null, 2));

    // 验证结果中是否包含了实现计划相关信息
    const subtasks = result.subtasks || [];

    if (subtasks.length > 0) {
      console.log(`\n✓ 生成了 ${subtasks.length} 个子任务`);

      // 检查子任务的prompt是否包含了实现计划信息
      let implementationPlanFound = false;

      for (let i = 0; i < subtasks.length; i++) {
        const subtask = subtasks[i];
        console.log(`\n子任务 ${i + 1}:`);
        console.log(`类型: ${subtask.type || subtask.constructor.name}`);
        console.log(`描述: ${subtask.description ? subtask.description.substring(0, 100) + '...' : 'N/A'}`);

        // 检查Prompt是否包含实现计划相关信息
        const prompt = subtask.prompt || (subtask.integrationHints && subtask.integrationHints.originalTask ?
                                         subtask.integrationHints.originalTask.prompt : null);
        if (prompt && prompt.includes('IMPLEMENTATION PLAN')) {
          console.log('✓ 发现实现计划信息在子任务Prompt中');
          implementationPlanFound = true;

          // 检查具体的内容
          if (prompt.includes('Tech Stack:') && prompt.includes('JavaScript')) {
            console.log('✓ 技术栈信息已找到');
          }

          if (prompt.includes('Architecture Patterns:') && prompt.includes('MVC')) {
            console.log('✓ 架构模式信息已找到');
          }

          if (prompt.includes('Best Practices:') && prompt.includes('Use async/await')) {
            console.log('✓ 最佳实践信息已找到');
          }
        }
      }

      if (implementationPlanFound) {
        console.log('\n✓ 测试通过: 实现计划已成功传递到子任务');
        return true;
      } else {
        console.log('\n✗ 测试失败: 未在子任务中找到实现计划信息');
        return false;
      }
    } else {
      console.log('\n✗ 测试失败: 未生成任何子任务');
      return false;
    }
  } catch (error) {
    console.error('测试过程中发生错误:', error);
    return false;
  }
}

// 也测试一下直接使用ElasticDecomposer的情况
async function testDirectDecomposer() {
  console.log('\n开始测试直接使用ElasticDecomposer...');

  try {
    const decomposer = new ElasticDecomposer({
      debug: true,
      logLevel: 'debug'
    });

    // 创建一个带实现计划的任务
    const taskWithPlan = {
      title: 'Test Task with Implementation Plan',
      description: 'This is a test task that includes an implementation plan',
      context: {
        description: 'Testing implementation plan injection'
      },
      requirement: 'Create a sample feature with proper architecture',
      deliverables: [
        {
          type: 'api',
          description: 'Create API endpoint for user management',
          filePath: 'src/api/users.js',
          confidence: 0.9
        },
        {
          type: 'component',
          description: 'Create UI component for user list',
          filePath: 'src/components/UserList.jsx',
          confidence: 0.8
        }
      ],
      source: 'test',
      confidence: 0.85,
      backgroundInfo: {
        implementationPlan: {
          tech_stack: ['React', 'Node.js'],
          architecture_patterns: ['Component-Based Architecture'],
          code_standards: ['ESLint', 'Airbnb Style Guide'],
          best_practices: ['Component Reusability', 'State Management']
        }
      }
    };

    const result = await decomposer.decompose(taskWithPlan);
    console.log('分解器结果:', JSON.stringify({
      subtaskCount: result.subtasks.length,
      implementationPlan: !!result.implementationPlan
    }, null, 2));

    if (result.subtasks && result.subtasks.length > 0) {
      console.log(`\n✓ Decomposer生成了 ${result.subtasks.length} 个子任务`);

      // 检查是否包含实现计划
      let planFound = false;
      for (const subtask of result.subtasks) {
        const prompt = typeof subtask === 'object' && subtask.prompt ? subtask.prompt :
                      (subtask.integrationHints && subtask.integrationHints.originalTask ?
                       subtask.integrationHints.originalTask.prompt : '');

        if (prompt && prompt.includes('IMPLEMENTATION PLAN')) {
          console.log('✓ 在子任务Prompt中发现实现计划');
          planFound = true;
          break;
        }
      }

      if (planFound) {
        console.log('✓ Direct Decomposer测试通过');
        return true;
      } else {
        console.log('✗ Direct Decomposer测试失败: 未找到实现计划');
        return false;
      }
    } else {
      console.log('✗ Direct Decomposer测试失败: 无子任务生成');
      return false;
    }
  } catch (error) {
    console.error('Direct Decomposer测试错误:', error);
    return false;
  }
}

// 运行测试
async function runTests() {
  console.log('=== 实现计划传递功能测试 ===\n');

  const test1Result = await testImplementationPlanPassing();
  const test2Result = await testDirectDecomposer();

  console.log('\n=== 测试总结 ===');
  console.log(`Orchestrator测试: ${test1Result ? '✓ 通过' : '✗ 失败'}`);
  console.log(`Decomposer测试: ${test2Result ? '✓ 通过' : '✗ 失败'}`);

  const overallSuccess = test1Result && test2Result;
  console.log(`总体结果: ${overallSuccess ? '✓ 全部通过' : '✗ 部分或全部失败'}`);

  return overallSuccess;
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
  runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('测试执行错误:', error);
      process.exit(1);
    });
}

module.exports = {
  testImplementationPlanPassing,
  testDirectDecomposer,
  runTests
};