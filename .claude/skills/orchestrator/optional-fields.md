# 可选字段清单

> 无此字段使用默认值，不影响核心流程

---

## 可选字段分类

### 📋 task 对象可选字段

| 字段路径 | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `task.context` | Object | `{}` | 上下文信息容器（用于 sessionId 追踪） |
| `task.priority` | String | `'medium'` | 任务优先级，可选值：`'low'`, `'medium'`, `'high'`, `'critical'` |
| `task.backgroundInfo` | Object | `{}` | 背景信息容器，包含项目背景、历史决策等 |

**注意**：`task.deadline` 字段已被移除 - 虽然会被解析但从未在后续流程中使用

---

### 📋 task.deliverables[] 元素可选字段

| 字段路径 | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `task.deliverables[].id` | String | `'deliverable-{index}'` | 唯一标识符，用于追踪和依赖引用 |
| `task.deliverables[].priority` | String | `'medium'` | 交付物优先级，可选值：`'low'`, `'medium'`, `'high'`, `'critical'` |
| `task.deliverables[].pathConfidence` | Number | `0` | 路径置信度 (0-1)，表示 filePath 的准确程度 |
| `task.deliverables[].integrationHints` | Object | `null` | 整合提示，传递给整合器的额外指令 |

---

### 📋 task.deliverables[].integrationHints 可选字段

| 字段路径 | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `task.deliverables[].integrationHints.targetFiles` | Array | `null` | 多文件输出时使用，替代 targetFile |
| `task.deliverables[].integrationHints.mergeStrategy` | String | `'overwrite'` | 合并策略，可选值：`'overwrite'`, `'append'`, `'merge'` |
| `task.deliverables[].integrationHints.region` | Object | `null` | 区域更新规格，用于增量修改特定代码区域 |

---

### 📋 task.deliverables[].types[] 可选字段

| 字段路径 | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `task.deliverables[].types` | Array | `[]` | 多维度类型标注数组 |
| `task.deliverables[].types[].dimension` | String | - | 维度类型：`'category'`, `'complexity'`, `'priority'`, `'quality'`, `'cost'` |
| `task.deliverables[].types[].value` | String | - | 维度值，如 `'frontend'`, `'medium'`, `'high'` |
| `task.deliverables[].types[].weight` | Number | `0.5` | 权重 (0-1)，影响类型标注置信度 |

---

### 📋 task.deliverables[].dependencies 可选字段

| 字段路径 | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `task.deliverables[].dependencies` | Array | `[]` | 文件级依赖，指定此文件依赖的其他文件 |

---

### 📋 implementation_plan 可选字段

#### 契约与合并策略

| 字段路径 | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `implementation_plan.contract_first` | Boolean | `false` | 启用契约优先模式，先生成 OpenAPI 契约和类型定义 |
| `implementation_plan.enable_merge_strategy` | Boolean | `false` | 启用文件合并策略，多个相关文件合并生成 |
| `implementation_plan.conflict_sensitive_groups` | Array | `[]` | 冲突敏感文件组，指定必须合并的文件组 |

#### 约束类字段

| 字段路径 | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `implementation_plan.tech_stack` | Array | `[]` | 技术栈列表，如 `['React', 'TypeScript', 'Tailwind']` |
| `implementation_plan.architecture_patterns` | Array | `[]` | 架构模式，如 `['Microfrontend', 'Monorepo']` |
| `implementation_plan.code_standards` | Array | `[]` | 编码标准，如 `['Airbnb JavaScript Style']` |
| `implementation_plan.path_conventions` | Array/Object | `[]` | 路径约定规范 |
| `implementation_plan.dependency_management` | Array | `[]` | 依赖管理策略 |
| `implementation_plan.api_conventions` | Object | `{}` | API 约定规范 |
| `implementation_plan.shared_modules` | Array | `[]` | 共享模块列表 |
| `implementation_plan.shared_context` | Object | `{}` | 共享上下文约束（见下方子字段说明） |

**`shared_context` 子字段状态：**

| 子字段 | 状态 | 说明 |
|--------|------|------|
| `type_source` | ✅ 使用中 | 类型定义文件路径 |
| `api_config.baseURL` | ✅ 使用中 | API 基础 URL |
| `api_config.port` | ✅ 使用中 | API 端口 |
| `api_endpoints` | ❌ 已废弃 | 代码中未使用 |
| `import_rules` | ❌ 已废弃 | 代码中未使用 |
| `file_naming.forbidden_files` | ✅ 部分使用 | 禁止的文件名列表 |

#### 指导类字段

| 字段路径 | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `implementation_plan.best_practices` | Array | `[]` | 最佳实践列表，显示在生成 Prompt 中 |
| `implementation_plan.considerations` | Array | `[]` | 注意事项列表 |
| `implementation_plan.design_principles` | Array | `[]` | 设计原则列表 |

---

## integrationHints 完整字段表

| 字段路径 | 类型 | 默认值 | 说明 | 激活机制 |
|----------|------|--------|------|----------|
| `dependsOn` | Array | `[]` | 依赖的任务 ID 列表 | DependencyGraph.buildEdges() 构建依赖图 |
| `mergeGroupId` | String | `null` | 合并组 ID | ComprehensiveConflictResolver 强制同组合并 |
| `targetFiles` | Array | `null` | 多文件输出目标 | 替代 targetFile 处理多文件 |
| `mergeStrategy` | String | `'overwrite'` | 合并策略 | FileOrganizer 选择合并策略 |
| `region` | Object | `null` | 区域更新规格 | RegionSpecProcessor 区域更新处理 |

---

## 完整请求示例（包含所有可选字段）

```json
{
  "task": {
    "title": "任务标题",
    "requirement": "简要需求描述",
    "context": {
      "projectName": "示例项目",
      "env": "production"
    },
    "priority": "high",
    "deadline": "2024-12-31T23:59:59Z",
    "backgroundInfo": {
      "history": "项目历史背景",
      "decisions": ["之前的决策1", "之前的决策2"]
    },
    "deliverables": [
      {
        "id": "deliverable-1",
        "filePath": "src/pages/Home.tsx",
        "type": "ui",
        "description": "首页组件",
        "priority": "high",
        "pathConfidence": 0.9,
        "types": [
          { "dimension": "category", "value": "frontend", "weight": 0.8 },
          { "dimension": "complexity", "value": "medium", "weight": 0.7 }
        ],
        "dependencies": ["src/components/Button.tsx"],
        "integrationHints": {
          "dependsOn": [],
          "mergeGroupId": "ui-components",
          "mergeStrategy": "append"
        }
      }
    ]
  },
  "implementation_plan": {
    "tech_stack": ["React", "TypeScript", "Tailwind"],
    "contract_first": true,
    "enable_merge_strategy": true,
    "conflict_sensitive_groups": ["shared-utils"],
    "architecture_patterns": ["Microfrontend"],
    "best_practices": ["使用函数式组件", "遵循SOLID原则"],
    "code_standards": ["Airbnb JavaScript Style"],
    "path_conventions": {
      "components": "src/components/{name}/{name}.tsx",
      "pages": "src/pages/{name}/{name}.tsx"
    },
    "shared_modules": ["src/utils", "src/hooks"],
    "considerations": ["性能优化", "可访问性"],
    "design_principles": ["DRY", "KISS"]
  }
}
```
