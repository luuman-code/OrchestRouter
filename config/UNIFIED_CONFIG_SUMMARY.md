# 统一配置文件改进总结

## 改进背景

之前 OrchestRouter 的模型配置分散在两个文件中：
- `src/selector/registry/models.yaml` - 模型配置
- `src/executor/config/provider-endpoints.yaml` - API 端点和密钥配置

这种分离的配置方式存在以下问题：
1. **配置麻烦**：每次添加新模型需要修改两个文件
2. **容易出错**：配置分散，容易导致信息不一致
3. **维护困难**：需要同时管理两个文件的同步

参考 CCR Router 的设计，实现了统一配置文件功能。

---

## 已完成的改进

### 1. 创建统一配置文件格式

**文件**: `config/unified-config.example.json`

特点：
- 参考 CCR Router 的 `Providers` 数组格式
- 将所有模型、API 端点、密钥整合在一个 JSON 文件中
- 支持系统配置、路由规则、成本控制等扩展配置

### 2. 实现统一配置加载器

**文件**: `config/UnifiedConfigLoader.js`

功能：
- 支持加载统一配置文件（JSON 格式）
- 向后兼容旧的分离配置文件（YAML 格式）
- 自动检测配置文件，优先使用统一配置
- 提供统一的 API 获取 Provider、模型等信息

### 3. 更新 ModelRegistry

**文件**: `src/selector/registry/ModelRegistry.js`

改进：
- 添加 `_tryLoadUnifiedConfig()` 方法
- 添加 `_loadModelsFromUnifiedConfig()` 方法
- 优先从统一配置加载模型，回退到 YAML 配置
- 支持从统一配置中提取 API 端点和密钥信息

### 4. 更新 RequestBuilder

**文件**: `src/executor/core/RequestBuilder.js`

改进：
- 修改 `_loadConfig()` 方法
- 添加 `_tryLoadUnifiedConfig()` 方法
- 添加 `_convertUnifiedToProviderConfig()` 方法
- 从统一配置中提取端点、API 密钥映射和模型映射

### 5. 创建文档和测试工具

**文件**:
- `config/CONFIG_MIGRATION_GUIDE.md` - 配置迁移指南
- `config/README.md` - 配置中心说明
- `config/test-config-loader.js` - 配置加载测试工具
- `config/UNIFIED_CONFIG_SUMMARY.md` - 本文档

---

## 配置文件对比

### 旧配置方式（分离）

```yaml
# models.yaml
models:
  - id: "qwen3-coder-plus"
    provider: "aliyun"
    pricing: { input: 0.00005, output: 0.0001 }
    # ... 其他配置

# provider-endpoints.yaml
endpoints:
  aliyun: "https://coding.dashscope.aliyuncs.com/v1"
apiKeys:
  aliyun: "DASHSCOPE_API_KEY"
modelMappings:
  qwen3-coder-plus: "qwen-coder-plus-latest"
```

### 新配置方式（统一）

```json
{
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
          "pricing": { "input": 0.00005, "output": 0.0001 }
        }
      ]
    }
  ]
}
```

---

## 使用方式

### 方式 A：使用统一配置（推荐）

1. 创建 `config/config.json` 文件
2. 复制 `unified-config.example.json` 的内容
3. 配置 API 密钥
4. 启动服务

```bash
cp config/unified-config.example.json config/config.json
# 编辑 config.json 配置 API 密钥
node src/orchestrator/index.js
```

### 方式 B：继续使用分离配置（向后兼容）

无需任何更改，系统会自动检测并使用旧的 YAML 配置文件。

---

## 配置加载流程

```
系统启动
    │
    ▼
检查 config/config.json
    │
    ├── 存在且格式正确 ──► 使用统一配置
    │
    └── 不存在或格式错误
            │
            ▼
        检查 YAML 配置文件
            │
            ├── models.yaml + provider-endpoints.yaml
            │       │
            │       ▼
            │   加载并转换 ──► 使用转换后的配置
            │
            └── 都不存在
                    │
                    ▼
                使用默认配置
```

---

## 测试结果

运行配置加载测试：

```bash
node config/test-config-loader.js
```

**统一配置模式**（使用 config.json）：
```
✓ 配置来源：unified
✓ 可用的 Provider：6 个（aliyun, deepseek, google, openai, anthropic, ollama）
✓ 可用模型数：16 个
```

**分离配置模式**（回退到 YAML）：
```
✓ 配置来源：split
✓ 可用的 Provider：6 个
✓ 可用模型数：11 个
```

---

## 迁移建议

### 立即迁移

如果您：
- 正在配置新环境
- 觉得维护两个配置文件很麻烦
- 希望与 CCR Router 配置格式一致

建议立即使用新的统一配置文件。

### 暂缓迁移

如果您：
- 现有配置运行良好
- 暂时不想改变配置习惯

可以继续使用旧的分离配置，系统会保持向后兼容。

---

## 未来改进方向

1. **配置迁移工具**：自动将 YAML 配置转换为 JSON 格式
2. **配置验证工具**：验证配置文件的完整性和正确性
3. **配置热重载**：修改配置后无需重启服务
4. **配置管理 UI**：可视化的配置管理界面
5. **多环境配置**：支持 dev/test/prod 环境配置

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `config/config.json` | 主配置文件（需复制示例创建） |
| `config/unified-config.example.json` | 配置示例文件 |
| `config/UnifiedConfigLoader.js` | 统一配置加载器 |
| `config/test-config-loader.js` | 配置加载测试工具 |
| `config/CONFIG_MIGRATION_GUIDE.md` | 详细迁移指南 |
| `config/README.md` | 配置中心说明 |
| `src/selector/registry/ModelRegistry.js` | 更新的模型注册表 |
| `src/executor/core/RequestBuilder.js` | 更新的请求构建器 |

---

## 总结

通过实现统一配置文件功能：

1. **简化配置**：从两个文件减少到一个文件
2. **提升体验**：与 CCR Router 配置格式一致，降低学习成本
3. **向后兼容**：不影响现有用户的配置
4. **易于扩展**：方便添加新的配置项和功能

用户可以根据需要选择使用新的统一配置或继续使用旧的分离配置。
