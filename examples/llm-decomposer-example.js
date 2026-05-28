/**
 * 使用本地 LLM(qwen2.5:3b) 的分解器示例
 *
 * 运行前请确保:
 * 1. Ollama 已安装并运行
 * 2. qwen2.5:3b 模型已下载 (ollama pull qwen2.5:3b)
 */

const ElasticDecomposer = require('../src/decomposer');

// 配置
const config = {
  // LLM 配置
  llmBaseUrl: 'http://localhost:11434',  // Ollama 默认地址
  model: 'qwen2.5:3b',                    // 使用 qwen2.5:3b 模型
  timeout: 60000,                         // 60 秒超时
  retryAttempts: 2,                       // 重试 2 次
  temperature: 0.1,                       // 低温度，更确定的输出

  // 分解器配置
  debug: true,                            // 启用调试模式
  maxConcurrency: 3,                      // 最大并发数（建议不要太高，避免 LLM 过载）

  // 插件配置
  plugins: {
    paths: ['./src/decomposer/plugins/built-in'],
    enabled: []
  }
};

// 示例任务
const task = {
  title: '创建用户管理系统',
  context: {
    projectType: 'fullstack',
    techStack: ['React', 'Node.js', 'PostgreSQL']
  },
  requirement: '创建一个完整的用户管理系统，包括前端页面和后端 API',
  deliverables: [
    { description: '创建用户登录页面组件' },
    { description: '创建用户注册页面组件' },
    { description: '实现用户认证 API 接口' },
    { description: '实现用户注册 API 接口' },
    { description: '设计数据库用户表结构' },
    { description: '编写用户认证的单元测试' },
    { description: '创建登录页面的样式文件' },
    { description: '实现密码加密功能' }
  ],
  priority: 'high'
};

async function main() {
  console.log('=== 使用本地 LLM 的任务分解器示例 ===\n');
  console.log(`LLM 配置：${config.llmBaseUrl} / ${config.model}\n`);

  try {
    // 创建分解器实例
    const decomposer = new ElasticDecomposer(config);

    console.log('开始分解任务...\n');

    // 执行任务分解
    const result = await decomposer.decompose(task);

    // 输出结果
    console.log('\n=== 分解结果 ===\n');
    console.log(`原始任务：${result.originalContent.title}`);
    console.log(`生成子任务数：${result.subtasks.length}`);
    console.log(`处理时间：${result.metadata.processingTime}ms\n`);

    console.log('子任务列表:\n');
    result.subtasks.forEach((subtask, index) => {
      console.log(`${index + 1}. [类型：${subtask.type}] ${subtask.description}`);
      console.log(`   置信度：${subtask.confidence?.toFixed(2) || 'N/A'}`);
      console.log(`   标注来源：${subtask.tagSource || 'unknown'}`);
      if (subtask.filePath) {
        console.log(`   文件路径：${subtask.filePath}`);
      }
      console.log('');
    });

    // 输出调试信息
    if (config.debug && result.metadata.debugInfo) {
      console.log('\n=== 调试信息 ===\n');
      console.log(JSON.stringify(result.metadata.debugInfo, null, 2));
    }

    console.log('\n=== 分解完成 ===\n');

  } catch (error) {
    console.error('分解失败:', error.message);
    console.error('\n提示：');
    console.error('1. 确保 Ollama 服务正在运行 (ollama serve)');
    console.error('2. 确保 qwen2.5:3b 模型已下载 (ollama pull qwen2.5:3b)');
    console.error('3. 检查 LLM 服务地址是否正确 (默认：http://localhost:11434)');
    process.exit(1);
  }
}

// 运行示例
main().catch(console.error);
