# 整合器 (Integrator)

整合器是 OrchestRouter 系统中的核心组件，负责将多个子任务的执行结果合并为一个完整的、可运行的代码库。它处理文件合并、依赖注入、命名冲突解决、代码风格统一等问题。

## 架构概览

整合器由以下主要模块组成：

- **文件处理模块**: `FileOrganizer`, `ConflictDetector`
- **依赖处理模块**: `ImportAnalyzer`, `DependencyGraph`, `DependencyInjector`, `PathResolver`
- **冲突解决模块**: `NamingConflictResolver`, `AutoRenamer`, `LLMConflictResolver`
- **代码风格模块**: `CodeFormatter`
- **入口生成模块**: `EntryPointGenerator`
- **完整性校验模块**: `CompletenessValidator`
- **执行质量模块**: `ExecutionQualityEvaluator`, `QualityFeedbackProcessor`
- **整合器接口模块**: `IntegrationInterfaceProcessor`, `MergeStrategyHandler`
- **输出格式化模块**: `OutputFormatter`

## 主要功能

### 1. 文件合并
- 使用 `FileOrganizer` 管理代码文件的存储、合并和写入磁盘
- 支持多种合并策略（覆盖、追加、智能合并、分区、重命名）
- 自动处理路径标准化和跨平台兼容性

### 2. 依赖处理
- `ImportAnalyzer` 分析代码中的导入/导出语句，支持多种语言
- `DependencyGraph` 构建文件间依赖关系，支持拓扑排序和循环依赖检测
- `DependencyInjector` 为文件注入必要的导入语句
- `PathResolver` 解析导入路径到实际文件路径

### 3. 冲突解决
- `NamingConflictResolver` 检测命名冲突，使用 AST 进行符号提取
- `AutoRenamer` 自动重命名冲突符号，更新所有引用
- `LLMConflictResolver` 使用 LLM 解决复杂冲突

### 4. 代码质量保证
- `CodeFormatter` 确保代码风格一致，集成 Prettier/Black
- `ExecutionQualityEvaluator` 评估执行结果质量
- `QualityFeedbackProcessor` 根据质量评分调整整合策略

### 5. 完整性验证
- `CompletenessValidator` 验证最终代码库的完整性
- 从多个来源提取预期文件列表（Decomposer hints, 用户配置, 推断）

## 使用方法

### 作为独立模块使用

```javascript
const { Integrator } = require('./integrator');

const integrator = new Integrator({
  // 配置选项
  formatting: {
    fallbackEnabled: true,
    backupEnabled: false
  },
  execution: {
    quality_threshold: 70,
    critical_quality_threshold: 40
  }
});

// 执行整合
const result = await integrator.integrate(executionResults, subtasks);

if (result.success) {
  console.log('整合成功！');
  // 保存整合后的文件
  for (const [filePath, file] of result.files.entries()) {
    // 保存文件到磁盘
  }
} else {
  console.log('整合失败:', result.warnings);
}
```

### 与其他模块配合使用

整合器是 OrchestRouter 系统的一部分，与分解器 (Decomposer)、模型选择器 (ModelSelector)、并发执行器 (ConcurrentExecutor) 协作：

```javascript
// 示例工作流
const { Integrator } = require('./integrator');
const { FileOrganizer } = require('./file/organizer');

// 1. 接收执行结果
const executionResults = await concurrentExecutor.execute(subtasks);

// 2. 整合结果
const integrator = new Integrator();
const integrationResult = await integrator.integrate(executionResults, subtasks);

// 3. 保存结果
const organizer = new FileOrganizer('output');
for (const [path, file] of integrationResult.files.entries()) {
  organizer.addFile(file);
}
await organizer.writeToDisk();
```

## 配置选项

- `formatting`: 代码格式化配置
  - `prettierPath`: Prettier 可执行文件路径
  - `blackPath`: Black 可执行文件路径
  - `fallbackEnabled`: 是否启用降级处理
  - `backupEnabled`: 是否启用格式化前备份
  - `prettierOptions`: Prettier 配置选项
- `execution`: 执行质量配置
  - `quality_threshold`: 质量阈值
  - `critical_quality_threshold`: 严重质量阈值
- `conflict`: 冲突解决配置
- `dependency`: 依赖处理配置

## 输出格式

整合器可以输出多种格式的结果：

```javascript
const { OutputFormatter, OutputFormat } = require('./output/formatter');

const formatter = new OutputFormatter();
const jsonOutput = formatter.format(result, OutputFormat.JSON);
const textOutput = formatter.format(result, OutputFormat.TEXT);
const markdownOutput = formatter.format(result, OutputFormat.MARKDOWN);
const fileList = formatter.format(result, OutputFormat.FILE_LIST);
```

## 错误处理

整合器在遇到错误时会:
- 记录详细的错误信息和上下文
- 尽可能继续处理而非完全失败
- 返回带有错误和警告的详细结果
- 提供调试信息以便问题诊断

## 设计原则

1. **兼容性**: 与 Decomposer 的 `integrationHints` 完全兼容
2. **可扩展性**: 支持插件式扩展和自定义处理器
3. **鲁棒性**: 多层降级策略确保在工具缺失时仍可工作
4. **透明性**: 详细的日志和报告便于监控和调试
5. **质量驱动**: 根据执行质量动态调整整合策略

## 路径标准化

整合器实现智能路径标准化，确保在不同操作系统上的兼容性：
- 将所有路径分隔符统一为正斜杠
- 在大小写不敏感的系统（Windows/macOS）上转换为小写
- 在大小写敏感的系统（Linux）上保留原始大小写
- 处理相对路径和绝对路径

## 合并策略

整合器支持多种文件合并策略：
- `overwrite`: 后续内容覆盖前面的内容
- `append`: 在原有内容后追加
- `merge`: 智能合并（使用区域标记或LLM辅助）
- `partition`: 分区合并（根据约束条件）
- `rename`: 生成新的唯一文件名

## 质量驱动的整合

整合器根据 `ExecutionQualityEvaluator` 产生的质量评分：
- 高质量结果使用积极的整合策略
- 低质量结果使用保守策略，可能需要人工审核
- 低质量结果不覆盖高质量结果
- 根据质量问题类型应用针对性修复

---

整合器是 OrchestRouter 系统的关键组件，确保分散的子任务结果被无缝合并为高质量的完整代码库。