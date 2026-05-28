# 搭积木式模板构建指南

> 如何根据用户需求选择字段，像搭积木一样组合请求文件

---

## 核心理念

请求文件采用"搭积木"方式构建：
- **最小模板**：只需核心必须字段（task 对象）
- **按需添加**：根据需求激活特定机制
- **字段组合**：相似需求有推荐组合
- **契约优先**：⚠️ **【重要】当任务涉及多个有依赖/冲突风险的代码文件时，必须添加 `contract_first: true`**，这样才能通过预先生成契约和类型定义，使后续生成的代码之间的冲突依赖问题最小化

---

## 积木层级

```
┌─────────────────────────────────────────────────────────┐
│                    请求文件                              │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │  task (阻塞 - 核心必须)                           │   │
│  │  ├── title                                       │   │
│  │  ├── requirement                                 │   │
│  │  └── deliverables[]                              │   │
│  │      ├── filePath                                │   │
│  │      ├── type                                    │   │
│  │      └── description                             │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  implementation_plan (激活机制)                   │   │
│  │  ├── tech_stack                                  │   │
│  │  ├── contract_first                              │   │
│  │  ├── enable_merge_strategy                       │   │
│  │  ├── conflict_sensitive_groups                   │   │
│  │  └── ...                                         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  task.deliverables[].types[] (多维度标注)         │   │
│  │  ┌─────────────────────────────────────────┐    │   │
│  │  │ dimension: "category" | "complexity"    │    │   │
│  │  │ value: "frontend" | "backend" | ...     │    │   │
│  │  │ weight: 0-1                             │    │   │
│  │  └─────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  task.deliverables[].integrationHints (整合)     │   │
│  │  ├── dependsOn                                   │   │
│  │  ├── mergeGroupId                                │   │
│  │  └── region                                      │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 场景化字段组合

### 场景 1：简单 UI 组件

**需求**：创建一个简单的 React 组件

```json
{
  "task": {
    "title": "创建按钮组件",
    "requirement": "实现一个可复用的按钮组件，支持 primary/secondary 两种样式",
    "deliverables": [
      {
        "filePath": "src/components/Button.tsx",
        "type": "ui",
        "description": "按钮组件，支持 primary 和 secondary 两种样式"
      }
    ]
  },
  "implementation_plan": {
    "tech_stack": ["React", "TypeScript"],
    "contract_first": true
  }
}
```

**所需积木**：
- `task` + `task.title` + `task.requirement` + `task.deliverables[]`
- `implementation_plan.contract_first` ⚠️ **多个组件可能共享类型或接口，添加后可减少冲突**

---

### 场景 2：API 后端服务（需要契约）

**需求**：创建带 OpenAPI 契约的 API 服务

```json
{
  "task": {
    "title": "用户管理 API",
    "requirement": "实现用户 CRUD API，包含用户注册、登录、信息查询接口",
    "deliverables": [
      {
        "filePath": "src/api/users.ts",
        "type": "api",
        "description": "用户 API 路由处理"
      },
      {
        "filePath": "src/api/schemas.ts",
        "type": "types",
        "description": "API 请求/响应类型定义"
      }
    ]
  },
  "implementation_plan": {
    "tech_stack": ["Express", "TypeScript"],
    "contract_first": true
  }
}
```

**所需积木**：
- `task` (核心)
- `implementation_plan.contract_first` (激活契约生成)

---

### 场景 3：多文件协同（需要合并策略）

**需求**：创建一组相关文件，需要合并生成以保持一致性

```json
{
  "task": {
    "title": "表单组件套件",
    "requirement": "实现一套表单组件，包括 Input、Select、DatePicker，这些组件需要共享类型定义",
    "deliverables": [
      {
        "filePath": "src/components/form/Input.tsx",
        "type": "ui",
        "description": "输入框组件"
      },
      {
        "filePath": "src/components/form/Select.tsx",
        "type": "ui",
        "description": "选择组件"
      },
      {
        "filePath": "src/components/form/DatePicker.tsx",
        "type": "ui",
        "description": "日期选择组件"
      },
      {
        "filePath": "src/components/form/types.ts",
        "type": "types",
        "description": "表单组件共享类型"
      }
    ]
  },
  "implementation_plan": {
    "tech_stack": ["React", "TypeScript"],
    "contract_first": true,
    "enable_merge_strategy": true,
    "conflict_sensitive_groups": ["form-components"],
    "shared_modules": ["src/components/form"]
  }
}
```

**所需积木**：
- `task` (核心)
- `implementation_plan.contract_first` ⚠️ **多文件有共享类型，添加后可统一类型定义**
- `implementation_plan.enable_merge_strategy` (激活合并)
- `implementation_plan.conflict_sensitive_groups` (指定合并组)
- `implementation_plan.shared_modules` (共享模块约束)

---

### 场景 4：复杂多层次系统

**需求**：大型项目，需要明确的依赖关系和执行顺序

```json
{
  "task": {
    "title": "电商后端系统",
    "requirement": "实现电商后端系统，包含用户、商品、订单、支付模块",
    "priority": "critical",
    "deliverables": [
      {
        "id": "deliverable-user",
        "filePath": "src/modules/user/model.ts",
        "type": "backend",
        "description": "用户数据模型",
        "priority": "high"
      },
      {
        "id": "deliverable-product",
        "filePath": "src/modules/product/model.ts",
        "type": "backend",
        "description": "商品数据模型",
        "dependencies": ["src/modules/user/model.ts"]
      },
      {
        "id": "deliverable-order",
        "filePath": "src/modules/order/service.ts",
        "type": "backend",
        "description": "订单服务",
        "dependencies": ["src/modules/user/model.ts", "src/modules/product/model.ts"]
      }
    ]
  },
  "implementation_plan": {
    "tech_stack": ["Node.js", "TypeScript", "PostgreSQL"],
    "contract_first": true,
    "architecture_patterns": ["DDD", "CQRS"],
    "best_practices": ["事务一致性", "幂等性设计"]
  }
}
```

**所需积木**：
- `task` (核心)
- `task.priority` (任务优先级)
- `task.deliverables[].id` (显式 ID)
- `task.deliverables[].dependencies` (文件依赖)
- `implementation_plan.contract_first` ⚠️ **多模块有依赖关系，添加后可统一类型定义**
- `implementation_plan.architecture_patterns` (架构约束)
- `implementation_plan.best_practices` (最佳实践)

---

### 场景 5：多维度分类任务

**需求**：需要根据不同维度分析任务以优化调度

```json
{
  "task": {
    "title": "首页性能优化",
    "requirement": "优化首页加载性能，包括代码分割、懒加载、图片优化",
    "deliverables": [
      {
        "filePath": "src/pages/Home.tsx",
        "type": "ui",
        "description": "首页组件重构",
        "types": [
          { "dimension": "category", "value": "frontend", "weight": 0.9 },
          { "dimension": "complexity", "value": "high", "weight": 0.8 },
          { "dimension": "priority", "value": "critical", "weight": 0.9 }
        ]
      }
    ]
  },
  "implementation_plan": {
    "tech_stack": ["React", "TypeScript"],
    "contract_first": true
  }
}
```

**所需积木**：
- `task` (核心)
- `task.deliverables[].types[]` (多维度标注)
- `implementation_plan.contract_first` ⚠️ **优化任务可能涉及多文件依赖，添加后可减少冲突**

---

## 字段选择决策树

```
用户需求
  │
  ├─ ⚠️ 任务是否涉及多个有依赖/冲突风险的代码文件？
  │    ├─ 同时生成前端和后端代码文件 → 【必须】添加 contract_first: true
  │    ├─ 多个文件共享类型或接口 → 【必须】添加 contract_first: true
  │    ├─ 文件之间有明确的依赖关系 → 【必须】添加 contract_first: true
  │    └─ 单个独立文件，无依赖关系 → 可省略
  │
  ├─ 是否有多个相关文件需要合并？
  │    ├─ 是 → 添加 implementation_plan.enable_merge_strategy: true
  │    │         添加 implementation_plan.conflict_sensitive_groups: [...]
  │    └─ 否
  │
  ├─ 是否有明确的依赖关系？
  │    ├─ 是 → 在 deliverables[].dependencies 添加依赖
  │    └─ 否
  │
  ├─ 是否需要多维度分类？
  │    ├─ 是 → 在 deliverables[].types 添加维度标注
  │    └─ 否
  │
  └─ 是否有技术栈/架构约束？
       ├─ 是 → 添加 implementation_plan.tech_stack: [...]
       │         添加 implementation_plan.architecture_patterns: [...]
       └─ 否
```

> ⚠️ **判断标准**：只要任务涉及多个代码文件，且这些文件之间**存在依赖关系或潜在冲突风险**，就必须添加 `contract_first: true`。

---

## 常见字段组合速查

| 场景 | 必需字段 | 必须添加 |
|------|----------|----------|
| ⚠️ 前后端多文件 | task + deliverables | `contract_first: true` |
| ⚠️ API 服务 | task + deliverables | `contract_first: true` |
| ⚠️ 多文件协同 | task + deliverables | `contract_first: true` + 合并策略 |
| ⚠️ 大型项目 | task + deliverables | `contract_first: true` + 所有字段 |
| ⚠️ 多文件依赖 | task + deliverables | `contract_first: true` |
| 单个独立文件 | task + deliverables | 可省略 |

> ⚠️ **判断标准**：只要任务涉及**多个代码文件且存在依赖/冲突风险**，就必须添加 `contract_first: true`。

---

## 最小模板 vs 完整模板

### 最小模板 (多文件依赖场景)

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
  },
  "implementation_plan": {
    "tech_stack": ["React", "TypeScript"],
    "contract_first": true
  }
}
```

> ⚠️ **当多文件有依赖/冲突风险时必须添加 `contract_first: true`**，这样才能使类型定义统一，减少后续代码冲突。

### 完整模板 (所有可选字段)

参见 `optional-fields.md` 中的完整示例

---

## 最佳实践

1. **【强制】多文件依赖/冲突风险必须添加 `contract_first: true`**：当任务涉及多个代码文件且存在依赖关系或冲突风险时，必须添加 `contract_first: true`，这样才能通过预先生成契约和类型定义，使后续生成的代码之间的冲突依赖问题最小化
2. **从最小模板开始**：先确保核心流程能运行
3. **按需添加字段**：只在需要激活特定机制时添加字段
4. **使用清晰的文件路径**：filePath 应包含完整路径
5. **提供准确的描述**：description 是生成 prompt 的主要内容
6. **显式指定 ID**：复杂项目中便于追踪依赖关系
7. **合理设置优先级**：影响任务调度顺序
8. **类型定义优先**：通过 `contract_first: true` 启用契约优先模式，让类型定义先于实现生成
