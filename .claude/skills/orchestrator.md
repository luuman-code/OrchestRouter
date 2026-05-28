# 编排器 (Orchestrator)

## 用途

将复杂任务分解为多个子任务，选择合适模型并发执行，并整合结果。

**日常使用不需要加载此技能**，只有复杂任务开发时才需要。

---

## 架构

```
Claude Code → 编排器 API → 分解 → 选择模型 → 并发执行 → 整合 → 返回结果
```

### 会话管理模式（多轮交互）
```
首次请求 → 创建会话
后续请求 → 复用状态，增量处理
```

---

## 何时加载

### 需要加载
- 开发完整系统（博客、电商等）
- 多文件项目规划
- 增量功能添加/冲突修复

### 不需要加载
- 解释代码、修复bug、日常对话

---

## API 调用

### 端点
```
POST http://localhost:3458/v1/orchestrate
POST http://localhost:3458/v1/integrate
GET  http://localhost:3458/v1/integrator-status
```

### 请求头
```
X-Session-Id: <session_id>     // 后续请求必填
X-Request-Type: new_task | incremental | maintenance
```

### 输入格式

**结构化格式（推荐）**：
```json
{
  "task": {
    "title": "项目名称",
    "requirement": "需求描述",
    "deliverables": [
      { "description": "功能描述", "type": "ui|api|logic|model", "filePath": "路径" }
    ]
  }
}
```

**自然语言格式**：
```json
{ "messages": [{ "role": "user", "content": "开发一个博客系统..." }] }
```

---

## implementation_plan 模板

```json
{
  "implementation_plan": {
    "tech_stack": ["React", "TypeScript", "Node.js"],
    "conflict_sensitive_groups": [
      { "description": "类型定义", "files": ["shared/types/index.ts"] },
      { "description": "后端路由", "files": ["server/routes/auth.ts", "server/routes/products.ts"] }
    ]
  },
  "task": {
    "title": "项目",
    "requirement": "描述",
    "deliverables": [
      { "description": "类型定义", "filePath": "shared/types/index.ts", "type": "logic" },
      { "description": "后端入口", "filePath": "server/index.ts", "type": "api" }
    ]
  }
}
```

### 关键配置

| 配置项 | 说明 |
|--------|------|
| `type_source` | 共享类型路径，使用 `shared/types`（前后端分离项目） |
| `conflict_sensitive_groups` | types 单独成组，避免混合 |
| `api_config.baseURL` | API 基础路径 |

**规则**：
- types 文件必须单独成组
- 同一文件不能出现在多个组
- 后端文件不能导入 `../../src/types`

---

## 响应格式

```json
{
  "session_id": "abc123",
  "orchestrated": true,
  "subtasks": [...],
  "integration_result": {
    "success": true,
    "files": { "路径": { "content": "..." } }
  }
}
```

---

## 增量请求

### 添加功能
```json
{
  "session_id": "abc123",
  "action": "add",
  "task": { "title": "...", "deliverables": [...] }
}
```

### 修复冲突
```json
{
  "session_id": "abc123",
  "action": "fix",
  "conflicts": [{ "type": "FILE_NAME_CONFLICT", "files": [...] }]
}
```

### 会话管理
```json
{ "session_id": "abc123", "action": "session_management", "sub_action": "extend|heartbeat|close" }
```

---

## 启动编排器

```bash
node C:/Users/LWB/OrchestRouter/src/orchestrator/index.js
curl http://localhost:3458/health
```

---

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| 无响应 | 检查服务状态，重启 |
| 执行失败 | 确保 CCR Router 运行中 |
| 会话过期 | 发送心跳或延长期限 |
| 整合冲突 | 使用冲突修复 API |

---

## 最佳实践

1. **结构化输入**：提供完整的 deliverables 和 type_source
2. **启用会话**：多轮任务启用会话管理
3. **类型共享**：使用 shared/types 而非 src/types
4. **合理分解**：deliverables 保持独立，避免循环依赖

---

*加载此技能后，Agent 可调用编排器 API 进行复杂任务分解*
