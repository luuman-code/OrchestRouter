/**
 * 完整集成测试 - 模拟分解器、执行器、整合器协同工作
 */

const fs = require('fs').promises;
const path = require('path');
const { Integrator } = require('../integrator');

// 模拟分解器
class MockDecomposer {
  decompose(userRequest) {
    console.log('🔧 模拟分解器正在分解用户请求...');

    // 模拟用户请求：创建一个简单的登录表单组件
    const subtasks = [
      {
        id: 'config-task',
        type: 'configuration',
        description: 'Create module configuration',
        prompt: 'Create module configuration constants and setup',
        integrationHints: {
          targetFile: 'src/login/LoginForm.js',
          region: 'config',
          dependsOn: [],
          mergeStrategy: 'append'
        }
      },
      {
        id: 'validation-task',
        type: 'validation',
        description: 'Create validation functions',
        prompt: 'Create login form validation functions',
        integrationHints: {
          targetFile: 'src/login/LoginForm.js',
          region: 'validation',
          dependsOn: ['config-task'],  // 依赖配置任务
          mergeStrategy: 'append'
        }
      },
      {
        id: 'component-task',
        type: 'component',
        description: 'Create React component',
        prompt: 'Create React LoginForm component',
        integrationHints: {
          targetFile: 'src/login/LoginForm.js',
          region: 'component',
          dependsOn: ['config-task', 'validation-task'],  // 依赖前两个任务
          mergeStrategy: 'append'
        }
      },
      {
        id: 'styles-task',
        type: 'styling',
        description: 'Create CSS styles',
        prompt: 'Create CSS styles for login form',
        integrationHints: {
          targetFile: 'src/login/styles.css',
          region: 'styles',
          dependsOn: [],
          mergeStrategy: 'overwrite'
        }
      },
      {
        id: 'utils-task',
        type: 'utility',
        description: 'Create utility functions',
        prompt: 'Create utility functions for login process',
        integrationHints: {
          targetFile: 'src/utils/auth.js',
          region: 'utilities',
          dependsOn: [],
          mergeStrategy: 'overwrite'
        }
      }
    ];

    console.log(`📝 分解完成，共创建 ${subtasks.length} 个子任务`);
    return subtasks;
  }
}

// 模拟执行器（模拟并发执行）
class MockExecutor {
  async execute(subtasks) {
    console.log('⚡ 模拟执行器开始并发执行任务...');

    // 模拟并发执行（实际上使用 setTimeout 模拟延迟）
    const promises = subtasks.map(async (task) => {
      console.log(`  📋 执行任务: ${task.id} (${task.type})`);

      // 模拟不同任务的执行时间（随机延迟，模拟真实情况）
      const delay = Math.random() * 100 + 50; // 50-150ms
      await new Promise(resolve => setTimeout(resolve, delay));

      // 为每个任务生成不同的模拟内容
      let content;
      switch(task.id) {
        case 'config-task':
          content = `// Config task: Module configuration
const LOGIN_CONFIG = {
  maxAttempts: 3,
  timeout: 30000,
  requireCaptcha: true
};

function initializeConfig() {
  console.log('Configuration initialized');
}`;
          break;

        case 'validation-task':
          content = `// Validation task: Login validation functions
function validateEmail(email) {
  return /^[^@]+@[^@]+\\.[^@]+$/.test(email);
}

function validatePassword(password) {
  return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

function validateLoginForm(data) {
  return {
    email: validateEmail(data.email),
    password: validatePassword(data.password),
    isValid: validateEmail(data.email) && validatePassword(data.password)
  };
}`;
          break;

        case 'component-task':
          content = `// Component task: React LoginForm component
import React, { useState } from 'react';

function LoginForm({ onSubmit }) {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    const validation = validateLoginForm(formData);
    if (validation.isValid) {
      onSubmit(formData);
    } else {
      setErrors(validation);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({...formData, email: e.target.value})}
        placeholder="Email"
      />
      <input
        type="password"
        value={formData.password}
        onChange={(e) => setFormData({...formData, password: e.target.value})}
        placeholder="Password"
      />
      <button type="submit">Login</button>
    </form>
  );
}`;
          break;

        case 'styles-task':
          content = `/* Styles task: Login form CSS */
.login-form {
  width: 300px;
  margin: 0 auto;
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 5px;
}

.login-form input {
  width: 100%;
  padding: 10px;
  margin-bottom: 10px;
  border: 1px solid #ddd;
  border-radius: 3px;
}

.login-form button {
  width: 100%;
  padding: 10px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}`;
          break;

        case 'utils-task':
          content = `// Utils task: Authentication utilities
async function authenticateUser(credentials) {
  // Simulate API call
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });

  if (response.ok) {
    return response.json();
  } else {
    throw new Error('Authentication failed');
  }
}

function storeAuthToken(token) {
  localStorage.setItem('authToken', token);
}`;

          break;

        default:
          content = `// Content for ${task.id}`;
      }

      // 模拟随机延迟后返回结果（模拟不同任务完成时间不同）
      return {
        task_id: task.id,
        content: content,
        model_used: 'mock-model-v1'
      };
    });

    // 并发执行所有任务
    const results = await Promise.all(promises);

    // 打乱结果顺序以模拟真实并发环境（有些任务可能比预期早完成）
    const shuffledResults = [...results].sort(() => Math.random() - 0.5);

    console.log(`✅ 所有任务执行完成，结果顺序已随机化:`);
    shuffledResults.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.task_id}`);
    });

    return shuffledResults;
  }
}

// 主测试函数
async function runFullIntegrationTest() {
  console.log('🧪 开始完整集成测试\n');

  // 创建模拟组件
  const decomposer = new MockDecomposer();
  const executor = new MockExecutor();
  const integrator = new Integrator();

  // 1. 模拟分解器分解任务
  const userRequest = 'Create a login form component with validation and styling';
  const subtasks = decomposer.decompose(userRequest);

  // 2. 模拟执行器并发执行任务
  const executionResults = await executor.execute(subtasks);

  // 3. 整合器整合结果
  console.log('\n🔄 开始整合...');
  const integrationResult = await integrator.integrate(executionResults, subtasks);

  console.log('\n📊 整合结果:');
  console.log(`- 成功: ${integrationResult.success}`);
  console.log(`- 生成文件数: ${integrationResult.files.size}`);
  console.log(`- 警告数: ${integrationResult.warnings.length}`);

  if (integrationResult.warnings.length > 0) {
    console.log('\n⚠️ 警告信息:');
    integrationResult.warnings.forEach(warning => console.log(`  - ${warning}`));
  }

  // 4. 验证生成的文件内容
  console.log('\n📋 生成的文件:');
  for (const [filePath, file] of integrationResult.files.entries()) {
    const displayPath = filePath.startsWith('./') ? filePath.substring(2) : filePath;
    console.log(`\n📄 文件: ${displayPath}`);
    console.log('---');
    console.log(file.content);
    console.log('---');

    // 验证依赖顺序是否正确（特别是 src/login/LoginForm.js）
    if (filePath.includes('LoginForm') || displayPath.includes('LoginForm')) {
      console.log('\n🔍 验证 LoginForm 中的依赖顺序:');
      const content = file.content;

      const configIndex = content.indexOf('// Config task');
      const validationIndex = content.indexOf('// Validation task');
      const componentIndex = content.indexOf('// Component task');

      console.log(`- 配置任务位置: ${configIndex}`);
      console.log(`- 验证任务位置: ${validationIndex}`);
      console.log(`- 组件任务位置: ${componentIndex}`);

      if (configIndex >= 0 && validationIndex >= 0 && componentIndex >= 0) {
        if (configIndex < validationIndex && validationIndex < componentIndex) {
          console.log('✅ 依赖顺序正确: 配置 -> 验证 -> 组件');
        } else {
          console.log('❌ 依赖顺序错误！');
        }
      } else {
        console.log('ℹ️ 无法验证此文件的依赖顺序');
      }
    }
  }

  // 5. 将结果写入临时目录以验证实际文件写入
  const outputDir = path.join(__dirname, 'test-output');
  console.log(`\n💾 将整合结果写入: ${outputDir}`);

  try {
    // 创建整合器的文件组织器实例
    for (const [filePath, file] of integrationResult.files.entries()) {
      // 创建目录结构
      const displayPath = filePath.startsWith('./') ? filePath.substring(2) : filePath;
      const fullPath = path.resolve(outputDir, displayPath);
      const dir = path.dirname(fullPath);

      await fs.mkdir(dir, { recursive: true });

      // 写入文件内容
      await fs.writeFile(fullPath, file.content, 'utf8');
      console.log(`✅ 已写入: ${displayPath}`);
    }

    console.log('✅ 所有文件写入成功');

    // 验证文件是否真的存在于文件系统中
    console.log('\n🔍 验证实际文件系统中的文件:');
    for (const [filePath, file] of integrationResult.files.entries()) {
      const displayPath = filePath.startsWith('./') ? filePath.substring(2) : filePath;
      const fullPath = path.resolve(outputDir, displayPath);
      try {
        const fileExists = await fs.access(fullPath).then(() => true).catch(() => false);
        if (fileExists) {
          const diskContent = await fs.readFile(fullPath, 'utf8');
          console.log(`✅ ${displayPath} - 存在 (${diskContent.length} 字符)`);

          // 验证内容是否一致
          if (diskContent === file.content) {
            console.log(`   内容匹配 ✓`);
          } else {
            console.log(`   ❌ 内容不匹配！`);
          }
        } else {
          console.log(`❌ ${displayPath} - 不存在`);
        }
      } catch (err) {
        console.log(`❌ ${displayPath} - 访问失败: ${err.message}`);
      }
    }
  } catch (error) {
    console.log(`❌ 文件写入失败: ${error.message}`);
    console.log(error.stack);
  }

  return integrationResult;
}

// 清理测试输出目录
async function cleanup() {
  const outputDir = path.join(__dirname, 'test-output');
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
    console.log(`\n🧹 清理测试输出目录: ${outputDir}`);
  } catch (error) {
    // 忽略清理错误
  }
}

// 运行测试
async function main() {
  try {
    // 先清理之前的测试输出
    await cleanup();

    // 运行测试
    const result = await runFullIntegrationTest();

    console.log('\n🏁 测试完成');
    console.log(result.success ? '✅ 测试通过' : '❌ 测试失败');

    return result.success;
  } catch (error) {
    console.log(`\n💥 测试执行出错: ${error.message}`);
    console.log(error.stack);
    return false;
  } finally {
    // 为了便于验证，暂时跳过清理
    // await cleanup();
    console.log('\n📌 注意：输出目录已保留以供检查');
  }
}

// 运行测试
if (require.main === module) {
  main().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { MockDecomposer, MockExecutor, runFullIntegrationTest };