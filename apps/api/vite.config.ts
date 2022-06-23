/// <reference types="vitest" />

import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  // @ts-ignore
  test: {
    globals: true,
    // environment: "jsdom",
    // setupFiles: "./src/utils/setup.ts",
  },
});
