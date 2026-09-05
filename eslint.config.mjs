import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // A server action's signature is fixed by useActionState even when the
      // action ignores prevState or the form data, so an underscore prefix marks
      // a parameter that only exists to keep that shape.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The CommonJS aggregator behind the first standalone build of the panitia
    // dashboard. It is superseded by generate.mjs, which stays linted; this one
    // is kept only so that build is reproducible, and is never part of the app.
    "docs/konsumsi-panitia/parse.js",
  ]),
]);

export default eslintConfig;
