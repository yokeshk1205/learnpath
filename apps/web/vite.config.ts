import { loadEnvironment, projectRoot } from "../../config/environment.mjs";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

loadEnvironment();
const proxy = {
  "/api": {
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ""),
    target: process.env.VITE_API_PROXY_TARGET ?? `http://127.0.0.1:${process.env.API_PORT ?? "4000"}`,
  },
  "/ml": {
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/ml/, ""),
    target: process.env.VITE_ML_PROXY_TARGET ?? `http://127.0.0.1:${process.env.ML_PORT ?? "8000"}`,
  },
};

export default defineConfig({
  envDir: projectRoot,
  plugins: [react(), tailwindcss()],
  preview: { proxy },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WEB_PORT ?? "5173"),
    proxy,
    strictPort: true,
  },
});
