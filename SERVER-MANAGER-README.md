# OrchestRouter Server Management

便捷的服务器管理脚本，用于启动、停止、重启和检查 OrchestRouter 服务器状态。

## 快速启动

### Windows 批处理脚本
- `start-orchestrator.bat` - 启动服务器
- `stop-orchestrator.bat` - 停止服务器

### PowerShell 脚本
- `server-manager.ps1` - 功能丰富的管理脚本
  ```powershell
  # 启动服务器
  .\server-manager.ps1 -Action start

  # 停止服务器
  .\server-manager.ps1 -Action stop

  # 重启服务器
  .\server-manager.ps1 -Action restart

  # 检查服务器状态
  .\server-manager.ps1 -Action status
  ```

### Bash 脚本 (适用于 Git Bash)
- `server-manager.sh` - Unix 风格管理脚本
  ```bash
  # 启动服务器
  ./server-manager.sh start

  # 停止服务器
  ./server-manager.sh stop

  # 重启服务器
  ./server-manager.sh restart

  # 检查服务器状态
  ./server-manager.sh status
  ```

## 服务器信息

- **端口**: 3458
- **入口文件**: `src/orchestrator/index.js`
- **功能**:
  - 接收 Claude Code 请求
  - 智能判断任务复杂度
  - 调用分解器处理复杂任务
  - 转发简单任务到 CCR Router

## 环境配置

确保 `.env` 文件包含必要的 API 密钥配置，如 `DASHSCOPE_API_KEY` 用于阿里云 Coding Plan API。

## 端点列表

- `GET  /health` - 健康检查
- `POST /orchestrate` - 编排端点（主端点）
- `POST /v1/orchestrate` - 编排端点（兼容路径）
- `POST /v1/decompose` - 直接分解测试
- `POST /v1/select-model` - 直接模型选择测试
- `POST /v1/execute-subtasks` - 直接执行子任务