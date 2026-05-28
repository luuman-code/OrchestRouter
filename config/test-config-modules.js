#!/usr/bin/env node

/**
 * OrchestRouter 配置模块测试脚本
 * 用于验证UI服务器能否正确修改各个配置模块的数据
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'config.json');
const TEMPLATE_PATH = path.join(__dirname, '..', 'config', 'config-template.json');

// API配置
const API_BASE_URL = 'http://localhost:3458';

console.log('开始执行 OrchestRouter 配置模块测试...');

// 读取模板配置
function readTemplateConfig() {
  try {
    const templateData = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    return JSON.parse(templateData);
  } catch (error) {
    console.error(`读取模板配置失败: ${error.message}`);
    return null;
  }
}

// 读取当前配置
async function readCurrentConfig() {
  try {
    // 通过API获取当前配置
    const response = await axios.get(`${API_BASE_URL}/config`);
    return response.data;
  } catch (error) {
    console.error(`通过API读取当前配置失败: ${error.message}`);
    // 如果API调用失败，则尝试从文件读取
    try {
      const currentData = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(currentData);
    } catch (fileError) {
      console.error(`从文件读取配置也失败: ${fileError.message}`);
      return null;
    }
  }
}

// 通过真实的UI API调用来更新配置
async function updateConfigViaAPI(configUpdates) {
  try {
    // 获取当前配置
    let currentConfig = await readCurrentConfig();
    if (!currentConfig) {
      console.error('无法获取当前配置');
      return false;
    }

    // 深度合并配置更新
    const updatedConfig = deepMerge(currentConfig, configUpdates);

    // 通过API保存配置
    const response = await axios.post(`${API_BASE_URL}/api/config/save`, updatedConfig, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('通过API配置更新成功');
    console.log('API响应:', response.data);
    return true;
  } catch (error) {
    console.error(`通过API配置更新失败: ${error.message}`);
    if (error.response) {
      console.error('API响应状态:', error.response.status);
      console.error('API响应数据:', error.response.data);
    }
    return false;
  }
}

// 深度合并对象
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
}

// 测试系统配置
async function testSystemConfig() {
  console.log('\n--- 测试系统配置 ---');

  const testValue = {
    system: {
      port: 3459,  // 修改端口号
      logLevel: 'debug',  // 修改日志级别
      maxConcurrency: 15  // 修改最大并发数
    }
  };

  console.log('准备更新系统配置:', JSON.stringify(testValue.system, null, 2));

  const success = await updateConfigViaAPI(testValue);
  if (success) {
    const updatedConfig = await readCurrentConfig();
    if (updatedConfig &&
        updatedConfig.system.port === 3459 &&
        updatedConfig.system.logLevel === 'debug' &&
        updatedConfig.system.maxConcurrency === 15) {
      console.log('✓ 系统配置测试通过');
      return true;
    } else {
      console.log('✗ 系统配置测试失败 - 配置未正确更新');
      return false;
    }
  } else {
    console.log('✗ 系统配置测试失败 - 更新API调用失败');
    return false;
  }
}

// 测试成本控制配置
async function testCostControlConfig() {
  console.log('\n--- 测试成本控制配置 ---');

  const testValue = {
    costControl: {
      dailyBudget: 2000,  // 修改日常预算
      maxCostPerTask: 200,  // 修改单任务最大成本
      qualityFirst: true  // 修改质量优先策略
    }
  };

  console.log('准备更新成本控制配置:', JSON.stringify(testValue.costControl, null, 2));

  const success = await updateConfigViaAPI(testValue);
  if (success) {
    const updatedConfig = await readCurrentConfig();
    if (updatedConfig &&
        updatedConfig.costControl.dailyBudget === 2000 &&
        updatedConfig.costControl.maxCostPerTask === 200 &&
        updatedConfig.costControl.qualityFirst === true) {
      console.log('✓ 成本控制配置测试通过');
      return true;
    } else {
      console.log('✗ 成本控制配置测试失败 - 配置未正确更新');
      return false;
    }
  } else {
    console.log('✗ 成本控制配置测试失败 - 更新API调用失败');
    return false;
  }
}

// 测试执行器配置
async function testExecutorConfig() {
  console.log('\n--- 测试执行器配置 ---');

  const testValue = {
    executor: {
      general: {
        default_max_concurrency: 15,
        default_timeout: 120000,
        enable_tracing: false
      },
      retry: {
        max_retries: 5,
        base_delay: 2000
      }
    }
  };

  console.log('准备更新执行器配置:', JSON.stringify(testValue.executor, null, 2));

  const success = await updateConfigViaAPI(testValue);
  if (success) {
    const updatedConfig = await readCurrentConfig();
    if (updatedConfig &&
        updatedConfig.executor.general.default_max_concurrency === 15 &&
        updatedConfig.executor.general.default_timeout === 120000 &&
        updatedConfig.executor.general.enable_tracing === false &&
        updatedConfig.executor.retry.max_retries === 5 &&
        updatedConfig.executor.retry.base_delay === 2000) {
      console.log('✓ 执行器配置测试通过');
      return true;
    } else {
      console.log('✗ 执行器配置测试失败 - 配置未正确更新');
      return false;
    }
  } else {
    console.log('✗ 执行器配置测试失败 - 更新API调用失败');
    return false;
  }
}

// 测试分解器配置
async function testDecomposerConfig() {
  console.log('\n--- 测试分解器配置 ---');

  const testValue = {
    decomposer: {
      llm: {
        temperature: 0.5,
        max_concurrency: 5
      },
      debug: {
        enabled: true,
        log_level: 'debug'
      }
    }
  };

  console.log('准备更新分解器配置:', JSON.stringify(testValue.decomposer, null, 2));

  const success = await updateConfigViaAPI(testValue);
  if (success) {
    const updatedConfig = await readCurrentConfig();
    if (updatedConfig &&
        updatedConfig.decomposer.llm.temperature === 0.5 &&
        updatedConfig.decomposer.llm.max_concurrency === 5 &&
        updatedConfig.decomposer.debug.enabled === true &&
        updatedConfig.decomposer.debug.log_level === 'debug') {
      console.log('✓ 分解器配置测试通过');
      return true;
    } else {
      console.log('✗ 分解器配置测试失败 - 配置未正确更新');
      return false;
    }
  } else {
    console.log('✗ 分解器配置测试失败 - 更新API调用失败');
    return false;
  }
}

// 测试编排器配置
async function testOrchestratorConfig() {
  console.log('\n--- 测试编排器配置 ---');

  const testValue = {
    orchestrator: {
      port: 3460,
      debug: true,
      maxConcurrency: 8
    }
  };

  console.log('准备更新编排器配置:', JSON.stringify(testValue.orchestrator, null, 2));

  const success = await updateConfigViaAPI(testValue);
  if (success) {
    const updatedConfig = await readCurrentConfig();
    if (updatedConfig &&
        updatedConfig.orchestrator.port === 3460 &&
        updatedConfig.orchestrator.debug === true &&
        updatedConfig.orchestrator.maxConcurrency === 8) {
      console.log('✓ 编排器配置测试通过');
      return true;
    } else {
      console.log('✗ 编排器配置测试失败 - 配置未正确更新');
      return false;
    }
  } else {
    console.log('✗ 编排器配置测试失败 - 更新API调用失败');
    return false;
  }
}

// 测试熔断器配置
async function testCircuitBreakerConfig() {
  console.log('\n--- 测试熔断器配置 ---');

  const testValue = {
    circuit_breaker: {
      failureThreshold: 3,
      timeout: 45000,
      resetTimeout: 45000
    }
  };

  console.log('准备更新熔断器配置:', JSON.stringify(testValue.circuit_breaker, null, 2));

  const success = await updateConfigViaAPI(testValue);
  if (success) {
    const updatedConfig = await readCurrentConfig();
    if (updatedConfig &&
        updatedConfig.circuit_breaker.failureThreshold === 3 &&
        updatedConfig.circuit_breaker.timeout === 45000 &&
        updatedConfig.circuit_breaker.resetTimeout === 45000) {
      console.log('✓ 熔断器配置测试通过');
      return true;
    } else {
      console.log('✗ 熔断器配置测试失败 - 配置未正确更新');
      return false;
    }
  } else {
    console.log('✗ 熔断器配置测试失败 - 更新API调用失败');
    return false;
  }
}

// 测试会话管理配置
async function testSessionConfig() {
  console.log('\n--- 测试会话管理配置 ---');

  const testValue = {
    session: {
      storage: {
        memory: {
          maxSessions: 2000,
          ttl: 7200000
        }
      },
      lifecycle: {
        idleTimeout: 3600000
      }
    }
  };

  console.log('准备更新会话管理配置:', JSON.stringify(testValue.session, null, 2));

  const success = await updateConfigViaAPI(testValue);
  if (success) {
    const updatedConfig = await readCurrentConfig();
    if (updatedConfig &&
        updatedConfig.session.storage.memory.maxSessions === 2000 &&
        updatedConfig.session.storage.memory.ttl === 7200000 &&
        updatedConfig.session.lifecycle.idleTimeout === 3600000) {
      console.log('✓ 会话管理配置测试通过');
      return true;
    } else {
      console.log('✗ 会话管理配置测试失败 - 配置未正确更新');
      return false;
    }
  } else {
    console.log('✗ 会话管理配置测试失败 - 更新API调用失败');
    return false;
  }
}

// 测试限流器配置
async function testRateLimiterConfig() {
  console.log('\n--- 测试限流器配置 ---');

  const testValue = {
    rate_limiter: {
      default_rps: 20,
      burst_capacity: 50,
      health_check_factor: 0.2
    }
  };

  console.log('准备更新限流器配置:', JSON.stringify(testValue.rate_limiter, null, 2));

  const success = await updateConfigViaAPI(testValue);
  if (success) {
    const updatedConfig = await readCurrentConfig();
    if (updatedConfig &&
        updatedConfig.rate_limiter.default_rps === 20 &&
        updatedConfig.rate_limiter.burst_capacity === 50 &&
        updatedConfig.rate_limiter.health_check_factor === 0.2) {
      console.log('✓ 限流器配置测试通过');
      return true;
    } else {
      console.log('✗ 限流器配置测试失败 - 配置未正确更新');
      return false;
    }
  } else {
    console.log('✗ 限流器配置测试失败 - 更新API调用失败');
    return false;
  }
}

// 测试学习引擎配置
async function testLearningEngineConfig() {
  console.log('\n--- 测试学习引擎配置 ---');

  const testValue = {
    learning_engine: {
      enabled: false,
      performance_window: 200,
      learning_rate: 0.15
    }
  };

  console.log('准备更新学习引擎配置:', JSON.stringify(testValue.learning_engine, null, 2));

  const success = await updateConfigViaAPI(testValue);
  if (success) {
    const updatedConfig = await readCurrentConfig();
    if (updatedConfig &&
        updatedConfig.learning_engine.enabled === false &&
        updatedConfig.learning_engine.performance_window === 200 &&
        updatedConfig.learning_engine.learning_rate === 0.15) {
      console.log('✓ 学习引擎配置测试通过');
      return true;
    } else {
      console.log('✗ 学习引擎配置测试失败 - 配置未正确更新');
      return false;
    }
  } else {
    console.log('✗ 学习引擎配置测试失败 - 更新API调用失败');
    return false;
  }
}

// 测试重试管理器配置
async function testRetryManagerConfig() {
  console.log('\n--- 测试重试管理器配置 ---');

  const testValue = {
    retry_manager: {
      max_retries: 5,
      base_delay: 1500,
      exponential_base: 2.5
    }
  };

  console.log('准备更新重试管理器配置:', JSON.stringify(testValue.retry_manager, null, 2));

  const success = await updateConfigViaAPI(testValue);
  if (success) {
    const updatedConfig = await readCurrentConfig();
    if (updatedConfig &&
        updatedConfig.retry_manager.max_retries === 5 &&
        updatedConfig.retry_manager.base_delay === 1500 &&
        updatedConfig.retry_manager.exponential_base === 2.5) {
      console.log('✓ 重试管理器配置测试通过');
      return true;
    } else {
      console.log('✗ 重试管理器配置测试失败 - 配置未正确更新');
      return false;
    }
  } else {
    console.log('✗ 重试管理器配置测试失败 - 更新API调用失败');
    return false;
  }
}

// 主测试函数
async function runAllTests() {
  console.log('开始执行所有配置模块测试...\n');

  let passedTests = 0;
  const totalTests = 10; // 系统、成本控制、执行器、分解器、编排器、熔断器、会话、限流器、学习引擎、重试管理器

  // 依次测试每个配置模块
  const tests = [
    testSystemConfig,
    testCostControlConfig,
    testExecutorConfig,
    testDecomposerConfig,
    testOrchestratorConfig,
    testCircuitBreakerConfig,
    testSessionConfig,
    testRateLimiterConfig,
    testLearningEngineConfig,
    testRetryManagerConfig
  ];

  for (let i = 0; i < tests.length; i++) {
    try {
      const testResult = await tests[i]();
      if (testResult) passedTests++;
    } catch (error) {
      console.error(`测试过程中发生错误: ${error.message}`);
    }
  }

  console.log(`\n=== 测试结果汇总 ===`);
  console.log(`总测试数: ${totalTests}`);
  console.log(`通过测试: ${passedTests}`);
  console.log(`失败测试: ${totalTests - passedTests}`);

  if (passedTests === totalTests) {
    console.log('🎉 所有配置模块测试通过！');
    return true;
  } else {
    console.log('❌ 部分配置模块测试失败，请检查配置更新机制');
    return false;
  }
}

// 从模板恢复配置 - 注意：这个函数用于紧急恢复，通常情况下应通过API恢复
function restoreFromTemplate() {
  console.log('\n正在从模板恢复原始配置...');
  try {
    const templateConfig = readTemplateConfig();
    if (templateConfig) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(templateConfig, null, 2), 'utf8');
      console.log('配置已从模板恢复');
    }
  } catch (error) {
    console.error(`恢复配置失败: ${error.message}`);
  }
}

// 运行测试
if (require.main === module) {
  runAllTests()
    .then(success => {
      if (success) {
        console.log('\n所有测试完成，配置文件处于测试后状态。');
      } else {
        console.log('\n部分测试失败，配置文件可能处于不一致状态。');
      }

      // 提供恢复选项
      console.log('\n如需恢复原始配置，请运行: node restore-config.js');
    })
    .catch(error => {
      console.error('测试执行过程中发生错误:', error);
    });
}

module.exports = {
  readTemplateConfig,
  readCurrentConfig,
  updateConfigViaAPI,
  testSystemConfig,
  testCostControlConfig,
  testExecutorConfig,
  testDecomposerConfig,
  testOrchestratorConfig,
  testCircuitBreakerConfig,
  testSessionConfig,
  testRateLimiterConfig,
  testLearningEngineConfig,
  testRetryManagerConfig,
  runAllTests
};