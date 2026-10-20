import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import basecase from './tools/eslint/plugin.mjs';

const PADDING = [
  { blankLine: 'always', prev: '*', next: '*' },
  { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
  { blankLine: 'any', prev: 'expression', next: 'expression' },
  { blankLine: 'any', prev: 'import', next: 'import' },
  { blankLine: 'any', prev: 'export', next: 'export' },
  { blankLine: 'any', prev: ['case', 'default'], next: ['case', 'default'] },
  { blankLine: 'any', prev: 'directive', next: 'directive' },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'build/**',
      'vendor/**',
      'public/**',
      'library/**',
      'ai-reference/**',
      'bench/data/**',
      'bench/runs/**',
      'tools/parts/cad/**',
      'tools/parts/generated/**',
      'electron/trainer/.venv/**',
      'scratch/**',
      '**/node_modules/**',
    ],
  },
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { '@stylistic': stylistic, basecase, 'react-hooks': reactHooks },
    rules: {
      'basecase/no-comments': 'error',
      'basecase/no-nested-if': 'error',
      'basecase/no-rest-tuple-params': 'error',
      '@stylistic/padding-line-between-statements': ['error', ...PADDING],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true, IIFEs: true }],
      complexity: ['error', 15],
      'sonarjs/cognitive-complexity': ['error', 15],
      'no-else-return': 'error',
      'no-lonely-if': 'error',
      'no-nested-ternary': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      eqeqeq: ['error', 'smart'],
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/no-nested-template-literals': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/no-os-command-from-path': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      'sonarjs/super-linear-regex': 'off',
      'sonarjs/slow-regex': 'off',
      'sonarjs/regex-complexity': 'off',
      'sonarjs/void-use': 'off',
      'sonarjs/code-eval': 'off',
      'sonarjs/todo-tag': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: { ...reactHooks.configs['recommended-latest'].rules },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['src/data/**', 'electron/cad-agent-prompt.mjs'],
    rules: { 'max-lines': 'off', 'max-lines-per-function': 'off' },
  },
  prettier,
);
