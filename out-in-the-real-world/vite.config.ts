/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works under any sub-path (GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  // Full-game simulations are slow on a busy CI machine; allow them time.
  test: { testTimeout: 60_000 },
});
