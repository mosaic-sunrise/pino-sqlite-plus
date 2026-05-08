import { describe, it, expect } from 'vitest';
import {
  getTestContext,
  runWithTestContext,
  testContextStorage,
  createTestContextMixin,
  createTestContextSetter
} from '../src/test-logging-setup.js';
import { getActiveContext } from '../src/mixin.js';
import type { TestContext } from '../src/test-logging-setup.js';

describe('test-context', () => {
  it('should store and retrieve context', () => {
    const context: TestContext = { testRunId: 'test-run-123' };

    runWithTestContext(context, () => {
      const retrieved = getTestContext();
      expect(retrieved).toEqual(context);
      expect(retrieved?.testRunId).toBe('test-run-123');
    });
  });

  it('should return undefined when no context is set', () => {
    const retrieved = getTestContext();
    expect(retrieved).toBeUndefined();
  });

  it('should isolate context between different scopes', () => {
    const context1: TestContext = { testRunId: 'run-1' };
    const context2: TestContext = { testRunId: 'run-2' };

    let result1: string | undefined;
    let result2: string | undefined;

    runWithTestContext(context1, () => {
      result1 = getTestContext()?.testRunId;
      expect(result1).toBe('run-1');
    });

    runWithTestContext(context2, () => {
      result2 = getTestContext()?.testRunId;
      expect(result2).toBe('run-2');
    });

    expect(result1).toBe('run-1');
    expect(result2).toBe('run-2');
  });

  it('should propagate context through promises', async () => {
    const context: TestContext = { testRunId: 'async-test' };

    await runWithTestContext(context, async () => {
      await Promise.resolve();
      const retrieved = getTestContext();
      expect(retrieved?.testRunId).toBe('async-test');
    });
  });

  it('should propagate context through setTimeout', async () => {
    const context: TestContext = { testRunId: 'timeout-test' };

    await new Promise<void>((resolve) => {
      runWithTestContext(context, () => {
        setTimeout(() => {
          const retrieved = getTestContext();
          expect(retrieved?.testRunId).toBe('timeout-test');
          resolve();
        }, 10);
      });
    });
  });

  it('should handle nested async operations', async () => {
    const context: TestContext = { testRunId: 'nested-test' };

    await runWithTestContext(context, async () => {
      await Promise.resolve().then(() => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            const retrieved = getTestContext();
            expect(retrieved?.testRunId).toBe('nested-test');
            resolve();
          }, 5);
        });
      });
    });
  });

  it('should not leak context after scope exits', () => {
    const context: TestContext = { testRunId: 'leak-test' };

    runWithTestContext(context, () => {
      expect(getTestContext()?.testRunId).toBe('leak-test');
    });

    // Context should be cleared
    expect(getTestContext()).toBeUndefined();
  });
});

describe('createTestContextMixin', () => {
  it('should return only nodeEnv when no context is set', () => {
    const mixin = createTestContextMixin();
    const result = mixin();
    expect(result).toEqual({ nodeEnv: process.env.NODE_ENV || 'development' });
  });

  it('should return context with nodeEnv when set', () => {
    const mixin = createTestContextMixin();
    const context: TestContext = { testRunId: 'mixin-test' };

    runWithTestContext(context, () => {
      const result = mixin();
      expect(result).toEqual({
        nodeEnv: process.env.NODE_ENV || 'development',
        testRunId: 'mixin-test'
      });
    });
  });

  it('should not affect mixin between different calls', () => {
    const mixin = createTestContextMixin();
    const context1: TestContext = { testRunId: 'run-1' };
    const context2: TestContext = { testRunId: 'run-2' };
    const nodeEnv = process.env.NODE_ENV || 'development';

    let result1, result2;

    runWithTestContext(context1, () => {
      result1 = mixin();
    });

    runWithTestContext(context2, () => {
      result2 = mixin();
    });

    expect(result1).toEqual({ nodeEnv, testRunId: 'run-1' });
    expect(result2).toEqual({ nodeEnv, testRunId: 'run-2' });
  });
});

describe('createTestContextSetter', () => {
  it('should create a context setter with the provided testRunId', () => {
    const testContext = createTestContextSetter({ testRunId: 'setup-test' });

    expect(testContext.setContext).toBeInstanceOf(Function);
    expect(testContext.clearContext).toBeInstanceOf(Function);
  });

  it('should set context when setContext is called', () => {
    const testContext = createTestContextSetter({ testRunId: 'context-setter-test' });

    testContext.setContext();

    // Global context should be set
    const result = getActiveContext();
    expect(result?.testRunId).toBe('context-setter-test');

    // Clean up
    testContext.clearContext();
  });

  it('should clear context when clearContext is called', () => {
    const testContext = createTestContextSetter({ testRunId: 'clear-test' });

    testContext.setContext();
    expect(getActiveContext()?.testRunId).toBe('clear-test');

    testContext.clearContext();
    expect(getActiveContext()).toBeUndefined();
  });

  it('should create different contexts for different testRunIds', () => {
    const testContext1 = createTestContextSetter({ testRunId: 'first-run' });
    const testContext2 = createTestContextSetter({ testRunId: 'second-run' });

    testContext1.setContext();
    expect(getActiveContext()?.testRunId).toBe('first-run');

    testContext1.clearContext();

    testContext2.setContext();
    expect(getActiveContext()?.testRunId).toBe('second-run');

    testContext2.clearContext();
  });
});

describe('concurrent test safety', () => {
  it('should maintain separate contexts in concurrent operations', async () => {
    const context1: TestContext = { testRunId: 'concurrent-1' };
    const context2: TestContext = { testRunId: 'concurrent-2' };

    let result1: string | undefined;
    let result2: string | undefined;

    const promise1 = runWithTestContext(context1, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      result1 = getTestContext()?.testRunId;
    });

    const promise2 = runWithTestContext(context2, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      result2 = getTestContext()?.testRunId;
    });

    await Promise.all([promise1, promise2]);

    expect(result1).toBe('concurrent-1');
    expect(result2).toBe('concurrent-2');
  });

  it('should handle rapid context switching', async () => {
    const promises: Promise<void>[] = [];
    const results: string[] = [];

    for (let i = 0; i < 10; i++) {
      const context: TestContext = { testRunId: `switch-${i}` };
      promises.push(
        runWithTestContext(context, async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
          results.push(getTestContext()?.testRunId || 'undefined');
        })
      );
    }

    await Promise.all(promises);

    expect(results).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(results).toContain(`switch-${i}`);
    }
  });
});
