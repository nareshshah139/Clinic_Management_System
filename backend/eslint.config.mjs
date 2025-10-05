// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'no-restricted-syntax': [
        'warn',
        {
          selector: "Literal[value='DOCTOR']",
          message: 'Use UserRole.DOCTOR from @prisma/client or @cms/shared-types',
        },
        {
          selector: "Literal[value='ADMIN']",
          message: 'Use UserRole.ADMIN from @prisma/client or @cms/shared-types',
        },
        {
          selector: "Literal[value='OWNER']",
          message: 'Use UserRole.OWNER from @prisma/client or @cms/shared-types',
        },
        {
          selector: "Literal[value='SCHEDULED']",
          message: 'Use AppointmentStatus.SCHEDULED from @prisma/client or @cms/shared-types',
        },
        {
          selector: "Literal[value='IN_PROGRESS']",
          message: 'Use AppointmentStatus.IN_PROGRESS',
        },
        {
          selector: "Literal[value='COMPLETED']",
          message: 'Use AppointmentStatus.COMPLETED',
        },
        {
          selector: "Literal[value='CANCELLED']",
          message: 'Use AppointmentStatus.CANCELLED',
        },
        {
          selector: "Literal[value='NO_SHOW']",
          message: 'Use AppointmentStatus.NO_SHOW',
        },
      ],
    },
  },
);