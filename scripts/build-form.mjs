import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { getFormVersion } from "./form-versions.mjs";

const requestedVersion = process.argv[2];

if (!requestedVersion) {
  throw new Error("Usage: node scripts/build-form.mjs <academic-year>");
}

const formVersion = getFormVersion(requestedVersion);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const distDirectory = resolve(projectRoot, "dist");
const viteOutput = resolve(distDirectory, "index.html");
const finalOutput = resolve(projectRoot, formVersion.output);

if (!finalOutput.startsWith(`${distDirectory}${sep}`)) {
  throw new Error(`Refusing to write a generated form outside dist: ${finalOutput}`);
}

mkdirSync(distDirectory, { recursive: true });
rmSync(viteOutput, { force: true });

const viteBin = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);
const build = spawnSync(process.execPath, [viteBin, "build"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    ADMISSION_FORM_VERSION: formVersion.id,
  },
  stdio: "inherit",
});

if (build.error) {
  throw build.error;
}

if (build.status !== 0) {
  process.exitCode = build.status ?? 1;
} else {
  if (!existsSync(viteOutput)) {
    throw new Error(`Vite did not produce the expected file: ${viteOutput}`);
  }

  rmSync(finalOutput, { force: true });
  renameSync(viteOutput, finalOutput);
  console.log(`Built ${formVersion.id}: ${formVersion.output}`);
}

