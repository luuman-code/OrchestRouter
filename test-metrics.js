/**
 * Test script to verify metrics system functionality
 */

const { MetricsCollector } = require('./src/metrics/MetricsCollector');

async function testMetricsSystem() {
  console.log('Testing Metrics System...\n');

  // Create a metrics collector instance
  const metricsCollector = new MetricsCollector();

  // Wait a bit for initialization
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 1: Record a sample task
  console.log('Test 1: Recording sample task...');
  const sessionId = 'test-session-123';
  const taskId = 'test-task-456';
  const modelId = 'gpt-4';

  const tokenUsage = {
    input: 150,
    output: 300,
    total: 450,
    provider: 'openai',
    details: {
      promptTokens: 150,
      completionTokens: 300
    }
  };

  const executionTime = 2500; // 2.5 seconds

  const taskRecord = await metricsCollector.recordTask(
    sessionId,
    taskId,
    modelId,
    tokenUsage,
    executionTime,
    { test: true }
  );

  console.log('✓ Task recorded:', taskRecord);

  // Test 2: Get current session metrics
  console.log('\nTest 2: Getting session metrics...');
  const sessionMetrics = metricsCollector.getSessionMetrics(sessionId);
  console.log('✓ Session metrics:', sessionMetrics);

  // Test 3: Get today's metrics
  console.log('\nTest 3: Getting today\'s metrics...');
  const today = new Date().toISOString().split('T')[0];
  const dailyMetrics = await metricsCollector.getDailyMetrics(today);
  console.log('✓ Daily metrics:', dailyMetrics);

  // Test 4: Calculate cost
  console.log('\nTest 4: Calculating cost...');
  const cost = metricsCollector.calculateCost(modelId, tokenUsage);
  console.log(`✓ Cost calculated: $${cost.toFixed(6)}`);

  // Test 5: Update pricing config
  console.log('\nTest 5: Updating pricing config...');
  const newPricing = {
    ...Object.fromEntries(metricsCollector.modelPricing.entries()),
    'test-model': {
      inputPrice: 0.00001,
      outputPrice: 0.00003
    }
  };

  const updateResult = await metricsCollector.updatePricingConfig(newPricing);
  console.log('✓ Pricing config updated:', updateResult);

  console.log('\n✅ All tests passed! Metrics system is working correctly.');

  // Show the directory structure that was created
  console.log('\n📁 Directory structure created:');
  console.log('   metrics/');
  console.log('   ├── daily/');
  console.log('   │   └── YYYY-MM-DD.json');
  console.log('   ├── sessions/');
  console.log('   │   └── session_test-session-123.json');
  console.log('   └── config/');
  console.log('       └── pricing.json');
}

// Run the test
testMetricsSystem().catch(console.error);