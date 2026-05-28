// ============================================================
// 电商平台 - TypeScript 类型定义
// ============================================================

// ============================================================
// [COMMON] 通用类型
// ============================================================

export interface ApiError {
  code: string;
  message: string;
}

export interface SuccessResponse {
  success: true;
  message: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
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

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  imageUrl: string;
  stock: number;
}

export interface Cart {
  items: CartItem[];
  totalAmount: number;
  totalItems: number;
}

export interface ShippingAddress {
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  zipCode?: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  imageUrl: string;
  subtotal: number;
}

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  shippingAddress: ShippingAddress;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddCartItemRequest {
  productId: string;
  quantity: number;
}

export interface UpdateCartItemRequest {
  quantity: number;
}

export interface CreateOrderRequest {
  shippingAddress: ShippingAddress;
  notes?: string;
}

export interface ProductFilters {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  sort?: 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'newest';
}

export interface OrderFilters {
  status?: OrderStatus;
  page?: number;
  limit?: number;
}

export type ProductSortOption = 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'newest';

// ============================================================
// [FILE: src/services/api.ts]
// ============================================================

export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface ApiRequestInterceptor {
  onFulfilled?: (config: ApiClientConfig) => ApiClientConfig | Promise<ApiClientConfig>;
  onRejected?: (error: ApiError) => ApiError | Promise<ApiError>;
}

export interface ApiResponseInterceptor {
  onFulfilled?: (response: unknown) => unknown | Promise<unknown>;
  onRejected?: (error: ApiError) => ApiError | Promise<ApiError>;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

// ============================================================
// [FILE: src/pages/Home.tsx]
// ============================================================

export interface HomePageData {
  featuredProducts: Product[];
  categories: string[];
  heroBanner: {
    title: string;
    subtitle: string;
    imageUrl: string;
    linkUrl: string;
  } | null;
}

export interface CategoryCard {
  name: string;
  imageUrl: string;
  productCount: number;
}

// ============================================================
// [FILE: src/pages/Login.tsx]
// ============================================================

export interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface LoginFormErrors {
  email?: string;
  password?: string;
  general?: string;
}

// ============================================================
// [FILE: src/pages/Register.tsx]
// ============================================================

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

// ============================================================
// [FILE: src/pages/ProductList.tsx]
// ============================================================

export interface ProductListState {
  products: Product[];
  loading: boolean;
  error: string | null;
  filters: ProductFilters;
  totalPages: number;
  total: number;
}

export interface ProductListAction {
  type: 'SET_PRODUCTS' | 'SET_LOADING' | 'SET_ERROR' | 'SET_FILTERS' | 'SET_PAGE';
  payload?: unknown;
}

// ============================================================
// [FILE: src/pages/ProductDetail.tsx]
// ============================================================

export interface ProductDetailState {
  product: Product | null;
  loading: boolean;
  error: string | null;
  quantity: number;
}

export interface ProductGallery {
  images: string[];
  currentIndex: number;
}

// ============================================================
// [FILE: src/pages/Cart.tsx]
// ============================================================

export interface CartPageState {
  cart: Cart | null;
  loading: boolean;
  error: string | null;
  updatingItemId: string | null;
}

export interface CartSummaryProps {
  totalAmount: number;
  totalItems: number;
  onCheckout: () => void;
  disabled: boolean;
}

// ============================================================
// [FILE: src/pages/OrderList.tsx]
// ============================================================

export interface OrderListState {
  orders: Order[];
  loading: boolean;
  error: string | null;
  filters: OrderFilters;
  totalPages: number;
  total: number;
}

export interface OrderStatusBadgeProps {
  status: OrderStatus;
}

// ============================================================
// [FILE: src/pages/OrderDetail.tsx]
// ============================================================

export interface OrderDetailState {
  order: Order | null;
  loading: boolean;
  error: string | null;
}

export interface OrderTimeline {
  status: OrderStatus;
  timestamp: string;
  label: string;
  completed: boolean;
}

// ============================================================
// [FILE: src/components/Header.tsx]
// ============================================================

export interface HeaderProps {
  isAuthenticated: boolean;
  userName?: string;
  cartItemCount: number;
}

export interface NavLink {
  label: string;
  path: string;
  requiresAuth: boolean;
}

// ============================================================
// [FILE: src/components/ProductCard.tsx]
// ============================================================

export interface ProductCardProps {
  product: Product;
  onAddToCart?: (productId: string) => void;
  onCardClick?: (productId: string) => void;
  variant?: 'grid' | 'list';
}

// ============================================================
// [FILE: src/components/CartItem.tsx]
// ============================================================

export interface CartItemProps {
  item: CartItem;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  loading?: boolean;
}

// ============================================================
// [FILE: src/components/Button.tsx]
// ============================================================

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

// ============================================================
// [FILE: src/components/Input.tsx]
// ============================================================

export type InputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';

export interface InputProps {
  type?: InputType;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  autoComplete?: string;
  className?: string;
  ariaLabel?: string;
  maxLength?: number;
  minLength?: number;
}

// ============================================================
// [FILE: src/components/Loading.tsx]
// ============================================================

export type LoadingSize = 'sm' | 'md' | 'lg';

export interface LoadingProps {
  size?: LoadingSize;
  text?: string;
  fullPage?: boolean;
  overlay?: boolean;
  className?: string;
}
