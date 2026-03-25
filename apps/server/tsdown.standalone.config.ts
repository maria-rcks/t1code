import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  checks: {
    legacyCjs: false,
  },
  outDir: "dist-standalone",
  sourcemap: true,
  clean: true,
  // Keep the native PTY dependency external, but bundle the rest of the
  // server runtime so the packaged TUI does not depend on a matching install
  // layout for JS-only server dependencies.
  noExternal: (id) => !id.startsWith("node:") && id !== "node-pty",
  inlineOnly: false,
  banner: {
    js: "#!/usr/bin/env node\n",
  },
});
