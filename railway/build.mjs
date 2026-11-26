import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import react from "@vitejs/plugin-react";
import { build } from "vite";

await build({
  configFile: false,
  root: resolve("railway"),
  publicDir: resolve("public"),
  plugins: [react()],
  build: { outDir: resolve("dist/railway/client"), emptyOutDir: true },
});
const assets = resolve("dist/railway/client/assets");
for (const name of await readdir(assets)) {
  if (!/\.(?:js|css)$/.test(name)) continue;
  const path = join(assets, name);
  const bytes = await readFile(path);
  await Promise.all([
    writeFile(path + ".br", brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })),
    writeFile(path + ".gz", gzipSync(bytes)),
  ]);
}
await build({
  configFile: false,
  publicDir: false,
  ssr: { noExternal: ["ssf"] },
  build: {
    ssr: resolve("lib/profile/api.ts"),
    target: "node24",
    outDir: resolve("dist/railway/server"),
    emptyOutDir: true,
    rolldownOptions: { output: { entryFileNames: "api.mjs" } },
  },
});
