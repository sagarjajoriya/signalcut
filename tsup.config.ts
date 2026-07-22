import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Keep the runtime lean: ship our code, resolve deps from node_modules.
  bundle: true,
  splitting: false,
  dts: false,
  // Preserve the shebang so the published bin is directly executable.
  banner: {
    js: "#!/usr/bin/env node",
  },
});
