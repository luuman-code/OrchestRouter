/**
 * 运行两个测试脚本并比较结果
 * - 增量累积逻辑 vs 完整值替换逻辑
 */

const { spawn } = require('child_process');
const path = require('path');

async function runTest(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`运行: ${scriptName}`);
    console.log('='.repeat(60));

    const child = spawn('node', [scriptPath], {
      cwd: __dirname,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`\n脚本 ${scriptName} 退出码: ${code}`);
        console.error(`stderr: ${stderr}`);
        reject(new Error(`Script exited with code ${code}`));
      } else {
        resolve({ stdout, stderr });
      }
    });

    child.on('error', reject);
  });
}

async function main() {
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(12) + 'MiniMax 流式响应格式测试' + ' '.repeat(20) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  try {
    console.log('\n【测试 1】增量累积逻辑 (假设 arguments 是增量片段)');
    await runTest('test-minimax-stream-incremental.js');

    console.log('\n\n【测试 2】完整值替换逻辑 (假设 arguments 是完整值)');
    await runTest('test-minimax-stream-full.js');

    console.log('\n' + '='.repeat(60));
    console.log('测试完成');
    console.log('='.repeat(60));
    console.log(`
请检查两个测试的输出：

- 如果【增量累积逻辑】能正确解析 arguments，
  说明 MiniMax 流式响应使用增量片段格式

- 如果【完整值替换逻辑】能正确解析 arguments，
  说明 MiniMax 流式响应使用完整值格式

- 如果两者结果不同，说明工具调用格式可能在不同 chunk 中变化
`);
  } catch (error) {
    console.error('\n测试执行失败:', error.message);
  }
}

main();
