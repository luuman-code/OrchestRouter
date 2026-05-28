# 增强的模型提供商配置功能

## 功能概述

我们已经增强了 OrchestRouter UI 中的模型提供商配置功能，使其更加灵活和可自定义，不再局限于固定的预设模板。

## 新增功能

### 1. 自定义提供商添加
- 添加了"添加自定义"按钮，允许用户创建完全自定义的模型提供商
- 不再强制使用预设模板（阿里云、OpenAI、Anthropic等）
- 可以为自定义提供商分配唯一的动态名称

### 2. 扩展配置选项
新增了以下高级配置字段：
- **供应商转换器 (Provider Transformer)**: 指定特定于供应商的请求/响应转换器
- **请求头配置 (Request Headers)**: 以JSON格式提供额外的请求头

### 3. 改进的UI布局
- 在提供商配置面板中增加了"高级配置"部分
- 更直观的按钮布局，区分预设模板和自定义提供商
- 保留了原有功能，保持向后兼容性

## 技术变更

### 修改的文件
- `src/App.tsx`:
  - 扩展了 `Provider` 接口定义，增加 `transformer` 和 `headers` 字段
  - 实现了 `addCustomProvider()` 函数
  - 更新了 `addProvider()` 函数以支持自定义提供商
  - 改进了提供商配置UI布局

### 数据结构变更
```typescript
interface Provider {
  name: string;
  api_base_url: string;
  api_key_env: string;
  api_key: string;
  models: Model[];
  transformer?: string;      // 新增字段
  headers?: string;          // 新增字段
}
```

## 使用方法

1. 访问"模型提供商"标签页
2. 选择使用预设模板：
   - 从下拉菜单中选择提供商类型（阿里云、OpenAI等）
   - 点击"添加模板"按钮
3. 或者，添加完全自定义提供商：
   - 点击"添加自定义"按钮
   - 填写提供商名称、API URL、API密钥等基本信息
   - （可选）在"高级配置"部分配置供应商转换器和请求头

## 兼容性

- 保留了所有原有功能，现有配置不会受到影响
- 新的配置字段是可选的，不影响现有提供商
- 所有预设模板仍可正常使用