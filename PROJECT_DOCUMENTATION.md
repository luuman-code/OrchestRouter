# OrchestRouter 项目文档

## 文档结构

- [Chapter 1 - 项目概述](#chapter-1---项目概述)
- [Chapter 2 - 系统架构](#chapter-2---系统架构)
- Chapter 3 - 核心模块详解
- Chapter 4 - 任务分解机制
- Chapter 5 - 模型选择与调度
- Chapter 6 - 执行器与并发控制
- Chapter 7 - 代码整合器
- Chapter 8 - 冲突解决策略
- Chapter 9 - 配置系统
- Chapter 10 - API 参考
- Chapter 11 - 最佳实践

---

# Chapter 1 - 项目概述

## 1.1 项目背景与目标

### 项目背景

OrchestRouter 是一个智能任务编排与路由系统，旨在解决复杂软件工程任务中的多模型协同问题。随着 AI 代码生成技术的发展，单一模型往往难以同时满足代码质量、执行速度和成本控制等多方面需求。不同模型擅长不同类型的任务，需要根据任务特征动态选择最合适的模型。

### 项目目标

OrchestRouter 的核心目标是：

1. **智能任务分解**：将复杂软件工程任务自动拆分为可独立执行的子任务
2. **模型最优匹配**：根据子任务特征选择最适合的 AI 模型
3. **并发执行优化**：最大化并行处理效率，减少总体执行时间
4. **冲突解决**：处理多模型输出可能产生的代码冲突
5. **统一配置管理**：提供灵活的扩展机制，支持定制化需求

### 应用场景

- 大型前端项目开发（如 React/Vue 应用）
- 全栈应用快速原型开发
- 多模块微服务架构开发
- 代码重构与迁移项目
- 复杂业务系统设计与实现

## 1.2 核心能力概览

### 系统流程图

```
                          用户请求
                               │
                               ▼
                    +----------------------+
                    |     请求接收层        |
                    |  - 任务格式验证       |
                    |  - 复杂度分析         |
                    +----------------------+
                               │
                               ▼
                    +----------------------+
                    |     编排决策层        |
                    |  - 简单任务: 直发执行  |
                    |  - 复杂任务: 触发分解   |
                    +----------------------+
                               │
              +----------------+----------------+
              │                                 │
              ▼                                 ▼
    +------------------+              +------------------+
    |   任务分解流程    |              |    直接执行      |
    +------------------+              +------------------+
              │
    +---------+---------+---------+---------+---------+
    │         │         │         │         │         │
    ▼         ▼         ▼         ▼         ▼         ▼
+-------+ +-------+ +-------+ +-------+ +-------+ +-------+
| 解析  | | 类型  | | 语义  | | Prompt| | 冲突  | | 调试  |
| 任务  | | 标注  | | 分组  | | 生成  | | 解决  | | 监控  |
+-------+ +-------+ +-------+ +-------+ +-------+ +-------+
    │         │         │         │         │         │
    └─────────┴─────────┴─────────┴─────────┴─────────┘
                               │
                               ▼
                    +----------------------+
                    |     子任务生成        |
                    +----------------------+
                               │
                               ▼
                    +----------------------+
                    |     模型选择器        |
                    |  - 任务特征匹配       |
                    |  - 成本效益分析        |
                    +----------------------+
                               │
                               ▼
                    +----------------------+
                    |     并发执行器        |
                    |  - 资源分配           |
                    |  - 结果聚合           |
                    +----------------------+
                               │
                               ▼
                    +----------------------+
                    |     代码整合器        |
                    |  - 冲突合并           |
                    |  - 格式统一           |
                    +----------------------+
                               │
                               ▼
                         最终结果输出
```

### 核心能力矩阵

| 能力模块 | 功能描述 | 关键技术 |
|---------|---------|---------|
| 任务分解 | 将复杂任务拆分为可独立执行的子任务 | 语义分析、类型标注、依赖检测 |
| 模型选择 | 根据任务特征选择最优模型 | 多提供商支持、成本优化、模型能力匹配 |
| 并发执行 | 多模型并行处理子任务 | 异步调度、资源池管理、限流控制 |
| 冲突解决 | 处理多模型输出的代码冲突 | 智能合并、区域识别、优先级策略 |
| 缓存加速 | 减少重复计算开销 | 多级缓存、TTL 管理、结果复用 |
| 质量保障 | 确保输出结果符合预期 | 验证规则、质量评分、错误恢复 |

## 1.3 术语表

### 1.3.1 Deliverable（交付物）

**定义**：在任务分解过程中，从原始需求中识别出的最小可执行单元。每个交付物代表一个明确的代码生成目标。

**属性结构**：
```javascript
{
  id: string,           // 唯一标识符
  filePath: string,     // 目标文件路径
  description: string,  // 交付物描述
  type: string,         // 类型：ui/api/model/config/test/logic/database/general
  priority: string,     // 优先级：high/medium/low
  types: array,         // 多标签类型标注（包含置信度）
  dependencies: array   // 依赖的其他交付物
}
```

**示例**：
- 用户注册页面组件 `src/pages/Register.tsx`
- 用户认证 API `server/routes/auth.ts`
- 数据库迁移脚本 `database/migrations/001_create_users.sql`

---

### 1.3.2 Subtask（子任务）

**定义**：经过 Prompt 生成和冲突解决后，可以独立分配给某个模型执行的任务单元。

**与 Deliverable 的关系**：
- 一个或多个相关的 Deliverable 组合成一个 Subtask
- Subtask 包含完整的执行上下文（Prompt、约束条件、期望输出格式）
- 同一 Subtask 内的 Deliverable 通常具有强关联性（如同一文件的多个部分）

**属性结构**：
```javascript
{
  id: string,                    // 唯一标识符
  description: string,           // 任务描述
  prompt: string,                // 生成的 Prompt
  modelId: string,               // 选择的模型 ID
  deliverables: array,          // 关联的交付物列表
  integrationHints: object,      // 整合提示
  conflictSensitive: boolean,    // 是否为冲突敏感任务
  sourceGroups: array           // 来源的语义分组
}
```

---

### 1.3.3 Orchestration（编排）

**定义**：OrchestRouter 中的编排是指根据任务特征协调多个子系统（分解器、选择器、执行器、整合器）完成复杂任务处理的全过程。

**编排流程**：

```
请求 → 复杂度判断 → 任务分解 → 模型选择 → 并发执行 → 结果整合 → 输出
```

**编排决策点**：

| 决策点 | 决策依据 | 决策结果 |
|-------|---------|---------|
| 是否需要分解 | 任务复杂度评分 | 简单任务直接执行，复杂任务触发分解 |
| 如何分组 | 语义相似度和依赖关系 | 确定子任务边界和数量 |
| 选择哪个模型 | 任务特征、模型能力、成本 | 为每个子任务分配最优模型 |
| 如何解决冲突 | 文件路径、修改区域、优先级 | 确定合并策略和覆盖顺序 |

---

### 1.3.4 Conflict Sensitive Group（冲突敏感组）

**定义**：在任务分解时，需要强制合并到同一个子任务中的文件集合。这些文件必须一起处理，否则会产生代码冲突。

**配置结构**：
```javascript
{
  description: string,     // 分组描述
  files: array            // 文件路径列表
}
```

**使用场景**：

1. **同文件多区域修改**：一个文件的不同区域需要在同一次调用中处理
   ```json
   {
     "description": "App.tsx: 状态管理 + 路由配置",
     "files": ["src/App.tsx"]
   }
   ```

2. **相关文件集**：强耦合的文件必须一起生成
   ```json
   {
     "description": "用户模块：类型+服务+路由",
     "files": [
       "src/types/user.ts",
       "src/services/userService.ts",
       "server/routes/user.ts"
     ]
   }
   ```

3. **前端资源与逻辑**：避免样式与逻辑不同步
   ```json
   {
     "description": "产品卡片：组件+样式",
     "files": [
       "src/components/ProductCard.tsx",
       "src/styles/ProductCard.css"
     ]
   }
   ```

**核心规则**：
> **同一文件不能出现在多个 Conflict Sensitive Group 中**

违反此规则会导致文件丢失，因为第一个组处理时会锁定文件，导致后续组无法找到完整文件。

**正确示例**：
```json
{
  "conflict_sensitive_groups": [
    {
      "description": "后端服务层",
      "files": ["server/database/db.ts", "server/index.ts"]
    },
    {
      "description": "前端核心层",
      "files": ["src/App.tsx", "src/types/index.ts"]
    },
    {
      "description": "前端页面层",
      "files": ["src/pages/Home.tsx", "src/pages/Login.tsx"]
    }
  ]
}
```

**错误示例（会导致文件丢失）**：
```json
{
  "conflict_sensitive_groups": [
    { "description": "组1", "files": ["src/types/index.ts", "src/App.tsx"] },
    { "description": "组2", "files": ["src/types/index.ts", "src/services/api.ts"] }
  ]
}
```

---

# Chapter 2 - 系统架构

## 2.1 整体架构图

```
+=============================================================================+
|                           OrchestRouter 系统架构                             |
+=============================================================================+

+---------------------------------------------------------------------------+
|                            用户请求层                                       |
|  +-------------+  +-------------+  +-------------+  +-------------+      |
|  |  Claude Code |  |   Web UI   |  |  REST API   |  |  Chat CLI   |      |
|  +-------------+  +-------------+  +-------------+  +-------------+      |
+---------------------------------------------------------------------------+
                                    │
                                    ▼
+---------------------------------------------------------------------------+
|                          编排器核心层                                       |
|  +---------------------------------------------------------------------+  |
|  |                      OrchestratorServer                             |  |
|  |  +------------+  +------------+  +------------+  +------------+ |  |
|  |  | 请求验证   |  | 复杂度分析  |  | 编排决策   |  | 流程监控   | |  |
|  |  +------------+  +------------+  +------------+  +------------+ |  |
|  +---------------------------------------------------------------------+  |
+---------------------------------------------------------------------------+
          │                    │                    │
          ▼                    ▼                    ▼
+--------------------+ +-------------------+ +------------------+
|    分解器层        | |    选择器层        | |    整合器层       |
+-------------------+ +-------------------+ +------------------+
| ElasticDecomposer | |    ModelSelector  | |    Integrator    |
|                  | |                   | |                   |
| - TaskParser     | | - ProviderRouter  | | - ConflictResolver|
| - TypeAnnotator   | | - CapabilityMatch | | - FileMerger      |
| - SemanticAnalyzer| | - CostOptimizer   | | - FormatConverter |
| - PromptGenerator | | - HealthChecker   | | - QualityValidator|
| - PluginManager   | |                   | |                   |
+-------------------+ +-------------------+ +------------------+
          │                    │                    │
          └────────────────────┴────────────────────┘
                               │
                               ▼
+---------------------------------------------------------------------------+
|                           执行器层                                          |
|  +--------------+  +--------------+  +--------------+  +--------------+  |
|  | OrchExecutor |  | RateLimiter  |  | RetryManager |  |CircuitBreaker|  |
|  +--------------+  +--------------+  +--------------+  +--------------+  |
+---------------------------------------------------------------------------+
          │
          ▼
+---------------------------------------------------------------------------+
|                           模型接入层                                        |
|  +------------+ +------------+ +------------+ +------------+            |
|  |  Bailian   | |  Kimi      | |  GLM       | | MiniMax    |            |
|  |  (Qwen)    | |  (Moonshot)| |  (Zhipu)   | |            |            |
|  +------------+ +------------+ +------------+ +------------+            |
+---------------------------------------------------------------------------+
          │
          ▼
+---------------------------------------------------------------------------+
|                          外部服务层                                         |
|  +------------+ +------------+ +------------+                              |
|  | CCR Router | |  配置服务   | |  缓存服务   |                              |
|  +------------+ +------------+ +------------+                              |
+---------------------------------------------------------------------------+

+===========================================================================+
|                           扩展模块层                                        |
+===========================================================================+
  iteration    classification    replanning    quality    feedback    cache
     │              │              │            │           │          │
     ▼              ▼              ▼            ▼           ▼          ▼
+---------------------------------------------------------------------------+
|                    orchestrator_extensions 配置                           |
|  - iteration: 迭代优化控制                                                 |
|  - classification: 任务分类增强                                             |
|  - replanning: 动态重规划                                                   |
|  - quality: 质量门禁检查                                                   |
|  - feedback: 反馈学习机制                                                  |
|  - cache: 多级缓存管理                                                    |
+---------------------------------------------------------------------------+
```

## 2.2 核心模块职责边界表格

| 模块 | 类/组件 | 职责边界 | 依赖关系 |

|-----|--------|---------|---------|

| **分解器** | ElasticDecomposer | 1. 解析原始任务<br>2. 标注交付物类型<br>3. 语义分组<br>4. 生成 Prompt<br>5. 解决文件冲突 | TaskParser, TypeAnnotator, SemanticAnalyzer, PromptGenerator |

| **任务解析** | TaskParser | 1. 提取任务描述<br>2. 识别交付物列表<br>3. 构建任务结构 | 无 |

| **类型标注** | TypeAnnotator | 1. 多标签类型检测<br>2. 置信度评分<br>3. 插件扩展支持 | PluginManager |

| **语义分析** | SemanticSimilarityAnalyzer | 1. 计算文件相似度<br>2. 检测依赖关系<br>3. 识别分组边界 | TypeAnnotator |

| **语义分组** | SimilarityBasedGrouper | 1. 基于相似度合并文件<br>2. 生成组结构<br>3. 处理冲突敏感文件 | SemanticSimilarityAnalyzer |

| **混合语义分析** | HybridSemanticAnalyzer | 1. LLM 增强边界判断<br>2. 处理复杂依赖<br>3. 传递闭包扩展 | SemanticSimilarityAnalyzer |

| **Prompt 生成** | PromptGenerator | 1. 构建执行 Prompt<br>2. 注入上下文<br>3. 多文件格式生成 | TypeAnnotator |

| **冲突解决** | ConflictResolver | 1. 检测文件路径冲突<br>2. 应用合并策略<br>3. 生成整合元数据 | PromptGenerator |

| **插件管理** | PluginManager | 1. 加载类型检测插件<br>2. 管理插件生命周期 | 无 |

| **模型选择器** | ModelSelector | 1. 匹配任务特征<br>2. 选择最优模型<br>3. 成本优化 | Providers |

| **执行器** | OrchestratorExecutorIntegration | 1. 调度子任务执行<br>2. 管理并发<br>3. 聚合结果 | ModelSelector |

| **整合器** | Integrator | 1. 合并多模型输出<br>2. 解决代码冲突<br>3. 格式统一 | ConflictResolver |

| **熔断器** | CircuitBreaker | 1. 模型健康检测<br>2. 故障快速切断<br>3. 恢复重试 | ModelHealthChecker |

| **限流器** | RateLimiter | 1. 控制并发请求数<br>2. 防止资源耗尽 | 无 |

| **重试管理** | RetryManager | 1. 失败任务重试<br>2. 指数退避<br>3. 统计记录 | 无 |

| **缓存管理** | OrchestratorCacheManager | 1. 多级缓存<br>2. TTL 管理<br>3. 结果复用 | 无 |

| **会话管理** | SessionManager | 1. 会话状态存储<br>2. 增量处理<br>3. 依赖图维护 | 无 |

| **复杂度分析** | TaskComplexityAnalyzer | 1. 任务复杂度评分<br>2. 分解阈值判断<br>3. 方法选择 | LLM Client |

## 2.3 数据流图

### 2.3.1 完整任务处理流程

```
用户输入 (自然语言/结构化任务)
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OrchestratorServer                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │ InputValidator│   │ComplexityAnalyzer│  │ OrchestrationDecision│ │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
   复杂度判断
         │
    ┌────┴────┐
    │         │
    ▼         ▼
 简单任务    复杂任务
    │         │
    ▼         ▼
┌────────┐  ┌─────────────────────────────────────────────────────┐
│直接执行│  │                   任务分解流程                       │
└────────┘  │  ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐  │
            │  │TaskParser│→│TypeAnnot│→│Semantic│→│Prompt  │  │
            │  └────────┘   └────────┘   └────────┘   └────────┘  │
            │       │                         │            │      │
            │       └─────────────────────────┼────────────┘      │
            │                                   ▼                 │
            │                          ┌─────────────────┐       │
            │                          │ConflictResolver │       │
            │                          └─────────────────┘       │
            │                                   │                 │
            │                                   ▼                 │
            │                          ┌─────────────────┐       │
            │                          │  Subtask List   │       │
            │                          └─────────────────┘       │
            └─────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      模型选择流程                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │FeatureExtract│ → │CapabilityMatch│ → │CostOptimizer │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      并发执行流程                                 │
│                                                                  │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐               │
│  │Task #1 │  │Task #2 │  │Task #3 │  │Task #4 │  ...          │
│  │Model A │  │Model B │  │Model A │  │Model C │               │
│  └────────┘  └────────┘  └────────┘  └────────┘               │
│       │           │           │           │                      │
│       └───────────┴───────────┴───────────┘                      │
│                          │                                        │
│                          ▼                                        │
│                   ┌─────────────┐                                 │
│                   │ResultAggregator│                               │
│                   └─────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      整合流程                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │FileMerger    │ → │ConflictResolver│ → │FormatConverter│     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│                          │                                      │
│                          ▼                                      │
│                   ┌─────────────┐                               │
│                   │QualityValidator│                              │
│                   └─────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
                  最终代码输出
```

### 2.3.2 子任务执行时序图

```
用户                    Orchestrator        ModelSelector       执行器           模型
 │                         │                     │                │              │
 │  复杂任务请求            │                     │                │              │
 │────────────────────────>│                     │                │              │
 │                         │                     │                │              │
 │                         │  分解任务            │                │              │
 │                         │───────────────────> │                │              │
 │                         │                     │                │              │
 │                         │  分组后的Deliverables│                │              │
 │                         │<──────────────────── │                │              │
 │                         │                     │                │              │
 │                         │  为每个子任务选择模型│                │              │
 │                         │───────────────────> │                │              │
 │                         │                     │                │              │
 │                         │  模型分配结果        │                │              │
 │                         │<──────────────────── │                │              │
 │                         │                     │                │              │
 │                         │  并发执行子任务      │                │              │
 │                         │──────────────────────────────────────>│
 │                         │                     │                │              │
 │                         │                     │    [并发执行]   │              │
 │                         │                     │                │              │
 │                         │<──────────────────────────────────────│
 │                         │                     │                │              │
 │                         │  执行结果            │                │              │
 │                         │<────────────────────│────────────────│
 │                         │                     │                │              │
 │                         │  整合结果            │                │              │
 │                         │──────────────────>  │                │              │
 │                         │                     │                │              │
 │                         │  最终输出            │                │              │
 │<────────────────────────│                     │                │              │
```

## 2.4 扩展机制/插件系统

### 2.4.1 扩展架构

```
+=========================================================================+
|                        OrchestRouter 扩展架构                            |
+=========================================================================+

                              ┌─────────────────┐
                              │ ConfigService   │
                              │ (统一配置入口)   │
                              └────────┬────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
           ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
           │orchestrator_   │ │   executor     │ │   integrator   │
           │extensions      │ │   extensions   │ │   extensions   │
           └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
                    │                  │                  │
      ┌─────────────┼─────────────┐    │                  │
      │             │             │    │                  │
      ▼             ▼             ▼    ▼                  ▼
+----------+  +----------+  +----------+  +----------+  +----------+
|iteration │  │classify  |  │replanning│  │ rate_    │  │conflict  │
|          │  │          │  │          │  │ limiter  │  │resolver  │
+----------+  +----------+  +----------+  +----------+  +----------+
     │             │             │             │             │
     ▼             ▼             ▼             ▼             ▼
+----------+  +----------+  +----------+  +----------+  +----------+
|quality   │  │feedback  │  │  cache   │  │ retry_   │  │format_   │
|          │  │          │  │          │  │ manager  │  │converter │
+----------+  +----------+  +----------+  +----------+  +----------+
```

### 2.4.2 扩展配置结构

```json
{
  "orchestrator_extensions": {
    "iteration": {
      "enabled": true,
      "maxIterations": 3,
      "convergenceThreshold": 0.95
    },
    "classification": {
      "enabled": true,
      "model": "qwen3-coder-plus",
      "confidenceThreshold": 0.7
    },
    "replanning": {
      "enabled": true,
      "triggerOnFailure": true,
      "maxReplans": 2
    },
    "quality": {
      "enabled": true,
      "gateEnabled": true,
      "minQualityScore": 0.8
    },
    "feedback": {
      "enabled": true,
      "learningRate": 0.1,
      "explorationRate": 0.2
    },
    "cache": {
      "enabled": true,
      "defaultTTL": 3600000,
      "maxEntries": 1000,
      "persistenceEnabled": true
    }
  }
}
```

### 2.4.3 插件管理器架构

```
PluginManager
      │
      ├── PluginRegistry (插件注册表)
      │        │
      │        ├── typeDetector plugins (类型检测)
      │        ├── conflictResolver plugins (冲突解决)
      │        └── outputValidator plugins (输出验证)
      │
      ├── PluginLoader (插件加载器)
      │        │
      │        ├── loadFromPath() - 从指定路径加载
      │        ├── loadFromConfig() - 从配置加载
      │        └── autoDiscover() - 自动发现
      │
      └── PluginExecutor (插件执行器)
               │
               ├── execute(plugin, context) - 执行单个插件
               ├── executeChain(plugins, context) - 链式执行
               └── validateResults(results) - 结果验证
```

### 2.4.4 扩展点说明

| 扩展点 | 接口描述 | 位置 |
|-------|---------|------|
| 类型检测 | `TypeDetectorPlugin` 检测文件类型 | `TypeAnnotator.annotate()` |
| 语义分析 | `SemanticAnalyzerPlugin` 分析相似度 | `SemanticSimilarityAnalyzer` |
| 冲突解决 | `ConflictResolverPlugin` 合并冲突文件 | `ConflictResolver.resolve()` |
| Prompt 生成 | `PromptGeneratorPlugin` 定制 Prompt | `PromptGenerator.generate()` |
| 模型选择 | `ModelSelectorPlugin` 自定义选择策略 | `ModelSelector.select()` |
| 输出验证 | `OutputValidatorPlugin` 验证生成结果 | `Integrator.validate()` |

### 2.4.5 配置加载流程

```
ConfigService.getConfig()
       │
       ▼
+--------------------------------------------------+
|                   Unified Config                  |
+--------------------------------------------------+
       │              │              │
       ▼              ▼              ▼
+-----------+  +-----------+  +-----------+
|  System   |  | Providers |  | extensions|
+-----------+  +-----------+  +-----------+
       │              │              │
       ▼              ▼              ▼
+-----------+  +-----------+  +-----------+
|Orchestrator|  |  Selector  |  │  Plugins  |
|  Server    |  │            |  │ Manager   |
+-----------+  +-----------+  +-----------+
```

---

*文档版本: 1.0.0*
*最后更新: 2026-04-22*

---

# Chapter 3 - 核心模块详解

## 3.1 OrchestratorServer

**文件**: `src/orchestrator/OrchestratorServer.js`

### 核心流程

OrchestratorServer 是系统的编排决策中心，负责协调整个任务处理流程。作为 Claude Code 和 CCR Router 之间的代理层，所有请求先经过编排器，由编排器决定如何处理。

**工作流程**:
```
1. 接收 Claude Code 的请求
2. 判断是否需要任务分解
3. 如果需要：分解任务 → 选择模型 → 并发执行 → 整合结果 → 返回
4. 如果不需要：转发给 CCR Router
```

**核心编排流程** (`_orchestrate` 方法):
1. 请求验证 (InputValidator)
2. 复杂度分析 (TaskComplexityAnalyzer)
3. 任务分解 (ElasticDecomposer)
4. 模型选择 (ModelSelector)
5. 并发执行 (OrchestratorExecutorIntegration)
6. 结果整合 (Integrator)
7. 格式输出 (OutputFormatter)

**关键特性**:
- 多级缓存支持（分解缓存、模型选择缓存、复杂度缓存）
- 增量处理支持（IncrementalProcessor）
- 会话管理支持（SessionManager）
- 流程监控（FlowMonitor）

### API 端点表格

| 方法 | 端点 | 功能描述 |
|------|------|----------|
| GET | `/health` | 健康检查 |
| POST | `/orchestrate` | 编排端点（主端点） |
| POST | `/v1/orchestrate` | 编排端点（兼容路径） |
| POST | `/v1/orchestrate-tool-calls` | 编排端点（工具调用格式） |
| POST | `/v1/decompose` | 直接分解测试 |
| POST | `/v1/select-model` | 直接模型选择测试 |
| POST | `/v1/integrate` | 直接整合测试 |
| POST | `/v1/execute-subtasks` | 直接执行子任务 |
| GET | `/v1/model-selector-status` | 模型选择器状态 |
| GET | `/v1/executor-integration-status` | 执行器集成状态 |
| GET | `/v1/integrator-status` | 整合器状态 |
| GET | `/v1/model-health-status` | 模型健康状态 |
| GET | `/v1/session-status` | 会话管理状态 |
| GET | `/v1/sessions` | 获取会话详情 |
| DELETE | `/v1/sessions` | 删除会话 |
| GET | `/v1/logs` | 获取实时日志 |
| POST | `/v1/config` | 运行时配置管理 |
| GET | `/v1/status` | 服务器状态检查 |
| GET | `/api/metrics` | 获取指标汇总 |
| POST | `/v1/validation/validate` | 代码验证（全部验证器） |
| POST | `/v1/validation/eslint` | 代码验证（仅ESLint） |
| POST | `/v1/validation/typescript` | 代码验证（仅TypeScript编译） |
| GET | `/v1/progress/:taskId` | 获取特定任务进度 |
| GET | `/v1/flow/subscribe` | SSE 流程事件订阅 |

---

## 3.2 ElasticDecomposer (分解器)

**文件**: `src/decomposer/index.js`

### 7层处理流水线

ElasticDecomposer 的 `decompose()` 方法实现了7层处理流水线，将复杂任务分解为可独立执行的子任务。

| 步骤 | 功能块 | 组件 | 职责 |
|------|--------|------|------|
| 1 | 任务解析层 | TaskParser | 解析原始任务，提取任务描述和交付物列表 |
| 2 | 配置与插件层 | PluginManager | 加载类型检测插件，管理插件生命周期 |
| 3 | 类型标注层 | TypeAnnotator | 多标签类型检测，置信度评分，插件扩展支持 |
| 4 | 语义分组层 | SemanticSimilarityAnalyzer, SimilarityBasedGrouper | 计算文件相似度，检测依赖关系，识别分组边界 |
| 4.5 | 冲突敏感组合并 | mergeConflictSensitiveGroups | 强制将 conflict_sensitive_groups 指定的文件合并到同一子任务 |
| 5 | Prompt生成层 | PromptGenerator | 构建执行 Prompt，注入上下文，多文件格式生成 |
| 6 | 冲突解决层 | ConflictResolver | 检测文件路径冲突，应用合并策略，生成整合元数据 |
| 7 | 调试与监控层 | DebugInfoManager | 记录性能指标，调试信息，任务处理统计 |

**核心流程伪代码**:
```javascript
async decompose(task) {
  // 步骤1: 任务解析
  const parsedTask = this.parseTask(task);

  // 步骤2: 插件加载
  await this.loadPlugins();

  // 步骤3: 类型标注
  const annotatedDeliverables = await this.annotateTypes(parsedTask.deliverables);

  // 步骤4: 语义分组
  const groupedDeliverables = await this.groupSemantically(annotatedDeliverables);

  // 步骤4.5: 冲突敏感文件合并
  const mergedGroupedDeliverables = this.mergeConflictSensitiveGroups(
    groupedDeliverables,
    implementationPlan
  );

  // 步骤5: Prompt生成
  const subTasks = this.generatePrompts(mergedGroupedDeliverables, parsedTask);

  // 步骤6: 冲突解决
  const conflictResult = this.resolveConflictsWithHints(subTasks);

  // 步骤7: 调试信息记录
  this.logDebugInfo(resolvedTasks);

  return result;
}
```

**mergeConflictSensitiveGroups 关键规则**:
> 同一文件不能出现在多个 conflict_sensitive_groups 中。第一个组处理时会锁定文件，导致后续组无法找到完整文件，造成文件丢失。

---

## 3.3 ModelSelector (选择器)

**文件**: `src/selector/index.js`, `src/selector/ModelSelector.js`

### 7大功能块

ModelSelector 整合7个功能块，提供统一的模型选择接口：

| 功能块 | 组件 | 职责 |
|--------|------|------|
| A | ModelRegistry | 模型注册与管理层：加载、存储、检索模型配置 |
| B | SelectionConfigManager | 配置与策略层：管理选择策略、约束条件、熔断配置 |
| C | ModelEvaluator | 模型评估与选择层：基于规则评估模型能力匹配度 |
| D | CostController | 成本控制与监控层：预算管理、成本预估、费用追踪 |
| E | ModelStatusMonitor | 状态监控与降级层：模型健康检查、错误率监控、延迟追踪 |
| F | LearningSelector | 历史反馈与学习层：基于历史表现学习最优模型选择 |
| G | MultiLabelMatcher | 多标签能力匹配层：综合考虑任务的多标签类型标注 |

**选择流程** (`select` 方法):
```javascript
select(subtask) {
  // 步骤1: 规则评估
  const ruleBasedEvaluation = this.modelEvaluator.selectBestModel(subtask);

  // 步骤1.5: 多标签能力匹配
  const multiLabelMatchResult = this.multiLabelMatcher.selectBestModel(
    types, allModels
  );

  // 步骤2: 学习推荐（如果启用）
  const learningRecommendation = this.learningSelector.getBestModelForType(
    taskType, 'bayesian-weighted'
  );

  // 步骤3: 融合策略合并
  const evaluation = this.mergeRuleAndLearning(
    ruleBasedEvaluation, learningRecommendation, subtask
  );

  // 步骤3.5: 考虑多标签匹配结果
  if (multiLabelMatchResult.score > 0.7) {
    evaluation.modelId = multiLabelMatchResult.model;
  }

  // 步骤4: 成本验证
  if (!this.costController.canAllocate(evaluation.cost)) {
    return this.findCheaperAlternatives(...);
  }

  // 步骤5: 状态检查与降级
  if (!this.statusMonitor.isModelUsable(evaluation.modelId)) {
    return this.findAvailableAlternatives(...);
  }

  return createSelectionResult(...);
}
```

**融合策略** (learning_integration.strategy):
- `rule_priority`: 规则优先
- `learning_priority`: 学习优先（置信度 > 0.7）
- `contextual`: 上下文切换（根据任务特征选择策略）
- `hybrid`: 混合策略（默认，综合规则权重和学习置信度）

---

## 3.4 ConcurrentExecutor (执行器)

**文件**: `src/executor/index.js`

### 执行器类层次结构

```
BaseExecutor (抽象基类)
    │
    ├── ConcurrentExecutor (主执行器类)
    │       │
    │       └── EnhancedConcurrentExecutor (增强版)
    │               │
    │               └── ModelAwareConcurrentExecutor (模型感知版)
    │                       │
    │                       └── FullyEnhancedConcurrentExecutor (全面增强版)
    │
    └── TracedExecutor (追踪执行器类)
```

**并发控制组件**:
- `SharedConcurrencyManager`: 共享并发管理器（单例）
- `ConcurrencyController`: 并发控制器（代理）
- `TaskScheduler`: 任务调度器
- `AsyncRequester`: 异步请求器

### 容错机制

#### RetryManager (重试管理器)

负责失败任务重试管理，采用指数退避策略。

**配置参数**:
- `maxRetries`: 最大重试次数
- `baseDelay`: 基础延迟时间（毫秒）
- `maxDelay`: 最大延迟时间
- `exponentialBase`: 指数基数

**策略**:
- 指数退避：`delay = min(baseDelay * (exponentialBase ^ attempt), maxDelay)`
- 可配置的抖动（jitter）以避免雷群效应

#### RateLimiter (限流器)

控制并发请求数，防止资源耗尽。

**配置参数**:
- `maxConcurrent`: 最大并发数
- `maxRequestsPerWindow`: 窗口内最大请求数
- `windowSizeMs`: 窗口大小（毫秒）

**类型**:
- `SimpleRateLimiter`: 简单限流
- `LeakyBucketRateLimiter`: 漏桶算法限流
- `TokenBucketRateLimiter`: 令牌桶算法限流
- `CoordinatorRateLimiter`: 协调器级别限流

#### CircuitBreaker (熔断器)

模型健康检测与快速故障切断。

**状态机**:
```
CLOSED (正常) ──→ OPEN (熔断) ──→ HALF_OPEN (半开)
     │              │                │
     │ 失败计数       │ 超时后          │ 探测请求
     │ 超过阈值       │ 转换            │ 成功
     └──────────────→ │ ←───────────────┘
```

**配置参数**:
- `failureThreshold`: 失败阈值（触发熔断）
- `successThreshold`: 成功阈值（恢复熔断）
- `timeout`: 超时时间（毫秒）
- `monitorWindow`: 监控窗口大小

---

## 3.5 Integrator (整合器)

**文件**: `src/integrator/index.js`, `src/integrator/integrator.js`

### 5阶段整合流程

| 阶段 | 组件 | 职责 |
|------|------|------|
| 1 | FileOrganizer | 文件整理与分类：按类型/目录组织生成的文件 |
| 2 | ConflictDetector | 冲突检测：检测同名文件、导入冲突、命名冲突 |
| 3 | DependencyGraph | 依赖图构建：分析文件间依赖关系，生成导入语句 |
| 4 | MergeStrategyHandler | 合并策略处理：应用合并策略解决冲突 |
| 5 | OutputFormatter | 输出格式化：统一代码风格，生成最终输出 |

**整合流程伪代码**:
```javascript
async integrate(executionResults) {
  // 阶段1: 文件整理
  const organizedFiles = this.fileOrganizer.organize(executionResults);

  // 阶段2: 冲突检测
  const conflicts = this.conflictDetector.detect(organizedFiles);

  // 阶段3: 依赖图构建
  const dependencyGraph = this.dependencyGraph.build(organizedFiles);

  // 阶段4: 合并策略应用
  const mergedFiles = this.mergeStrategyHandler.handle(
    conflicts,
    dependencyGraph
  );

  // 阶段5: 输出格式化
  const output = this.outputFormatter.format(mergedFiles, options);

  return {
    success: true,
    files: output.files,
    logs: output.logs,
    warnings: output.warnings,
    qualityReport: output.qualityReport
  };
}
```

**关键子模块**:

- **ImportAnalyzer**: 分析文件导入语句，提取依赖关系
- **PathResolver**: 解析和规范化文件路径
- **DependencyInjector**: 注入缺失的依赖语句
- **NamingConflictResolver**: 解决命名冲突（同名不同义）
- **AutoRenamer**: 自动重命名冲突文件
- **LLMConflictResolver**: 使用 LLM 解决复杂冲突
- **CodeFormatter**: 统一代码风格
- **CompletenessValidator**: 验证输出完整性
- **ExecutionQualityEvaluator**: 评估执行质量
- **QualityFeedbackProcessor**: 处理质量反馈
- **RuntimeDependencyManager**: 管理运行时依赖（如 Node.js 内置模块）

---

# Chapter 4 - 扩展模块

OrchestRouter 通过扩展模块提供可插拔的功能增强机制。所有扩展模块配置位于 `config.json` 的 `orchestrator_extensions` 节点下。

## 4.1 迭代控制 (iteration)

### 功能概述

迭代控制器管理任务执行的迭代过程，通过 L1/L2/L3 三层迭代机制确保任务高质量完成。

### 配置结构

```json
"iteration": {
  "maxIterations": 8,
  "minQualityScore": 0.75,
  "maxTimeMs": 1200000,
  "enableHybridIteration": true,
  "l1MaxRetries": 2,
  "l2MaxIterations": 3,
  "l3MaxIterations": 2,
  "levelSwitchThreshold": 0.5,
  "earlyTerminationEnabled": true
}
```

### 迭代层级

| 层级 | 名称 | 适用场景 | 超时时间 |
|------|------|---------|----------|
| L1 | 快速修复 | 简单错误、语法问题 | 60s |
| L2 | 标准迭代 | 中等复杂度任务 | 180s |
| L3 | 深度处理 | 复杂问题、多轮调试 | 300s |

### 层级切换规则

- **L1 → L2**: 当 L1 重试次数超过 `l1MaxRetries` 或质量分数 < `levelSwitchThreshold`
- **L2 → L3**: 当 L2 迭代次数超过 `l2MaxIterations` 或问题复杂度持续
- **L3 → L2**: 当质量分数 >= 0.75 并保持 3 次稳定
- **L2 → L1**: 当质量分数 >= 0.8 并保持稳定

---

## 4.2 问题分类 (classification)

### 功能概述

问题分类器分析错误类型和严重程度，决定使用哪个迭代层级处理。

### 配置结构

```json
"classification": {
  "simpleErrorThreshold": 3,
  "moduleIssueThreshold": 10,
  "severityThreshold": 0.7
}
```

### 错误分类规则

| 错误类型 | 特征 | 推荐层级 |
|---------|------|----------|
| 简单错误 | 语法错误、拼写错误、缺失导入 | L1 |
| 模块问题 | 组件/函数逻辑错误 | L2 |
| 严重问题 | 安全漏洞、性能问题、架构缺陷 | L3 |

---

## 4.3 质量门控 (quality)

### 功能概述

质量门控定义任务完成的质量标准，在每个迭代结束后进行评估。

### 配置结构

```json
"quality": {
  "thresholds": {
    "qualityScore": 0.7,
    "testPassRate": 0.8,
    "codeCoverage": 0.7,
    "securityScore": 0.8,
    "performanceScore": 0.7
  },
  "weights": {
    "functionality": 0.3,
    "reliability": 0.2,
    "usability": 0.15,
    "efficiency": 0.2,
    "maintainability": 0.1,
    "portability": 0.05
  }
}
```

### 质量评估维度

| 维度 | 权重 | 评估内容 |
|------|------|---------|
| 功能性 | 30% | 功能是否完整、正确 |
| 可靠性 | 20% | 错误率、稳定性 |
| 可用性 | 15% | 易用性、界面友好度 |
| 效率 | 20% | 性能、响应时间 |
| 可维护性 | 10% | 代码质量、可读性 |
| 可移植性 | 5% | 跨平台能力 |

---

## 4.4 反馈分析 (feedback)

### 功能概述

反馈分析器处理执行结果反馈，支持根因分析和模式识别。

### 配置结构

```json
"feedback": {
  "minFeedbackQuality": 0.5,
  "enableRootCauseAnalysis": true,
  "enablePatternRecognition": true,
  "feedbackWeight": {
    "testFailure": 0.35,
    "qualityIssue": 0.35,
    "performanceIssue": 0.15,
    "userFeedback": 0.15
  }
}
```

### 反馈处理流程

```
执行结果 → 质量评估 → 反馈提取 → 模式匹配 → 根因分析 → 改进建议
```

---

## 4.5 缓存管理 (cache)

### 功能概述

缓存管理器通过多级缓存减少重复计算开销，提高系统响应速度。

### 配置结构

```json
"cache": {
  "enabled": true,
  "defaultTTL": 3600000,
  "maxEntries": 1000,
  "persistenceEnabled": true,
  "llm": {
    "enabled": true,
    "ttl": 86400000
  }
}
```

### 缓存类型

| 缓存类型 | TTL | 用途 |
|---------|-----|------|
| 内存缓存 | 1小时 | 热点数据、快速访问 |
| LLM 结果缓存 | 24小时 | 相似 Prompt 的执行结果 |
| 持久化缓存 | 永久 | 重要配置、学习数据 |

---

## 4.6 重新规划 (replanning)

### 功能概述

重新规划模块在任务执行失败或质量不达标时，智能调整执行计划。

### 配置结构

```json
"replanning": {
  "enableSmartRefinement": true,
  "maxRefinementRounds": 5,
  "priorityAdjustmentFactor": 0.2
}
```

### 重规划策略

1. **智能细化**: 分析失败原因，调整子任务粒度
2. **优先级调整**: 根据执行情况动态调整任务优先级
3. **模型切换**: 在模型选择不佳时切换备选模型

---

# Chapter 5 - 配置系统

## 5.1 配置结构概述

OrchestRouter 使用统一的 `config.json` 配置文件，包含 13 个主要配置节：

| 配置节 | 说明 | 关键参数 |
|--------|------|----------|
| `system` | 系统基础配置 | port, debug, logLevel |
| `Providers` | AI 模型提供商 | api_base_url, models |
| `selector` | 模型选择规则 | default, background, think |
| `costControl` | 成本控制 | dailyBudget, maxCostPerTask |
| `executor` | 执行器配置 | max_concurrency, retry, rate_limit |
| `decomposer` | 任务分解器 | llm, task_types, matching_rules |
| `orchestrator` | 编排器核心 | port, ccrRouterUrl, timeout |
| `circuit_breaker` | 熔断器配置 | failureThreshold, timeout |
| `session` | 会话管理 | storeType, ttl, encryption |
| `retry_manager` | 重试管理 | max_retries, exponential_base |
| `rate_limiter` | 限流器 | default_rps, burst_capacity |
| `learning_engine` | 学习引擎 | enabled, persistence, learning_rate |
| `orchestrator_extensions` | 扩展模块 | iteration, classification, quality 等 |

## 5.2 任务类型定义

`decomposer.task_types.built_in` 定义了 8 种内置任务类型：

| 类型 | 显示名 | 优先级 | 适用场景 |
|------|--------|--------|----------|
| `ui` | 用户界面 | 3 | React/Vue 组件、页面 |
| `style` | 样式设计 | 2 | CSS/SCSS/Less |
| `logic` | 业务逻辑 | 5 | 算法、工作流 |
| `api` | API 接口 | 4 | REST/GraphQL 端点 |
| `test` | 测试 | 1 | 单元/集成测试 |
| `config` | 配置 | 0 | 配置文件 |
| `model` | 数据模型 | 4 | ORM/实体定义 |
| `general` | 通用任务 | 2 | 其他任务 |

## 5.3 模型能力定义

`decomposer.model_capabilities` 定义了各模型在不同任务类型上的能力评分：

```json
"MiniMax-M2.7": {
  "code": 0.85,
  "reasoning": 0.85,
  "logic": 0.8,
  "api": 0.8,
  "ui": 0.7,
  "test": 0.7,
  "style": 0.6,
  "security": 0.6,
  "database": 0.6,
  "multi_tool_call": true
}
```

## 5.4 UI 配置组件映射

前端 UI 提供 14 个配置组件，位于 `ui/src/components/config/` 目录：

| 组件 | 配置节 | 功能 |
|------|--------|------|
| `SystemConfig.tsx` | system | 系统基础配置 |
| `ProvidersConfig.tsx` | Providers | 模型提供商管理 |
| `SelectorConfig.tsx` | selector | 模型选择规则 |
| `CostControlConfig.tsx` | costControl | 成本控制 |
| `ExecutorConfig.tsx` | executor | 执行器配置 |
| `DecomposerConfig.tsx` | decomposer | 任务分解器 |
| `OrchestratorConfig.tsx` | orchestrator | 编排器核心 |
| `CircuitBreakerConfig.tsx` | circuit_breaker | 熔断器 |
| `SessionConfig.tsx` | session | 会话管理 |
| `RetryManagerConfig.tsx` | retry_manager | 重试管理 |
| `RateLimiterConfig.tsx` | rate_limiter | 限流器 |
| `LearningEngineConfig.tsx` | learning_engine | 学习引擎 |
| `IntegratorConfig.tsx` | integrator | 代码整合器 |
| `ExtensionsConfig.tsx` | orchestrator_extensions | 扩展模块 |

## 5.5 配置验证与热重载

`ConfigService` (`config/ConfigService.js`) 提供配置验证和热重载功能：

### 验证规则

- 必填字段检查
- 数值范围校验
- 格式合法性验证
- 依赖配置一致性检查

### 热重载

配置变更后自动重新加载，无需重启服务：

```javascript
const configService = new ConfigService();
const config = configService.getConfig();  // 获取最新配置
```

---

# Chapter 6 - API 参考

## 6.1 主编排端点

### POST /v1/orchestrate

主编排端点，接收复杂任务并返回执行结果。

**请求示例**：

```json
{
  "task": "创建一个用户注册系统，包括前端页面、后端API和数据库模型",
  "session_id": "sess-xxx-yyy",
  "options": {
    "autoOrchestrate": true,
    "maxConcurrency": 5
  }
}
```

**响应示例**：

```json
{
  "success": true,
  "session_id": "sess-xxx-yyy",
  "result": {
    "files": [
      {
        "filePath": "src/pages/Register.tsx",
        "action": "create",
        "content": "..."
      }
    ],
    "metadata": {
      "totalFiles": 5,
      "executionTime": 12500,
      "modelsUsed": ["MiniMax-M2.7", "deepseek-chat"]
    }
  }
}
```

## 6.2 任务分解端点

### POST /v1/decompose

将任务分解为子任务，不执行。

**请求示例**：

```json
{
  "task": "创建产品列表页面",
  "options": {
    "includePrompt": true
  }
}
```

**响应示例**：

```json
{
  "success": true,
  "subtasks": [
    {
      "id": "subtask-1",
      "description": "创建产品卡片组件",
      "prompt": "你是一个React专家...",
      "modelId": "MiniMax-M2.5",
      "deliverables": ["src/components/ProductCard.tsx"]
    }
  ],
  "metadata": {
    "totalSubtasks": 3,
    "estimatedTime": 45000
  }
}
```

## 6.3 执行子任务端点

### POST /v1/execute-subtasks

直接执行子任务，绕过编排流程。

**请求示例**：

```json
{
  "subtasks": [
    {
      "id": "subtask-1",
      "prompt": "创建用户注册表单组件",
      "modelId": "MiniMax-M2.7",
      "timeout": 60000
    }
  ],
  "options": {
    "continueOnError": true
  }
}
```

## 6.4 流程监控端点

### GET /v1/flow/subscribe

SSE 流式端点，实时推送执行进度。

**事件格式**：

```
event: progress
data: {"step": "decomposition", "progress": 45, "message": "分析任务依赖..."}

event: complete
data: {"totalTime": 12500, "filesCreated": 5}

event: error
data: {"code": "MODEL_TIMEOUT", "message": "模型响应超时"}
```

### GET /v1/progress/:taskId

获取特定任务的执行进度。

**响应示例**：

```json
{
  "taskId": "task-xxx",
  "status": "running",
  "steps": [
    {"name": "decomposition", "status": "complete", "progress": 100},
    {"name": "model_selection", "status": "complete", "progress": 100},
    {"name": "execution", "status": "running", "progress": 60}
  ]
}
```

## 6.5 其他 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/model-selector-status` | GET | 获取模型选择器状态 |
| `/v1/model-health-status` | GET | 获取模型健康状态 |
| `/v1/executor-integration-status` | GET | 获取执行器状态 |
| `/v1/integrator-status` | GET | 获取整合器状态 |
| `/v1/integrate` | POST | 直接调用整合器 |
| `/v1/select-model` | POST | 测试模型选择 |
| `/v1/logs` | GET | 获取执行日志 |
| `/v1/config` | POST | 更新配置 |
| `/v1/status` | GET | 获取系统状态 |
| `/v1/sessions` | GET | 获取会话列表 |

---

# Chapter 7 - 前端界面

## 7.1 技术栈概述

OrchestRouter 前端采用现代化的技术栈构建：

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.x | UI 框架 |
| Tailwind CSS | 4.x | 样式引擎 |
| Vite | 5.x | 构建工具 |
| Node.js | 18+ | 运行时 |

### 技术选型理由

- **React 19**: 支持最新的 Hooks 和并发特性，提供更好的性能
- **Tailwind CSS 4**: 原子化 CSS 方案，加快样式开发速度
- **TypeScript**: 提供完整的类型检查，减少运行时错误

## 7.2 UI 布局结构

### 7.2.1 整体布局

```
+=========================================================================+
|                        OrchestRouter Web UI                              |
+=========================================================================+

+---------------------------------------------------------------------------+
|  Header (标题栏)                                                           |
|  +---------------------------------------------------------------------+  |
|  |  OrchestRouter 控制台    [导出配置] [导入配置] [健康状态指示器]        |  |
|  +---------------------------------------------------------------------+  |
+---------------------------------------------------------------------------+
          │
          ▼
+---------------------------------------------------------------------------+
|  Tab Navigation (标签页导航)                                               |
|  +-------+-------+-------+-------+-------+-------+-------+-------+-----+  |
|  |规则表 |模型表 |分解器 |编排器 |执行器 |整合器 |扩展   |指标   |流程  |  |
|  +-------+-------+-------+-------+-------+-------+-------+-------+-----+  |
+---------------------------------------------------------------------------+
          │
          ▼
+---------------------------------------------------------------------------+
|  Main Content Area (主内容区)                                             |
|  +---------------------------------------------------------------------+  |
|  |                                                                      │  |
|  |   根据当前选中标签页显示对应的配置组件                                 │  |
|  |                                                                      │  |
|  +---------------------------------------------------------------------+  |
+---------------------------------------------------------------------------+
```

### 7.2.2 响应式设计

- **桌面端 (≥1024px)**: 完整布局，多列网格
- **平板端 (768-1023px)**: 单列布局，标签页可滚动
- **移动端 (<768px)**: 垂直堆叠，简化导航

## 7.3 组件结构

### 7.3.1 配置组件列表

系统包含 12 个配置组件，位于 `ui/src/components/config/` 目录：

| 组件文件 | 功能描述 | 配置项数量 |
|----------|---------|-----------|
| `RuleTable.tsx` | 路由规则表格 | 核心组件 |
| `ModelForm.tsx` | 模型表单 | 核心组件 |
| `DecomposerConfig.tsx` | 任务分解器配置 | LLM/任务类型/语义分析/冲突解决 |
| `OrchestratorConfig.tsx` | 编排器核心配置 | 迭代/超时/缓存策略 |
| `ExecutorConfig.tsx` | 执行器配置 | 并发/超时/重试策略 |
| `IntegratorConfig.tsx` | 整合器配置 | 缓存/依赖检查/冲突解决 |
| `ExtensionsConfig.tsx` | 扩展模块配置 | iteration/classification/replanning/quality/feedback |
| `CircuitBreakerConfig.tsx` | 熔断器配置 | 故障检测/恢复策略 |
| `SessionConfig.tsx` | 会话管理配置 | 会话超时/状态存储 |
| `RateLimiterConfig.tsx` | 限流器配置 | QPS/并发限制 |
| `RetryManagerConfig.tsx` | 重试管理器配置 | 重试策略/退避算法 |
| `CostControlConfig.tsx` | 成本控制配置 | 预算限制/成本追踪 |
| `LearningEngineConfig.tsx` | 学习引擎配置 | 学习率/探索率 |
| `AdapterConfig.tsx` | 适配器配置 | 自定义 API 适配器 |

### 7.3.2 组件层级关系

```
App.tsx (根组件)
├── Header (标题栏)
├── TabNavigation (标签页导航)
└── ConfigArea (配置区域)
    ├── RuleTable / ModelForm
    ├── DecomposerConfig (分解器)
    │   ├── LLM 配置
    │   ├── 任务类型配置
    │   ├── 语义分析配置
    │   └── 冲突解决配置
    ├── OrchestratorConfig (编排器)
    ├── ExecutorConfig (执行器)
    ├── IntegratorConfig (整合器)
    ├── ExtensionsConfig (扩展)
    │   ├── iteration (迭代控制)
    │   ├── classification (问题分类)
    │   ├── replanning (重新规划)
    │   ├── quality (质量门控)
    │   └── feedback (反馈分析)
    ├── CircuitBreakerConfig (熔断器)
    ├── SessionConfig (会话管理)
    ├── RateLimiterConfig (限流器)
    ├── RetryManagerConfig (重试管理)
    ├── CostControlConfig (成本控制)
    ├── LearningEngineConfig (学习引擎)
    ├── AdapterConfig (适配器)
    ├── MetricsDashboard (指标仪表板)
    └── FlowMonitor (流程监控)
```

### 7.3.3 核心组件代码示例

**DecomposerConfig.tsx 结构**:
```tsx
const DecomposerConfig: React.FC<DecomposerConfigProps> = ({ config, onUpdate }) => {
  const [activeTab, setActiveTab] = useState('llm');
  // Tab 切换: llm | task | semantic | debug | conflict

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-slate-800">分解器配置</h2>
      {/* Tab 导航 */}
      <div className="flex space-x-1 mb-6 bg-slate-100 p-1 rounded-xl">
        <button onClick={() => setActiveTab('llm')}>LLM 配置</button>
        <button onClick={() => setActiveTab('task')}>任务类型</button>
        <button onClick={() => setActiveTab('semantic')}>语义分析</button>
        <button onClick={() => setActiveTab('debug')}>调试模式</button>
        <button onClick={() => setActiveTab('conflict')}>冲突解决</button>
      </div>
      {/* 根据 activeTab 渲染对应内容 */}
    </div>
  );
};
```

### 7.3.4 配置导入/导出功能

App.tsx 提供配置的导入和导出功能：

**导出流程**:
1. 用户点击「导出配置」按钮
2. 系统调用 `/api/config/export` 获取完整配置
3. 浏览器下载 JSON 文件 `orchestrouter-config-{timestamp}.json`

**导入流程**:
1. 用户点击「导入配置」按钮
2. 选择本地 JSON 文件
3. 调用 `/api/config/import` 上传并保存配置
4. 刷新页面以应用新配置

## 7.4 样式系统

### 7.4.1 Tailwind CSS 配置

系统使用 Tailwind CSS 4 的默认配置，主要使用以下色系：

- **主色调**: `indigo` (靛蓝色)
- **功能色**: `emerald` (成功), `red` (错误), `amber` (警告)
- **文字色**: `slate-800` (标题), `slate-600` (正文), `slate-500` (辅助)

### 7.4.2 组件样式规范

```tsx
// 按钮样式
<button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
  确定
</button>

// 输入框样式
<input className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" />

// 标签页样式
<div className="flex space-x-1 bg-slate-100 p-1 rounded-xl">
  <button className="px-4 py-2 rounded-lg bg-white text-indigo-600 shadow-sm">
    活动标签
  </button>
</div>
```

---

# Chapter 8 - MCP 集成

## 8.1 集成架构

MCP (Model Context Protocol) 适配器将 OrchestRouter 的编排能力暴露给 Claude Code：

```
+=========================================================================+
|                         MCP 集成架构                                      |
+=========================================================================+

   Claude Code
        │
        │ MCP 协议
        ▼
+------------------+
|  MCP 适配器服务器  │
|  (mcp-server.js)  │
|  端口: 3459       │
+------------------+
        │
        │ HTTP API
        ▼
+------------------+
| Orchestrator     │
| Server           │
| 端口: 3458       │
+------------------+
```

## 8.2 MCP 服务器端点

### 8.2.1 端点列表

| 端点 | 方法 | 描述 |
|------|------|------|
| `/mcp-server-info` | GET | 获取 MCP 服务器信息 |
| `/resources` | GET | 列出可用资源 |
| `/resources/{name}` | GET | 获取特定资源详情 |
| `/tools` | GET | 列出可用工具 |
| `/tools/{name}` | GET | 获取特定工具详情 |
| `/tools/run-orchestration` | POST | 执行编排任务 |

### 8.2.2 MCP 资源定义

```javascript
// 编排任务资源
'orchestration-task': {
  description: 'Run orchestration task through the orchestrator server',
  schema: {
    type: 'object',
    properties: {
      task: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          deliverables: { type: 'array' }
        },
        required: ['title', 'description']
      }
    },
    required: ['task']
  }
}
```

### 8.2.3 MCP 工具定义

```javascript
// run-orchestration 工具
'run-orchestration': {
  description: 'Run a task through the orchestrator server and return tool calls',
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description' },
          deliverables: { type: 'array' }
        },
        required: ['title', 'description']
      },
      options: {
        type: 'object',
        properties: {
          enableDecomposition: { type: 'boolean' },
          enableModelSelection: { type: 'boolean' },
          enableExecution: { type: 'boolean' }
        }
      },
      outputFormat: { type: 'string', enum: ['tool_call', 'json'] }
    },
    required: ['task']
  }
}
```

## 8.3 Claude Code 配置

### 8.3.1 MCP 服务器连接配置

在 Claude Code 中配置 MCP 服务器连接到 OrchestRouter：

```json
{
  "mcpServers": {
    "orchestrouter": {
      "command": "node",
      "args": ["/path/to/OrchestRouter/mcp-server.js"],
      "env": {
        "ORCHESTRATOR_HOST": "localhost",
        "ORCHESTRATOR_PORT": "3458"
      }
    }
  }
}
```

### 8.3.2 启动 MCP 服务器

```bash
# 默认端口启动
node mcp-server.js

# 指定端口启动
node mcp-server.js 3459

# 带环境变量启动
ORCHESTRATOR_PORT=3458 node mcp-server.js
```

### 8.3.3 使用流程

1. **启动 Orchestrator Server** (端口 3458)
2. **启动 MCP Adapter Server** (端口 3459)
3. **Claude Code 连接** 到 MCP 服务器
4. **发送编排请求** 通过 `run-orchestration` 工具
5. **接收结果** 以 tool_call 或 JSON 格式返回

## 8.4 请求转发机制

MCP 适配器将请求转发到 Orchestrator Server：

```
Claude Code                    MCP Server                    Orchestrator
     │                            │                              │
     │ POST /tools/run-orchestration│                              │
     │───────────────────────────>│                              │
     │                            │                              │
     │                            │ POST /v1/orchestrate-tool-calls│
     │                            │─────────────────────────────>│
     │                            │                              │
     │                            │        200 OK + tool_calls    │
     │                            │<─────────────────────────────│
     │                            │                              │
     │ 200 OK + tool_calls        │                              │
     │<───────────────────────────│                              │
```

## 8.5 错误处理

MCP 服务器的错误处理机制：

| 错误类型 | HTTP 状态码 | 处理方式 |
|----------|-------------|---------|
| 编排器连接失败 | 500 | 返回 `{ error: error.message }` |
| 无效请求格式 | 400 | 返回 `{ error: 'Invalid request' }` |
| 资源/工具未找到 | 404 | 返回 `{ error: 'Not found' }` |
| MCP 服务器错误 | 500 | 捕获并返回具体错误信息 |

---

# Chapter 9 - 部署与运维

## 9.1 环境要求

### 9.1.1 系统要求

| 项目 | 最低要求 | 推荐配置 |
|------|---------|---------|
| 操作系统 | Windows 10 / macOS 10.15 / Ubuntu 20.04 | Windows 11 / macOS 13 |
| Node.js | 18.0.0 | 20.x LTS |
| 内存 | 4 GB RAM | 8 GB RAM |
| 磁盘空间 | 500 MB | 1 GB SSD |
| 网络 | 100 Mbps | 1 Gbps |

### 9.1.2 依赖项

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "axios": "^1.6.0",
    "js-yaml": "^4.1.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "tailwindcss": "^4.0.0"
  }
}
```

## 9.2 启动方式

### 9.2.1 后端服务器启动

```bash
# 进入项目根目录
cd OrchestRouter

# 默认配置启动 (端口 3458)
node start-orchestrator.js

# 指定端口启动
node start-orchestrator.js 3458

# 开发模式启动 (带调试输出)
DEBUG=true node start-orchestrator.js

# 带环境变量启动
ORCHESTRATOR_PORT=3458 DEBUG=true node start-orchestrator.js
```

### 9.2.2 前端开发服务器启动

```bash
# 进入 UI 目录
cd ui

# 安装依赖 (首次)
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 9.2.3 MCP 适配器启动

```bash
# 启动 MCP 服务器 (默认端口 3459)
node mcp-server.js

# 指定端口
node mcp-server.js 3459

# 连接到不同的编排器地址
ORCHESTRATOR_HOST=192.168.1.100 ORCHESTRATOR_PORT=3458 node mcp-server.js
```

### 9.2.4 Docker 部署 (可选)

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3458 3459

CMD ["node", "start-orchestrator.js"]
```

## 9.3 环境变量配置

### 9.3.1 系统级环境变量

| 变量名 | 默认值 | 描述 |
|--------|-------|------|
| `ORCHESTRATOR_PORT` | 3458 | Orchestrator Server 端口 |
| `MCP_SERVER_PORT` | 3459 | MCP Adapter 端口 |
| `ORCHESTRATOR_HOST` | localhost | Orchestrator Server 主机 |
| `DEBUG` | false | 启用调试模式 |
| `LOG_LEVEL` | info | 日志级别 (debug/info/warn/error) |
| `CONFIG_PATH` | ./config/config.json | 配置文件路径 |

### 9.3.2 API 密钥配置

通过 `.env` 文件配置各模型提供商的 API 密钥：

```bash
# API 密钥配置
DASHSCOPE_API_KEY=your_api_key_here
DEEPSEEK_API_KEY=your_api_key_here
GEMINI_API_KEY=your_api_key_here
OPENAI_API_KEY=your_api_key_here
```

### 9.3.3 环境变量文件示例

创建 `.env` 文件：

```bash
# OrchestRouter 环境配置
ORCHESTRATOR_PORT=3458
MCP_SERVER_PORT=3459
DEBUG=false
LOG_LEVEL=info

# API 密钥 (根据需要配置)
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxx
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxx
GEMINI_API_KEY=xxxxxxxxxxxxx
```

## 9.4 日志管理

### 9.4.1 日志级别

系统支持以下日志级别：

| 级别 | 描述 | 使用场景 |
|------|------|---------|
| `debug` | 详细调试信息 | 开发调试 |
| `info` | 一般信息性消息 | 正常运行 |
| `warn` | 警告消息 | 非致命问题 |
| `error` | 错误消息 | 故障排除 |

### 9.4.2 日志格式

```json
{
  "timestamp": "2026-04-22T10:30:00.000Z",
  "level": "info",
  "service": "orchestrator",
  "message": "Task decomposition completed",
  "metadata": {
    "taskId": "task-123",
    "duration": 1250
  }
}
```

### 9.4.3 日志输出

- **控制台**: 彩色输出，便于开发调试
- **文件**: 写入 `logs/orchestrator-{date}.log`
- **远程**: 可配置发送到日志收集服务

### 9.4.4 日志查看命令

```bash
# 实时查看日志
tail -f logs/orchestrator-$(date +%Y-%m-%d).log

# 查看错误日志
grep "error" logs/orchestrator-$(date +%Y-%m-%d).log

# 查看特定任务的日志
grep "task-123" logs/orchestrator-$(date +%Y-%m-%d).log
```

---

# Chapter 10 - 故障排查

## 10.1 常见问题

### 10.1.1 服务启动问题

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 端口被占用 | 3458/3459 端口已被其他进程使用 | 使用 `netstat -ano \| findstr :3458` 查找占用进程并终止 |
| 配置文件缺失 | config.json 不存在 | 从 `config/config.json.example` 复制并修改 |
| 依赖安装失败 | npm 版本过旧或网络问题 | 更新 npm (`npm install -g npm`) 或配置镜像源 |

### 10.1.2 任务执行问题

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 任务分解失败 | LLM API 不可用或配额用尽 | 检查 API 密钥配置和账户余额 |
| 模型选择超时 | 所有模型都不可用 | 检查网络连接和模型服务商状态 |
| 执行结果为空 | 任务描述不清晰或模型响应格式错误 | 优化任务描述，检查模型配置 |
| 冲突解决失败 | conflict_sensitive_groups 配置错误 | 检查配置文件，确保同一文件只出现在一个组中 |

### 10.1.3 MCP 集成问题

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| Claude Code 无法连接 | MCP 服务器未启动或端口错误 | 确认 mcp-server.js 正在运行 |
| 工具调用失败 | Orchestrator Server 未启动 | 先启动 Orchestrator Server 再启动 MCP Server |
| 请求超时 | 网络延迟或任务过于复杂 | 增加超时配置或简化任务 |

### 10.1.4 配置文件问题

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 配置导入失败 | JSON 格式错误 | 使用 JSON 验证工具检查语法 |
| 配置丢失 | 保存时格式转换错误 | 检查 ConfigService.js 的合并逻辑 |
| 扩展模块不生效 | 模块未启用或配置错误 | 检查 orchestrator_extensions 配置 |

## 10.2 调试模式

### 10.2.1 启用调试

```bash
# 方式1: 环境变量
DEBUG=true node start-orchestrator.js

# 方式2: 在 config.json 中启用
{
  "debug": {
    "enabled": true,
    "verbose": true
  }
}
```

### 10.2.2 调试端点

| 端点 | 描述 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /v1/model-selector-status` | 模型选择器状态 |
| `GET /v1/decomposer-debug` | 分解器调试信息 |
| `GET /v1/executor-debug` | 执行器调试信息 |

### 10.2.3 常用调试命令

```bash
# 检查服务状态
curl http://localhost:3458/health

# 检查模型选择器
curl http://localhost:3458/v1/model-selector-status

# 测试编排任务
curl -X POST http://localhost:3458/v1/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"task": {"title": "测试任务", "description": "简单测试"}}'
```

### 10.2.4 日志调试

启用调试模式后，系统会输出：

```
[DEBUG] Task received: { title: '测试任务', description: '测试描述' }
[DEBUG] Complexity analysis: score=0.75, requiresDecomposition=true
[DEBUG] Decomposition result: 5 subtasks generated
[DEBUG] Model selection: task-1 -> qwen3-coder-plus
[DEBUG] Execution started: 5 concurrent tasks
[DEBUG] Integration completed: 3 files merged
```

## 10.3 性能问题排查

### 10.3.1 性能瓶颈定位

1. **任务分解慢**: 检查 LLM API 延迟
2. **模型选择慢**: 检查模型注册表大小和网络
3. **执行慢**: 检查并发配置和限流设置
4. **整合慢**: 检查文件冲突数量和合并策略

### 10.3.2 性能优化建议

- **减少任务分解复杂度**: 简化 conflict_sensitive_groups
- **优化模型选择**: 使用能力过滤减少候选模型
- **调整并发数**: 根据服务器资源调整 `executor.maxConcurrency`
- **启用缓存**: 确保 `cache.enabled: true`

---

# Chapter 11 - 贡献指南

## 11.1 模块开发规范

### 11.1.1 新模块开发流程

1. **需求分析**: 在 `plans/` 目录下创建需求文档
2. **设计评审**: 提交设计评审会议讨论
3. **代码实现**: 遵循项目代码规范
4. **测试验证**: 编写单元测试和集成测试
5. **文档更新**: 更新相关文档
6. **代码审查**: 提交 PR 进行审查

### 11.1.2 目录结构规范

```
OrchestRouter/
├── src/
│   ├── decomposer/          # 任务分解器
│   │   ├── index.js
│   │   ├── TaskParser.js
│   │   ├── TypeAnnotator.js
│   │   └── utils/
│   │       └── PromptGenerator.js
│   ├── selector/            # 模型选择器
│   │   ├── index.js
│   │   └── registry/
│   ├── executor/            # 执行器
│   │   └── index.js
│   └── integrator/          # 整合器
│       └── index.js
├── ui/
│   └── src/
│       └── components/
│           └── config/      # 配置组件
├── config/                  # 配置文件
│   └── config.json
└── docs/                   # 文档
```

### 11.1.3 代码风格规范

**命名规范**:
- 类名: PascalCase (如 `ModelSelector`)
- 方法名: camelCase (如 `selectModel`)
- 常量: UPPER_SNAKE_CASE (如 `MAX_RETRIES`)
- 文件名: camelCase 或 kebab-case

**注释规范**:
```javascript
/**
 * 选择最优模型用于执行给定任务
 * @param {Object} task - 任务对象
 * @param {Array<string>} capabilities - 所需能力列表
 * @returns {Promise<string>} 选中的模型ID
 */
async selectModel(task, capabilities) {
  // 实现逻辑
}
```

**错误处理规范**:
```javascript
try {
  await executeTask(task);
} catch (error) {
  logger.error('Task execution failed', {
    taskId: task.id,
    error: error.message,
    stack: error.stack
  });
  throw new OrchestratorError('TASK_EXECUTION_FAILED', error);
}
```

## 11.2 配置扩展

### 11.2.1 添加新的配置项

1. **config.json**: 添加配置项及注释
2. **UI 组件**: 在 `ui/src/components/config/` 添加对应配置组件
3. **类型定义**: 必要时在 TypeScript 类型文件中添加类型
4. **默认值**: 确保默认值合理

### 11.2.2 配置示例

**在 config.json 中添加新配置**:
```json
{
  "$comment_new_feature": "---------------------------------------- 【新功能】- 功能描述 ----------------------------------------",
  "new_feature": {
    "enabled": true,
    "option1": "value1",
    "option2": 100
  }
}
```

**创建对应的 UI 组件**:
```tsx
// ui/src/components/config/NewFeatureConfig.tsx
import React from 'react';

interface NewFeatureConfigProps {
  config: any;
  onUpdate: (config: any) => void;
}

const NewFeatureConfig: React.FC<NewFeatureConfigProps> = ({ config, onUpdate }) => {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-slate-800">新功能配置</h2>
      {/* 配置项表单 */}
    </div>
  );
};

export default NewFeatureConfig;
```

### 11.2.3 扩展点清单

| 扩展点 | 位置 | 接口 | 说明 |
|--------|------|------|------|
| 类型检测 | `TypeAnnotator` | `detectTypes(file)` | 添加新的文件类型检测逻辑 |
| 语义分析 | `SemanticAnalyzer` | `analyzeSimilarity(fileA, fileB)` | 定制相似度计算算法 |
| 冲突解决 | `ConflictResolver` | `resolve(fileA, fileB)` | 实现自定义合并策略 |
| 模型选择 | `ModelSelector` | `select(task, candidates)` | 实现自定义选择算法 |
| 质量验证 | `Integrator` | `validate(output)` | 添加输出质量检查规则 |

### 11.2.4 扩展模块配置

系统支持 6 个扩展模块，在 `orchestrator_extensions` 中配置：

```json
{
  "orchestrator_extensions": {
    "iteration": {
      "enabled": true,
      "maxIterations": 3,
      "convergenceThreshold": 0.95
    },
    "classification": {
      "enabled": true,
      "model": "qwen3-coder-plus",
      "confidenceThreshold": 0.7
    },
    "replanning": {
      "enabled": true,
      "triggerOnFailure": true,
      "maxReplans": 2
    },
    "quality": {
      "enabled": true,
      "gateEnabled": true,
      "minQualityScore": 0.8
    },
    "feedback": {
      "enabled": true,
      "learningRate": 0.1,
      "explorationRate": 0.2
    },
    "cache": {
      "enabled": true,
      "defaultTTL": 3600000,
      "maxEntries": 1000,
      "persistenceEnabled": true
    }
  }
}
```

## 11.3 提交规范

### 11.3.1 提交信息格式

```
<类型>(<模块>): <描述>

[可选的详细说明]
```

**类型**:
- `feat`: 新功能
- `fix`: 错误修复
- `docs`: 文档更新
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具相关

### 11.3.2 提交示例

```
feat(selector): 添加基于成本的模型选择策略

- 实现 CostBasedStrategy 类
- 添加 costWeight 配置项
- 更新单元测试

Closes #123
```

## 11.4 测试规范

### 11.4.1 测试类型

| 类型 | 位置 | 覆盖率要求 |
|------|------|-----------|
| 单元测试 | `src/{module}/__tests__/` | ≥80% |
| 集成测试 | `test/integration/` | 核心流程 |
| E2E 测试 | `test/e2e/` | 关键路径 |

### 11.4.2 测试框架

系统使用 Jest 作为测试框架：

```javascript
// 示例测试
describe('ModelSelector', () => {
  it('should select model based on capabilities', async () => {
    const selector = new ModelSelector(config);
    const result = await selector.select({
      requiredCapabilities: ['code_generation']
    });
    expect(result).toBeDefined();
    expect(result.cost).toBeLessThan(0.1);
  });
});
```

---

*文档版本: 1.0.0*
*最后更新: 2026-04-22*