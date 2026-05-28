// ============================================================
// 电商平台 - TypeScript 类型定义
// ============================================================

// ──────────────────────────────────────────────
// [COMMON] 通用类型 — 全平台共享
// ──────────────────────────────────────────────

export interface ApiError {
  code: string;
  message: string;
}

export interface SuccessResponse {
  success: true;
  message: string;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type ProductSortBy =
  | 'price_asc'
  | 'price_desc'
  | 'newest'
  | 'name';

export type UserRole = 'customer' | 'admin';

// ──────────────────────────────────────────────
// [FILE: types/index.ts] 领域实体类型
// ──────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  categoryId: string;
  imageUrl: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CartItem {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  total: number;
}

export interface AddCartItemRequest {
  productId: string;
  quantity: number;
}

export interface UpdateCartItemRequest {
  quantity: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  shippingAddress: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderRequest {
  shippingAddress: string;
  remark?: string;
}

export interface OrderListResponse {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
}

// ──────────────────────────────────────────────
// [FILE: contracts/api.json] API 契约元类型
// ──────────────────────────────────────────────

/** 所有 API 端点路径字面量 */
export type ApiEndpoint =
  | '/auth/register'
  | '/auth/login'
  | '/auth/logout'
  | '/auth/me'
  | '/products'
  | '/products/{id}'
  | '/categories'
  | '/cart'
  | '/cart/items'
  | '/cart/items/{itemId}'
  | '/orders'
  | '/orders/{id}';

/** HTTP 方法与端点映射 */
export interface ApiRouteMap {
  'POST /auth/register': { body: RegisterRequest; response: AuthResponse };
  'POST /auth/login': { body: LoginRequest; response: AuthResponse };
  'POST /auth/logout': { body: void; response: SuccessResponse };
  'GET /auth/me': { body: void; response: User };
  'GET /products': { body: void; query: ProductQueryParams; response: ProductListResponse };
  'GET /products/{id}': { body: void; response: Product };
  'GET /categories': { body: void; response: Category[] };
  'GET /cart': { body: void; response: Cart };
  'POST /cart/items': { body: AddCartItemRequest; response: Cart };
  'PUT /cart/items/{itemId}': { body: UpdateCartItemRequest; response: Cart };
  'DELETE /cart/items/{itemId}': { body: void; response: Cart };
  'GET /orders': { body: void; query: OrderQueryParams; response: OrderListResponse };
  'POST /orders': { body: CreateOrderRequest; response: Order };
  'GET /orders/{id}': { body: void; response: Order };
}

export interface ProductQueryParams {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  keyword?: string;
  sortBy?: ProductSortBy;
}

export interface OrderQueryParams {
  status?: OrderStatus;
  page?: number;
  pageSize?: number;
}

// ──────────────────────────────────────────────
// [FILE: server/database/db.ts] 数据库表结构
// ──────────────────────────────────────────────

export interface DbUser {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

export interface DbProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category_id: string;
  image_url: string;
  created_at: string;
}

export interface DbCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface DbCart {
  id: string;
  user_id: string;
  created_at: string;
}

export interface DbCartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
}

export interface DbOrder {
  id: string;
  user_id: string;
  total_amount: number;
  status: OrderStatus;
  shipping_address: string;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

/** SQLite 数据库完整 schema 映射 */
export interface DatabaseSchema {
  users: DbUser;
  products: DbProduct;
  categories: DbCategory;
  carts: DbCart;
  cart_items: DbCartItem;
  orders: DbOrder;
  order_items: DbOrderItem;
}

// ──────────────────────────────────────────────
// [FILE: server/routes/auth.ts] 认证路由专用
// ──────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AuthRequestExtensions {
  userId: string;
  userEmail: string;
  userRole: UserRole;
}

/** Express Request 扩展（通过中间件注入） */
declare global {
  namespace Express {
    interface Request {
      auth?: AuthRequestExtensions;
    }
  }
}

// ──────────────────────────────────────────────
// [FILE: src/pages/Home.tsx] 首页组件 Props
// ──────────────────────────────────────────────

export interface HomePageData {
  featuredProducts: Product[];
  categories: Category[];
}

export interface ProductCardProps {
  product: Product;
  onAddToCart?: (productId: string) => void;
}

export interface CategoryTagProps {
  category: Category;
  onClick?: (categoryId: string) => void;
}

export interface SearchBarProps {
  defaultValue?: string;
  onSearch: (keyword: string) => void;
}

// ──────────────────────────────────────────────
// [FILE: src/pages/Login.tsx] 登录页组件 Props
// ──────────────────────────────────────────────

export interface LoginFormData {
  email: string;
  password: string;
}

export interface LoginFormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export interface RegisterFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface RegisterFormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

export type AuthMode = 'login' | 'register';

// ──────────────────────────────────────────────
// [FILE: src/pages/Cart.tsx] 购物车页组件 Props
// ──────────────────────────────────────────────

export interface CartPageProps {
  cart: Cart | null;
  isLoading: boolean;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemoveItem: (itemId: string) => void;
  onCheckout: (shippingAddress: string, remark?: string) => void;
}

export interface CartItemRowProps {
  item: CartItem;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
}

export interface CartSummaryProps {
  subtotal: number;
  itemCount: number;
  onCheckout: () => void;
}

export interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (shippingAddress: string, remark?: string) => void;
  isSubmitting: boolean;
}
