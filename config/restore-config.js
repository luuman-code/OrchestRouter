#!/usr/bin/env node

/**
 * OrchestRouter 配置恢复脚本
 * 从模板配置文件恢复所有配置参数，通过API端点
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'config.json');
const TEMPLATE_PATH = path.join(__dirname, 'config-template.json');

// API配置
const API_BASE_URL = 'http://localhost:3458';

async function restoreFromTemplate() {
  console.log('开始从模板通过API恢复配置...');

  try {
    // 读取模板配置
    const templateData = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const templateConfig = JSON.parse(templateData);

    // 通过API保存配置
    try {
      const response = await axios.post(`${API_BASE_URL}/api/config/save`, templateConfig, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10秒超时
      });

      console.log('✅ 配置已成功通过API从模板恢复');
      console.log('API响应:', response.data);
    } catch (apiError) {
      console.error('❌ 通过API恢复配置失败:', apiError.message);
      if (apiError.response) {
        console.error('API响应状态:', apiError.response.status);
        console.error('API响应数据:', apiError.response.data);
      }

      // 如果API失败，回退到文件写入方式
      console.log('⚠️  回退到文件写入方式恢复配置...');
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(templateConfig, null, 2), 'utf8');
      console.log('✅ 配置已通过文件写入方式恢复');
    }

    console.log(`📋 模板文件: ${TEMPLATE_PATH}`);
    console.log(`📋 目标文件: ${CONFIG_PATH}`);

    // 验证恢复是否成功（通过API读取）
    try {
      const verificationResponse = await axios.get(`${API_BASE_URL}/config`);
      const currentConfig = verificationResponse.data;

      if (currentConfig.$version === templateConfig.$version) {
        console.log('✅ 配置版本验证通过');
      } else {
        console.warn('⚠️  配置版本验证失败');
      }

      console.log('\n恢复的配置包含以下主要模块:');
      const modules = Object.keys(templateConfig).filter(key =>
        typeof templateConfig[key] === 'object' && templateConfig[key] !== null
      );

      modules.forEach(module => {
        console.log(`  - ${module}`);
      });
    } catch (verificationError) {
      console.error('⚠️  配置验证失败，但恢复已完成:', verificationError.message);
    }

  } catch (error) {
    console.error('❌ 配置恢复失败:', error.message);
    process.exit(1);
  }
}

// 运行恢复函数
if (require.main === module) {
  restoreFromTemplate()
    .catch(error => {
      console.error('配置恢复过程中发生错误:', error);
      process.exit(1);
    });
}

module.exports = { restoreFromTemplate };