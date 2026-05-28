/**
 * 保守预估 + 实时反馈预算控制测试
 *
 * 测试场景：
 * 1. 验证保守预估（带安全边际）是否正常工作
 * 2. 验证待确认预估管理
 * 3. 验证实时反馈循环
 * 4. 验证批量任务场景下是否能避免超支
 */

const CostController = require('./core/CostController');

async function testConservativeBudget() {
  console.log('=== 保守预估 + 实时反馈预算控制测试 ===\n');

  // 测试 1: 基础保守预估功能
  console.log('1. 测试基础保守预估功能...');
  const controller1 = new CostController(10.00, {
    conservativeEstimation: true,
    safetyMargin: 0.2 // 20% 安全边际
  });

  const cost1 = { total: 1.00, input: 0.4, output: 0.6, isLocal: false };
  const canAllocate1 = controller1.canAllocate(cost1);
  console.log(`   预估成本 $1.00，安全边际 20%，可用预算：$${controller1.getAvailableBudget().toFixed(2)}`);
  console.log(`   是否可以分配：${canAllocate1}`);

  const allocated1 = controller1.allocateEstimated(cost1, 'task_001', 'gpt-4o-mini');
  console.log(`   分配结果：${allocated1}`);
  console.log(`   分配后预算状态:`);
  console.log(`     - 已花费：$${controller1.spent.toFixed(2)}`);
  console.log(`     - 已承诺：$${controller1.committedBudget.toFixed(2)}`);
  console.log(`     - 可用：$${controller1.getAvailableBudget().toFixed(2)}`);

  // 测试 2: 安全边际防止超支
  console.log('\n2. 测试安全边际防止超支...');
  const controller2 = new CostController(10.00, {
    conservativeEstimation: true,
    safetyMargin: 0.2
  });

  // 尝试分配 9 个任务，每个$1.00
  const tasks = [];
  for (let i = 0; i < 9; i++) {
    const taskId = `task_${String(i).padStart(3, '0')}`;
    const cost = { total: 1.00, input: 0.4, output: 0.6, isLocal: false };
    const allocated = controller2.allocateEstimated(cost, taskId, 'gpt-4o-mini');
    tasks.push({ taskId, allocated, cost });
    console.log(`   ${taskId}: ${allocated ? '已分配' : '被拒绝'} (可用预算：$${controller2.getAvailableBudget().toFixed(2)})`);
  }

  // 第 10 个任务应该被拒绝（因为安全边际）
  const cost10 = { total: 1.00, input: 0.4, output: 0.6, isLocal: false };
  const allocated10 = controller2.allocateEstimated(cost10, 'task_009', 'gpt-4o-mini');
  console.log(`   task_009: ${allocated10 ? '已分配' : '被拒绝'} (可用预算：$${controller2.getAvailableBudget().toFixed(2)})`);
  console.log(`   统计：总共分配了 ${tasks.filter(t => t.allocated).length} 个任务`);

  // 测试 3: 实时反馈 - 确认预估并更新实际成本
  console.log('\n3. 测试实时反馈循环...');
  const controller3 = new CostController(10.00, {
    conservativeEstimation: true,
    safetyMargin: 0.2
  });

  // 分配预估成本
  const cost3 = { total: 1.00, input: 0.4, output: 0.6, isLocal: false };
  controller3.allocateEstimated(cost3, 'task_feedback', 'gpt-4o-mini');
  console.log(`   初始状态：已花费 $${controller3.spent.toFixed(2)}, 已承诺 $${controller3.committedBudget.toFixed(2)}, 可用 $${controller3.getAvailableBudget().toFixed(2)}`);

  // 确认预估（任务开始执行）
  controller3.confirmEstimate('task_feedback', cost3);
  console.log(`   确认预估后：已花费 $${controller3.spent.toFixed(2)}, 已承诺 $${controller3.committedBudget.toFixed(2)}, 可用 $${controller3.getAvailableBudget().toFixed(2)}`);

  // 更新实际成本（任务完成）
  const actualCost3 = { total: 0.95, input: 0.38, output: 0.57 }; // 实际成本略低于预估
  controller3.updateActualCost('task_feedback', actualCost3, { input: 380, output: 570 });
  console.log(`   更新实际成本后：已花费 $${controller3.spent.toFixed(2)}, 已承诺 $${controller3.committedBudget.toFixed(2)}, 可用 $${controller3.getAvailableBudget().toFixed(2)}`);
  console.log(`   实际成本：$${actualCost3.total.toFixed(2)}, 预估成本：$${cost3.total.toFixed(2)}, 差异：$${(actualCost3.total - cost3.total).toFixed(2)}`);

  // 测试 4: 批量任务场景（模拟并发选择）
  console.log('\n4. 测试批量任务场景（模拟并发选择）...');
  const controller4 = new CostController(10.00, {
    conservativeEstimation: true,
    safetyMargin: 0.25 // 使用 25% 安全边际
  });

  const batchTasks = [
    { id: 'batch_001', cost: { total: 0.50, isLocal: false } },
    { id: 'batch_002', cost: { total: 0.50, isLocal: false } },
    { id: 'batch_003', cost: { total: 0.50, isLocal: false } },
    { id: 'batch_004', cost: { total: 0.50, isLocal: false } },
    { id: 'batch_005', cost: { total: 0.50, isLocal: false } },
    { id: 'batch_006', cost: { total: 0.50, isLocal: false } },
    { id: 'batch_007', cost: { total: 0.50, isLocal: false } },
    { id: 'batch_008', cost: { total: 0.50, isLocal: false } },
    { id: 'batch_009', cost: { total: 0.50, isLocal: false } },
    { id: 'batch_010', cost: { total: 0.50, isLocal: false } }
  ];

  console.log('   批量分配任务（每个$0.50，含安全边际后$0.625）：');
  let allocatedCount = 0;
  let rejectedCount = 0;

  for (const task of batchTasks) {
    const allocated = controller4.allocateEstimated(task.cost, task.id, 'gpt-4o-mini');
    if (allocated) {
      allocatedCount++;
    } else {
      rejectedCount++;
    }
  }

  console.log(`   分配结果：${allocatedCount} 个成功，${rejectedCount} 个被拒绝`);
  console.log(`   最终预算状态:`);
  console.log(`     - 已花费：$${controller4.spent.toFixed(2)}`);
  console.log(`     - 已承诺：$${controller4.committedBudget.toFixed(2)}`);
  console.log(`     - 可用：$${controller4.getAvailableBudget().toFixed(2)}`);
  console.log(`     - 预算使用率：${(controller4.getBudgetUtilization() * 100).toFixed(1)}%`);

  // 验证是否超支
  const totalCommitted = allocatedCount * 0.50 * 1.25; // 含安全边际
  console.log(`   验证：总承诺预算 $${totalCommitted.toFixed(2)} <= 初始预算 $10.00 = ${totalCommitted <= 10.00 ? '是 (未超支)' : '否 (已超支!)'}`);

  // 测试 5: 待确认预估过期清理
  console.log('\n5. 测试待确认预估过期清理...');
  const controller5 = new CostController(10.00, {
    conservativeEstimation: true,
    safetyMargin: 0.2,
    pendingConfirmTimeout: 1000 // 1 秒超时（用于测试）
  });

  const cost5 = { total: 1.00, input: 0.4, output: 0.6, isLocal: false };
  controller5.allocateEstimated(cost5, 'task_expire', 'gpt-4o-mini');
  console.log(`   分配后：已承诺 $${controller5.committedBudget.toFixed(2)}, 待确认数 ${controller5.pendingEstimates.size}`);

  // 等待超时
  console.log('   等待 1.5 秒让预估过期...');
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 手动触发清理
  controller5._cleanupPendingEstimates();
  console.log(`   清理后：已承诺 $${controller5.committedBudget.toFixed(2)}, 待确认数 ${controller5.pendingEstimates.size}`);

  // 测试 6: 禁用保守预估
  console.log('\n6. 测试禁用保守预估...');
  const controller6 = new CostController(10.00, {
    conservativeEstimation: false,
    safetyMargin: 0.2
  });

  const cost6 = { total: 1.00, input: 0.4, output: 0.6, isLocal: false };
  controller6.allocateEstimated(cost6, 'task_no_margin', 'gpt-4o-mini');
  console.log(`   禁用保守预估后:`);
  console.log(`     - 已承诺：$${controller6.committedBudget.toFixed(2)} (应为$1.00，不含安全边际)`);
  console.log(`     - 可用：$${controller6.getAvailableBudget().toFixed(2)}`);

  console.log('\n=== 保守预估 + 实时反馈预算控制测试完成 ===');

  // 清理所有控制器
  [controller1, controller2, controller3, controller4, controller5, controller6].forEach(c => c.destroy());
}

// 运行测试
testConservativeBudget().catch(console.error);