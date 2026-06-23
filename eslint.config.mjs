import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier';

export default [
  // Global ignores (must be its own object to apply project-wide).
  { ignores: ['node_modules/', 'dist/', 'coverage/'] },

  { files: ['**/*.{js,mjs,cjs,ts}'] },
  { languageOptions: { globals: globals.node } },

  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,

  // Turns OFF all ESLint rules that conflict with Prettier formatting.
  eslintConfigPrettier,

  {
    plugins: {
      prettier: eslintPluginPrettier,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off',
      // Run Prettier as an ESLint rule. No inline options — reads .prettierrc
      // so formatting config lives in one place.
      'prettier/prettier': 'error',
    },
  },
];
