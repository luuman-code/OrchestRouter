# selectionReason数据体积优化说明

## 问题背景

在实际使用过程中，我们发现selectionReason对象的数据体积较大，可能会带来以下问题：

1. **性能影响**：频繁记录包含完整selectionReason对象的日志可能影响系统性能
2. **存储成本**：大量结构化的selectionReason数据会占用较多存储空间
3. **网络传输**：在分布式系统中传输大型selectionReason对象会增加网络开销
4. **内存占用**：在高并发场景下，大量存储和处理selectionReason对象会增加内存压力

## 优化策略

### 1. 日志级别控制

实现日志级别控制机制，允许根据不同环境调整selectionReason的详细程度：

- `debug`: 包含完整selectionReason，用于开发和调试
- `info`: 包含标准详细程度的selectionReason
- `warn/error`: 根据需要包含适当的详细信息

### 2. 按需字段选择

支持通过配置指定需要包含的selectionReason字段：

```javascript
logging: {
  selectionReasonFields: ['decisionType', 'selectedModel', 'primaryReason', 'timestamp']
}
```

### 3. 大小限制控制

实现大小限制机制，当selectionReason超过指定大小时自动裁剪：

```javascript
logging: {
  maxSizeLimit: 10240  // 10KB大小限制
}
```

### 4. 异步日志处理

对于详细的selectionReason日志，采用异步处理方式以减少对主业务流程的影响。

## 配置示例

### 开发/测试环境配置
```javascript
{
  monitoring: {
    logSelectionReason: true,
    logging: {
      level: 'debug',
      includeSelectionReason: true,
      detailLevel: 'full',
      maxSizeLimit: null  // 无大小限制
    }
  }
}
```

### 生产环境配置
```javascript
{
  monitoring: {
    logSelectionReason: true,
    logging: {
      level: 'info',
      includeSelectionReason: true,
      selectionReasonFields: ['decisionType', 'selectedModel', 'primaryReason', 'factors'],
      maxSizeLimit: 5120,  // 5KB大小限制
      asyncDelay: 1,       // 异步处理延迟
      batchSize: 5         // 批处理大小
    }
  }
}
```

## 实现组件

### 1. SelectionConfigManager
- 新增logging配置项
- 支持多种日志控制选项

### 2. ModelEvaluator
- `trimSelectionReason()` 方法实现裁剪逻辑
- 支持多种裁剪策略

### 3. AsyncSelectionLogger
- 异步日志处理机制
- 避免阻塞主业务流程

### 4. ModelSelector
- 集成上述所有功能
- 提供统一的selectionReason处理接口

## 部署建议

1. **开发/测试环境**：设置 `logging.level = 'debug'`，包含完整selectionReason以方便调试
2. **预发布环境**：设置 `logging.level = 'info'`，包含标准详细程度的selectionReason
3. **生产环境**：设置 `logging.level = 'info'` 或更高，使用 `selectionReasonFields` 限制字段数量或启用大小限制

通过这些优化措施，可以在保留selectionReason分析价值的同时，显著降低其对系统性能和存储成本的影响。