# AI智能日程表 - 实现计划

## 1. 项目概述

**项目名称**: AI智能日程表 (AI Smart Scheduler)
**项目类型**: 桌面端应用程序
**技术栈**: Tauri 2.x + React 18 + TypeScript
**数据存储**: 本地SQLite

## 2. 核心功能

### 2.1 自然语言创建日程
- 用户输入自然语言描述（如"明天上午9点开会"）
- AI解析提取：时间、地点、主题、参与人员
- 支持复杂语义：重复日程、条件日程

### 2.2 智能提醒
- 根据日程重要性自动设置提醒时间
- 支持多种提醒方式：弹窗、声音、系统通知
- 智能提醒：提前15分钟/1小时/1天

### 2.3 日程冲突解决
- 自动检测时间冲突
- 提供冲突解决方案建议
- 支持手动/自动解决冲突

## 3. 技术架构

### 3.1 前端 (React)
```
src/
├── components/          # React组件
│   ├── Calendar/        # 日历视图
│   ├── Schedule/        # 日程管理
│   ├── AIInput/         # AI自然语言输入
│   └── Settings/        # 设置面板
├── hooks/               # 自定义Hooks
├── services/            # 前端服务
├── stores/              # 状态管理(Zustand)
└── types/               # TypeScript类型
```

### 3.2 后端 (Rust/Tauri)
```
src-tauri/
├── src/
│   ├── main.rs          # 入口
│   ├── commands/        # Tauri命令
│   ├── db/              # SQLite数据库
│   ├── ai/              # AI解析服务
│   └── notifications/  # 通知系统
└── tauri.conf.json      # Tauri配置
```

### 3.3 数据库设计
```sql
-- 日程表
CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  location TEXT,
  attendees TEXT,  -- JSON数组
  priority INTEGER DEFAULT 1,  -- 1-5
  is_all_day BOOLEAN DEFAULT FALSE,
  recurrence TEXT,  -- JSON: 重复规则
  reminders TEXT,   -- JSON: 提醒配置
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 提醒记录
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  schedule_id TEXT REFERENCES schedules(id),
  remind_at DATETIME NOT NULL,
  is_sent BOOLEAN DEFAULT FALSE,
  method TEXT DEFAULT 'popup'  -- popup/sound/system
);

-- 冲突记录
CREATE TABLE conflicts (
  id TEXT PRIMARY KEY,
  schedule_id_1 TEXT REFERENCES schedules(id),
  schedule_id_2 TEXT REFERENCES schedules(id),
  resolved BOOLEAN DEFAULT FALSE,
  resolution TEXT  -- JSON: 解决方案
);
```

## 4. 实现步骤

### 阶段1: 基础框架 (第1-2天)
- [ ] 初始化Tauri + React项目
- [ ] 配置SQLite数据库
- [ ] 实现基础CRUD操作

### 阶段2: 日历UI (第3-4天)
- [ ] 月/周/日视图切换
- [ ] 日程卡片显示
- [ ] 拖拽调整日程

### 阶段3: AI功能 (第5-7天)
- [ ] 自然语言解析
- [ ] 智能提醒逻辑
- [ ] 冲突检测算法

### 阶段4: 系统集成 (第8-10天)
- [ ] 系统托盘
- [ ] 系统通知
- [ ] 开机自启

## 5. API设计

### 5.1 日程管理
- `GET /api/schedules` - 获取日程列表
- `POST /api/schedules` - 创建日程
- `PUT /api/schedules/:id` - 更新日程
- `DELETE /api/schedules/:id` - 删除日程

### 5.2 AI功能
- `POST /api/ai/parse` - 解析自然语言
- `POST /api/ai/check-conflicts` - 检查冲突
- `POST /api/ai/suggest-resolution` - 建议解决方案

## 6. 验收标准

- [ ] 可以用自然语言创建日程
- [ ] 日程可以按月/周/日视图显示
- [ ] 智能提醒正常工作
- [ ] 冲突检测准确
- [ ] 数据本地持久化
- [ ] 可打包为.exe运行
