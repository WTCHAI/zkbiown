import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import tanstackRouterPlugin from '@tanstack/router-plugin/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouterPlugin({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      autoCodeSplitting: true,
    }),
    react(),
    tsconfigPaths(),
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      // Enable polyfills for specific globals and modules
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'pino': path.resolve(__dirname, './src/lib/pino-shim.js'),
    },
  },
  define: {
    // Disable pino logging in browser (used by @aztec/bb.js)
    'process.env.PINO_LOG_LEVEL': JSON.stringify('silent'),
  },
  optimizeDeps: {
    exclude: [
      '@noir-lang/noir_js',
      '@noir-lang/backend_barretenberg',
      '@aztec/bb.js',
      'onnxruntime-web'
    ],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'noir': ['@noir-lang/noir_js', '@noir-lang/backend_barretenberg'],
          'face-api': ['face-api.js'],
        },
      },
    },
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
  server: {
    port: 5501,
    headers: {
      // IMPORTANT: SharedArrayBuffer requires COOP/COEP headers for Noir ZK proofs
      // Using 'same-origin-allow-popups' to allow wallet popups while enabling SharedArrayBuffer
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
