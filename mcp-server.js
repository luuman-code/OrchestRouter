#!/usr/bin/env node

/**
 * MCP (Model Context Protocol) 适配器服务器
 *
 * 将编排器服务器的功能通过 MCP 协议暴露给 Claude Code
 * 实现真正的端到端测试流程
 */

const http = require('http');
const https = require('https');
const path = require('path');
const { Readable } = require('stream');

class MCPAdapterServer {
  constructor(options = {}) {
    this.port = options.port || 3459; // 使用不同端口避免冲突
    this.orchestratorHost = options.orchestratorHost || 'localhost';
    this.orchestratorPort = options.orchestratorPort || 3458;
    this.server = null;

    // MCP 资源定义
    this.resources = {
      'orchestration-task': {
        description: 'Run orchestration task through the orchestrator server',
        schema: {
          type: 'object',
          properties: {
            task: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                deliverables: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      description: { type: 'string' },
                      type: { type: 'string' },
                      filePath: { type: 'string' }
                    },
                    required: ['id', 'description', 'type']
                  }
                }
              },
              required: ['title', 'description']
            }
          },
          required: ['task']
        }
      }
    };

    // MCP 工具定义
    this.tools = {
      'run-orchestration': {
        description: 'Run a task through the orchestrator server and return tool calls',
        inputSchema: {
          type: 'object',
          properties: {
            task: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Task title' },
                description: { type: 'string', description: 'Task description' },
                deliverables: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', description: 'Deliverable ID' },
                      description: { type: 'string', description: 'Deliverable description' },
                      type: { type: 'string', description: 'Deliverable type' },
                      filePath: { type: 'string', description: 'Expected file path' }
                    },
                    required: ['id', 'description', 'type']
                  }
                }
              },
              required: ['title', 'description']
            },
            options: {
              type: 'object',
              properties: {
                enableDecomposition: { type: 'boolean' },
                enableModelSelection: { type: 'boolean' },
                enableExecution: { type: 'boolean' }
              }
            },
            outputFormat: { type: 'string', enum: ['tool_call', 'json'] }
          },
          required: ['task']
        }
      }
    };
  }

  // 发送 HTTP 请求到编排器
  makeOrchestratorRequest(path, method, data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.orchestratorHost,
        port: this.orchestratorPort,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
      }

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

  // 处理 MCP 请求
  async handleMCPRequest(req, res) {
    const url = new URL(`http://localhost:${this.port}${req.url}`);
    const pathname = url.pathname;

    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // MCP 协议端点
    if (pathname === '/mcp-server-info') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          protocols: ['mcp'],
          version: '1.0.0',
          name: 'Orchestrator MCP Adapter',
          description: 'Adapter server that connects Claude Code to the orchestrator server'
        }));
      }
      return;
    }

    // MCP 资源列表
    if (pathname === '/resources' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(Object.keys(this.resources)));
      return;
    }

    // MCP 资源详情
    if (pathname.startsWith('/resources/') && req.method === 'GET') {
      const resourceName = pathname.split('/')[2];
      const resource = this.resources[resourceName];

      if (resource) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resource));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Resource not found' }));
      }
      return;
    }

    // MCP 工具列表
    if (pathname === '/tools' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(Object.keys(this.tools)));
      return;
    }

    // MCP 工具详情
    if (pathname.startsWith('/tools/') && req.method === 'GET') {
      const toolName = pathname.split('/')[2];
      const tool = this.tools[toolName];

      if (tool) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tool));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Tool not found' }));
      }
      return;
    }

    // MCP 工具执行
    if (pathname.startsWith('/tools/') && req.method === 'POST') {
      const toolName = pathname.split('/')[2];

      if (toolName === 'run-orchestration') {
        try {
          let body = '';
          for await (const chunk of req) {
            body += chunk.toString();
          }

          const inputData = JSON.parse(body);

          // 调用编排器服务器
          const orchestratorRequest = {
            ...inputData,
            outputFormat: 'tool_call' // 强制使用工具调用格式
          };

          const response = await this.makeOrchestratorRequest(
            '/v1/orchestrate-tool-calls',
            'POST',
            orchestratorRequest
          );

          // 返回编排器的工具调用结果
          res.writeHead(response.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response.body));

        } catch (error) {
          console.error('Error executing tool:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }
    }

    // 默认返回 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  // 启动 MCP 服务器
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleMCPRequest(req, res).catch((error) => {
          console.error('MCP server error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        });
      });

      this.server.listen(this.port, () => {
        console.log('🚀 MCP 适配器服务器已启动');
        console.log(`🔗 监听地址: http://localhost:${this.port}`);
        console.log(`🔗 连接到编排器: http://${this.orchestratorHost}:${this.orchestratorPort}`);
        console.log('');
        console.log('📋 可用端点:');
        console.log('   GET  /mcp-server-info    - MCP 服务器信息');
        console.log('   GET  /resources          - 资源列表');
        console.log('   GET  /tools              - 工具列表');
        console.log('   POST /tools/run-orchestration - 执行编排任务');
        console.log('');
        console.log('💡 要在 Claude Code 中使用，请配置 MCP 服务器连接');
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('MCP 服务器启动失败:', error);
        reject(error);
      });
    });
  }

  // 停止服务器
  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const server = new MCPAdapterServer({
    port: parseInt(process.argv[2]) || 3459
  });

  console.log('🔧 启动 MCP 适配器服务器...');

  server.start()
    .then(() => {
      console.log('\n📋 MCP 适配器已准备就绪!');
      console.log('   要在 Claude Code 中使用，请:');
      console.log('   1. 配置 MCP 服务器连接到 http://localhost:3459');
      console.log('   2. Claude Code 将能够调用 run-orchestration 工具');
      console.log('   3. 工具将把请求转发到编排器服务器并返回工具调用结果');
    })
    .catch(error => {
      console.error('💥 启动失败:', error);
      process.exit(1);
    });
}

module.exports = MCPAdapterServer;