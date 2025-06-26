import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    json: "src/json.ts",
    drizzle: "src/drizzle.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});