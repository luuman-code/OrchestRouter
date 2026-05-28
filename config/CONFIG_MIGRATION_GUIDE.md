# 配置文件迁移指南

## 概述

为了简化配置管理，OrchestRouter 现在支持**统一配置文件**格式，参考 CCR Router 的设计，将所有模型和 API 配置整合到一个 JSON 文件中。

### 配置方式对比

**旧方式（分离配置）**：
- `src/selector/registry/models.yaml` - 模型配置
- `src/executor/config/provider-endpoints.yaml` - API 端点和密钥配置

**新方式（统一配置）**：
- `config/config.json` - 所有配置在一个文件中

---

## 快速开始

### 1. 创建配置文件

复制示例配置文件：

```bash
copy C:\Users\LWB\OrchestRouter\config\unified-config.example.json C:\Users\LWB\OrchestRouter\config\config.json
```

### 2. 配置 API 密钥

编辑 `config/config.json`，在对应的 Provider 中配置您的 API 密钥：

```json
{
  "Providers": [
    {
      "name": "aliyun",
      "api_base_url": "https://coding.dashscope.aliyuncs.com/v1",
      "api_key_env": "DASHSCOPE_API_KEY",
      "api_key": "sk-your-actual-api-key-here",  // 直接填写密钥（不推荐）
      "models": [...]
    }
  ]
}
```

**推荐**：使用环境变量（更安全）：

```json
{
  "name": "aliyun",
  "api_key_env": "DASHSCOPE_API_KEY",
  "api_key": ""  // 留空，从环境变量读取
}
```

然后在系统环境变量中设置：

```bash
# Windows
setx DASHSCOPE_API_KEY "sk-your-api-key"

# 或使用 .env 文件（需要 dotenv 支持）
```

### 3. 启动服务

```bash
node src/orchestrator/index.js
```

系统会自动检测并使用统一配置文件。

---

## 配置文件结构

### 完整示例

```json
{
  "system": {
    "host": "127.0.0.1",
    "port": 3458,
    "debug": false,
    "logLevel": "info",
    "apiTimeoutMs": 600000,
    "maxConcurrency": 10
  },

  "Providers": [
    {
      "name": "aliyun",
      "api_base_url": "https://coding.dashscope.aliyuncs.com/v1",
      "api_key_env": "DASHSCOPE_API_KEY",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "Qwen3 Coder Plus",
          "api_model_id": "qwen-coder-plus-latest",
          "capabilities": ["code", "logic", "api"],
          "strengths": ["代码生成", "逻辑推理", "API 开发"],
          "pricing": { "input": 0.00005, "output": 0.0001 },
          "context_limit": 32768,
          "quality_score": 8.5,
          "speed": "fast",
          "max_concurrency": 10,
          "response_time": 5000
        }
      ]
    }
  ],

  "selector": {
    "default": "aliyun,qwen3-coder-plus",
    "background": "aliyun,qwen3-coder-plus",
    "think": "aliyun,qwen3-max-2026-01-23",
    "longContext": "aliyun,qwen3.5-plus",
    "longContextThreshold": 100000,
    "webSearch": "aliyun,kimi-k2.5",
    "image": "aliyun,qwen3-coder-plus"
  },

  "costControl": {
    "dailyBudget": 10.00,
    "maxCostPerTask": 0.50,
    "qualityFirst": false,
    "safetyMargin": 0.2
  },

  "executor": {
    "defaultMaxConcurrency": 10,
    "defaultTimeout": 60000,
    "enableTracing": true,
    "enableMonitoring": true,
    "retry": {
      "maxRetries": 3,
      "baseDelay": 1000,
      "exponentialBase": 2.0,
      "jitter": true
    },
    "rateLimit": {
      "defaultRps": 10,
      "burstCapacity": 30
    }
  }
}
```

---

## 配置字段说明

### 系统配置 (system)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| host | string | 127.0.0.1 | 服务器监听地址 |
| port | number | 3458 | 服务器端口 |
| debug | boolean | false | 调试模式 |
| logLevel | string | "info" | 日志级别 |
| apiTimeoutMs | number | 600000 | API 超时时间（毫秒） |
| maxConcurrency | number | 10 | 最大并发数 |

### Provider 配置

每个 Provider 包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 提供商名称（如 aliyun、openai） |
| api_base_url | string | API 端点 URL |
| api_key_env | string | API 密钥环境变量名 |
| api_key | string | 直接配置的 API 密钥（可选） |
| models | array | 模型配置数组 |

### 模型配置

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 模型 ID（内部使用） |
| name | string | 模型名称 |
| api_model_id | string | API 中使用的实际模型 ID |
| capabilities | array | 能力标签 |
| strengths | array | 优势领域 |
| pricing | object | 价格（input/output $/K tokens） |
| context_limit | number | 上下文窗口大小 |
| quality_score | number | 质量评分（1-10） |
| speed | string | 速度等级（fast/medium/slow） |

### 路由规则 (selector)

| 字段 | 说明 |
|------|------|
| default | 默认路由 |
| background | 后台任务路由 |
| think | 深度思考任务路由 |
| longContext | 长上下文任务路由 |
| webSearch | 网络搜索任务路由 |
| image | 图像处理任务路由 |

格式：`provider,modelId` 例如：`aliyun,qwen3-coder-plus`

### 成本控制 (costControl)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| dailyBudget | number | 10.00 | 日预算（美元） |
| maxCostPerTask | number | 0.50 | 单任务最大成本 |
| qualityFirst | boolean | false | 质量优先（true=质量优先，false=成本优先） |
| safetyMargin | number | 0.2 | 安全边际（20%） |

---

## 向后兼容性

系统会自动检测配置文件：

1. **优先**查找统一配置文件（`config.json` 或 `unified-config.json`）
2. **回退**到分离的 YAML 配置文件（`models.yaml` + `provider-endpoints.yaml`）

您无需立即迁移现有配置，系统会继续支持旧格式。

---

## 从旧配置迁移

### 方案 1：手动迁移

参考 `unified-config.example.json`，将旧配置中的模型和 Provider 信息复制到新的统一配置文件中。

### 方案 2：使用迁移工具（待实现）

```bash
node config/migrate-config.js
```

这会自动将旧的 YAML 配置转换为新的 JSON 格式。

---

## 验证配置

使用以下命令验证配置是否正确：

```bash
# 测试配置加载
node -e "
const { UnifiedConfigLoader } = require('./config/UnifiedConfigLoader');
const loader = new UnifiedConfigLoader();
const config = loader.loadConfig();
console.log('配置加载成功！');
console.log('配置来源:', loader.getLoadedFrom());
console.log('可用 Provider:', config.Providers.map(p => p.name));
console.log('可用模型数:', loader.getAllModels().length);
"
```

---

## 常见问题

### Q: 我应该使用哪种配置格式？

**A**: 推荐使用新的统一配置文件（JSON 格式），原因：
- 所有配置在一个文件中，易于管理
- 与 CCR Router 配置格式一致
- 支持直接配置 API 密钥或使用环境变量

### Q: 如何备份我的配置？

**A**: 简单复制配置文件即可：
```bash
copy config\config.json config\config.json.bak
```

### Q: 如何在多个环境之间同步配置？

**A**: 将 `config.json` 添加到版本控制（记得移除敏感的 API 密钥）：
```bash
git add config/config.json
git commit -m "Add OrchestRouter configuration"
```

### Q: API 密钥应该放在哪里？

**A**: 有两种方式：
1. **环境变量**（推荐）：设置 `api_key_env`，密钥留空
2. **直接配置**：直接填写 `api_key`（仅用于测试，不推荐用于生产）

---

## 配置检查清单

在启动服务前，请确认：

- [ ] 已创建 `config/config.json` 文件
- [ ] 至少配置了一个 Provider
- [ ] 为 Provider 配置了正确的 API 端点
- [ ] 配置了 API 密钥（环境变量或直接配置）
- [ ] 每个 Provider 至少有一个模型
- [ ] 模型价格配置正确（用于成本计算）

---

## 相关文档

- `unified-config.example.json` - 配置示例文件
- `../src/README.md` - 系统使用说明
- `../README.md` - 项目总览
