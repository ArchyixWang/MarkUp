import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const testSetupFile = fileURLToPath(new URL('./src/test/setup.ts', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      testTimeout: 30000,
      environmentOptions: {
        jsdom: {
          url: 'http://localhost:8000/',
        },
      },
      setupFiles: testSetupFile,
      globals: true,
    },
  };
});
