/**
 * selectionReason数据体积优化测试
 */

const ModelSelector = require('./ModelSelector');

// 测试不同日志级别的selectionReason处理
async function testSelectionReasonOptimization() {
  console.log('=== 测试selectionReason数据体积优化 ===\n');

  // 测试1: 详细日志模式
  console.log('1. 测试详细日志模式 (debug level)...');
  const detailedConfig = {
    monitoring: {
      logSelectionReason: true,
      logging: {
        level: 'debug',
        includeSelectionReason: true,
        detailLevel: 'full'
      }
    }
  };

  let selectorDetailed = new ModelSelector(detailedConfig);
  const subtask1 = {
    description: "创建登录页面组件，包含表单验证功能",
    type: "ui",
    subtype: "component",
    confidence: 0.95
  };

  let result1 = selectorDetailed.select(subtask1);
  console.log(`   详细模式选择: ${result1.selected_model}`);
  console.log(`   详细模式原因长度: ${JSON.stringify(result1.selectionReason || {}).length}\n`);

  // 测试2: 简化日志模式
  console.log('2. 测试简化日志模式 (info level)...');
  const simpleConfig = {
    monitoring: {
      logSelectionReason: true,
      logging: {
        level: 'info',
        includeSelectionReason: true,
        selectionReasonFields: ['decisionType', 'selectedModel', 'primaryReason', 'timestamp'] // 只保留核心字段
      }
    }
  };

  let selectorSimple = new ModelSelector(simpleConfig);
  const subtask2 = {
    description: "实现API接口逻辑",
    type: "logic",
    subtype: "api",
    confidence: 0.85
  };

  let result2 = selectorSimple.select(subtask2);
  console.log(`   简化模式选择: ${result2.selected_model}`);
  console.log(`   简化模式原因长度: ${JSON.stringify(result2.selectionReason || {}).length}\n`);

  // 测试3: 大小限制模式
  console.log('3. 测试大小限制模式...');
  const sizeLimitConfig = {
    monitoring: {
      logSelectionReason: true,
      logging: {
        level: 'info',
        includeSelectionReason: true,
        maxSizeLimit: 1000 // 1KB限制
      }
    }
  };

  let selectorSizeLimit = new ModelSelector(sizeLimitConfig);
  const subtask3 = {
    description: "复杂的数据处理任务，需要高性能计算",
    type: "logic",
    subtype: "data-processing",
    confidence: 0.75,
    complexity: 0.8
  };

  let result3 = selectorSizeLimit.select(subtask3);
  console.log(`   大小限制模式选择: ${result3.selected_model}`);
  console.log(`   大小限制模式原因长度: ${JSON.stringify(result3.selectionReason || {}).length}\n`);

  // 测试4: 禁用selectionReason模式
  console.log('4. 测试禁用selectionReason模式...');
  const disabledConfig = {
    monitoring: {
      logSelectionReason: true,
      logging: {
        level: 'info',
        includeSelectionReason: false
      }
    }
  };

  let selectorDisabled = new ModelSelector(disabledConfig);
  const subtask4 = {
    description: "简单的配置任务",
    type: "config",
    confidence: 0.99
  };

  let result4 = selectorDisabled.select(subtask4);
  console.log(`   禁用模式选择: ${result4.selected_model}`);
  console.log(`   禁用模式原因长度: ${JSON.stringify(result4.selectionReason || {}).length}\n`);

  // 测试5: 批量选择测试
  console.log('5. 批量选择测试（测试异步日志处理器性能）...');
  const batchConfig = {
    monitoring: {
      logSelectionReason: true,
      logging: {
        level: 'debug',
        includeSelectionReason: true,
        detailLevel: 'full',
        asyncDelay: 1, // 添加轻微延迟
        batchSize: 2   // 批处理大小
      }
    }
  };

  let selectorBatch = new ModelSelector(batchConfig);
  const batchSubtasks = [
    { description: "UI组件开发1", type: "ui", subtype: "component", confidence: 0.9 },
    { description: "逻辑实现2", type: "logic", subtype: "api", confidence: 0.8 },
    { description: "测试编写3", type: "test", subtype: "unit", confidence: 0.95 },
    { description: "配置调整4", type: "config", confidence: 0.99 }
  ];

  const startTime = Date.now();
  const batchResults = selectorBatch.batchSelect(batchSubtasks);
  const endTime = Date.now();

  console.log(`   批量选择完成，处理了 ${batchResults.length} 个任务`);
  console.log(`   批量处理耗时: ${endTime - startTime}ms`);
  console.log(`   异步日志处理器状态:`, selectorBatch.asyncLogger.getStatus());

  console.log('\n=== selectionReason数据体积优化测试完成 ===');
}

// 运行测试
testSelectionReasonOptimization().catch(console.error);