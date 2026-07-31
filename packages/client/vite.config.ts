import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Listen on all interfaces so a phone on the same network can load the dev
    // build directly — the fastest way to test the real UI without an APK.
    host: true,
    // Fail rather than drift to 5174. A device is pointed at a port typed by
    // hand from a runbook, and a silent fallback turns that into a bare
    // connection refused with nothing on screen to explain it.
    strictPort: true,
  },
});
