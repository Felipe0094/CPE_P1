import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/CPE_P1/' : '/',
  plugins: [react()],
  assetsInclude: ['**/*.tsv'],
})
