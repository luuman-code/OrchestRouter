# OrchestRouter 统一配置中心

## 文件结构

```
config/
├── config.json                      # 主配置文件（复制 unified-config.example.json 创建）
├── unified-config.example.json      # 配置文件示例
├── UnifiedConfigLoader.js           # 统一配置加载器
├── test-config-loader.js            # 配置加载测试工具
├── CONFIG_MIGRATION_GUIDE.md        # 配置迁移指南
└── README.md                        # 本文件
```

## 快速开始

### 1. 创建配置文件

```bash
# 复制示例配置文件
cp config/unified-config.example.json config/config.json
```

### 2. 配置 API 密钥

编辑 `config/config.json`，有两种方式配置 API 密钥：

**方式 A：使用环境变量（推荐）**
```json
{
  "Providers": [
    {
      "name": "aliyun",
      "api_key_env": "DASHSCOPE_API_KEY",
      "api_key": ""
    }
  ]
}
```

**方式 B：直接配置（仅用于测试）**
```json
{
  "Providers": [
    {
      "name": "aliyun",
      "api_key": "sk-your-actual-api-key-here"
    }
  ]
}
```

### 3. 验证配置

```bash
node config/test-config-loader.js
```

### 4. 启动服务

```bash
node src/orchestrator/index.js
```

## 配置文件说明

统一配置文件参考 CCR Router 的格式，将所有模型和 API 配置整合在一个 JSON 文件中：

- **Providers**: 所有 AI 模型提供商配置（阿里云、DeepSeek、Google、OpenAI、Anthropic 等）
- **selector**: 路由规则配置
- **costControl**: 成本控制配置
- **executor**: 执行器配置
- **system**: 系统配置

## 支持的 Provider

| Provider | 说明 | 环境变量 |
|----------|------|----------|
| aliyun | 阿里云通义千问系列 | DASHSCOPE_API_KEY |
| deepseek | 深度求索 | DEEPSEEK_API_KEY |
| google | Google Gemini | GEMINI_API_KEY |
| openai | OpenAI GPT | OPENAI_API_KEY |
| anthropic | Anthropic Claude | ANTHROPIC_API_KEY |
| ollama | 本地 Ollama 模型 | 无需密钥 |

## 向后兼容

系统会自动检测配置文件格式：
1. 优先使用统一配置文件（`config.json`）
2. 回退到分离的 YAML 配置文件（`models.yaml` + `provider-endpoints.yaml`）

旧配置文件位置：
- `src/selector/registry/models.yaml`
- `src/executor/config/provider-endpoints.yaml`

## 文档

- `CONFIG_MIGRATION_GUIDE.md` - 详细的配置迁移指南
- `unified-config.example.json` - 完整的配置示例
