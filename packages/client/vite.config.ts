import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Listen on all interfaces so a phone on the same network can load the dev
    // build directly — the fastest way to test the real UI without an APK.
    host: true,
  },
});
