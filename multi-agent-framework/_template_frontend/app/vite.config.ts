import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

const RECORDS_API_TARGET = process.env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:3100"

// https://vite.dev/config/
export default defineConfig({
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
    proxy: {
      "/api": { target: RECORDS_API_TARGET, changeOrigin: true },
      "/health": { target: RECORDS_API_TARGET, changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      "db": path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
