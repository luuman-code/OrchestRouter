/**
 * API Service for Configuration Management
 * Provides methods to interact with the backend configuration API
 */

const API_BASE_URL = 'http://localhost:3458';

// Get all selection rules
export const getSelectionRules = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/selection-rules`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('获取选择规则失败:', error);
    throw error;
  }
};

// Add a new selection rule
export const addSelectionRule = async (rule) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/selection-rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rule),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('添加选择规则失败:', error);
    throw error;
  }
};

// Update a selection rule
export const updateSelectionRule = async (taskType, rule) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/selection-rules/${encodeURIComponent(taskType)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rule),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('更新选择规则失败:', error);
    throw error;
  }
};

// Delete a selection rule
export const deleteSelectionRule = async (taskType) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/selection-rules/${encodeURIComponent(taskType)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('删除选择规则失败:', error);
    throw error;
  }
};

// Get all models
export const getModels = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/models`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('获取模型失败:', error);
    throw error;
  }
};

// Add a new model
export const addModel = async (model) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/models`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(model),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('添加模型失败:', error);
    throw error;
  }
};

// Update a model
export const updateModel = async (modelId, model) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/models/${encodeURIComponent(modelId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(model),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('更新模型失败:', error);
    throw error;
  }
};

// Delete a model
export const deleteModel = async (modelId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/models/${encodeURIComponent(modelId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('删除模型失败:', error);
    throw error;
  }
};

// Reset to default configuration
export const resetToDefaults = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/reset`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('重置配置失败:', error);
    throw error;
  }
};

// Save configuration
export const saveConfiguration = async (config) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('保存配置失败:', error);
    throw error;
  }
};

// Adapter configuration API
export const getAdapterConfig = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/adapters`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('获取适配器配置失败:', error);
    throw error;
  }
};

export const saveAdapterConfig = async (config) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/adapters`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('保存适配器配置失败:', error);
    throw error;
  }
};

export const updateProviderAdapter = async (providerName: string, adapter: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/providers/${encodeURIComponent(providerName)}/adapter`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ adapter }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('更新提供商适配器失败:', error);
    throw error;
  }
};

// 创建自定义适配器
export const createCustomAdapter = async (name: string, config: object) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/adapters/custom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, config }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('创建自定义适配器失败:', error);
    throw error;
  }
};

// 删除自定义适配器
export const deleteCustomAdapter = async (name: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/adapters/custom/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('删除自定义适配器失败:', error);
    throw error;
  }
};

// ================= 模型-任务矩阵配置 API =================

// 获取模型任务矩阵配置
export const getModelTaskMatrix = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/model-task-matrix`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('获取模型任务矩阵失败:', error);
    throw error;
  }
};

// 更新 suitability 矩阵
export const updateSuitabilityMatrix = async (matrix: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/model-task-matrix/suitability`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(matrix),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('更新 suitability 矩阵失败:', error);
    throw error;
  }
};

// 更新维度权重
export const updateDimensionWeights = async (weights: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/model-task-matrix/weights`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(weights),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('更新维度权重失败:', error);
    throw error;
  }
};