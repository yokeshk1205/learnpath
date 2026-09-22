import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const proxy = {
  "/api": {
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ""),
    target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:4000",
  },
  "/ml": {
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/ml/, ""),
    target: process.env.VITE_ML_PROXY_TARGET ?? "http://localhost:8000",
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: { proxy },
  server: {
    port: 5173,
    proxy,
  },
});
