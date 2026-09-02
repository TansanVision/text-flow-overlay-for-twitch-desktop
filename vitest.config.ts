import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    pool: 'threads',
    maxWorkers: 1,
    // Each suite must get its own Tauri mocks, including cached React components.
    isolate: true,
    environment: 'jsdom',
    css: { include: [/\.css\?raw$/] },
    include: ['src/presentation/**/*.test.tsx'],
  },
});
