import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

import { getFormVersion } from "./scripts/form-versions.mjs";

const projectRoot = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig(() => {
  const formVersion = getFormVersion(
    process.env.ADMISSION_FORM_VERSION ?? "2025-2026",
  );

  return {
    base: "./",
    plugins: [viteSingleFile({ removeViteModuleLoader: true })],
    resolve: {
      alias: {
        "@active-form": resolve(projectRoot, formVersion.definition),
      },
    },
    define: {
      __FORM_VERSION__: JSON.stringify(formVersion.id),
    },
    build: {
      target: "es2020",
      outDir: "dist",
      emptyOutDir: false,
      cssCodeSplit: false,
      assetsInlineLimit: 100000000,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  };
});

