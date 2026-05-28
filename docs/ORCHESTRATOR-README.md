# 编排器代理服务器使用说明

## 概述

编排器代理服务器是 Claude Code 和 CCR Router 之间的中间层，负责接收来自 Claude Code 的请求，判断是否需要任务分解，然后调用分解器或直接转发请求。

## 启动服务器

### 1. 基本启动
```bash
node start-orchestrator.js
```

### 2. 指定端口启动
```bash
node start-orchestrator.js 3458
```

### 3. 使用环境变量
```bash
ORCHESTRATOR_PORT=3458 DEBUG=true node start-orchestrator.js
```

## 配置选项

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `ORCHESTRATOR_PORT` | 3458 | 服务器监听端口 |
| `CCR_ROUTER_URL` | `http://127.0.0.1:3456` | CCR Router 地址 |
| `DEBUG` | `false` | 是否启用调试模式 |

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/v1/orchestrate` | POST | 编排端点（主端点） |
| `/orchestrate` | POST | 编排端点（兼容路径） |
| `/v1/decompose` | POST | 直接分解测试 |

## 工作流程

1. **接收请求**: 服务器接收来自 Claude Code 的请求
2. **复杂度判断**: 根据关键词和分隔符判断任务复杂度
3. **自然语言处理**: 将自然语言转换为结构化任务
4. **任务分解**: 调用分解器生成子任务
5. **结果返回**: 返回分解结果给 Claude Code

## Claude Code 配置

将 Claude Code 的 API 端点配置为：
- URL: `http://localhost:3458`
- 路径: `/v1/orchestrate`

## 故障排除

- 确保 Ollama 服务正在运行（分解器依赖 qwen2.5:3b 模型）
- 确保 CCR Router 服务正在运行（端口 3456）
- 检查防火墙是否阻止了端口访问