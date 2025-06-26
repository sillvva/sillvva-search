import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    json: "src/json.ts",
    drizzle: "src/drizzle.ts",
  },
  format: ["cjs","esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});