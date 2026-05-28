/**
 * 验证配置传递的测试
 */
const ModelSelector = require('./ModelSelector');

// 测试配置传递
const config = {
  strategyConfig: {
    enableLearning: true,
    persistenceType: 'file',
    persistencePath: './test-config-learning.json',
    learningWindow: 100
  }
};

console.log("测试配置传递...");
try {
  const selector = new ModelSelector(config);

  if (selector.learningSelector) {
    console.log('LearningSelector created successfully');
    console.log('Persistence type:', selector.learningSelector.config.persistenceType);
    console.log('Persistence path:', selector.learningSelector.config.persistencePath);

    // 清理测试文件
    setTimeout(() => {
      try {
        const fs = require('fs');
        if(fs.existsSync('./test-config-learning.json')) {
          fs.unlinkSync('./test-config-learning.json');
          console.log('Cleaned up test config file');
        }
      } catch(e) {
        console.log('Could not clean up test file:', e.message);
      }
    }, 1000);
  } else {
    console.log('LearningSelector not created - learning may not be enabled');
  }
} catch (error) {
  console.error('Error creating ModelSelector:', error);
}