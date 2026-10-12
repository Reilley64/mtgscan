const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'ios/*', 'android/*', '.expo/*'],
  },
  {
    files: ['src/auth/test-sign-in.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
