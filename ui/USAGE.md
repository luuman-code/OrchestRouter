# OrchestRouter UI 使用指南

## 快速开始

### 1. 启动编排器服务

```bash
cd C:\Users\LWB\OrchestRouter
node src/orchestrator/index.js
```

等待服务启动完成，看到类似以下输出：
```
===========================================
  编排器服务器已启动
  监听端口：http://0.0.0.0:3458
```

### 2. 启动 UI 开发服务器

```bash
cd C:\Users\LWB\OrchestRouter\ui
npm run dev
```

访问提示的 URL（通常是 http://localhost:5173）

### 3. 使用 UI 配置编排器

#### 系统配置
- 设置服务器端口、主机地址
- 选择日志级别（DEBUG/INFO/WARN/ERROR）
- 配置 API 超时时间和最大并发数
- 开启/关闭调试模式

#### 模型提供商配置
1. **添加提供商**：
   - 从下拉菜单选择要添加的提供商（阿里云、DeepSeek、Google、OpenAI、Anthropic、Ollama）
   - 点击"添加"按钮

2. **配置提供商**：
   - 展开提供商卡片
   - 配置 API 端点（通常已有默认值）
   - 配置 API 密钥环境变量名（如 `DASHSCOPE_API_KEY`）
   - 可选：直接配置 API 密钥（不推荐用于生产环境）

3. **管理模型**：
   - 点击"添加模型"添加新模型
   - 编辑模型配置：ID、名称、价格、上下文限制等
   - 点击垃圾桶图标移除模型

4. **移除提供商**：
   - 点击提供商卡片右上角的垃圾桶图标

#### 路由规则配置
设置不同场景下的模型路由策略：
- **默认路由**：普通任务使用的模型
- **后台任务路由**：后台异步任务使用的模型
- **深度思考路由**：复杂推理任务使用的模型
- **长上下文路由**：长文本处理任务使用的模型
- **网络搜索路由**：需要联网搜索的任务使用的模型
- **图像处理路由**：图像处理任务使用的模型
- **代码任务路由**：代码生成/修改任务使用的模型
- **推理任务路由**：逻辑推理任务使用的模型

格式：`provider,modelId`，例如：`aliyun,qwen3-coder-plus`

#### 成本控制配置
- **日预算**：每日花费上限（美元）
- **单任务最大成本**：单个任务的最大花费（美元）
- **安全边际**：成本估算的安全边际（0.2 = 20%）
- **质量优先**：开启后优先选择高质量模型
- **保守估计**：开启后使用更保守的成本估算

#### 执行器配置
- **默认最大并发数**：同时执行的任务数
- **默认超时时间**：任务超时限制（毫秒）
- **RPS 限制**：每秒请求数限制
- **突发容量**：允许的突发请求数
- **重试策略**：最大重试次数、基础延迟、指数基数
- **抖动**：添加随机延迟避免并发请求
- **追踪/监控**：开启执行追踪和实时监控

### 4. 保存配置

配置完成后，点击右上角的"**保存配置**"按钮。

配置将保存到 `config/config.json` 文件。

### 5. 重启编排器（可选）

某些配置（如端口、调试模式）需要重启编排器才能生效：

```bash
# 按 Ctrl+C 停止当前服务
node src/orchestrator/index.js
```

## 常见问题

### Q: UI 无法连接到编排器？
**A**: 确保编排器服务正在运行在端口 3458。

### Q: 配置保存后没有生效？
**A**: 某些配置需要重启编排器服务才能生效。

### Q: 如何备份配置？
**A**: 复制 `config/config.json` 文件即可。

### Q: 如何重置为默认配置？
**A**: 点击 UI 中的"重置"按钮，或手动删除 `config/config.json` 文件。

## 环境变量配置

建议在系统环境变量中配置 API 密钥，而不是直接在配置文件中：

### Windows
```cmd
setx DASHSCOPE_API_KEY "your-api-key-here"
setx DEEPSEEK_API_KEY "your-api-key-here"
setx GEMINI_API_KEY "your-api-key-here"
```

然后重启编排器服务。

## 配置文件位置

- **当前配置**: `config/config.json`
- **配置示例**: `config/unified-config.example.json`

## API 端点

UI 通过以下 API 与编排器通信：

- `GET http://localhost:3458/config` - 获取当前配置
- `POST http://localhost:3458/config` - 保存配置
- `GET http://localhost:3458/health` - 健康检查

## 技术信息

### UI 技术栈
- React 19
- TypeScript
- Vite
- Tailwind CSS v4

### 支持的 Provider
| Provider | API 端点 | 环境变量 |
|----------|---------|----------|
| aliyun | https://coding.dashscope.aliyuncs.com/v1 | DASHSCOPE_API_KEY |
| deepseek | https://api.deepseek.com/v1 | DEEPSEEK_API_KEY |
| google | https://generativelanguage.googleapis.com/v1beta | GEMINI_API_KEY |
| openai | https://api.openai.com/v1 | OPENAI_API_KEY |
| anthropic | https://api.anthropic.com/v1 | ANTHROPIC_API_KEY |
| ollama | http://localhost:11434/api | 无需密钥 |
