# 示例：待办事项应用

这是一个使用 OrchestRouter 创建的简单待办事项应用示例。

## 功能

- 添加待办事项
- 删除待办事项
- 标记完成/未完成
- 查看所有待办事项

## 技术栈

- Node.js
- Express
- 前端: HTML/CSS/JavaScript
- 数据存储: JSON 文件

## API 端点

- GET /api/todos - 获取所有待办事项
- POST /api/todos - 添加新的待办事项
- DELETE /api/todos/:id - 删除待办事项
- PUT /api/todos/:id/toggle - 切换完成状态

## 文件结构

```
todo-app/
├── src/
│   ├── server.js          # 服务器入口
│   ├── routes/
│   │   └── todos.js       # 待办事项路由
│   ├── models/
│   │   └── Todo.js        # Todo 模型
│   └── utils/
│       └── db.js          # 数据库工具
├── public/
│   ├── index.html         # 主页面
│   ├── styles.css         # 样式文件
│   └── script.js          # 客户端脚本
└── package.json           # 项目配置
```

## 运行说明

1. 安装依赖：`npm install`
2. 启动服务器：`npm start`
3. 访问 http://localhost:3000