import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works under any sub-path (GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
});
