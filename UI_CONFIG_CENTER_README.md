# OrchestRouter UI 配置中心

## 服务状态

- **编排器服务**: 运行在 http://localhost:3458 ✅
- **UI 配置中心**: 运行在 http://localhost:5180 ✅

## 启动方式

### 方法 1: 使用一键启动脚本
```bash
双击 START_UI_CONFIG_CENTER.bat
```

### 方法 2: 手动启动
1. 启动编排器服务:
   ```bash
   cd C:\Users\LWB\OrchestRouter
   node src/orchestrator/index.js
   ```

2. 启动 UI (在新终端):
   ```bash
   cd C:\Users\LWB\OrchestRouter\ui
   npm run dev
   ```

## 访问 UI

打开浏览器访问: **http://localhost:5180**

(如果 5180 端口被占用，Vite 会自动使用其他端口，查看终端输出确认实际端口)

## 功能模块

### 1. 系统配置
- 主机地址、端口
- 日志级别
- API 超时、最大并发
- 调试模式

### 2. 模型提供商
- 预设提供商模板 (阿里云、DeepSeek、OpenAI、Anthropic、Google、Ollama)
- 添加/删除提供商
- 配置 API 端点和密钥
- 管理模型参数

### 3. 路由规则
- 默认路由
- 各场景路由 (代码、思考、长上下文等)
- 长上下文阈值

### 4. 成本控制
- 日预算上限
- 单任务成本限制
- 安全边际
- 质量优先策略

### 5. 执行器配置
- 并发数和超时
- 速率限制
- 重试策略
- 监控追踪

## API 端点

- `GET /config` - 获取当前配置
- `POST /config` - 保存配置

## 配置文件

- **当前配置**: `config/config.json`
- **配置示例**: `config/unified-config.example.json`

## API 密钥配置

推荐使用环境变量:

```bash
# Windows
setx DASHSCOPE_API_KEY "你的阿里云 API 密钥"
setx DEEPSEEK_API_KEY "你的 DeepSeek API 密钥"
setx GEMINI_API_KEY "你的 Google API 密钥"
setx OPENAI_API_KEY "你的 OpenAI API 密钥"
setx ANTHROPIC_API_KEY "你的 Anthropic API 密钥"
```

## 使用技巧

1. **添加新提供商**: 在"模型提供商"标签页使用下拉菜单选择提供商模板
2. **保存配置**: 点击右上角"保存配置"按钮
3. **重置配置**: 点击"重置"按钮恢复默认配置
4. **展开/折叠提供商**: 点击提供商卡片展开详细配置

## 故障排除

- **UI 无法访问**: 检查端口是否被占用，Vite 会自动尝试下一个端口
- **API 通信失败**: 确认编排器服务 (localhost:3458) 正常运行
- **配置保存失败**: 检查 config/ 目录是否有写入权限
