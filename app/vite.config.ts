import path from "path";
const __dirname = import.meta.dirname;
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import devServer from "@hono/vite-dev-server";

export default defineConfig({
  plugins: [
    react(),
    devServer({
      entry: "./api/boot.ts",
      // Only let Hono handle /api/* requests; all frontend routes and assets are handled by Vite
      exclude: [/^(?!\/api(\/|$)).*/],
    }),
  ],
  server: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      db: path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
