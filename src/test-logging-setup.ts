import {
  runWithTestContext,
  getTestContext,
  testContextStorage,
  type TestContext
} from './test-context.js';
import { setActiveContext } from './mixin.js';

export interface SetupTestContextLoggingOptions {
  testRunId: string;
}

export interface TestContextSetter {
  setContext: () => void;
  clearContext: () => void;
}

export function setupTestContextLogging(opts: SetupTestContextLoggingOptions): TestContextSetter {
  const { testRunId } = opts;

  return {
    setContext: () => {
      const context: TestContext = { testRunId };
      // Set the global context for the mixin to use
      setActiveContext(context);
      // Also set in AsyncLocalStorage for scenarios where it works
      runWithTestContext(context, () => {
        // Context is now available via both mechanisms
      });
    },

    clearContext: () => {
      setActiveContext(undefined);
    }
  };
}

export { testContextStorage, getTestContext, runWithTestContext };
export type { TestContext };
export { createTestContextMixin } from './mixin.js';
