# OrchestRouter 启动说明

## API配置已完成

已成功从CCRRouter同步API配置，包括：

- **API密钥**: DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY
- **模型配置**: 11个模型，涵盖阿里通义千问、DeepSeek、Google Gemini等提供商
- **并发控制**: 已配置适当的并发限制和成本控制

## 启动服务

```bash
# 直接启动
node start-orchestrator.js

# 或指定端口启动
node start-orchestrator.js 3458

# 或使用环境变量启动
ORCHESTRATOR_PORT=3458 DEBUG=true node start-orchestrator.js
```

## 服务端点

- **编排端点**: `http://localhost:3458/v1/orchestrate`
- **健康检查**: `http://localhost:3458/health`
- **模型选择状态**: `http://localhost:3458/v1/model-selector-status`

## 功能

- **任务分解**: 自动识别复杂任务并分解为子任务
- **模型选择**: 根据任务类型选择最适合的模型
- **并发执行**: 并发执行多个子任务
- **成本控制**: 遵循预算限制
- **错误处理**: 自动重试和降级策略

## Claude Code 配置

将 Claude Code 的 API 端点配置为：
- URL: `http://localhost:3458`
- 路径: `/v1/orchestrate`

## 验证配置

如需验证配置是否生效，可使用以下命令测试：
```bash
# 检查服务状态
curl http://localhost:3458/health

# 检查模型选择器状态
curl http://localhost:3458/v1/model-selector-status
```

## 注意事项

- 确保CCRRouter (端口3456) 正在运行，以备不时之需
- 所有API密钥均已从CCRRouter同步，无需重复配置
- 如需添加更多模型，请编辑 `src/selector/registry/models.yaml`