import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@skewb-ultimate/puzzle-core": resolve(__dirname, "../../packages/puzzle-core/src/index.ts"),
      "@skewb-ultimate/solvers": resolve(__dirname, "../../packages/solvers/src/index.ts"),
    },
  },
});
