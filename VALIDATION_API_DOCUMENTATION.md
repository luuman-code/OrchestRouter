# 代码验证 API 端点文档

## 概述

编排器服务器现在支持代码编译和运行验证功能，通过以下 API 端点提供：

**基础 URL**: `http://localhost:3458`

---

## API 端点

### 1. 综合代码验证

**端点**: `POST /v1/validation/validate`

**描述**: 使用所有可用的验证器（ESLint、TypeScript 编译器、运行时验证）对代码进行全面验证。

**请求体**:
```json
{
  "code": "function greet(name) { return 'Hello, ' + name; }",
  "filename": "test.js",
  "type": "javascript"
}
```

**响应示例**:
```json
{
  "success": true,
  "validationResults": {
    "summary": {
      "totalValidators": 3,
      "successfulValidators": 3,
      "failedValidators": 0,
      "errorCount": 0,
      "warningCount": 0
    }
  },
  "feedback": { ... },
  "timestamp": "2026-04-07T12:00:00.000Z"
}
```

---

### 2. ESLint 验证

**端点**: `POST /v1/validation/eslint`

**描述**: 仅使用 ESLint 进行代码规范检查。

**请求体**:
```json
{
  "code": "const x = 1;",
  "filename": "test.js"
}
```

**响应示例**:
```json
{
  "success": true,
  "result": {
    "errors": [],
    "warnings": [],
    "violations": []
  },
  "timestamp": "2026-04-07T12:00:00.000Z"
}
```

---

### 3. TypeScript 编译验证

**端点**: `POST /v1/validation/typescript`

**描述**: 仅使用 TypeScript 编译器进行语法和类型检查。

**请求体**:
```json
{
  "code": "interface Person { name: string; }",
  "filename": "test.ts"
}
```

**响应示例**:
```json
{
  "success": true,
  "result": {
    "errors": [],
    "warnings": [],
    "violations": []
  },
  "timestamp": "2026-04-07T12:00:00.000Z"
}
```

---

### 4. 运行时验证

**端点**: `POST /v1/validation/runtime`

**描述**: 在沙盒环境中运行代码，捕获运行时错误。

**请求体**:
```json
{
  "code": "console.log('Hello, World!');",
  "filename": "test.js",
  "type": "javascript"
}
```

**响应示例**:
```json
{
  "success": true,
  "result": {
    "executionTime": 10,
    "result": null
  },
  "timestamp": "2026-04-07T12:00:00.000Z"
}
```

---

### 5. 验证器状态

**端点**: `GET /v1/validation/status`

**描述**: 获取验证器的当前状态和配置信息。

**响应示例**:
```json
{
  "enabledValidators": ["eslint", "typescript", "runtime"],
  "availableValidators": ["eslint", "typescript", "runtime"],
  "coordinatorReady": true,
  "timestamp": "2026-04-07T12:00:00.000Z"
}
```

---

## 使用示例

### 使用 curl 测试

```bash
# 综合验证
curl -X POST http://localhost:3458/v1/validation/validate \
  -H "Content-Type: application/json" \
  -d '{"code": "function test() { return 1; }", "filename": "test.js"}'

# ESLint 验证
curl -X POST http://localhost:3458/v1/validation/eslint \
  -H "Content-Type: application/json" \
  -d '{"code": "const x = 1;", "filename": "test.js"}'

# TypeScript 验证
curl -X POST http://localhost:3458/v1/validation/typescript \
  -H "Content-Type: application/json" \
  -d '{"code": "const x: number = 1;", "filename": "test.ts"}'

# 运行时验证
curl -X POST http://localhost:3458/v1/validation/runtime \
  -H "Content-Type: application/json" \
  -d '{"code": "console.log(1+1);", "filename": "test.js"}'

# 获取验证器状态
curl http://localhost:3458/v1/validation/status
```

### 使用 Node.js (axios)

```javascript
const axios = require('axios');

async function validateCode() {
  // 综合验证
  const response = await axios.post('http://localhost:3458/v1/validation/validate', {
    code: 'function greet(name) { return "Hello, " + name; }',
    filename: 'test.js',
    type: 'javascript'
  });

  console.log('验证结果:', response.data);

  // 获取验证器状态
  const status = await axios.get('http://localhost:3458/v1/validation/status');
  console.log('验证器状态:', status.data);
}

validateCode();
```

---

## 错误处理

所有验证端点在发生错误时返回统一的错误格式：

```json
{
  "error": "错误类型",
  "message": "详细错误信息"
}
```

常见错误：
- `400 Bad Request`: 请求体缺少必需的 `code` 字段
- `500 Internal Server Error`: 验证过程中发生错误

---

## 支持的代码类型

- **JavaScript**: `.js`, `.jsx`
- **TypeScript**: `.ts`, `.tsx`

在请求体中指定 `type` 参数可以帮助验证器选择正确的验证方式。

---

## 配置选项

验证器支持以下配置选项（在服务器启动时配置）：

- `eslintConfigPath`: ESLint 配置文件路径
- `tsConfigPath`: TypeScript 配置文件路径
- `validationTimeout`: 验证超时时间（毫秒）
- `validationMaxMemory`: 最大内存限制（字节）

---

## 安全说明

运行时验证在沙盒环境中执行代码，限制了以下内容：

- 只允许访问安全的内置模块（path、url、util 等）
- 禁止访问文件系统
- 禁止执行系统命令
- 超时和内存限制防止无限循环和资源耗尽

---

**文档生成时间**: 2026-04-07
