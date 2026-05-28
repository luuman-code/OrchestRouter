/**
 * Configuration for validation components
 */

module.exports = {
  // ESLint configuration
  eslint: {
    enabled: true,
    configPath: null, // Path to ESLint config file, or null to use default
    extensions: ['.js', '.ts', '.jsx', '.tsx']
  },

  // TypeScript compiler configuration
  typescript: {
    enabled: true,
    configPath: null, // Path to tsconfig.json, or null to use default settings
    extensions: ['.ts', '.tsx']
  },

  // Runtime validation configuration
  runtime: {
    enabled: true,
    timeout: 5000, // Timeout in milliseconds
    maxMemory: 128 * 1024 * 1024, // Max memory in bytes (128MB)
    allowedBuiltInModules: [
      'path', 'url', 'util', 'querystring', 'crypto', 'buffer', 'stream', 'events'
    ]
  },

  // Validation coordinator configuration
  coordinator: {
    enabledValidators: ['eslint', 'typescript', 'runtime'], // Validators to enable
    defaultTimeout: 10000, // Overall validation timeout
    reportFormat: 'detailed' // 'basic' or 'detailed'
  },

  // Security settings for runtime validation
  security: {
    forbidEval: true,
    forbidDynamicRequire: true,
    allowedPrototypes: ['Object', 'Array', 'Function', 'Date', 'RegExp', 'Error'],
    restrictedFileAccess: true
  }
};