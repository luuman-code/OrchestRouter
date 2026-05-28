/**
 * 分解器测试套件 - 运行所有测试等级
 *
 * 包含四个级别的测试:
 * - Easy: 基础功能验证
 * - Medium: 高级功能验证
 * - Hard: 复杂场景验证
 * - Integration: 组件协同验证
 */

const { runEasyTests } = require('./easy-tests');
const { runMediumTests } = require('./medium-tests');
const { runHardTests } = require('./hard-tests');
const { runIntegrationTests } = require('./integration-tests');

async function runAllTests() {
  console.log("🚀 Starting Complete Decomposer Test Suite\n");

  console.log("="*60);
  await runEasyTests();

  console.log("="*60);
  await runMediumTests();

  console.log("="*60);
  await runHardTests();

  console.log("="*60);
  await runIntegrationTests();

  console.log("="*60);
  console.log("🎉 All tests completed!");
}

// 运行特定级别测试的函数
async function runTestLevel(level) {
  switch(level.toLowerCase()) {
    case 'easy':
      await runEasyTests();
      break;
    case 'medium':
      await runMediumTests();
      break;
    case 'hard':
      await runHardTests();
      break;
    case 'integration':
      await runIntegrationTests();
      break;
    case 'all':
      await runAllTests();
      break;
    default:
      console.log(`Unknown test level: ${level}. Use 'easy', 'medium', 'hard', 'integration', or 'all'`);
  }
}

// 如果直接运行此文件，则执行所有测试
if (require.main === module) {
  const args = process.argv.slice(2);
  const level = args[0] ? args[0].toLowerCase() : 'all';
  runTestLevel(level).catch(console.error);
}

module.exports = {
  runAllTests,
  runTestLevel,
  runEasyTests,
  runMediumTests,
  runHardTests,
  runIntegrationTests
};