import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port fixe : Tauri charge http://localhost:1420 en mode dev.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022" },
});
