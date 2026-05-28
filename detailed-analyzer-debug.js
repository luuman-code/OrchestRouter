#!/usr/bin/env node

/**
 * 详细分析编排器的复杂度判断逻辑
 *
 * 重现 _extractUserMessage 和 _shouldDecompose 的逻辑来理解问题
 */

const http = require('http');

// 重新实现 _extractUserMessage 逻辑
function extractUserMessage(requestBody) {
  if (!requestBody) return '';

  try {
    // 优先检查结构化任务对象
    if (requestBody.task && typeof requestBody.task === 'object') {
      console.log('🎯 检测到结构化任务对象格式');
      return requestBody.task;  // 直接返回结构化任务对象
    }

    // Anthropic API 格式
    if (requestBody.messages && Array.isArray(requestBody.messages)) {
      console.log('🎯 检测到 Anthropic API 消息格式');
      const userMessages = requestBody.messages.filter(m => m && m.role === 'user');
      if (userMessages.length > 0) {
        const lastUserMessage = userMessages[userMessages.length - 1];
        if (lastUserMessage && lastUserMessage.content) {
          if (typeof lastUserMessage.content === 'string') {
            console.log('🎯 提取字符串内容作为用户消息');
            return lastUserMessage.content;
          }
          if (Array.isArray(lastUserMessage.content)) {
            const textContent = lastUserMessage.content
              .filter(item => item && item.type === 'text' && item.text)
              .map(item => item.text)
              .join(' ');
            console.log('🎯 提取文本块内容作为用户消息');
            return textContent;
          }
        }
      }
    }

    // 直接消息格式
    if (requestBody.prompt) {
      console.log('🎯 检测到 prompt 格式');
      return String(requestBody.prompt);
    }

    if (requestBody.message) {
      console.log('🎯 检测到 message 格式');
      return String(requestBody.message);
    }
  } catch (error) {
    console.log(`❌ 提取用户消息时出错: ${error.message}`);
  }

  console.log('🎯 未能识别消息格式，返回空字符串');
  return '';
}

// 模拟 TaskComplexityAnalyzer 的规则判断逻辑
function simulateRuleBasedAnalysis(userMessage) {
  console.log('\n🔍 开始规则分析...');

  // 检查输入是否为空
  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    console.log('   → 输入为空或无效');
    return { isComplex: false, confidence: 1.0, reason: '空输入或无效输入' };
  }

  // 简单关键词
  const simpleKeywords = [
    '解释', 'explain', '翻译', 'translate', '总结', 'summarize',
    '分析', 'analyze', '为什么', 'why', '是什么', 'what', '怎么', 'how',
    '改错', '修复', 'debug', 'bug', '错误', '问题', 'error', 'issue',
    '什么是', '介绍一下', '简单说明', 'tell me', 'what is', 'how to',
    'help', 'please', '请', '你好', 'hello', 'hi'
  ];

  // 复杂关键词
  const complexKeywords = [
    '开发', 'create', 'build', 'implement', '实现', '功能', 'feature',
    '模块', 'module', '系统', 'system', '应用', 'app', 'application',
    '页面', 'page', '组件', 'component', '界面', 'interface',
    '多个', 'multiple', '一系列', 'series of', '完整', 'complete',
    '完整功能', '一套', '一套功能', '项目', 'project', '架构', 'architecture',
    '包含', '包括', '博客', '电商', '管理系统', '平台', '网站', '后端', '前端',
    'API', 'api', '服务', '服务', '服务端', '客户端', '用户', '用户',
    '评论', '登录', '注册', '认证', '权限', '数据库', '数据库'
  ];

  // 简单问题模式
  const simplePatterns = [
    /^什么是/,           // "什么是 XXX"
    /^请解释/,           // "请解释 XXX"
    /^介绍一下/,         // "介绍一下 XXX"
    /^怎么使用/,         // "怎么使用 XXX"
    /^如何使用/,         // "如何使用 XXX"
    /.* 是什么意思/,      // "XXX 是什么意思"
    /^翻译/,             // "翻译 XXX"
    /.* 翻译成/,          // "把 XXX 翻译成 YYY"
    /^分析/,             // "分析 XXX"
    /.* 有什么用/,        // "XXX 有什么用"
    /.* 怎么做/,          // "XXX 怎么做"
    /.* 是什么/,          // "XXX 是什么"
  ];

  // 检查是否是复杂任务
  const isComplex = complexKeywords.some(kw =>
    userMessage.toLowerCase().includes(kw.toLowerCase())
  );

  const isSimple = simpleKeywords.some(kw =>
    userMessage.toLowerCase().includes(kw.toLowerCase())
  );

  // 检查是否匹配简单问题模式
  const matchesSimplePattern = simplePatterns.some(pattern => pattern.test(userMessage));

  console.log(`   → 包含复杂关键词: ${isComplex} [${complexKeywords.filter(kw => userMessage.toLowerCase().includes(kw.toLowerCase())).join(', ')}]`);
  console.log(`   → 包含简单关键词: ${isSimple} [${simpleKeywords.filter(kw => userMessage.toLowerCase().includes(kw.toLowerCase())).join(', ')}]`);
  console.log(`   → 匹配简单模式: ${matchesSimplePattern}`);

  // 如果是简单问题或匹配简单模式，不需要分解
  if ((isSimple && !isComplex) || matchesSimplePattern) {
    console.log('   → 基于简单任务规则，返回 isComplex=false');
    return {
      isComplex: false,
      confidence: isSimple && !isComplex ? 0.9 : 0.85,
      reason: `检测到简单任务模式 (simple=${isSimple}, pattern=${matchesSimplePattern})`
    };
  }

  // 如果包含多个功能点（如"，"和"、"字符出现多次），则认为是复杂任务
  const separatorCount = (userMessage.match(/[，,、]/g) || []).length;
  console.log(`   → 分隔符数量: ${separatorCount}`);
  if (separatorCount >= 2) {  // 如果有至少两个分隔符，认为包含多个功能点
    console.log('   → 分隔符数量 >= 2，返回 isComplex=true');
    return {
      isComplex: true,
      confidence: Math.min(0.8, 0.5 + (separatorCount * 0.1)),
      reason: `检测到 ${separatorCount} 个分隔符，认为包含多个功能点`
    };
  }

  // 如果请求体很大（上下文长），可能需要分解
  if (userMessage.length > 1000) {
    console.log('   → 字符串长度 > 1000，返回 isComplex=true');
    return {
      isComplex: true,
      confidence: 0.7,
      reason: '长文本内容，可能需要分解'
    };
  }

  // 最终判断
  if (isComplex) {
    console.log('   → 检测到复杂关键词，返回 isComplex=true');
    return {
      isComplex: true,
      confidence: 0.75,
      reason: '检测到复杂任务关键词'
    };
  } else {
    console.log('   → 未检测到复杂任务关键词，返回 isComplex=false');
    return {
      isComplex: false,
      confidence: 0.6,
      reason: '未检测到复杂任务关键词，默认为简单任务'
    };
  }
}

// 我们在测试中使用的实际任务数据
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

async function analyzeOrchestratorLogic() {
  console.log('🔍 分析编排器复杂度判断逻辑');
  console.log('='.repeat(60));

  // 测试不同输入格式
  const testCases = [
    {
      name: '结构化任务格式',
      input: { task: MEDIUM_COMPLEXITY_TASK }
    },
    {
      name: 'Anthropic消息格式',
      input: {
        messages: [
          { role: "user", content: JSON.stringify(MEDIUM_COMPLEXITY_TASK) }
        ]
      }
    },
    {
      name: 'Anthropic消息格式 (字符串内容)',
      input: {
        messages: [
          { role: "user", content: MEDIUM_COMPLEXITY_TASK.requirement }
        ]
      }
    },
    {
      name: '带forceOrchestration标志的结构化任务',
      input: {
        task: MEDIUM_COMPLEXITY_TASK,
        forceOrchestration: true
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 测试用例: ${testCase.name}`);
    console.log('-'.repeat(40));

    // 模拟 _extractUserMessage
    console.log('🔄 执行 _extractUserMessage 模拟...');
    const extractedMessage = extractUserMessage(testCase.input);

    console.log(`📥 提取消息结果类型: ${typeof extractedMessage}`);
    if (typeof extractedMessage === 'object') {
      console.log(`   - 对象类型: ${extractedMessage.constructor.name}`);
      if (extractedMessage.title) console.log(`   - 标题: ${extractedMessage.title}`);
      if (extractedMessage.deliverables) console.log(`   - 交付物数量: ${extractedMessage.deliverables.length}`);
    } else {
      console.log(`   - 字符串长度: ${extractedMessage.length}`);
      console.log(`   - 前50字符: ${extractedMessage.substring(0, 50)}...`);
    }

    // 如果提取的是对象，需要将其转换为字符串进行分析
    let analysisInput = extractedMessage;
    if (typeof extractedMessage === 'object') {
      analysisInput = JSON.stringify(extractedMessage, null, 2);
      console.log(`🔄 将对象转换为JSON字符串进行复杂度分析`);
      console.log(`   - JSON字符串长度: ${analysisInput.length}`);
    }

    // 模拟规则分析
    const result = simulateRuleBasedAnalysis(analysisInput);
    console.log(`\n📊 最终分析结果:`);
    console.log(`   - isComplex: ${result.isComplex}`);
    console.log(`   - Confidence: ${result.confidence}`);
    console.log(`   - Reason: ${result.reason}`);

    if (result.isComplex) {
      console.log(`   ✅ 该输入会被识别为复杂任务`);
    } else {
      console.log(`   ❌ 该输入会被识别为简单任务`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('💡 关键发现:');
  console.log('1. 当使用 { task: MEDIUM_COMPLEXITY_TASK } 格式时，');
  console.log('   _extractUserMessage 会返回任务对象本身');
  console.log('2. 然后在 _shouldDecompose 中，该对象会被转换为 JSON 字符串进行分析');
  console.log('3. JSON 字符串包含大量分隔符，会被识别为复杂任务 (isComplex=true)');
  console.log('4. 因此问题不在于复杂度分析，而在于编排器服务器的其他逻辑');
  console.log('\n🔍 可能的真正问题:');
  console.log('1. autoOrchestrate 设置为 false');
  console.log('2. _shouldDecompose 方法内存在异常');
  console.log('3. 有其他条件阻止编排流程执行');
}

// 运行分析
analyzeOrchestratorLogic().catch(console.error);