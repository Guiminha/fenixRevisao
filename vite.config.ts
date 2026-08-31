import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import 'dotenv/config';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      // Obs.: frontend NÃO usa process.env (defines com ponto não são
      // substituídos de forma confiável no dev). O host do admin é detectado
      // pelo hostname (ver src/App.tsx); o servidor valida por env.
      'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL || ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY || ''),
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          // Vendor chunks: libs pesadas em chunks separados (cache + download paralelo).
          // hls.js só entra no bundle de quem os usa (views já code-split via lazy).
          // jspdf NÃO vai em manual chunk: fica no chunk dinâmico do pdfGenerator
          // (importado só na exportação de PDF do admin) e não pesa o 1º acesso.
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-motion': ['motion', 'motion-dom'],
            'vendor-icons': ['lucide-react'],
            'vendor-state': ['zustand'],
            'vendor-video': ['hls.js'],
          },
        },
      },
    },
server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Block sensitive files/directories from being served by the dev server
      // (data/, dev-tools/, uploads/, env files and database backups).
      fs: {
        deny: [
          'data/**',
          'dev-tools/**',
          'uploads/**',
          'dist/**',
          'backups-site/**',
          '.env',
          '.env.*',
          '**/*.log',
          'dev-server.bat',
          '**/db.json',
          '**/*.db',
          '**/*.sqlite',
          'package.json',
          'package-lock.json',
          'bun.lock',
          'tsconfig.json',
          'vite.config.ts',
          'server.ts',
          'metadata.json',
        ],
      },
    },
  };
});
