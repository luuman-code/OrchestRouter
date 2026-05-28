# OrchestRouter UI 配置中心

## 概述

OrchestRouter UI 是一个基于 React + TypeScript + Vite 的可视化配置管理界面，用于集中管理编排器的所有配置项，并集成了增强型日志系统。

## 功能特性

- **系统配置**：管理服务器端口、日志级别、并发数等
- **模型提供商配置**：添加/删除 Provider，配置 API 端点和密钥，管理模型
- **路由规则配置**：设置不同场景下的模型路由策略
- **成本控制配置**：设置日预算、单任务成本限制等
- **执行器配置**：配置并发执行、重试策略、速率限制等
- **实时日志查看**：集成增强日志系统，支持筛选、搜索、自动刷新

## 快速开始

### 启动服务

```bash
# 方式 1：同时启动主服务、日志服务器和 UI（推荐）
npm run dev

# 方式 2：分别启动
# 终端 1：启动 OrchestRouter 主服务（端口 3458）
npm start

# 终端 2：启动日志服务器（端口 3001）
npm run logs-server

# 终端 3：启动 UI 开发服务器（端口 5174）
npm run ui
```

### 访问界面

1. **OrchestRouter Configuration Center** - http://localhost:5174

### 使用界面

在 UI 界面中：

1. **系统配置**：设置服务器端口、调试模式等
2. **模型提供商**：
   - 从下拉列表选择要添加的提供商（阿里云、DeepSeek、Google 等）
   - 点击"添加"按钮
   - 展开提供商卡片，配置 API 端点和密钥
   - 管理该提供商下的模型
3. **路由规则**：设置不同任务类型的默认路由
4. **成本控制**：设置预算和成本限制
5. **执行器**：配置执行参数
6. **实时日志**：查看和管理日志

### 保存配置

点击页面右上角的"保存配置"按钮，配置将保存到 `config/config.json` 文件。

## 配置说明

### 系统配置

| 字段 | 说明 | 默认值 |
|------|------|--------|
| 主机地址 | 服务器监听地址 | 127.0.0.1 |
| 端口 | 服务器端口 | 3458 |
| 日志级别 | DEBUG/INFO/WARN/ERROR | info |
| API 超时时间 | API 调用超时（毫秒） | 600000 |
| 最大并发数 | 系统最大并发数 | 10 |
| 调试模式 | 是否开启调试日志 | false |

### 模型提供商

支持以下提供商：

| 提供商 | 说明 | 环境变量 |
|--------|------|----------|
| aliyun | 阿里云通义千问 | DASHSCOPE_API_KEY |
| deepseek | 深度求索 | DEEPSEEK_API_KEY |
| google | Google Gemini | GEMINI_API_KEY |
| openai | OpenAI GPT | OPENAI_API_KEY |
| anthropic | Anthropic Claude | ANTHROPIC_API_KEY |
| ollama | 本地 Ollama | 无需密钥 |

每个提供商可配置：
- API 端点 URL
- API 密钥环境变量名
- API 密钥（可选，直接配置）
- 模型列表

每个模型可配置：
- 模型 ID 和名称
- API 模型 ID（实际调用时使用的 ID）
- 能力标签（capabilities）
- 优势领域（strengths）
- 价格（输入/输出 $/K tokens）
- 上下文限制
- 质量评分（1-10）
- 速度等级（fast/medium/slow）
- 最大并发数
- 响应时间

### 路由规则

| 规则 | 说明 | 格式 |
|------|------|------|
| default | 默认路由 | provider,modelId |
| background | 后台任务路由 | provider,modelId |
| think | 深度思考路由 | provider,modelId |
| longContext | 长上下文路由 | provider,modelId |
| longContextThreshold | 长上下文阈值 | 数字 |
| webSearch | 网络搜索路由 | provider,modelId |
| image | 图像处理路由 | provider,modelId |
| code | 代码任务路由 | provider,modelId |
| reasoning | 推理任务路由 | provider,modelId |

### 成本控制

| 字段 | 说明 | 默认值 |
|------|------|--------|
| 日预算 | 每日预算上限（美元） | 10.00 |
| 单任务最大成本 | 单个任务的最大成本（美元） | 0.50 |
| 安全边际 | 成本估算的安全边际 | 0.2 |
| 质量优先 | 是否优先选择高质量模型 | false |
| 保守估计 | 是否使用保守成本估算 | true |

### 执行器

| 字段 | 说明 | 默认值 |
|------|------|--------|
| 默认最大并发数 | 执行器默认并发数 | 10 |
| 默认超时时间 | 任务超时时间（毫秒） | 60000 |
| 默认 RPS | 每秒请求数限制 | 10 |
| 突发容量 | 突发请求容量 | 30 |
| 最大重试次数 | 失败重试次数 | 3 |
| 基础延迟 | 重试基础延迟（毫秒） | 1000 |
| 指数基数 | 重试延迟指数基数 | 2.0 |
| 抖动 (Jitter) | 是否添加随机延迟 | true |
| 启用追踪 | 是否记录执行追踪 | true |
| 启用监控 | 是否启用实时监控 | true |

## 增强日志系统

### 概述

集成到 UI 中的增强型日志系统具有以下特性：

- **统一日志管理**：支持基于组件的日志记录
- **日志存储和轮转**：自动文件存储和轮转机制
- **多级日志**：trace、debug、info、warn、error、fatal
- **组件级控制**：每个组件独立的日志级别控制
- **日志筛选**：按组件、级别、关键字筛选
- **自动清理**：当日志达到指定大小时自动清理

### 日志界面功能

访问 **实时日志** 选项卡可使用以下功能：

- **日志级别筛选**：Trace、Debug、Info、Warn、Error、Fatal
- **组件筛选**：编排器、分解器、选择器、执行器
- **关键词搜索**：实时搜索日志内容
- **自动刷新**：每 2 秒自动更新日志
- **手动刷新**：点击"刷新日志"按钮立即刷新
- **清除日志**：一键清空所有日志
- **自动滚动**：新日志自动滚动到底部
- **元数据查看**：展开查看详细元数据

### 日志级别说明

| 级别 | 说明 | 使用场景 |
|------|------|----------|
| TRACE | 最详细 | 跟踪程序执行流程 |
| DEBUG | 调试信息 | 开发和调试阶段 |
| INFO | 一般信息 | 正常运行状态 |
| WARN | 警告信息 | 潜在问题但不影响运行 |
| ERROR | 错误信息 | 发生错误但程序可继续 |
| FATAL | 严重错误 | 程序无法继续运行 |

### 日志 API 端点

日志服务器运行在 `http://localhost:3001`：

| 端点 | 方法 | 说明 | 参数 |
|------|------|------|------|
| `/v1/logs` | GET | 获取日志 | level, module, search, limit |
| `/v1/logs/clear` | POST | 清除所有日志 | 无 |
| `/health` | GET | 健康检查 | 无 |

### 日志配置

配置文件 `config/config.json` 中的日志配置：

```json
{
  "logging": {
    "level": "info",
    "format": "json",
    "output": {
      "console": true,
      "file": true
    },
    "file": {
      "path": "./logs",
      "maxSize": "10MB",
      "maxFiles": 5,
      "rotation": "size"
    },
    "components": {
      "orchestrator": "info",
      "decomposer": "debug",
      "selector": "info",
      "executor": "warn"
    }
  }
}
```

### 自动清理机制

- 每 10 分钟检查一次日志大小
- 当日志文件达到配置最大大小的 80% 时，自动执行日志轮转
- 最多保留 5 个历史日志文件
- 默认单个日志文件最大 10MB

### 日志目录结构

```
C:\Users\LWB\
├── logs/                              # 日志存储目录
│   └── orchestrator.log               # 按组件分类的日志文件
└── src/
    └── common/
        └── logging/
            ├── CentralizedLogger.js   # 主日志类
            ├── LogStorage.js          # 文件存储及轮转
            ├── LogFormatter.js        # 日志格式化
            └── LogConfig.js           # 日志配置
```

## 配置文件位置

配置保存在 `config/config.json` 文件中。

你也可以手动编辑该文件，格式参考 `config/unified-config.example.json`。

## API 端点

UI 通过以下 API 端点与编排器通信：

- `GET /config` - 获取当前配置
- `POST /config` - 保存新配置
- `GET /v1/logs` - 获取日志（日志服务器，端口 3001）
- `POST /v1/logs/clear` - 清除日志（日志服务器，端口 3001）

## 故障排除

### UI 无法连接到编排器

确保编排器服务正在运行：
```bash
node src/orchestrator/index.js
```

### UI 无法连接日志服务器

1. 确保日志服务器正在运行：`npm run logs-server`
2. 检查端口 3001 是否被占用
3. 访问 http://localhost:3001/health 验证服务状态

### 日志不显示

1. 检查日志级别筛选器设置
2. 检查组件筛选器是否为"全部组件"
3. 点击"刷新日志"按钮手动刷新
4. 查看浏览器控制台是否有错误信息

### 自动刷新不工作

1. 确保勾选了"自动刷新"复选框
2. 检查网络连接
3. 清除浏览器缓存后重试

### 配置保存失败

检查 `config/` 目录是否存在且有写入权限。

### 配置更改未生效

某些配置（如端口、调试模式）需要重启编排器服务才能生效。

## 技术栈

- React 19
- TypeScript
- Vite
- Tailwind CSS

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 测试

```bash
# 运行日志演示脚本
npm run logs-demo

# 运行所有测试
npm test
```
