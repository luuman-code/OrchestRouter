/**
 * 测试 OrchestratorAgent 任务分解
 */
const path = require('path');
const fs = require('fs');

// 尝试加载 .env 文件
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, 'utf-8');
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.substring(1);
    }
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    content.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnv();

// 规则分解方法（与 OrchestratorAgent.js 中一致）
function decomposeTaskRuleBased(task) {
  const description = task.description || task.content || '';
  const title = task.title || '';
  const fullText = `${title} ${description}`.trim();

  const deliverables = [];
  const idPrefix = `deliverable-${Date.now()}`;

  const isImplementationTask = /(实现|开发|创建|构建|编写|设计|制作)/i.test(fullText);

  const operations = [
    { pattern: /加[法挂]|add|plus|\+/i, name: '加法运算', type: 'logic' },
    { pattern: /减[法挂]|subtract|minus|\-/i, name: '减法运算', type: 'logic' },
    { pattern: /乘[法挂]|multiply|times|\*/i, name: '乘法运算', type: 'logic' },
    { pattern: /除[法挂]|divide|\//i, name: '除法运算', type: 'logic' },
  ];

  const uiPatterns = /(页面|界面|view|page|component|ui|frontend|前端|渲染|显示|布局|导航|菜单|表单|按钮|组件|仪表盘|dashboard|图表|chart)/i;
  const testPatterns = /(测试|test|spec|unit|integration|e2e|自动化|验证)/i;

  const functionalKeywordGroups = [
    ['用户管理', '用户增删改查', '用户CRUD', '增删改查', 'CRUD'],
    ['用户登录', '登录功能', '登录', '注册', '登出', '认证', '鉴权'],
    ['权限管理', '角色管理', 'RBAC', '权限', '角色'],
    ['列表', '列表页', '列表展示'],
    ['详情', '详情页', '详情展示'],
    ['编辑功能', '编辑', '修改', '更新'],
    ['删除', '移除'],
    ['搜索功能', '搜索', '查询', '查找'],
    ['过滤功能', '过滤', '筛选'],
    ['排序功能', '排序'],
    ['分页功能', '分页'],
    ['导入', '导出', '导入导出'],
    ['上传', '下载', '上传下载'],
    ['通知', '提醒', '消息', '消息通知'],
    ['报表', '统计', '图表', '数据报表'],
    ['支付', '订单', '购物车', '结算', '电商'],
    ['评论', '评分', '收藏', '社交', '分享'],
    ['内容管理', '内容增删改查', '内容编辑'],
  ];

  if (/计算器|calculator/i.test(fullText)) {
    let hasOperations = false;
    for (const op of operations) {
      if (op.pattern.test(fullText)) {
        hasOperations = true;
        deliverables.push({
          id: `${idPrefix}-${deliverables.length}`,
          description: `${title || '计算器'}: 实现${op.name}`,
          type: op.type,
          priority: 'high'
        });
      }
    }

    if (!hasOperations) {
      deliverables.push({
        id: `${idPrefix}-0`,
        description: `${title || '计算器'}: 实现基础框架`,
        type: 'ui',
        priority: 'high'
      });
      for (const op of operations) {
        deliverables.push({
          id: `${idPrefix}-${deliverables.length}`,
          description: `${title || '计算器'}: 实现${op.name}`,
          type: op.type,
          priority: 'medium'
        });
      }
    }

    deliverables.push({
      id: `${idPrefix}-${deliverables.length}`,
      description: `${title || '计算器'}: 集成测试`,
      type: 'test',
      priority: 'medium'
    });

  } else if (isImplementationTask) {
    if (uiPatterns.test(fullText)) {
      deliverables.push({
        id: `${idPrefix}-${deliverables.length}`,
        description: `${title}: 实现用户界面`,
        type: 'ui',
        priority: 'high'
      });
    }

    if (testPatterns.test(fullText)) {
      deliverables.push({
        id: `${idPrefix}-${deliverables.length}`,
        description: `${title}: 编写测试`,
        type: 'test',
        priority: 'medium'
      });
    }

    const matchedGroups = new Set();
    for (const group of functionalKeywordGroups) {
      const sortedGroup = [...group].sort((a, b) => b.length - a.length);
      for (const keyword of sortedGroup) {
        if (new RegExp(keyword).test(fullText)) {
          if (!matchedGroups.has(group)) {
            matchedGroups.add(group);
            const keywordWithSuffix = keyword.endsWith('功能') ? keyword : `${keyword}功能`;
            deliverables.push({
              id: `${idPrefix}-${deliverables.length}`,
              description: `${title}: 实现${keywordWithSuffix}`,
              type: 'logic',
              priority: 'medium'
            });
          }
          break;
        }
      }
    }

    if (deliverables.length === 0) {
      deliverables.push({
        id: `${idPrefix}-0`,
        description: title || description,
        type: 'logic',
        priority: 'medium'
      });
    }
  } else {
    deliverables.push({
      id: `${idPrefix}-0`,
      description: title || description,
      type: 'general',
      priority: 'medium'
    });
  }

  return {
    originalContent: task,
    subtasks: deliverables,
    metadata: { source: 'rule_based' }
  };
}

function testDecomposition(task) {
  console.log('='.repeat(60));
  console.log(`title: ${task.title}`);
  console.log(`description: ${task.description}`);
  console.log('');

  const result = decomposeTaskRuleBased(task);
  console.log(`分解结果: ${result.subtasks.length} 个子任务`);

  result.subtasks.forEach((subtask, i) => {
    console.log(`  ${i + 1}. [${subtask.type}] ${subtask.description}`);
  });
  console.log('');

  return result;
}

async function main() {
  console.log('规则分解测试\n');

  console.log('【测试1】计算器任务');
  testDecomposition({
    title: '实现一个简单的计算器功能',
    description: '实现一个简单的计算器功能，支持加减乘除运算'
  });

  console.log('【测试2】用户登录任务');
  testDecomposition({
    title: '用户登录功能',
    description: '实现用户登录功能，包含登录页面和后端验证'
  });

  console.log('【测试3】CRUD任务');
  testDecomposition({
    title: '用户管理',
    description: '实现用户的增删改查功能'
  });

  console.log('【测试4】内容管理任务');
  testDecomposition({
    title: '内容管理',
    description: '实现内容的增删改查、搜索、过滤、排序和分页功能'
  });

  process.exit(0);
}

main();
