import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '.turbo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Underscore-prefixed names are intentionally unused (e.g. required by an interface).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.spec.ts'],
    languageOptions: { globals: { ...globals.jest } },
  },
  {
    files: ['**/*.{js,cjs}'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
