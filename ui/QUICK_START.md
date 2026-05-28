# OrchestRouter UI 快速开始

## 服务已启动

### 当前运行状态

| 服务 | 地址 | 状态 |
|------|------|------|
| 编排器服务 | http://localhost:3458 | ✅ 运行中 |
| UI 配置中心 | http://localhost:5179 | ✅ 运行中 |

## 立即使用

### 1. 访问 UI 界面

打开浏览器访问：**http://localhost:5179**

### 2. 配置模型提供商

1. 点击"**模型提供商**"标签
2. 从下拉菜单选择提供商（如：阿里云）
3. 点击"**添加**"按钮
4. 展开提供商卡片
5. 配置 API 密钥环境变量（如：`DASHSCOPE_API_KEY`）
6. （可选）直接在"API 密钥"字段输入密钥

### 3. 配置路由规则

1. 点击"**路由规则**"标签
2. 设置默认路由：`aliyun,qwen3-coder-plus`
3. 设置其他场景的路由（可选）

### 4. 保存配置

点击右上角"**保存配置**"按钮

### 5. 设置 API 密钥（环境变量）

在命令行中设置：

```bash
# Windows
setx DASHSCOPE_API_KEY "你的阿里云 API 密钥"
setx DEEPSEEK_API_KEY "你的 DeepSeek API 密钥"
```

然后重启编排器服务。

## 快速配置示例

### 仅使用阿里云模型

1. 添加"阿里云"提供商
2. 设置 API 密钥环境变量：`DASHSCOPE_API_KEY`
3. 路由规则全部设置为阿里云模型：
   - 默认：`aliyun,qwen3-coder-plus`
   - 代码：`aliyun,qwen3-coder-next`
   - 深度思考：`aliyun,qwen3-max-2026-01-23`
4. 保存配置

### 使用多个提供商

1. 添加多个提供商（阿里云、DeepSeek、Google 等）
2. 为每个提供商配置 API 密钥
3. 根据不同场景设置不同的路由
4. 保存配置

## 配置说明

### API 密钥配置方式

**推荐**：使用环境变量
```
api_key_env: "DASHSCOPE_API_KEY"
api_key: ""  // 留空
```

**不推荐**：直接配置（仅测试用）
```
api_key_env: ""
api_key: "sk-你的密钥"
```

### 路由规则格式

格式：`provider,modelId`

示例：
- `aliyun,qwen3-coder-plus`
- `deepseek,deepseek-chat`
- `google,gemini-3.1-pro-preview`

### 支持的提供商

| 提供商 | 环境变量 | 官网 |
|--------|----------|------|
| aliyun | DASHSCOPE_API_KEY | 阿里云百炼 |
| deepseek | DEEPSEEK_API_KEY | 深度求索 |
| google | GEMINI_API_KEY | Google AI |
| openai | OPENAI_API_KEY | OpenAI |
| anthropic | ANTHROPIC_API_KEY | Anthropic |
| ollama | 无需密钥 | 本地运行 |

## 故障排除

### UI 无法访问

检查服务是否运行：
```bash
# 检查编排器
curl http://localhost:3458/health

# 检查 UI（浏览器访问）
# http://localhost:5179
```

### 配置未生效

1. 确认已点击"保存配置"
2. 检查 `config/config.json` 文件是否更新
3. 重启编排器服务

### API 密钥错误

1. 检查环境变量是否正确设置
2. 确认密钥格式正确
3. 重启编排器服务以加载新环境变量

## 文件位置

- **配置文件**：`config/config.json`
- **配置示例**：`config/unified-config.example.json`
- **UI 源码**：`ui/src/App.tsx`

## 常用命令

```bash
# 启动编排器
node src/orchestrator/index.js

# 启动 UI（开发模式）
cd ui
npm run dev

# 构建 UI 生产版本
cd ui
npm run build
```

## 下一步

- 查看完整文档：`ui/README.md`
- 查看详细使用指南：`ui/USAGE.md`
- 查看实现总结：`ui/IMPLEMENTATION_SUMMARY.md`
