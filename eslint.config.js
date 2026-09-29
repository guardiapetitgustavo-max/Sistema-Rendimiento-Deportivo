const js = require('@eslint/js');
const globals = require('globals');

const reglas = {
  ...js.configs.recommended.rules,
  'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
  eqeqeq: ['error', 'always'],
  'no-var': 'error',
  'prefer-const': 'error',
};

module.exports = [
  { ignores: ['node_modules/**', 'public/vendor/**', '.vercel/**'] },
  {
    files: ['src/**/*.js', 'api/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: reglas,
  },
  {
    files: ['public/js/**/*.js'],
    ignores: ['public/js/tema-inicial.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, bootstrap: 'readonly', Chart: 'readonly' },
    },
    rules: reglas,
  },
  {
    files: ['public/js/tema-inicial.js'],
    languageOptions: { ecmaVersion: 5, sourceType: 'script', globals: { ...globals.browser } },
    rules: js.configs.recommended.rules,
  },
];
