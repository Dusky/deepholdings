import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.deepholdings.terminal',
  appName: 'Deep Holdings',
  webDir: 'dist',
  android: {
    // The screen is never pure black and the desk is darker still; matching the
    // background stops a white flash between splash and first paint.
    backgroundColor: '#14110D',
  },
  server: {
    // Default scheme; the API's CORS allowlist includes https://localhost to match.
    androidScheme: 'https',
  },
};

export default config;
