import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  // CJS build is required so pino.transport({target: '...'})'s worker
  // thread can resolve via require(); the ESM build is what `import`
  // consumers get.
});
