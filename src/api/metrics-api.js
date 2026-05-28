/**
 * Metrics API - 指标管理API接口
 *
 * 提供获取汇总指标、会话指标和管理定价配置的API端点
 */

const { MetricsCollector } = require('../metrics/MetricsCollector');

class MetricsAPI {
  constructor(metricsCollector, configService = null) {
    this.metricsCollector = metricsCollector;
    this.configService = configService;
  }

  setupRoutes(app) {
    // 获取汇总指标
    app.get('/api/metrics', async (req, res) => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const dailyMetrics = await this.metricsCollector.getDailyMetrics(today);

        // 获取上周的汇总数据用于对比
        const lastWeekStart = new Date();
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date();
        const weeklyMetrics = await this.metricsCollector.getWeeklyMetrics(
          lastWeekStart.toISOString().split('T')[0],
          lastWeekEnd.toISOString().split('T')[0]
        );

        res.json({
          success: true,
          data: {
            today: dailyMetrics,
            weeklySummary: weeklyMetrics,
            currentSessions: this.metricsCollector.getAllSessions()
          }
        });
      } catch (error) {
        console.error('[MetricsAPI] Error getting metrics:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 获取指定会话的指标
    app.get('/api/metrics/sessions/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const sessionMetrics = this.metricsCollector.getSessionMetrics(sessionId);

        if (sessionMetrics) {
          res.json({
            success: true,
            data: sessionMetrics
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }
      } catch (error) {
        console.error('[MetricsAPI] Error getting session metrics:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 获取定价配置
    app.get('/api/metrics/pricing', async (req, res) => {
      try {
        const pricingConfig = {};

        // 从 CostTracker → ModelRegistry 获取所有模型的定价
        if (this.metricsCollector.costTracker && this.metricsCollector.costTracker.modelRegistry) {
          const allModels = this.metricsCollector.costTracker.modelRegistry.getAllModels();
          for (const model of allModels) {
            if (model.id && model.pricing) {
              pricingConfig[model.id] = {
                inputPrice: model.pricing.input || model.pricing.inputPrice,
                outputPrice: model.pricing.output || model.pricing.outputPrice
              };
            }
          }
        }

        res.json({
          success: true,
          data: pricingConfig
        });
      } catch (error) {
        console.error('[MetricsAPI] Error getting pricing config:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 更新定价配置
    app.put('/api/metrics/pricing', async (req, res) => {
      try {
        const pricingConfig = req.body;

        if (!pricingConfig || typeof pricingConfig !== 'object') {
          res.status(400).json({
            success: false,
            error: 'Invalid pricing configuration: expected an object with model pricing data'
          });
          return;
        }

        // 如果提供了 ConfigService，使用它来更新定价
        if (this.configService) {
          const results = [];
          for (const [modelId, pricing] of Object.entries(pricingConfig)) {
            if (pricing && typeof pricing === 'object') {
              const updateData = {
                pricing: {
                  input: pricing.inputPrice || pricing.input,
                  output: pricing.outputPrice || pricing.output
                }
              };
              const success = this.configService.updateModel(modelId, updateData);
              results.push({ modelId, success });
            }
          }

          res.json({
            success: true,
            message: `Updated pricing for ${results.filter(r => r.success).length} models`,
            results
          });
        } else {
          // 如果没有 ConfigService，更新内存中的 CostTracker 定价缓存
          if (this.metricsCollector.costTracker && this.metricsCollector.costTracker.modelRegistry) {
            for (const [modelId, pricing] of Object.entries(pricingConfig)) {
              if (pricing && typeof pricing === 'object') {
                const model = this.metricsCollector.costTracker.modelRegistry.getModel(modelId);
                if (model) {
                  model.pricing = {
                    input: pricing.inputPrice || pricing.input,
                    output: pricing.outputPrice || pricing.output
                  };
                }
              }
            }
          }

          res.json({
            success: true,
            message: 'Pricing updated in memory only. For persistent changes, restart the server with updated config.json',
            warning: 'Changes are not persisted to config file'
          });
        }
      } catch (error) {
        console.error('[MetricsAPI] Error updating pricing config:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 获取历史指标（按时间范围）
    app.get('/api/metrics/history', async (req, res) => {
      try {
        const { startDate, endDate, granularity = 'daily' } = req.query;

        if (granularity === 'weekly') {
          const weeklyMetrics = await this.metricsCollector.getWeeklyMetrics(startDate, endDate);
          res.json({
            success: true,
            data: weeklyMetrics
          });
        } else if (granularity === 'monthly') {
          // 从startDate解析年月
          const date = new Date(startDate);
          const year = date.getFullYear();
          const month = date.getMonth() + 1; // getMonth()返回0-11，需要加1

          const monthlyMetrics = await this.metricsCollector.getMonthlyMetrics(year, month);
          res.json({
            success: true,
            data: monthlyMetrics
          });
        } else {
          // 日度聚合
          const dailyMetrics = [];
          const start = new Date(startDate);
          const end = new Date(endDate);

          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dailyData = await this.metricsCollector.getDailyMetrics(dateStr);
            dailyMetrics.push(dailyData);
          }

          res.json({
            success: true,
            data: dailyMetrics
          });
        }
      } catch (error) {
        console.error('[MetricsAPI] Error getting historical metrics:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }
}

module.exports = MetricsAPI;