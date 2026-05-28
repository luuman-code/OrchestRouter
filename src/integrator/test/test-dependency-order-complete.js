/**
 * 依赖顺序修复完整测试
 * 验证整合器能够正确处理同一文件的多个任务按依赖顺序合并
 */

const { Integrator } = require('../integrator');

async function runTest() {
  console.log('=== 依赖顺序修复完整测试 ===\n');

  const integrator = new Integrator();

  // 模拟有依赖关系的执行结果（故意打乱顺序）
  const executionResults = [
    {
      task_id: 'task-3',
      content: '// Task 3: Export statements\nmodule.exports = { init, process, helper };',
      model_used: 'gpt-4o-mini'
    },
    {
      task_id: 'task-1',
      content: '// Task 1: Configuration\nconst CONFIG = { debug: true };\n\nfunction init() {\n  console.log("init");\n}',
      model_used: 'gpt-4o-mini'
    },
    {
      task_id: 'task-2',
      content: '// Task 2: Helper functions\nfunction helper() { return "helper"; }\nfunction process() { return "processed"; }',
      model_used: 'gpt-4o-mini'
    }
  ];

  // 子任务包含依赖信息
  const subtasks = [
    {
      id: 'task-1',
      type: 'config',
      description: 'Create configuration and init function',
      prompt: 'Create config',
      integrationHints: {
        targetFile: 'src/module.js',
        region: 'config',
        dependsOn: [],
        mergeStrategy: 'append'
      }
    },
    {
      id: 'task-2',
      type: 'logic',
      description: 'Create helper functions',
      prompt: 'Create helpers',
      integrationHints: {
        targetFile: 'src/module.js',
        region: 'helpers',
        dependsOn: ['task-1'],  // 依赖 task-1
        mergeStrategy: 'append'
      }
    },
    {
      id: 'task-3',
      type: 'export',
      description: 'Create exports',
      prompt: 'Create exports',
      integrationHints: {
        targetFile: 'src/module.js',
        region: 'exports',
        dependsOn: ['task-1', 'task-2'],  // 依赖 task-1 和 task-2
        mergeStrategy: 'append'
      }
    }
  ];

  console.log('输入数据:');
  console.log('- 执行结果顺序：task-3, task-1, task-2 (故意打乱)');
  console.log('- 依赖关系：task-1 <- task-2 <- task-3');
  console.log('');

  try {
    // 执行整合
    const result = await integrator.integrate(executionResults, subtasks);

    console.log('整合结果:');
    console.log(`- 成功：${result.success}`);
    console.log(`- 生成文件数：${result.files.size}`);
    console.log(`- 警告数：${result.warnings.length}`);
    console.log('');

    if (result.files && result.files.size > 0) {
      console.log('生成的文件内容:');
      for (const [filePath, file] of result.files.entries()) {
        console.log(`\n=== ${filePath} ===`);
        console.log(file.content);
        console.log('');

        // 验证内容顺序
        const content = file.content;
        const task1Index = content.indexOf('Task 1');
        const task2Index = content.indexOf('Task 2');
        const task3Index = content.indexOf('Task 3');

        console.log('内容顺序验证:');
        console.log(`- Task 1 位置：${task1Index}`);
        console.log(`- Task 2 位置：${task2Index}`);
        console.log(`- Task 3 位置：${task3Index}`);

        if (task1Index >= 0 && task2Index >= 0 && task3Index >= 0) {
          if (task1Index < task2Index && task2Index < task3Index) {
            console.log('✅ 内容顺序正确：Task 1 -> Task 2 -> Task 3 (符合依赖关系)');
          } else {
            console.log('❌ 内容顺序错误：不符合依赖关系');
          }
        } else {
          console.log('⚠️ 无法验证顺序（可能文件未正确合并）');
        }
      }
    }

    if (result.warnings.length > 0) {
      console.log('\n警告信息:');
      result.warnings.forEach(w => console.log(`- ${w}`));
    }

    return result.success;
  } catch (error) {
    console.log('❌ 测试执行出错:', error.message);
    console.log(error.stack);
    return false;
  }
}

// 运行测试
runTest().then(success => {
  console.log('\n=== 测试完成 ===');
  console.log(success ? '✅ 测试通过' : '❌ 测试失败');
  process.exit(success ? 0 : 1);
});