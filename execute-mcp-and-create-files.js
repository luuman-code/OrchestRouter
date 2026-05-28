#!/usr/bin/env node

/**
 * 通过MCP接口调用编排器并创建文件
 * 获取编排器返回的工具调用结果，并根据结果创建文件到指定目录
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

class MCPFileCreator {
  constructor() {
    this.mcpPort = 3459;
    this.mcpHost = 'localhost';
    this.outputDir = path.join(__dirname, 'tests', 'test-output');

    // 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  // 发送HTTP请求的辅助方法
  makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            const parsedBody = body.length > 0 ? JSON.parse(body) : {};
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: parsedBody
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: body
            });
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  // 调用编排器并获取工具调用结果
  async callOrchestrator() {
    console.log('📡 通过MCP接口调用编排器服务器...');

    // 中等复杂度的任务 - 团队协作待办事项应用
    const taskRequest = {
      task: {
        title: "团队协作待办事项应用",
        description: "创建一个支持多用户协作的待办事项应用，包括用户认证、任务分配、状态跟踪等功能",
        deliverables: [
          {
            id: "auth-controller",
            description: "用户认证控制器，处理登录、注册、登出等操作",
            type: "api",
            filePath: "src/controllers/AuthController.js"
          },
          {
            id: "todo-model",
            description: "待办事项数据模型，包含标题、描述、状态、负责人等属性",
            type: "model",
            filePath: "src/models/TodoItem.js"
          },
          {
            id: "user-model",
            description: "用户数据模型，包含基本信息和权限",
            type: "model",
            filePath: "src/models/User.js"
          },
          {
            id: "database-schema",
            description: "数据库表结构定义",
            type: "database",
            filePath: "src/database/schema.sql"
          },
          {
            id: "api-routes",
            description: "REST API路由定义",
            type: "api",
            filePath: "src/routes/todoRoutes.js"
          },
          {
            id: "security-middleware",
            description: "安全中间件，处理认证和授权",
            type: "security",
            filePath: "src/middleware/auth.js"
          },
          {
            id: "react-ui-components",
            description: "React UI组件，包含任务列表、编辑表单等",
            type: "ui",
            filePath: "src/components/TodoApp.jsx"
          },
          {
            id: "unit-tests",
            description: "单元测试，验证各组件功能",
            type: "test",
            filePath: "tests/unit/todo.test.js"
          }
        ]
      },
      options: {
        enableDecomposition: true,
        enableModelSelection: true,
        enableExecution: true
      },
      outputFormat: "tool_call"
    };

    try {
      const response = await this.makeRequest({
        hostname: this.mcpHost,
        port: this.mcpPort,
        path: '/tools/run-orchestration',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(JSON.stringify(taskRequest))
        }
      }, taskRequest);

      console.log(`✅ 编排器响应状态: ${response.statusCode}`);

      if (response.statusCode === 200) {
        console.log('📋 解析编排器返回的工具调用结果...');
        return response.body;
      } else {
        console.error('❌ 编排器调用失败:', response.body);
        return null;
      }
    } catch (error) {
      console.error('❌ 调用编排器时发生错误:', error.message);
      return null;
    }
  }

  // 根据工具调用结果创建文件
  async createFilesFromToolCalls(toolCallResponse) {
    if (!toolCallResponse || !toolCallResponse.content) {
      console.log('⚠️  没有收到有效的工具调用结果');
      return 0;
    }

    console.log(`\n📁 开始创建文件到: ${this.outputDir}`);

    let createdFilesCount = 0;
    const toolCalls = toolCallResponse.content;

    for (const toolCall of toolCalls) {
      if (toolCall.type === 'tool_use' && toolCall.name === 'write_file') {
        const { file_path, content, language } = toolCall.input;

        // 创建完整路径
        const fullPath = path.join(this.outputDir, file_path);
        const dirPath = path.dirname(fullPath);

        // 确保目录结构存在
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        // 写入文件内容
        try {
          fs.writeFileSync(fullPath, content);
          console.log(`✅ 已创建: ${file_path}`);
          createdFilesCount++;
        } catch (error) {
          console.error(`❌ 创建文件失败 ${file_path}:`, error.message);
        }
      }
    }

    console.log(`\n📊 总共创建了 ${createdFilesCount} 个文件`);
    return createdFilesCount;
  }

  // 运行完整流程
  async run() {
    console.log('🚀 开始MCP接口调用和文件创建流程...\n');

    // 调用编排器获取工具调用结果
    const toolCallResponse = await this.callOrchestrator();

    if (!toolCallResponse) {
      console.log('❌ 获取编排器响应失败，终止流程');
      return false;
    }

    // 创建文件
    const fileCount = await this.createFilesFromToolCalls(toolCallResponse);

    if (fileCount > 0) {
      console.log(`\n🎉 成功通过MCP接口调用编排器并创建了 ${fileCount} 个文件`);

      // 保存原始响应以便后续分析
      const responsePath = path.join(this.outputDir, 'orchestrator-response.json');
      fs.writeFileSync(responsePath, JSON.stringify(toolCallResponse, null, 2));
      console.log(`📋 原始响应已保存到: ${responsePath}`);

      return true;
    } else {
      console.log('⚠️  没有创建任何文件');
      return false;
    }
  }
}

// 执行流程
async function run() {
  const creator = new MCPFileCreator();
  const success = await creator.run();

  if (success) {
    console.log('\n✅ MCP接口调用和文件创建流程完成');
  } else {
    console.log('\n❌ MCP接口调用和文件创建流程失败');
  }

  process.exit(success ? 0 : 1);
}

run();