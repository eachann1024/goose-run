import { defineConfig, mergeConfig } from "vite";
import baseConfig from "./vite.config";

export default mergeConfig(baseConfig, {
  base: "./",
  build: {
    outDir: "dist-utools",
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        chunkFileNames: "chunks/[name].js",
        entryFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
    rolldownOptions: {
      external: [],
    },
    chunkSizeWarningLimit: 1000,
    reportCompressedSize: false,
  },
});
