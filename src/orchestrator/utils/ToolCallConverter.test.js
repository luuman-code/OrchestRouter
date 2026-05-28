/**
 * ToolCallConverter 单元测试
 *
 * 运行方式：
 * 1. 独立模式（无需测试框架）：node ToolCallConverter.test.js
 * 2. Jest 模式：jest ToolCallConverter.test.js
 */

const ToolCallConverter = require('./ToolCallConverter');

// 检查是否在 Jest 环境中运行
const isJest = typeof describe !== 'undefined' && typeof test !== 'undefined';

if (isJest) {
  describe('ToolCallConverter', () => {
    let converter;

    beforeEach(() => {
      converter = new ToolCallConverter();
    });

    describe('convertToIntegratedToolCalls', () => {
      test('应该将文件转换为 write_file 工具调用', () => {
        const integrationResult = {
          files: new Map([
            ['src/example.js', {
              content: 'console.log("Hello");',
              language: 'javascript'
            }]
          ])
        };

        const result = converter.convertToIntegratedToolCalls(integrationResult);

        expect(result.content).toHaveLength(1);
        expect(result.content[0].name).toBe('write_file');
        expect(result.content[0].input.file_path).toBe('src/example.js');
      });

      test('应该处理多个文件', () => {
        const integrationResult = {
          files: new Map([
            ['src/index.js', { content: 'export default app;', language: 'javascript' }],
            ['src/utils.js', { content: 'export function help() {}', language: 'javascript' }],
            ['README.md', { content: '# My Project', language: 'markdown' }]
          ])
        };

        const result = converter.convertToIntegratedToolCalls(integrationResult);
        expect(result.content).toHaveLength(3);
      });

      test('应该为文件使用默认语言和空内容', () => {
        const integrationResult = {
          files: new Map([['empty.txt', {}]])
        };

        const result = converter.convertToIntegratedToolCalls(integrationResult);
        expect(result.content[0].input.content).toBe('');
        expect(result.content[0].input.language).toBe('text');
      });

      test('应该处理空的 files Map', () => {
        const integrationResult = { files: new Map() };
        const result = converter.convertToIntegratedToolCalls(integrationResult);
        expect(result.content).toHaveLength(0);
      });

      test('应该处理 undefined files', () => {
        const integrationResult = {};
        const result = converter.convertToIntegratedToolCalls(integrationResult);
        expect(result.content).toHaveLength(0);
      });

      test('应该将编辑操作转换为 edit_file 工具调用', () => {
        const integrationResult = {
          edits: [{
            file_path: 'src/app.js',
            old_string: 'function old() {}',
            new_string: 'function new() {}',
            replace_all: false
          }]
        };

        const result = converter.convertToIntegratedToolCalls(integrationResult);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].name).toBe('edit_file');
      });

      test('应该处理多个编辑操作', () => {
        const integrationResult = {
          edits: [
            { file_path: 'src/a.js', old_string: 'a', new_string: 'b' },
            { file_path: 'src/b.js', old_string: 'c', new_string: 'd' }
          ]
        };

        const result = converter.convertToIntegratedToolCalls(integrationResult);
        expect(result.content).toHaveLength(2);
      });

      test('应该将命令转换为 bash 工具调用', () => {
        const integrationResult = {
          commands: [{ command: 'npm install', description: '安装依赖' }]
        };

        const result = converter.convertToIntegratedToolCalls(integrationResult);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].name).toBe('bash');
        expect(result.content[0].input.command).toBe('npm install');
      });

      test('应该为命令使用默认描述', () => {
        const integrationResult = {
          commands: [{ command: 'ls -la' }]
        };

        const result = converter.convertToIntegratedToolCalls(integrationResult);
        expect(result.content[0].input.description).toBe('Executed by orchestrator');
      });

      test('应该同时处理文件、编辑和命令', () => {
        const integrationResult = {
          files: new Map([
            ['src/index.js', { content: 'main()', language: 'javascript' }]
          ]),
          edits: [
            { file_path: 'src/app.js', old_string: 'old', new_string: 'new' }
          ],
          commands: [
            { command: 'npm run build', description: '构建项目' }
          ]
        };

        const result = converter.convertToIntegratedToolCalls(integrationResult);
        expect(result.content).toHaveLength(3);
        const toolNames = result.content.map(c => c.name);
        expect(toolNames).toContain('write_file');
        expect(toolNames).toContain('edit_file');
        expect(toolNames).toContain('bash');
      });

      test('应该为每个工具调用生成唯一的 ID', () => {
        const integrationResult = {
          files: new Map([
            ['file1.js', { content: 'a', language: 'javascript' }],
            ['file2.js', { content: 'b', language: 'javascript' }]
          ])
        };

        const result = converter.convertToIntegratedToolCalls(integrationResult);
        const ids = result.content.map(c => c.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      });
    });

    describe('generateId', () => {
      test('应该生成唯一 ID', () => {
        const id1 = converter.generateId();
        const id2 = converter.generateId();
        const id3 = converter.generateId();
        expect(id1).not.toBe(id2);
        expect(id2).not.toBe(id3);
        expect(id1).not.toBe(id3);
      });

      test('应该生成合理长度的 ID', () => {
        const id = converter.generateId();
        expect(id.length).toBeGreaterThanOrEqual(20);
      });

      test('应该生成只包含字母数字的 ID', () => {
        const id = converter.generateId();
        expect(id).toMatch(/^[a-z0-9]+$/);
      });
    });
  });
}

// 独立测试模式（无需 Jest）
if (!isJest) {
  console.log('运行独立测试模式...\n');

  const converter = new ToolCallConverter();
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`  错误：${error.message}`);
      failed++;
    }
  }

  function assertEqual(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`期望 ${JSON.stringify(expected)}，得到 ${JSON.stringify(actual)}`);
    }
  }

  function assertMatch(actual, regex) {
    if (!regex.test(actual)) {
      throw new Error(`${actual} 不匹配 ${regex}`);
    }
  }

  function assertLength(array, length) {
    if (array.length !== length) {
      throw new Error(`期望长度 ${length}，得到 ${array.length}`);
    }
  }

  // 运行测试
  test('将文件转换为 write_file 工具调用', () => {
    const result = converter.convertToIntegratedToolCalls({
      files: new Map([
        ['src/example.js', { content: 'console.log("Hello");', language: 'javascript' }]
      ])
    });
    assertLength(result.content, 1);
    assertMatch(result.content[0].id, /^write_file_/);
    assertEqual(result.content[0].name, 'write_file');
  });

  test('处理多个文件', () => {
    const result = converter.convertToIntegratedToolCalls({
      files: new Map([
        ['src/a.js', { content: 'a', language: 'javascript' }],
        ['src/b.js', { content: 'b', language: 'javascript' }]
      ])
    });
    assertLength(result.content, 2);
  });

  test('处理编辑操作', () => {
    const result = converter.convertToIntegratedToolCalls({
      edits: [{ file_path: 'app.js', old_string: 'old', new_string: 'new' }]
    });
    assertLength(result.content, 1);
    assertMatch(result.content[0].id, /^edit_file_/);
    assertEqual(result.content[0].name, 'edit_file');
  });

  test('处理命令', () => {
    const result = converter.convertToIntegratedToolCalls({
      commands: [{ command: 'npm install', description: '安装依赖' }]
    });
    assertLength(result.content, 1);
    assertMatch(result.content[0].id, /^bash_/);
    assertEqual(result.content[0].name, 'bash');
  });

  test('生成唯一 ID', () => {
    const ids = new Set([converter.generateId(), converter.generateId(), converter.generateId()]);
    if (ids.size !== 3) throw new Error('ID 不是唯一的');
  });

  test('处理空输入', () => {
    const result = converter.convertToIntegratedToolCalls({});
    assertLength(result.content, 0);
  });

  test('同时处理文件、编辑和命令', () => {
    const result = converter.convertToIntegratedToolCalls({
      files: new Map([['src/index.js', { content: 'main()', language: 'javascript' }]]),
      edits: [{ file_path: 'app.js', old_string: 'old', new_string: 'new' }],
      commands: [{ command: 'npm run build', description: '构建' }]
    });
    assertLength(result.content, 3);
  });

  // 输出结果
  console.log(`\n测试结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
