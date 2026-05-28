#!/usr/bin/env node

/**
 * TaskComplexityAnalyzer 调试脚本
 *
 * 分析为什么测试任务没有被识别为复杂任务
 */

const TaskComplexityAnalyzer = require('./src/orchestrator/utils/TaskComplexityAnalyzer');

// 中等难度测试任务定义（来自 comprehensive-workflow-test.js）
const MEDIUM_COMPLEXITY_TASK = {
  title: "个人记账应用",
  requirement: "开发一个完整的个人记账应用，支持记账、查看收支明细和统计功能",
  deliverables: [
    {
      id: "login-ui",
      description: "用户登录/注册界面，包含表单验证",
      type: "ui",
      filePath: "src/ui/Login.jsx"
    },
    {
      id: "transaction-form",
      description: "记账表单组件，支持收入/支出录入",
      type: "ui",
      filePath: "src/ui/TransactionForm.jsx"
    },
    {
      id: "transaction-api",
      description: "收支记录 API 接口，支持增删改查",
      type: "api",
      filePath: "src/api/transactions.js"
    },
    {
      id: "transaction-model",
      description: "收支数据模型定义",
      type: "model",
      filePath: "src/models/Transaction.js"
    },
    {
      id: "statistics-chart",
      description: "收支统计图表组件",
      type: "ui",
      filePath: "src/ui/StatisticsChart.jsx"
    },
    {
      id: "storage-config",
      description: "本地数据存储配置",
      type: "config",
      filePath: "src/config/storage.js"
    }
  ],
  priority: "medium"
};

async function debugAnalyzer() {
  console.log('🔍 开始调试 TaskComplexityAnalyzer...\n');

  // 创建分析器实例（不使用 LLM，仅规则分析）
  const analyzer = new TaskComplexityAnalyzer({
    useLLM: false,
    config: {
      fallback: {
        onLLMError: 'rule_based',
        cacheEnabled: false
      }
    }
  });

  // 测试不同的输入格式
  const testInputs = [
    {
      name: '结构化任务对象 (JSON字符串)',
      input: JSON.stringify(MEDIUM_COMPLEXITY_TASK, null, 2)
    },
    {
      name: '任务标题',
      input: MEDIUM_COMPLEXITY_TASK.title
    },
    {
      name: '任务需求描述',
      input: MEDIUM_COMPLEXITY_TASK.requirement
    },
    {
      name: '合并标题和需求',
      input: `${MEDIUM_COMPLEXITY_TASK.title}: ${MEDIUM_COMPLEXITY_TASK.requirement}`
    },
    {
      name: '自然语言格式测试',
      input: '请帮我开发一个个人记账应用，需要包含登录界面、记账表单、API接口、数据模型、统计图表和存储配置等6个功能模块'
    },
    {
      name: '包含多个关键词的复杂任务',
      input: '创建一个完整的个人记账系统，包含用户界面、API、数据模型、数据库设计、前后端分离、用户认证等多个功能模块'
    }
  ];

  for (const testCase of testInputs) {
    console.log(`📝 测试输入: ${testCase.name}`);
    console.log(`🔍 输入内容: ${testCase.input.substring(0, 100)}...`);

    try {
      const result = await analyzer.analyze(testCase.input);

      console.log(`📊 分析结果:`);
      console.log(`   - isComplex: ${result.isComplex}`);
      console.log(`   - Confidence: ${result.confidence}`);
      console.log(`   - Method: ${result.method}`);
      console.log(`   - Reason: ${result.reason}`);
      console.log('');
    } catch (error) {
      console.log(`❌ 分析失败: ${error.message}`);
      console.log('');
    }
  }

  // 额外测试：分析器内部的规则判断过程
  console.log('🔍 详细规则分析过程:');

  // 1. 检查复杂关键词
  const complexKeywordsFound = analyzer.complexKeywords.filter(kw =>
    JSON.stringify(MEDIUM_COMPLEXITY_TASK).toLowerCase().includes(kw.toLowerCase())
  );
  console.log(`📋 发现的复杂关键词: [${complexKeywordsFound.join(', ')}]`);

  // 2. 检查简单关键词
  const simpleKeywordsFound = analyzer.simpleKeywords.filter(kw =>
    JSON.stringify(MEDIUM_COMPLEXITY_TASK).toLowerCase().includes(kw.toLowerCase())
  );
  console.log(`📋 发现的简单关键词: [${simpleKeywordsFound.join(', ')}]`);

  // 3. 检查分隔符
  const jsonString = JSON.stringify(MEDIUM_COMPLEXITY_TASK);
  const separatorCount = (jsonString.match(/[，,、]/g) || []).length;
  console.log(`🔢 分隔符数量: ${separatorCount}`);

  // 4. 检查字符串长度
  console.log(`📏 字符串长度: ${jsonString.length}`);

  // 5. 检查简单模式匹配
  const matchesSimplePattern = analyzer.simplePatterns.some(pattern =>
    pattern.test(jsonString)
  );
  console.log(`📋 匹配简单模式: ${matchesSimplePattern}`);

  console.log('\n🎯 结论分析:');
  console.log('- 如果 isComplex 为 false，可能是由于：');
  console.log('  1. 简单关键词匹配权重更高');
  console.log('  2. 复杂关键词未被识别');
  console.log('  3. 分隔符数量不足 (需要 >= 2)');
  console.log('  4. 任务描述未达到长度阈值 (1000字符)');
  console.log('  5. 规则判断的置信度低于阈值');
}

// 运行调试
debugAnalyzer().catch(console.error);