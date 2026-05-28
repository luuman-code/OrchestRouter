# OrchestRouter

**弹性任务编排系统** - 将复杂任务分解为可管理的子任务，路由到最优 AI 模型并行执行，并整合结果为完整的代码库。

## 核心架构

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Decomposer   │───▶│   Selector   │───▶│   Executor   │───▶│  Integrator  │
│  任务分解器   │    │  模型选择器   │    │  并发执行器   │    │   整合器     │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
       │                   │                   │                   │
       └───────────────────┴───────────────────┴───────────────────┘
                               │
                    ┌──────────────────┐
                    │  Orchestrator    │
                    │   编排服务器      │
                    └──────────────────┘
                               │
                    ┌──────────────────┐
                    │   UI Config      │
                    │   配置中心        │
                    │   (端口 5174)    │
                    └──────────────────┘
```

### 6. UI Config Center (配置中心)
`ui/`

- **可视化配置管理**: Web 界面集中管理所有配置项
- **实时日志查看**: 集成增强日志系统，支持筛选、搜索、自动刷新
- **模型提供商管理**: 添加/删除 Provider，配置 API 端点和密钥
- **路由规则配置**: 设置不同场景下的模型路由策略
- **成本控制面板**: 设置日预算、单任务成本限制等
- **执行器监控**: 配置并发执行、重试策略、速率限制等

## 核心模块

### 1. Decomposer (任务分解器)
`src/decomposer/`

- **任务解析**: 解析包含 deliverables 的复杂任务
- **类型标注**: 基于规则匹配 + LLM 辅助为每个交付物打上类型标签
- **语义分组**: 对相似的 deliverables 进行语义聚合
- **Prompt 生成**: 为每个子任务生成完整的执行 prompt
- **冲突处理**: 敏感文件的冲突检测与解决
- **插件系统**: 支持自定义类型和跨领域扩展

### 2. Selector (模型选择器)
`src/selector/`

- **模型注册**: 管理多维度模型能力注册表
- **智能选择**: 基于任务类型、复杂度、成本约束进行模型匹配
- **多维度排名**: 综合评估模型能力与任务需求的匹配度
- **成本控制**: 预算监控与保守成本估算

### 3. Executor (并发执行器)
`src/executor/`

- **高并发执行**: 支持多模型并行 API 调用
- **容错机制**: 重试策略、熔断器、限流控制
- **性能监控**: 实时追踪 Token 使用与成本消耗
- **异步请求**: AsyncRequester 处理异步请求管理

### 4. Integrator (结果整合器)
`src/integrator/`

- **文件组织**: 子任务输出的文件结构整理
- **依赖分析**: 依赖关系图构建与注入
- **冲突检测**: 命名冲突、覆盖冲突检测
- **Import 解析**: 自动解决模块导入关系
- **代码格式化**: 统一代码风格与格式

### 5. Orchestrator (编排服务器)
`src/orchestrator/`

- **Pipeline 协调**: 协调 decompose → select → execute → integrate 全流程
- **会话管理**: 支持多轮对话与增量处理
- **进度追踪**: 实时监控各阶段执行状态
- **格式转换**: HybridTaskConverter 处理任务格式转换

## 快速开始

### 安装依赖

```bash
# 根目录依赖
npm install

# UI 配置中心依赖
cd ui && npm install
```

### 启动服务

```bash
# 方式 1：一键启动所有服务（推荐）
start-all-servers.bat

# 方式 2：分别启动
# 终端 1：启动编排服务器（端口 3458）
start-orchestrator.bat
# 或手动启动
node ./src/orchestrator/index.js

# 终端 2：启动 UI 配置中心（端口 5174）
start-ui.bat
# 或手动启动
cd ui && npm run dev
```

**服务地址：**
- 编排服务器: `http://localhost:3458`
- UI 配置中心: `http://localhost:5174`

### 单独使用分解器

```javascript
const ElasticDecomposer = require('./src/decomposer');

const decomposer = new ElasticDecomposer({
  mergeThreshold: 0.7,
  dependencyThreshold: 0.3
});

const task = {
  title: "电商平台",
  context: {
    projectType: "fullstack",
    techStack: ["React", "Node.js", "MongoDB"]
  },
  requirement: "创建电商平台，包含用户认证、商品管理、购物车、订单处理功能",
  deliverables: [
    { description: "用户注册和登录 API" },
    { description: "商品列表和搜索功能" },
    { description: "购物车增删改查" },
    { description: "订单创建和支付流程" },
    { description: "前端页面组件" }
  ]
};

const subTasks = decomposer.decompose(task);
console.log(subTasks);
```

## 配置说明

主配置文件位于 `config/config.json`，包含以下关键配置：

| 配置项 | 说明 |
|--------|------|
| `system` | 服务器设置（端口、超时等） |
| `Providers` | AI 模型定义与定价 |
| `selector` | 模型选择规则 |
| `costControl` | 成本管理设置 |
| `executor` | 执行器并发配置 |
| `decomposer` | 分解器阈值设置 |
| `circuit_breaker` | 熔断器阈值 |
| `session` | 会话管理配置 |

## 目录结构

```
OrchestRouter/
├── src/
│   ├── decomposer/       # 任务分解引擎
│   │   ├── types/        # 类型定义与标注
│   │   ├── analyzers/    # 语义分析器
│   │   ├── utils/        # 工具函数
│   │   ├── plugins/      # 插件系统
│   │   ├── contract/     # 契约生成
│   │   └── llm/          # LLM 集成
│   ├── selector/         # 模型选择器
│   │   ├── registry/     # 模型注册表
│   │   ├── matching/     # 匹配算法
│   │   └── core/         # 核心选择逻辑
│   ├── executor/         # 并发执行器
│   │   └── core/         # 核心执行组件
│   ├── integrator/       # 结果整合器
│   │   ├── file/         # 文件组织
│   │   ├── dependency/   # 依赖管理
│   │   ├── conflict/     # 冲突处理
│   │   └── style/        # 格式化
│   ├── orchestrator/     # 编排服务器
│   ├── session/          # 会话管理
│   ├── metrics/          # 指标收集
│   └── api/              # REST API
├── ui/                   # UI 配置中心
│   ├── src/              # React 组件源码
│   ├── public/           # 静态资源
│   └── package.json      # UI 依赖配置
├── config/               # 配置文件
├── examples/              # 使用示例
└── tests/                # 测试用例
```

## API 端点

服务器启动后可访问：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/metrics` | GET | 聚合指标数据 |
| `/api/metrics/sessions/:sessionId` | GET | 指定会话的指标 |
| `/api/metrics/pricing` | GET | 模型定价配置 |

## 特性亮点

- **插件化架构**: 支持自定义任务类型和处理器扩展
- **规则优先 + LLM 辅助**: 结合规则引擎的确定性与 LLM 的灵活性
- **多模型支持**: 支持 Anthropic、OpenAI、MiniMax、DeepSeek 等多种模型
- **成本感知**: 内置成本追踪与预算控制
- **容错设计**: 熔断器、重试机制、限流保护
- **流式响应**: 支持流式 API 响应
- **增量处理**: 会话级别的增量更新与状态管理
- **可视化配置中心**: React UI 界面管理所有配置项
- **实时日志监控**: 集成增强日志系统，支持多级筛选和搜索

## 依赖技术

### 后端
- **运行时**: Node.js
- **Web 框架**: Express
- **数据库**: MongoDB (mongoose)
- **HTTP 客户端**: Axios
- **配置管理**: YAML + JSON
- **缓存**: LRU Cache

### 前端 UI
- **框架**: React 19
- **语言**: TypeScript
- **构建工具**: Vite
- **样式**: Tailwind CSS

## License

MIT
