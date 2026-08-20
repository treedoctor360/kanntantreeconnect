import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages（https://<user>.github.io/kanntantreeconnect/）で動かすため base を固定する
export default defineConfig({
  base: '/kanntantreeconnect/',
  plugins: [react()],
});
