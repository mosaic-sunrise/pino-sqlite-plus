import { AsyncLocalStorage } from 'node:async_hooks';

export interface TestContext {
  testRunId: string;
}

export const testContextStorage = new AsyncLocalStorage<TestContext>();

export function getTestContext(): TestContext | undefined {
  return testContextStorage.getStore();
}

export function runWithTestContext<T>(context: TestContext, callback: () => T): T {
  return testContextStorage.run(context, callback);
}
