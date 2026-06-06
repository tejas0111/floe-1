import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 3000),
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 4173),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@mysten/dapp-kit": path.resolve(__dirname, "../tatum/node_modules/@mysten/dapp-kit"),
    },
  },
});
