// ============================================================
// 电商平台 - TypeScript 类型定义
// ============================================================

// ============================================================
// [COMMON] 通用类型定义
// ============================================================

/** API 错误响应 */
export interface ApiError {
  code: string;
  message: string;
}

/** 通用成功响应 */
export interface SuccessResponse {
  success: true;
  message: string;
}

/** 通用分页信息 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** 分页查询参数 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/** 用户基本信息 */
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 商品分类 */
export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
}

/** 商品信息 */
export interface Product {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  originalPrice?: number | null;
  stock: number;
  images: string[];
  categoryId: string;
  categoryName: string;
  rating?: number | null;
  reviewCount?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 购物车项 */
export interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  stock: number;
}

/** 购物车数据 */
export interface Cart {
  items: CartItem[];
  totalQuantity: number;
  totalAmount: number;
}

/** 收货地址 */
export interface Address {
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  zipCode?: string | null;
}

/** 订单项 */
export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
}

/** 订单状态枚举 */
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

/** 订单信息 */
export interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  shippingAddress: Address;
  paymentMethod?: string | null;
  paidAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 商品排序方式 */
export type ProductSort = 'price_asc' | 'price_desc' | 'newest' | 'name';

// ============================================================
// [FILE: server/database/db.ts]
// ============================================================

/** 数据库配置 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
  idleTimeoutMillis?: number;
}

/** 数据库查询结果通用包装 */
export interface DbQueryResult<T> {
  rows: T[];
  rowCount: number;
}

/** 数据库用户记录 */
export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  avatar: string | null;
  created_at: string;
  updated_at: string;
}

/** 数据库商品记录 */
export interface DbProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  stock: number;
  images: string[];
  category_id: string;
  is_active: boolean;
  rating: number | null;
  review_count: number | null;
  created_at: string;
  updated_at: string;
}

/** 数据库购物车记录 */
export interface DbCartItem {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

/** 数据库订单记录 */
export interface DbOrder {
  id: string;
  user_id: string;
  order_number: string;
  total_amount: number;
  status: OrderStatus;
  shipping_address: Address;
  payment_method: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 数据库订单项记录 */
export interface DbOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
}

// ============================================================
// [FILE: server/index.ts]
// ============================================================

/** 服务器配置 */
export interface ServerConfig {
  port: number;
  host: string;
  corsOrigin: string;
  jwtSecret: string;
  jwtExpiresIn: string;
}

/** Express 应用全局中间件选项 */
export interface MiddlewareOptions {
  corsOrigin: string;
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
}

/** 健康检查响应 */
export interface HealthCheckResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
  version: string;
}

// ============================================================
// [FILE: server/routes/auth.ts]
// ============================================================

/** JWT 载荷 */
export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

/** 注册请求体 */
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

/** 登录请求体 */
export interface LoginRequest {
  email: string;
  password: string;
}

/** 认证响应 */
export interface AuthResponse {
  user: User;
  token: string;
}

/** 用户信息响应 */
export interface UserResponse {
  user: User;
}

/** 认证路由中间件扩展 - Express Request 上挂载的用户 */
export interface AuthenticatedRequest extends Express.Request {
  user?: JwtPayload;
}

/** 密码哈希配置 */
export interface PasswordHashConfig {
  saltRounds: number;
}

// ============================================================
// [FILE: server/routes/products.ts]
// ============================================================

/** 商品查询参数 */
export interface ProductQueryParams extends PaginationParams {
  category?: string;
  sort?: ProductSort;
  keyword?: string;
  minPrice?: number;
  maxPrice?: number;
}

/** 商品列表响应 */
export interface ProductListResponse {
  products: Product[];
  pagination: Pagination;
}

/** 商品详情响应 */
export interface ProductDetailResponse {
  product: Product;
}

/** 分类列表响应 */
export interface CategoryListResponse {
  categories: Category[];
}

/** 商品搜索过滤条件 */
export interface ProductFilters {
  category?: string;
  keyword?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
}

// ============================================================
// [FILE: server/routes/cart.ts]
// ============================================================

/** 添加购物车项请求 */
export interface AddCartItemRequest {
  productId: string;
  quantity: number;
}

/** 更新购物车项请求 */
export interface UpdateCartItemRequest {
  quantity: number;
}

/** 购物车响应 */
export interface CartResponse {
  items: CartItem[];
  totalQuantity: number;
  totalAmount: number;
}

/** 购物车操作结果 */
export interface CartOperationResult {
  success: boolean;
  message: string;
  cart: Cart;
}

// ============================================================
// [FILE: server/routes/orders.ts]
// ============================================================

/** 创建订单请求 */
export interface CreateOrderRequest {
  shippingAddress: Address;
  paymentMethod?: string;
  remark?: string | null;
}

/** 订单响应 */
export interface OrderResponse {
  order: Order;
}

/** 订单列表响应 */
export interface OrderListResponse {
  orders: Order[];
  pagination: Pagination;
}

/** 订单查询参数 */
export interface OrderQueryParams extends PaginationParams {
  status?: OrderStatus;
}

/** 订单服务层结果 */
export interface OrderServiceResult {
  success: boolean;
  order?: Order;
  error?: string;
}

// ============================================================
// [FILE: src/App.tsx]
// ============================================================

/** 应用路由配置项 */
export interface AppRouteConfig {
  path: string;
  element: React.ReactElement;
  requiresAuth?: boolean;
  title: string;
}

/** 全局认证上下文 */
export interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

/** 受保护路由属性 */
export interface ProtectedRouteProps {
  children: React.ReactElement;
}

// ============================================================
// [FILE: src/main.tsx]
// ============================================================

/** 应用根渲染配置 */
export interface AppRenderConfig {
  rootElement: HTMLElement;
  strictMode: boolean;
}

/** 浏览器环境声明 */
export interface BrowserEnv {
  VITE_API_BASE_URL: string;
  VITE_APP_TITLE: string;
  VITE_APP_VERSION: string;
}

// ============================================================
// [FILE: src/services/api.ts]
// ============================================================

/** API 客户端配置 */
export interface ApiClientConfig {
  baseURL: string;
  timeout: number;
  headers: Record<string, string>;
}

/** API 请求配置 */
export interface ApiRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  data?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
}

/** API 响应通用包装 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  statusText: string;
}

/** API 服务层拦截器 */
export interface ApiInterceptor {
  onRequest?: (config: ApiRequestConfig) => ApiRequestConfig;
  onResponse?: <T>(response: ApiResponse<T>) => ApiResponse<T>;
  onError?: (error: ApiError) => Promise<never>;
}

/** Token 存储服务接口 */
export interface TokenStorage {
  getToken: () => string | null;
  setToken: (token: string) => void;
  removeToken: () => void;
}

/** API 端点路径常量 */
export type ApiEndpoint =
  | '/api/auth/register'
  | '/api/auth/login'
  | '/api/auth/logout'
  | '/api/auth/me'
  | '/api/products'
  | '/api/products/categories'
  | '/api/cart'
  | '/api/cart/items'
  | '/api/orders';

// ============================================================
// [FILE: src/pages/Home.tsx]
// ============================================================

/** 首页展示数据 */
export interface HomePageData {
  featuredProducts: Product[];
  categories: Category[];
  newProducts: Product[];
  hotProducts: Product[];
}

/** 首页区块配置 */
export interface HomeSection {
  id: string;
  title: string;
  type: 'featured' | 'new' | 'hot' | 'categories';
  products?: Product[];
  categories?: Category[];
}

/** Banner / 轮播项 */
export interface BannerItem {
  id: string;
  image: string;
  title: string;
  link?: string;
  sortOrder: number;
}

// ============================================================
// [FILE: src/pages/Login.tsx]
// ============================================================

/** 登录表单数据 */
export interface LoginFormData {
  email: string;
  password: string;
}

/** 登录表单验证错误 */
export interface LoginFormErrors {
  email?: string;
  password?: string;
  general?: string;
}

/** 登录页面状态 */
export interface LoginPageState {
  formData: LoginFormData;
  errors: LoginFormErrors;
  isSubmitting: boolean;
  isSuccess: boolean;
}

// ============================================================
// [FILE: src/pages/Register.tsx]
// ============================================================

/** 注册表单数据 */
export interface RegisterFormData {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
}

/** 注册表单验证错误 */
export interface RegisterFormErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  name?: string;
  general?: string;
}

/** 注册页面状态 */
export interface RegisterPageState {
  formData: RegisterFormData;
  errors: RegisterFormErrors;
  isSubmitting: boolean;
  isSuccess: boolean;
}

// ============================================================
// [FILE: src/pages/ProductList.tsx]
// ============================================================

/** 商品列表筛选状态 */
export interface ProductListFilters {
  category: string;
  keyword: string;
  sort: ProductSort;
  minPrice: string;
  maxPrice: string;
}

/** 商品列表页面状态 */
export interface ProductListPageState {
  products: Product[];
  filters: ProductListFilters;
  pagination: Pagination;
  isLoading: boolean;
  error: string | null;
  categories: Category[];
}

/** 筛选面板属性 */
export interface ProductFilterPanelProps {
  filters: ProductListFilters;
  categories: Category[];
  onFilterChange: (filters: Partial<ProductListFilters>) => void;
  onReset: () => void;
}

// ============================================================
// [FILE: src/pages/ProductDetail.tsx]
// ============================================================

/** 商品详情页面状态 */
export interface ProductDetailPageState {
  product: Product | null;
  isLoading: boolean;
  error: string | null;
  selectedImageIndex: number;
  quantity: number;
  isAddingToCart: boolean;
  addToCartSuccess: boolean;
}

/** 商品详情页参数 */
export interface ProductDetailParams {
  id: string;
}

/** 商品图片画廊属性 */
export interface ProductImageGalleryProps {
  images: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

// ============================================================
// [FILE: src/pages/Cart.tsx]
// ============================================================

/** 购物车页面状态 */
export interface CartPageState {
  cart: Cart | null;
  isLoading: boolean;
  error: string | null;
  updatingItemId: string | null;
  removingItemId: string | null;
}

/** 购物车数量更新处理器 */
export interface CartQuantityHandler {
  (itemId: string, newQuantity: number): Promise<void>;
}

/** 购物车删除处理器 */
export interface CartRemoveHandler {
  (itemId: string): Promise<void>;
}

/** 结算摘要数据 */
export interface CheckoutSummary {
  totalQuantity: number;
  totalAmount: number;
  estimatedTax: number;
  shipping: number;
  finalAmount: number;
}

// ============================================================
// [FILE: src/pages/OrderList.tsx]
// ============================================================

/** 订单列表页面状态 */
export interface OrderListPageState {
  orders: Order[];
  pagination: Pagination;
  isLoading: boolean;
  error: string | null;
  statusFilter: OrderStatus | 'all';
}

/** 订单状态标签配置 */
export interface OrderStatusLabel {
  value: OrderStatus;
  label: string;
  color: string;
}

/** 订单列表筛选栏属性 */
export interface OrderFilterBarProps {
  currentFilter: OrderStatus | 'all';
  onFilterChange: (status: OrderStatus | 'all') => void;
}

// ============================================================
// [FILE: src/pages/OrderDetail.tsx]
// ============================================================

/** 订单详情页面状态 */
export interface OrderDetailPageState {
  order: Order | null;
  isLoading: boolean;
  error: string | null;
}

/** 订单详情页参数 */
export interface OrderDetailParams {
  id: string;
}

/** 订单时间线项 */
export interface OrderTimelineItem {
  id: string;
  status: OrderStatus;
  label: string;
  description: string;
  timestamp: string;
  isCompleted: boolean;
  isCurrent: boolean;
}

/** 订单操作按钮配置 */
export interface OrderAction {
  label: string;
  action: string;
  variant: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

// ============================================================
// [FILE: src/components/Header.tsx]
// ============================================================

/** Header 组件属性 */
export interface HeaderProps {
  isAuthenticated: boolean;
  userName?: string;
  userAvatar?: string | null;
  cartItemCount?: number;
  onLogin?: () => void;
  onRegister?: () => void;
  onLogout?: () => void;
  onCartClick?: () => void;
}

/** 导航菜单项 */
export interface NavMenuItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
  requiresAuth?: boolean;
}

/** 移动端菜单状态 */
export interface MobileMenuState {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

/** 搜索栏属性 */
export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (keyword: string) => void;
  placeholder?: string;
}

// ============================================================
// [FILE: src/components/ProductCard.tsx]
// ============================================================

/** ProductCard 组件属性 */
export interface ProductCardProps {
  product: Product;
  onAddToCart?: (productId: string) => void;
  onCardClick?: (productId: string) => void;
  showAddToCart?: boolean;
  className?: string;
}

/** 商品卡片折扣标签属性 */
export interface DiscountBadgeProps {
  originalPrice: number;
  currentPrice: number;
}

/** 商品卡片星级评价属性 */
export interface StarRatingProps {
  rating: number;
  reviewCount?: number;
  size?: 'sm' | 'md' | 'lg';
}

// ============================================================
// [FILE: src/components/CartItem.tsx]
// ============================================================

/** CartItem 组件属性 */
export interface CartItemProps {
  item: CartItem;
  onQuantityChange: (itemId: string, newQuantity: number) => void;
  onRemove: (itemId: string) => void;
  isUpdating?: boolean;
  isRemoving?: boolean;
  disabled?: boolean;
}

/** 数量选择器属性 */
export interface QuantitySelectorProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

// ============================================================
// [FILE: src/components/Button.tsx]
// ============================================================

/** 按钮变体类型 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';

/** 按钮尺寸类型 */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Button 组件属性 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

/** 按钮样式映射 */
export interface ButtonStyleMap {
  variant: Record<ButtonVariant, string>;
  size: Record<ButtonSize, string>;
}

// ============================================================
// [FILE: src/components/Input.tsx]
// ============================================================

/** 输入框类型 */
export type InputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';

/** Input 组件属性 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconClick?: () => void;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'filled' | 'outlined';
}

/** 表单控件通用包装属性 */
export interface FormControlProps {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

// ============================================================
// [FILE: src/components/Loading.tsx]
// ============================================================

/** Loading 组件属性 */
export interface LoadingProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'spinner' | 'dots' | 'pulse' | 'skeleton';
  text?: string;
  fullPage?: boolean;
  overlay?: boolean;
  className?: string;
}

/** 骨架屏属性 */
export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  count?: number;
  className?: string;
}

/** 加载状态进度属性 */
export interface LoadingProgressProps {
  progress: number;
  label?: string;
  showPercentage?: boolean;
  variant?: 'bar' | 'circle';
  size?: 'sm' | 'md' | 'lg';
}
