import json
import os

request = {
    "implementation_plan": {
        "title": "电商平台",
        "tech_stack": ["React 18", "TypeScript", "Node.js", "Express", "SQLite", "Vite", "Tailwind CSS"],
        "architecture_patterns": ["前后端分离", "RESTful API", "分层架构"],
        "code_standards": ["no_empty_imports", "use_relative_paths", "consistent_naming"],
        "contract_first": True,
        "mock_service_layer": True,
        "shared_context": {
            "description": "电商平台全局约束",
            "type_source": "src/types/index.ts",
            "type_source_content": "export interface User { id: number; name: string; email: string; password: string; createdAt?: string; }",
            "types": {
                "User": {"description": "用户实体", "properties": {"id": "number", "name": "string", "email": "string", "password": "string"}, "required": ["id", "name", "email", "password"]}
            },
            "api_config": {"baseURL": "http://localhost:3001/api", "port": 3001},
            "api_endpoints": [
                {"path": "/api/auth/login", "method": "POST", "description": "用户登录", "auth": False},
                {"path": "/api/auth/register", "method": "POST", "description": "用户注册", "auth": False},
                {"path": "/api/products", "method": "GET", "description": "获取商品列表", "auth": False},
                {"path": "/api/cart", "method": "GET", "description": "获取购物车", "auth": True},
                {"path": "/api/cart", "method": "POST", "description": "添加购物车", "auth": True},
                {"path": "/api/orders", "method": "GET", "description": "获取订单", "auth": True},
                {"path": "/api/orders", "method": "POST", "description": "创建订单", "auth": True}
            ],
            "file_naming": {"forbidden_files": ["UserService.ts"]},
            "import_rules": ["导入时不带后缀", "使用相对路径"]
        },
        "best_practices": [
            "只生成 deliverables 指定的文件",
            "不要生成测试文件",
            "返回完整代码，不要返回占位符或 TODO",
            "类型定义必须从 shared_context.type_source 指向的文件导入",
            "必须生成独立的页面组件文件",
            "App.tsx 只做路由分发和状态管理",
            "组件导入名称必须与文件名完全匹配",
            "禁止在 deliverables 之外生成组件或创建文件",
            "API 调用必须严格遵循 api_endpoints 契约",
            "React 组件必须使用 props 接收数据",
            "必须生成完整的构建配置文件",
            "前端任务必须使用 Mock 数据"
        ],
        "conflict_sensitive_groups": [
            {"description": "类型定义", "strategy": "strong_coupling", "priority": 100, "mergeMode": "selected_only", "files": ["src/types/index.ts"]},
            {"description": "构建配置", "strategy": "path_affinity", "priority": 90, "files": ["package.json", "vite.config.js", "tailwind.config.js", "postcss.config.js", "tsconfig.json", "src/index.css"]},
            {"description": "后端入口", "strategy": "strong_coupling", "priority": 80, "mergeMode": "full_merge", "files": ["server/database/db.ts", "server/index.ts"]},
            {"description": "后端路由", "strategy": "strong_coupling", "priority": 70, "mergeMode": "full_merge", "files": ["server/routes/auth.ts", "server/routes/products.ts", "server/routes/cart.ts", "server/routes/orders.ts"]},
            {"description": "前端核心", "strategy": "strong_coupling", "priority": 60, "mergeMode": "full_merge", "files": ["src/App.tsx", "src/main.tsx", "src/services/api.ts"]},
            {"description": "前端页面", "strategy": "strong_coupling", "priority": 50, "mergeMode": "full_merge", "files": ["src/pages/Home.tsx", "src/pages/Login.tsx", "src/pages/Register.tsx", "src/pages/ProductList.tsx", "src/pages/ProductDetail.tsx", "src/pages/Cart.tsx", "src/pages/OrderList.tsx"]},
            {"description": "前端组件", "strategy": "strong_coupling", "priority": 40, "mergeMode": "full_merge", "files": ["src/components/Header.tsx", "src/components/ProductCard.tsx", "src/components/CartItem.tsx", "src/components/Button.tsx", "src/components/Input.tsx"]}
        ]
    },
    "task": {
        "title": "电商平台",
        "description": "完整的电商平台系统",
        "requirement": "用户认证、商品浏览、购物车、订单管理",
        "deliverables": [
            {"description": "类型定义文件", "filePath": "src/types/index.ts", "type": "logic"},
            {"description": "项目构建配置", "filePath": "package.json", "type": "config"},
            {"description": "Vite配置", "filePath": "vite.config.js", "type": "config"},
            {"description": "Tailwind配置", "filePath": "tailwind.config.js", "type": "config"},
            {"description": "PostCSS配置", "filePath": "postcss.config.js", "type": "config"},
            {"description": "TypeScript配置", "filePath": "tsconfig.json", "type": "config"},
            {"description": "全局样式", "filePath": "src/index.css", "type": "style"},
            {"description": "数据库初始化", "filePath": "server/database/db.ts", "type": "logic"},
            {"description": "后端服务器入口", "filePath": "server/index.ts", "type": "logic"},
            {"description": "认证路由", "filePath": "server/routes/auth.ts", "type": "logic"},
            {"description": "商品路由", "filePath": "server/routes/products.ts", "type": "logic"},
            {"description": "购物车路由", "filePath": "server/routes/cart.ts", "type": "logic"},
            {"description": "订单路由", "filePath": "server/routes/orders.ts", "type": "logic"},
            {"description": "前端应用入口", "filePath": "src/main.tsx", "type": "logic"},
            {"description": "前端根组件", "filePath": "src/App.tsx", "type": "logic"},
            {"description": "API服务层", "filePath": "src/services/api.ts", "type": "logic"},
            {"description": "首页", "filePath": "src/pages/Home.tsx", "type": "page"},
            {"description": "登录页", "filePath": "src/pages/Login.tsx", "type": "page"},
            {"description": "注册页", "filePath": "src/pages/Register.tsx", "type": "page"},
            {"description": "商品列表页", "filePath": "src/pages/ProductList.tsx", "type": "page"},
            {"description": "商品详情页", "filePath": "src/pages/ProductDetail.tsx", "type": "page"},
            {"description": "购物车页", "filePath": "src/pages/Cart.tsx", "type": "page"},
            {"description": "订单列表页", "filePath": "src/pages/OrderList.tsx", "type": "page"},
            {"description": "导航栏组件", "filePath": "src/components/Header.tsx", "type": "component"},
            {"description": "商品卡片组件", "filePath": "src/components/ProductCard.tsx", "type": "component"},
            {"description": "购物车项组件", "filePath": "src/components/CartItem.tsx", "type": "component"},
            {"description": "按钮组件", "filePath": "src/components/Button.tsx", "type": "component"},
            {"description": "输入框组件", "filePath": "src/components/Input.tsx", "type": "component"}
        ]
    }
}

os.makedirs('C:/Users/LWB/OrchestRouter/requests', exist_ok=True)
with open('C:/Users/LWB/OrchestRouter/requests/request_ecommerce_platform.json', 'w', encoding='utf-8') as f:
    json.dump(request, f, ensure_ascii=False, indent=2)
print('Request file created successfully')