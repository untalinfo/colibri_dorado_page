/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { configDefaults } from 'vitest/config';
import { seoPlugin } from './build/seo.js';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), seoPlugin(env.VITE_SITE_URL)],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      css: true,
      // Deno shells are untested wiring; core modules run in node via `// @vitest-environment node`.
      exclude: [...configDefaults.exclude, 'supabase/functions/*/index.js'],
    },
  };
});
