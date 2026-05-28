/**
 * ModelStatusBroadcaster - 模型状态广播器
 *
 * 在健康检查完成后，将模型状态广播到所有需要感知模型可用性的组件
 */

class ModelStatusBroadcaster {
  constructor() {
    this.components = new Map(); // 注册的组件: componentName -> callback
    this.currentStatus = null;    // 当前模型状态
  }

  /**
   * 注册需要接收模型状态的组件
   * @param {string} componentName - 组件名称
   * @param {Function} callback - 状态更新回调，接收 statusMap 参数
   */
  register(componentName, callback) {
    if (this.components.has(componentName)) {
      console.warn(`[ModelStatusBroadcaster] 组件 ${componentName} 已注册，将被覆盖`);
    }
    this.components.set(componentName, callback);
    console.log(`[ModelStatusBroadcaster] 组件 ${componentName} 已注册`);

    // 如果已有状态，立即通知新注册的组件
    if (this.currentStatus) {
      try {
        callback(this.currentStatus);
        console.log(`[ModelStatusBroadcaster] 已向 ${componentName} 发送当前状态`);
      } catch (e) {
        console.warn(`[ModelStatusBroadcaster] 组件 ${componentName} 状态更新失败: ${e.message}`);
      }
    }
  }

  /**
   * 广播模型状态更新
   * @param {Object} statusMap - 模型状态映射 { modelId: { available: boolean, ... } }
   */
  broadcast(statusMap) {
    this.currentStatus = statusMap;
    console.log(`[ModelStatusBroadcaster] 开始广播模型状态到 ${this.components.size} 个组件`);

    let successCount = 0;
    let failCount = 0;

    for (const [name, callback] of this.components) {
      try {
        callback(statusMap);
        successCount++;
      } catch (e) {
        failCount++;
        console.warn(`[ModelStatusBroadcaster] 组件 ${name} 状态更新失败: ${e.message}`);
      }
    }

    console.log(`[ModelStatusBroadcaster] 广播完成: 成功 ${successCount}, 失败 ${failCount}`);
  }

  /**
   * 获取当前模型状态
   * @returns {Object|null} 当前模型状态
   */
  getCurrentStatus() {
    return this.currentStatus;
  }

  /**
   * 获取已注册的组件列表
   * @returns {string[]} 组件名称列表
   */
  getRegisteredComponents() {
    return Array.from(this.components.keys());
  }
}

module.exports = ModelStatusBroadcaster;
