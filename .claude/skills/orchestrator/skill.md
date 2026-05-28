---
name: orchestrator
description: 编排器请求文件编写指南，用于生成符合要求的请求 JSON
---

# 编排器请求文件编写指南

## 目标

创建稳定、符合要求的请求 JSON 文件，供编排器执行。

---

## 编排器服务管理

### 服务地址
- **代码目录**: `C:\Users\LWB\OrchestRouter`
- **API 地址**: `http://127.0.0.1:3458`
- **UI 地址**: `http://localhost:5173`

### 编排器服务

**启动编排器：**
```bash
node C:\Users\LWB\OrchestRouter\start-orchestrator.js
```

**关闭编排器：**
```bash
C:\Users\LWB\OrchestRouter\stop-orchestrator.bat
```

### UI 服务器

**启动 UI：**
```bash
C:\Users\LWB\OrchestRouter\start-ui.bat
```

**关闭 UI：**
```bash
C:\Users\LWB\OrchestRouter\stop-ui.bat
```

### 同时启动所有服务
```bash
C:\Users\LWB\OrchestRouter\start-ui.bat
node C:\Users\LWB\OrchestRouter\start-orchestrator.js
```

### 发送编排请求（工具调用格式）
```bash
curl -s -X POST http://127.0.0.1:3458/v1/orchestrate-tool-calls \
  -H "Content-Type: application/json" \
  -d @"请求文件路径.json" \
  --max-time 600 \
  -o 输出文件路径.json
```

**注意**: 必须使用 `/v1/orchestrate-tool-calls` 端点获取 `tool_calls` 格式的响应，该响应可直接用于文件创建。

### 健康检查
```bash
curl -s http://127.0.0.1:3458/health
```

---

## 请求文件结构（简化版）

```json
{
  "implementation_plan": {
    "tech_stack": ["React", "TypeScript", "Node.js"],
    "contract_first": true
  },
  "task": {
    "title": "任务标题",
    "requirement": "简要需求（1-2句话）"
  },
  "task_details": {
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

---

## 【重要】默认单文件任务模式

**编排器默认行为：每个文件单独生成一个子任务（禁用合并策略）**

这意味着：
- 每个文件由一个独立的模型实例生成
- 不再需要 `conflict_sensitive_groups` 配置
- 并行生成多个文件，效率更高
- 类型和契约通过 `contract_first` 模式按需注入

### 启用合并策略（可选）

如果需要将多个文件合并到一个任务中生成（仅在有特殊需求时），添加：

```json
{
  "implementation_plan": {
    "tech_stack": ["React", "TypeScript", "Node.js"],
    "contract_first": true,
    "enable_merge_strategy": true,
    "conflict_sensitive_groups": [...]
  }
}
```

---

## implementation_plan 字段说明

| 字段 | 说明 | 必填 | 说明 |
|------|------|------|------|
| `tech_stack` | 技术栈列表 | ✅ | 如 ["React", "TypeScript", "Node.js"] |
| `contract_first` | 启用契约优先模式 | 推荐 | 启用后自动生成 OpenAPI 契约和类型定义，类型按需注入到各文件 |
| `enable_merge_strategy` | 启用合并策略 | 否 | 默认 `false`，每个文件单独生成任务；设为 `true` 时启用合并（需要 `conflict_sensitive_groups`） |

---

## task 字段说明

| 字段 | 说明 | 必填 |
|------|------|------|
| `title` | 任务标题 | ✅ |
| `requirement` | 简要需求（1-2句话） | ✅ |
| `task_details.deliverables` | 交付物列表 | ✅ |

### deliverables 字段

```json
{
  "filePath": "src/pages/Home.tsx",
  "types": [
    { "dimension": "category", "value": "frontend", "weight": 0.9 },
    { "dimension": "complexity", "value": "medium", "weight": 0.7 }
  ],
  "description": "首页组件"
}
```

### 多维度任务类型格式（types 数组）

**旧格式（已废弃）：**
```json
{ "type": "ui" }
```

**新格式（推荐）：**
```json
{
  "types": [
    { "dimension": "category", "value": "frontend", "weight": 0.9 },
    { "dimension": "complexity", "value": "medium", "weight": 0.7 }
  ],
  "description": "可选描述"
}
```

**5 个维度说明：**

| 维度 | 可选值 | 说明 |
|------|--------|------|
| `category` | frontend, backend, infrastructure, security, quality, general | 任务分类 |
| `complexity` | low, medium, high | 任务复杂度 |
| `priority` | 0, 1, 2, 3, 4, 5 | 优先级（0最高，5最低） |
| `quality` | low, medium, high | 质量要求 |
| `cost` | low, medium, high | 资源成本 |

**类型映射参考：**
- `"type": "ui"` → `{ "dimension": "category", "value": "frontend", "weight": 0.9 }`
- `"type": "api"` → `{ "dimension": "category", "value": "backend", "weight": 0.9 }`
- `"type": "logic"` → `{ "dimension": "category", "value": "general", "weight": 0.7 }`

---

## 契约优先模式（contract_first: true）

启用后自动执行以下流程：

```
1. 架构师模型生成 OpenAPI 契约 → contracts/api.txt
2. 生成 TypeScript 类型定义 → types/index.ts
3. 类型定义按需注入到各文件的执行 prompt
4. 最终响应包含这两个文件作为工具调用
```

**优势**：
- 类型定义由架构师模型统一生成，避免不一致
- 执行模型直接引用预生成的类型
- 按需注入：每个文件只注入其需要的类型/契约内容
- 减少 token 消耗

---

## 简化模板（推荐）

创建请求文件时，推荐使用简化模板：

```json
{
  "implementation_plan": {
    "tech_stack": ["React", "TypeScript", "Node.js", "Express", "SQLite"],
    "contract_first": true
  },
  "task": {
    "title": "电商平台",
    "requirement": "开发一个包含用户认证、商品展示、购物车、订单管理的电商平台"
  },
  "task_details": {
    "deliverables": [
      { "filePath": "server/index.ts", "type": "logic", "description": "后端入口" },
      { "filePath": "server/routes/auth.ts", "type": "api", "description": "认证路由" },
      { "filePath": "src/App.tsx", "type": "ui", "description": "React根组件" }
    ]
  }
}
```

---

## 快速检查清单

创建请求文件后，逐项检查：

- [ ] `tech_stack` 非空数组
- [ ] `contract_first: true`（推荐）
- [ ] `deliverables` 非空且每个元素有 `filePath`、`type`、`description`
- [ ] 如需启用合并策略，再添加 `enable_merge_strategy: true` 和 `conflict_sensitive_groups`

---

## 参考文件

| 文件 | 说明 |
|------|------|
| `references/request-template-simple.json` | **【推荐】简化模板 - 默认单文件任务** |
| `references/request-template.json` | 完整模板 - 支持合并策略 |
| `references/full-request.json` | 完整电商系统示例 |
| `references/field-checklist.json` | 详细校验规则 |
| `references/conflict-groups.json` | 分组规范详细说明（仅合并策略时需要） |

---

## 常见问题

| 场景 | 说明 |
|------|------|
| 默认行为 | 每个文件单独生成一个子任务 |
| 启用合并策略 | 设置 `enable_merge_strategy: true`，需要 `conflict_sensitive_groups` |
| 类型注入 | 通过 `contract_first: true` 启用，类型按需注入到各文件 |
