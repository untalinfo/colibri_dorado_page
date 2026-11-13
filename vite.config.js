/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    // Deno shells are untested wiring; core modules run in node via `// @vitest-environment node`.
    exclude: [...configDefaults.exclude, 'supabase/functions/*/index.js'],
  },
});
