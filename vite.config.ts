import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port fixe (1420, pour tourner à côté du NIXUS d'origine qui utilise 1420) : Tauri charge cette adresse en mode dev.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022" },
});
