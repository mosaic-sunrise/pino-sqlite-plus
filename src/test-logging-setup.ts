import {
  runWithTestContext,
  getTestContext,
  testContextStorage,
  type TestContext
} from './test-context.js';
import { setActiveContext } from './mixin.js';

export interface CreateTestContextSetterOptions {
  testRunId: string;
}

export interface TestContextSetter {
  setContext: () => void;
  clearContext: () => void;
}

/**
 * Create a setter that drives the mixin via process-global state.
 *
 * setContext()/clearContext() are intended for sequential test runners
 * (vitest/jest with single-threaded test execution). For concurrent code,
 * wrap work in runWithTestContext() to use AsyncLocalStorage instead —
 * the mixin checks that first and falls back to the global.
 */
export function createTestContextSetter(opts: CreateTestContextSetterOptions): TestContextSetter {
  const { testRunId } = opts;
  const context: TestContext = { testRunId };

  return {
    setContext: () => setActiveContext(context),
    clearContext: () => setActiveContext(undefined)
  };
}

export { testContextStorage, getTestContext, runWithTestContext };
export type { TestContext };
export { createTestContextMixin } from './mixin.js';
