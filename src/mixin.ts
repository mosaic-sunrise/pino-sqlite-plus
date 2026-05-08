import { getTestContext } from './test-context.js';

// Global fallback for test scenarios where AsyncLocalStorage context
// may not be available in the immediate scope
let activeContext: { testRunId: string } | undefined;

export function setActiveContext(context: { testRunId: string } | undefined) {
  activeContext = context;
}

export function getActiveContext() {
  return activeContext;
}

export function createTestContextMixin() {
  return function () {
    // Always include NODE_ENV for environment filtering
    const base = {
      nodeEnv: process.env.NODE_ENV || 'development'
    };

    // First check AsyncLocalStorage (for proper async context propagation)
    const context = getTestContext();
    if (context) {
      return { ...base, testRunId: context.testRunId };
    }

    // Fallback to global context (for test framework compatibility)
    if (activeContext) {
      return { ...base, testRunId: activeContext.testRunId };
    }

    return base;
  };
}
