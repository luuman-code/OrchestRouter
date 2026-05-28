# 字段参考文档

本文档包含请求文件中所有字段的完整说明，按用途分类。

---

## 目录

- [🔴 流程字段（阻塞）](#流程字段阻塞)
- [🟡 控制字段（激活机制）](#控制字段激活机制)
- [🟢 可选字段（使用默认值）](#可选字段使用默认值)
- [📤 Subtask 输出字段](#subtask-输出字段)
- [❌ 已移除的无效字段](#已移除的无效字段)

---

## 🔴 流程字段（阻塞）

> 无此字段则流程无法进行。这些字段是编排器正常运行的必要条件。

### task 对象

| 字段 | 类型 | 说明 | 流程作用 |
|------|------|------|----------|
| `task` | Object | 唯一能单独进入分解器的顶层字段 | 流程入口 |
| `task.title` | String | 任务标题 | 生成 prompt 中的 `# 标题` 部分 |
| `task.requirement` | String | 简要需求描述 | 生成 prompt 中的 `## Requirement` 部分 |
| `task.deliverables` | Array | 交付物列表 | 分解器生成 subtask 的数据源 |

### task.deliverables[] 元素

| 字段 | 类型 | 说明 | 流程作用 |
|------|------|------|----------|
| `filePath` | String | 文件路径 | 映射为 `integrationHints.targetFile`，整合器需要此字段确定输出位置 |
| `type` | String | 交付物类型 | 影响 PromptGenerator 的 `formatDeliverable()` 输出格式 |
| `description` | String | 描述 | 生成 `prompt` 的主要内容 |

---

## 🟡 控制字段（激活机制）

> 有此字段会激活编排器中的特定机制，控制内容是否注入到 prompt 或影响处理流程。

### implementation_plan 对象

#### 契约与合并控制

| 字段 | 类型 | 说明 | 激活机制 |
|------|------|------|----------|
| `contract_first` | Boolean | 启用契约优先模式 | `_generateContract()` 生成 OpenAPI 契约和类型定义 |
| `enable_merge_strategy` | Boolean | 启用文件合并策略 | `mergeConflictSensitiveGroups()` 启用合并 |
| `conflict_sensitive_groups` | Array | 冲突敏感文件组 | 指定必须合并的文件组 |

#### Prompt 约束注入（通过 `_extractConstraintsFromPlan`）

| 字段 | 类型 | 说明 | 注入到 |
|------|------|------|----------|
| `tech_stack` | Array | 技术栈列表 | constraints |
| `architecture_patterns` | Array | 架构模式约束 | constraints |
| `code_standards` | Array | 编码标准 | constraints |
| `path_conventions` | Array/Object | 路径约定 | constraints |
| `dependency_management` | Array | 依赖管理策略 | constraints |
| `api_conventions` | Object | API 约定 | constraints |
| `shared_modules` | Array | 共享模块约束 | constraints |
| `shared_context` | Object | 共享上下文约束 | constraints |

#### Prompt 指导注入（通过 `_extractGuidelinesFromPlan`）

| 字段 | 类型 | 说明 | 注入到 |
|------|------|------|----------|
| `best_practices` | Array | 最佳实践 | guidelines |
| `considerations` | Array | 注意事项 | guidelines |
| `design_principles` | Array | 设计原则 | guidelines |

#### 契约生成专用（用于 ContractGenerator）

| 字段 | 类型 | 说明 | 使用位置 |
|------|------|------|----------|
| `title` | String | API 契约标题 | `ContractGenerator.defaultTitle` |
| `version` | String | API 契约版本 | `ContractGenerator.defaultVersion` |
| `api_base_url` | String | API 基础 URL | `ContractGenerator.servers` + mock options |
| `real_api_module` | String | 真实 API 模块路径 | mock options |

### task.deliverables[].types[]（多维度类型系统）

| 字段 | 类型 | 说明 | 激活机制 |
|------|------|------|----------|
| `dimension` | String | 维度类型 | TypeAnnotator 的多维度分析 |
| `value` | String | 维度值 | 影响任务调度和模型选择 |
| `weight` | Number | 权重 (0-1) | 影响类型标注置信度 |

**dimension 可选值：**
- `'category'` - 类别 (frontend, backend, infrastructure, security, quality, general)
- `'complexity'` - 复杂度 (low, medium, high)
- `'priority'` - 优先级 (0, 1, 2, 3, 4, 5)
- `'quality'` - 质量 (low, medium, high)
- `'cost'` - 成本 (low, medium, high)

### task.deliverables[].integrationHints（传递给整合器）

| 字段 | 类型 | 说明 | 激活机制 |
|------|------|------|----------|
| `dependsOn` | Array | 依赖的任务 ID | `DependencyGraph.buildEdges()` 构建依赖图 |
| `mergeGroupId` | String | 合并组 ID | `ComprehensiveConflictResolver` 强制同组合并 |
| `mergeStrategy` | String | 合并策略 | `FileOrganizer` 选择合并策略 |
| `region` | Object | 区域更新规格 | `RegionSpecProcessor` 区域更新 |
| `targetFiles` | Array | 目标文件列表 | 替代 targetFile 处理多文件输出 |

### task.deliverables[].dependencies（文件级依赖）

| 字段 | 类型 | 说明 | 激活机制 |
|------|------|------|----------|
| `dependencies` | Array | 依赖的文件路径 | `DependencyGraph` 构建文件依赖关系 |

---

## 🟢 可选字段（使用默认值）

> 无此字段使用默认值，不影响核心流程

### task 对象

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `context` | Object | `{}` | 上下文信息（用于 sessionId 追踪） |
| `priority` | String | `'medium'` | 任务优先级（影响 ConflictResolver 和调度） |
| `backgroundInfo` | Object | `{}` | 背景信息容器（传递给分解器） |

### task.deliverables[] 元素

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | String | `'deliverable-{index}'` | 自动生成唯一标识 |
| `priority` | String | `'medium'` | 交付物优先级 |
| `pathConfidence` | Number | `0` | 路径置信度 |

---

## 📤 Subtask 输出字段

> 分解器输出，Agent 不直接填写，由系统自动生成

| 字段 | 类型 | 说明 | 生成方式 |
|------|------|------|----------|
| `id` | String | 唯一标识 | 分解器自动生成 |
| `prompt` | String | 执行内容 | PromptGenerator.buildPrompt() |
| `systemPrompt` | String | 系统提示 | PromptGenerator 生成 |
| `integrationHints` | Object | 整合提示 | buildIntegrationHints() 从 deliverable 映射 |
| `tools` | Array | 可用工具列表 | PromptGenerator.CODE_GENERATION_TOOLS |
| `types` | Array | 多维度类型标注 | TypeAnnotator.annotateMultiple() 添加 |

---

## ❌ 已移除的无效字段

以下字段在代码中未使用，已从文档中移除：

| 字段 | 原因 |
|------|------|
| `task.deadline` | 被 TaskParser 解析但从未在后续流程中使用 |
| `shared_context.api_endpoints` | 文档中提及但代码中未使用 |
| `shared_context.import_rules` | 文档中提及但代码中未使用 |

---

## 字段流转验证路径

```
请求文件
    ↓
_extractUserMessage() → TaskParser.parseFromObject()
    ↓
parsedTask { title, requirement, deliverables[], context, backgroundInfo }
    ↓
ElasticDecomposer.decompose()
    ↓
annotateTypes() → types[] 添加
    ↓
groupSemantically() → 分组
    ↓
mergeConflictSensitiveGroups() → 基于 conflict_sensitive_groups 合并
    ↓
generatePrompts() → subtask { id, type, prompt, integrationHints }
    ↓
ConcurrentExecutor.execute()
    ↓
Integrator.integrate() → result.files
```

---

## 激活机制速查表

| 字段 | 激活机制 | 位置 |
|------|----------|------|
| `implementation_plan.contract_first` | `_generateContract()` 生成 OpenAPI 契约和类型定义 | OrchestratorServer.js |
| `implementation_plan.enable_merge_strategy` | `mergeConflictSensitiveGroups()` 启用合并策略 | decomposer/index.js |
| `implementation_plan.conflict_sensitive_groups` | 指定必须合并的文件组 | decomposer/index.js |
| `implementation_plan.best_practices` | `_extractGuidelinesFromPlan()` 注入到 guidelines | OrchestratorServer.js |
| `implementation_plan.tech_stack` | `_extractConstraintsFromPlan()` 注入到 constraints | OrchestratorServer.js |
| `deliverable.types[].dimension` | `TypeAnnotator.annotateMultiple()` 多维度分析 | decomposer/types/TypeAnnotator.js |
| `deliverable.integrationHints.dependsOn` | `DependencyGraph.buildEdges()` 构建依赖图 | integrator/DependencyGraph.js |
| `deliverable.integrationHints.mergeGroupId` | `ComprehensiveConflictResolver` 强制同组合并 | ConflictResolver.js |
| `deliverable.integrationHints.region` | `RegionSpecProcessor` 区域更新处理 | integrator/RegionSpecProcessor.js |

---

## shared_context 字段使用说明

`shared_context` 是一个嵌套对象，其各字段的用途：

| 字段 | 类型 | 用途 | 状态 |
|------|------|------|------|
| `type_source` | String | 类型定义文件路径 | ✅ 已使用 |
| `api_config.baseURL` | String | API 基础 URL | ✅ 已使用 |
| `api_config.port` | Number | API 端口 | ✅ 已使用 |
| `api_endpoints` | Array | API 端点定义 | ❌ 未使用 |
| `import_rules` | Array | 导入规则 | ❌ 未使用 |
| `file_naming.forbidden_files` | Array | 禁止的文件名 | ✅ 部分使用 |

**推荐**：如果 `api_endpoints` 和 `import_rules` 不被代码使用，应从请求文件中移除或标记为已废弃。
