/**
 * 测试统一配置加载器
 *
 * 使用方法：
 * node config/test-config-loader.js
 */

const path = require('path');
const { UnifiedConfigLoader } = require('./UnifiedConfigLoader');

async function testConfigLoader() {
  console.log('='.repeat(60));
  console.log('统一配置加载器测试');
  console.log('='.repeat(60));
  console.log();

  const loader = new UnifiedConfigLoader({
    configPath: path.join(__dirname, 'config.json'),
    fallbackDir: path.join(__dirname, '..', 'src')
  });

  try {
    // 加载配置
    const config = loader.loadConfig();

    console.log('✓ 配置加载成功');
    console.log(`  配置来源：${loader.getLoadedFrom()}`);
    console.log();

    // 显示 Provider 信息
    console.log('可用的 Provider:');
    const providers = loader.getProviders();
    for (const provider of providers) {
      console.log(`  - ${provider.name}: ${provider.models?.length || 0} 个模型`);
      console.log(`    API 端点：${provider.api_base_url}`);
      if (provider.api_key_env) {
        console.log(`    API 密钥 env: ${provider.api_key_env}`);
      }
    }
    console.log();

    // 显示所有模型
    console.log('所有可用模型:');
    const models = loader.getAllModels();
    console.log(`  共计：${models.length} 个`);
    console.log();

    // 按 Provider 分组显示
    for (const provider of providers) {
      const providerModels = loader.getModelsByProvider(provider.name);
      console.log(`  [${provider.name}]:`);
      for (const model of providerModels.slice(0, 5)) { // 只显示前 5 个
        console.log(`    - ${model.id} (质量：${model.quality_score}, 价格：$${model.pricing.input}/$${model.pricing.output})`);
      }
      if (providerModels.length > 5) {
        console.log(`    ... 还有 ${providerModels.length - 5} 个模型`);
      }
    }
    console.log();

    // 测试获取单个模型
    const testModelId = models[0]?.id;
    if (testModelId) {
      const model = loader.getModel(testModelId);
      console.log(`测试获取模型 ${testModelId}:`);
      console.log(`  名称：${model.name}`);
      console.log(`  Provider: ${model.provider}`);
      console.log(`  API 端点：${model.api_base_url}`);
      console.log(`  上下文：${model.context_limit}`);
      console.log();
    }

    // 显示系统配置
    const systemConfig = loader.getSystemConfig();
    console.log('系统配置:');
    console.log(`  主机：${systemConfig.host}:${systemConfig.port}`);
    console.log(`  调试模式：${systemConfig.debug ? '开启' : '关闭'}`);
    console.log(`  日志级别：${systemConfig.logLevel}`);
    console.log(`  API 超时：${systemConfig.apiTimeoutMs}ms`);
    console.log(`  最大并发：${systemConfig.maxConcurrency}`);
    console.log();

    // 显示选择器配置
    const selectorConfig = loader.getSelectorConfig();
    if (Object.keys(selectorConfig).length > 0) {
      console.log('路由规则:');
      for (const [key, value] of Object.entries(selectorConfig)) {
        if (typeof value !== 'object') {
          console.log(`  ${key}: ${value}`);
        }
      }
      console.log();
    }

    // 显示成本控制配置
    const costConfig = loader.getCostControlConfig();
    if (Object.keys(costConfig).length > 0) {
      console.log('成本控制:');
      console.log(`  日预算：$${costConfig.dailyBudget}`);
      console.log(`  单任务最大成本：$${costConfig.maxCostPerTask}`);
      console.log(`  质量优先：${costConfig.qualityFirst ? '是' : '否'}`);
      console.log();
    }

    console.log('='.repeat(60));
    console.log('✓ 所有测试通过！配置加载器工作正常');
    console.log('='.repeat(60));

    return true;

  } catch (error) {
    console.error('✗ 配置加载失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行测试
testConfigLoader().then(success => {
  process.exit(success ? 0 : 1);
});
