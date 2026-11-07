import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5184,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${Number(process.env.BOOKING_API_PORT ?? 4319)}` },
    watch: { ignored: ["**/.booking-data/**"] },
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem,sqlite,db}", "**/*.sqlite-*", "**/*.db-*", "**/.git/**", "**/.booking-data/**", "**/server/**"],
    },
  },
});
