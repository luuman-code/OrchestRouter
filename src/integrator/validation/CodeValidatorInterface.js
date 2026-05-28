/**
 * Interface for code validators
 */
class CodeValidatorInterface {
  /**
   * Validates code and returns validation result
   * @param {string} code - The code to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result with success, errors, and suggestions
   */
  async validate(code, options = {}) {
    throw new Error('Method validate must be implemented');
  }

  /**
   * Gets the validator type
   * @returns {string} Validator type identifier
   */
  getType() {
    throw new Error('Method getType must be implemented');
  }
}

module.exports = CodeValidatorInterface;