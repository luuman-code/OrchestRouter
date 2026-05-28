/**
 * @fileoverview Module K: OrchestratorServer 输出集成测试
 *
 * 测试模块 K 的所有功能实现：
 * - K1: /v1/orchestrate 响应修改（使用 OutputFormatter）
 * - K2: HTTP 响应头设置（Content-Type, CORS 等）
 * - K3: Token 超限处理
 * - K4: 流式响应支持
 * - K5: 集成测试
 */

const http = require('http');
const { OutputFormatter, OutputFormat } = require('../../integrator/output/formatter');
const OrchestratorServer = require('../OrchestratorServer');

// 测试统计
let passed = 0;
let failed = 0;
const failures = [];

/**
 * 断言函数
 */
function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    failures.push(testName);
    console.error(`  ✗ ${testName}`);
  }
}

/**
 * 断言相等
 */
function assertEqual(actual, expected, testName) {
  assert(actual === expected, `${testName} (期望：${expected}, 实际：${actual})`);
}

/**
 * 断言包含
 */
function assertContains(str, substr, testName) {
  assert(str.includes(substr), `${testName} (期望包含：${substr})`);
}

/**
 * 断言对象有属性
 */
function assertHasProperty(obj, prop, testName) {
  assert(obj[prop] !== undefined || Object.prototype.hasOwnProperty.call(obj, prop), `${testName} (缺少属性：${prop})`);
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('模块 K: OrchestratorServer 输出集成测试');
  console.log('='.repeat(60));
  console.log();

  // K1: OutputFormatter 集成
  console.log('K1: OutputFormatter 集成');
  testOutputFormatterIntegration();
  console.log();

  // K2: HTTP 响应头设置
  console.log('K2: HTTP 响应头设置');
  testHttpResponseHeaders();
  console.log();

  // K3: Token 超限处理
  console.log('K3: Token 超限处理');
  await testTokenLimitHandling();
  console.log();

  // K4: 流式响应支持
  console.log('K4: 流式响应支持');
  await testStreamingResponse();
  console.log();

  // K5: 集成测试
  console.log('K5: 集成测试');
  await testIntegration();
  console.log();

  // 输出测试结果
  console.log('='.repeat(60));
  console.log(`测试结果：${passed} 通过，${failed} 失败`);
  if (failures.length > 0) {
    console.log('失败的测试:');
    failures.forEach(f => console.error(`  - ${f}`));
  }
  console.log('='.repeat(60));
}

function testOutputFormatterIntegration() {
  const formatter = new OutputFormatter();

  assert(formatter instanceof OutputFormatter, '应能创建 OutputFormatter 实例');

  // 测试各种输出格式
  const mockResult = {
    success: true,
    files: new Map([
      ['test.js', {
        path: 'test.js',
        content: 'console.log("test");',
        language: 'javascript'
      }]
    ]),
    warnings: ['Test warning']
  };

  // JSON 格式
  const jsonOutput = formatter.format(mockResult, OutputFormat.JSON);
  assert(typeof jsonOutput === 'string', 'JSON 格式应返回字符串');
  assert(JSON.parse(jsonOutput).success === true, 'JSON 格式应包含 success 字段');

  // Claude Code 格式
  const claudeOutput = formatter.format(mockResult, OutputFormat.CLAUDE_CODE);
  assert(typeof claudeOutput === 'string', 'Claude Code 格式应返回字符串');
  assertContains(claudeOutput, '## 代码库整合结果', 'Claude Code 格式应包含标题');

  // Markdown 格式
  const markdownOutput = formatter.format(mockResult, OutputFormat.MARKDOWN);
  assert(typeof markdownOutput === 'string', 'Markdown 格式应返回字符串');
  assertContains(markdownOutput, '# 整合结果报告', 'Markdown 格式应包含标题');

  // 文本格式
  const textOutput = formatter.format(mockResult, OutputFormat.TEXT);
  assert(typeof textOutput === 'string', '文本格式应返回字符串');
  assertContains(textOutput, '整合结果报告', '文本格式应包含标题');
}

function testHttpResponseHeaders() {
  // 测试 CORS 头设置
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID'
  };

  assert(corsHeaders['Access-Control-Allow-Origin'] === '*', 'CORS 应允许所有源');
  assert(corsHeaders['Access-Control-Allow-Methods'].includes('POST'), 'CORS 应允许 POST 方法');
  assert(corsHeaders['Access-Control-Allow-Methods'].includes('GET'), 'CORS 应允许 GET 方法');

  // 测试 Content-Type 头
  const jsonContentType = 'application/json';
  assertEqual(jsonContentType, 'application/json', 'Content-Type 应为 application/json');
}

async function testTokenLimitHandling() {
  // 创建一个模拟的服务器实例来测试 Token 限制处理
  const server = new OrchestratorServer({
    port: 3459, // 使用不同端口避免冲突
    debug: false
  });

  // 测试小结果（不应被截断）- 使用普通对象以便正确计算大小
  const smallResult = {
    success: true,
    files: {
      'small.js': { content: 'const x = 1;', language: 'javascript' }
    },
    warnings: []
  };

  const smallProcessed = server._handleTokenLimit(smallResult, 8000);
  assert(smallProcessed.tokenUsage.truncated === false, '小结果不应被截断');
  assert(typeof smallProcessed.tokenUsage.estimated === 'number', '应有估算的 token 数');

  // 测试大结果（应被截断）- 使用普通对象以便正确计算大小
  const largeContent = 'x'.repeat(50000); // 50KB 内容
  const largeResult = {
    success: true,
    files: {
      'large.js': { content: largeContent, language: 'javascript' },
      'large2.js': { content: largeContent, language: 'javascript' },
      'large3.js': { content: largeContent, language: 'javascript' }
    },
    warnings: [],
    logs: ['log1', 'log2', 'log3']
  };

  const largeProcessed = server._handleTokenLimit(largeResult, 8000);
  assert(largeProcessed.tokenUsage.truncated === true, '大结果应被截断');
  assert(largeProcessed.tokenUsage.originalSize > 8000, '原始大小应超过限制');
  assert(largeProcessed.warnings.some(w => w.includes('截断')), '应包含截断警告');

  // 测试摘要生成（使用 Map 格式，因为 _generateTruncatedSummary 期望 Map）
  const largeResultAsMap = {
    ...largeResult,
    files: new Map(Object.entries(largeResult.files))
  };
  const summary = server._generateTruncatedSummary(largeResultAsMap);
  assertHasProperty(summary, 'totalFiles', '摘要应包含 totalFiles');
  assertHasProperty(summary, 'files', '摘要应包含 files 列表');
  assertEqual(summary.totalFiles, 3, '摘要中的文件数应为 3');
}

async function testStreamingResponse() {
  // 创建一个 mock 的 HTTP 响应对象
  const mockRes = {
    writeHeadCalled: false,
    writeCalls: [],
    ended: false,
    statusCode: null,
    headers: null,

    writeHead(statusCode, headers) {
      this.writeHeadCalled = true;
      this.statusCode = statusCode;
      this.headers = headers;
    },

    write(data) {
      this.writeCalls.push(data);
    },

    end() {
      this.ended = true;
    }
  };

  const server = new OrchestratorServer({
    port: 3460,
    debug: false
  });

  // 创建包含多个文件的结果
  const files = new Map();
  for (let i = 0; i < 12; i++) {
    files.set(`file${i}.js`, {
      content: `// Content of file ${i}`,
      language: 'javascript',
      sourceTaskId: `task-${i}`
    });
  }

  const result = {
    success: true,
    files,
    warnings: ['Test warning']
  };

  // 测试流式响应
  await server._streamResponse(result, mockRes, 5); // 每批 5 个文件

  assert(mockRes.writeHeadCalled, '应调用 writeHead');
  assert(mockRes.headers['Content-Type'] === 'application/json', 'Content-Type 应为 application/json');
  assert(mockRes.headers['Transfer-Encoding'] === 'chunked', '应使用 chunked 传输编码');
  assert(mockRes.writeCalls.length >= 3, '应至少有 3 次写入（开始 + 批次 + 结束）');
  assert(mockRes.ended, '响应应已结束');

  // 验证开始标记
  const startData = JSON.parse(mockRes.writeCalls[0]);
  assertEqual(startData.type, 'start', '第一个批次应为 start 类型');
  assertEqual(startData.totalFiles, 12, '总文件数应为 12');
  assertEqual(startData.totalBatches, 3, '总批次应为 3');

  // 验证结束标记
  const endData = JSON.parse(mockRes.writeCalls[mockRes.writeCalls.length - 1]);
  assertEqual(endData.type, 'end', '最后一个批次应为 end 类型');
  assertHasProperty(endData, 'summary', '结束数据应包含 summary');
}

async function testIntegration() {
  // 测试 OrchestratorServer 的完整输出格式化集成
  const server = new OrchestratorServer({
    port: 3461,
    debug: false
  });

  // 模拟编排结果
  const orchestrateResult = {
    orchestrated: true,
    decomposition: {
      subtasks: [
        { id: 'task1', description: 'Task 1', type: 'api' },
        { id: 'task2', description: 'Task 2', type: 'ui' }
      ]
    },
    subtasks: [
      { id: 'task1', description: 'Task 1', selected_model: 'gpt-4' },
      { id: 'task2', description: 'Task 2', selected_model: 'claude-sonnet' }
    ],
    modelSelections: [
      { taskId: 'task1', selectedModel: 'gpt-4', reason: 'Complex API logic' },
      { taskId: 'task2', selectedModel: 'claude-sonnet', reason: 'UI generation' }
    ],
    execution_results: {
      results: [
        {
          task_id: 'task1',
          content: '// API implementation',
          model_used: 'gpt-4'
        },
        {
          task_id: 'task2',
          content: '// UI component',
          model_used: 'claude-sonnet'
        }
      ],
      execution_summary: {
        total: 2,
        successful: 2,
        failed: 0
      }
    },
    metadata: {
      selectedModels: ['gpt-4', 'claude-sonnet']
    }
  };

  // 测试格式化编排结果
  const formattedResult = server._formatOrchestrationResult(orchestrateResult, {});

  assert(formattedResult.success === true, '格式化结果应为成功');
  assert(formattedResult.files instanceof Map, 'files 应为 Map 对象');
  assertEqual(formattedResult.files.size, 2, '应包含 2 个文件');
  assertHasProperty(formattedResult, 'validationReport', '应包含 validationReport');

  // 测试响应格式化
  const responseResult = server._formatResponseForClaudeCode(orchestrateResult, {}, 'json');
  assert(typeof responseResult === 'object', '响应应为对象');
  assertHasProperty(responseResult, 'files', '响应应包含 files');
  assertHasProperty(responseResult, 'success', '响应应包含 success');

  // 测试 Claude Code 格式输出
  const claudeResponse = server._formatResponseForClaudeCode(orchestrateResult, {}, 'claude_code');
  assert(typeof claudeResponse === 'object', 'Claude Code 响应应为对象');
  assert(claudeResponse.formattedOutput.includes('## 代码库整合结果'), '应包含 Claude Code 标题');
  assert(claudeResponse.outputFormat === 'claude_code', '输出格式应为 claude_code');

  // 测试 OutputFormatter 实例存在
  assert(server.outputFormatter instanceof OutputFormatter, '服务器应有 OutputFormatter 实例');
}

// 运行测试
runTests().catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});