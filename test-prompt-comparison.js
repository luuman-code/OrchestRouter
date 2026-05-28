/**
 * 对比测试脚本：测试不同 prompt 大小对工具调用数量的影响
 */

const https = require('https');

// ============ 配置区域 ============
// MiniMax 使用专门的 API Key 和 URL
const API_KEY = process.env.MINIMAX_API_KEY || 'sk-cp-QI5hMZC8BwNBiY4TmAuKixuv8Qz_r2HIb9iDOPiHyi7FkWCn0WUtzQ363qOonMJWi3NrbHYx6EpAYWu-JcDOxu6JLjd-ZVF02ZaTBWDsVexFqCS5T_dB6zw';
const MODEL_ID = 'MiniMax-M2.7';
const API_BASE_URL = 'api.minimaxi.com';
const API_ENDPOINT = '/anthropic/v1/messages';

// ============ 工具定义 ============
const CODE_GENERATION_TOOLS = [
  {
    name: 'write_file',
    description: '写入文件内容',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '文件内容' }
      },
      required: ['file_path', 'content']
    }
  }
];

const SYSTEM_PROMPT = `You are a code generation assistant.

Generate the files listed in the user message. Use the write_file tool for EACH file listed.
Return ALL tool calls in ONE single response.
Do not return any text or comments.

IMPORTANT: If type definitions or other reference content appear in the prompt, they are for YOUR REFERENCE ONLY to ensure consistency. You MUST still generate ALL listed files using the write_file tool. Do NOT skip any file even if some content appears to be provided.`;

// ============ API 请求函数 ============
function makeRequest(prompt, maxTokens = 100000) {
  return new Promise((resolve, reject) => {
    const messages = [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }]
      }
    ];

    const body = {
      model: MODEL_ID,
      messages: messages,
      max_tokens: maxTokens,
      temperature: 0.5,
      system: SYSTEM_PROMPT,
      tools: CODE_GENERATION_TOOLS
    };

    const options = {
      hostname: API_BASE_URL,
      port: 443,
      path: API_ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'anthropic-version': '2023-06-01'
      }
    };

    console.log(`[请求] Prompt: ${prompt.length} 字符`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(JSON.stringify(body));
    req.end();
  });
}

// ============ 短 Prompt 测试 ============
const SHORT_PROMPT = `# 电商平台后端开发

## Requirement
生成 3 个后端文件

## Tech Stack
TypeScript, Node.js, Express

## Files to Generate
1. server/database/db.ts - 数据库初始化
2. server/index.ts - 服务入口
3. server/routes/auth.ts - 认证路由

## 类型定义
interface User { id: string; username: string; email: string; }

## 功能要求
1. db.ts: 使用 SQLite，getDb() 和 initializeDatabase()
2. index.ts: Express 服务，端口 3001
3. auth.ts: POST /login, POST /register, GET /me

## 输出格式
必须使用 write_file 工具调用生成文件。每个文件一个工具调用。`;

// ============ 长 Prompt 测试（与日志中后端任务完全一致，约9127字符） ============
const LONG_PROMPT = `# 电商平台开发

## Requirement
生成 deliverables 列表中指定的文件

## Tech Stack
React, TypeScript, Node.js, Express, Vite

## Files to Generate
1. [database] 数据库初始化和连接 -> FILE: server/database/db.ts
2. [backend] 后端服务入口 -> FILE: server/index.ts
3. [backend] 认证路由 -> FILE: server/routes/auth.ts
4. [backend] 商品路由 -> FILE: server/routes/products.ts
5. [backend] 购物车路由 -> FILE: server/routes/cart.ts
6. [backend] 订单路由 -> FILE: server/routes/orders.ts

## Shared Types (from shared_context)

// 用户类型
interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

// 商品类型
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  imageUrl?: string;
  tags?: string[];
  specifications?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

// 购物车项类型
interface CartItem {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  selected?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// 订单类型
interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  totalAmount: number;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  shippingAddress: {
    recipientName: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    detailAddress: string;
    postalCode?: string;
  };
  paymentMethod: 'alipay' | 'wechat' | 'card' | 'bank';
  paymentTime?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// 订单项类型
interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productImage?: string;
  quantity: number;
  price: number;
  subtotal: number;
  createdAt: Date;
}

// API 响应类型
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
}

// 分页类型
interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// 认证相关类型
interface LoginRequest {
  username: string;
  password: string;
}

interface LoginResponse extends ApiResponse<{
  token: string;
  user: Omit<User, 'password'>;
}> {}

interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

interface AuthUser extends Omit<User, 'password'> {}

// JWT Payload 类型
interface JWTPayload {
  userId: string;
  username: string;
  exp: number;
  iat: number;
}

// 共享上下文配置
const api_config = {
  baseURL: "http://localhost:3001/api",
  port: 3001
};

// API 端点定义
const api_endpoints = [
  { path: "/api/auth/register", method: "POST", description: "用户注册", auth: false },
  { path: "/api/auth/login", method: "POST", description: "用户登录", auth: false },
  { path: "/api/auth/logout", method: "POST", description: "用户登出", auth: true },
  { path: "/api/auth/me", method: "GET", description: "获取当前用户信息", auth: true },
  { path: "/api/products", method: "GET", description: "获取商品列表", auth: false },
  { path: "/api/products/:id", method: "GET", description: "获取商品详情", auth: false },
  { path: "/api/cart", method: "GET", description: "获取购物车", auth: true },
  { path: "/api/cart/add", method: "POST", description: "添加商品到购物车", auth: true },
  { path: "/api/cart/update", method: "PUT", description: "更新购物车商品数量", auth: true },
  { path: "/api/cart/remove", method: "DELETE", description: "从购物车移除商品", auth: true },
  { path: "/api/orders", method: "GET", description: "获取订单列表", auth: true },
  { path: "/api/orders/:id", method: "GET", description: "获取订单详情", auth: true },
  { path: "/api/orders/create", method: "POST", description: "创建订单", auth: true }
];

// 导入规则
const import_rules = [
  "导入时不带 .ts/.tsx 后缀",
  "使用相对路径 ../ 或 ./",
  "禁止使用绝对路径"
];

// 文件命名禁止规则
const forbidden_files = [
  "UserService.ts",
  "ProductService.ts",
  "CartService.ts",
  "OrderService.ts"
];

// 最佳实践要求
const best_practices = [
  "只生成 deliverables 指定的文件，不要生成其他文件",
  "不要生成测试文件（*.test.js, *.spec.js）",
  "不要生成示例文件或文档文件",
  "返回完整代码，不要返回占位符或 TODO",
  "类型定义必须从 shared_context.type_source 指向的文件导入",
  "必须生成独立的页面组件文件（pages/ 目录下）",
  "API 调用必须严格遵循 shared_context.api_endpoints 中定义的契约"
];

## Detailed Implementation Requirements

### 1. 数据库初始化和连接 (server/database/db.ts)
- 使用 better-sqlite3 库连接 SQLite 数据库
- 数据库文件路径: ./data/ecommerce.db
- 提供 getDb() 方法获取数据库实例
- 提供 initializeDatabase() 方法初始化表结构
- 表结构包括：
  - users: id, username, email, password, created_at, updated_at
  - products: id, name, description, price, stock, category, image_url, tags, specifications, created_at, updated_at
  - cart_items: id, user_id, product_id, quantity, selected, created_at, updated_at
  - orders: id, user_id, order_number, total_amount, status, shipping_address, payment_method, payment_time, shipped_at, delivered_at, created_at, updated_at
  - order_items: id, order_id, product_id, product_name, product_image, quantity, price, subtotal, created_at
- 使用数据库事务确保数据一致性
- 添加索引优化查询性能：users(username), products(category), cart_items(user_id), orders(user_id, status)
- 实现种子数据初始化功能
- 导出类型：Database, User, Product, CartItem, Order, OrderItem

### 2. 后端服务入口 (server/index.ts)
- 使用 Express 框架
- 端口配置: process.env.PORT || 3001
- 配置 cors 中间件允许跨域
- 配置 express.json() 解析 JSON 请求体
- 配置 express.urlencoded() 解析 URL 编码
- 挂载所有路由到 /api 前缀
- 添加统一的错误处理中间件
- 添加请求日志中间件（请求时间、路径、方法）
- 启动服务器前确保 data 目录存在
- 导入并初始化数据库
- 导入并注册所有路由

### 3. 认证路由 (server/routes/auth.ts)
- POST /api/auth/register - 用户注册
  - 输入: { username, email, password }
  - 验证: 用户名唯一（4-20字符），邮箱格式验证，密码强度（至少6字符）
  - 使用 bcrypt.hash 加密密码（salt rounds: 10）
  - 返回: { success: true, data: { user: {...}, token: "jwt_token" } }
  - 错误: 用户名已存在返回 400，邮箱格式错误返回 400

- POST /api/auth/login - 用户登录
  - 输入: { username, password }
  - 验证: 用户名存在，密码正确（使用 bcrypt.compare）
  - 生成 JWT token 返回（有效期 7 天）
  - 返回: { success: true, data: { token: "jwt_token", user: {...} } }
  - 错误: 用户名不存在返回 401，密码错误返回 401

- POST /api/auth/logout - 用户登出
  - 需要认证（Bearer token）
  - 客户端清除 token（服务端无需处理）
  - 返回: { success: true, message: "已登出" }

- GET /api/auth/me - 获取当前用户信息
  - 需要认证
  - 从 Authorization header 解析 JWT token
  - 查询用户信息返回（不包含 password 字段）
  - 返回: { success: true, data: user }
  - 错误: token 无效返回 401

### 4. 商品路由 (server/routes/products.ts)
- GET /api/products - 获取商品列表
  - 不需要认证
  - 支持分页: ?page=1&pageSize=10（默认 page=1, pageSize=10）
  - 支持筛选: ?category=electronics&minPrice=100&maxPrice=1000
  - 支持搜索: ?search=keyword（搜索 name 和 description）
  - 支持排序: ?sort=price&order=asc|desc（默认按 created_at desc）
  - 返回: { success: true, data: products[], pagination: { page, pageSize, total, totalPages } }

- GET /api/products/:id - 获取商品详情
  - 不需要认证
  - 验证商品存在，不存在返回 404
  - 返回: { success: true, data: product }

### 5. 购物车路由 (server/routes/cart.ts)
- GET /api/cart - 获取用户购物车
  - 需要认证
  - 查询当前用户的购物车商品列表
  - 联表查询获取商品详细信息（name, price, image_url）
  - 返回: { success: true, data: cartItems[] }

- POST /api/cart/add - 添加商品到购物车
  - 需要认证
  - 输入: { productId, quantity }
  - 验证: 商品存在，库存充足
  - 如果该商品已在购物车，更新数量；否则添加新项
  - 返回: { success: true, data: cartItem }

- PUT /api/cart/update - 更新购物车商品数量
  - 需要认证
  - 输入: { cartItemId, quantity }
  - 验证: 购物车项存在且属于当前用户
  - quantity 为 0 时删除该项
  - 返回: { success: true, data: cartItem }

- DELETE /api/cart/remove - 从购物车移除商品
  - 需要认证
  - 输入: { cartItemId }
  - 验证: 购物车项存在且属于当前用户
  - 返回: { success: true }

### 6. 订单路由 (server/routes/orders.ts)
- GET /api/orders - 获取用户订单列表
  - 需要认证
  - 查询当前用户的所有订单
  - 支持分页: ?page=1&pageSize=10
  - 支持状态筛选: ?status=pending
  - 返回订单列表（不包含订单项）
  - 返回: { success: true, data: orders[], pagination: {...} }

- GET /api/orders/:id - 获取订单详情
  - 需要认证
  - 验证订单存在且属于当前用户，不存在或无权限返回 404/403
  - 返回订单详情（含订单项）
  - 返回: { success: true, data: order }

- POST /api/orders/create - 创建订单
  - 需要认证
  - 输入: { cartItemIds?: string[], shippingAddress: {...}, paymentMethod: string, items?: [...] }
  - 如果提供 cartItemIds，从购物车创建订单
  - 如果提供 items，直接创建订单
  - 验证商品库存是否充足
  - 使用事务创建订单和订单项
  - 清空已购买的购物车项
  - 返回: { success: true, data: order }

### 认证中间件要求
- 提取 Authorization header 中的 Bearer token
- 使用 jsonwebtoken 验证 token 有效性
- 解析 userId 和 username 到 req.user
- 验证失败返回 401

### 错误处理规范
- 所有错误返回统一的 ApiResponse 格式
- HTTP 状态码：
  - 400: 参数错误、验证失败
  - 401: 未认证
  - 403: 禁止访问
  - 404: 资源未找到
  - 500: 服务器内部错误
- 生产环境关闭详细错误信息输出

## Output Format Requirements
必须使用 write_file 工具生成文件，每个文件单独一个工具调用。
工具调用格式：
{
  "name": "write_file",
  "arguments": {
    "file_path": "文件路径",
    "content": "文件内容"
  }
}

重要提示：
1. 只生成指定的 6 个文件，不要生成其他文件
2. 文件内容要完整，不要使用占位符或 TODO
3. 确保代码可以直接运行
4. TypeScript 代码要包含完整的类型注解
5. 所有功能都要实现，不能省略任何功能点`;

// ============ 解析响应 ============
function parseResponse(responseData) {
  let toolCallCount = 0;
  let filePaths = [];

  if (responseData.content && Array.isArray(responseData.content)) {
    for (const item of responseData.content) {
      if (item.type === 'tool_use') {
        toolCallCount++;
        try {
          const input = typeof item.input === 'string' ? JSON.parse(item.input) : item.input;
          if (input.file_path) {
            filePaths.push(input.file_path);
          }
        } catch (e) {}
      }
    }
  }

  return { toolCallCount, filePaths };
}

// ============ 运行测试 ============
async function runTest(name, prompt) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`测试: ${name}`);
  console.log(`${'='.repeat(50)}`);

  try {
    const startTime = Date.now();
    const response = await makeRequest(prompt);
    const duration = Date.now() - startTime;

    const { toolCallCount, filePaths } = parseResponse(response);

    console.log(`耗时: ${duration}ms`);
    console.log(`工具调用次数: ${toolCallCount}`);
    console.log(`文件路径: ${filePaths.join(', ') || '(无)'}`);

    return { toolCallCount, duration };
  } catch (e) {
    console.error(`错误: ${e.message}`);
    return { toolCallCount: 0, duration: 0 };
  }
}

async function main() {
  console.log('========================================');
  console.log('Prompt 大小对工具调用数量影响测试');
  console.log('========================================');

  // 测试1：短 prompt
  const shortResult = await runTest('短 Prompt (约500字符)', SHORT_PROMPT);

  // 测试2：长 prompt
  const longResult = await runTest('长 Prompt (约2500字符)', LONG_PROMPT);

  // 结果对比
  console.log('\n========================================');
  console.log('结果对比');
  console.log('========================================');
  console.log(`短 Prompt: ${shortResult.toolCallCount} 次工具调用`);
  console.log(`长 Prompt: ${longResult.toolCallCount} 次工具调用`);
}

main();
