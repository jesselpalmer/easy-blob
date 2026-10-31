import { defineConfig } from 'vitest/config';

const floors = { statements: 85, branches: 75, functions: 85, lines: 90 };

export default defineConfig({
  test: {
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    projects: ['unit', 'integration'].map((name) => ({
      extends: true,
      test: { name, environment: 'node', include: [`tests/${name}/**/*.test.ts`] },
    })),
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'json', 'json-summary', 'html'],
      thresholds: {
        ...floors,
        // Vitest includes validation in global totals, unlike Jest. Gate the
        // remaining files separately so pure validation cannot mask regressions.
        'src/**/!(validation).ts': floors,
        'src/validation.ts': { statements: 100, branches: 95, functions: 100, lines: 100 },
      },
    },
  },
});
