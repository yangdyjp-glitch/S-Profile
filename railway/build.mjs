import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { build } from "vite";

await build({
  configFile: false,
  root: resolve("railway"),
  publicDir: resolve("public"),
  plugins: [react()],
  build: { outDir: resolve("dist/railway/client"), emptyOutDir: true },
});
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
