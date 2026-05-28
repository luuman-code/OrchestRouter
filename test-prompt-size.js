/**
 * 测试脚本：验证 Prompt 大小对模型输出格式的影响
 *
 * 测试目标：
 * 1. 使用与后端任务同等大小(约9000字符)的prompt
 * 2. 保持请求格式、字段数值与编排器一致
 * 3. 使用与编排器相同的响应解析逻辑
 */

const https = require('https');
const http = require('http');

// ============ 配置区域 ============
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.MINIMAX_API_KEY;
const MODEL_ID = 'MiniMax-M2.7';  // 测试后端任务使用的模型
const API_BASE_URL = 'api.minimaxi.com';
const API_ENDPOINT = '/anthropic/v1/messages';

// ============ 工具定义（与编排器一致） ============
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

// ============ System Prompt（与编排器一致） ============
const SYSTEM_PROMPT = `你是一个专业的代码生成助手。你必须严格按照用户要求生成代码，只生成请求的文件，不要生成其他文件。`;

// ============ 测试 Prompt（模拟后端任务） ============
// 目标：生成一个约9000字符的 prompt，模拟后端任务
function buildBackendTaskPrompt() {
  const deliverables = [
    { path: 'server/database/db.ts', description: '数据库初始化和连接' },
    { path: 'server/index.ts', description: '后端服务入口' },
    { path: 'server/routes/auth.ts', description: '认证路由' },
    { path: 'server/routes/products.ts', description: '商品路由' },
    { path: 'server/routes/cart.ts', description: '购物车路由' },
    { path: 'server/routes/orders.ts', description: '订单路由' }
  ];

  // 构建文件生成列表
  let filesSection = deliverables.map((d, i) =>
    `${i + 1}. [backend] ${d.description} -> FILE: ${d.path}`
  ).join('\n');

  // 构建详细的类型信息（增加内容大小）
  const typeDefinitions = `
## 类型定义参考

// 用户类型
interface User {
  id: string;
  username: string;
  email: string;
  password: string; // 加密存储
  createdAt: Date;
  updatedAt: Date;
  profile?: {
    avatar?: string;
    phone?: string;
    address?: string;
  };
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
`.trim();

// 构建详细的需求说明（增加内容大小）
const requirements = `
## 功能需求

### 1. 数据库初始化和连接 (server/database/db.ts)
- 使用 better-sqlite3 库连接 SQLite 数据库
- 数据库文件路径: ./data/ecommerce.db
- 提供 getConnection() 或 getDb() 方法获取数据库实例
- 提供 initializeDatabase() 方法初始化表结构
- 表结构包括：
  - users: id, username, email, password, avatar, phone, address, created_at, updated_at
  - products: id, name, description, price, stock, category, image_url, tags, specifications, created_at, updated_at
  - cart_items: id, user_id, product_id, quantity, selected, created_at, updated_at
  - orders: id, user_id, order_number, total_amount, status, shipping_address, payment_method, payment_time, shipped_at, delivered_at, created_at, updated_at
  - order_items: id, order_id, product_id, product_name, product_image, quantity, price, subtotal, created_at
- 使用数据库事务确保数据一致性
- 添加索引优化查询性能

### 2. 后端服务入口 (server/index.ts)
- 使用 Express 框架
- 端口配置: process.env.PORT || 3001
- 配置 cors 中间件允许跨域
- 配置 express.json() 解析 JSON 请求体
- 配置 express.urlencoded() 解析 URL 编码
- 挂载所有路由到 /api 前缀
- 添加统一的错误处理中间件
- 添加请求日志中间件
- 启动服务器前确保 data 目录存在

### 3. 认证路由 (server/routes/auth.ts)
- POST /api/auth/register - 用户注册
  - 输入: { username, email, password }
  - 验证: 用户名唯一，邮箱格式，密码强度
  - 使用 bcrypt.hash 加密密码
  - 返回: { success: true, data: { user, token } }

- POST /api/auth/login - 用户登录
  - 输入: { username, password }
  - 验证: 用户名存在，密码正确
  - 使用 bcrypt.compare 验证密码
  - 生成 JWT token 返回
  - 返回: { success: true, data: { token, user } }

- POST /api/auth/logout - 用户登出
  - 需要认证
  - 清除客户端 token（服务端无需处理）
  - 返回: { success: true }

- GET /api/auth/me - 获取当前用户信息
  - 需要认证
  - 从 JWT token 解析用户 ID
  - 查询用户信息返回（不包含密码）
  - 返回: { success: true, data: user }

### 4. 商品路由 (server/routes/products.ts)
- GET /api/products - 获取商品列表
  - 支持分页: ?page=1&pageSize=10
  - 支持筛选: ?category=electronics&minPrice=100&maxPrice=1000
  - 支持搜索: ?search=keyword
  - 支持排序: ?sort=price&order=asc|desc
  - 返回: { success: true, data: products, pagination: {...} }

- GET /api/products/:id - 获取商品详情
  - 验证商品存在
  - 返回: { success: true, data: product }

### 5. 购物车路由 (server/routes/cart.ts)
- GET /api/cart - 获取用户购物车
  - 需要认证
  - 返回用户的购物车商品列表（含商品详细信息）
  - 返回: { success: true, data: cartItems }

- POST /api/cart/add - 添加商品到购物车
  - 需要认证
  - 输入: { productId, quantity }
  - 验证: 商品存在，库存充足
  - 如果已存在则更新数量，否则添加
  - 返回: { success: true, data: cartItem }

- PUT /api/cart/update - 更新购物车商品数量
  - 需要认证
  - 输入: { cartItemId, quantity }
  - 验证: 购物车项存在，属于当前用户
  - quantity 为 0 时删除该项
  - 返回: { success: true, data: cartItem }

- DELETE /api/cart/remove - 从购物车移除商品
  - 需要认证
  - 输入: { cartItemId }
  - 验证: 购物车项存在，属于当前用户
  - 返回: { success: true }

### 6. 订单路由 (server/routes/orders.ts)
- GET /api/orders - 获取用户订单列表
  - 需要认证
  - 支持分页: ?page=1&pageSize=10
  - 支持状态筛选: ?status=pending
  - 返回订单列表（含订单项）
  - 返回: { success: true, data: orders, pagination: {...} }

- GET /api/orders/:id - 获取订单详情
  - 需要认证
  - 验证订单存在且属于当前用户
  - 返回订单详情（含订单项）
  - 返回: { success: true, data: order }

- POST /api/orders/create - 创建订单
  - 需要认证
  - 输入: { cartItemIds?, shippingAddress, paymentMethod, items?: [...] }
  - 如果提供 cartItemIds，从购物车创建订单
  - 如果提供 items，直接创建订单
  - 验证商品库存
  - 使用事务创建订单和订单项
  - 清空已购买的购物车项
  - 返回: { success: true, data: order }

### 认证机制
- 使用 jsonwebtoken 库处理 JWT
- Token 有效期: 7 天
- Token 放在 Authorization header 中，格式为：Bearer <token>
- 密码使用 bcrypt 加密存储
- 认证中间件验证 token 并附加用户信息到 req.user

### 错误处理
- 所有错误返回统一的 ApiResponse 格式
- HTTP 状态码：
  - 400: 参数错误、验证失败
  - 401: 未认证
  - 403: 禁止访问
  - 404: 资源未找到
  - 500: 服务器内部错误
- 错误日志记录

### 详细实现要求
- 所有数据库操作使用参数化查询防止 SQL 注入
- 敏感数据（如密码）严禁明文存储
- API 响应时间超过 1 秒时记录警告日志
- 生产环境关闭详细错误信息输出
`.trim();

  // 组装完整 prompt
  const prompt = `# 电商平台后端开发

## Requirement
生成 deliverables 列表中指定的文件

## Tech Stack
React, TypeScript, Node.js, Express, Vite, SQLite, bcrypt, jsonwebtoken

## Project Structure
- server/
  - database/
    - db.ts          # 数据库初始化和连接
  - routes/
    - auth.ts        # 认证路由
    - products.ts    # 商品路由
    - cart.ts        # 购物车路由
    - orders.ts      # 订单路由
  - index.ts         # 服务入口

## Files to Generate
${filesSection}

## Shared Types (from shared_context)
${typeDefinitions}

## Detailed Requirements
${requirements}

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
3. 确保代码可以直接运行，没有语法错误
4. TypeScript 代码要包含完整的类型注解
5. 所有功能都要实现，不能省略任何功能点
`;

  return prompt;
}

// ============ 响应解析逻辑（与 ConcurrentExecutor.js 一致） ============
function parseResponse(responseData) {
  const result = {
    content: null,
    toolCalls: [],
    usage: null,
    cost: null,
    thinking: null,
    raw_response: responseData
  };

  try {
    // 处理 Anthropic/MiniMax 格式
    if (responseData.content && Array.isArray(responseData.content)) {
      // 检查是否有 tool_use 块
      const toolUseBlocks = responseData.content.filter(item => item.type === 'tool_use');

      if (toolUseBlocks.length > 0) {
        console.log(`[解析] 检测到 ${toolUseBlocks.length} 个 tool_use 块`);

        // 处理每个 tool_use 块
        for (const tool of toolUseBlocks) {
          try {
            // tool.input 可能是字符串或对象
            let parsedInput;
            if (typeof tool.input === 'string') {
              parsedInput = JSON.parse(tool.input || '{}');
            } else {
              parsedInput = tool.input || {};
            }

            const filePath = parsedInput.file_path || parsedInput.filePath || '';
            const content = parsedInput.content || '';

            if (filePath) {
              result.toolCalls.push({
                name: tool.name,
                input: parsedInput,
                file_path: filePath,
                content_length: content.length
              });
              console.log(`[解析] 文件路径: ${filePath}, 内容长度: ${content.length}`);
            } else {
              console.log(`[解析] 警告: tool_use 缺少 file_path，原始 input:`, JSON.stringify(parsedInput).substring(0, 200));
            }
          } catch (e) {
            console.log(`[解析] tool_use 块解析失败:`, e.message);
          }
        }
      }

      // 提取文本内容
      const textContent = responseData.content
        .filter(item => item.type === 'text')
        .map(item => item.text || '')
        .join('');

      if (textContent) {
        result.content = textContent;
      }

      // 提取思考内容
      const thinkingBlock = responseData.content.find(item => item.type === 'thinking');
      if (thinkingBlock) {
        result.thinking = thinkingBlock.thinking;
      }
    }
  } catch (e) {
    console.log(`[解析] 响应解析异常:`, e.message);
  }

  return result;
}

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

    console.log(`[请求] Prompt 长度: ${prompt.length} 字符`);
    console.log(`[请求] Max Tokens: ${maxTokens}`);
    console.log(`[请求] Tools: ${CODE_GENERATION_TOOLS.length} 个`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`[响应] HTTP ${res.statusCode}, 数据长度: ${data.length}`);

        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`JSON 解析失败: ${e.message}, 原始数据: ${data.substring(0, 500)}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

// ============ 主测试函数 ============
async function runTest() {
  console.log('========================================');
  console.log('Prompt 大小测试脚本');
  console.log('========================================');
  console.log(`模型: ${MODEL_ID}`);
  console.log(`API: ${API_BASE_URL}${API_ENDPOINT}`);
  console.log('');

  if (!API_KEY) {
    console.error('[错误] 请设置 ANTHROPIC_API_KEY 或 MINIMAX_API_KEY 环境变量');
    process.exit(1);
  }

  // 构建测试 prompt
  const prompt = buildBackendTaskPrompt();

  console.log('[信息] 生成后端任务测试 prompt');
  console.log(`[信息] Prompt 长度: ${prompt.length} 字符`);
  console.log('');

  try {
    console.log('[开始] 发送请求...');
    const startTime = Date.now();
    const response = await makeRequest(prompt);
    const duration = Date.now() - startTime;

    console.log(`[完成] 请求耗时: ${duration}ms`);
    console.log('');

    // 打印原始响应（截断到前2000字符）
    console.log('========================================');
    console.log('原始响应（预览）');
    console.log('========================================');
    console.log(JSON.stringify(response).substring(0, 2000));
    console.log('...');
    console.log('');

    // 解析响应
    console.log('========================================');
    console.log('响应解析');
    console.log('========================================');

    const parsed = parseResponse(response);

    console.log('');
    console.log('========================================');
    console.log('解析结果汇总');
    console.log('========================================');
    console.log(`解析到的 tool_calls 数量: ${parsed.toolCalls.length}`);

    if (parsed.toolCalls.length > 0) {
      console.log('\n文件列表:');
      parsed.toolCalls.forEach((tc, i) => {
        console.log(`  ${i + 1}. ${tc.file_path} (${tc.content_length} 字节)`);
      });
    }

    if (parsed.thinking) {
      console.log(`\n思考内容长度: ${parsed.thinking.length} 字符`);
      console.log('思考内容预览:');
      console.log(parsed.thinking.substring(0, 500) + '...');
    }

    // 总结
    console.log('');
    console.log('========================================');
    console.log('测试结果');
    console.log('========================================');
    if (parsed.toolCalls.length >= 6) {
      console.log('✅ 成功: 解析到所有 6 个文件');
    } else if (parsed.toolCalls.length > 0) {
      console.log(`⚠️ 部分成功: 只解析到 ${parsed.toolCalls.length} 个文件`);
    } else {
      console.log('❌ 失败: 没有解析到任何文件');
    }

  } catch (e) {
    console.error('[错误]', e.message);
  }
}

// 运行测试
runTest();
