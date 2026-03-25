import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  noExternal: (id) => id.startsWith("@t3tools/"),
  banner: {
    js: "#!/usr/bin/env node\n",
  },
});
