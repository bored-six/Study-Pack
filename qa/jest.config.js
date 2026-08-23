/** Config for the QA audit only — the app's own suite stays in package.json. */
module.exports = {
  preset: 'jest-expo',
  rootDir: '..',
  testMatch: ['<rootDir>/qa/**/*.test.ts'],
  testTimeout: 300000,
};
