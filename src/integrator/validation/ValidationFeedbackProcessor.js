/**
 * Utility functions for processing validation results and integrating with quality feedback
 */

class ValidationFeedbackProcessor {
  constructor(qualityFeedbackProcessor = null) {
    this.qualityFeedbackProcessor = qualityFeedbackProcessor;
  }

  /**
   * Process validation results and generate quality feedback
   * @param {Object} validationResults - Results from ValidationCoordinator
   * @param {string} context - Context information about where validation occurred
   * @returns {Object} Processed feedback
   */
  processValidationFeedback(validationResults, context = '') {
    const feedback = {
      severity: 'info',
      category: 'validation',
      message: '',
      details: {},
      suggestions: []
    };

    if (!validationResults.success) {
      feedback.severity = 'warning';

      // Count errors and warnings
      const errorCount = validationResults.summary.errorCount || validationResults.errors.length;
      const warningCount = validationResults.summary.warningCount || validationResults.warnings.length;

      const messages = [];

      if (errorCount > 0) {
        feedback.severity = 'error';
        messages.push(`${errorCount} validation error${errorCount > 1 ? 's' : ''}`);
      }

      if (warningCount > 0) {
        messages.push(`${warningCount} validation warning${warningCount > 1 ? 's' : ''}`);
      }

      feedback.message = `Code validation issues detected: ${messages.join(' and ')}`;

      // Group results by validator type
      feedback.details.validatorResults = {};
      for (const [validatorType, result] of Object.entries(validationResults.results)) {
        feedback.details.validatorResults[validatorType] = {
          success: result.success,
          errorCount: result.errors ? result.errors.length : 0,
          warningCount: result.warnings ? result.warnings.length : 0,
          errors: result.errors || [],
          warnings: result.warnings || []
        };
      }

      // Add all suggestions from validation
      feedback.suggestions = [...validationResults.suggestions];

      // Generate specific suggestions based on error types
      const specificSuggestions = this.generateSpecificSuggestions(validationResults);
      feedback.suggestions.push(...specificSuggestions);
    } else {
      feedback.message = 'Code validation passed successfully';
      feedback.severity = 'success';
    }

    // Add context information
    feedback.context = context;

    return feedback;
  }

  /**
   * Generate specific suggestions based on validation errors
   */
  generateSpecificSuggestions(validationResults) {
    const suggestions = [];

    for (const [validatorType, result] of Object.entries(validationResults.results)) {
      if (result.errors && result.errors.length > 0) {
        switch (validatorType) {
          case 'eslint':
            suggestions.push('Ensure code follows ESLint rules and style guidelines');
            break;
          case 'typescript':
            suggestions.push('Fix TypeScript compilation errors before deployment');
            break;
          case 'runtime':
            suggestions.push('Test code in a safe environment to catch runtime errors');
            break;
        }
      }
    }

    return suggestions;
  }

  /**
   * Format validation results for display
   */
  formatValidationReport(validationResults) {
    const report = {
      summary: validationResults.summary,
      details: {},
      timestamp: new Date().toISOString(),
      validatorReports: {}
    };

    for (const [validatorType, result] of Object.entries(validationResults.results)) {
      report.validatorReports[validatorType] = {
        name: validatorType,
        success: result.success,
        errorCount: result.errors ? result.errors.length : 0,
        warningCount: result.warnings ? result.warnings.length : 0,
        errors: result.errors || [],
        warnings: result.warnings || [],
        suggestions: result.suggestions || []
      };
    }

    return report;
  }

  /**
   * Integrate validation feedback with existing quality feedback processor
   */
  async integrateWithQualityFeedback(validationResults, originalFeedback = []) {
    const validationFeedback = this.processValidationFeedback(validationResults, 'code_validation');

    // Combine with existing feedback if available
    const combinedFeedback = [...originalFeedback, validationFeedback];

    // If a quality feedback processor is provided, use it to further process
    if (this.qualityFeedbackProcessor && typeof this.qualityFeedbackProcessor.process === 'function') {
      return await this.qualityFeedbackProcessor.process(combinedFeedback);
    }

    return combinedFeedback;
  }
}

module.exports = ValidationFeedbackProcessor;