/**
 * 测试配置与插件系统集成
 */
async function testConfigPluginSystem() {
  console.log('测试配置与插件系统集成...');

  try {
    // 创建配置管理器实例
    const { ConfigManager } = require('./config');
    const configManager = new ConfigManager();
    const config = configManager.loadConfig();

    console.log('✅ 配置管理器加载成功');
    console.log(`✅ 加载了 ${Object.keys(config.task_types.built_in).length} 个内置类型`);

    // 创建插件管理器
    const PluginManager = require('./plugins/PluginManager');
    const pluginManager = new PluginManager(config.plugins);

    await pluginManager.initialize();
    console.log('✅ 插件管理器初始化成功');

    // 创建类型标注器（使用增强模式）
    const TypeAnnotator = require('./types/TypeAnnotator');
    const typeAnnotator = new TypeAnnotator({
      ...config,
      pluginManager: pluginManager
    });

    console.log('✅ 类型标注器创建成功（增强模式）');

    // 测试类型匹配
    const testDeliverables = [
      { description: '创建登录页面组件' },
      { description: '编写API接口实现用户认证' },
      { description: '添加样式文件定义页面外观' },
      { description: '编写单元测试确保功能正确' }
    ];

    const annotated = await typeAnnotator.annotateMultiple(testDeliverables);
    console.log('✅ 批量类型标注测试成功');

    console.log('\n标注结果:');
    annotated.forEach((item, index) => {
      console.log(`  ${index + 1}. "${item.description}" -> ${item.type} (confidence: ${item.confidence || 'N/A'})`);
    });

    console.log('\n🎉 配置与插件系统集成测试通过！');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

// 运行测试
testConfigPluginSystem();