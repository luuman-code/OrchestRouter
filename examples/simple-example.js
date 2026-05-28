/**
 * 分解器简单示例
 */

const ElasticDecomposer = require('../src/decomposer');

// 创建分解器实例
const decomposer = new ElasticDecomposer({
  mergeThreshold: 0.7,
  dependencyThreshold: 0.3
});

// 示例任务
const task = {
  title: "登录页面",
  context: {
    projectType: "frontend",
    techStack: ["React", "TypeScript"]
  },
  requirement: "创建登录页面，包含表单、验证和API调用",
  deliverables: [
    { description: "登录表单组件" },
    { description: "表单样式" },
    { description: "登录逻辑" },
    { description: "API调用" }
  ],
  priority: "high"
};

console.log("原始任务:", JSON.stringify(task, null, 2));

// 执行任务分解
(async () => {
  const subTasks = await decomposer.decompose(task);

  console.log("\n分解后的子任务:");
  console.log(JSON.stringify(subTasks, null, 2));
})();

console.log("\n分解后的子任务:");
console.log(JSON.stringify(subTasks, null, 2));