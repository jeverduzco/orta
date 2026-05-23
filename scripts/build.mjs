import { build } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const isWatch = process.argv.includes('--watch');
const watch = isWatch ? {} : null;

const shared = {
  root: rootDir,
  configFile: false,
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2022',
  },
};

// 1. HTML pages (popup + options). Shared chunks fine here.
await build({
  ...shared,
  build: {
    ...shared.build,
    emptyOutDir: true,
    watch,
    rollupOptions: {
      input: {
        options: resolve(rootDir, 'options.html'),
        popup: resolve(rootDir, 'popup.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});

// 2. Content script: single-file IIFE (Manifest V3 content_scripts cannot use ES modules).
await build({
  ...shared,
  build: {
    ...shared.build,
    emptyOutDir: false,
    watch,
    lib: {
      entry: resolve(rootDir, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'OrtaContent',
      fileName: () => 'content.js',
    },
  },
});

// 3. Background service worker: single-file ESM (manifest declares "type": "module").
await build({
  ...shared,
  build: {
    ...shared.build,
    emptyOutDir: false,
    watch,
    lib: {
      entry: resolve(rootDir, 'src/background/index.ts'),
      formats: ['es'],
      fileName: () => 'background.js',
    },
  },
});

// 4. Copy static assets from `public/` if vite didn't (lib mode skips publicDir).
import { cp } from 'node:fs/promises';
await cp(resolve(rootDir, 'public'), resolve(rootDir, 'dist'), { recursive: true });
