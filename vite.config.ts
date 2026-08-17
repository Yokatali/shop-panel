import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
  },
  envPrefix: ["VITE_", "TAURI_"],
  // Bağımlılık taraması açık kalmalı: echarts-for-react'in CommonJS bağımlılıkları
  // (fast-deep-equal gibi) ancak ön paketlemeyle ESM'e çevrilir, aksi halde
  // geliştirme sunucusu boş ekran verir.
  optimizeDeps: {
    include: ["react", "react-dom", "echarts/core", "echarts-for-react/lib/core", "lucide-react", "motion/react"],
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
});
