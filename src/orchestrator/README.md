# Orchestrator - 智能任务编排系统

## 概述

编排器是一个智能任务编排系统，通过任务分解、模型选择、并发执行和结果集成来完成复杂任务。它支持三级迭代优化（L1/L2/L3），能够处理从简单修复到完整重构的各种复杂度的编程任务。

## 架构设计

### 两种运行模式

#### 日常使用模式（无 skill）
```
Claude Code → CCR Router (3456) → Provider API
```
- 不经过编排器
- 请求直接发送到 CCR Router
- 适用于日常对话、简单问题

#### 复杂任务模式（加载 orchestrator skill 后）
```
Claude Code → 编排器 API (3458)
    → 任务分解 (ElasticDecomposer)
    → 模型选择 (ModelSelector)
    → 并发执行 (CCR Router)
    → 结果集成 (Integrator)
    → 返回最终响应
```

### 核心架构图

```
                    +-----------------+
                    |  Claude Code    |
                    +--------+--------+
                             |
                    +--------v--------+
                    | Orchestrator    |  (Port 3458)
                    | Server          |
                    +--------+--------+
                             |
        +--------------------+--------------------+
        |                    |                    |
+-------v-------+    +-------v-------+    +-------v-------+
|  Task         |    |  Model        |    |  Flow         |
|  Decomposer   |    |  Selector     |    |  Monitor      |
|  (Elastic)    |    |               |    |  (SSE)        |
+---------------+    +---------------+    +---------------+
        |                    |                    |
        +--------+-----------+
                 |
        +--------v---------+
        |  Concurrent      |  (CCR Router - Port 3456)
        |  Executor        |
        +--------+---------+
                 |
        +--------v---------+
        |  Integrator     |
        |  (Result Merge) |
        +-----------------+
```

### 三级迭代架构

```
+------------------+
|   L1: 快速修复    |  -> 语法错误、拼写、简单 Bug
+------------------+     最多 2 次重试
         |
         v (失败时)
+------------------+
|  L2: 部分改进    |  -> 针对特定模块的改进
+------------------+     最多 3 次迭代
         |
         v (失败时)
+------------------+
|  L3: 完整重构    |  -> 架构级别问题
+------------------+     最多 5 次迭代
```

---

## 目录结构

```
orchestrator/
├── index.js                          # 服务器入口
├── OrchestratorServer.js             # 主服务器 (核心编排逻辑)
├── OrchestratorExecutorIntegration.js # 执行器集成
├── OrchestratorWithHybridIteration.js # 三级迭代编排器
├── HybridTaskConverter.js            # 混合任务转换器
├── FlowMonitor.js                    # SSE 实时流程监控
├── config.json                       # 编排器配置
├── executor-config.json              # 执行器配置
│
├── classification/
│   └── ProblemClassifier.js          # 问题分类
│
├── execution/
│   └── ExecutorEnhancer.js           # 执行器增强
│
├── feedback/
│   └── FeedbackAnalyzer.js           # 反馈分析
│
├── fix/
│   └── QuickFixProcessor.js           # L1 快速修复
│
├── integration/
│   ├── IntegratorEnhancer.js         # 集成器增强
│   └── OrchestrationFlowEnhancer.js  # 流程增强
│
├── iteration/
│   ├── IterationController.js        # 迭代控制器
│   └── LevelSwitchManager.js         # 级别切换管理
│
├── planning/
│   └── Replanner.js                  # 任务重规划
│
├── quality/
│   └── QualityGate.js                # 质量评估
│
├── utils/
│   ├── InputValidator.js             # 输入验证
│   ├── ModelHealthChecker.js         # 模型健康检查
│   ├── OrchestratorCacheManager.js   # 缓存管理
│   ├── PathNormalizer.js             # 路径规范化
│   ├── ProgressTracker.js            # 进度跟踪
│   ├── ResponsePostProcessor.js      # 响应后处理
│   ├── TaskComplexityAnalyzer.js     # 复杂度分析
│   └── ToolCallConverter.js          # 工具调用转换
│
└── validation/
    └── TestValidator.js              # 测试验证
```

---

## 核心组件

### 1. OrchestratorServer

主 HTTP 服务器，处理所有 API 请求。

**API 端点：**

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/v1/orchestrate` | POST | 完整编排流程 |
| `/orchestrate` | POST | 编排端点（兼容路径） |
| `/v1/decompose` | POST | 任务分解 |
| `/v1/select-model` | POST | 模型选择 |
| `/v1/execute-subtasks` | POST | 并发执行子任务 |
| `/v1/integrate` | POST | 结果集成 |
| `/v1/model-selector-status` | GET | 模型选择器状态 |
| `/v1/executor-integration-status` | GET | 执行器集成状态 |
| `/v1/integrator-status` | GET | 集成器状态 |
| `/v1/flow/status` | GET | 流程监控状态 |
| `/v1/flow/subscribe` | GET | SSE 订阅 |

### 2. OrchestratorWithHybridIteration

扩展编排器，支持 L1/L2/L3 迭代优化。

**迭代控制器 (IterationController)：**
- 管理 L1/L2/L3 级别的迭代流程
- 根据质量分数和进度决定是否切换级别
- 支持提前终止条件

**质量门禁 (QualityGate)：**
评估六个维度：
- 功能性 (Functionality)
- 可靠性 (Reliability)
- 可用性 (Usability)
- 效率 (Efficiency)
- 可维护性 (Maintainability)
- 可移植性 (Portability)

### 3. HybridTaskConverter

混合任务转换器，结合规则和 LLM：

| 置信度 | 策略 |
|--------|------|
| >= 0.8 | 规则匹配（快速） |
| 0.5-0.8 | 规则 + LLM 验证 |
| < 0.5 | 完整 LLM 分析 |

### 4. TaskComplexityAnalyzer

任务复杂度分析，支持混合策略：
- 高速规则匹配（关键词、模式）
- 中置信度时 LLM 辅助验证
- 低置信度时完整 LLM 分析
- 结果缓存

### 5. FlowMonitor

基于 SSE 的实时事件监控：
- 编排阶段事件
- 步骤状态更新
- 事件广播到所有订阅客户端

---

## 启动编排器

### 方式 1: 使用管理脚本（推荐）

```bash
# PowerShell
.\server-manager.ps1 -Action start

# Git Bash
./server-manager.sh start
```

### 方式 2: 手动启动

```bash
node src/orchestrator/index.js
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ORCHESTRATOR_PORT` | 3458 | 服务器端口 |
| `CCR_ROUTER_URL` | `http://127.0.0.1:3456` | CCR Router 地址 |
| `DEBUG` | `false` | 调试模式 |

---

## API 使用示例

### 健康检查

```bash
curl http://localhost:3458/health
```

### 完整编排

```bash
curl -X POST http://localhost:3458/v1/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"开发一个博客系统"}]}'
```

### SSE 流程监控

在浏览器访问：`http://localhost:3458/v1/flow/subscribe`

---

## 处理流程

```
输入：复杂任务描述
         ↓
    ┌─────────────┐
    │  任务分解   │
    │ (Elastic)    │
    └─────────────┘
         ↓
    ┌─────────────┐
    │  类型标注   │ (规则 + LLM)
    └─────────────┘
         ↓
    ┌─────────────┐
    │  语义分组   │
    └─────────────┘
         ↓
    ┌─────────────┐
    │  冲突解决   │
    └─────────────┘
         ↓
    ┌─────────────┐
    │  子任务列表 │
    └─────────────┘
         ↓
    ┌─────────────┐
    │  模型选择   │ → 为每个子任务选择最合适的模型
    └─────────────┘
         ↓
    ┌─────────────┐
    │ 并发执行     │ → 并发执行所有子任务
    └─────────────┘
         ↓
    ┌─────────────┐
    │  结果整合   │
    └─────────────┘
         ↓
输出：整合后的完整响应
```

---

## 类型分类

| 类型 | 说明 | 示例 |
|------|------|------|
| `ui` | 用户界面 | 页面、组件 |
| `api` | API 接口 | REST API |
| `logic` | 业务逻辑 | 验证逻辑 |
| `model` | 数据模型 | 实体定义 |
| `test` | 测试 | 单元测试 |
| `style` | 样式 | CSS/SCSS |
| `config` | 配置 | 配置文件 |
| `database` | 数据库 | SQL 脚本 |
| `devops` | 运维 | Docker 配置 |

---

## 组件关系

```
OrchestratorServer
  ├── decomposer (ElasticDecomposer)
  ├── modelSelector (ModelSelector)
  ├── executorIntegration
  │     └── executor (FullyEnhancedConcurrentExecutor)
  ├── integrator (Integrator)
  ├── flowMonitor (FlowMonitor)
  └── modelHealthChecker (ModelHealthChecker)

OrchestratorWithHybridIteration
  ├── iterationController
  │     ├── levelSwitchManager
  │     ├── qualityGate
  │     └── feedbackAnalyzer
  ├── replanner
  └── flowEnhancer

OrchestrationFlowEnhancer
  ├── executorEnhancer
  ├── integratorEnhancer
  └── decomposerEnhancer

IterationController
  ├── QuickFixProcessor (L1)
  ├── OrchestrationFlowEnhancer (L2/L3)
  ├── QualityGate
  └── Replanner (L3)
```

---

## 工具类

| 组件 | 功能 |
|------|------|
| `InputValidator` | 请求验证、XSS 过滤、HTML 移除 |
| `PathNormalizer` | 路径规范化、Windows/Unix 兼容 |
| `ProgressTracker` | 加权阶段进度跟踪、剩余时间估算 |
| `ResponsePostProcessor` | 响应格式化、文件内容提取 |
| `OrchestratorCacheManager` | SHA-256 缓存、命中统计 |
| `ToolCallConverter` | 集成结果转换为 Claude Code 工具调用 |
| `ModelHealthChecker` | 模型 API Key 和网络连接检查 |

---

## 配置

### config.json

```json
{
  "port": 3458,
  "ccrRouterUrl": "http://127.0.0.1:3456",
  "decomposer": {
    "llm": "qwen2.5:3b",
    "endpoint": "http://localhost:11434"
  },
  "taskComplexityAnalysis": {
    "enabled": true,
    "useLLMFallback": true
  }
}
```

### executor-config.json

```json
{
  "maxConcurrency": 50,
  "maxRetries": 3,
  "defaultRPS": 10,
  "budget": {
    "max": 100.00,
    "safetyMargin": 0.2
  },
  "defaultTimeout": 60000
}
```

---

## 故障排除

### 服务器无法启动

```bash
# 检查端口占用
netstat -ano | findstr :3458
# 杀掉占用进程
taskkill /F /PID <进程ID>
```

### 分解结果为空
- 确保 Ollama 服务正在运行
- 检查 LLM 配置是否正确

### CCR Router 无响应
- 确保 CCR Router 服务已启动 (端口 3456)
- 检查 `CCR_ROUTER_URL` 配置

---

## 管理脚本

| 脚本 | 适用环境 | 说明 |
|------|----------|------|
| `server-manager.ps1` | PowerShell | 功能最完整 |
| `server-manager.sh` | Git Bash | 类 Unix 风格 |
| `start-orchestrator.bat` | CMD | 快速启动 |
| `stop-orchestrator.bat` | CMD | 快速停止 |

---

## 扩展文档

- [快速开始指南](./QUICK_START_GUIDE.md)
- [集成指南](./INTEGRATION_GUIDE.md)
- [模型选择器集成](./MODEL_SELECTOR_INTEGRATION.md)
- [集成器集成](./INTEGRATOR_INTEGRATION_SUMMARY.md)
- [最终报告](./FINAL_REPORT.md)

---

*文档更新日期：2026-04-08*
*版本：2.0*
