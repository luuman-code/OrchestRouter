/**
 * SystemCoordinator - 系统级资源协调器
 *
 * 【新增 2026-03-29】
 * 用于监控系统资源使用情况，并与其他系统组件协调资源分配
 * 特别是协调健康检查与用户请求之间的资源竞争
 *
 * 功能:
 * - 监控系统资源（CPU、内存、网络带宽）
 * - 根据系统负载调整健康检查频率
 * - 协调系统级资源分配
 */
class SystemCoordinator {
  constructor(config = {}) {
    this.config = {
      cpuThresholdHigh: config.cpuThresholdHigh || 0.7,      // CPU 使用率高阈值
      cpuThresholdCritical: config.cpuThresholdCritical || 0.9, // CPU 使用率临界阈值
      memoryThresholdHigh: config.memoryThresholdHigh || 0.7,    // 内存使用率高阈值
      memoryThresholdCritical: config.memoryThresholdCritical || 0.9, // 内存使用率临界阈值
      checkInterval: config.checkInterval || 10000, // 系统状态检查间隔（毫秒）
      ...config
    };

    this.monitors = new Map(); // 存储监控的组件
    this.systemStats = {
      cpu: 0,
      memory: 0,
      network: 0,
      timestamp: Date.now()
    };

    this.checkTimer = null;
  }

  /**
   * 启动系统监控
   */
  async start() {
    try {
      // 导入系统监控库
      this.os = require('os');
    } catch (error) {
      // 如果无法导入系统监控库，则使用模拟数据
      console.warn('[SystemCoordinator] 无法导入系统监控库，使用模拟数据');
      this.useMockData = true;
    }

    // 启动定期系统状态检查
    this.checkTimer = setInterval(() => {
      this.updateSystemStats();
    }, this.config.checkInterval);
  }

  /**
   * 停止系统监控
   */
  async stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * 更新系统统计信息
   */
  updateSystemStats() {
    if (this.useMockData) {
      this.updateMockSystemStats();
      return;
    }

    try {
      // 获取 CPU 使用率
      const cpus = this.os.cpus();
      let totalIdle = 0, totalTick = 0;

      for (const cpu of cpus) {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      }

      const currentUsage = ((totalTick - totalIdle) / totalTick) * 100;
      this.systemStats.cpu = currentUsage / 100; // 归一化到 0-1

      // 获取内存使用率
      const totalMem = this.os.totalmem();
      const freeMem = this.os.freemem();
      const usedMem = totalMem - freeMem;
      this.systemStats.memory = usedMem / totalMem;

      // 获取网络使用情况（简化版）
      const networkInterfaces = this.os.networkInterfaces();
      let totalBytes = 0;
      for (const iface in networkInterfaces) {
        for (const addr of networkInterfaces[iface]) {
          if (!addr.internal && addr.family === 'IPv4') {
            // 实际应用中应该监测网络流量，这里简化处理
            break;
          }
        }
      }
      this.systemStats.network = Math.random() * 0.5; // 模拟网络负载

      this.systemStats.timestamp = Date.now();

      // 更新注册的监控组件
      this.updateMonitoredComponents();
    } catch (error) {
      console.error('[SystemCoordinator] 更新系统统计信息失败:', error.message);
    }
  }

  /**
   * 更新模拟系统统计数据
   */
  updateMockSystemStats() {
    // 模拟随机系统负载
    this.systemStats.cpu = Math.random() * 0.8; // 0-80% CPU
    this.systemStats.memory = Math.random() * 0.8; // 0-80% 内存
    this.systemStats.network = Math.random() * 0.6; // 0-60% 网络
    this.systemStats.timestamp = Date.now();

    // 更新注册的监控组件
    this.updateMonitoredComponents();
  }

  /**
   * 更新注册的监控组件
   */
  updateMonitoredComponents() {
    for (const [name, monitor] of this.monitors) {
      try {
        const loadFactor = this.calculateLoadFactor();
        if (typeof monitor.setSystemLoadFactor === 'function') {
          monitor.setSystemLoadFactor(loadFactor);
        }
      } catch (error) {
        console.error(`[SystemCoordinator] 更新监控组件 ${name} 失败:`, error.message);
      }
    }
  }

  /**
   * 计算系统负载调整因子
   * @returns {number} 负载调整因子 (0.0-2.0)
   */
  calculateLoadFactor() {
    const { cpu, memory } = this.systemStats;

    // 计算综合负载分数（基于CPU和内存）
    let loadScore = 0;

    // CPU 负载权重 0.6
    if (cpu >= this.config.cpuThresholdCritical) {
      loadScore += 0.6 * 1.0; // 严重超载
    } else if (cpu >= this.config.cpuThresholdHigh) {
      loadScore += 0.6 * 0.7; // 高负载
    } else {
      loadScore += 0.6 * cpu; // 按比例
    }

    // 内存负载权重 0.4
    if (memory >= this.config.memoryThresholdCritical) {
      loadScore += 0.4 * 1.0; // 严重超载
    } else if (memory >= this.config.memoryThresholdHigh) {
      loadScore += 0.4 * 0.7; // 高负载
    } else {
      loadScore += 0.4 * memory; // 按比例
    }

    // 根据负载分数计算调整因子
    if (loadScore > 0.8) {
      return 0.2; // 负载很重，大幅减少资源消耗
    } else if (loadScore > 0.6) {
      return 0.5; // 负载较高，适度减少资源消耗
    } else if (loadScore > 0.4) {
      return 0.8; // 负载适中，略微减少资源消耗
    } else if (loadScore < 0.1) {
      return 1.2; // 负载很轻，可以适度增加活动
    }

    return 1.0 - loadScore * 0.2; // 平滑调整
  }

  /**
   * 注册监控组件
   * @param {string} name - 组件名称
   * @param {Object} monitor - 监控组件（需要有setSystemLoadFactor方法）
   */
  registerMonitor(name, monitor) {
    this.monitors.set(name, monitor);

    // 立即设置初始负载因子
    const initialLoadFactor = this.calculateLoadFactor();
    if (typeof monitor.setSystemLoadFactor === 'function') {
      monitor.setSystemLoadFactor(initialLoadFactor);
    }
  }

  /**
   * 注销监控组件
   * @param {string} name - 组件名称
   */
  unregisterMonitor(name) {
    this.monitors.delete(name);
  }

  /**
   * 获取当前系统状态
   * @returns {Object} 系统状态
   */
  getSystemStatus() {
    const loadFactor = this.calculateLoadFactor();

    return {
      ...this.systemStats,
      loadFactor,
      loadLevel: this.getLoadLevel(loadFactor),
      config: this.config,
      monitoredComponents: Array.from(this.monitors.keys())
    };
  }

  /**
   * 获取负载级别描述
   * @param {number} loadFactor - 负载调整因子
   * @returns {string} 负载级别
   */
  getLoadLevel(loadFactor) {
    if (loadFactor <= 0.3) return 'critical';    // 严重限制
    if (loadFactor <= 0.6) return 'high';        // 高负载
    if (loadFactor <= 1.0) return 'normal';      // 正常
    return 'light';                              // 轻负载
  }

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

module.exports = { SystemCoordinator };