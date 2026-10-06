import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

function withoutTypescriptPlugin(configs) {
  return configs.map((config) => {
    if (config.plugins === undefined) {
      return config;
    }
    const { plugins, ...rest } = config;
    return rest;
  });
}

export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "next-env.d.ts", "out/**", "build/**"],
  },
  ...nextCoreWebVitals,
  ...withoutTypescriptPlugin(tseslint.configs.strictTypeChecked),
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: false },
      ],
    },
  },
);
