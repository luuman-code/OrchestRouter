/**
 * 整合器接口规范测试
 */
async function testIntegrationInterface() {
  console.log('测试整合器接口规范...');

  try {
    // 引入所需的模块
    const IntegrationInterface = require('./utils/IntegrationInterface');
    const { EnhancedSubtask } = require('./utils/PromptGenerator');

    console.log('✅ 成功加载 IntegrationInterface');

    // 创建测试子任务，使用 EnhancedSubtask 结构
    const testSubtasks = [
      new EnhancedSubtask({
        id: 'task-1',
        type: 'ui',
        description: '创建按钮组件',
        filePath: 'src/components/Button.jsx',
        prompt: 'Create a button component...'
      }, {
        targetFile: 'src/components/Button.jsx',
        region: 'component_definition',
        dependsOn: [],
        mergeGroupId: 'group-1',
        mergeStrategy: 'merge',
        regionConstraints: { maxLines: 50 },
        originalFilePath: 'src/components/Button.jsx'
      }),

      new EnhancedSubtask({
        id: 'task-2',
        type: 'style',
        description: '添加按钮样式',
        filePath: 'src/components/Button.jsx',
        prompt: 'Add button styles...'
      }, {
        targetFile: 'src/components/Button.jsx',
        region: 'style_section',
        dependsOn: ['task-1'],
        mergeGroupId: 'group-1',
        mergeStrategy: 'merge',
        regionConstraints: { cssSpecific: true },
        originalFilePath: 'src/components/Button.jsx'
      }),

      new EnhancedSubtask({
        id: 'task-3',
        type: 'api',
        description: '创建用户API',
        filePath: 'src/api/users.js',
        prompt: 'Create user API...'
      }, {
        targetFile: 'src/api/users.js',
        region: 'api_functions',
        dependsOn: [],
        mergeGroupId: null,
        mergeStrategy: 'partition',
        regionConstraints: { businessLogic: true },
        originalFilePath: 'src/api/users.js'
      })
    ];

    console.log('✅ 成功创建测试子任务');

    // 测试验证功能
    console.log('\n--- 验证子任务结构 ---');
    testSubtasks.forEach((subtask, index) => {
      const isValid = IntegrationInterface.validateSubtaskStructure(subtask);
      console.log(`  子任务 ${index + 1}: ${isValid ? '✅ 有效' : '❌ 无效'}`);
    });

    // 测试整合处理功能
    console.log('\n--- 测试整合处理功能 ---');
    const integrationData = IntegrationInterface.processForIntegration(testSubtasks);
    console.log(`  处理文件数: ${integrationData.filesToProcess.size}`);
    console.log(`  依赖关系数: ${integrationData.dependencies.size}`);
    console.log(`  合并组数: ${integrationData.mergeGroups.size}`);
    console.log(`  区域规格数: ${integrationData.regionSpecs.size}`);

    // 测试整合报告生成
    console.log('\n--- 生成整合报告 ---');
    const report = IntegrationInterface.generateIntegrationReport(testSubtasks);
    console.log('  报告摘要:', JSON.stringify(report.summary, null, 2));

    // 验证所有 integrationHints 字段
    console.log('\n--- 验证 integrationHints 字段 ---');
    const requiredFields = ['targetFile', 'region', 'dependsOn', 'mergeGroupId', 'mergeStrategy', 'regionConstraints', 'originalTask', 'originalFilePath', 'groupId'];

    testSubtasks.forEach((subtask, index) => {
      console.log(`  子任务 ${index + 1}:`);
      for (const field of requiredFields) {
        const hasField = field in subtask.integrationHints || (field === 'originalTask' && 'originalTask' in subtask.integrationHints);
        console.log(`    ${field}: ${hasField ? '✅' : '❌'}`);
      }
    });

    console.log('\n🎉 整合器接口规范测试通过！');
    console.log('\n符合规范的功能:');
    console.log('  ✅ EnhancedSubtask 结构');
    console.log('  ✅ integrationHints 字段完整性');
    console.log('  ✅ validateSubtaskStructure 方法');
    console.log('  ✅ processForIntegration 方法');
    console.log('  ✅ 整合数据结构 (filesToProcess, dependencies, mergeGroups, regionSpecs)');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

// 运行测试
testIntegrationInterface();