import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@db": path.resolve(__dirname, "./db"),
      "@api": path.resolve(__dirname, "./api"),
      "@contracts": path.resolve(
        __dirname,
        "./contracts",
      ),
      "@assets": path.resolve(
        __dirname,
        "./attached_assets",
      ),
    },
  },

  server: {
    host: true,

    port: 5173,

    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});