import { useState, useEffect, useCallback, useRef } from 'react';
import RuleTable from './components/RuleTable';
import RuleForm from './components/RuleForm';
import ModelForm from './components/ModelForm';
import DecomposerConfig from './components/config/DecomposerConfig';
import OrchestratorConfig from './components/config/OrchestratorConfig';
import CircuitBreakerConfig from './components/config/CircuitBreakerConfig';
import ExecutorConfig from './components/config/ExecutorConfig';
import CostControlConfig from './components/config/CostControlConfig';
import SessionConfig from './components/config/SessionConfig';
import RateLimiterConfig from './components/config/RateLimiterConfig';
import LearningEngineConfig from './components/config/LearningEngineConfig';
import RetryManagerConfig from './components/config/RetryManagerConfig';
import IntegratorConfig from './components/config/IntegratorConfig';
import ExtensionsConfig from './components/config/ExtensionsConfig';
import ModelTaskMatrixConfig from './components/config/ModelTaskMatrixConfig';
import DimensionWeightsConfig from './components/config/DimensionWeightsConfig';
import MetricsDashboard from './components/metrics/MetricsDashboard';
import FlowMonitor from './components/flow/FlowMonitor';
import ModelResponseMonitor from './components/monitor/ModelResponseMonitor';
import { getSelectionRules, addSelectionRule, updateSelectionRule, deleteSelectionRule, getModels, addModel, updateModel, deleteModel, resetToDefaults, createCustomAdapter, getAdapterConfig } from './config/api';

// ================= 类型定义 =================
interface Provider {
  name: string;
  api_base_url: string;
  api_key_env: string;
  api_key: string;
  models: Model[];
  transformer?: string;
  headers?: string;
  adapter?: string;
}

interface Model {
  id: string;
  name: string;
  api_model_id: string;
  capabilities: string[];
  strengths: string[];
  pricing: { input: number; output: number };
  context_limit: number;
  quality_score: number;
  speed: string;
  max_concurrency: number;
  response_time: number;
}

interface SelectorConfig {
  default: string;
  background: string;
  think: string;
  longContext: string;
  longContextThreshold: number;
  webSearch: string;
  image: string;
  code: string;
  reasoning: string;
}

interface CostControlConfig {
  dailyBudget: number;
  maxCostPerTask: number;
  qualityFirst: boolean;
  safetyMargin: number;
  conservativeEstimation: boolean;
}

interface ExecutorConfig {
  defaultMaxConcurrency: number;
  defaultTimeout: number;
  enableTracing: boolean;
  enableMonitoring: boolean;
  retry: {
    maxRetries: number;
    baseDelay: number;
    exponentialBase: number;
    jitter: boolean;
  };
  rateLimit: {
    defaultRps: number;
    burstCapacity: number;
  };
}

interface SystemConfig {
  host: string;
  port: number;
  debug: boolean;
  logLevel: string;
  apiTimeoutMs: number;
  maxConcurrency: number;
}

interface Config {
  system: SystemConfig;
  Providers: Provider[];
  selector: SelectorConfig;
  costControl: CostControlConfig;
  executor: ExecutorConfig;
  decomposer?: any;
  orchestrator?: any;
  circuit_breaker?: any;
  session?: any;
  retry_manager?: any;
  rate_limiter?: any;
  learning_engine?: any;
  integrator?: any;
  orchestrator_extensions?: any;
}

// ================= 默认配置 =================
const defaultConfig: Config = {
  system: {
    host: "127.0.0.1",
    port: 3458,
    debug: false,
    logLevel: "info",
    apiTimeoutMs: 600000,
    maxConcurrency: 10
  },
  Providers: [
    {
      name: "aliyun",
      api_base_url: "https://coding.dashscope.aliyuncs.com/v1",
      api_key_env: "DASHSCOPE_API_KEY",
      api_key: "",
      models: [],
      transformer: "",
      headers: ""
    }
  ],
  selector: {
    default: "aliyun,qwen3-coder-plus",
    background: "aliyun,qwen3-coder-plus",
    think: "aliyun,qwen3-max-2026-01-23",
    longContext: "aliyun,qwen3.5-plus",
    longContextThreshold: 100000,
    webSearch: "aliyun,kimi-k2.5",
    image: "aliyun,qwen3-coder-plus",
    code: "aliyun,qwen3-coder-next",
    reasoning: "deepseek,deepseek-reasoner"
  },
  costControl: {
    dailyBudget: 10.00,
    maxCostPerTask: 0.50,
    qualityFirst: false,
    safetyMargin: 0.2,
    conservativeEstimation: true
  },
  executor: {
    defaultMaxConcurrency: 10,
    defaultTimeout: 60000,
    enableTracing: true,
    enableMonitoring: true,
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      exponentialBase: 2.0,
      jitter: true
    },
    rateLimit: {
      defaultRps: 10,
      burstCapacity: 30
    }
  }
};

// ================= 预定义的模板 =================
const providerTemplates: Record<string, Omit<Provider, 'models'>> = {
  aliyun: { name: "aliyun", api_base_url: "https://coding.dashscope.aliyuncs.com/v1", api_key_env: "DASHSCOPE_API_KEY", api_key: "", transformer: "", headers: "" },
  deepseek: { name: "deepseek", api_base_url: "https://api.deepseek.com/v1", api_key_env: "DEEPSEEK_API_KEY", api_key: "", transformer: "", headers: "" },
  google: { name: "google", api_base_url: "https://generativelanguage.googleapis.com/v1beta", api_key_env: "GEMINI_API_KEY", api_key: "", transformer: "", headers: "" },
  openai: { name: "openai", api_base_url: "https://api.openai.com/v1", api_key_env: "OPENAI_API_KEY", api_key: "", transformer: "", headers: "" },
  anthropic: { name: "anthropic", api_base_url: "https://api.anthropic.com/v1", api_key_env: "ANTHROPIC_API_KEY", api_key: "", transformer: "", headers: "" },
  ollama: { name: "ollama", api_base_url: "http://localhost:11434/api", api_key_env: "", api_key: "", transformer: "", headers: "" }
};

const modelTemplates: Record<string, Model[]> = {
  aliyun: [
    { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus", api_model_id: "qwen-coder-plus-latest", capabilities: ["code", "logic", "api"], strengths: ["代码生成", "逻辑推理"], pricing: { input: 0.00005, output: 0.0001 }, context_limit: 32768, quality_score: 8.5, speed: "fast", max_concurrency: 10, response_time: 5000 },
    { id: "qwen3-coder-next", name: "Qwen3 Coder Next", api_model_id: "qwen-coder-plus-latest", capabilities: ["code", "complex-tasks"], strengths: ["复杂代码任务"], pricing: { input: 0.00007, output: 0.00014 }, context_limit: 32768, quality_score: 9.0, speed: "medium", max_concurrency: 10, response_time: 5000 },
    { id: "qwen3.5-plus", name: "Qwen3.5 Plus", api_model_id: "qwen-plus-latest", capabilities: ["long-context", "complex-tasks"], strengths: ["长上下文处理"], pricing: { input: 0.0001, output: 0.0002 }, context_limit: 32768, quality_score: 9.2, speed: "medium", max_concurrency: 10, response_time: 5000 },
    { id: "qwen3-max-2026-01-23", name: "Qwen3 Max", api_model_id: "qwen-max-latest", capabilities: ["max-context", "reasoning"], strengths: ["深度推理"], pricing: { input: 0.0002, output: 0.0004 }, context_limit: 32768, quality_score: 9.5, speed: "slow", max_concurrency: 10, response_time: 8000 },
    { id: "kimi-k2.5", name: "Kimi K2.5", api_model_id: "kimi-latest", capabilities: ["long-context", "web-search"], strengths: ["长文档处理", "网页搜索"], pricing: { input: 0.00012, output: 0.00024 }, context_limit: 32768, quality_score: 8.7, speed: "medium", max_concurrency: 10, response_time: 6000 },
    { id: "glm-5", name: "GLM-5", api_model_id: "glm-4", capabilities: ["reasoning", "coding"], strengths: ["逻辑推理", "代码生成"], pricing: { input: 0.0001, output: 0.0002 }, context_limit: 16384, quality_score: 8.8, speed: "medium", max_concurrency: 10, response_time: 6000 },
    { id: "glm-4.7", name: "GLM-4.7", api_model_id: "glm-4-air", capabilities: ["balanced", "efficient"], strengths: ["平衡性能"], pricing: { input: 0.00007, output: 0.00014 }, context_limit: 16384, quality_score: 8.2, speed: "fast", max_concurrency: 10, response_time: 5000 },
    { id: "MiniMax-M2.5", name: "MiniMax M2.5", api_model_id: "MiniMax-M2.5", capabilities: ["balanced", "general"], strengths: ["通用任务"], pricing: { input: 0.00008, output: 0.00016 }, context_limit: 32768, quality_score: 8.0, speed: "fast", max_concurrency: 10, response_time: 5000 }
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek Chat", api_model_id: "deepseek-chat", capabilities: ["chat", "coding"], strengths: ["对话", "代码编写"], pricing: { input: 0.000014, output: 0.000028 }, context_limit: 128000, quality_score: 7.5, speed: "fast", max_concurrency: 10, response_time: 5000 },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner", api_model_id: "deepseek-reasoner", capabilities: ["reasoning", "complex-tasks"], strengths: ["复杂推理"], pricing: { input: 0.000028, output: 0.000056 }, context_limit: 128000, quality_score: 8.5, speed: "medium", max_concurrency: 10, response_time: 7000 }
  ],
  google: [
    { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", api_model_id: "gemini-3.1-pro-preview", capabilities: ["multi-modal", "reasoning"], strengths: ["多模态", "复杂推理"], pricing: { input: 0.000075, output: 0.0003 }, context_limit: 1048576, quality_score: 9.0, speed: "fast", max_concurrency: 10, response_time: 5000 }
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o", api_model_id: "gpt-4o", capabilities: ["chat", "coding", "reasoning"], strengths: ["通用任务", "代码生成"], pricing: { input: 0.000005, output: 0.000015 }, context_limit: 128000, quality_score: 9.0, speed: "fast", max_concurrency: 10, response_time: 3000 },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", api_model_id: "gpt-4o-mini", capabilities: ["chat", "coding"], strengths: ["性价比", "快速响应"], pricing: { input: 0.00000015, output: 0.0000006 }, context_limit: 128000, quality_score: 8.0, speed: "fast", max_concurrency: 10, response_time: 2000 }
  ],
  anthropic: [
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", api_model_id: "claude-sonnet-4-6", capabilities: ["chat", "coding", "reasoning"], strengths: ["平衡性能", "代码质量"], pricing: { input: 0.000003, output: 0.000015 }, context_limit: 200000, quality_score: 9.2, speed: "fast", max_concurrency: 10, response_time: 4000 },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", api_model_id: "claude-opus-4-6", capabilities: ["chat", "coding", "reasoning", "complex-tasks"], strengths: ["最高质量", "复杂任务"], pricing: { input: 0.000015, output: 0.000075 }, context_limit: 200000, quality_score: 9.8, speed: "medium", max_concurrency: 10, response_time: 6000 }
  ],
  ollama: [
    { id: "llama3.2", name: "Llama 3.2", api_model_id: "llama3.2", capabilities: ["chat", "local"], strengths: ["本地运行", "隐私保护"], pricing: { input: 0, output: 0 }, context_limit: 8192, quality_score: 7.0, speed: "fast", max_concurrency: 5, response_time: 2000 }
  ]
};

// ================= UI 组件 =================

const Toggle = ({ checked, onChange, label, desc }: { checked: boolean, onChange: (v: boolean) => void, label: string, desc?: string }) => (
  <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors shadow-sm cursor-pointer" onClick={() => onChange(!checked)}>
    <div className="pr-4">
      <div className="font-semibold text-slate-800 text-sm">{label}</div>
      {desc && <div className="text-xs text-slate-500 mt-1">{desc}</div>}
    </div>
    <button
      type="button"
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${checked ? 'bg-indigo-600' : 'bg-slate-200'}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  </div>
);

const InputGroup = ({ label, desc, type = "text", value, onChange, placeholder = "", className = "" }: any) => (
  <div className={`space-y-1.5 ${className}`}>
    <label className="block text-sm font-semibold text-slate-700">{label}</label>
    {desc && <p className="text-xs text-slate-500 mb-2">{desc}</p>}
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
    />
  </div>
);

// 图标集
const Icons = {
  Server: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"></path></svg>,
  Cloud: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path></svg>,
  Route: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>,
  Dollar: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>,
  Cog: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>,
  Log: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>,
  Chart: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>,
  Component: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path></svg>,
  Orchestrator: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>,
  Breaker: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>,
  ChevronDown: ({ className = "" }: { className?: string }) => <svg className={`w-5 h-5 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>,
  Plus: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>,
  Trash: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>,
  Save: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>,
  Refresh: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>,
  Download: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>,
  Upload: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>,
  Matrix: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>,
};


// ================= 主应用 =================
function App() {
  const [activeTab, setActiveTab] = useState<'system' | 'providers' | 'selector' | 'cost' | 'executor' | 'logs' | 'decomposer' | 'orchestrator' | 'circuit_breaker' | 'session' | 'rate_limiter' | 'learning_engine' | 'retry_manager' | 'integrator' | 'extensions' | 'metrics' | 'flow' | 'monitor' | 'model_task_matrix' | 'dimension_weights'>('system');
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [newProviderType, setNewProviderType] = useState('');

  // 规则管理状态
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [ruleRefreshKey, setRuleRefreshKey] = useState(0);

  // 模型管理状态
  const [showModelForm, setShowModelForm] = useState(false);
  const [editingModel, setEditingModel] = useState<any>(null);
  const [targetProvider, setTargetProvider] = useState<string | null>(null); // 新增：追踪用户想要添加模型的目标提供商
  const [modelList, setModelList] = useState<any[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelRefreshKey, setModelRefreshKey] = useState(0);

  // 转接口适配器相关状态
  const [availableAdapters, setAvailableAdapters] = useState<{name: string; displayName: string; format: string; isCustom?: boolean}[]>([]);
  const [adapterConfig, setAdapterConfig] = useState<{providerMapping: Record<string, string>; defaultAdapter: string} | null>(null);

  // 日志相关状态
  const [logs, setLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState<string>('all'); // all, info, warn, error, debug
  const [logComponentFilter, setLogComponentFilter] = useState<string>('all'); // all, orchestrator, decomposer, etc.
  const [logSearch, setLogSearch] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [pollingInterval, setPollingInterval] = useState<number>(2000); // 2秒轮询一次

  // 辅助函数
  const getLogLevelClass = (level: string) => {
    switch(level.toLowerCase()) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      case 'debug':
        return 'text-gray-400';
      default:
        return 'text-green-400';
    }
  };

  const filteredLogs = logs.filter(log => {
    // 过滤日志级别
    if (logFilter !== 'all' && log.level !== logFilter) {
      return false;
    }

    // 过滤搜索关键词
    if (logComponentFilter !== 'all' && !log.module.includes(logComponentFilter)) {
      return false;
    }

    // 过滤搜索关键词
    if (logSearch && !log.message.toLowerCase().includes(logSearch.toLowerCase())) {
      return false;
    }

    return true;
  });

  // 获取日志的异步函数 - 使用 useCallback 避免闭包问题
  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (logFilter !== 'all') params.append('level', logFilter);
      if (logComponentFilter !== 'all') params.append('module', logComponentFilter);
      if (logSearch) params.append('search', logSearch);
      params.append('limit', '100');

      const response = await fetch(`http://localhost:3001/v1/logs?${params}`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('获取日志失败:', error);
    }
  }, [logFilter, logComponentFilter, logSearch]);

  // 清除日志
  const clearLogs = async () => {
    try {
      const response = await fetch('http://localhost:3001/v1/logs/clear', {
        method: 'POST'
      });
      if (response.ok) {
        setLogs([]);
        alert('日志已清除');
      }
    } catch (error) {
      console.error('清除日志失败:', error);
    }
  };

  // 设置定时器获取日志
  useEffect(() => {
    if (activeTab !== 'logs') return; // 只在日志标签页激活时轮询

    fetchLogs(); // 初始加载

    if (autoRefresh) {
      const timer = setInterval(fetchLogs, 2000); // 2 秒轮询一次
      return () => clearInterval(timer);
    }
  }, [activeTab, logFilter, logComponentFilter, logSearch, autoRefresh, fetchLogs]);

  const loadConfig = async () => {
    try {
      const response = await fetch('http://localhost:3458/config');
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      }
    } catch (error) {
      console.log('无法从服务器加载配置，使用默认配置');
    }
  };

  // 加载模型列表
  const loadModels = async () => {
    try {
      setModelLoading(true);
      const models = await getModels();
      setModelList(models);
    } catch (error) {
      console.error('加载模型失败:', error);
    } finally {
      setModelLoading(false);
    }
  };

  // 组件挂载时加载配置
  useEffect(() => {
    loadConfig();
  }, []);

  // 组件挂载时加载模型列表
  useEffect(() => {
    if (activeTab === 'providers') {
      loadModels();
      // 加载适配器配置
      fetch('http://localhost:3458/api/config/adapters')
        .then(res => res.json())
        .then(data => {
          setAvailableAdapters(data.adapters || []);
          setAdapterConfig(data.adapterConfig || null);
        })
        .catch(err => console.error('加载适配器配置失败:', err));
    }
  }, [activeTab, modelRefreshKey]);

  const saveConfig = async () => {
    setLoading(true);
    setMessage(null);
    try {
      // 直接将 UI 缓存的配置发送到服务器保存
      // 后端的 _validateAndMergeConfig 会处理配置合并，确保所有字段都被保留
      const response = await fetch('http://localhost:3458/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (response.ok) {
        setMessage({ type: 'success', text: '配置已保存到 config.json！' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error('保存失败：' + response.statusText);
      }
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败：' + (error instanceof Error ? error.message : '网络错误') });
    } finally {
      setLoading(false);
    }
  };

  // 导出配置到文件（直接从服务器获取完整配置）
  const exportConfig = async () => {
    try {
      // 直接从服务器获取最新完整配置
      const response = await fetch('http://localhost:3458/config');
      if (!response.ok) {
        throw new Error('无法从服务器获取配置');
      }
      const fullConfig = await response.json();

      const configJson = JSON.stringify(fullConfig, null, 2);
      const blob = new Blob([configJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `orchestrouter-config-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: '配置已导出成功！' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: '导出失败：' + (error instanceof Error ? error.message : '未知错误') });
    }
  };

  // 导入配置文件
  const importConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 检查文件大小
    if (file.size === 0) {
      setMessage({ type: 'error', text: '导入失败：文件为空' });
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setMessage({ type: 'error', text: '文件读取失败，请重试' });
      event.target.value = '';
    };
    reader.onload = async (e) => {
      try {
        const fileContent = e.target?.result as string;
        if (!fileContent || fileContent.trim() === '') {
          throw new Error('文件内容为空');
        }
        const importedConfig = JSON.parse(fileContent);

        // 验证配置格式
        if (!importedConfig.system || !importedConfig.Providers) {
          throw new Error('无效的配置文件格式');
        }

        // 询问用户是否确认导入
        if (!confirm(`确定要导入配置文件 "${file.name}" 吗？当前配置将被覆盖。`)) {
          return;
        }

        // 将导入的配置加载到 UI 缓存（不保存到文件）
        setConfig(importedConfig);
        setMessage({ type: 'success', text: '配置已导入到缓存，请点击"保存配置"将更改写入文件' });
        setTimeout(() => setMessage(null), 3000);
      } catch (error) {
        setMessage({ type: 'error', text: '导入失败：' + (error instanceof Error ? error.message : '无效的 JSON 格式') });
      } finally {
        // 清空文件输入
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // 保存选择规则
  const saveSelectionRule = async (rule) => {
    try {
      let result;
      if (editingRule) {
        // 更新现有规则
        const taskType = editingRule.taskTypes[0]; // 使用第一个任务类型作为标识
        result = await updateSelectionRule(taskType, rule);
      } else {
        // 添加新规则
        result = await addSelectionRule(rule);
      }

      // 检查 result 是否存在且有 success 字段
      if (result && typeof result === 'object' && result.success !== undefined) {
        if (result.success) {
          setMessage({ type: 'success', text: `规则${editingRule ? '已更新' : '已添加'}成功！` });
          setShowRuleForm(false);
          setEditingRule(null);
          setRuleRefreshKey(prev => prev + 1); // 触发规则表刷新
          // 重新加载配置以反映更改
          await loadConfig();
        } else {
          setMessage({ type: 'error', text: `规则${editingRule ? '更新' : '添加'}失败：${result.message || '未知错误'}` });
        }
      } else {
        // result 为 undefined 或格式不正确
        setMessage({ type: 'error', text: `规则${editingRule ? '更新' : '添加'}失败：服务器响应格式异常` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `规则${editingRule ? '更新' : '添加'}失败：${error.message}` });
    }
  };

  // 保存模型
  const saveModel = async (model) => {
    try {
      let result;
      if (editingModel) {
        // 更新现有模型
        result = await updateModel(model.id, model);
      } else {
        // 添加新模型
        result = await addModel(model);
      }

      // 检查 result 是否存在且有 success 字段
      if (result && typeof result === 'object' && result.success !== undefined) {
        if (result.success) {
          setMessage({ type: 'success', text: `模型${editingModel ? '已更新' : '已添加'}成功！` });
          setShowModelForm(false);
          setEditingModel(null);
          setModelRefreshKey(prev => prev + 1); // 触发模型列表刷新
          // 重新加载配置以反映更改
          await loadConfig();
        } else {
          setMessage({ type: 'error', text: `模型${editingModel ? '更新' : '添加'}失败：${result.message || '未知错误'}` });
        }
      } else {
        // result 为 undefined 或格式不正确
        setMessage({ type: 'error', text: `模型${editingModel ? '更新' : '添加'}失败：服务器响应格式异常` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `模型${editingModel ? '更新' : '添加'}失败：${error.message}` });
    }
  };

  const resetConfig = async () => {
    if (confirm('确定要重置为模板配置吗？这将丢失未保存的更改。')) {
      try {
        // 从模板配置文件获取默认配置
        const response = await fetch('http://localhost:3458/config/backup');
        if (!response.ok) {
          throw new Error('获取模板配置失败');
        }
        const templateConfig = await response.json();
        setConfig(templateConfig);
        setMessage({ type: 'success', text: '已重置为模板配置，请点击"保存配置"将更改写入文件' });
        setTimeout(() => setMessage(null), 3000);
      } catch (error) {
        setMessage({ type: 'error', text: '重置失败：' + (error instanceof Error ? error.message : '未知错误') });
      }
    }
  };

  // Provider 管理
  const addProvider = async (providerType: string) => {
    if (!providerType) {
      setMessage({ type: 'error', text: '请选择要添加的提供商' });
      return;
    }

    try {
      // 先从服务器获取最新配置
      const currentResponse = await fetch('http://localhost:3458/config');
      if (!currentResponse.ok) throw new Error('获取当前配置失败');
      const currentConfig = await currentResponse.json();

      let newProvider: Provider;

      // 检查是否是预设模板类型
      if (providerTemplates[providerType as keyof typeof providerTemplates]) {
        const template = providerTemplates[providerType as keyof typeof providerTemplates];
        const models = modelTemplates[providerType as keyof typeof modelTemplates] || [];
        newProvider = { ...template, models: JSON.parse(JSON.stringify(models)) };

        // 检查是否已存在同名提供商
        if (currentConfig.Providers.some(p => p.name === template.name)) {
          newProvider.name = `${template.name}-${Date.now()}`;
        }
      } else {
        newProvider = {
          name: `custom-provider-${Date.now()}`,
          api_base_url: "",
          api_key_env: "",
          api_key: "",
          models: [],
          transformer: "",
          headers: ""
        };
      }

      const updatedConfig = {
        ...currentConfig,
        Providers: [...currentConfig.Providers, newProvider]
      };

      setExpandedProviders(prev => ({ ...prev, [newProvider.name]: true }));
      setNewProviderType('');

      // 保存到服务器
      try {
        const response = await fetch('http://localhost:3458/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedConfig)
        });
        const result = await response.json();
        if (response.ok && result.success) {
          // 保存成功后，重新加载配置以确保 UI 与后端同步
          setTimeout(async () => {
            try {
              const reloadResponse = await fetch('http://localhost:3458/config');
              if (reloadResponse.ok) {
                const reloadedData = await reloadResponse.json();
                setConfig(reloadedData); // 强制更新UI以匹配后端状态
              }
            } catch (reloadError) {
              console.error('重新加载配置失败:', reloadError);
            }
          }, 100); // 延迟100毫秒以确保后端处理完成

          setMessage({ type: 'success', text: `已添加 ${providerType} 提供商并保存` });
          setTimeout(() => setMessage(null), 3000);
        } else {
          setMessage({ type: 'error', text: `添加提供商失败：${result.message || response.statusText}` });
          setTimeout(() => setMessage(null), 3000);
        }
      } catch (error: any) {
        setMessage({ type: 'error', text: `添加提供商失败：${error.message || '网络错误'}` });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `添加提供商失败：${error.message || '网络错误'}` });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const addCustomProvider = async () => {
    try {
      // 先从服务器获取最新配置
      const currentResponse = await fetch('http://localhost:3458/config');
      if (!currentResponse.ok) throw new Error('获取当前配置失败');
      const currentConfig = await currentResponse.json();

      const timestamp = Date.now();
      const newProvider: Provider = {
        name: `custom-provider-${timestamp}`,
        api_base_url: "",
        api_key_env: "",
        api_key: "",
        models: [],
        transformer: "",
        headers: ""
      };

      // 检查是否已存在同名提供商
      if (currentConfig.Providers.some((p: Provider) => p.name === newProvider.name)) {
        newProvider.name = `custom-provider-${timestamp}`;
      }

      const updatedConfig = { ...currentConfig, Providers: [...currentConfig.Providers, newProvider] };

      // 保存到服务器
      const response = await fetch('http://localhost:3458/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.success) {
        // 保存成功后重新加载配置
        const reloadResponse = await fetch('http://localhost:3458/config');
        if (reloadResponse.ok) {
          const reloadedData = await reloadResponse.json();
          setConfig(reloadedData); // 强制更新UI以匹配后端状态
          setExpandedProviders(prev => ({ ...prev, [newProvider.name]: true }));
        }

        setMessage({ type: 'success', text: '已添加自定义提供商并保存，请完善配置' });
      } else {
        setMessage({ type: 'error', text: `添加提供商失败：${result.message || '未知错误'}` });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `添加提供商失败：${error.message || '网络错误'}` });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const removeProvider = async (index: number) => {
    const provider = config.Providers[index];
    if (confirm(`确定要移除 ${provider.name} 提供商及其所有模型吗？`)) {
      try {
        // 先从服务器获取最新配置
        const currentResponse = await fetch('http://localhost:3458/config');
        if (!currentResponse.ok) throw new Error('获取当前配置失败');
        const currentConfig = await currentResponse.json();

        // 从最新配置中移除指定索引的提供商
        const updatedConfig = {
          ...currentConfig,
          Providers: currentConfig.Providers.filter((_: any, i: number) => i !== index)
        };

        // 保存到服务器
        const response = await fetch('http://localhost:3458/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedConfig)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        if (result.success) {
          // 保存成功后重新加载配置
          const reloadResponse = await fetch('http://localhost:3458/config');
          if (reloadResponse.ok) {
            const reloadedData = await reloadResponse.json();
            setConfig(reloadedData); // 强制更新UI以匹配后端状态
          }

          setMessage({ type: 'success', text: '提供商已移除并保存' });
        } else {
          setMessage({ type: 'error', text: `移除提供商失败：${result.message || '未知错误'}` });
        }
      } catch (error: any) {
        setMessage({ type: 'error', text: `移除提供商失败：${error.message || '网络错误'}` });
      }
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // 创建自定义适配器
  const handleCreateCustomAdapter = async () => {
    const name = prompt('请输入自定义适配器名称（英文）:');
    if (!name) return;

    // 基于预设模板生成默认配置
    const defaultConfig = {
      name: name,
      request: {
        format: "openai",
        endpoint: "/v1/chat/completions",
        contentField: "messages",
        modelField: "model",
        authType: "api-key",
        requiredHeaders: {
          "Content-Type": "application/json"
        },
        optionalParams: ["temperature", "max_tokens", "top_p", "stream"]
      },
      response: {
        format: "openai",
        statusField: "choices",
        contentPath: "choices[0].message.content"
      }
    };

    try {
      await createCustomAdapter(name, defaultConfig);
      setMessage({ type: 'success', text: `自定义适配器 ${name} 已创建！` });

      // 刷新适配器列表
      const data = await getAdapterConfig();
      setAvailableAdapters(data.adapters || []);
      setAdapterConfig(data.adapterConfig || null);
    } catch (error) {
      setMessage({ type: 'error', text: '创建自定义适配器失败' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const updateProvider = async (index: number, updates: Partial<Provider>) => {
    try {
      // 先从服务器获取最新配置
      const currentResponse = await fetch('http://localhost:3458/config');
      if (!currentResponse.ok) throw new Error('获取当前配置失败');
      const currentConfig = await currentResponse.json();

      // 基于最新配置更新指定提供商
      const updatedConfig = {
        ...currentConfig,
        Providers: currentConfig.Providers.map((p, i) =>
          i === index
            ? { ...p, ...updates }
            : p
        )
      };

      // 保存到服务器
      const response = await fetch('http://localhost:3458/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 保存成功后重新加载配置
      const reloadResponse = await fetch('http://localhost:3458/config');
      if (reloadResponse.ok) {
        const reloadedData = await reloadResponse.json();
        setConfig(reloadedData); // 强制更新UI以匹配后端状态
      }
    } catch (error) {
      console.error('更新提供商失败:', error);
      setMessage({ type: 'error', text: `更新提供商失败：${(error as Error).message || '网络错误'}` });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const toggleProviderExpand = (name: string) => {
    setExpandedProviders(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Provider 内部模型管理
  const addProviderModel = async (providerIndex: number) => {
    const newModel: Model = {
      id: `new-model-${Date.now()}`, name: "新模型", api_model_id: "", capabilities: ["general"], strengths: ["通用任务"],
      pricing: { input: 0.0001, output: 0.0002 }, context_limit: 32768, quality_score: 7.0, speed: "medium",
      max_concurrency: 10, response_time: 5000
    };

    try {
      // 先从服务器获取最新配置
      const currentResponse = await fetch('http://localhost:3458/config');
      if (!currentResponse.ok) throw new Error('获取当前配置失败');
      const currentConfig = await currentResponse.json();

      // 基于最新配置添加新模型
      const updatedConfig = {
        ...currentConfig,
        Providers: currentConfig.Providers.map((p, i) =>
          i === providerIndex ? { ...p, models: [...p.models, newModel] } : p
        )
      };

      // 保存到服务器
      const response = await fetch('http://localhost:3458/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setMessage({ type: 'success', text: '模型已添加并保存' });
        setTimeout(() => setMessage(null), 3000);

        // 保存成功后重新加载配置
        const reloadResponse = await fetch('http://localhost:3458/config');
        if (reloadResponse.ok) {
          const reloadedData = await reloadResponse.json();
          setConfig(reloadedData); // 强制更新UI以匹配后端状态
        }
      } else {
        setMessage({ type: 'error', text: '保存模型失败：' + (result.message || response.statusText) });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: '保存模型失败：' + (error.message || '网络错误') });
    }
  };

  const removeProviderModel = async (providerIndex: number, modelIndex: number) => {
    if (confirm('确定移除此模型吗？')) {
      try {
        // 先从服务器获取最新配置
        const currentResponse = await fetch('http://localhost:3458/config');
        if (!currentResponse.ok) throw new Error('获取当前配置失败');
        const currentConfig = await currentResponse.json();

        // 从最新配置中移除指定的模型
        const updatedConfig = {
          ...currentConfig,
          Providers: currentConfig.Providers.map((p, i) =>
            i === providerIndex
              ? { ...p, models: p.models.filter((_: any, j: number) => j !== modelIndex) }
              : p
          )
        };

        // 保存到服务器
        const response = await fetch('http://localhost:3458/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedConfig)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        if (result.success) {
          // 保存成功后重新加载配置
          const reloadResponse = await fetch('http://localhost:3458/config');
          if (reloadResponse.ok) {
            const reloadedData = await reloadResponse.json();
            setConfig(reloadedData); // 强制更新UI以匹配后端状态
          }

          setMessage({ type: 'success', text: '模型已删除并保存' });
          setTimeout(() => setMessage(null), 3000);
        } else {
          setMessage({ type: 'error', text: '删除模型失败：' + (result.message || '未知错误') });
        }
      } catch (error: any) {
        setMessage({ type: 'error', text: '删除模型失败：' + (error.message || '网络错误') });
      }
    }
  };

  const updateProviderModel = async (providerIndex: number, modelIndex: number, updates: Partial<Model>) => {
    try {
      // 先从服务器获取最新配置
      const currentResponse = await fetch('http://localhost:3458/config');
      if (!currentResponse.ok) throw new Error('获取当前配置失败');
      const currentConfig = await currentResponse.json();

      // 基于最新配置更新指定模型
      const updatedConfig = {
        ...currentConfig,
        Providers: currentConfig.Providers.map((p, i) =>
          i === providerIndex
            ? {
                ...p,
                models: p.models.map((m, j) => j === modelIndex ? { ...m, ...updates } : m)
              }
            : p
        )
      };

      // 保存到服务器
      const response = await fetch('http://localhost:3458/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 保存成功后重新加载配置
      const reloadResponse = await fetch('http://localhost:3458/config');
      if (reloadResponse.ok) {
        const reloadedData = await reloadResponse.json();
        setConfig(reloadedData); // 强制更新UI以匹配后端状态
      }
    } catch (error) {
      console.error('保存配置失败:', error);
    }
  };

  const NavItem = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 ${
        activeTab === id
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
          : 'text-slate-600 hover:bg-white hover:shadow-sm hover:text-indigo-600'
      }`}
    >
      <Icon />
      <span className="ml-3 font-medium text-sm tracking-wide">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-900">

      {/* 顶部导航 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Icons.Route />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-none">OrchestRouter</h1>
              <p className="text-[11px] text-slate-500 mt-1 font-medium tracking-wider uppercase">Configuration Center</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="file"
              id="import-config"
              accept=".json"
              onChange={importConfig}
              className="hidden"
            />
            <label
              htmlFor="import-config"
              className="flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm font-semibold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm cursor-pointer"
            >
              <Icons.Upload />
              <span className="ml-2">导入</span>
            </label>
            <button
              onClick={() => exportConfig()}
              className="flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm font-semibold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm"
            >
              <Icons.Download />
              <span className="ml-2">导出</span>
            </button>
            <button
              onClick={() => resetConfig()}
              className="flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm font-semibold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm"
            >
              <Icons.Refresh />
              <span className="ml-2">重置</span>
            </button>
            <button
              onClick={saveConfig}
              disabled={loading}
              className="flex items-center px-5 py-2 bg-indigo-600 border border-transparent rounded-lg text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-all shadow-md shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <Icons.Save />
              <span className="ml-2">{loading ? '保存中...' : '保存配置'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 flex gap-8 items-start">

        {/* 左侧侧边栏 */}
        <aside className="w-64 shrink-0 space-y-2 sticky top-24">
          <NavItem id="system" label="系统配置" icon={Icons.Server} />
          <NavItem id="providers" label="模型提供商" icon={Icons.Cloud} />
          <NavItem id="selector" label="路由规则" icon={Icons.Route} />
          <NavItem id="cost" label="成本控制" icon={Icons.Dollar} />
          <NavItem id="executor" label="执行器配置" icon={Icons.Cog} />
          <NavItem id="decomposer" label="分解器配置" icon={Icons.Component} />
          <NavItem id="orchestrator" label="编排器配置" icon={Icons.Orchestrator} />
          <NavItem id="circuit_breaker" label="熔断器配置" icon={Icons.Breaker} />
          <NavItem id="session" label="会话管理" icon={Icons.Component} />
          <NavItem id="rate_limiter" label="速率限制" icon={Icons.Cog} />
          <NavItem id="learning_engine" label="学习引擎" icon={Icons.Orchestrator} />
          <NavItem id="retry_manager" label="重试管理" icon={Icons.Breaker} />
          <NavItem id="integrator" label="整合器配置" icon={Icons.Component} />
          <NavItem id="extensions" label="扩展配置" icon={Icons.Cog} />
          <NavItem id="model_task_matrix" label="模型任务矩阵" icon={Icons.Matrix} />
          <NavItem id="dimension_weights" label="维度权重" icon={Icons.Chart} />
          <NavItem id="metrics" label="指标监控" icon={Icons.Chart} />
          <NavItem id="flow" label="流程监控" icon={Icons.Orchestrator} />
          <NavItem id="monitor" label="响应监控" icon={Icons.Orchestrator} />
          <NavItem id="logs" label="实时日志" icon={Icons.Log} />
        </aside>

        {/* 右侧主内容区 */}
        <div className="flex-1 min-w-0">

          {/* 全局消息提示 */}
          {message && (
            <div className={`mb-6 p-4 rounded-xl border flex justify-between items-center animate-in fade-in slide-in-from-top-2 ${
              message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              <span className="font-medium text-sm">{message.text}</span>
              <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100 transition-opacity">✕</button>
            </div>
          )}

          {/* 内容卡片 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

            {/* 1. 系统配置 */}
            {activeTab === 'system' && (
              <div className="p-8">
                <div className="mb-8 border-b border-slate-100 pb-5">
                  <h2 className="text-2xl font-bold text-slate-800">系统配置</h2>
                  <p className="text-sm text-slate-500 mt-2">管理 OrchestRouter 服务器的核心网络和运行参数。</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <InputGroup label="主机地址 (HOST)" value={config.system.host} onChange={(e:any) => setConfig(prev => ({ ...prev, system: { ...prev.system, host: e.target.value } }))} />
                  <InputGroup type="number" label="端口 (PORT)" value={config.system.port} onChange={(e:any) => setConfig(prev => ({ ...prev, system: { ...prev.system, port: parseInt(e.target.value) || 3458 } }))} />

                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">日志级别 (LOG_LEVEL)</label>
                    <select
                      value={config.system.logLevel}
                      onChange={(e) => setConfig(prev => ({ ...prev, system: { ...prev.system, logLevel: e.target.value } }))}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                    >
                      <option value="debug">DEBUG (调试)</option>
                      <option value="info">INFO (信息)</option>
                      <option value="warn">WARN (警告)</option>
                      <option value="error">ERROR (错误)</option>
                    </select>
                  </div>

                  <InputGroup type="number" label="API 超时时间 (毫秒)" value={config.system.apiTimeoutMs} onChange={(e:any) => setConfig(prev => ({ ...prev, system: { ...prev.system, apiTimeoutMs: parseInt(e.target.value) || 600000 } }))} />
                  <InputGroup type="number" label="最大并发数" value={config.system.maxConcurrency} onChange={(e:any) => setConfig(prev => ({ ...prev, system: { ...prev.system, maxConcurrency: parseInt(e.target.value) || 10 } }))} />
                </div>

                <div className="space-y-4">
                  <Toggle
                    checked={config.system.debug}
                    onChange={(v) => setConfig(prev => ({ ...prev, system: { ...prev.system, debug: v } }))}
                    label="开启调试模式 (DEBUG)"
                    desc="开启后将输出更详细的底层网络和执行日志，便于问题排查。"
                  />
                </div>
              </div>
            )}

            {/* 2. 模型提供商 */}
            {activeTab === 'providers' && (
              <div className="p-8 bg-slate-50/50">
                <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800">模型提供商</h2>
                    <p className="text-sm text-slate-500 mt-2">配置大语言模型服务商及其包含的模型参数。</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl shadow-sm border border-slate-200">
                      <select
                        value={newProviderType}
                        onChange={(e) => setNewProviderType(e.target.value)}
                        className="px-3 py-1.5 bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 outline-none"
                      >
                        <option value="">-- 选择提供商模板 --</option>
                        <option value="aliyun">阿里云 DashScope</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="google">Google Gemini</option>
                        <option value="ollama">Ollama (本地)</option>
                      </select>
                      <button
                        onClick={() => addProvider(newProviderType)}
                        className="flex items-center px-4 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors"
                        disabled={!newProviderType}
                      >
                        <Icons.Plus /> <span className="ml-1">添加模板</span>
                      </button>
                    </div>
                    <button
                      onClick={addCustomProvider}
                      className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
                    >
                      <Icons.Plus /> <span className="ml-1">添加自定义</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  {config.Providers.map((provider, providerIndex) => {
                    const isExpanded = expandedProviders[provider.name];
                    return (
                      <div key={provider.name + providerIndex} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-300">
                        {/* Provider Header */}
                        <div
                          className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors select-none"
                          onClick={() => toggleProviderExpand(provider.name)}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg transition-colors ${isExpanded ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                              <Icons.Cloud />
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-800 text-lg">{provider.name}</h3>
                              <p className="text-xs font-medium text-slate-500 mt-0.5">{provider.models.length} 个可用模型</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={(e) => { e.stopPropagation(); removeProvider(providerIndex); }}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              title="移除提供商"
                            >
                              <Icons.Trash />
                            </button>
                            <Icons.ChevronDown className={`text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        </div>

                        {/* Provider Content */}
                        {isExpanded && (
                          <div className="px-6 pb-6 pt-2 border-t border-slate-100 bg-slate-50/50">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8 mt-4">
                              <InputGroup label="提供商名称" value={provider.name} onChange={(e:any) => updateProvider(providerIndex, { name: e.target.value })} />
                              <InputGroup label="API 环境变量名" value={provider.api_key_env} onChange={(e:any) => updateProvider(providerIndex, { api_key_env: e.target.value })} placeholder="例如: DASHSCOPE_API_KEY" />
                              <InputGroup className="md:col-span-2" label="API Base URL" value={provider.api_base_url} onChange={(e:any) => updateProvider(providerIndex, { api_base_url: e.target.value })} placeholder="例如: https://api.openai.com/v1" />
                              <InputGroup className="md:col-span-2" type="password" label="硬编码 API 密钥 (可选)" value={provider.api_key} onChange={(e:any) => updateProvider(providerIndex, { api_key: e.target.value })} desc="推荐使用环境变量。在此处填写的密钥将覆盖环境变量。" />

                              {/* 转接口适配器配置 */}
                              <div className="md:col-span-2 pt-4 border-t border-slate-200">
                                <h4 className="text-sm font-bold text-slate-700 mb-3">转接口配置 (Adapter)</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* 转接口适配器选择 */}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <label className="block text-sm font-semibold text-slate-700">API 适配器</label>
                                      <button
                                        type="button"
                                        onClick={handleCreateCustomAdapter}
                                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                      >
                                        + 创建自定义
                                      </button>
                                    </div>
                                    <p className="text-xs text-slate-500 mb-2">选择预设模板或自定义适配器</p>
                                    <select
                                      value={provider.adapter || adapterConfig?.providerMapping?.[provider.name] || adapterConfig?.defaultAdapter || 'openai-compatible'}
                                      onChange={(e) => updateProvider(providerIndex, { adapter: e.target.value })}
                                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800"
                                    >
                                      <optgroup label="预设模板">
                                        {availableAdapters.filter(a => !a.isCustom).map(adapter => (
                                          <option key={adapter.name} value={adapter.name}>
                                            {adapter.displayName} ({adapter.format})
                                          </option>
                                        ))}
                                      </optgroup>
                                      {availableAdapters.some(a => a.isCustom) && (
                                        <optgroup label="自定义适配器">
                                          {availableAdapters.filter(a => a.isCustom).map(adapter => (
                                            <option key={adapter.name} value={adapter.name}>
                                              {adapter.displayName} ({adapter.format})
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                    </select>
                                  </div>
                                  <InputGroup label="请求头配置"
                                    value={provider.headers || ""}
                                    onChange={(e: any) => updateProvider(providerIndex, { headers: e.target.value })}
                                    placeholder='例如: {"X-Custom-Header": "value"}'
                                    desc="以JSON格式提供额外的请求头" />
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between mb-4 mt-8">
                              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">包含的模型 ({provider.models.length})</h4>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setEditingModel(null);
                                    setTargetProvider(provider.name); // 设置目标提供商
                                    setShowModelForm(true);
                                  }}
                                  className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  + 添加新模型
                                </button>
                              </div>
                            </div>

                            <div className="space-y-4">
                              {provider.models.map((model, modelIndex) => (
                                <div key={model.id + modelIndex} className="bg-white border border-slate-200 rounded-xl p-5 relative group hover:border-indigo-300 transition-colors shadow-sm">
                                  <button
                                    onClick={() => removeProviderModel(providerIndex, modelIndex)}
                                    className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                    <Icons.Trash />
                                  </button>

                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pr-8">
                                    <InputGroup label="模型展示名称" value={model.name} onChange={(e:any) => updateProviderModel(providerIndex, modelIndex, { name: e.target.value })} />
                                    <InputGroup label="系统 ID (内部标识)" value={model.id} onChange={(e:any) => updateProviderModel(providerIndex, modelIndex, { id: e.target.value })} />
                                    <InputGroup label="API 真实模型 ID" value={model.api_model_id} onChange={(e:any) => updateProviderModel(providerIndex, modelIndex, { api_model_id: e.target.value })} />
                                    <InputGroup type="number" label="上下文长度" value={model.context_limit} onChange={(e:any) => updateProviderModel(providerIndex, modelIndex, { context_limit: parseInt(e.target.value) || 0 })} />

                                    <InputGroup type="number" step="0.000001" label="输入价格 ($/1K tokens)" value={model.pricing.input} onChange={(e:any) => updateProviderModel(providerIndex, modelIndex, { pricing: { ...model.pricing, input: parseFloat(e.target.value) || 0 } })} />
                                    <InputGroup type="number" step="0.000001" label="输出价格 ($/1K tokens)" value={model.pricing.output} onChange={(e:any) => updateProviderModel(providerIndex, modelIndex, { pricing: { ...model.pricing, output: parseFloat(e.target.value) || 0 } })} />

                                    <div className="space-y-1.5">
                                      <label className="block text-sm font-semibold text-slate-700">处理速度</label>
                                      <select
                                        value={model.speed}
                                        onChange={(e) => updateProviderModel(providerIndex, modelIndex, { speed: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                      >
                                        <option value="fast">快速 (Fast)</option>
                                        <option value="medium">中等 (Medium)</option>
                                        <option value="slow">慢速 (Slow)</option>
                                      </select>
                                    </div>
                                    <InputGroup type="number" label="质量评分 (1-10)" value={model.quality_score} onChange={(e:any) => updateProviderModel(providerIndex, modelIndex, { quality_score: parseFloat(e.target.value) || 5 })} />

                                    <div className="col-span-2">
                                      <InputGroup label="能力标签 (逗号分隔)" value={model.capabilities.join(', ')} onChange={(e:any) => updateProviderModel(providerIndex, modelIndex, { capabilities: e.target.value.split(',').map((s:string) => s.trim()).filter(Boolean) })} placeholder="code, reasoning, vision..." />
                                    </div>
                                    <div className="col-span-2">
                                      <InputGroup label="优势描述 (逗号分隔)" value={model.strengths.join(', ')} onChange={(e:any) => updateProviderModel(providerIndex, modelIndex, { strengths: e.target.value.split(',').map((s:string) => s.trim()).filter(Boolean) })} placeholder="长文本, 代码生成..." />
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {provider.models.length === 0 && (
                                <div className="text-center py-8 bg-white border border-slate-200 border-dashed rounded-xl">
                                  <p className="text-sm text-slate-500">该提供商暂无模型配置，请点击右上方添加。</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. 路由规则 */}
            {activeTab === 'selector' && (
              <div className="p-8">
                <div className="mb-8 border-b border-slate-100 pb-5">
                  <h2 className="text-2xl font-bold text-slate-800">路由规则配置</h2>
                  <p className="text-sm text-slate-500 mt-2">定义不同类型任务默认使用的模型。格式需为 <code>provider,model_id</code>。</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <InputGroup label="默认路由 (Default)" desc="用于普通对话和未分类任务" value={config.selector.default} onChange={(e:any) => setConfig(prev => ({ ...prev, selector: { ...prev.selector, default: e.target.value } }))} placeholder="aliyun,qwen3-coder-plus" />
                  <InputGroup label="后台任务路由 (Background)" desc="用于不要求极致响应速度的后台整理" value={config.selector.background} onChange={(e:any) => setConfig(prev => ({ ...prev, selector: { ...prev.selector, background: e.target.value } }))} />

                  <InputGroup label="深度思考路由 (Think)" desc="用于需要复杂推理的逻辑任务" value={config.selector.think} onChange={(e:any) => setConfig(prev => ({ ...prev, selector: { ...prev.selector, think: e.target.value } }))} />
                  <InputGroup label="推理模型 (Reasoning)" desc="专用的数学/深度思维模型 (如 DeepSeek Reasoner)" value={config.selector.reasoning} onChange={(e:any) => setConfig(prev => ({ ...prev, selector: { ...prev.selector, reasoning: e.target.value } }))} />

                  <div className="col-span-1 md:col-span-2 bg-indigo-50/50 p-6 rounded-xl border border-indigo-100 grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                    <InputGroup label="长上下文路由 (Long Context)" desc="当 tokens 数量超过阈值时触发" value={config.selector.longContext} onChange={(e:any) => setConfig(prev => ({ ...prev, selector: { ...prev.selector, longContext: e.target.value } }))} />
                    <InputGroup type="number" label="长上下文触发阈值 (Tokens)" desc="超过此长度则自动切换长上下文模型" value={config.selector.longContextThreshold} onChange={(e:any) => setConfig(prev => ({ ...prev, selector: { ...prev.selector, longContextThreshold: parseInt(e.target.value) || 100000 } }))} />
                  </div>

                  <InputGroup label="代码生成路由 (Code)" desc="专门处理代码编写与审查任务" value={config.selector.code} onChange={(e:any) => setConfig(prev => ({ ...prev, selector: { ...prev.selector, code: e.target.value } }))} />
                  <InputGroup label="网络搜索路由 (Web Search)" desc="用于处理需要联网搜索的任务" value={config.selector.webSearch} onChange={(e:any) => setConfig(prev => ({ ...prev, selector: { ...prev.selector, webSearch: e.target.value } }))} />
                  <InputGroup label="图像处理路由 (Image)" desc="用于视觉和多模态理解任务" value={config.selector.image} onChange={(e:any) => setConfig(prev => ({ ...prev, selector: { ...prev.selector, image: e.target.value } }))} />
                </div>

                {/* 新增：任务类型规则配置 */}
                <div className="border border-slate-200 rounded-xl p-6 bg-slate-50 mt-8">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-slate-800">任务类型规则配置</h3>
                    <button
                      onClick={() => {
                        setEditingRule(null);
                        setShowRuleForm(true);
                      }}
                      className="flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <Icons.Plus />
                      <span className="ml-2">添加规则</span>
                    </button>
                  </div>

                  <RuleTable
                    onEdit={(rule) => {
                      setEditingRule(rule);
                      setShowRuleForm(true);
                    }}
                    refreshKey={ruleRefreshKey}
                  />
                </div>
              </div>
            )}

            {/* 4. 成本控制 */}
            {activeTab === 'cost' && (
              <div className="p-8">
                <div className="mb-8 border-b border-slate-100 pb-5">
                  <h2 className="text-2xl font-bold text-slate-800">成本控制</h2>
                  <p className="text-sm text-slate-500 mt-2">设置 API 调用的财务限制和智能模型的选型倾向。</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <InputGroup type="number" step="0.01" label="日预算上限 ($)" value={config.costControl.dailyBudget} onChange={(e:any) => setConfig(prev => ({ ...prev, costControl: { ...prev.costControl, dailyBudget: parseFloat(e.target.value) || 0 } }))} />
                  <InputGroup type="number" step="0.01" label="单任务最大成本 ($)" value={config.costControl.maxCostPerTask} onChange={(e:any) => setConfig(prev => ({ ...prev, costControl: { ...prev.costControl, maxCostPerTask: parseFloat(e.target.value) || 0 } }))} />
                  <InputGroup type="number" step="0.1" label="安全边际 (比例)" desc="如 0.2 表示预留 20% 缓冲" value={config.costControl.safetyMargin} onChange={(e:any) => setConfig(prev => ({ ...prev, costControl: { ...prev.costControl, safetyMargin: parseFloat(e.target.value) || 0.2 } }))} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Toggle
                    checked={config.costControl.qualityFirst}
                    onChange={(v) => setConfig(prev => ({ ...prev, costControl: { ...prev.costControl, qualityFirst: v } }))}
                    label="优先考虑质量 (Quality First)"
                    desc="在预算充足时，路由将倾向于选择评分最高而非最便宜的模型。"
                  />
                  <Toggle
                    checked={config.costControl.conservativeEstimation}
                    onChange={(v) => setConfig(prev => ({ ...prev, costControl: { ...prev.costControl, conservativeEstimation: v } }))}
                    label="保守成本估算"
                    desc="在计算任务可用性时，将输出 tokens 的预期调高以防止超支。"
                  />
                </div>
              </div>
            )}

            {/* 5. 执行器配置 */}
            {activeTab === 'executor' && (
              <div className="p-0">
                <ExecutorConfig
                  config={config.executor || {}}
                  onUpdate={(updatedConfig) => setConfig(prev => ({
                    ...prev,
                    executor: updatedConfig
                  }))}
                />
              </div>
            )}

            {/* 6. 实时日志 - 增强日志系统 */}
            {activeTab === 'logs' && (
              <div className="p-0">
                {/* 日志控制面板 */}
                <div className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-slate-200">
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold text-slate-800">实时日志</h2>
                    <p className="text-sm text-slate-500 mt-1">查看 OrchestRouter 各组件的实时运行日志，支持按组件、级别筛选和搜索。</p>
                  </div>

                  {/* 筛选控制区 */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {/* 日志级别筛选 */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">日志级别</label>
                      <select
                        value={logFilter}
                        onChange={(e) => setLogFilter(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800 shadow-sm"
                      >
                        <option value="all">全部级别</option>
                        <option value="trace">Trace</option>
                        <option value="debug">Debug</option>
                        <option value="info">Info</option>
                        <option value="warn">Warn</option>
                        <option value="error">Error</option>
                        <option value="fatal">Fatal</option>
                      </select>
                    </div>

                    {/* 组件筛选 */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">组件</label>
                      <select
                        value={logComponentFilter}
                        onChange={(e) => setLogComponentFilter(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800 shadow-sm"
                      >
                        <option value="all">全部组件</option>
                        <option value="orchestrator">编排器</option>
                        <option value="decomposer">分解器</option>
                        <option value="selector">选择器</option>
                        <option value="executor">执行器</option>
                        <option value="log.server">日志服务器</option>
                        <option value="backend">后端服务</option>
                      </select>
                    </div>

                    {/* 搜索框 */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">搜索关键词</label>
                      <input
                        type="text"
                        value={logSearch}
                        onChange={(e) => setLogSearch(e.target.value)}
                        placeholder="输入关键词搜索日志内容..."
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-800 shadow-sm"
                      />
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-end gap-2">
                      <button
                        onClick={fetchLogs}
                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold shadow-md shadow-indigo-200"
                      >
                        <Icons.Refresh />
                        <span className="ml-1">刷新</span>
                      </button>
                      <button
                        onClick={clearLogs}
                        className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors text-sm font-semibold"
                        title="清除所有日志"
                      >
                        <Icons.Trash />
                      </button>
                    </div>
                  </div>

                  {/* 额外选项 */}
                  <div className="mt-4 flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-600">自动滚动</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-600">自动刷新 (2 秒)</span>
                    </label>
                    <span className="text-xs text-slate-400 ml-auto">
                      共 {filteredLogs.length} 条日志 / 总计 {logs.length} 条
                    </span>
                  </div>
                </div>

                {/* 日志列表显示区 */}
                <div className="max-h-[calc(100vh-350px)] overflow-y-auto bg-slate-900">
                  {filteredLogs.length > 0 ? (
                    <table className="min-w-full divide-y divide-slate-700">
                      <thead className="bg-slate-800 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider w-24">时间</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider w-20">级别</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider w-32">组件</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">消息</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {filteredLogs.map((log, index) => (
                          <tr key={index} className="hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-400 font-mono">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                                log.level === 'error' ? 'bg-red-900/50 text-red-400' :
                                log.level === 'warn' ? 'bg-yellow-900/50 text-yellow-400' :
                                log.level === 'info' ? 'bg-blue-900/50 text-blue-400' :
                                log.level === 'debug' ? 'bg-green-900/50 text-green-400' :
                                log.level === 'trace' ? 'bg-purple-900/50 text-purple-400' :
                                log.level === 'fatal' ? 'bg-red-800 text-red-300' :
                                'bg-slate-700 text-slate-400'
                              }`}>
                                {log.level.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-indigo-400 font-mono">
                              {log.module}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-300">
                              {log.message}
                              {log.meta && Object.keys(log.meta).length > 0 && (
                                <details className="mt-2">
                                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400 transition-colors">查看元数据</summary>
                                  <pre className="mt-2 text-xs bg-slate-800 p-3 rounded border border-slate-700 overflow-x-auto text-slate-400">
                                    {JSON.stringify(log.meta, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-16 text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4">
                        <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                      </div>
                      <p className="text-slate-400 text-sm">
                        {logs.length === 0 ? '暂无日志数据，请刷新或等待新日志' : '没有匹配的日志，请调整筛选条件'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 7. 分解器配置 */}
            {activeTab === 'decomposer' && (
              <div className="p-0">
                <DecomposerConfig
                  config={config.decomposer || {}}
                  onUpdate={(updatedConfig) => setConfig(prev => ({
                    ...prev,
                    decomposer: updatedConfig
                  }))}
                />
              </div>
            )}

            {/* 8. 编排器配置 */}
            {activeTab === 'orchestrator' && (
              <div className="p-0">
                <OrchestratorConfig
                  config={config.orchestrator || {}}
                  onUpdate={(updatedConfig) => setConfig(prev => ({
                    ...prev,
                    orchestrator: updatedConfig
                  }))}
                />
              </div>
            )}

            {/* 9. 熔断器配置 */}
            {activeTab === 'circuit_breaker' && (
              <div className="p-0">
                <CircuitBreakerConfig
                  config={config.circuit_breaker || {}}
                  onUpdate={(updatedConfig) => setConfig(prev => ({
                    ...prev,
                    circuit_breaker: updatedConfig
                  }))}
                />
              </div>
            )}

            {/* 10. 会话管理配置 */}
            {activeTab === 'session' && (
              <div className="p-0">
                <SessionConfig
                  config={config.session || {}}
                  onUpdate={(updatedConfig) => setConfig(prev => ({
                    ...prev,
                    session: updatedConfig
                  }))}
                />
              </div>
            )}

            {/* 11. 速率限制配置 */}
            {activeTab === 'rate_limiter' && (
              <div className="p-0">
                <RateLimiterConfig
                  config={config.rate_limiter || {}}
                  onUpdate={(updatedConfig) => setConfig(prev => ({
                    ...prev,
                    rate_limiter: updatedConfig
                  }))}
                />
              </div>
            )}

            {/* 12. 学习引擎配置 */}
            {activeTab === 'learning_engine' && (
              <div className="p-0">
                <LearningEngineConfig
                  config={config.learning_engine || {}}
                  onUpdate={(updatedConfig) => setConfig(prev => ({
                    ...prev,
                    learning_engine: updatedConfig
                  }))}
                />
              </div>
            )}

            {/* 13. 重试管理配置 */}
            {activeTab === 'retry_manager' && (
              <div className="p-0">
                <RetryManagerConfig
                  config={config.retry_manager || {}}
                  onUpdate={(updatedConfig) => setConfig(prev => ({
                    ...prev,
                    retry_manager: updatedConfig
                  }))}
                />
              </div>
            )}

            {/* 14. 整合器配置 */}
            {activeTab === 'integrator' && (
              <div className="p-0">
                <IntegratorConfig
                  config={config.integrator || {}}
                  onUpdate={(updatedConfig) => setConfig(prev => ({
                    ...prev,
                    integrator: updatedConfig
                  }))}
                />
              </div>
            )}

            {/* 15. 扩展配置 */}
            {activeTab === 'extensions' && (
              <div className="p-0">
                <ExtensionsConfig
                  config={config.orchestrator_extensions || {}}
                  onUpdate={(updatedConfig) => setConfig(prev => ({
                    ...prev,
                    orchestrator_extensions: updatedConfig
                  }))}
                />
              </div>
            )}

            {/* 16. 模型任务矩阵配置 */}
            {activeTab === 'model_task_matrix' && (
              <div className="p-0">
                <ModelTaskMatrixConfig />
              </div>
            )}

            {/* 17. 维度权重配置 */}
            {activeTab === 'dimension_weights' && (
              <div className="p-0">
                <DimensionWeightsConfig />
              </div>
            )}

            {/* 18. 指标监控 */}
            {activeTab === 'metrics' && (
              <div className="p-0">
                <MetricsDashboard />
              </div>
            )}

            {/* 19. 流程监控 */}
            {activeTab === 'flow' && (
              <div className="p-0 h-full">
                <FlowMonitor />
              </div>
            )}

            {/* 20. 模型响应监控 */}
            {activeTab === 'monitor' && (
              <div className="p-0 h-full">
                <ModelResponseMonitor />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 规则表单 */}
      {showRuleForm && (
        <RuleForm
          rule={editingRule}
          onSave={saveSelectionRule}
          onCancel={() => {
            setShowRuleForm(false);
            setEditingRule(null);
          }}
        />
      )}

      {/* 模型表单 */}
      {showModelForm && (
        <ModelForm
          model={editingModel}
          targetProvider={targetProvider}
          onSave={saveModel}
          onCancel={() => {
            setShowModelForm(false);
            setEditingModel(null);
            setTargetProvider(null); // 清除目标提供商
          }}
        />
      )}
    </div>
  )
}

export default App
