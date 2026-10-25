const project = (name) => ({
  displayName: name,
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { types: ['node', 'jest'] } }],
  },
  testMatch: [`<rootDir>/tests/${name}/**/*.test.ts`],
});

module.exports = {
  projects: [project('unit'), project('integration')],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    // Jest subtracts separately gated files from the global group.
    global: { statements: 85, branches: 75, functions: 85, lines: 90 },
    './src/validation.ts': { statements: 100, branches: 95, functions: 100, lines: 100 },
  },
};
