# 阻塞字段清单

> 无此字段则流程无法进行

---

## 字段完整性状态

| 标记 | 含义 |
|------|------|
| ❌ **阻塞** | 无此字段则流程无法进行 |
| ⚠️ **警告** | 无此字段将使用默认值，可能影响结果 |
| ✅ **可选** | 无此字段不影响核心流程 |

---

## ❌ 阻塞字段（核心必须）

以下字段为必须字段，缺少将导致流程无法执行：

### task 顶层对象

| 字段路径 | 类型 | 阻塞原因 |
|----------|------|----------|
| `task` | Object | 唯一能单独进入分解器的顶层字段 |
| `task.title` | String | 生成 prompt 中的 `# 标题` 部分 |
| `task.requirement` | String | 生成 prompt 中的 `## Requirement` 部分 |
| `task.deliverables` | Array | 分解器生成 subtask 的数据源，无则无法生成任何 subtask |

### task.deliverables[] 元素

| 字段路径 | 类型 | 阻塞原因 |
|----------|------|----------|
| `task.deliverables[].filePath` | String | 映射为 `integrationHints.targetFile`，无则整合器无法确定输出位置 |
| `task.deliverables[].type` | String | 影响 PromptGenerator 的 `formatDeliverable()` 输出格式 |
| `task.deliverables[].description` | String | 生成 `prompt` 的主要内容，无则生成空 prompt |

---

## ⚠️ 警告字段（可能影响结果）

以下字段缺失时使用默认值，但可能影响结果质量：

### task 对象

| 字段路径 | 类型 | 默认值 | 影响说明 |
|----------|------|--------|----------|
| `task.context` | Object | `{}` | 上下文信息缺失可能导致理解不完整 |
| `task.priority` | String | `'medium'` | 可能影响任务调度顺序 |
| `task.deadline` | String | `null` | ⚠️ 已废弃 - 字段会被解析但从未在后续流程中使用 |
| `task.backgroundInfo` | Object | `{}` | 背景信息缺失可能导致实现偏离预期 |

### task.deliverables[] 元素

| 字段路径 | 类型 | 默认值 | 影响说明 |
|----------|------|--------|----------|
| `task.deliverables[].id` | String | `'deliverable-{index}'` | 自动生成 ID，追踪可能不便 |
| `task.deliverables[].priority` | String | `'medium'` | 可能影响任务调度顺序 |
| `task.deliverables[].pathConfidence` | Number | `0` | 路径置信度缺失可能导致输出位置不准确 |

### implementation_plan 对象

| 字段路径 | 类型 | 默认值 | 影响说明 |
|----------|------|--------|----------|
| `implementation_plan.contract_first` | Boolean | `false` | 不生成 OpenAPI 契约和类型定义 |
| `implementation_plan.enable_merge_strategy` | Boolean | `false` | 每个文件单独生成任务，不合并 |
| `implementation_plan.conflict_sensitive_groups` | Array | `[]` | 无强制合并组，冲突文件可能分别处理 |

### integrationHints

| 字段路径 | 类型 | 默认值 | 影响说明 |
|----------|------|--------|----------|
| `task.deliverables[].integrationHints.dependsOn` | Array | `[]` | 无依赖关系，执行顺序不确定 |
| `task.deliverables[].integrationHints.mergeGroupId` | String | `null` | 无合并组标识，冲突文件无法强制合并 |
| `task.deliverables[].integrationHints.mergeStrategy` | String | `'overwrite'` | 默认覆盖策略，可能丢失原有代码 |
| `task.deliverables[].integrationHints.region` | Object | `null` | 全量更新，无法增量修改 |

---

## ✅ 可选字段（不影响核心流程）

以下字段为纯可选字段，不影响核心流程：

### types 多维度标注

| 字段路径 | 类型 | 说明 |
|----------|------|------|
| `task.deliverables[].types[]` | Array | 多维度类型标注，不影响生成但影响调度 |
| `task.deliverables[].types[].dimension` | String | 维度类型 |
| `task.deliverables[].types[].value` | String | 维度值 |
| `task.deliverables[].types[].weight` | Number | 权重 0-1 |

### dependencies 文件依赖

| 字段路径 | 类型 | 说明 |
|----------|------|------|
| `task.deliverables[].dependencies` | Array | 文件级依赖，影响执行顺序 |

### implementation_plan 指导类字段

| 字段路径 | 类型 | 说明 |
|----------|------|------|
| `implementation_plan.best_practices` | Array | 最佳实践，显示在 Prompt 中 |
| `implementation_plan.considerations` | Array | 注意事项，显示在 Prompt 中 |
| `implementation_plan.design_principles` | Array | 设计原则，显示在 Prompt 中 |

### implementation_plan 约束类字段

| 字段路径 | 类型 | 说明 |
|----------|------|------|
| `implementation_plan.tech_stack` | Array | 技术栈约束 |
| `implementation_plan.architecture_patterns` | Array | 架构模式约束 |
| `implementation_plan.code_standards` | Array | 编码标准约束 |
| `implementation_plan.path_conventions` | Array/Object | 路径约定约束 |
| `implementation_plan.dependency_management` | Array | 依赖管理策略 |
| `implementation_plan.api_conventions` | Object | API 约定 |
| `implementation_plan.shared_modules` | Array | 共享模块约束 |
| `implementation_plan.shared_context` | Object | 共享上下文约束 |

---

## 最小可用请求

```json
{
  "task": {
    "title": "任务标题",
    "requirement": "简要需求描述",
    "deliverables": [
      {
        "filePath": "src/pages/Home.tsx",
        "type": "ui",
        "description": "首页组件"
      }
    ]
  }
}
```

**最少需要 6 个字段：**
- `task` (Object)
- `task.title` (String)
- `task.requirement` (String)
- `task.deliverables` (Array)
- `task.deliverables[0].filePath` (String)
- `task.deliverables[0].type` (String)
- `task.deliverables[0].description` (String)
