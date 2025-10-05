import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      // So builds don't fail; we'll fix these in code incrementally
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "prefer-const": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "no-restricted-syntax": [
        "warn",
        {
          selector: "Literal[value='DOCTOR']",
          message: "Use UserRole.DOCTOR from @cms/shared-types",
        },
        {
          selector: "Literal[value='ADMIN']",
          message: "Use UserRole.ADMIN from @cms/shared-types",
        },
        {
          selector: "Literal[value='OWNER']",
          message: "Use UserRole.OWNER from @cms/shared-types",
        },
        {
          selector: "Literal[value='SCHEDULED']",
          message: "Use AppointmentStatus.SCHEDULED from @cms/shared-types",
        },
        {
          selector: "Literal[value='IN_PROGRESS']",
          message: "Use AppointmentStatus.IN_PROGRESS from @cms/shared-types",
        },
        {
          selector: "Literal[value='COMPLETED']",
          message: "Use AppointmentStatus.COMPLETED from @cms/shared-types",
        },
        {
          selector: "Literal[value='CANCELLED']",
          message: "Use AppointmentStatus.CANCELLED from @cms/shared-types",
        },
        {
          selector: "Literal[value='NO_SHOW']",
          message: "Use AppointmentStatus.NO_SHOW from @cms/shared-types",
        }
      ]
    },
  },
];

export default eslintConfig;
