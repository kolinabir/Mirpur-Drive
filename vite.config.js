import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Target modern browsers — avoids unnecessary polyfills.
    target: 'es2020',

    rollupOptions: {
      output: {
        // Split Three.js into its own chunk so app code changes don't
        // invalidate the (large) Three.js bundle in the browser cache.
        manualChunks: {
          three: ['three'],
          earcut: ['earcut'],
        },
      },
    },
  },
});
