import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages（https://<user>.github.io/major-wood-decay-fungi/）で動かすため base を固定する
export default defineConfig({
  base: '/major-wood-decay-fungi/',
  plugins: [react()],
});
